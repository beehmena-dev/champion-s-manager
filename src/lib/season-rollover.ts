import { supabase } from "@/integrations/supabase/client";
import { computeStandings, type StandingRow } from "@/game/standings";
import { promotionSlots } from "@/game/promotion";
import { generateScheduleForSave } from "./generate-schedule";
import { confidenceDelta, managerReputationDelta, clubReputationDelta, transferBudgetInjection, sponsorObjectiveBonus } from "@/game/board";
import { ensureSeasonObjective } from "./board";
import { rollRetirement } from "@/game/retirement";
import { generateYouthIntake } from "./youth";
import { assignAIStaff } from "./staff";
import { adjustMarketValue } from "@/game/valuation";
import { attributesOverall, TECHNICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, type AttributeKey, type PlayerAttributes } from "@/game/attributes";
import { developmentTrend, driftPotential } from "@/game/potential";

// Quantos dias de "férias" entre o fim de uma temporada e o início da próxima.
const OFF_SEASON_DAYS = 30;

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

// -----------------------------------------------------------------------------
// checkAndRolloverSeason — chamado depois de cada advanceDays(). Verifica se
// TODAS as competições do save já jogaram todas as partidas da temporada
// atual; se sim, fecha a temporada (grava histórico, envelhece jogadores,
// libera contratos vencidos, zera forma/condição) e gera o calendário da
// temporada seguinte.
// -----------------------------------------------------------------------------
export interface RolloverResult {
  rolledOver: boolean;
  newSeason?: number;
  retirements?: string[];
  youthPromoted?: number;
  // Potencial imprevisível (item 17 do backlog FootSim) — só os casos
  // notáveis (cauda rara de driftPotential, não todo ajuste pequeno) do
  // elenco do USUÁRIO, mesmo padrão de escopo de `retirements`.
  potentialSwings?: { name: string; kind: "breakout" | "bust"; from: number; to: number }[];
  fired?: boolean;
  firedFromClub?: string;
  seasonAwards?: { kind: "top_scorer" | "player_of_season"; playerName: string; value: number }[];
  objectiveOutcome?: { status: "met" | "missed"; finalPosition: number; confidenceDelta: number; sponsorBonus: number };
  // Preenchido só quando o CLUBE DO USUÁRIO muda de divisão.
  promotion?: { competitionName: string };
  relegation?: { competitionName: string };
}

export async function checkAndRolloverSeason(saveId: string): Promise<RolloverResult> {
  const { data: comps, error: cErr } = await supabase
    .from("competitions")
    .select("id, name, season, type, playable, tier, country")
    .eq("save_id", saveId);
  if (cErr) throw cErr;
  if (!comps || comps.length === 0) return { rolledOver: false };
  const backgroundCompIds = new Set(comps.filter((c) => c.playable === false).map((c) => c.id));

  // Para cada competição, checa se sobra alguma partida não jogada na temporada atual.
  for (const comp of comps) {
    const { count } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("competition_id", comp.id)
      .eq("season", comp.season)
      .eq("played", false);
    if ((count ?? 0) > 0) return { rolledOver: false }; // ainda tem jogo pra rolar
  }

  // Todas as competições terminaram a temporada — vira.
  const { data: save } = await supabase.from("saves").select("game_date, my_club_id, fired_from_club_ids, manager_reputation").eq("id", saveId).single();
  const lastDate = save?.game_date as string;
  const myClubId = (save?.my_club_id as string | null) ?? null;

  let fired = false;
  let firedFromClub: string | undefined;
  let firedFromClubId: string | undefined;
  let objectiveOutcome: RolloverResult["objectiveOutcome"];
  let managerRep = save?.manager_reputation ?? 50;
  const seasonAwards: { kind: "top_scorer" | "player_of_season"; playerName: string; value: number }[] = [];
  const playableClubIds: string[] = []; // clubes de ligas jogáveis — recebem a virada detalhada
  const standingsByComp = new Map<string, StandingRow[]>(); // p/ acesso/rebaixamento

  for (const comp of comps) {
    const [{ data: clubs }, { data: matches }] = await Promise.all([
      supabase.from("clubs").select("id, name, reputation, transfer_budget").eq("competition_id", comp.id),
      supabase.from("matches")
        .select("home_club_id, away_club_id, home_score, away_score, played")
        .eq("competition_id", comp.id).eq("season", comp.season),
    ]);
    const standings = computeStandings(clubs ?? [], matches ?? []);
    standingsByComp.set(comp.id, standings);
    const historyRows = standings.map((r, i) => ({
      save_id: saveId,
      competition_id: comp.id,
      club_id: r.club_id,
      season: comp.season,
      position: i + 1,
      played: r.played, wins: r.wins, draws: r.draws, losses: r.losses,
      gf: r.gf, ga: r.ga, points: r.points,
    }));
    if (historyRows.length > 0) {
      const { error } = await supabase.from("season_history").insert(historyRows);
      if (error) throw error;
    }

    // Reputação do clube deriva pela posição final na tabela — campeão sobe,
    // lanterna desce. Vale pra todo mundo, não só o clube do usuário (ver
    // src/game/board.ts::clubReputationDelta). Aproveita o mesmo update pra
    // já injetar o aporte de verba de transferência de fim de temporada
    // (transferBudgetInjection) — sem isso a verba de todo clube de IA só
    // encolhe ou troca de mãos entre eles (ver src/lib/ai-transfers.ts).
    const clubById = new Map((clubs ?? []).map((c) => [c.id, c]));
    const clubUpdates = standings
      .map((r, i) => {
        const club = clubById.get(r.club_id);
        if (!club) return null;
        const patch: any = {};
        const repDelta = clubReputationDelta(i + 1, standings.length);
        const nextRep = Math.max(0, Math.min(100, (club.reputation ?? 50) + repDelta));
        if (repDelta !== 0) patch.reputation = nextRep;
        const injection = transferBudgetInjection(club.reputation ?? 50);
        if (injection > 0) patch.transfer_budget = (club.transfer_budget ?? 0) + injection;
        if (Object.keys(patch).length === 0) return null;
        return supabase.from("clubs").update(patch).eq("id", r.club_id);
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    for (let i = 0; i < clubUpdates.length; i += 25) {
      const results = await Promise.all(clubUpdates.slice(i, i + 25));
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    }

    // Avalia o objetivo da diretoria pro clube do usuário nessa competição
    // (se ele jogou nela) e ajusta a confiança antes de virar a temporada.
    if (myClubId) {
      const myPosition = standings.findIndex((r) => r.club_id === myClubId);
      if (myPosition >= 0) {
        await ensureSeasonObjective(saveId, myClubId, comp.id, comp.season);
        const { data: obj } = await supabase
          .from("season_objectives").select("*")
          .eq("club_id", myClubId).eq("competition_id", comp.id).eq("season", comp.season).single();
        if (obj && obj.status === "in_progress") {
          const finalPosition = myPosition + 1;
          const objTyped = { kind: obj.kind as any, target: obj.target };
          const delta = confidenceDelta(objTyped, finalPosition);
          const status = delta >= 0 ? "met" : "missed";
          const { error: objError } = await supabase.from("season_objectives").update({ status, final_position: finalPosition }).eq("id", obj.id);
          if (objError) throw objError;
          const { data: club } = await supabase.from("clubs").select("name, board_confidence, budget, reputation").eq("id", myClubId).single();
          // Bônus de patrocínio por desempenho (item 13 do backlog FootSim) —
          // só paga quando a meta é batida, reaproveitando a mesma avaliação.
          const sponsorBonus = club ? sponsorObjectiveBonus(club.reputation ?? 50, objTyped, finalPosition) : 0;
          objectiveOutcome = { status, finalPosition, confidenceDelta: delta, sponsorBonus };
          if (club) {
            const next = Math.max(0, Math.min(100, club.board_confidence + delta));
            const clubPatch: any = { board_confidence: next };
            if (sponsorBonus > 0) clubPatch.budget = (club.budget ?? 0) + sponsorBonus;
            const { error: confError } = await supabase.from("clubs").update(clubPatch).eq("id", myClubId);
            if (confError) throw confError;
            if (sponsorBonus > 0) {
              const { error: financeError } = await supabase.from("finance_entries").insert({
                save_id: saveId, club_id: myClubId, entry_date: lastDate, kind: "sponsor",
                amount: sponsorBonus, description: `Bônus de patrocínio — meta da temporada cumprida`,
              });
              if (financeError) throw financeError;
            }
            if (next <= 0 && !fired) {
              fired = true;
              firedFromClub = club.name;
              firedFromClubId = myClubId;
            }
          }

          // Reputação pessoal do técnico — acompanha a carreira inteira,
          // independente do clube atual (ver src/game/board.ts).
          const repDelta = managerReputationDelta(finalPosition, obj.target, finalPosition === 1);
          managerRep = Math.max(0, Math.min(100, managerRep + repDelta));
          const { error: repError } = await supabase.from("saves").update({ manager_reputation: managerRep }).eq("id", saveId);
          if (repError) throw repError;
        }

        // Prêmios de fim de temporada do elenco do usuário — artilheiro e
        // craque da temporada. Só cobre o próprio elenco: partidas de
        // outros clubes usam simulação rápida sem detalhe de quem marcou
        // (ver goals_season/appearances_season acumulados em advance-day.ts).
        const { data: myRosterStats } = await supabase
          .from("players").select("id, name, overall, goals_season, appearances_season")
          .eq("club_id", myClubId);
        const topScorer = (myRosterStats ?? [])
          .filter((p) => (p.goals_season ?? 0) > 0)
          .sort((a, b) => (b.goals_season ?? 0) - (a.goals_season ?? 0))[0];
        const playerOfSeason = (myRosterStats ?? [])
          .filter((p) => (p.appearances_season ?? 0) > 0)
          .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))[0];
        const awardRows: any[] = [];
        if (topScorer) {
          awardRows.push({
            save_id: saveId, competition_id: comp.id, club_id: myClubId, season: comp.season,
            kind: "top_scorer", player_id: topScorer.id, player_name: topScorer.name, value: topScorer.goals_season,
          });
          seasonAwards.push({ kind: "top_scorer", playerName: topScorer.name, value: topScorer.goals_season });
        }
        if (playerOfSeason) {
          awardRows.push({
            save_id: saveId, competition_id: comp.id, club_id: myClubId, season: comp.season,
            kind: "player_of_season", player_id: playerOfSeason.id, player_name: playerOfSeason.name, value: playerOfSeason.overall,
          });
          seasonAwards.push({ kind: "player_of_season", playerName: playerOfSeason.name, value: playerOfSeason.overall });
        }
        if (awardRows.length > 0) {
          const { error } = await supabase.from("season_awards").insert(awardRows);
          if (error) throw error;
        }
      }
    }

  }

  // --- Acesso e rebaixamento ------------------------------------------------
  // Precisa acontecer com TODAS as tabelas finais já calculadas e ANTES de
  // gerar o calendário da temporada nova / montar playableClubIds — um clube
  // pode ter subido pra uma liga jogável ou caído pra uma de segundo plano.
  const leagueComps = comps.filter((c) => c.type !== "cup");
  const promoRel = await applyPromotionRelegation(
    saveId,
    leagueComps.map((c) => ({ id: c.id, name: c.name, tier: c.tier ?? 1, country: c.country ?? null })),
    standingsByComp,
    myClubId,
  );

  // playableClubIds — recalculado DEPOIS das trocas de divisão.
  {
    const { data: allClubs } = await supabase.from("clubs").select("id, competition_id").eq("save_id", saveId);
    for (const c of allClubs ?? []) {
      if (c.competition_id && !backgroundCompIds.has(c.competition_id)) playableClubIds.push(c.id);
    }
  }

  await assignAIStaff(saveId, myClubId);

  const nextSeasonStart = addDays(lastDate, OFF_SEASON_DAYS);

  // Ligas jogáveis: virada detalhada jogador a jogador (envelhece, libera
  // contrato, deriva atributo, aposenta, gera base). Ligas de segundo plano:
  // uma chamada RPC que faz tudo no servidor (idade, contrato, deriva de
  // overall, aposentadoria) e recalcula clubs.strength de todo mundo.
  const { retirements, youthPromoted, potentialSwings } = await agePlayersAndReleaseContracts(
    saveId, lastDate, myClubId, playableClubIds,
  );
  if (backgroundCompIds.size > 0) {
    const { error: rpcErr } = await supabase.rpc("rollover_background_players", {
      p_save_id: saveId,
      p_next_season_start: nextSeasonStart,
    });
    if (rpcErr) throw rpcErr;
  }

  // Vira a temporada de cada liga e gera o calendário novo logo em seguida
  // (as duas escritas coladas encurtam a janela em que uma liga podia ficar
  // com season nova e ZERO partidas). A copa fica de fora — é recriada sob
  // demanda a cada temporada (ver src/lib/cup-progression.ts).
  for (const comp of leagueComps) {
    const { error } = await supabase.from("competitions").update({ season: comp.season + 1 }).eq("id", comp.id);
    if (error) throw error;
    await generateScheduleForSave(saveId, nextSeasonStart, comp.id);
  }

  // Meta da diretoria pra NOVA temporada, gerada proativamente aqui em vez de
  // esperar o usuário abrir a tela Diretoria pela 1ª vez (item 12 do backlog
  // FootSim) — sem isso o painel inicial ficava sem a frase de meta logo
  // depois da virada. Usa a competição ATUAL do clube (já reflete acesso/
  // rebaixamento aplicado acima) e a temporada nova dela.
  if (!fired && myClubId) {
    const { data: myClubNow } = await supabase.from("clubs").select("competition_id").eq("id", myClubId).single();
    const myComp = myClubNow?.competition_id ? leagueComps.find((c) => c.id === myClubNow.competition_id) : undefined;
    if (myComp) await ensureSeasonObjective(saveId, myClubId, myComp.id, myComp.season + 1);
  }

  const savePatch: any = { game_date: nextSeasonStart };
  if (fired) {
    savePatch.my_club_id = null;
    // Registra o clube pra não reaparecer na lista de escolha em
    // saves.$saveId.setup.tsx — ver src/routes/.../saves.$saveId.setup.tsx.
    const already = (save?.fired_from_club_ids as string[] | null) ?? [];
    if (firedFromClubId && !already.includes(firedFromClubId)) {
      savePatch.fired_from_club_ids = [...already, firedFromClubId];
    }
  }
  const { error: savePatchError } = await supabase.from("saves").update(savePatch).eq("id", saveId);
  if (savePatchError) throw savePatchError;

  return {
    rolledOver: true, newSeason: (leagueComps[0]?.season ?? comps[0].season) + 1, retirements, youthPromoted,
    potentialSwings,
    fired, firedFromClub, seasonAwards, objectiveOutcome,
    promotion: promoRel.userMove?.direction === "promoted" ? { competitionName: promoRel.userMove.toName } : undefined,
    relegation: promoRel.userMove?.direction === "relegated" ? { competitionName: promoRel.userMove.toName } : undefined,
  };
}

// -----------------------------------------------------------------------------
// applyPromotionRelegation — com todas as tabelas finais em mãos, para cada
// país (competitions.country) e cada par de divisões consecutivas (tier T e
// T+1), troca os N piores da de cima pelos N melhores da de baixo. N vem de
// promotionSlots() (ligas pequenas trocam menos). Só mexe em clubs
// (competition_id + division); jogadores acompanham o clube.
// -----------------------------------------------------------------------------
async function applyPromotionRelegation(
  saveId: string,
  leagueComps: { id: string; name: string; tier: number; country: string | null }[],
  standingsByComp: Map<string, StandingRow[]>,
  myClubId: string | null,
): Promise<{ userMove?: { direction: "promoted" | "relegated"; toName: string } }> {
  const byCountry = new Map<string, typeof leagueComps>();
  for (const c of leagueComps) {
    if (!c.country) continue;
    const arr = byCountry.get(c.country) ?? [];
    arr.push(c);
    byCountry.set(c.country, arr);
  }

  const updates: any[] = [];
  let userMove: { direction: "promoted" | "relegated"; toName: string } | undefined;

  for (const group of byCountry.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.tier - b.tier);
    for (let i = 0; i + 1 < group.length; i++) {
      const upper = group[i];
      const lower = group[i + 1];
      if (lower.tier !== upper.tier + 1) continue; // divisões precisam ser consecutivas
      const up = standingsByComp.get(upper.id) ?? [];
      const down = standingsByComp.get(lower.id) ?? [];
      const n = promotionSlots(Math.min(up.length, down.length));
      if (n === 0) continue;

      const relegated = up.slice(up.length - n); // piores da divisão de cima
      const promoted = down.slice(0, n);         // melhores da divisão de baixo

      for (const r of relegated) {
        updates.push(supabase.from("clubs").update({ competition_id: lower.id, division: lower.tier }).eq("id", r.club_id));
        if (r.club_id === myClubId) userMove = { direction: "relegated", toName: lower.name };
      }
      for (const r of promoted) {
        updates.push(supabase.from("clubs").update({ competition_id: upper.id, division: upper.tier }).eq("id", r.club_id));
        if (r.club_id === myClubId) userMove = { direction: "promoted", toName: upper.name };
      }
    }
  }

  for (let i = 0; i < updates.length; i += 25) {
    const results = await Promise.all(updates.slice(i, i + 25));
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }

  return { userMove };
}

// -----------------------------------------------------------------------------
// Envelhecimento simples: +1 ano pra todos; jovens (<=23) tendem a evoluir um
// pouco, veteranos (>=30) tendem a regredir um pouco. Contratos vencidos
// viram agentes livres — a não ser que seja jogador de um clube de IA, que
// na maioria das vezes renova sozinho (o usuário é quem precisa ficar de
// olho e renovar a tempo os PRÓPRIOS jogadores — ver src/lib/contract-offers.ts).
// Veteranos se aposentam de vez (saem do save) e cada clube recebe 1-2
// juniores novos — sem isso o elenco do mundo só encolheria e envelheceria
// a cada temporada (ver src/game/retirement.ts e src/game/youth.ts).
// -----------------------------------------------------------------------------
// Atributos "treináveis" por envelhecimento — deixa de fora os goleiro-only
// pra jogador de linha (e vice-versa) ficarem intocados no shuffle.
const DEV_ATTRS: AttributeKey[] = [...TECHNICAL_KEYS, ...MENTAL_KEYS, ...PHYSICAL_KEYS];
const AI_AUTO_RENEW_CHANCE = 0.7;

async function agePlayersAndReleaseContracts(
  saveId: string, seasonEndDate: string, myClubId: string | null,
  playableClubIds?: string[],
): Promise<{ retirements: string[]; youthPromoted: number; potentialSwings: RolloverResult["potentialSwings"] }> {
  const nextSeasonStart = addDays(seasonEndDate, OFF_SEASON_DAYS);
  const { data: allPlayers } = await supabase
    .from("players")
    .select("id, name, age, position, club_id, contract_until, wage, overall, potential, market_value, attributes")
    .eq("save_id", saveId);
  // Só jogadores de clubes de ligas jogáveis (+ agentes livres, club_id null).
  // Os de clubes de segundo plano viram pelo RPC rollover_background_players.
  const playableSet = playableClubIds ? new Set(playableClubIds) : null;
  const players = playableSet
    ? (allPlayers ?? []).filter((p) => !p.club_id || playableSet.has(p.club_id))
    : (allPlayers ?? []);
  if (players.length === 0) return { retirements: [], youthPromoted: 0, potentialSwings: [] };

  const updates: any[] = [];
  const retiredIds: string[] = [];
  const retirements: string[] = [];
  const potentialSwings: NonNullable<RolloverResult["potentialSwings"]> = [];
  for (const p of players as any[]) {
    const newAge = (p.age ?? 24) + 1;

    if (rollRetirement(newAge, p.position)) {
      retiredIds.push(p.id);
      if (p.club_id === myClubId) retirements.push(p.name);
      continue;
    }

    // Estatísticas de temporada (gols, presenças, cartões) zeram a cada
    // virada — sem isso os prêmios de fim de temporada e a regra de
    // suspensão por acúmulo de amarelo ficariam contaminados pela
    // temporada anterior.
    const patch: any = { age: newAge, form: 65, condition: 100, goals_season: 0, appearances_season: 0, yellow_cards_season: 0 };

    if (p.contract_until && p.contract_until <= nextSeasonStart) {
      if (p.club_id && p.club_id !== myClubId && Math.random() < AI_AUTO_RENEW_CHANCE) {
        // Clube de IA renova sozinho — nova janela de 1 a 3 anos e um reajuste leve.
        const extraYears = 1 + Math.floor(Math.random() * 3);
        patch.contract_until = addDays(nextSeasonStart, extraYears * 365);
        patch.wage = Math.round((p.wage ?? 10000) * (1 + Math.random() * 0.15));
      } else {
        // Libera contrato vencido — vira agente livre (club_id = null).
        // contract_until some junto: agente livre não tem contrato nenhum,
        // deixar a data velha aqui faria parecer que ele ainda tem um.
        patch.club_id = null;
        patch.contract_until = null;
      }
    }

    // Potencial imprevisível (item 17 do backlog FootSim) — o teto sofre um
    // pequeno passeio aleatório uma vez por temporada ANTES do trend de
    // overall abaixo usar ele (senão o jogador "sentiria" só a folga antiga).
    // Só mexe em quem já tem potencial definido — sem inventar dado pra
    // quem não tem.
    if (p.potential != null) {
      const d = driftPotential(newAge, p.overall, p.potential);
      if (d.potential !== p.potential) {
        patch.potential = d.potential;
        if (p.club_id === myClubId && d.kind !== "normal") {
          potentialSwings.push({ name: p.name, kind: d.kind, from: p.potential, to: d.potential });
        }
      }
    }

    // Progressão/regressão leve de atributos, clampada em 1-20 — agora
    // depende da folga real entre overall e potencial (ver developmentTrend
    // em src/game/potential.ts), não só da idade: jovem já colado no teto
    // estagna ("flop"), veterano com folga de verdade segura ("late
    // bloomer"), em vez de subir/cair igual pra todo mundo da faixa.
    const trend = developmentTrend(newAge, p.overall, patch.potential ?? p.potential ?? null);
    if (trend !== 0) {
      const current: PlayerAttributes = p.attributes ?? {};
      const shuffled = [...DEV_ATTRS].sort(() => Math.random() - 0.5).slice(0, 3);
      const nextAttrs = { ...current };
      for (const attr of shuffled) {
        const delta = trend * (1 + Math.floor(Math.random() * 2)); // ±1 ou ±2
        nextAttrs[attr] = Math.max(1, Math.min(20, (current[attr] ?? 10) + delta));
      }
      patch.attributes = nextAttrs;
      patch.overall = attributesOverall(p.position, nextAttrs);
      patch.market_value = adjustMarketValue(p.market_value, patch.overall - p.overall);
    }

    updates.push(supabase.from("players").update(patch).eq("id", p.id));
  }

  const CHUNK = 25;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const results = await Promise.all(updates.slice(i, i + CHUNK));
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }
  for (let i = 0; i < retiredIds.length; i += CHUNK) {
    const { error } = await supabase.from("players").delete().in("id", retiredIds.slice(i, i + CHUNK));
    if (error) throw error;
  }

  // Cada clube de liga jogável recebe 1-2 juniores novos pra repor quem se
  // aposentou. Clube de segundo plano não gera base (o RPC só mexe em idade/
  // contrato/overall e recompõe a força pelo cache) — manteria o elenco enxuto
  // deles inflando de graça.
  const { data: clubs } = await supabase.from("clubs").select("id, reputation, youth_facilities").eq("save_id", saveId);
  let youthPromoted = 0;
  for (const c of clubs ?? []) {
    if (playableSet && !playableSet.has(c.id) && c.id !== myClubId) continue;
    const count = await generateYouthIntake(saveId, c.id, c.reputation ?? 50, nextSeasonStart, (c as any).youth_facilities ?? 3);
    if (c.id === myClubId) youthPromoted = count;
  }

  return { retirements, youthPromoted, potentialSwings };
}