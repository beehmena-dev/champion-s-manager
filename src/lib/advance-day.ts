import { supabase } from "@/integrations/supabase/client";
import { simulateMatch, simulateQuick } from "@/game/simulation";
import { applyPositionProgress } from "@/game/development";
import { formationSlots } from "@/game/tactics";
import type { MatchResult } from "@/game/types";
import { checkAndRolloverSeason } from "./season-rollover";
import { buildInjuryPatch, rollRelapse } from "@/game/medical";
import { progressCup } from "./cup-progression";
import { refreshTransferOffers } from "./transfer-offers";
import { advanceScouting } from "./scouting";
import { applyTraining, resolveWeeklyFocus, countRestDays, REST_DAY_REGEN_BONUS } from "@/game/training";
import { conditionRegenPerDay, trainingSpeedMultiplier } from "@/game/staff";
import { simulateAITransferActivity, generateTransferRumor } from "./ai-transfers";
import { refreshJobOffers } from "./job-offers";
import { refreshTransferRequests } from "./transfer-requests";
import { processLoanReturns } from "./loans";
import { isRivalry, matchMoraleDelta } from "@/game/rivalries";
import { checkReleaseClauses } from "./release-clauses";
import { pushInbox, type InboxDraft } from "./inbox";
import { evaluateMatchGoal, MATCH_GOAL_FORM_DELTA, matchGoalLabel, type PlayerMatchGoal } from "@/game/match-goals";
import { bestMentorFor, mentoringSpeedMultiplier, isMenteeCandidate, type MentorLike } from "@/game/mentoring";
import { trainingMultiplierForTier } from "@/game/squad-tiers";

const formatBRL = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `R$ ${(n / 1_000_000).toFixed(1)}M`
  : Math.abs(n) >= 1_000 ? `R$ ${(n / 1_000).toFixed(0)}k`
  : `R$ ${Math.round(n)}`;
import { sponsorIncome, gateIncome, facilityFactor, fanTemperamentFromClubId, membershipIncome } from "@/game/board";
import { pickAiMatchTactics } from "@/game/ai-tactics";
import { adjustMarketValue, applyFormMarketMomentum } from "@/game/valuation";

// Avança um dia: simula todas as partidas cuja data == current_date.
// Estratégia: para eficiência, para partidas que não envolvem o clube do usuário,
// usamos simulateQuick (baseado no overall médio do elenco). Para as do usuário,
// usamos simulateMatch completo com narrativa.

export interface AdvanceResult {
  daysAdvanced: number;
  matchesPlayed: number;
  userMatch: {
    matchId: string;
    result: MatchResult;
    home: { id: string; name: string; crest_url?: string | null; primary_color?: string | null; secondary_color?: string | null };
    away: { id: string; name: string; crest_url?: string | null; primary_color?: string | null; secondary_color?: string | null };
  } | null;
  seasonRolledOver?: boolean;
  newSeason?: number;
  retirements?: string[];
  youthPromoted?: number;
  potentialSwings?: { name: string; kind: "breakout" | "bust"; from: number; to: number }[];
  fired?: boolean;
  firedFromClub?: string;
  seasonAwards?: { kind: "top_scorer" | "player_of_season"; playerName: string; value: number }[];
  trainingInjuries?: { name: string; days: number }[];
  releaseClauseTriggers?: { playerName: string; clubName: string; fee: number }[];
}

// -----------------------------------------------------------------------------
// advanceDays(saveId, n) — versão em lote, otimizada.
// Faz ~5 queries no total (independente de n), simula tudo em memória e escreve
// em paralelo. Substitui o loop sequencial anterior, que era o gargalo.
// -----------------------------------------------------------------------------
export async function advanceDays(
  saveId: string, n: number,
  opts: { precomputedUserMatch?: { matchId: string; result: MatchResult } } = {},
): Promise<AdvanceResult> {
  if (n <= 0) return { daysAdvanced: 0, matchesPlayed: 0, userMatch: null };

  const { data: save, error: sErr } = await supabase
    .from("saves").select("id, game_date, my_club_id").eq("id", saveId).single();
  if (sErr || !save) throw sErr ?? new Error("Save não encontrado");

  const startDate = save.game_date as string;
  const myClubId = (save.my_club_id as string | null) ?? null;

  const startD = new Date(startDate + "T00:00:00Z");
  const endD = new Date(startD);
  endD.setUTCDate(endD.getUTCDate() + n);
  const endISO = endD.toISOString().split("T")[0];

  // 1) Todas as partidas do intervalo
  const { data: matchesRaw, error: mErr } = await supabase
    .from("matches")
    .select("id, home_club_id, away_club_id, match_date, competition_id")
    .eq("save_id", saveId)
    .eq("played", false)
    .gte("match_date", startDate)
    .lt("match_date", endISO)
    .order("match_date", { ascending: true });
  if (mErr) throw mErr;
  const matches = matchesRaw ?? [];

  // VAR (Lei 6) — só liga em partida de copa (mata-mata), pedido explícito
  // do user. Um Set de ids de competição tipo "cup" desse save inteiro
  // (não só da janela) é barato e evita uma query por partida.
  const { data: cupComps } = await supabase.from("competitions").select("id").eq("save_id", saveId).eq("type", "cup");
  const cupCompIds = new Set((cupComps ?? []).map((c) => c.id));

  // 2) Clubes envolvidos (com colunas táticas)
  const clubIds = Array.from(new Set(matches.flatMap((m) => [m.home_club_id, m.away_club_id])));
  const clubMap = new Map<string, any>();
  // Clubes de ligas de segundo plano — o motor NÃO carrega os jogadores
  // deles: as partidas usam clubs.strength e a evolução fica pra virada de
  // temporada (rollover_background_players, 100% no servidor). Ver
  // supabase/migrations/20260911120000_playable_leagues.sql.
  const backgroundClubIds = new Set<string>();
  if (clubIds.length > 0) {
    const { data: clubs } = await supabase
      .from("clubs")
      .select("id, name, short_name, crest_url, primary_color, secondary_color, morale, reputation, formation, mentality, pressing, defensive_line, tempo, passing_style, stadium_capacity, training_focus, weekly_training, strength, competition_id, penalty_taker_id, free_kick_taker_id, corner_taker_id, captain_id, player_match_goals")
      .in("id", clubIds) as any;
    for (const c of clubs ?? []) clubMap.set(c.id, c);

    const compIds = Array.from(new Set((clubs ?? []).map((c: any) => c.competition_id).filter(Boolean))) as string[];
    if (compIds.length > 0) {
      const { data: comps } = await supabase
        .from("competitions").select("id, playable").in("id", compIds);
      const bgComp = new Set((comps ?? []).filter((c) => c.playable === false).map((c) => c.id));
      for (const c of clubs ?? []) {
        // o clube do usuário nunca é "segundo plano", aconteça o que acontecer
        if (c.id !== myClubId && c.competition_id && bgComp.has(c.competition_id)) backgroundClubIds.add(c.id);
      }
    }
  }

  // Competições de segundo plano do save inteiro — usado no bloco de folha
  // salarial (mais abaixo), que varre todos os clubes do save, não só os da
  // janela. Clube de segundo plano não movimenta caixa: o mercado da IA usa
  // transfer_budget, não budget, e ninguém audita a bilheteria deles.
  const bgCompIdsSave = new Set<string>();
  {
    const { data: bgComps } = await supabase
      .from("competitions").select("id").eq("save_id", saveId).eq("playable", false);
    for (const c of bgComps ?? []) bgCompIdsSave.add(c.id);
  }

  // 3) Overalls de TODOS os jogadores desses clubes em UMA query
  //    → usados tanto para simulateQuick (média) quanto para o elenco do usuário.
  const ratingMap = new Map<string, number>();
  const rosters = new Map<string, any[]>();
  if (clubIds.length > 0) {
    // Elencos completos só p/ clubes envolvidos em partida do usuário
    const userClubs = new Set<string>();
    for (const m of matches) {
      if (myClubId && (m.home_club_id === myClubId || m.away_club_id === myClubId)) {
        userClubs.add(m.home_club_id);
        userClubs.add(m.away_club_id);
      }
    }

    // Jogadores só dos clubes que NÃO são de segundo plano (ou que jogam
    // contra o usuário). Um jogo entre dois clubes de segundo plano não
    // carrega nenhuma linha de players — usa clubs.strength direto.
    const loadClubIds = clubIds.filter((id) => !backgroundClubIds.has(id) || userClubs.has(id));
    const { data: allPlayers } = loadClubIds.length > 0
      ? await supabase.from("players").select("*").in("club_id", loadClubIds)
      : { data: [] as any[] };

    const sums = new Map<string, { s: number; n: number }>();
    for (const p of allPlayers ?? []) {
      if (!p.club_id) continue;
      const cur = sums.get(p.club_id) ?? { s: 0, n: 0 };
      cur.s += p.overall; cur.n += 1;
      sums.set(p.club_id, cur);
      if (userClubs.has(p.club_id)) {
        const list = rosters.get(p.club_id) ?? [];
        list.push(p);
        rosters.set(p.club_id, list);
      }
    }
    for (const [id, { s, n }] of sums) ratingMap.set(id, n > 0 ? s / n : 50);
    // Clubes de segundo plano: força vem do cache clubs.strength.
    for (const id of clubIds) {
      if (ratingMap.has(id)) continue;
      const c = clubMap.get(id);
      ratingMap.set(id, c?.strength ?? c?.reputation ?? 50);
    }

    // 3c) Treino dos clubes de IA envolvidos nesta janela — antes só o clube
    // do usuário evoluía atributo por atributo dia a dia (applyTrainingAndRecovery
    // abaixo); o resto da liga inteira só recebia o solavanco grosseiro de fim de
    // temporada em src/lib/season-rollover.ts, criando uma assimetria que só
    // crescia a cada temporada. Reaproveita o allPlayers/clubMap já buscados
    // acima em vez de mais uma query.
    // Clube de segundo plano fica de fora do treino atributo-a-atributo — a
    // evolução dele acontece de uma vez na virada de temporada, no servidor.
    const aiClubIds = clubIds.filter((id) => id !== myClubId && !backgroundClubIds.has(id));
    if (aiClubIds.length > 0) {
      const { data: aiStaff } = await supabase
        .from("staff").select("club_id, role, skill").in("club_id", aiClubIds).in("role", ["coach", "fitness_coach"]);
      const coachSkillByClub = new Map<string, number>();
      const fitnessSkillByClub = new Map<string, number>();
      for (const s of aiStaff ?? []) {
        if (!s.club_id) continue;
        if (s.role === "coach") coachSkillByClub.set(s.club_id, s.skill);
        if (s.role === "fitness_coach") fitnessSkillByClub.set(s.club_id, s.skill);
      }
      // Quantas partidas cada clube de IA joga nesta janela — usado pro
      // desgaste de condição abaixo (não dá pra saber titular x banco sem
      // escalação salva pra IA, então é um desgaste único por elenco/partida).
      const matchesPlayedByClub = new Map<string, number>();
      for (const m of matches) {
        matchesPlayedByClub.set(m.home_club_id, (matchesPlayedByClub.get(m.home_club_id) ?? 0) + 1);
        matchesPlayedByClub.set(m.away_club_id, (matchesPlayedByClub.get(m.away_club_id) ?? 0) + 1);
      }
      const playersByClub = new Map<string, any[]>();
      for (const p of allPlayers ?? []) {
        if (!p.club_id || p.club_id === myClubId) continue;
        const list = playersByClub.get(p.club_id) ?? [];
        list.push(p);
        playersByClub.set(p.club_id, list);
      }
      const aiPlayerUpdates: any[] = [];
      for (const clubId of aiClubIds) {
        const clubPlayers = playersByClub.get(clubId);
        if (!clubPlayers || clubPlayers.length === 0) continue;
        const focus = (clubMap.get(clubId)?.training_focus as any) ?? "balanced";
        const weekly = (clubMap.get(clubId)?.weekly_training as any) ?? null;
        const coachSkill = coachSkillByClub.get(clubId) ?? 0;
        const patches = applyTraining(
          clubPlayers as any,
          (dateISO) => resolveWeeklyFocus(weekly, focus, dateISO),
          startDate, n, trainingSpeedMultiplier(coachSkill),
          undefined,
          (p) => {
            const mentorMul = isMenteeCandidate((p as any).age ?? 24)
              ? mentoringSpeedMultiplier(bestMentorFor(p.id, clubPlayers as MentorLike[]))
              : 1;
            return mentorMul * trainingMultiplierForTier((p as any).squad_tier);
          },
        );
        const patchById = new Map(patches.map((p) => [p.id, p]));

        // Condição — antes travada em 100 pra sempre pra qualquer clube de
        // IA (só regride pra usuário), dando um bônus de fôlego permanente
        // (condMul = 1.0 sempre) pra todo adversário — ver src/game/tactics.ts.
        const restDays = countRestDays(weekly, focus, startDate, n);
        const regen = conditionRegenPerDay(fitnessSkillByClub.get(clubId) ?? 0) * n + restDays * REST_DAY_REGEN_BONUS;
        const drain = (matchesPlayedByClub.get(clubId) ?? 0) * 18;
        const conditionDelta = regen - drain;

        for (const p of clubPlayers) {
          const patch = patchById.get(p.id);
          const row: any = {};
          if (conditionDelta !== 0) row.condition = clamp01_100((p.condition ?? 100) + conditionDelta);
          if (patch) {
            const deltaKeys = Object.keys(patch.attrDeltas);
            if (deltaKeys.length > 0) {
              const attrs: any = p.attributes ?? {};
              const nextAttrs = { ...attrs };
              for (const [attr, delta] of Object.entries(patch.attrDeltas)) nextAttrs[attr] = (attrs[attr] ?? 10) + (delta as number);
              row.attributes = nextAttrs;
            }
            if (patch.overallDelta) {
              row.overall = Math.min(99, p.overall + patch.overallDelta);
              row.market_value = adjustMarketValue(p.market_value, row.overall - p.overall);
            }
            // Antes só o treino do usuário aplicava a lesão calculada por
            // applyTraining — pra IA o risco era sorteado (RNG rodava do
            // mesmo jeito) mas o resultado nunca era gravado, então clube de
            // IA nunca se machucava treinando, só em partida.
            if (patch.injury) {
              Object.assign(row, buildInjuryPatch(p as any, endISO, patch.injury.type, patch.injury.days));
            }
          }
          if (Object.keys(row).length > 0) aiPlayerUpdates.push(supabase.from("players").update(row).eq("id", p.id));
        }
      }
      const CHUNK = 20;
      for (let i = 0; i < aiPlayerUpdates.length; i += CHUNK) {
        const results = await Promise.all(aiPlayerUpdates.slice(i, i + CHUNK));
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      }
    }
  }

  // 3b) Escalação salva do clube do usuário (tactic_lineups)
  let myLineup: { player_id: string; slot: string; role: string | null; instructions?: unknown }[] = [];
  if (myClubId) {
    const { data: tl } = await supabase
      .from("tactic_lineups")
      .select("*")
      .eq("club_id", myClubId);
    // "instructions" ainda não está nos tipos gerados do Supabase (migration
    // ad-hoc, mesmo padrão de tactic_presets/penalty_taker_id) — select("*")
    // evita o SelectQueryError de coluna desconhecida, `as any` cobre o resto.
    myLineup = (tl ?? []) as any;
  }

  // 4) Simular em memória
  const matchUpdates: { id: string; home_score: number; away_score: number; events: any }[] = [];
  const financeEntries: any[] = [];
  let userMatch: AdvanceResult["userMatch"] = null;
  // Ajustes pós-partida no clube do usuário
  const formDelta = new Map<string, number>();     // playerId → delta
  const condDelta = new Map<string, number>();     // playerId → delta
  let moraleDelta = 0;                              // clube do usuário
  const aiMoraleDelta = new Map<string, number>();  // clubId → delta (todo mundo que não é o usuário, dos dois lados de toda partida)
  const positionProgressUpdates: import("@/game/development").PositionProgressUpdate[] = [];
  const yellowDelta = new Map<string, number>();    // playerId → cartões amarelos ganhos nesta partida
  const suspensionDelta = new Map<string, number>();// playerId → partidas de suspensão ganhas (vermelho)
  const injuryUpdates = new Map<string, ReturnType<typeof buildInjuryPatch>>(); // playerId → patch completo de lesão
  const relapseChecked = new Set<string>(); // evita checar recaída 2x pro mesmo jogador no mesmo advanceDays
  const suspensionsServed = new Set<string>();      // playerId → clube jogou uma partida (serve 1 jogo de suspensão)
  const goalsSeasonDelta = new Map<string, number>();      // playerId → gols nesta partida (pro prêmio de artilheiro — ver src/lib/season-rollover.ts)
  const appearancesSeasonDelta = new Map<string, number>();// playerId → +1 se foi titular nesta partida
  const benchStreak = new Map<string, number>();            // playerId → jogos seguidos no banco (valor absoluto, não delta — ver src/game/unrest.ts)
  const clubBudgetDelta = new Map<string, number>(); // clubId → delta de caixa (bilheteria de todo mundo + folha/patrocínio no bloco 6)

  for (const m of matches) {
    const isUser = !!myClubId && (m.home_club_id === myClubId || m.away_club_id === myClubId);
    const homeClub = clubMap.get(m.home_club_id);
    const awayClub = clubMap.get(m.away_club_id);
    // Clubes de IA escolhem tática por partida (favorito ousa mais, azarão se
    // fecha) em vez de manter a mesma postura fixa do seed a temporada inteira
    // — o clube do usuário fica de fora, ele já define a própria tática.
    const homeIsAi = homeClub && homeClub.id !== myClubId;
    const awayIsAi = awayClub && awayClub.id !== myClubId;
    const homeSim = homeIsAi
      ? { ...homeClub, ...pickAiMatchTactics({ clubReputation: homeClub.reputation ?? 50, opponentReputation: awayClub?.reputation ?? 50, isHome: true }) }
      : homeClub;
    const awaySim = awayIsAi
      ? { ...awayClub, ...pickAiMatchTactics({ clubReputation: awayClub.reputation ?? 50, opponentReputation: homeClub?.reputation ?? 50, isHome: false }) }
      : awayClub;
    const isPrecomputed = opts.precomputedUserMatch?.matchId === m.id;
    const isDerby = !!(homeClub?.name && awayClub?.name && isRivalry(homeClub.name, awayClub.name));

    // Bilheteria — o mandante de TODA partida arrecada, seja o usuário ou a
    // IA (antes só entrava se o usuário fosse mandante, e mesmo assim só
    // virava um lançamento no extrato sem de fato entrar no caixa — ver
    // bloco 6 abaixo, onde clubBudgetDelta é aplicado de uma vez).
    if (homeClub && !backgroundClubIds.has(m.home_club_id)) {
      const { attendance, amount } = gateIncome(
        homeClub.stadium_capacity ?? 20_000, homeClub.reputation ?? 50, isDerby,
        Math.random, fanTemperamentFromClubId(m.home_club_id),
      );
      clubBudgetDelta.set(m.home_club_id, (clubBudgetDelta.get(m.home_club_id) ?? 0) + amount);
      if (m.home_club_id === myClubId) {
        financeEntries.push({
          save_id: saveId, club_id: myClubId, entry_date: m.match_date,
          kind: "gate",
          amount,
          description: `Bilheteria vs ${awayClub?.name ?? ""} (${attendance.toLocaleString("pt-BR")} torcedores)`,
        });
      }
    }

    if (isUser) {
      // Checagem de recaída: jogador recém-recuperado (dentro da janela de
      // risco) escalado nesta partida tem uma chance extra de se machucar de
      // novo — se acontecer, ele já entra como indisponível pro sorteio do XI.
      // Pulada se a partida já foi jogada interativamente (o intervalo em
      // src/lib/live-match.ts já fez e persistiu essa checagem antes do 1º tempo).
      const myRosterArr = rosters.get(myClubId!) ?? [];
      if (!isPrecomputed) {
        for (const l of myLineup) {
          if (relapseChecked.has(l.player_id)) continue;
          relapseChecked.add(l.player_id);
          const p = myRosterArr.find((x) => x.id === l.player_id);
          if (!p) continue;
          const relapse = rollRelapse(p, m.match_date, Math.random);
          if (relapse) {
            const patch = buildInjuryPatch(p, m.match_date, relapse.type, relapse.days, true);
            injuryUpdates.set(p.id, patch);
            p.injured_until = patch.injured_until;
            p.injury_type = patch.injury_type;
            p.injury_risk_until = patch.injury_risk_until;
          }
        }
      }

      // Se o usuário já jogou essa partida interativamente (intervalo com
      // trocas — ver src/lib/live-match.ts), reaproveita o resultado final
      // em vez de simular tudo de novo do zero.
      const result = isPrecomputed
        ? opts.precomputedUserMatch!.result
        : simulateMatch(
          homeSim ?? { id: m.home_club_id, name: "Time" },
          awaySim ?? { id: m.away_club_id, name: "Time" },
          rosters.get(m.home_club_id) ?? [],
          rosters.get(m.away_club_id) ?? [],
          {
            seed: m.id,
            homeLineup: m.home_club_id === myClubId ? myLineup : undefined,
            awayLineup: m.away_club_id === myClubId ? myLineup : undefined,
            todayISO: m.match_date,
            hasVar: !!m.competition_id && cupCompIds.has(m.competition_id),
          },
        );
      matchUpdates.push({ id: m.id, home_score: result.homeScore, away_score: result.awayScore, events: result.events });

      // Override "só pra próxima partida" (ver tactics.tsx, escopo de salvar,
      // e applyPendingOverride em src/lib/live-match.ts) — a partida dele já
      // aconteceu, some sozinho e a tática permanente volta a valer.
      // Update incondicional (idempotente, sem SELECT antes): não custa nada
      // limpar um campo que já era NULL.
      if (myClubId) {
        await supabase.from("clubs").update({ pending_override: null } as any).eq("id", myClubId);
      }
      userMatch = {
        matchId: m.id,
        result,
        home: { id: m.home_club_id, name: homeClub?.name ?? "", crest_url: homeClub?.crest_url, primary_color: homeClub?.primary_color, secondary_color: homeClub?.secondary_color },
        away: { id: m.away_club_id, name: awayClub?.name ?? "", crest_url: awayClub?.crest_url, primary_color: awayClub?.primary_color, secondary_color: awayClub?.secondary_color },
      };
      // Form/condition/morale
      const userIsHome = m.home_club_id === myClubId;
      const myRoster = rosters.get(myClubId!) ?? [];
      for (const p of myRoster) suspensionsServed.add(p.id); // clube jogou → conta 1 jogo de suspensão cumprido
      const starterIds = new Set<string>((result.ratings ?? []).map((r) => r.playerId));
      // Filtra ratings apenas do meu clube (o simulateMatch registra ratings do XI de ambos os lados)
      const myPlayerIds = new Set(myRoster.map((p) => p.id));
      for (const p of myRoster) {
        if (starterIds.has(p.id) && myPlayerIds.has(p.id)) {
          const r = (result.ratings ?? []).find((x) => x.playerId === p.id);
          const goals = r?.goals ?? 0;
          const won = userIsHome ? result.homeScore > result.awayScore : result.awayScore > result.homeScore;
          const lost = userIsHome ? result.homeScore < result.awayScore : result.awayScore < result.homeScore;
          const f = (won ? +3 : lost ? -3 : 0) + goals * 4;
          formDelta.set(p.id, (formDelta.get(p.id) ?? 0) + f);
          // Desgaste escala com a tática escolhida (pressão/ritmo altos
          // cansam mais) — antes o corte de condição era fixo em -25 pra
          // qualquer configuração tática, deixando coefs.fatigue calculado
          // em src/game/tactics.ts sem nenhum consumidor.
          const fatigue = userIsHome ? result.homeFatigue : result.awayFatigue;
          const fatigueRatio = Math.max(0.5, Math.min(2, (fatigue ?? 0.05) / 0.05));
          condDelta.set(p.id, (condDelta.get(p.id) ?? 0) - Math.round(25 * fatigueRatio));
          if (goals > 0) goalsSeasonDelta.set(p.id, (goalsSeasonDelta.get(p.id) ?? 0) + goals);
          appearancesSeasonDelta.set(p.id, (appearancesSeasonDelta.get(p.id) ?? 0) + 1);
          benchStreak.set(p.id, 0); // titularizou — cláusula de titularidade garantida cumprida nesta partida
        } else {
          condDelta.set(p.id, (condDelta.get(p.id) ?? 0) + 15);
          benchStreak.set(p.id, (benchStreak.get(p.id) ?? p.bench_streak ?? 0) + 1);
        }
      }
      const gd = userIsHome ? (result.homeScore - result.awayScore) : (result.awayScore - result.homeScore);
      moraleDelta += matchMoraleDelta(gd, isDerby);
      const opponentClubId = userIsHome ? m.away_club_id : m.home_club_id;
      aiMoraleDelta.set(opponentClubId, (aiMoraleDelta.get(opponentClubId) ?? 0) + matchMoraleDelta(-gd, isDerby));

      // Metas individuais por partida (item 06 do backlog FootSim) — mesmo
      // padrão "só a próxima partida" do pending_override: avalia contra o
      // resultado REAL desta partida, aplica bônus/penalidade na FORMA do
      // jogador (reaproveita formDelta, já vai ser gravado embaixo — sem
      // escrita nova), avisa no inbox, e some sozinho (nunca fica pendurado
      // pra próxima partida por engano).
      const myGoals = (clubMap.get(myClubId!)?.player_match_goals as PlayerMatchGoal[] | undefined) ?? [];
      if (myGoals.length > 0) {
        const outcomes = myGoals.map((g) =>
          evaluateMatchGoal(g, { isHome: userIsHome, homeScore: result.homeScore, awayScore: result.awayScore, ratings: result.ratings, cards: result.cards }),
        );
        for (const o of outcomes) {
          const delta = o.achieved ? MATCH_GOAL_FORM_DELTA.met : MATCH_GOAL_FORM_DELTA.missed;
          formDelta.set(o.playerId, (formDelta.get(o.playerId) ?? 0) + delta);
        }
        const lines = outcomes.map((o) => `${o.achieved ? "✅" : "❌"} ${o.playerName} — ${matchGoalLabel(o.kind, o.threshold)}: ${o.detail}.`);
        await pushInbox(saveId, myClubId!, m.match_date, {
          category: "result", sender: "Comissão técnica", subject: "Metas da partida",
          body: lines.join("\n"),
        });
        await supabase.from("clubs").update({ player_match_goals: [] } as any).eq("id", myClubId!);
      }

      // Evolução de familiaridade posicional: cada titular "pratica" a posição
      // em que foi escalado nesta partida (ver src/game/development.ts).
      // Usa result.homeLineup/awayLineup (o XI que o motor REALMENTE
      // escalou, já com a filtragem de disponibilidade) em vez do myLineup
      // salvo cru — senão um jogador auto-substituído por indisponibilidade
      // de outro titular (ver src/game/simulation.ts) nunca aparecia aqui,
      // já que não tinha linha na escalação salva original.
      const userClub = userIsHome ? homeClub : awayClub;
      const myActualLineup = userIsHome ? result.homeLineup : result.awayLineup;
      if (userClub?.formation && myActualLineup && myActualLineup.length > 0) {
        const slotCanonical = new Map(formationSlots(userClub.formation as any).map((s) => [s.slot, s.canonical]));
        const appearances = new Map<string, any>();
        for (const l of myActualLineup) {
          const canonical = slotCanonical.get(l.slot);
          if (canonical) appearances.set(l.playerId, canonical);
        }
        if (appearances.size > 0) {
          const progressUpdates = applyPositionProgress(myRoster as any, appearances);
          positionProgressUpdates.push(...progressUpdates);
        }
      }

      // O adversário (se for de IA) também desenvolve familiaridade
      // posicional, com a escalação que o próprio motor de simulação já
      // gerou pra ele (result.homeLineup/awayLineup) — antes só o clube do
      // usuário evoluía isso, deixando qualquer adversário de IA travado na
      // familiaridade do seed pra sempre. Baixo volume (no máximo 11
      // jogadores, só quando o usuário joga), então grava direto sem lote.
      const opponentClub = userIsHome ? awayClub : homeClub;
      const opponentLineup = userIsHome ? result.awayLineup : result.homeLineup;
      const opponentRoster = rosters.get(opponentClubId) ?? [];
      if (opponentClub && opponentClub.id !== myClubId && opponentClub.formation && opponentLineup && opponentLineup.length > 0 && opponentRoster.length > 0) {
        const oppSlotCanonical = new Map(formationSlots(opponentClub.formation as any).map((s) => [s.slot, s.canonical]));
        const oppAppearances = new Map<string, any>();
        for (const l of opponentLineup) {
          const canonical = oppSlotCanonical.get(l.slot);
          if (canonical) oppAppearances.set(l.playerId, canonical);
        }
        if (oppAppearances.size > 0) {
          const oppProgressUpdates = applyPositionProgress(opponentRoster as any, oppAppearances);
          await Promise.all(oppProgressUpdates.map((u) => {
            const patch: any = { position_progress: u.position_progress, secondary_positions: u.secondary_positions };
            if (u.natural_position) patch.natural_position = u.natural_position;
            return supabase.from("players").update(patch).eq("id", u.id);
          }));
        }
      }

      // Cartões e lesões — só processados pros jogadores do MEU clube
      // (a partida detalhada só existe pro lado do usuário).
      const myIds = new Set(myRoster.map((p) => p.id));
      for (const c of result.cards ?? []) {
        if (!myIds.has(c.playerId)) continue;
        if (c.type === "red") {
          suspensionDelta.set(c.playerId, (suspensionDelta.get(c.playerId) ?? 0) + 2);
        } else {
          yellowDelta.set(c.playerId, (yellowDelta.get(c.playerId) ?? 0) + 1);
        }
      }
      for (const inj of result.injuries ?? []) {
        if (!myIds.has(inj.playerId)) continue;
        const p = myRoster.find((x) => x.id === inj.playerId);
        injuryUpdates.set(inj.playerId, buildInjuryPatch(p ?? { injury_history: [] }, m.match_date, inj.type as any, inj.days));
      }
    } else {
      const hR = ratingMap.get(m.home_club_id) ?? 50;
      const aR = ratingMap.get(m.away_club_id) ?? 50;
      const q = simulateQuick(hR, aR, m.id, {
        homeMentality: homeSim?.mentality,
        awayMentality: awaySim?.mentality,
      });
      matchUpdates.push({ id: m.id, home_score: q.homeScore, away_score: q.awayScore, events: null });
      const gdAi = q.homeScore - q.awayScore;
      aiMoraleDelta.set(m.home_club_id, (aiMoraleDelta.get(m.home_club_id) ?? 0) + matchMoraleDelta(gdAi, isDerby));
      aiMoraleDelta.set(m.away_club_id, (aiMoraleDelta.get(m.away_club_id) ?? 0) + matchMoraleDelta(-gdAi, isDerby));
    }
  }

  // 5) Bulk write — Promise.all limitado (evita explodir conexões).
  const CHUNK = 20;
  for (let i = 0; i < matchUpdates.length; i += CHUNK) {
    const slice = matchUpdates.slice(i, i + CHUNK);
    const results = await Promise.all(slice.map((u) =>
      supabase.from("matches").update({
        home_score: u.home_score, away_score: u.away_score, played: true, events: u.events,
      }).eq("id", u.id),
    ));
    // Se uma partida não gravar "played:true" por erro, ela fica pra sempre
    // na fila de "não jogadas" e é re-simulada (com resultado diferente) no
    // próximo advanceDays() — resultado duplicado/inconsistente pro mesmo dia.
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }

  // 5b) Atualiza form/condition/progresso posicional/cartões/lesões dos jogadores do usuário
  const hasCardOrInjuryUpdates = yellowDelta.size > 0 || suspensionDelta.size > 0 || injuryUpdates.size > 0 || suspensionsServed.size > 0;
  const hasSeasonStatsUpdates = goalsSeasonDelta.size > 0 || appearancesSeasonDelta.size > 0;
  if (myClubId && (formDelta.size > 0 || condDelta.size > 0 || positionProgressUpdates.length > 0 || hasCardOrInjuryUpdates || hasSeasonStatsUpdates)) {
    const myRoster = rosters.get(myClubId) ?? [];
    const progressById = new Map(positionProgressUpdates.map((u) => [u.id, u]));
    const playerUpdates: any[] = [];
    for (const p of myRoster) {
      const nf = clamp01_100((p.form ?? 70) + (formDelta.get(p.id) ?? 0));
      const nc = clamp01_100((p.condition ?? 100) + (condDelta.get(p.id) ?? 0));
      const prog = progressById.get(p.id);
      const patch: any = {};
      if (nf !== p.form) {
        patch.form = nf;
        // Valorização por sequência de desempenho (backlog FootSim #07) — usa
        // o delta de forma REALMENTE aplicado (já pós-clamp), não o bruto,
        // senão um jogador já no teto/piso de forma continuaria "ganhando"
        // valor por um delta que na prática não mudou a forma dele em nada.
        patch.market_value = applyFormMarketMomentum(p.market_value, nf - (p.form ?? 70));
      }
      if (nc !== p.condition) patch.condition = nc;
      if (prog) {
        patch.position_progress = prog.position_progress;
        patch.secondary_positions = prog.secondary_positions;
        if (prog.natural_position) patch.natural_position = prog.natural_position;
      }

      // Suspensão: primeiro decrementa 1 (jogo cumprido), depois soma o que
      // ganhou nesta partida (vermelho direto ou 2º amarelo = +2 jogos).
      let suspended = p.suspended_matches ?? 0;
      if (suspensionsServed.has(p.id) && suspended > 0) suspended = Math.max(0, suspended - 1);
      suspended += suspensionDelta.get(p.id) ?? 0;
      if (suspended !== (p.suspended_matches ?? 0)) patch.suspended_matches = suspended;

      // Cartão amarelo: acumula na temporada; ao bater 3, gera 1 jogo de
      // suspensão e reseta a contagem (regra clássica do Brasileirão).
      const yGained = yellowDelta.get(p.id) ?? 0;
      if (yGained > 0) {
        let ySeason = (p.yellow_cards_season ?? 0) + yGained;
        let extraSuspension = 0;
        while (ySeason >= 3) { ySeason -= 3; extraSuspension += 1; }
        patch.yellow_cards_season = ySeason;
        if (extraSuspension > 0) patch.suspended_matches = (patch.suspended_matches ?? suspended) + extraSuspension;
      }

      // Lesão: se essa partida (ou uma recaída pré-partida) gerou uma nova
      // lesão, aplica o patch completo — tipo, data de volta, janela de risco
      // de recaída e histórico médico atualizado.
      const injuryPatch = injuryUpdates.get(p.id);
      if (injuryPatch) Object.assign(patch, injuryPatch);

      // Gols/presenças na temporada — alimenta os prêmios de fim de
      // temporada (artilheiro, craque do time) em src/lib/season-rollover.ts.
      // Os contadores de carreira (career_*) são os mesmos ganhos, só que
      // nunca zeram — ver ficha do jogador.
      const goalsGained = goalsSeasonDelta.get(p.id) ?? 0;
      if (goalsGained > 0) {
        patch.goals_season = (p.goals_season ?? 0) + goalsGained;
        patch.career_goals = (p.career_goals ?? 0) + goalsGained;
      }
      const appsGained = appearancesSeasonDelta.get(p.id) ?? 0;
      if (appsGained > 0) {
        patch.appearances_season = (p.appearances_season ?? 0) + appsGained;
        patch.career_appearances = (p.career_appearances ?? 0) + appsGained;
      }

      // Sequência de jogos no banco — alimenta a cláusula de titularidade
      // garantida (ver src/game/unrest.ts).
      const newBenchStreak = benchStreak.get(p.id);
      if (newBenchStreak != null && newBenchStreak !== (p.bench_streak ?? 0)) patch.bench_streak = newBenchStreak;

      if (Object.keys(patch).length > 0) {
        playerUpdates.push(supabase.from("players").update(patch).eq("id", p.id));
      }
    }
    for (let i = 0; i < playerUpdates.length; i += CHUNK) {
      const results = await Promise.all(playerUpdates.slice(i, i + CHUNK));
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    }
    if (moraleDelta !== 0) {
      const cur = clubMap.get(myClubId);
      const nm = Math.max(0, Math.min(100, Math.round((cur?.morale ?? 70) + moraleDelta)));
      const { error } = await supabase.from("clubs").update({ morale: nm }).eq("id", myClubId);
      if (error) throw error;
    }
  }

  // Moral dos clubes de IA (dos dois lados de toda partida, inclusive o
  // adversário do usuário) — antes ficava travado em 70 (neutro) o save
  // inteiro, já que só o clube do usuário recebia esse ajuste.
  if (aiMoraleDelta.size > 0) {
    const aiMoraleUpdates = Array.from(aiMoraleDelta.entries()).map(([clubId, delta]) => {
      const cur = clubMap.get(clubId);
      const nm = Math.max(0, Math.min(100, Math.round((cur?.morale ?? 70) + delta)));
      return supabase.from("clubs").update({ morale: nm }).eq("id", clubId);
    });
    for (let i = 0; i < aiMoraleUpdates.length; i += CHUNK) {
      const results = await Promise.all(aiMoraleUpdates.slice(i, i + CHUNK));
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    }
  }

  // 6) Folha salarial (dias 1 e 15) e repasse do patrocinador (dia 1) dentro do
  // intervalo — pra TODOS os clubes do save, não só o do usuário (antes os
  // ~140 clubes de IA nunca pagavam salário nem recebiam patrocínio, o caixa
  // deles ficava congelado pra sempre). Só o clube do usuário grava extrato
  // (finance_entries); os demais só têm o saldo (clubs.budget) ajustado.
  const paydays: string[] = [];
  const sponsorDays: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(startD);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().split("T")[0];
    if (iso.endsWith("-01") || iso.endsWith("-15")) paydays.push(iso);
    if (iso.endsWith("-01")) sponsorDays.push(iso);
  }
  if (paydays.length > 0 || sponsorDays.length > 0) {
    const [{ data: allClubsRaw }, { data: allPlayerWages }, { data: allStaffWages }] = await Promise.all([
      supabase.from("clubs").select("id, reputation, competition_id, stadium_capacity").eq("save_id", saveId),
      supabase.from("players").select("club_id, wage").eq("save_id", saveId),
      supabase.from("staff").select("club_id, wage").eq("save_id", saveId),
    ]);
    // Clube de segundo plano fica de fora da folha/patrocínio — caixa deles
    // não é usado por nada (ver bgCompIdsSave acima).
    const allClubs = (allClubsRaw ?? []).filter(
      (c) => c.id === myClubId || !c.competition_id || !bgCompIdsSave.has(c.competition_id),
    );
    const wageTotalByClub = new Map<string, number>();
    for (const p of allPlayerWages ?? []) {
      if (!p.club_id) continue;
      wageTotalByClub.set(p.club_id, (wageTotalByClub.get(p.club_id) ?? 0) + (p.wage ?? 0));
    }
    for (const s of allStaffWages ?? []) {
      if (!s.club_id) continue;
      wageTotalByClub.set(s.club_id, (wageTotalByClub.get(s.club_id) ?? 0) + (s.wage ?? 0));
    }
    for (const c of allClubs ?? []) {
      const wageTotal = wageTotalByClub.get(c.id) ?? 0;
      if (wageTotal > 0 && paydays.length > 0) {
        if (c.id === myClubId) {
          for (const iso of paydays) {
            financeEntries.push({
              save_id: saveId, club_id: myClubId, entry_date: iso,
              kind: "wages", amount: -wageTotal, description: "Folha salarial quinzenal",
            });
          }
        }
        clubBudgetDelta.set(c.id, (clubBudgetDelta.get(c.id) ?? 0) - wageTotal * paydays.length);
      }
      if (sponsorDays.length > 0) {
        const income = sponsorIncome(c.reputation ?? 50);
        if (c.id === myClubId) {
          for (const iso of sponsorDays) {
            financeEntries.push({
              save_id: saveId, club_id: myClubId, entry_date: iso,
              kind: "sponsor", amount: income, description: "Repasse mensal do patrocinador",
            });
          }
        }
        clubBudgetDelta.set(c.id, (clubBudgetDelta.get(c.id) ?? 0) + income * sponsorDays.length);

        // Sócio-torcedor (item 18 do backlog FootSim) — mensalidade recorrente
        // que não depende de jogo em casa, no mesmo dia 1 do patrocínio.
        const membership = membershipIncome(
          c.stadium_capacity ?? 20_000, c.reputation ?? 50, fanTemperamentFromClubId(c.id),
        );
        if (c.id === myClubId) {
          for (const iso of sponsorDays) {
            financeEntries.push({
              save_id: saveId, club_id: myClubId, entry_date: iso,
              kind: "membership", amount: membership, description: "Mensalidade de sócio-torcedor",
            });
          }
        }
        clubBudgetDelta.set(c.id, (clubBudgetDelta.get(c.id) ?? 0) + membership * sponsorDays.length);
      }
    }
  }

  // Aplica de uma vez o caixa de todo mundo — bilheteria (calculada partida a
  // partida acima) + folha/patrocínio (acima).
  if (clubBudgetDelta.size > 0) {
    const { data: curBudgets } = await supabase
      .from("clubs").select("id, budget").in("id", Array.from(clubBudgetDelta.keys()));
    const budgetUpdates = (curBudgets ?? [])
      .filter((c) => clubBudgetDelta.get(c.id))
      .map((c) => supabase.from("clubs").update({ budget: c.budget + (clubBudgetDelta.get(c.id) ?? 0) }).eq("id", c.id));
    const CHUNK_BUDGET = 20;
    for (let i = 0; i < budgetUpdates.length; i += CHUNK_BUDGET) {
      const results = await Promise.all(budgetUpdates.slice(i, i + CHUNK_BUDGET));
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    }
  }

  if (financeEntries.length > 0) {
    const { error } = await supabase.from("finance_entries").insert(financeEntries);
    if (error) throw error;
  }

  // O write mais crítico da função: se isso falhar em silêncio, o relógio do
  // jogo nunca avança mesmo com partidas já marcadas played/dinheiro já
  // movido — o próximo advanceDays() recomeça da mesma data e RE-cobra
  // folha/patrocínio/etc pro mesmo intervalo (partidas não duplicam porque
  // já ficaram played:true, mas os lançamentos financeiros duplicariam).
  const { error: gameDateError } = await supabase.from("saves").update({
    game_date: endISO, updated_at: new Date().toISOString(),
  }).eq("id", saveId);
  if (gameDateError) throw gameDateError;

  // Expira propostas vencidas e, com pequena chance, gera novas propostas de
  // clubes de IA por jogadores do usuário (ver src/lib/transfer-offers.ts).
  let trainingInjuries: { name: string; days: number }[] = [];
  let releaseClauseTriggers: { playerName: string; clubName: string; fee: number }[] = [];
  if (myClubId) {
    // As duas chamadas abaixo agora lançam se uma escrita falhar (antes
    // falhavam em silêncio) — não podem travar o resto do avanço de dia
    // (treino, cláusulas, empréstimos, mercado de IA, calendário etc.),
    // mesmo padrão não-propagante já usado pra checkReleaseClauses/
    // simulateAITransferActivity/processLoanReturns/refreshJobOffers.
    try {
      await refreshTransferOffers(saveId, myClubId, endISO);
    } catch (e) {
      console.error("refreshTransferOffers falhou", e);
    }
    try {
      await refreshTransferRequests(saveId, myClubId, endISO, n);
    } catch (e) {
      console.error("refreshTransferRequests falhou", e);
    }
    await advanceScouting(myClubId, n);
    trainingInjuries = await applyTrainingAndRecovery(myClubId, n, startDate);
    releaseClauseTriggers = await checkReleaseClauses(saveId, myClubId, endISO, n);
  }

  // Devolve automaticamente jogadores emprestados cujo prazo venceu (ver
  // src/lib/loans.ts) — roda pro save inteiro, não só pro clube do usuário.
  // Não propaga erro: se uma devolução específica falhar (agora que a
  // escrita lança em vez de falhar em silêncio), as demais são
  // naturalmente re-tentadas no próximo advanceDays() (a query busca por
  // "vencidos", não marca nada como já tentado), mas não pode travar o
  // resto do avanço de dia no meio do caminho.
  try {
    await processLoanReturns(saveId, endISO);
  } catch (e) {
    console.error("processLoanReturns falhou", e);
  }

  // Clubes de IA negociam entre si em segundo plano (ver src/lib/ai-transfers.ts).
  // Roda dentro do lote de advanceDays() sem o usuário estar envolvido —
  // se essa negociação específica falhar (agora que a escrita lança em vez
  // de falhar em silêncio), não pode travar o resto do avanço de dia
  // (calendário, folha, sondagens etc.), mesmo padrão de checkReleaseClauses.
  try {
    await simulateAITransferActivity(saveId, myClubId, endISO);
  } catch (e) {
    console.error("simulateAITransferActivity falhou", e);
  }

  // Rumor de mercado sobre jogador do usuário (item 19 do backlog FootSim) —
  // especulação sem negociação real por trás, ver generateTransferRumor em
  // src/lib/ai-transfers.ts. Mesmo padrão não-propagante das chamadas acima.
  try {
    await generateTransferRumor(saveId, myClubId, endISO);
  } catch (e) {
    console.error("generateTransferRumor falhou", e);
  }

  // Avança o chaveamento da copa (se existir): resolve confrontos cujas
  // partidas já rolaram e gera a próxima fase automaticamente. Não propaga
  // erro: uma falha aqui não pode travar season rollover/o resto do avanço,
  // e a query de confrontos "não resolvidos" torna isso auto-recuperável no
  // próximo advanceDays().
  try {
    await progressCup(saveId);
  } catch (e) {
    console.error("progressCup falhou", e);
  }

  // Verifica se a(s) competição(ões) do save terminaram a temporada — se sim,
  // fecha (histórico + envelhecimento + contratos) e gera a próxima.
  const rollover = await checkAndRolloverSeason(saveId);

  // Sondagem de outro clube (ver src/lib/job-offers.ts) — pulada se o
  // usuário acabou de ser demitido nesta mesma virada de temporada.
  if (myClubId && !rollover.fired) {
    try {
      await refreshJobOffers(saveId, myClubId, endISO, n);
    } catch (e) {
      console.error("refreshJobOffers falhou", e);
    }
  }

  // --- Caixa de entrada -----------------------------------------------------
  // Gera as mensagens do período a partir do que já foi apurado acima.
  // Nunca propaga erro: a caixa de entrada é acessório (ver src/lib/inbox.ts).
  if (myClubId) {
    try {
      const drafts: InboxDraft[] = [];
      const marketLink = `/saves/${saveId}/market`;

      for (const inj of trainingInjuries) {
        drafts.push({
          category: "medical", sender: "Departamento Médico",
          subject: `${inj.name} lesionado no treino`,
          body: `${inj.name} sofreu uma lesão durante os treinamentos e deve ficar cerca de ${inj.days} dias fora. Acompanhe a recuperação na Central Médica.`,
          link: `/saves/${saveId}/medical`, linkLabel: "Central Médica",
        });
      }
      for (const t of releaseClauseTriggers) {
        drafts.push({
          category: "transfer", sender: "Diretoria",
          subject: `${t.clubName} pagou a cláusula de ${t.playerName}`,
          body: `O ${t.clubName} acionou a cláusula de rescisão de ${t.playerName} (${formatBRL(t.fee)}). O jogador já deixou o clube — não houve margem para negociar.`,
        });
      }

      if (userMatch) {
        const myIsHome = userMatch.home.id === myClubId;
        const myScore = myIsHome ? userMatch.result.homeScore : userMatch.result.awayScore;
        const oppScore = myIsHome ? userMatch.result.awayScore : userMatch.result.homeScore;
        const oppName = myIsHome ? userMatch.away.name : userMatch.home.name;
        const verdict = myScore > oppScore ? "Vitória" : myScore < oppScore ? "Derrota" : "Empate";
        drafts.push({
          category: "result", sender: "Imprensa",
          subject: `${verdict}: ${userMatch.home.name} ${userMatch.result.homeScore} × ${userMatch.result.awayScore} ${userMatch.away.name}`,
          body: `${verdict} ${myScore}–${oppScore} contra o ${oppName}. Confira a classificação atualizada.`,
          link: `/saves/${saveId}/table`, linkLabel: "Classificação",
        });
      }

      if (rollover.rolledOver) {
        if (rollover.objectiveOutcome) {
          const o = rollover.objectiveOutcome;
          drafts.push({
            category: "board", sender: "Presidente",
            subject: o.status === "met" ? "Objetivo da temporada cumprido" : "Objetivo da temporada não cumprido",
            body: o.status === "met"
              ? `Parabéns pela temporada. Terminamos em ${o.finalPosition}º e a diretoria está satisfeita com o trabalho (confiança ${o.confidenceDelta >= 0 ? "+" : ""}${o.confidenceDelta}).${o.sponsorBonus > 0 ? ` O patrocinador liberou um bônus de ${formatBRL(o.sponsorBonus)} pelo desempenho.` : ""}`
              : `Terminamos a temporada em ${o.finalPosition}º, abaixo do que a diretoria esperava. A confiança no seu trabalho caiu (${o.confidenceDelta}). Precisamos de resultados melhores.`,
            link: `/saves/${saveId}/board`, linkLabel: "Diretoria",
          });
        }
        if (rollover.promotion) {
          drafts.push({
            category: "board", sender: "Presidente",
            subject: `Acesso conquistado — bem-vindo à ${rollover.promotion.competitionName}`,
            body: `O clube garantiu o acesso e disputará a ${rollover.promotion.competitionName} na próxima temporada. A diretoria vai rever o orçamento e o objetivo para o novo patamar.`,
            link: `/saves/${saveId}/table`, linkLabel: "Classificação",
          });
        }
        if (rollover.relegation) {
          drafts.push({
            category: "board", sender: "Presidente",
            subject: `Rebaixamento para a ${rollover.relegation.competitionName}`,
            body: `A temporada terminou com o rebaixamento para a ${rollover.relegation.competitionName}. É hora de reconstruir o elenco e planejar a volta.`,
            link: `/saves/${saveId}/squad`, linkLabel: "Elenco",
          });
        }
        for (const a of rollover.seasonAwards ?? []) {
          drafts.push({
            category: "press", sender: "Imprensa",
            subject: a.kind === "top_scorer"
              ? `${a.playerName} foi o artilheiro da temporada`
              : `${a.playerName} foi eleito o craque da temporada`,
            body: a.kind === "top_scorer"
              ? `${a.playerName} encerrou a temporada como maior goleador do elenco, com ${a.value} gols.`
              : `${a.playerName} foi escolhido o melhor jogador do elenco na temporada (overall ${a.value}).`,
          });
        }
        if (rollover.youthPromoted && rollover.youthPromoted > 0) {
          drafts.push({
            category: "youth", sender: "Categoria de Base",
            subject: `${rollover.youthPromoted} jogador${rollover.youthPromoted > 1 ? "es" : ""} promovido${rollover.youthPromoted > 1 ? "s" : ""} da base`,
            body: `A base entregou ${rollover.youthPromoted} atleta${rollover.youthPromoted > 1 ? "s" : ""} ao elenco principal para a nova temporada. Avalie na Central da base.`,
            link: `/saves/${saveId}/academy`, linkLabel: "Central da base",
          });
        }
        if (rollover.retirements && rollover.retirements.length > 0) {
          drafts.push({
            category: "general", sender: "Imprensa",
            subject: `${rollover.retirements.length === 1 ? "Aposentadoria" : "Aposentadorias"} no elenco`,
            body: `${rollover.retirements.join(", ")} pendura${rollover.retirements.length > 1 ? "ram" : "-"} as chuteiras e não seguem para a próxima temporada.`,
          });
        }
        // Potencial imprevisível (item 17 do backlog FootSim) — só os casos
        // notáveis (cauda rara do passeio aleatório, ver driftPotential em
        // src/game/potential.ts), um por jogador, não todo ajuste pequeno.
        for (const s of rollover.potentialSwings ?? []) {
          drafts.push({
            category: "press", sender: "Imprensa",
            subject: s.kind === "breakout" ? `${s.name} surpreende na pré-temporada` : `${s.name} decepciona na pré-temporada`,
            body: s.kind === "breakout"
              ? `${s.name} vem impressionando o departamento técnico — o potencial dele subiu de ${s.from} para ${s.to}. Vale acompanhar de perto.`
              : `${s.name} não vem convencendo o departamento técnico — o potencial dele caiu de ${s.from} para ${s.to}. Pode valer a pena reavaliar o papel dele no elenco.`,
          });
        }
        if (rollover.fired) {
          drafts.push({
            category: "board", sender: "Presidente",
            subject: "Você foi demitido",
            body: `A diretoria do ${rollover.firedFromClub ?? "clube"} decidiu encerrar o seu ciclo. Obrigado pelo trabalho — mas os resultados não corresponderam.`,
          });
        }
      }

      // Propostas recebidas por jogadores meus, ainda pendentes — avisa uma vez
      // por proposta (marca via subject único não dá; usa dedupe simples abaixo).
      const { data: incoming } = await supabase
        .from("transfer_offers")
        .select("id, current_fee, players(name), buyer:clubs!transfer_offers_buyer_club_id_fkey(name)")
        .eq("save_id", saveId).eq("seller_club_id", myClubId).eq("status", "pending");
      for (const o of incoming ?? []) {
        const already = await supabase
          .from("inbox_messages").select("id", { count: "exact", head: true })
          .eq("save_id", saveId).eq("category", "transfer")
          .eq("subject", `Proposta por ${(o as any).players?.name ?? "jogador"}`);
        if ((already.count ?? 0) > 0) continue;
        drafts.push({
          category: "transfer", sender: (o as any).buyer?.name ?? "Outro clube",
          subject: `Proposta por ${(o as any).players?.name ?? "jogador"}`,
          body: `O ${(o as any).buyer?.name ?? "clube"} ofereceu ${formatBRL((o as any).current_fee)} por ${(o as any).players?.name ?? "seu jogador"}. Responda no Mercado antes que a proposta expire.`,
          link: marketLink, linkLabel: "Mercado",
        });
      }

      await pushInbox(saveId, myClubId, endISO, drafts);
    } catch (e) {
      console.error("geração da caixa de entrada falhou", e);
    }
  }

  return {
    daysAdvanced: n,
    matchesPlayed: matchUpdates.length,
    userMatch,
    seasonRolledOver: rollover.rolledOver,
    newSeason: rollover.newSeason,
    retirements: rollover.retirements,
    youthPromoted: rollover.youthPromoted,
    potentialSwings: rollover.potentialSwings,
    fired: rollover.fired,
    firedFromClub: rollover.firedFromClub,
    seasonAwards: rollover.seasonAwards,
    trainingInjuries,
    releaseClauseTriggers,
  };
}

function clamp01_100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

// -----------------------------------------------------------------------------
// Treino + recuperação de condição do elenco do usuário — roda todo dia
// avançado, com ou sem partida (é diferente do ajuste de form/condition do
// bloco 5b, que só mexe em quem jogou naquele dia específico).
// -----------------------------------------------------------------------------
async function applyTrainingAndRecovery(myClubId: string, days: number, todayISO: string): Promise<{ name: string; days: number }[]> {
  const [{ data: club }, { data: staff }, { data: roster }] = await Promise.all([
    supabase.from("clubs").select("training_focus, weekly_training, training_facilities").eq("id", myClubId).single() as any,
    supabase.from("staff").select("role, skill").eq("club_id", myClubId),
    supabase.from("players").select(
      "id, name, age, position, condition, attributes, overall, market_value, individual_training_focus, injured_until, injury_history, squad_tier",
    ).eq("club_id", myClubId),
  ]);
  if (!roster || roster.length === 0) return [];

  const coachSkill = staff?.find((s) => s.role === "coach")?.skill ?? 0;
  const fitnessSkill = staff?.find((s) => s.role === "fitness_coach")?.skill ?? 0;
  const focus = (club?.training_focus as any) ?? "balanced";
  const weekly = (club?.weekly_training as any) ?? null;
  // CT modernizado acelera treino e recuperação (ver catálogo em src/game/board.ts).
  const ctFactor = facilityFactor((club as any)?.training_facilities ?? 3);

  const patches = applyTraining(
    roster as any,
    (dateISO) => resolveWeeklyFocus(weekly, focus, dateISO),
    todayISO, days, trainingSpeedMultiplier(coachSkill) * ctFactor,
    undefined,
    (p) => {
      const mentorMul = isMenteeCandidate((p as any).age ?? 24)
        ? mentoringSpeedMultiplier(bestMentorFor(p.id, roster as unknown as MentorLike[]))
        : 1;
      return mentorMul * trainingMultiplierForTier((p as any).squad_tier);
    },
  );
  const patchById = new Map(patches.map((p) => [p.id, p]));
  const restDays = countRestDays(weekly, focus, todayISO, days);
  const regen = conditionRegenPerDay(fitnessSkill) * ctFactor * days + restDays * REST_DAY_REGEN_BONUS;

  const trainingInjuries: { name: string; days: number }[] = [];
  const updates = roster.map((p) => {
    const patch = patchById.get(p.id);
    const row: any = { condition: clamp01_100((p.condition ?? 100) + regen) };
    if (patch) {
      const attrs: any = p.attributes ?? {};
      const deltaKeys = Object.keys(patch.attrDeltas);
      if (deltaKeys.length > 0) {
        const nextAttrs = { ...attrs };
        for (const [attr, delta] of Object.entries(patch.attrDeltas)) nextAttrs[attr] = (attrs[attr] ?? 10) + (delta as number);
        row.attributes = nextAttrs;
      }
      if (patch.overallDelta) {
        row.overall = Math.min(99, p.overall + patch.overallDelta);
        row.market_value = adjustMarketValue(p.market_value, row.overall - p.overall);
      }
      if (patch.injury) {
        Object.assign(row, buildInjuryPatch(p as any, todayISO, patch.injury.type, patch.injury.days));
        trainingInjuries.push({ name: p.name, days: patch.injury.days });
      }
    }
    return supabase.from("players").update(row).eq("id", p.id);
  });
  const CHUNK = 20;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const results = await Promise.all(updates.slice(i, i + CHUNK));
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }
  return trainingInjuries;
}

export const advanceOneDay = (saveId: string) => advanceDays(saveId, 1);