import {
  H, HEADER_WORDS, RING_SLOTS, SAB_BYTES, SLOT_WORDS, MAGIC, SLOT_BYTES,
  decodeSnapshot, slotBase, type Snapshot, type EngineMessage,
} from "./engine-sab";

// -----------------------------------------------------------------------------
// Fonte única de snapshots pro campo 2D. O campo só conhece esta interface —
// não sabe se por baixo é SharedArrayBuffer (alvo real, 60/s) ou o fallback
// por postMessage (30/s, mesmo formato de 288 bytes por slot).
// -----------------------------------------------------------------------------

export interface SnapshotSource {
  readonly kind: "sab" | "message";
  /** Índice (seq) do snapshot mais novo, ou -1 se nada chegou ainda. */
  latestSeq(): number;
  readLatest(out: Snapshot): Snapshot | null;
  readByIndex(seq: number, out: Snapshot): Snapshot | null;
  /** Repassa mensagens do worker (só a MessageSource usa). */
  onWorkerMessage(msg: EngineMessage): void;
}

export class SabSource implements SnapshotSource {
  readonly kind = "sab" as const;
  readonly i32: Int32Array;
  readonly f32: Float32Array;
  constructor(readonly sab: SharedArrayBuffer) {
    this.i32 = new Int32Array(sab);
    this.f32 = new Float32Array(sab);
    this.i32[H.MAGIC] = MAGIC;
    this.i32[H.RING] = RING_SLOTS;
    this.i32[H.SLOT_BYTES] = SLOT_BYTES;
  }
  latestSeq() { return Atomics.load(this.i32, H.WRITE) - 1; }
  readLatest(out: Snapshot) { return this.readByIndex(this.latestSeq(), out); }
  readByIndex(seq: number, out: Snapshot) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const w = Atomics.load(this.i32, H.WRITE);
      if (seq < 0 || seq >= w || w - seq >= RING_SLOTS - 1) return null;
      decodeSnapshot(this.i32, this.f32, slotBase(seq), out);
      // Escritor avançou demais no meio da cópia → slot pode ter sido sobrescrito.
      if (Atomics.load(this.i32, H.WRITE) - seq < RING_SLOTS - 1) return out;
    }
    return null;
  }
  onWorkerMessage() {}
}

export class MessageSource implements SnapshotSource {
  readonly kind = "message" as const;
  private buf = new ArrayBuffer(HEADER_WORDS * 4 + RING_SLOTS * SLOT_WORDS * 4);
  private i32 = new Int32Array(this.buf);
  private f32 = new Float32Array(this.buf);
  private slotSeq = new Int32Array(RING_SLOTS).fill(-1);
  private write = 0;
  latestSeq() { return this.write - 1; }
  readLatest(out: Snapshot) { return this.readByIndex(this.write - 1, out); }
  readByIndex(seq: number, out: Snapshot) {
    if (seq < 0 || this.slotSeq[seq % RING_SLOTS] !== seq) return null;
    return decodeSnapshot(this.i32, this.f32, slotBase(seq), out);
  }
  onWorkerMessage(msg: EngineMessage) {
    if (msg.type !== "snap") return;
    const src = new Int32Array(msg.buf);
    this.i32.set(src, slotBase(msg.seq));
    this.slotSeq[msg.seq % RING_SLOTS] = msg.seq;
    if (msg.seq + 1 > this.write) this.write = msg.seq + 1;
  }
}

/** SAB primeiro; se o navegador não permitir, cai pro postMessage. */
export function createSnapshotSource(): SnapshotSource {
  try {
    if (typeof SharedArrayBuffer !== "undefined" && (globalThis as any).crossOriginIsolated) {
      return new SabSource(new SharedArrayBuffer(SAB_BYTES));
    }
  } catch { /* cai pro fallback */ }
  return new MessageSource();
}
