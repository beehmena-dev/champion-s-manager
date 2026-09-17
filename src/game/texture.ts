import type { PlayerLike } from "./types";
import type { PlayerAttributes } from "./attributes";
import { DEFAULT_INSTRUCTIONS, type PlayerInstructions } from "./player-instructions";

// -----------------------------------------------------------------------------
// Textura tática — Fase 1 do motor mais granular (2026-09-12). O motor
// principal (simulation.ts) já decide eventos discretos por sorteio ponderado
// (gol/chance/cartão/lesão/impedimento), mas 6 dos 9 campos de
// player-instructions.ts (pressão/marcação/liberdade de avanço/abertura) e o
// `signature`/`diagram` de cada função (roles.ts) nunca influenciavam nada
// minuto a minuto — só entravam numa nota agregada pré-jogo. Este módulo
// aproveita esse peso já calculado pra gerar "micro-eventos" de textura.
//
// DECISÃO DO USUÁRIO (2026-09-12, antes de implementar): estes eventos ficam
// 100% COSMÉTICOS nesta fase — nunca alteram xG, placar, chutes ou qualquer
// outra estatística existente, e não aparecem no log de texto da partida.
// São só guardados (`MatchResult.texture`) pra alimentar o visual (2D/3D)
// numa fase futura. Por isso as funções aqui são puras e não têm nenhum
// acoplamento com o resto do motor além de ler PlayerLike/PlayerInstructions.
// -----------------------------------------------------------------------------

const at = (p: PlayerLike, k: keyof PlayerAttributes): number => p.attributes?.[k] ?? 10;

export type TextureKind = "press_win" | "marked_out" | "overlap_run" | "long_shot" | "skill_move";

export interface TextureEvent {
  minute: number;
  side: "home" | "away";
  kind: TextureKind;
  playerId: string;
  targetId?: string;
  won?: boolean;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function weightedPick<T>(items: T[], weights: number[], rng: () => number): T | undefined {
  if (!items.length) return undefined;
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// --- Pressão -----------------------------------------------------------------

/** Chance por minuto de o time recuperar a bola por pressão coordenada — usa
 *  a instrução `pressing` (antes só entrava em instructionTacticalDelta,
 *  nunca influenciava nada minuto a minuto). */
export function pressWinChancePerMinute(teamPressAvg: number): number {
  return 0.004 * (1 + teamPressAvg * 0.35);
}

/** Sorteia quem ganhou a disputa de pressão dentro do time — Vigor Físico +
 *  Agressividade natural, com a instrução individual de Pressão pesando mais. */
export function pickPresser(
  pool: PlayerLike[], insByPlayerId: Map<string, PlayerInstructions>, rng: () => number,
): PlayerLike | undefined {
  const weights = pool.map((p) => {
    const ins = insByPlayerId.get(p.id) ?? DEFAULT_INSTRUCTIONS;
    return at(p, "work_rate") * 0.6 + at(p, "aggression") * 0.4 + Math.max(0, ins.pressing) * 3 + 1;
  });
  return weightedPick(pool, weights, rng);
}

// --- Marcação ------------------------------------------------------------

/** Chance por minuto de uma disputa de marcação individual acontecer — usa a
 *  instrução `marking` do lado que defende. */
export function markDuelChancePerMinute(teamMarkAvg: number): number {
  return 0.005 * (1 + Math.max(0, teamMarkAvg) * 0.4);
}

/** Disputa de marcação: Marcação/Posicionamento do marcador (+ instrução de
 *  marcação) contra Drible/Movimentação Sem Bola/Instinto do marcado. `true`
 *  = o marcador venceu (atacante fica sem espaço). */
export function markDuelWinner(
  marker: PlayerLike, attacker: PlayerLike, markingIns: number, rng: () => number,
): boolean {
  const markScore = Math.max(0, markingIns) * 3 + at(marker, "marking") + at(marker, "positioning");
  const evadeScore = at(attacker, "dribbling") + at(attacker, "off_the_ball") + at(attacker, "flair") * 0.5;
  return rng() < markScore / Math.max(1, markScore + evadeScore);
}

// --- Corrida de apoio --------------------------------------------------------

/** Chance por minuto de uma corrida de apoio (lateral sobe, meia chega na
 *  área) — usa roamWidth/roamDepth (mortos fora do pré-jogo) + a magnitude do
 *  vetor de diagrama da função (hoje só decorativo na tela de tática). */
export function overlapRunChance(roamWidth: number, roamDepth: number, diagramMag: number): number {
  return 0.006 * (1 + (roamWidth + roamDepth) * 0.4) * (0.4 + clamp01(diagramMag / 60));
}

// --- Chute de fora da área ----------------------------------------------------

/** Chance por minuto de um chute de longe — usa as instruções de
 *  finalização/risco + o atributo Chute de Longe. */
export function longShotChance(shootIns: number, riskIns: number, longShotsAttr: number): number {
  const skillFactor = 0.4 + longShotsAttr / 20;
  return 0.003 * (1 + Math.max(0, shootIns) * 0.5 + Math.max(0, riskIns) * 0.3) * skillFactor;
}

// --- Drible --------------------------------------------------------------

/** Chance por minuto de uma tentativa de drible individual — usa a instrução
 *  `dribble` + o atributo Drible. */
export function skillMoveChance(dribbleIns: number, dribblingAttr: number): number {
  return 0.0035 * (1 + Math.max(0, dribbleIns) * 0.6) * (0.4 + dribblingAttr / 20);
}

/** Disputa de drible: Drible/Agilidade/Instinto do driblador (+ instrução)
 *  contra Carrinho/Marcação do defensor mais próximo. `true` = o driblador
 *  venceu. */
export function skillMoveDuel(
  dribbler: PlayerLike, defender: PlayerLike, dribbleIns: number, rng: () => number,
): boolean {
  const attScore = Math.max(0, dribbleIns) * 2.5 + at(dribbler, "dribbling") + at(dribbler, "agility") * 0.6 + at(dribbler, "flair") * 0.6;
  const defScore = at(defender, "tackling") + at(defender, "marking") * 0.6;
  return rng() < attScore / Math.max(1, attScore + defScore);
}
