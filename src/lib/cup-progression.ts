import { supabase } from "@/integrations/supabase/client";
import {
  generateInitialBracket, pairNextRound, penaltyInputsFromSquad, roundName, roundsRemainingFromTieCount,
  simulatePenalties, simulateExtraTimeFull, simulateExtraTimeQuick,
} from "@/game/cup";
import { analyzeCongestion } from "@/game/congestion";
import { pushInbox } from "./inbox";

// Depois de agendar novos jogos de copa, checa se o clube do usuário entra
// numa sequência apertada (liga + copa) e, se sim, avisa na caixa de entrada.
async function warnIfCongested(saveId: string, myClubId: string, gameDate: string) {
  const { data: rows } = await supabase
    .from("matches").select("id, match_date, competition_id")
    .eq("save_id", saveId).eq("played", false)
    .or(`home_club_id.eq.${myClubId},away_club_id.eq.${myClubId}`)
    .order("match_date", { ascending: true }).limit(10);
  const compIds = [...new Set((rows ?? []).map((m) => m.competition_id).filter(Boolean))] as string[];
  const { data: comps } = compIds.length
    ? await supabase.from("competitions").select("id, type").in("id", compIds)
    : { data: [] as any[] };
  const typeById = new Map((comps ?? []).map((c) => [c.id, c.type]));
  const report = analyzeCongestion(
    (rows ?? []).map((m) => ({ id: m.id, date: m.match_date, competitionType: m.competition_id ? typeById.get(m.competition_id) ?? null : null })),
    gameDate,
  );
  if (report.level === "none") return;
  await pushInbox(saveId, myClubId, gameDate, {
    category: "general", sender: "Comissão técnica",
    subject: `Calendário apertado: ${report.headline}`,
    body: `${report.advice} Datas: ${(report.nextRun?.matches ?? []).map((m) => m.date).join(", ")}.`,
    link: `/saves/${saveId}/tactics`, linkLabel: "Ajustar tática",
  });
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * Cria a copa da temporada atual, se ainda não existir. Usa os mesmos clubes
 * da liga do usuário (mesma divisão). Chamado sob demanda pela tela de Copa
 * (botão "Criar copa desta temporada").
 */
export async function createCupCompetition(saveId: string): Promise<{ created: boolean; reason?: string }> {
  const { data: save } = await supabase.from("saves").select("game_date, my_club_id").eq("id", saveId).single();
  if (!save?.my_club_id) return { created: false, reason: "Save sem clube definido." };

  const { data: myClub } = await supabase.from("clubs").select("competition_id").eq("id", save.my_club_id).single();
  if (!myClub?.competition_id) return { created: false, reason: "Clube sem competição de liga associada." };

  const { data: league } = await supabase.from("competitions").select("id, season").eq("id", myClub.competition_id).single();
  if (!league) return { created: false, reason: "Competição de liga não encontrada." };

  const { data: existing } = await supabase
    .from("competitions").select("id")
    .eq("save_id", saveId).eq("type", "cup").eq("season", league.season)
    .maybeSingle();
  if (existing) return { created: false, reason: "A copa desta temporada já existe." };

  const { data: clubs } = await supabase.from("clubs").select("id").eq("competition_id", myClub.competition_id);
  if (!clubs || clubs.length < 2) return { created: false, reason: "Clubes insuficientes pra formar uma copa." };

  const bracketSize = (() => { let p = 1; while (p < clubs.length) p *= 2; return p; })();
  const totalRounds = Math.round(Math.log2(bracketSize));

  const { data: comp, error: compErr } = await supabase
    .from("competitions")
    .insert({ save_id: saveId, code: "CUP", name: "Copa", type: "cup", season: league.season, current_round: 0, total_rounds: totalRounds })
    .select("id").single();
  if (compErr || !comp) return { created: false, reason: compErr?.message ?? "Falha ao criar competição." };
  // Daqui pra baixo, escritas que já eram checadas continuam checadas; as
  // que não eram, agora lançam — criar copa é uma ação do usuário (botão
  // "Criar copa desta temporada"), então é seguro deixar propagar.

  const pairings = generateInitialBracket(clubs.map((c) => c.id));
  const tieCount = pairings.length;
  const rName = roundName(roundsRemainingFromTieCount(tieCount));
  const isSingleLeg = tieCount === 1;

  const tieRows: any[] = [];
  for (const p of pairings) {
    if (!p.away) {
      tieRows.push({
        save_id: saveId, competition_id: comp.id, season: league.season,
        round_index: 0, round_name: rName, home_club_id: p.home, away_club_id: null,
        is_single_leg: false, winner_club_id: p.home, resolved: true,
      });
      continue;
    }
    const leg1Date = addDays(save.game_date, 7);
    const { data: leg1, error: leg1Error } = await supabase.from("matches").insert({
      save_id: saveId, competition_id: comp.id, season: league.season, round: 1,
      match_date: leg1Date, home_club_id: p.home, away_club_id: p.away, played: false,
    }).select("id").single();
    if (leg1Error) throw leg1Error;

    let leg2Id: string | null = null;
    if (!isSingleLeg) {
      const leg2Date = addDays(save.game_date, 14);
      const { data: leg2, error: leg2Error } = await supabase.from("matches").insert({
        save_id: saveId, competition_id: comp.id, season: league.season, round: 2,
        match_date: leg2Date, home_club_id: p.away, away_club_id: p.home, played: false,
      }).select("id").single();
      if (leg2Error) throw leg2Error;
      leg2Id = leg2?.id ?? null;
    }

    tieRows.push({
      save_id: saveId, competition_id: comp.id, season: league.season,
      round_index: 0, round_name: rName, home_club_id: p.home, away_club_id: p.away,
      leg1_match_id: leg1?.id ?? null, leg2_match_id: leg2Id, is_single_leg: isSingleLeg, resolved: false,
    });
  }

  const { error: tieRowsError } = await supabase.from("cup_ties").insert(tieRows);
  if (tieRowsError) throw tieRowsError;

  try { await warnIfCongested(saveId, save.my_club_id, save.game_date); } catch { /* aviso é acessório */ }
  return { created: true };
}

/**
 * Avança o chaveamento: resolve confrontos cujas partidas já foram jogadas
 * (agregado, pênaltis se empatar) e gera a próxima fase automaticamente
 * quando toda a rodada atual estiver resolvida. Chamado no fim de todo
 * advanceDays().
 */
export async function progressCup(saveId: string): Promise<void> {
  const { data: save } = await supabase.from("saves").select("game_date, my_club_id").eq("id", saveId).single();
  if (!save) return;
  let scheduledNewTies = false;

  const { data: cupComp } = await supabase
    .from("competitions").select("id, season").eq("save_id", saveId).eq("type", "cup")
    .order("season", { ascending: false }).limit(1).maybeSingle();
  if (!cupComp) return;

  const { data: ties } = await supabase
    .from("cup_ties").select("*")
    .eq("competition_id", cupComp.id).eq("season", cupComp.season).eq("resolved", false);
  if (!ties || ties.length === 0) return;

  const matchIds = ties.flatMap((t) => [t.leg1_match_id, t.leg2_match_id].filter(Boolean)) as string[];
  const { data: matches } = matchIds.length > 0
    ? await supabase.from("matches").select("id, home_club_id, away_club_id, home_score, away_score, played, events").in("id", matchIds)
    : { data: [] as any[] };
  const matchById = new Map((matches ?? []).map((m) => [m.id, m]));

  const resolvedRoundIndexes = new Set<number>();

  for (const tie of ties) {
    const leg1 = tie.leg1_match_id ? matchById.get(tie.leg1_match_id) : null;
    const leg2 = tie.leg2_match_id ? matchById.get(tie.leg2_match_id) : null;

    const ready = tie.is_single_leg ? !!leg1?.played : !!leg1?.played && !!leg2?.played;
    if (!ready) continue;

    let homeGoals = 0, awayGoals = 0;
    if (leg1) {
      if (leg1.home_club_id === tie.home_club_id) { homeGoals += leg1.home_score ?? 0; awayGoals += leg1.away_score ?? 0; }
      else { homeGoals += leg1.away_score ?? 0; awayGoals += leg1.home_score ?? 0; }
    }
    if (leg2) {
      if (leg2.home_club_id === tie.home_club_id) { homeGoals += leg2.home_score ?? 0; awayGoals += leg2.away_score ?? 0; }
      else { homeGoals += leg2.away_score ?? 0; awayGoals += leg2.home_score ?? 0; }
    }

    let winnerId: string;
    let penaltyHome: number | null = null;
    let penaltyAway: number | null = null;
    let tieBreakNote: string | null = null;

    // Byes (away_club_id null) são criados já resolved:true e nunca chegam
    // aqui (filtro .eq("resolved", false) acima), então away_club_id é
    // garantido não-nulo neste ponto.
    if (homeGoals !== awayGoals) {
      winnerId = (homeGoals > awayGoals ? tie.home_club_id : tie.away_club_id)!;
    } else {
      // Prorrogação (Lei 7) — SEMPRE antes de pênaltis, nunca pulada direto
      // pro sorteio (era assim antes desta mudança). A partida que decide é
      // a 2ª mão (ou a única, em confronto de jogo único); é ELA que ganha
      // os minutos extras — o placar da prorrogação entra no agregado E no
      // registro daquela partida específica, igual acontece de verdade.
      const decidingMatchId = tie.is_single_leg ? tie.leg1_match_id! : tie.leg2_match_id!;
      const decidingMatch = matchById.get(decidingMatchId);
      const involvesUser = !!save.my_club_id && (tie.home_club_id === save.my_club_id || tie.away_club_id === save.my_club_id);

      let etHomeGoals = 0, etAwayGoals = 0;
      let etEvents: any[] | null = null;

      if (decidingMatch && involvesUser) {
        // Motor completo (escalação/tática reais) — só dá pra montar porque
        // o clube do usuário está envolvido; a IA sozinha nunca carrega
        // elenco completo pra um confronto que o usuário não disputa (ver
        // arquitetura de ligas de segundo plano em src/lib/advance-day.ts).
        const [{ data: homeClub }, { data: awayClub }] = await Promise.all([
          supabase.from("clubs").select("id, name, short_name, morale, reputation, formation, mentality, pressing, defensive_line, tempo, passing_style, penalty_taker_id, free_kick_taker_id, corner_taker_id, captain_id").eq("id", decidingMatch.home_club_id).single(),
          supabase.from("clubs").select("id, name, short_name, morale, reputation, formation, mentality, pressing, defensive_line, tempo, passing_style, penalty_taker_id, free_kick_taker_id, corner_taker_id, captain_id").eq("id", decidingMatch.away_club_id).single(),
        ]);
        const [{ data: etHomePlayers }, { data: etAwayPlayers }, { data: tl }] = await Promise.all([
          supabase.from("players").select("*").eq("club_id", decidingMatch.home_club_id),
          supabase.from("players").select("*").eq("club_id", decidingMatch.away_club_id),
          save.my_club_id ? supabase.from("tactic_lineups").select("*").eq("club_id", save.my_club_id) : Promise.resolve({ data: [] as any[] }),
        ]);
        const myLineup = (tl ?? []) as any[];
        const isUserHome = decidingMatch.home_club_id === save.my_club_id;

        if (homeClub && awayClub) {
          const et = simulateExtraTimeFull(homeClub as any, awayClub as any, (etHomePlayers ?? []) as any, (etAwayPlayers ?? []) as any, {
            seed: decidingMatchId,
            homeLineup: isUserHome ? myLineup : undefined,
            awayLineup: !isUserHome ? myLineup : undefined,
            todayISO: save.game_date,
          });
          etHomeGoals = et.homeGoals; etAwayGoals = et.awayGoals; etEvents = et.events ?? null;
        }
      } else if (decidingMatch) {
        // Aproximação estatística (confronto só entre IA) — ainda respeita a
        // ORDEM real das leis (prorrogação antes de pênaltis), sem log de evento.
        const [{ data: homeClubRating }, { data: awayClubRating }] = await Promise.all([
          supabase.from("clubs").select("strength, reputation").eq("id", decidingMatch.home_club_id).single(),
          supabase.from("clubs").select("strength, reputation").eq("id", decidingMatch.away_club_id).single(),
        ]);
        const homeRating = homeClubRating?.strength ?? homeClubRating?.reputation ?? 50;
        const awayRating = awayClubRating?.strength ?? awayClubRating?.reputation ?? 50;
        const et = simulateExtraTimeQuick(homeRating, awayRating, decidingMatchId);
        etHomeGoals = et.homeGoals; etAwayGoals = et.awayGoals;
      }

      if (decidingMatch && (etHomeGoals > 0 || etAwayGoals > 0 || etEvents)) {
        // Converte gols "do lado da PARTIDA decisiva" (home/away de quem
        // manda ESSA partida) pra perspectiva do CONFRONTO (tie.home/away) —
        // a 2ª mão é jogada na casa do outro time, então pode estar invertida.
        const decidingHomeIsTieHome = decidingMatch.home_club_id === tie.home_club_id;
        if (decidingHomeIsTieHome) { homeGoals += etHomeGoals; awayGoals += etAwayGoals; }
        else { homeGoals += etAwayGoals; awayGoals += etHomeGoals; }

        const { error: updErr } = await supabase.from("matches").update({
          home_score: (decidingMatch.home_score ?? 0) + etHomeGoals,
          away_score: (decidingMatch.away_score ?? 0) + etAwayGoals,
          ...(etEvents ? { events: [...(decidingMatch.events ?? []), ...etEvents] } : {}),
        }).eq("id", decidingMatch.id);
        if (updErr) throw updErr;
        tieBreakNote = `Prorrogação: ${etHomeGoals}-${etAwayGoals} no tempo extra.`;
      }

      if (homeGoals !== awayGoals) {
        winnerId = (homeGoals > awayGoals ? tie.home_club_id : tie.away_club_id)!;
      } else {
        const [{ data: homePlayers }, { data: awayPlayers }] = await Promise.all([
          supabase.from("players").select("position, attributes").eq("club_id", tie.home_club_id!),
          supabase.from("players").select("position, attributes").eq("club_id", tie.away_club_id!),
        ]);
        const home = penaltyInputsFromSquad((homePlayers ?? []) as any);
        const away = penaltyInputsFromSquad((awayPlayers ?? []) as any);
        const shootout = simulatePenalties(home.gkReflexes, away.gkReflexes, home.finishingAvg, away.finishingAvg);
        penaltyHome = shootout.home;
        penaltyAway = shootout.away;
        winnerId = (shootout.winner === "home" ? tie.home_club_id : tie.away_club_id)!;
        tieBreakNote = `${tieBreakNote ? tieBreakNote + " " : ""}Pênaltis: ${shootout.home}-${shootout.away}.`;
      }
    }

    const { error: resolveError } = await supabase.from("cup_ties").update({
      resolved: true, winner_club_id: winnerId, penalty_home: penaltyHome, penalty_away: penaltyAway,
    }).eq("id", tie.id);
    if (resolveError) throw resolveError;

    // Avisa o usuário quando o confronto DELE foi decidido fora do tempo
    // normal — sem isso, quem assistiu a partida ao vivo terminando empatada
    // veria o placar final "mudar sozinho" no calendário sem explicação (a
    // prorrogação/pênaltis resolve aqui, depois que a partida ao vivo já fechou).
    if (tieBreakNote && save.my_club_id && (tie.home_club_id === save.my_club_id || tie.away_club_id === save.my_club_id)) {
      const iWon = winnerId === save.my_club_id;
      try {
        await pushInbox(saveId, save.my_club_id, save.game_date, {
          category: "general", sender: "Comissão técnica",
          subject: iWon ? "Classificados após prorrogação!" : "Eliminados após prorrogação",
          body: `O confronto de ${tie.round_name} empatou no tempo normal. ${tieBreakNote} ${iWon ? "Seguimos na competição." : "Fim da caminhada na copa."}`,
          link: `/saves/${saveId}/cup`, linkLabel: "Ver copa",
        });
      } catch { /* aviso é acessório */ }
    }

    resolvedRoundIndexes.add(tie.round_index);
  }

  for (const roundIndex of resolvedRoundIndexes) {
    const { data: roundTies } = await supabase
      .from("cup_ties").select("*")
      .eq("competition_id", cupComp.id).eq("season", cupComp.season).eq("round_index", roundIndex);
    if (!roundTies || roundTies.some((t) => !t.resolved)) continue;

    const winners = roundTies.map((t) => t.winner_club_id).filter(Boolean) as string[];
    if (winners.length <= 1) {
      if (winners[0]) {
        const { error } = await supabase.from("competitions").update({
          champion_club_id: winners[0], champion_season: cupComp.season,
        }).eq("id", cupComp.id);
        if (error) throw error;
      }
      continue;
    }

    const pairings = pairNextRound(winners);
    const tieCount = pairings.length;
    const rName = roundName(roundsRemainingFromTieCount(tieCount));
    const isSingleLeg = tieCount === 1;
    const nextRoundIndex = roundIndex + 1;

    const tieRows: any[] = [];
    for (const p of pairings) {
      if (!p.away) {
        tieRows.push({
          save_id: saveId, competition_id: cupComp.id, season: cupComp.season,
          round_index: nextRoundIndex, round_name: rName, home_club_id: p.home, away_club_id: null,
          is_single_leg: false, winner_club_id: p.home, resolved: true,
        });
        continue;
      }
      const leg1Date = addDays(save.game_date, 7);
      const { data: leg1, error: leg1Error } = await supabase.from("matches").insert({
        save_id: saveId, competition_id: cupComp.id, season: cupComp.season, round: nextRoundIndex * 2 + 1,
        match_date: leg1Date, home_club_id: p.home, away_club_id: p.away, played: false,
      }).select("id").single();
      if (leg1Error) throw leg1Error;

      let leg2Id: string | null = null;
      if (!isSingleLeg) {
        const leg2Date = addDays(save.game_date, 14);
        const { data: leg2, error: leg2Error } = await supabase.from("matches").insert({
          save_id: saveId, competition_id: cupComp.id, season: cupComp.season, round: nextRoundIndex * 2 + 2,
          match_date: leg2Date, home_club_id: p.away, away_club_id: p.home, played: false,
        }).select("id").single();
        if (leg2Error) throw leg2Error;
        leg2Id = leg2?.id ?? null;
      }

      tieRows.push({
        save_id: saveId, competition_id: cupComp.id, season: cupComp.season,
        round_index: nextRoundIndex, round_name: rName, home_club_id: p.home, away_club_id: p.away,
        leg1_match_id: leg1?.id ?? null, leg2_match_id: leg2Id, is_single_leg: isSingleLeg, resolved: false,
      });
    }
    if (tieRows.length > 0) {
      const { error } = await supabase.from("cup_ties").insert(tieRows);
      if (error) throw error;
      scheduledNewTies = true;
    }
  }

  if (scheduledNewTies && save.my_club_id) {
    try { await warnIfCongested(saveId, save.my_club_id, save.game_date); } catch { /* aviso é acessório */ }
  }
}