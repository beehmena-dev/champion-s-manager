import { supabase } from "@/integrations/supabase/client";
import { simulateMatchSegment, type MatchCarryState } from "@/game/simulation";
import { rollRelapse, buildInjuryPatch } from "@/game/medical";
import { autoLineup } from "@/game/tactics";
import { checkAvailability } from "@/game/availability";
import { pickAiMatchTactics } from "@/game/ai-tactics";
import { resolveShout, type ShoutId } from "@/game/shouts";
import { resolveTeamTalk, type TeamTalkId } from "@/game/team-talk";
import type { MatchResult, Mentality, FormationCode } from "@/game/types";

const CLUB_COLS = "id, name, short_name, morale, reputation, formation, mentality, pressing, defensive_line, tempo, passing_style, team_fluidity, pending_override, primary_color, secondary_color, penalty_taker_id, free_kick_taker_id, corner_taker_id, captain_id";

// -----------------------------------------------------------------------------
// Override temporário "só pra próxima partida" (ver tactics.tsx, escopo de
// salvar) — um snapshot completo (mesmo shape de TacticPreset) gravado em
// clubs.pending_override. Só o clube DO USUÁRIO pode ter isso (a IA nunca
// grava); aplicado por cima do club row buscado, sem tocar nada persistido —
// some sozinho depois que a partida termina (ver advance-day.ts).
function applyPendingOverride(club: any, isMyClub: boolean): { club: any; overrideLineup: any[] | null } {
  const o = isMyClub ? club?.pending_override : null;
  if (!o) return { club, overrideLineup: null };
  return {
    club: {
      ...club,
      formation: o.formation, mentality: o.mentality, pressing: o.pressing,
      defensive_line: o.defensive_line, tempo: o.tempo, passing_style: o.passing_style,
      team_fluidity: o.team_fluidity,
    },
    overrideLineup: (o.lineup ?? []).map((l: any) => ({ player_id: l.playerId, slot: l.slot, role: l.role, instructions: l.instructions })),
  };
}

export interface LiveMatchSession {
  matchId: string;
  saveId: string;
  myClubId: string;
  isHome: boolean;
  matchDate: string;
  homeClub: any;
  awayClub: any;
  homeRoster: any[];
  awayRoster: any[];
  homeName: string;
  awayName: string;
  carryState: MatchCarryState;
  rng: () => number;
  // Resultado ACUMULADO até `lastMinute` — não é mais "só o 1º tempo": a
  // barra tática ao vivo (ver continueLiveMatch) pausa em vários pontos da
  // partida, não só no intervalo, então esse resultado cresce aos poucos.
  result: MatchResult;
  lastMinute: number;
  /** Reação do vestiário à preleção pré-jogo (se houve). Só pra exibir. */
  teamTalkResponse?: string;
  /** VAR (Lei 6) — true só quando a partida é de copa (mata-mata). Guardado
   * na sessão pra continueLiveMatch não precisar reconsultar a competição
   * a cada pausa da barra tática. */
  hasVar: boolean;
}

/**
 * Busca a partida do usuário marcada pra "hoje" (game_date atual do save),
 * se houver — usado por handleAdvance() pra decidir se abre o modo ao vivo
 * (com intervalo interativo) em vez de simular tudo de uma vez.
 */
/**
 * Procura o próximo jogo do usuário numa janela de N dias a partir de hoje —
 * usado por handleAdvance (tanto "Avançar 1 dia" quanto "+7d") pra decidir
 * se entra no modo ao vivo em algum ponto do intervalo, não só no primeiro
 * dia. Ver src/routes/_authenticated/saves.$saveId.tsx.
 */
export async function findNextUserMatchInWindow(
  saveId: string, myClubId: string, startISO: string, days: number,
): Promise<{ matchId: string; daysFromStart: number } | null> {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);
  const endISO = end.toISOString().split("T")[0];

  const { data } = await supabase
    .from("matches").select("id, match_date")
    .eq("save_id", saveId).eq("played", false)
    .gte("match_date", startISO).lt("match_date", endISO)
    .or(`home_club_id.eq.${myClubId},away_club_id.eq.${myClubId}`)
    .order("match_date", { ascending: true }).limit(1).maybeSingle();
  if (!data) return null;
  const matchD = new Date(data.match_date + "T00:00:00Z");
  const daysFromStart = Math.round((matchD.getTime() - start.getTime()) / 86_400_000);
  return { matchId: data.id, daysFromStart };
}

/**
 * Simula o INÍCIO da partida do usuário, até `toMinute` (ver CHECKPOINTS em
 * saves.$saveId.tsx — a barra tática ao vivo pausa em vários pontos, não só
 * no intervalo tradicional). Não grava nada no banco além da recaída de
 * lesão pré-partida (mesma checagem do fluxo em lote — ver
 * src/lib/advance-day.ts). O restante (placar final, finanças, form/condição,
 * cartões etc.) só é persistido no fim, via advanceDays(..., { precomputedUserMatch }).
 */
export async function startLiveMatch(
  saveId: string, matchId: string, myClubId: string, toMinute: number, teamTalk?: TeamTalkId | null,
): Promise<LiveMatchSession> {
  const { data: m } = await supabase.from("matches").select("id, home_club_id, away_club_id, match_date, competition_id").eq("id", matchId).single();
  if (!m) throw new Error("Partida não encontrada");

  // VAR (Lei 6) — só liga em partida de copa (mata-mata). Uma query pequena
  // e só uma vez por partida (continueLiveMatch reaproveita via session.hasVar).
  let hasVar = false;
  if (m.competition_id) {
    const { data: comp } = await supabase.from("competitions").select("type").eq("id", m.competition_id).single();
    hasVar = comp?.type === "cup";
  }

  // `as any` — team_fluidity/pending_override ainda não estão nos tipos
  // gerados do Supabase (mesmo padrão de "instructions" acima).
  const [{ data: homeClubRaw }, { data: awayClubRaw }] = await Promise.all([
    supabase.from("clubs").select(CLUB_COLS).eq("id", m.home_club_id).single() as any,
    supabase.from("clubs").select(CLUB_COLS).eq("id", m.away_club_id).single() as any,
  ]);
  // O adversário (IA) escolhe tática pra esta partida em vez de usar a
  // postura fixa do seed — mesma lógica do fluxo em lote, ver src/game/ai-tactics.ts.
  let homeClub = homeClubRaw && homeClubRaw.id !== myClubId
    ? { ...homeClubRaw, ...pickAiMatchTactics({ clubReputation: homeClubRaw.reputation ?? 50, opponentReputation: awayClubRaw?.reputation ?? 50, isHome: true }) }
    : homeClubRaw;
  let awayClub = awayClubRaw && awayClubRaw.id !== myClubId
    ? { ...awayClubRaw, ...pickAiMatchTactics({ clubReputation: awayClubRaw.reputation ?? 50, opponentReputation: homeClubRaw?.reputation ?? 50, isHome: false }) }
    : awayClubRaw;
  const isHome = m.home_club_id === myClubId;

  // Override "só pra próxima partida" (ver applyPendingOverride acima) —
  // só pode existir no clube do usuário, aplicado por cima da tática que
  // acabou de ser lida do banco.
  const homeOv = applyPendingOverride(homeClub, m.home_club_id === myClubId);
  homeClub = homeOv.club;
  const awayOv = applyPendingOverride(awayClub, m.away_club_id === myClubId);
  awayClub = awayOv.club;
  const myOverrideLineup = isHome ? homeOv.overrideLineup : awayOv.overrideLineup;

  // Preleção pré-jogo (ver src/game/team-talk.ts): mexe só na moral usada pela
  // simulação do 1º tempo — não persiste (a moral "de verdade" muda pelo
  // resultado, em advance-day), igual ao grito no 2º tempo.
  let teamTalkResponse: string | undefined;
  if (teamTalk) {
    const myRep = (isHome ? homeClubRaw : awayClubRaw)?.reputation ?? 50;
    const oppRep = (isHome ? awayClubRaw : homeClubRaw)?.reputation ?? 50;
    const edge = myRep - oppRep;
    const favourite: -1 | 0 | 1 = edge >= 8 ? 1 : edge <= -8 ? -1 : 0;
    const { moraleShift, response } = resolveTeamTalk(teamTalk, { isHome, favourite });
    teamTalkResponse = response;
    const bump = (c: any) => ({ ...c, morale: Math.max(0, Math.min(100, (c?.morale ?? 70) + moraleShift)) });
    if (isHome) homeClub = bump(homeClub); else awayClub = bump(awayClub);
  }

  const [{ data: homeRoster }, { data: awayRoster }] = await Promise.all([
    supabase.from("players").select("*").eq("club_id", m.home_club_id),
    supabase.from("players").select("*").eq("club_id", m.away_club_id),
  ]);
  // select("*") em vez da lista de colunas — "instructions" ainda não está
  // nos tipos gerados do Supabase (mesmo padrão de tactic_presets acima).
  // Com override "só pra próxima" pendente, usa o snapshot dele no lugar da
  // escalação permanente — nem precisa consultar tactic_lineups.
  let myLineup: any[];
  if (myOverrideLineup) {
    myLineup = myOverrideLineup;
  } else {
    const { data: tl } = await supabase.from("tactic_lineups").select("*").eq("club_id", myClubId);
    myLineup = (tl ?? []) as any[];
  }
  const myRoster = (isHome ? homeRoster : awayRoster) ?? [];

  // Checagem de recaída — mesma regra do fluxo em lote.
  for (const l of myLineup) {
    const p: any = myRoster.find((x: any) => x.id === l.player_id);
    if (!p) continue;
    const relapse = rollRelapse(p, m.match_date, Math.random);
    if (relapse) {
      const patch = buildInjuryPatch(p, m.match_date, relapse.type, relapse.days, true);
      Object.assign(p, patch);
      await supabase.from("players").update(patch as any).eq("id", p.id);
    }
  }

  const { result, carryState, rng } = simulateMatchSegment(
    homeClub as any, awayClub as any, (homeRoster ?? []) as any[], (awayRoster ?? []) as any[],
    {
      seed: matchId, todayISO: m.match_date, startMinute: 1, endMinute: toMinute,
      homeLineup: isHome ? myLineup : undefined,
      awayLineup: !isHome ? myLineup : undefined,
      hasVar,
    },
  );

  return {
    matchId, saveId, myClubId, isHome, matchDate: m.match_date, hasVar,
    homeClub, awayClub, homeRoster: homeRoster ?? [], awayRoster: awayRoster ?? [],
    homeName: homeClub?.name ?? "Casa", awayName: awayClub?.name ?? "Visitante",
    carryState, rng, result, lastMinute: toMinute, teamTalkResponse,
  };
}

/**
 * Retoma a partida a partir de `session.lastMinute` e simula até `toMinute`
 * — relê a escalação/tática/instruções do usuário do banco a cada chamada
 * (assim, qualquer troca ou ajuste feito numa pausa da barra tática já vale
 * pro trecho seguinte). Devolve o MatchResult ACUMULADO até `toMinute` (não
 * só o trecho novo) e o `carryState`/`lastMinute` atualizados, prontos pra
 * virar a próxima LiveMatchSession — ver advanceToCheckpoint() em
 * saves.$saveId.tsx.
 */
export async function continueLiveMatch(
  session: LiveMatchSession, toMinute: number, shout?: ShoutId | null,
): Promise<{ result: MatchResult; carryState: MatchCarryState; lastMinute: number }> {
  const [{ data: myClubFreshRaw }, { data: tl }] = await Promise.all([
    supabase.from("clubs").select(CLUB_COLS).eq("id", session.myClubId).single(),
    supabase.from("tactic_lineups").select("*").eq("club_id", session.myClubId),
  ]);
  // Override "só pra próxima" (ver applyPendingOverride/startLiveMatch) —
  // mesma regra: se pendente, vale por cima do que acabou de ser lido, tanto
  // pra tática quanto pra escalação (no lugar de tactic_lineups).
  const myOv = applyPendingOverride(myClubFreshRaw, true);
  const myClubFresh = myOv.club;
  const myLineup = myOv.overrideLineup ?? ((tl ?? []) as any[]);
  let homeClub = session.isHome ? (myClubFresh ?? session.homeClub) : session.homeClub;
  let awayClub = session.isHome ? session.awayClub : (myClubFresh ?? session.awayClub);

  // Grito de beira de campo (ver src/game/shouts.ts): mexe só na moral usada
  // pela simulação DESTE trecho — não persiste no banco (a moral "de
  // verdade" muda pelo resultado, em advance-day). Cada pausa da barra
  // tática pode ter o seu próprio grito, não só uma vez por partida.
  if (shout) {
    const myScoreNow = session.isHome ? session.result.homeScore : session.result.awayScore;
    const oppScoreNow = session.isHome ? session.result.awayScore : session.result.homeScore;
    const { moraleShift } = resolveShout(shout, myScoreNow - oppScoreNow);
    const bump = (c: any) => ({ ...c, morale: Math.max(0, Math.min(100, (c?.morale ?? 70) + moraleShift)) });
    if (session.isHome) homeClub = bump(homeClub);
    else awayClub = bump(awayClub);
  }

  const { result, carryState } = simulateMatchSegment(
    homeClub as any, awayClub as any, session.homeRoster, session.awayRoster,
    {
      seed: session.matchId, todayISO: session.matchDate, startMinute: session.lastMinute + 1, endMinute: toMinute,
      carryState: session.carryState, rng: session.rng,
      homeLineup: session.isHome ? myLineup : undefined,
      awayLineup: !session.isHome ? myLineup : undefined,
      hasVar: session.hasVar,
    },
  );
  return { result, carryState, lastMinute: toMinute };
}

/**
 * Troca um jogador da escalação salva por outro do banco, no mesmo slot —
 * usada em qualquer pausa da partida ao vivo (intervalo tradicional ou os
 * demais pontos da barra tática — "como por como", sem mexer na formação).
 * Ver src/routes/_authenticated/saves.$saveId.tsx.
 */
export async function makeHalftimeSubstitution(clubId: string, slot: string, newPlayerId: string): Promise<void> {
  const { error } = await supabase.from("tactic_lineups").update({ player_id: newPlayerId }).eq("club_id", clubId).eq("slot", slot);
  if (error) throw error;
}

export async function setHalftimeMentality(clubId: string, mentality: Mentality): Promise<void> {
  await supabase.from("clubs").update({ mentality }).eq("id", clubId);
}

/**
 * Ajusta pressão/ritmo em qualquer pausa da partida ao vivo — os "Instruções"
 * rápidos da barra tática (a tela de Tática continua sendo o lugar pra mexer
 * com calma fora de partida). Mesmas colunas de `clubs` que tactics.tsx usa.
 */
export async function setLiveInstructions(
  clubId: string, patch: { pressing?: number; tempo?: number },
): Promise<void> {
  await supabase.from("clubs").update(patch).eq("id", clubId);
}

/**
 * Troca a formação inteira no intervalo (não só substituição "como por
 * como") — remonta o XI do zero pra nova formação com o mesmo critério do
 * "Auto-escalar" da tela de Tática, restrito a jogadores disponíveis
 * (sem contar lesão/suspensão). Simplificação consciente: como o XI é
 * remontado do zero, jogadores que só entrariam via troca manual podem
 * aparecer "de graça" sem consumir o limite de substituições do intervalo.
 */
export async function changeHalftimeFormation(saveId: string, clubId: string, newFormation: FormationCode, todayISO: string): Promise<void> {
  const { data: roster } = await supabase.from("players").select("*").eq("club_id", clubId);
  const available = (roster ?? []).filter((p) => checkAvailability(p as any, todayISO).available);
  const xi = autoLineup(available as any, newFormation);

  await supabase.from("clubs").update({ formation: newFormation }).eq("id", clubId);
  await supabase.from("tactic_lineups").delete().eq("club_id", clubId);
  const rows = xi.entries.map((e) => ({
    save_id: saveId, club_id: clubId, player_id: e.player.id, slot: e.slot.slot, role: e.slot.defaultRole, is_starter: true,
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from("tactic_lineups").insert(rows);
    if (error) throw error;
  }
}
