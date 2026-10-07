/// <reference lib="webworker" />
// -----------------------------------------------------------------------------
// Worker da ENCENAÇÃO 2D. O motor de decisão (simulation.ts, por minuto)
// NÃO roda aqui e não muda — o resultado já vem pronto. Aqui só roda a
// camada visual (live-positions.ts + position-motion.ts) num tick fixo de
// 100ms (10 Hz) e publica, logo depois de cada tick, 6 snapshots adiantados
// (0/17/33/50/67/83 ms) do intervalo seguinte — 60/s no SAB, 30/s (só os
// pares) no fallback por postMessage.
//
// Limitação conhecida: computePlayerPositions (código de encenação existente)
// ainda aloca objetos a cada chamada — o invariante "zero alocação no tick"
// só vale pra parte nova (escrita no anel). Zerar isso exige reescrever
// live-positions.ts, fora do escopo desta fase.
// -----------------------------------------------------------------------------
import { computeBallPosition, computePlayerPositions } from "./live-positions";
import { applySeparation, stepPlayerMotion, type PlayerMotionState } from "./position-motion";
import {
  H, ENGINE_STATE, HEADER_WORDS, MAX_PLAYERS, RING_SLOTS, SLOT_WORDS, MAGIC, SLOT_BYTES,
  encodeSnapshot, makeSnapshot, slotBase, type EngineCommand, type StagingData,
} from "./engine-sab";

const TICK_MS = 100;
const SUB = 6;

let i32: Int32Array; let f32: Float32Array; let useSab = false;
let baseEpoch = 0;
let data: StagingData | null = null;
let minute = 0; let rate = 0;
let seq = 0; let tick = 0;
const motion = new Map<string, PlayerMotionState>();
let rosterKey = "";
let ids: string[] = [];
const curX = new Float32Array(MAX_PLAYERS), curY = new Float32Array(MAX_PLAYERS);
const nxtX = new Float32Array(MAX_PLAYERS), nxtY = new Float32Array(MAX_PLAYERS);
let curBX = 50, curBY = 50, nxtBX = 50, nxtBY = 50;
let hasCur = false;
const snap = makeSnapshot();
// Buffer local do fallback (mesmo layout de slot).
const localBuf = new ArrayBuffer(HEADER_WORDS * 4 + RING_SLOTS * SLOT_WORDS * 4);

function nowRel() { return performance.timeOrigin + performance.now() - baseEpoch; }

/** Estado da encenação em `m`, avançando a física `dt` segundos. */
function stageAt(m: number, dt: number, outX: Float32Array, outY: Float32Array): { bx: number; by: number } {
  const d = data!;
  const dots = computePlayerPositions(
    d.homeLineup, d.awayLineup, (d.homeFormation || "4-3-3") as any, (d.awayFormation || "4-3-3") as any,
    m, d.events, d.possession, d.texture,
  );
  const key = dots.map((x) => x.playerId).join("|");
  if (key !== rosterKey) {
    rosterKey = key;
    ids = dots.slice(0, MAX_PLAYERS).map((x) => x.playerId);
    (self as any).postMessage({
      type: "roster", ids,
      sides: dots.slice(0, MAX_PLAYERS).map((x) => x.side),
      names: dots.slice(0, MAX_PLAYERS).map((x) => x.playerName),
      slots: dots.slice(0, MAX_PLAYERS).map((x) => x.slot),
    });
  }
  const pts = dots.slice(0, MAX_PLAYERS).map((t) => {
    let s = motion.get(t.playerId);
    if (!s) s = { x: t.x, y: t.y, vx: 0, vy: 0 };
    else if (dt > 0) s = stepPlayerMotion(s, t, dt);
    motion.set(t.playerId, s);
    return { id: t.playerId, x: s.x, y: s.y };
  });
  const sep = applySeparation(pts);
  for (let i = 0; i < MAX_PLAYERS; i++) {
    outX[i] = sep[i]?.x ?? -100; outY[i] = sep[i]?.y ?? -100;
  }
  const b = computeBallPosition(d.events, m, d.possession, d.homeLineup, d.awayLineup, d.homeFormation as any, d.awayFormation as any);
  return { bx: b.x, by: b.y };
}

function fillMatchState(m: number) {
  let hs = 0, as = 0, yh = 0, rh = 0, ya = 0, ra = 0, redMask = 0;
  const evs = data!.events;
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    if (e.minute > m) continue;
    const home = e.side === "home";
    if (e.type === "goal") { if (home) hs++; else as++; }
    else if (e.type === "yellow") { if (home) yh++; else ya++; }
    else if (e.type === "red") {
      if (home) rh++; else ra++;
      const idx = ids.indexOf(e.playerId);
      if (idx >= 0) redMask |= 1 << idx;
    }
  }
  snap.homeScore = hs; snap.awayScore = as; snap.redMask = redMask;
  snap.cards[0] = yh; snap.cards[1] = rh; snap.cards[2] = ya; snap.cards[3] = ra;
}

function publish(s: typeof snap) {
  if (useSab) {
    encodeSnapshot(i32, f32, slotBase(seq), s);
    Atomics.store(i32, H.WRITE, seq + 1);
  } else {
    const li = new Int32Array(localBuf), lf = new Float32Array(localBuf);
    const base = slotBase(seq);
    encodeSnapshot(li, lf, base, s);
    const out = localBuf.slice(base * 4, base * 4 + SLOT_BYTES);
    (self as any).postMessage({ type: "snap", seq, buf: out }, [out]);
  }
  seq++;
}

function doTick() {
  if (!data) return;
  const dtGame = (TICK_MS / 1000) * rate; // minutos de jogo neste intervalo
  if (!hasCur) {
    const b = stageAt(minute, 0, curX, curY); curBX = b.bx; curBY = b.by; hasCur = true;
  }
  const nextMin = minute + dtGame;
  const b = stageAt(nextMin, rate > 0 ? TICK_MS / 1000 : 0, nxtX, nxtY);
  nxtBX = b.bx; nxtBY = b.by;

  const t0 = nowRel();
  for (let k = 0; k < SUB; k++) {
    if (!useSab && k % 2 === 1) { continue; } // 30/s no fallback
    const a = k / SUB;
    const m = minute + dtGame * a;
    snap.tick = tick; snap.timeMs = Math.round(m * 60000);
    snap.realMs = Math.round(t0 + (TICK_MS * k) / SUB);
    for (let i = 0; i < MAX_PLAYERS; i++) {
      snap.px[i] = curX[i] + (nxtX[i] - curX[i]) * a;
      snap.py[i] = curY[i] + (nxtY[i] - curY[i]) * a;
    }
    snap.ballX = curBX + (nxtBX - curBX) * a; snap.ballY = curBY + (nxtBY - curBY) * a; snap.ballZ = 0;
    fillMatchState(m);
    publish(snap);
  }
  curX.set(nxtX); curY.set(nxtY); curBX = nxtBX; curBY = nxtBY;
  minute = nextMin; tick++;
  if (useSab) {
    i32[H.STATE] = rate > 0 ? ENGINE_STATE.RUNNING : ENGINE_STATE.PAUSED;
    i32[H.SPEED] = Math.round(rate * 1000);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

self.onmessage = (ev: MessageEvent<EngineCommand>) => {
  const msg = ev.data;
  if (msg.type === "init") {
    baseEpoch = msg.baseEpoch;
    if (msg.sab) {
      useSab = true; i32 = new Int32Array(msg.sab); f32 = new Float32Array(msg.sab);
      i32[H.MAGIC] = MAGIC; i32[H.RING] = RING_SLOTS; i32[H.SLOT_BYTES] = SLOT_BYTES;
      i32[H.SEED_LO] = msg.seed | 0; i32[H.SEED_HI] = 0;
    }
    if (!timer) timer = setInterval(doTick, TICK_MS);
  } else if (msg.type === "data") {
    data = msg.data; motion.clear(); hasCur = false; rosterKey = "";
  } else if (msg.type === "clock") {
    minute = msg.minute; rate = msg.rate;
    if (msg.reset) { motion.clear(); hasCur = false; }
  } else if (msg.type === "stop") {
    if (timer) clearInterval(timer); timer = null;
    if (useSab) i32[H.STATE] = ENGINE_STATE.ENDED;
  }
};
