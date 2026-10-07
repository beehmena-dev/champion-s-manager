// -----------------------------------------------------------------------------
// Layout FIXO do anel de snapshots da encenação 2D (ver engine.worker.ts).
// Total 4.672 bytes: cabeçalho 64 B + 16 slots × 288 B. O mesmo formato de
// slot é usado tanto no SharedArrayBuffer quanto no fallback por postMessage
// (o worker manda os mesmos 288 bytes) — ver snapshot-source.ts.
// -----------------------------------------------------------------------------

export const MAGIC = 0x464d0004; // "FM" + versão 4
export const HEADER_BYTES = 64;
export const HEADER_WORDS = 16;
export const RING_SLOTS = 16;
export const SLOT_BYTES = 288;
export const SLOT_WORDS = 72;
export const SAB_BYTES = HEADER_BYTES + RING_SLOTS * SLOT_BYTES; // 4672
export const MAX_PLAYERS = 22;

/** Índices (em palavras de 32 bits) do cabeçalho. */
export const H = { MAGIC: 0, WRITE: 1, RING: 2, SLOT_BYTES: 3, STATE: 4, SPEED: 5, SEED_LO: 6, SEED_HI: 7 } as const;
/** Índices (em palavras de 32 bits) dentro de um slot. */
export const S = {
  TICK: 0, TIME_MS: 1, SCORE: 2, PHASES: 3, RED_MASK: 4,
  BALL: 5, PLAYERS: 8, CARDS: 52, POSS_HOME: 53, POSS_AWAY: 54, TACTICS: 55,
  /** Reservado [56..71] — usamos só o [56]: instante real (ms desde a base
   * combinada com a main) em que o snapshot deve ser exibido. Necessário pro
   * interpolador, que trabalha em tempo real e não em tempo de jogo. */
  REAL_MS: 56,
} as const;

export const ENGINE_STATE = { STOPPED: 0, RUNNING: 1, PAUSED: 2, ENDED: 3 } as const;

export interface Snapshot {
  tick: number;
  timeMs: number;
  homeScore: number;
  awayScore: number;
  phases: number;
  redMask: number;
  ballX: number; ballY: number; ballZ: number;
  px: Float32Array; py: Float32Array; // 22 jogadores, ordem do roster
  cards: Uint8Array; // [amarelos casa, vermelhos casa, amarelos visit., vermelhos visit.]
  possHome: number; possAway: number;
  tactics: number;
  realMs: number;
}

export function makeSnapshot(): Snapshot {
  return {
    tick: 0, timeMs: 0, homeScore: 0, awayScore: 0, phases: 0, redMask: 0,
    ballX: 50, ballY: 50, ballZ: 0,
    px: new Float32Array(MAX_PLAYERS), py: new Float32Array(MAX_PLAYERS),
    cards: new Uint8Array(4), possHome: 0, possAway: 0, tactics: 0, realMs: 0,
  };
}

/** Grava `s` no slot começando na palavra `base` (sem alocar). */
export function encodeSnapshot(i32: Int32Array, f32: Float32Array, base: number, s: Snapshot): void {
  i32[base + S.TICK] = s.tick;
  i32[base + S.TIME_MS] = s.timeMs;
  i32[base + S.SCORE] = (s.homeScore & 0xff) | ((s.awayScore & 0xff) << 8);
  i32[base + S.PHASES] = s.phases;
  i32[base + S.RED_MASK] = s.redMask;
  f32[base + S.BALL] = s.ballX; f32[base + S.BALL + 1] = s.ballY; f32[base + S.BALL + 2] = s.ballZ;
  for (let i = 0; i < MAX_PLAYERS; i++) {
    f32[base + S.PLAYERS + i * 2] = s.px[i];
    f32[base + S.PLAYERS + i * 2 + 1] = s.py[i];
  }
  i32[base + S.CARDS] = s.cards[0] | (s.cards[1] << 8) | (s.cards[2] << 16) | (s.cards[3] << 24);
  i32[base + S.POSS_HOME] = s.possHome;
  i32[base + S.POSS_AWAY] = s.possAway;
  i32[base + S.TACTICS] = s.tactics;
  i32[base + S.REAL_MS] = s.realMs;
}

/** Lê o slot começando na palavra `base` pra dentro de `out` (sem alocar). */
export function decodeSnapshot(i32: Int32Array, f32: Float32Array, base: number, out: Snapshot): Snapshot {
  out.tick = i32[base + S.TICK];
  out.timeMs = i32[base + S.TIME_MS];
  const sc = i32[base + S.SCORE];
  out.homeScore = sc & 0xff; out.awayScore = (sc >> 8) & 0xff;
  out.phases = i32[base + S.PHASES];
  out.redMask = i32[base + S.RED_MASK];
  out.ballX = f32[base + S.BALL]; out.ballY = f32[base + S.BALL + 1]; out.ballZ = f32[base + S.BALL + 2];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    out.px[i] = f32[base + S.PLAYERS + i * 2];
    out.py[i] = f32[base + S.PLAYERS + i * 2 + 1];
  }
  const c = i32[base + S.CARDS];
  out.cards[0] = c & 0xff; out.cards[1] = (c >> 8) & 0xff; out.cards[2] = (c >> 16) & 0xff; out.cards[3] = (c >>> 24) & 0xff;
  out.possHome = i32[base + S.POSS_HOME];
  out.possAway = i32[base + S.POSS_AWAY];
  out.tactics = i32[base + S.TACTICS];
  out.realMs = i32[base + S.REAL_MS];
  return out;
}

export function slotBase(seq: number): number {
  return HEADER_WORDS + (seq % RING_SLOTS) * SLOT_WORDS;
}

/** Mensagens main → worker. */
export type EngineCommand =
  | { type: "init"; sab: SharedArrayBuffer | null; baseEpoch: number; seed: number }
  | { type: "data"; data: StagingData }
  | { type: "clock"; minute: number; rate: number; reset: boolean }
  | { type: "stop" };

/** Mensagens worker → main. */
export type EngineMessage =
  | { type: "roster"; ids: string[]; sides: ("home" | "away")[]; names: string[]; slots: string[] }
  | { type: "snap"; seq: number; buf: ArrayBuffer };

export interface StagingData {
  homeLineup: any[]; awayLineup: any[];
  homeFormation: string; awayFormation: string;
  events: any[]; possession: number; texture: any[];
}
