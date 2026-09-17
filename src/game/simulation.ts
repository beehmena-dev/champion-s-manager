import type { ClubLike, GranularPosition, MatchEvent, MatchResult, PlayerLike } from "./types";
import { rateTacticalTeam, familiarityFor, type TeamTacticalRating } from "./tactics";
import { checkAvailability } from "./availability";
import type { Mentality } from "./types";
import { rollInjuryType } from "./medical";
import {
  resolveTakersForXI, rollGoalKind, penaltyConversion, headerScore, bestBy,
  type ResolvedTakers,
} from "./set-pieces";
import { DEFAULT_INSTRUCTIONS, instructionCardWeight, instructionScorerWeight, instructionRiskDelta, type PlayerInstructions } from "./player-instructions";
import { refereeForMatch, weatherForMatch, refereeCoefs, weatherCoefs, computeStoppageMinutes, type RefereeProfile, type MatchWeather } from "./match-context";
import { offsideChancePerMinute, pickOffsidePlayer } from "./offside";
import { eightSecondChancePerMinute, backpassChancePerMinute } from "./goalkeeper-rules";
import {
  pressWinChancePerMinute, pickPresser, markDuelChancePerMinute, markDuelWinner,
  overlapRunChance, longShotChance, skillMoveChance, skillMoveDuel, type TextureEvent,
} from "./texture";

/** "45' " ou "45+2' " pra minutos de acréscimo (ver computeStoppageMinutes) — o
 * acréscimo é codificado como base + n×0.01 (45.01, 45.02...) exatamente pra
 * nunca colidir com a numeração real de minuto do próximo tempo (que sempre
 * recomeça limpo em 46/91), sem precisar mudar nenhuma lógica de encadeamento
 * de trechos em src/lib/live-match.ts. */
function minuteLabel(m: number): string {
  const base = Math.floor(m);
  const frac = Math.round((m - base) * 100);
  return frac > 0 ? `${base}+${frac}` : `${base}`;
}

// -----------------------------------------------------------------------------
// Motor de simulação — Fase 1
// Puramente estatístico: recebe o elenco (lista de jogadores) de cada time,
// devolve placar + narrativa minuto-a-minuto textual (estilo Brasfoot).
// Nenhuma dependência de UI ou banco. Pode ser reaproveitado na Fase 3.
// -----------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// -----------------------------------------------------------------------------
// VAR (Lei 6) — só reveja GOL (válido/anulado) e VERMELHO DIRETO, os 2 casos
// mais citados na especificação e os mais limpos de reverter num evento já
// decidido (decrementar placar/cartão de volta). Pênalti marcado/não-marcado
// ficou fora: exigiria simular uma falta que NÃO aconteceu, um mecanismo
// novo demais pra esse bloco. A maioria das revisões CONFIRMA a decisão
// original (fiel à vida real — VAR existe pra pegar erro claro, não pra
// reabrir toda jogada); a chance de reversão em cima da revisão é minoria.
// -----------------------------------------------------------------------------
const VAR_GOAL_REVIEW_CHANCE = 0.15;
const VAR_GOAL_OVERTURN_GIVEN_REVIEW = 0.25;
const VAR_RED_REVIEW_CHANCE = 0.25;
const VAR_RED_RESCIND_GIVEN_REVIEW = 0.3;

// -----------------------------------------------------------------------------
// Expectativa de gols (xG) — baseada na RAZÃO entre poder de ataque e poder de
// defesa do adversário, não na diferença linear. Isso é o que mantém o jogo
// realista: times parelhos convergem pra ~1.3-1.5 gols esperados (média real
// de futebol profissional), e mismatches grandes geram vitórias de 3-4 gols
// de diferença — não 8x0. O expoente 1.3 dá uma resposta suave: diferenças
// pequenas de qualidade quase não mudam o placar esperado, diferenças grandes
// mudam bastante, mas sempre dentro de um teto (clamp) realista.
// -----------------------------------------------------------------------------
const LEAGUE_AVG_XG = 1.35;
const XG_EXPONENT = 1.3;
const XG_MIN = 0.2;
const XG_MAX = 4.0;

function xgFromRatio(attackPower: number, defensePower: number, boost = 1): number {
  const ratio = attackPower / Math.max(3, defensePower + 3);
  const xg = LEAGUE_AVG_XG * Math.pow(Math.max(0.05, ratio), XG_EXPONENT) * boost;
  return Math.max(XG_MIN, Math.min(XG_MAX, xg));
}

export interface SimulateOptions {
  seed?: string;
  homeAdvantage?: number; // 0..1 (default 0.08)
  homeLineup?: { player_id: string; slot: string; role: string | null; instructions?: unknown }[];
  awayLineup?: { player_id: string; slot: string; role: string | null; instructions?: unknown }[];
  todayISO?: string; // data da partida (YYYY-MM-DD) — usada pra filtrar lesionados/suspensos
  // VAR (Lei 6) — parâmetro de COMPETIÇÃO, não fixo: só partidas de mata-mata
  // com VAR ligam isso (ver src/lib/advance-day.ts e src/lib/live-match.ts,
  // que checam o tipo da competição antes de passar true). Default false —
  // liga tradicional sem VAR simulado continua exatamente como antes.
  hasVar?: boolean;
}

// -----------------------------------------------------------------------------
// Estado "carregável" entre dois pedaços de uma mesma partida — o que permite
// parar no intervalo (ver src/game/live-match.ts), deixar o usuário mexer na
// escalação/tática, e retomar o 2º tempo sem perder nada do que já rolou.
// -----------------------------------------------------------------------------
export interface MatchCarryState {
  homeScore: number; awayScore: number;
  shotsHome: number; shotsAway: number; onTargetHome: number; onTargetAway: number;
  cornersHome: number; cornersAway: number; foulsHome: number; foulsAway: number;
  offsidesHome: number; offsidesAway: number;
  events: MatchEvent[];
  cards: { playerId: string; type: "yellow" | "red" }[];
  injuries: { playerId: string; days: number; type: string }[];
  sentOffIds: string[];
  yellowCounts: Record<string, number>;
  ratings: Record<string, { rating: number; goals: number }>;
  // Textura tática (ver src/game/texture.ts) — 100% cosmética, nunca lida por
  // nenhuma outra variável deste arquivo, só acumulada pra devolver em
  // MatchResult.texture.
  texture: TextureEvent[];
}

export interface SegmentOptions extends SimulateOptions {
  startMinute?: number; // default 1
  endMinute?: number;   // default 90
  carryState?: MatchCarryState;
  rng?: () => number;   // injeta um RNG já em andamento (continuidade entre 1º e 2º tempo)
}

export interface SegmentOutcome {
  result: MatchResult;      // reflete o estado acumulado até endMinute (parcial ou final)
  carryState: MatchCarryState;
  rng: () => number;        // mesmo gerador, pra reusar no próximo trecho
  final: boolean;           // true quando endMinute >= 90 (partida realmente encerrada)
}

/**
 * Simula um TRECHO da partida (ex: só o 1º tempo, ou só o 2º). Base de
 * simulateMatch() e do fluxo de intervalo interativo (src/game/live-match.ts).
 * Reavalia as escalações/táticas a cada chamada — é assim que uma troca ou
 * mudança de mentalidade no intervalo passa a valer pro 2º tempo.
 */
export function simulateMatchSegment(
  home: ClubLike,
  away: ClubLike,
  homePlayers: PlayerLike[],
  awayPlayers: PlayerLike[],
  opts: SegmentOptions = {},
): SegmentOutcome {
  const seedStr = opts.seed ?? `${home.id}-${away.id}-${Date.now()}`;
  const rng = opts.rng ?? mulberry32(hashSeed(seedStr));
  const homeAdv = opts.homeAdvantage ?? 0.08;
  const startMinute = opts.startMinute ?? 1;
  const endMinute = opts.endMinute ?? 90;
  const hasVar = opts.hasVar ?? false;

  // Árbitro (Lei 5) e clima/gramado (Lei 1) — determinísticos pela mesma
  // semente da partida, então ficam iguais em todo trecho ao vivo (15'/30'/
  // intervalo/etc. reconstroem o mesmo `seedStr`). Ver src/game/match-context.ts.
  const referee: RefereeProfile = refereeForMatch(seedStr);
  const weather: MatchWeather = weatherForMatch(seedStr);
  const refCoefs = refereeCoefs(referee.strictness);
  const wCoefs = weatherCoefs(weather);

  // Filtra lesionados/suspensos ANTES de montar o XI — sem isso, autoLineup()
  // (usado tanto no fallback automático quanto pra completar buracos de uma
  // escalação salva) podia escalar de verdade um jogador indisponível pra
  // simular a partida. Isso valia sobretudo pros clubes de IA, que sempre
  // caem no fallback automático (nunca têm tactic_lineups salvo), e também
  // pro próprio usuário quando a escalação salva ficou desatualizada depois
  // de uma lesão/suspensão recente. Sem todayISO (raro), não filtra — mesma
  // opts.todayISO já existia só documentada pra isso, nunca usada.
  const availableHome = opts.todayISO ? homePlayers.filter((p) => checkAvailability(p, opts.todayISO!).available) : homePlayers;
  const availableAway = opts.todayISO ? awayPlayers.filter((p) => checkAvailability(p, opts.todayISO!).available) : awayPlayers;

  // Motor tático (Fase 2) — recalculado a cada trecho, então reflete trocas/tática atuais.
  const h: TeamTacticalRating = rateTacticalTeam(availableHome, home, opts.homeLineup, opts.todayISO);
  const a: TeamTacticalRating = rateTacticalTeam(availableAway, away, opts.awayLineup, opts.todayISO);

  // Vantagens laterais — poder de ataque de um lado vs poder de defesa do outro.
  const homeAttackPower = h.attack + h.midfield * 0.35;
  const awayAttackPower = a.attack + a.midfield * 0.35;

  const homeAttackers = h.xi.entries.filter((e) => e.slot.position === "FWD" || e.slot.position === "MID").map((e) => e.player);
  const awayAttackers = a.xi.entries.filter((e) => e.slot.position === "FWD" || e.slot.position === "MID").map((e) => e.player);

  const homeXIPlayers = h.xi.entries.map((e) => e.player);
  const awayXIPlayers = a.xi.entries.map((e) => e.player);

  // Cobradores de bola parada + capitão (ver src/game/set-pieces.ts) — usa o
  // que o clube gravou se o jogador está no XI, senão o melhor do XI.
  const homeTakers = resolveTakersForXI(homeXIPlayers, home);
  const awayTakers = resolveTakersForXI(awayXIPlayers, away);
  const captainBoost = (t: ResolvedTakers) =>
    t.captain ? ((t.captain.attributes?.leadership ?? 10) - 10) / 550 : 0;

  // Risco de lesão por minuto — sobe conforme a condição média do XI cai
  // (base 0.0009: XI 100% ≈ 1x, 60% ≈ 1.9x, 40% ≈ 2.5x).
  const injuryRateFor = (xi: PlayerLike[]) => {
    const avg = xi.length ? xi.reduce((s, p) => s + (p.condition ?? 100), 0) / xi.length : 100;
    return 0.0009 * (1 + Math.max(0, (85 - avg) / 100) * 2.2);
  };
  // Clima/gramado (Lei 1) sobem o risco de lesão pros dois lados igualmente.
  const homeInjuryRate = injuryRateFor(homeXIPlayers) * wCoefs.injury;
  const awayInjuryRate = injuryRateFor(awayXIPlayers) * wCoefs.injury;

  // Moral / vantagem de mando (+ um empurrãozinho do capitão em campo)
  const homeBoost = 1 + homeAdv + ((home.morale ?? 70) - 70) / 200 + captainBoost(homeTakers);
  const awayBoost = 1 + ((away.morale ?? 70) - 70) / 200 + captainBoost(awayTakers);

  // Expectativa de gols — ver xgFromRatio() acima. Clima ruim atrapalha a
  // criação de chance dos dois lados igualmente (wCoefs.chance).
  const homeXG = xgFromRatio(homeAttackPower, a.defense, homeBoost * h.coefs.chance * wCoefs.chance);
  const awayXG = xgFromRatio(awayAttackPower, h.defense, awayBoost * a.coefs.chance * wCoefs.chance);

  // Posse — proporção do meio + estilo de passe
  const midDiff = (h.midfield - a.midfield) * 0.6 + h.coefs.possession - a.coefs.possession + 4; // leve viés casa
  const possHome = clamp01(50 + midDiff * 0.9);

  const cs = opts.carryState;

  // Stats acumuladas (retomadas do trecho anterior, se houver)
  let homeScore = cs?.homeScore ?? 0;
  let awayScore = cs?.awayScore ?? 0;
  let shotsHome = cs?.shotsHome ?? 0, shotsAway = cs?.shotsAway ?? 0;
  let onTargetHome = cs?.onTargetHome ?? 0, onTargetAway = cs?.onTargetAway ?? 0;
  let cornersHome = cs?.cornersHome ?? 0, cornersAway = cs?.cornersAway ?? 0;
  let foulsHome = cs?.foulsHome ?? 0, foulsAway = cs?.foulsAway ?? 0;
  let offsidesHome = cs?.offsidesHome ?? 0, offsidesAway = cs?.offsidesAway ?? 0;

  const events: MatchEvent[] = cs ? [...cs.events] : [];
  const texture: TextureEvent[] = cs ? [...cs.texture] : [];

  // Narração de contexto (clima + árbitro) — só no início de verdade da
  // partida (1º minuto do 1º trecho), nunca repete nos trechos seguintes
  // (checkpoints 15'/30'/intervalo/etc. já carregam `cs` com esse evento dentro).
  // startMinute===1 (não só "!cs"): a prorrogação (ver src/game/cup.ts::
  // simulateExtraTimeFull) TAMBÉM começa sem carryState (é uma simulação
  // nova, só pra contar os gols do tempo extra), mas começando em 91 — sem
  // esse segundo check, esse aviso de abertura apareceria de novo, cravado
  // no minuto 1, no meio da prorrogação.
  if (!cs && startMinute === 1) {
    events.push({
      minute: 1, type: "info", side: "home",
      text: `1' 🌤️ ${weather.label}. Árbitro: ${referee.name} (perfil ${["muito permissivo", "permissivo", "equilibrado", "rigoroso", "muito rigoroso"][referee.strictness - 1]}).`,
    });
  }

  // Chance de gol por minuto
  const homePerMin = homeXG / 90;
  const awayPerMin = awayXG / 90;

  // Impedimento (Lei 11) — ver src/game/offside.ts pra decisão de design
  // (motor agregado, sem geometria por passe; usa os mesmos parâmetros
  // táticos que também controlam a altura da linha defensiva no 2D/3D).
  const homeOffsideChance = offsideChancePerMinute({
    attackTempo: home.tempo ?? 3, attackPassing: home.passing_style ?? "mixed", defenderLine: away.defensive_line ?? 3,
  });
  const awayOffsideChance = offsideChancePerMinute({
    attackTempo: away.tempo ?? 3, attackPassing: away.passing_style ?? "mixed", defenderLine: home.defensive_line ?? 3,
  });

  // Regras de goleiro (Lei 12) — ver src/game/goalkeeper-rules.ts.
  const homeGK = h.xi.entries.find((e) => e.slot.position === "GK")?.player;
  const awayGK = a.xi.entries.find((e) => e.slot.position === "GK")?.player;
  const homeEightSecondChance = eightSecondChancePerMinute(homeGK);
  const awayEightSecondChance = eightSecondChancePerMinute(awayGK);
  const homeBackpassChance = backpassChancePerMinute(homeGK, home.passing_style ?? "mixed");
  const awayBackpassChance = backpassChancePerMinute(awayGK, away.passing_style ?? "mixed");

  // "Lance ruim" — jogador fora de posição pode custar uma chance extra pro
  // adversário. familiarityFor() já calculava essa errorChance (usada até
  // agora só como comentário de intenção — o multiplier era aplicado nas
  // notas do time, mas errorChance nunca virava evento nenhum). Só o titular
  // mais deslocado de cada time entra no sorteio, pra não gerar spam; um
  // jogador em posição natural tem errorChance 0 e nunca dispara isso.
  // Instruções individuais (drible/risco/passe — ver player-instructions.ts)
  // entram como delta em cima disso: jogar arriscado aumenta a chance de
  // perder a bola, jogar cauteloso reduz.
  const mistakeChance = (player: PlayerLike, slotCanonical: GranularPosition, ins: PlayerInstructions) =>
    Math.max(0, familiarityFor(player, slotCanonical).errorChance + instructionRiskDelta(ins));
  const homeMistakeProne = [...h.xi.entries]
    .map(({ slot, player }) => ({ player, errorChance: mistakeChance(player, slot.canonical, h.instructionsByPlayerId.get(player.id) ?? DEFAULT_INSTRUCTIONS) }))
    .sort((x, y) => y.errorChance - x.errorChance)[0] ?? { player: null, errorChance: 0 };
  const awayMistakeProne = [...a.xi.entries]
    .map(({ slot, player }) => ({ player, errorChance: mistakeChance(player, slot.canonical, a.instructionsByPlayerId.get(player.id) ?? DEFAULT_INSTRUCTIONS) }))
    .sort((x, y) => y.errorChance - x.errorChance)[0] ?? { player: null, errorChance: 0 };

  // -----------------------------------------------------------------------
  // Textura tática (ver src/game/texture.ts) — 100% cosmético (decisão do
  // usuário antes de implementar esta fase): nunca lê nem altera xG/placar/
  // estatística, só popula `texture` pra consumo futuro do visual (2D/3D).
  // Aproveita instruções (pressão/marcação/liberdade de avanço-abertura/
  // drible/finalização) e o vetor de diagrama da função — pesos já calculados
  // que antes só entravam na nota tática agregada pré-jogo.
  // -----------------------------------------------------------------------
  const teamPressAvg = (t: TeamTacticalRating) => {
    const vals = [...t.instructionsByPlayerId.values()].map((i) => i.pressing);
    return vals.length ? vals.reduce((s: number, v) => s + v, 0) / vals.length : 0;
  };
  const teamMarkAvg = (t: TeamTacticalRating) => {
    const vals = [...t.instructionsByPlayerId.values()].map((i) => i.marking);
    return vals.length ? vals.reduce((s: number, v) => s + v, 0) / vals.length : 0;
  };
  const homePressAvg = teamPressAvg(h);
  const awayPressAvg = teamPressAvg(a);
  const homeMarkAvg = teamMarkAvg(h);
  const awayMarkAvg = teamMarkAvg(a);

  // Candidato "mais provável" por textura, escolhido uma vez por trecho (mesmo
  // padrão de homeMistakeProne/awayMistakeProne acima) e sorteado minuto a
  // minuto dentro de simulateMinute() — evita recalcular por jogador a cada
  // minuto simulado.
  function pickTextureCandidate(
    t: TeamTacticalRating, entries: { slot: { position: string }; player: PlayerLike }[],
    score: (p: PlayerLike, ins: PlayerInstructions) => number,
  ): PlayerLike | null {
    let best: PlayerLike | null = null, bestScore = -Infinity;
    for (const { slot, player } of entries) {
      if (slot.position === "GK") continue;
      const ins = t.instructionsByPlayerId.get(player.id) ?? DEFAULT_INSTRUCTIONS;
      const s = score(player, ins);
      if (s > bestScore) { bestScore = s; best = player; }
    }
    return best;
  }
  const diagramMag = (t: TeamTacticalRating, playerId: string) => {
    const role = t.roleByPlayerId.get(playerId);
    return role ? Math.hypot(role.diagram.dx, role.diagram.dy) : 0;
  };
  const homeOverlapCandidate = pickTextureCandidate(h, h.xi.entries,
    (p, ins) => (ins.roamWidth + ins.roamDepth) + diagramMag(h, p.id) / 30);
  const awayOverlapCandidate = pickTextureCandidate(a, a.xi.entries,
    (p, ins) => (ins.roamWidth + ins.roamDepth) + diagramMag(a, p.id) / 30);
  const homeLongShotCandidate = pickTextureCandidate(h, h.xi.entries,
    (p, ins) => Math.max(0, ins.shoot) + Math.max(0, ins.risk) * 0.5 + (p.attributes?.long_shots ?? 10) / 20);
  const awayLongShotCandidate = pickTextureCandidate(a, a.xi.entries,
    (p, ins) => Math.max(0, ins.shoot) + Math.max(0, ins.risk) * 0.5 + (p.attributes?.long_shots ?? 10) / 20);
  const homeDribbleCandidate = pickTextureCandidate(h, h.xi.entries,
    (p, ins) => Math.max(0, ins.dribble) + (p.attributes?.dribbling ?? 10) / 20);
  const awayDribbleCandidate = pickTextureCandidate(a, a.xi.entries,
    (p, ins) => Math.max(0, ins.dribble) + (p.attributes?.dribbling ?? 10) / 20);

  // Nota de partida por jogador titular (escala 0-10, base 6.0 — convenção FM).
  // Entra quem já vinha do trecho anterior + quem só apareceu agora (substituído).
  const goalRatings = new Map<string, { rating: number; goals: number }>(
    cs ? Object.entries(cs.ratings) : [],
  );
  for (const p of [...homeXIPlayers, ...awayXIPlayers]) {
    if (!goalRatings.has(p.id)) goalRatings.set(p.id, { rating: 6.0, goals: 0 });
  }

  // Sorteio ponderado — jogadores mais agressivos tomam mais cartão (é
  // Agressividade que o FM liga a mais faltas/cartão, não Desarme puro).
  // Instrução individual de Entradas/Pressão (ver player-instructions.ts)
  // soma peso extra — jogador instruído a entrar duro toma mais cartão do que
  // sua Agressividade natural sozinha diria.
  function pickWeighted(players: PlayerLike[], instructionsByPlayerId?: Map<string, PlayerInstructions>): PlayerLike | undefined {
    if (players.length === 0) return undefined;
    const weights = players.map((p) => (p.attributes?.aggression ?? 10) + 5 + instructionCardWeight(instructionsByPlayerId?.get(p.id) ?? DEFAULT_INSTRUCTIONS));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < players.length; i++) {
      r -= weights[i];
      if (r <= 0) return players[i];
    }
    return players[players.length - 1];
  }

  const matchYellows = new Map<string, number>(cs ? Object.entries(cs.yellowCounts) : []);
  const cards: { playerId: string; type: "yellow" | "red" }[] = cs ? [...cs.cards] : [];
  const injuries: { playerId: string; days: number; type: string }[] = cs ? [...cs.injuries] : [];
  const sentOff = new Set<string>(cs?.sentOffIds ?? []);

  function giveCard(side: "home" | "away", minute: number, isDirectRed: boolean) {
    const pool = (side === "home" ? homeXIPlayers : awayXIPlayers).filter((p) => !sentOff.has(p.id));
    const player = pickWeighted(pool, side === "home" ? h.instructionsByPlayerId : a.instructionsByPlayerId);
    if (!player) return;
    const clubName = (side === "home" ? home : away).short_name ?? (side === "home" ? home : away).name;

    if (isDirectRed) {
      sentOff.add(player.id);
      cards.push({ playerId: player.id, type: "red" });
      events.push({
        minute, type: "red", side, playerId: player.id,
        text: `${minuteLabel(minute)}' 🟥 CARTÃO VERMELHO! ${player.name} é expulso do ${clubName}.`,
      });
      // VAR (Lei 6) — só vermelho DIRETO é revisável aqui (o automático de
      // 2º amarelo não passa por VAR, é decisão mecânica das 2 advertências
      // já confirmadas). Maioria das revisões CONFIRMA a expulsão.
      if (hasVar && rng() < VAR_RED_REVIEW_CHANCE) {
        if (rng() < VAR_RED_RESCIND_GIVEN_REVIEW) {
          sentOff.delete(player.id);
          cards.pop();
          events.push({
            minute, type: "var", side, playerId: player.id,
            text: `${minuteLabel(minute)}' 📺 VAR revisa o vermelho de ${player.name} — RESCINDIDO, ${player.name.split(" ").slice(-1)[0]} continua em campo.`,
          });
        } else {
          events.push({
            minute, type: "var", side, playerId: player.id,
            text: `${minuteLabel(minute)}' 📺 VAR confirma o cartão vermelho de ${player.name}.`,
          });
        }
      }
      return;
    }

    const prevYellows = matchYellows.get(player.id) ?? 0;
    matchYellows.set(player.id, prevYellows + 1);
    cards.push({ playerId: player.id, type: "yellow" });

    if (prevYellows + 1 >= 2) {
      // Segundo amarelo → expulso
      sentOff.add(player.id);
      cards.push({ playerId: player.id, type: "red" });
      events.push({
        minute, type: "red", side, playerId: player.id,
        text: `${minuteLabel(minute)}' 🟨🟥 Segundo amarelo pra ${player.name} (${clubName}) — expulso!`,
      });
    } else {
      events.push({
        minute, type: "yellow", side, playerId: player.id,
        text: `${minuteLabel(minute)}' 🟨 Cartão amarelo para ${player.name} (${clubName}).`,
      });
    }
  }

  function rollInjury(side: "home" | "away", minute: number) {
    const pool = (side === "home" ? homeXIPlayers : awayXIPlayers).filter((p) => !sentOff.has(p.id));
    if (pool.length === 0) return;
    // Jogador cansado (condição baixa — típico de calendário congestionado) tem
    // mais chance de ser o lesionado. Ver src/game/congestion.ts.
    const w = pool.map((p) => 1 + Math.max(0, (80 - (p.condition ?? 100)) / 18));
    const total = w.reduce((s, x) => s + x, 0);
    let r = rng() * total;
    let chosen: PlayerLike | undefined = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) { chosen = pool[i]; break; } }
    if (!chosen) return;
    const clubName = (side === "home" ? home : away).short_name ?? (side === "home" ? home : away).name;
    const { type, days } = rollInjuryType(rng);
    const typeLabel = { contusao: "Contusão", muscular: "Lesão muscular", ligamento: "Lesão de ligamento", fratura: "Fratura" }[type];
    injuries.push({ playerId: chosen.id, days, type });
    events.push({
      minute, type: "injury", side, playerId: chosen.id,
      text: `${minuteLabel(minute)}' 🩹 ${typeLabel}! ${chosen.name} (${clubName}) sente e deve desfalcar o time por cerca de ${days} dias.`,
    });
  }

  // Resolve UM gol — decide a origem (jogada / pênalti / falta / escanteio) e
  // credita o cobrador designado. Ver src/game/set-pieces.ts.
  function openPlayScorer(side: "home" | "away", excludeId?: string): PlayerLike | undefined {
    const drop = (p: PlayerLike) => !sentOff.has(p.id) && p.id !== excludeId;
    const attackers = (side === "home" ? homeAttackers : awayAttackers).filter(drop);
    const pool = attackers.length ? attackers : (side === "home" ? homeXIPlayers : awayXIPlayers).filter(drop);
    if (!pool.length) return undefined;
    const insById = side === "home" ? h.instructionsByPlayerId : a.instructionsByPlayerId;
    // Instrução individual de Finalização/Drible/Risco (ver
    // player-instructions.ts) soma peso extra — jogador instruído a chutar e
    // driblar mais participa mais das finalizações do time, mesmo sem mudar
    // de função.
    const w = pool.map((p) => (p.attributes?.finishing ?? 10) + (p.attributes?.off_the_ball ?? 10) * 0.6 + 4 + instructionScorerWeight(insById.get(p.id) ?? DEFAULT_INSTRUCTIONS));
    const total = w.reduce((s, x) => s + x, 0);
    let r = rng() * total;
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  function attemptGoal(side: "home" | "away", minute: number) {
    const isHome = side === "home";
    const club = isHome ? home : away;
    const clubName = club.short_name ?? club.name;
    const takers = isHome ? homeTakers : awayTakers;
    const xiAvail = (isHome ? homeXIPlayers : awayXIPlayers).filter((p) => !sentOff.has(p.id));
    if (xiAvail.length === 0) return;

    const bumpRating = (id: string | undefined, by: number) => {
      if (!id) return;
      const r = goalRatings.get(id);
      if (r) r.rating += by;
    };
    const score = (scorerId: string | undefined, text: string) => {
      if (isHome) homeScore++; else awayScore++;
      if (scorerId) {
        const r = goalRatings.get(scorerId);
        if (r) { r.goals++; r.rating += 1.0; }
      }
      const scorerName = scorerId ? (isHome ? homeXIPlayers : awayXIPlayers).find((p) => p.id === scorerId)?.name : undefined;
      events.push({ minute, type: "goal", side, playerId: scorerId, text: `${minuteLabel(minute)}' ${text} ${homeScore}-${awayScore}` });

      // VAR (Lei 6) — a maioria dos gols nem passa por revisão; da minoria
      // revisada, a maioria é CONFIRMADA (fiel à vida real). Só reverte de
      // verdade uma fração pequena — impedimento ou falta no lance.
      if (hasVar && rng() < VAR_GOAL_REVIEW_CHANCE) {
        if (rng() < VAR_GOAL_OVERTURN_GIVEN_REVIEW) {
          if (isHome) homeScore--; else awayScore--;
          if (scorerId) {
            const r = goalRatings.get(scorerId);
            if (r) { r.goals--; r.rating -= 1.0; }
          }
          const reason = rng() < 0.6 ? "impedimento" : "falta no início do lance";
          events.push({
            minute, type: "var", side, playerId: scorerId,
            text: `${minuteLabel(minute)}' 📺 VAR revisa o gol de ${scorerName ?? "—"} — ANULADO por ${reason}. ${homeScore}-${awayScore}`,
          });
        } else {
          events.push({
            minute, type: "var", side, playerId: scorerId,
            text: `${minuteLabel(minute)}' 📺 VAR revisa o gol de ${scorerName ?? "—"} — CONFIRMADO.`,
          });
        }
      }
    };
    const inXI = (p: PlayerLike | null): PlayerLike | null => (p && !sentOff.has(p.id) ? p : null);

    switch (rollGoalKind(rng)) {
      case "penalty": {
        const taker = inXI(takers.penalty) ?? openPlayScorer(side);
        if (rng() <= penaltyConversion(taker ?? null)) {
          score(taker?.id, `⚽ PÊNALTI! ${taker?.name ?? "O batedor"} bate bem e marca para o ${clubName}.`);
        } else {
          bumpRating(taker?.id, -0.9);
          events.push({ minute, type: "chance", side, playerId: taker?.id, text: `${minuteLabel(minute)}' 🚫 ${taker?.name ?? "O batedor"} PERDE o pênalti do ${clubName}!` });
          if (rng() < 0.28) {
            const reb = openPlayScorer(side);
            score(reb?.id, `⚽ No rebote, ${reb?.name ?? "o atacante"} empurra pra rede — ${clubName}.`);
          }
        }
        return;
      }
      case "free_kick": {
        const taker = inXI(takers.freeKick) ?? openPlayScorer(side);
        const fk = taker?.attributes?.free_kick_taking ?? 10;
        bumpRating(taker?.id, 0.3);
        // Vento/chuva/neve (Lei 1) atrapalham a precisão de bola parada —
        // ver src/game/match-context.ts::weatherCoefs.
        if (taker && rng() < (0.32 + (fk / 20) * 0.42) * wCoefs.setpiece) {
          score(taker.id, `⚽ GOLAÇO de falta de ${taker.name}! No ângulo, para o ${clubName}.`);
        } else {
          const other = openPlayScorer(side, taker?.id);
          score(other?.id, `⚽ GOL do ${clubName}! Na falta cobrada por ${taker?.name ?? "—"}, a bola sobra e ${other?.name ?? "o atacante"} completa.`);
        }
        return;
      }
      case "corner": {
        const taker = inXI(takers.corner);
        const header = bestBy(xiAvail.filter((p) => p.id !== taker?.id), headerScore) ?? openPlayScorer(side);
        bumpRating(taker?.id, 0.7); // "assistência" do escanteio
        score(header?.id, `⚽ GOL de cabeça de ${header?.name ?? "o zagueiro"}${taker ? `, após escanteio cobrado por ${taker.name}` : ""} — ${clubName}.`);
        return;
      }
      default: {
        const scorer = openPlayScorer(side);
        score(scorer?.id, `⚽ GOL do ${clubName}! ${scorer?.name ?? "Camisa 9"} marca.`);
      }
    }
  }

  // Back-pass (Lei 12, ver src/game/goalkeeper-rules.ts) — o goleiro do
  // clube QUE ERROU não é `benefitSide`, é o lado oposto. Tiro livre é
  // INDIRETO — nunca credita gol pra quem cobrou; só uma minoria das
  // cobranças vira gol de verdade, sempre via um segundo toque (cabeçada/
  // sobra), igual a regra exige.
  function resolveIndirectFreeKick(benefitSide: "home" | "away", minute: number) {
    const concededBy = benefitSide === "home" ? away : home;
    const benefitClub = benefitSide === "home" ? home : away;
    events.push({
      minute, type: "info", side: benefitSide,
      text: `${minuteLabel(minute)}' 🧤 Passe pra trás mal calculado do goleiro do ${concededBy.short_name ?? concededBy.name} — tiro livre indireto perigoso pro ${benefitClub.short_name ?? benefitClub.name}.`,
    });
    const isHome = benefitSide === "home";
    if (isHome) { shotsHome++; if (rng() < 0.4) onTargetHome++; } else { shotsAway++; if (rng() < 0.4) onTargetAway++; }
    if (rng() < 0.22 * wCoefs.setpiece) {
      const scorer = openPlayScorer(benefitSide);
      if (isHome) homeScore++; else awayScore++;
      if (scorer) {
        const r = goalRatings.get(scorer.id);
        if (r) { r.goals++; r.rating += 1.0; }
      }
      events.push({
        minute, type: "goal", side: benefitSide, playerId: scorer?.id,
        text: `${minuteLabel(minute)}' ⚽ GOL do ${benefitClub.short_name ?? benefitClub.name}! No segundo toque da cobrança, ${scorer?.name ?? "o atacante"} completa pra rede. ${homeScore}-${awayScore}`,
      });
    }
  }

  // Um minuto de jogo — extraído numa função porque o acréscimo (ver depois
  // do loop principal) precisa rodar esses mesmos rolls além de `endMinute`,
  // sem duplicar a lógica.
  function simulateMinute(minute: number) {
    // Impedimento (Lei 11, ver src/game/offside.ts) — sorteado ANTES do
    // resto do ataque desse lado nesse minuto. Quando pega, a jogada foi
    // anulada: os rolls de chute/escanteio/gol/chance desse lado ficam de
    // fora nesse minuto (senão o log mostraria "impedimento" e "GOL" juntos
    // pro mesmo lado no mesmo minuto, o que seria contraditório).
    if (rng() < homeOffsideChance) {
      const off = pickOffsidePlayer(homeAttackers.filter((p) => !sentOff.has(p.id)), rng);
      offsidesHome++;
      events.push({
        minute, type: "offside", side: "home", playerId: off?.id,
        text: `${minuteLabel(minute)}' 🚩 Impedimento marcado contra ${off?.name ?? "o atacante"} (${home.short_name ?? home.name}).`,
      });
    } else {
      if (rng() < homePerMin * 4.5) { shotsHome++; if (rng() < 0.42) onTargetHome++; }
      if (rng() < homePerMin * 2.5) cornersHome++;
      if (rng() < homePerMin) attemptGoal("home", minute);
      if (rng() < homePerMin * 1.5 && rng() < 0.3) {
        events.push({ minute, type: "chance", side: "home", text: `${minuteLabel(minute)}' ${tacticalChanceText(home, "home")}` });
      }
    }
    if (rng() < awayOffsideChance) {
      const off = pickOffsidePlayer(awayAttackers.filter((p) => !sentOff.has(p.id)), rng);
      offsidesAway++;
      events.push({
        minute, type: "offside", side: "away", playerId: off?.id,
        text: `${minuteLabel(minute)}' 🚩 Impedimento marcado contra ${off?.name ?? "o atacante"} (${away.short_name ?? away.name}).`,
      });
    } else {
      if (rng() < awayPerMin * 4.5) { shotsAway++; if (rng() < 0.42) onTargetAway++; }
      if (rng() < awayPerMin * 2.5) cornersAway++;
      if (rng() < awayPerMin) attemptGoal("away", minute);
      if (rng() < awayPerMin * 1.5 && rng() < 0.3) {
        events.push({ minute, type: "chance", side: "away", text: `${minuteLabel(minute)}' ${tacticalChanceText(away, "away")}` });
      }
    }

    // Regras de goleiro (Lei 12, ver src/game/goalkeeper-rules.ts). 8
    // segundos vira ESCANTEIO pro adversário (regra 2025/26, substituiu a
    // indireta antiga); back-pass vira indireta perigosa (resolveIndirectFreeKick).
    if (rng() < homeEightSecondChance) {
      cornersAway++;
      events.push({
        minute, type: "info", side: "away",
        text: `${minuteLabel(minute)}' ⏱️ Goleiro do ${home.short_name ?? home.name} passa dos 8 segundos com a bola nas mãos — escanteio pro ${away.short_name ?? away.name}.`,
      });
    }
    if (rng() < awayEightSecondChance) {
      cornersHome++;
      events.push({
        minute, type: "info", side: "home",
        text: `${minuteLabel(minute)}' ⏱️ Goleiro do ${away.short_name ?? away.name} passa dos 8 segundos com a bola nas mãos — escanteio pro ${home.short_name ?? home.name}.`,
      });
    }
    if (rng() < homeBackpassChance) resolveIndirectFreeKick("away", minute);
    if (rng() < awayBackpassChance) resolveIndirectFreeKick("home", minute);

    // Cartões — influência de pressão E do rigor do árbitro (ver
    // src/game/match-context.ts::refereeCoefs). Vermelho direto é raro; a
    // maioria vira amarelo (e amarelo duplo vira vermelho automático em giveCard()).
    const cardBase = 0.008 * refCoefs.cards;
    if (rng() < cardBase * h.coefs.cards) {
      foulsHome++;
      giveCard("home", minute, rng() < 0.06);
    }
    if (rng() < cardBase * a.coefs.cards) {
      foulsAway++;
      giveCard("away", minute, rng() < 0.06);
    }

    // Lesões — chance pequena por minuto, por time; sobe quando o XI está
    // cansado (calendário congestionado — ver src/game/congestion.ts) ou o
    // clima/gramado está ruim (já embutido em homeInjuryRate/awayInjuryRate).
    if (rng() < homeInjuryRate) rollInjury("home", minute);
    if (rng() < awayInjuryRate) rollInjury("away", minute);

    // Lance ruim do jogador fora de posição — dá chance extra ao adversário.
    if (homeMistakeProne.errorChance > 0 && rng() < homeMistakeProne.errorChance / 90) {
      shotsAway++;
      if (rng() < 0.5) onTargetAway++;
      events.push({
        minute, type: "chance", side: "away",
        text: `${minuteLabel(minute)}' Lance ruim de ${homeMistakeProne.player.name} (fora de posição) dá contra-ataque ao ${away.short_name ?? away.name}.`,
      });
    }
    if (awayMistakeProne.errorChance > 0 && rng() < awayMistakeProne.errorChance / 90) {
      shotsHome++;
      if (rng() < 0.5) onTargetHome++;
      events.push({
        minute, type: "chance", side: "home",
        text: `${minuteLabel(minute)}' Lance ruim de ${awayMistakeProne.player.name} (fora de posição) dá contra-ataque ao ${home.short_name ?? home.name}.`,
      });
    }

    // Textura tática (100% cosmética — ver bloco de precomputação acima e o
    // comentário grande em src/game/texture.ts). Nunca toca em xG/placar/
    // estatística; só empurra pra `texture`.
    if (rng() < pressWinChancePerMinute(homePressAvg)) {
      const pool = homeXIPlayers.filter((p) => !sentOff.has(p.id));
      const presser = pickPresser(pool, h.instructionsByPlayerId, rng);
      const victimPool = awayXIPlayers.filter((p) => !sentOff.has(p.id));
      const victim = victimPool[Math.floor(rng() * victimPool.length)];
      if (presser) texture.push({ minute, side: "home", kind: "press_win", playerId: presser.id, targetId: victim?.id });
    }
    if (rng() < pressWinChancePerMinute(awayPressAvg)) {
      const pool = awayXIPlayers.filter((p) => !sentOff.has(p.id));
      const presser = pickPresser(pool, a.instructionsByPlayerId, rng);
      const victimPool = homeXIPlayers.filter((p) => !sentOff.has(p.id));
      const victim = victimPool[Math.floor(rng() * victimPool.length)];
      if (presser) texture.push({ minute, side: "away", kind: "press_win", playerId: presser.id, targetId: victim?.id });
    }
    if (awayAttackers.length && rng() < markDuelChancePerMinute(homeMarkAvg)) {
      const attacker = awayAttackers[Math.floor(rng() * awayAttackers.length)];
      const markerPool = homeXIPlayers.filter((p) => !sentOff.has(p.id));
      const marker = markerPool[Math.floor(rng() * markerPool.length)];
      if (marker) {
        const won = markDuelWinner(marker, attacker, h.instructionsByPlayerId.get(marker.id)?.marking ?? 0, rng);
        texture.push({ minute, side: "home", kind: "marked_out", playerId: marker.id, targetId: attacker.id, won });
      }
    }
    if (homeAttackers.length && rng() < markDuelChancePerMinute(awayMarkAvg)) {
      const attacker = homeAttackers[Math.floor(rng() * homeAttackers.length)];
      const markerPool = awayXIPlayers.filter((p) => !sentOff.has(p.id));
      const marker = markerPool[Math.floor(rng() * markerPool.length)];
      if (marker) {
        const won = markDuelWinner(marker, attacker, a.instructionsByPlayerId.get(marker.id)?.marking ?? 0, rng);
        texture.push({ minute, side: "away", kind: "marked_out", playerId: marker.id, targetId: attacker.id, won });
      }
    }
    if (homeOverlapCandidate) {
      const ins = h.instructionsByPlayerId.get(homeOverlapCandidate.id) ?? DEFAULT_INSTRUCTIONS;
      if (rng() < overlapRunChance(ins.roamWidth, ins.roamDepth, diagramMag(h, homeOverlapCandidate.id))) {
        texture.push({ minute, side: "home", kind: "overlap_run", playerId: homeOverlapCandidate.id });
      }
    }
    if (awayOverlapCandidate) {
      const ins = a.instructionsByPlayerId.get(awayOverlapCandidate.id) ?? DEFAULT_INSTRUCTIONS;
      if (rng() < overlapRunChance(ins.roamWidth, ins.roamDepth, diagramMag(a, awayOverlapCandidate.id))) {
        texture.push({ minute, side: "away", kind: "overlap_run", playerId: awayOverlapCandidate.id });
      }
    }
    if (homeLongShotCandidate) {
      const ins = h.instructionsByPlayerId.get(homeLongShotCandidate.id) ?? DEFAULT_INSTRUCTIONS;
      if (rng() < longShotChance(ins.shoot, ins.risk, homeLongShotCandidate.attributes?.long_shots ?? 10)) {
        texture.push({ minute, side: "home", kind: "long_shot", playerId: homeLongShotCandidate.id });
      }
    }
    if (awayLongShotCandidate) {
      const ins = a.instructionsByPlayerId.get(awayLongShotCandidate.id) ?? DEFAULT_INSTRUCTIONS;
      if (rng() < longShotChance(ins.shoot, ins.risk, awayLongShotCandidate.attributes?.long_shots ?? 10)) {
        texture.push({ minute, side: "away", kind: "long_shot", playerId: awayLongShotCandidate.id });
      }
    }
    if (homeDribbleCandidate && awayXIPlayers.length) {
      const ins = h.instructionsByPlayerId.get(homeDribbleCandidate.id) ?? DEFAULT_INSTRUCTIONS;
      if (rng() < skillMoveChance(ins.dribble, homeDribbleCandidate.attributes?.dribbling ?? 10)) {
        const defPool = awayXIPlayers.filter((p) => !sentOff.has(p.id));
        const defender = defPool[Math.floor(rng() * defPool.length)];
        if (defender) {
          const won = skillMoveDuel(homeDribbleCandidate, defender, ins.dribble, rng);
          texture.push({ minute, side: "home", kind: "skill_move", playerId: homeDribbleCandidate.id, targetId: defender.id, won });
        }
      }
    }
    if (awayDribbleCandidate && homeXIPlayers.length) {
      const ins = a.instructionsByPlayerId.get(awayDribbleCandidate.id) ?? DEFAULT_INSTRUCTIONS;
      if (rng() < skillMoveChance(ins.dribble, awayDribbleCandidate.attributes?.dribbling ?? 10)) {
        const defPool = homeXIPlayers.filter((p) => !sentOff.has(p.id));
        const defender = defPool[Math.floor(rng() * defPool.length)];
        if (defender) {
          const won = skillMoveDuel(awayDribbleCandidate, defender, ins.dribble, rng);
          texture.push({ minute, side: "away", kind: "skill_move", playerId: awayDribbleCandidate.id, targetId: defender.id, won });
        }
      }
    }
  }

  for (let minute = startMinute; minute <= endMinute; minute++) simulateMinute(minute);

  // Acréscimo (Lei 7) — só nos limites reais de tempo (45'/90'), nunca nas
  // paradas intermediárias da barra tática ao vivo (15'/30'/60'/75'). Os
  // minutos extras são codificados como endMinute + n×0.01 (45.01, 45.02...)
  // — nunca colidem com a numeração real do próximo tempo, que sempre
  // recomeça limpo em 46/91 (ver minuteLabel() e o comentário dela no topo
  // do arquivo), então NADA precisa mudar no encadeamento de trechos em
  // src/lib/live-match.ts.
  // 105/120 = fim de cada tempo da prorrogação (ver src/game/cup.ts::
  // simulateExtraTimeFull, chamado só quando o mata-mata empata no agregado).
  const HALF_START: Record<number, number> = { 45: 1, 90: 46, 105: 91, 120: 106 };
  if (HALF_START[endMinute] !== undefined) {
    const halfStart = HALF_START[endMinute];
    const eventsInHalf = events.filter((e) => e.minute >= halfStart && e.minute <= endMinute);
    const stoppage = computeStoppageMinutes(eventsInHalf, referee.strictness, weather);
    events.push({
      minute: endMinute, type: "info", side: "home",
      text: `${endMinute}' 🔟 Acréscimo: +${stoppage} minuto${stoppage === 1 ? "" : "s"}.`,
    });
    for (let n = 1; n <= stoppage; n++) simulateMinute(endMinute + n * 0.01);
  }

  // Ordenar (o trecho novo pode intercalar com o anterior no limite do minuto)
  events.sort((x, y) => x.minute - y.minute);

  // Exatamente 90 (não ">="): prorrogação (ver src/game/cup.ts) chama esse
  // mesmo motor com endMinute 105/120 pra contar só os gols do tempo extra —
  // esse resumo/"Fim de jogo" com placar de 90 minutos não faz sentido ali.
  const final = endMinute === 90;
  if (final) {
    // Comentário estatístico — só faz sentido quando a partida realmente terminou.
    events.push({
      minute: 90, type: "chance", side: "home",
      text: `Estatísticas — Posse: ${possHome.toFixed(0)}% × ${(100 - possHome).toFixed(0)}% · Chutes: ${shotsHome}-${shotsAway} (${onTargetHome}-${onTargetAway} no alvo) · Escanteios: ${cornersHome}-${cornersAway}.`,
    });
    events.push({
      minute: 90,
      type: "chance",
      side: "home",
      text: `Fim de jogo. ${home.short_name ?? home.name} ${homeScore} x ${awayScore} ${away.short_name ?? away.name}.`,
    });

    // Suprime aleatoriedade extrema (proteção residual — a fórmula de xG já
    // mantém os placares realistas, isso aqui é só um teto de segurança).
    if (homeScore > 6) homeScore = 6;
    if (awayScore > 6) awayScore = 6;
  }

  const carryState: MatchCarryState = {
    homeScore, awayScore, shotsHome, shotsAway, onTargetHome, onTargetAway,
    cornersHome, cornersAway, foulsHome, foulsAway, offsidesHome, offsidesAway,
    events, cards, injuries,
    sentOffIds: [...sentOff], yellowCounts: Object.fromEntries(matchYellows),
    ratings: Object.fromEntries(goalRatings),
    texture,
  };

  const result: MatchResult = {
    homeScore,
    awayScore,
    events,
    homeAttackRating: h.attack,
    awayAttackRating: a.attack,
    homeFatigue: h.coefs.fatigue,
    awayFatigue: a.coefs.fatigue,
    stats: {
      possession: Math.round(possHome),
      shotsHome, shotsAway,
      onTargetHome, onTargetAway,
      cornersHome, cornersAway,
      foulsHome, foulsAway,
      offsidesHome, offsidesAway,
    },
    ratings: [...goalRatings.entries()].map(([playerId, v]) => ({ playerId, ...v })),
    cards,
    injuries,
    homeFormation: home.formation ?? "4-3-3",
    awayFormation: away.formation ?? "4-3-3",
    homeLineup: h.xi.entries.map((e) => ({
      slot: e.slot.slot, playerId: e.player.id, playerName: e.player.name,
      roleKey: h.roleByPlayerId.get(e.player.id)?.key,
      instructions: h.instructionsByPlayerId.get(e.player.id),
      teamFluidity: home.team_fluidity,
      posX: e.slot.x, posY: e.slot.y,
    })),
    awayLineup: a.xi.entries.map((e) => ({
      slot: e.slot.slot, playerId: e.player.id, playerName: e.player.name,
      roleKey: a.roleByPlayerId.get(e.player.id)?.key,
      instructions: a.instructionsByPlayerId.get(e.player.id),
      teamFluidity: away.team_fluidity,
      posX: e.slot.x, posY: e.slot.y,
    })),
    referee: { name: referee.name, strictness: referee.strictness },
    weather: { label: weather.label },
    texture,
  };

  return { result, carryState, rng, final };
}

export function simulateMatch(
  home: ClubLike,
  away: ClubLike,
  homePlayers: PlayerLike[],
  awayPlayers: PlayerLike[],
  opts: SimulateOptions = {},
): MatchResult {
  return simulateMatchSegment(home, away, homePlayers, awayPlayers, opts).result;
}

function clamp01(n: number): number { return Math.max(15, Math.min(85, n)); }

function tacticFlavor(c: ClubLike): string {
  const m = c.mentality ?? "balanced";
  const t = m === "attacking" ? "postura ofensiva" : m === "defensive" ? "postura cautelosa" : "postura equilibrada";
  const p = (c.pressing ?? 3) >= 4 ? ", pressão alta" : (c.pressing ?? 3) <= 2 ? ", bloco baixo" : "";
  return t + p;
}
function tacticalChanceText(c: ClubLike, side: "home" | "away"): string {
  const name = c.short_name ?? c.name;
  const p = c.pressing ?? 3;
  const l = c.defensive_line ?? 3;
  if (p >= 4) return `Pressão alta do ${name} gera boa chance, mas o goleiro defende.`;
  if (l <= 2) return `${name} arma o contra-ataque; goleiro adversário aparece bem.`;
  if ((c.passing_style ?? "mixed") === "short") return `Troca de passes do ${name} termina em finalização defendida.`;
  return `Grande chance para o ${name}, goleiro defende.`;
}

// -----------------------------------------------------------------------------
// Simulação rápida (sem elencos completos) — fallback para clubes sem players
// -----------------------------------------------------------------------------
export function simulateQuick(
  homeRating: number,
  awayRating: number,
  seed: string,
  opts: { homeMentality?: Mentality; awayMentality?: Mentality; minutes?: number } = {},
): { homeScore: number; awayScore: number } {
  const rng = mulberry32(hashSeed(seed));
  const mH = opts.homeMentality === "attacking" ? 1.12 : opts.homeMentality === "defensive" ? 0.9 : 1;
  const mA = opts.awayMentality === "attacking" ? 1.12 : opts.awayMentality === "defensive" ? 0.9 : 1;
  // Mesma base do simulateMatch: razão entre ratings, não diferença linear —
  // times parelhos ficam perto da média real de gols, mismatches grandes não
  // explodem pra placares de 7-8 gols.
  const homeXG = xgFromRatio(homeRating, awayRating, 1.08 * mH); // 1.08 ≈ vantagem leve de mando
  const awayXG = xgFromRatio(awayRating, homeRating, mA);
  // `minutes` < 90 (ex.: 30 pra prorrogação — ver src/game/cup.ts) só encurta
  // o loop; a taxa por minuto continua ancorada no xG de 90 minutos, então
  // o período mais curto naturalmente rende menos gols esperados, na proporção certa.
  const minutes = opts.minutes ?? 90;
  const goals = (xg: number) => {
    let g = 0;
    const perMin = xg / 90;
    for (let i = 0; i < minutes; i++) if (rng() < perMin) g++;
    return Math.min(g, 6);
  };
  return { homeScore: goals(homeXG), awayScore: goals(awayXG) };
}
