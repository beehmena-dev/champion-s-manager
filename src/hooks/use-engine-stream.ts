import { useEffect, useRef, useState } from "react";
import type { MatchResult } from "@/game/types";
import type { LiveDot } from "@/game/live-positions";
import { makeSnapshot, MAX_PLAYERS, RING_SLOTS, type EngineMessage } from "@/game/engine-sab";
import { createSnapshotSource, MessageSource, SabSource, type SnapshotSource } from "@/game/snapshot-source";

// -----------------------------------------------------------------------------
// Lado da main: cria o worker da encenação uma vez, envia dados/relógio, e a
// cada quadro (requestAnimationFrame) lê a SnapshotSource e interpola entre
// os 2 snapshots vizinhos do instante de exibição. Não tem motor nenhum aqui.
// -----------------------------------------------------------------------------

const RENDER_DELAY_MS = 50; // desenha um pouco atrás do mais novo (folga de jitter)

export interface EngineFrame { dots: LiveDot[]; ball: { x: number; y: number }; }

export function useEngineStream({ result, effMin, rate, resetKey }: {
  result: MatchResult; effMin: number; rate: number; resetKey: string;
}) {
  const workerRef = useRef<Worker | null>(null);
  const sourceRef = useRef<SnapshotSource | null>(null);
  const baseRef = useRef(0);
  const rosterRef = useRef<{ ids: string[]; sides: ("home" | "away")[]; names: string[]; slots: string[] } | null>(null);
  const effMinRef = useRef(effMin); effMinRef.current = effMin;
  const rateRef = useRef(rate); rateRef.current = rate;
  const [frame, setFrame] = useState<EngineFrame | null>(null);
  const [fps, setFps] = useState(0);
  const [compat, setCompat] = useState(false);

  // Cria worker + fonte (uma vez).
  useEffect(() => {
    let source = createSnapshotSource();
    const worker = new Worker(new URL("../game/engine.worker.ts", import.meta.url), { type: "module" });
    baseRef.current = performance.timeOrigin + performance.now();
    worker.onmessage = (ev: MessageEvent<EngineMessage>) => {
      const m = ev.data;
      if (m.type === "roster") rosterRef.current = m;
      else sourceRef.current?.onWorkerMessage(m);
    };
    try {
      worker.postMessage({ type: "init", sab: source instanceof SabSource ? source.sab : null, baseEpoch: baseRef.current, seed: 0 });
    } catch {
      // Envio do SAB recusado (sem isolamento) → fallback automático.
      source = createSnapshotSourceFallback();
      worker.postMessage({ type: "init", sab: null, baseEpoch: baseRef.current, seed: 0 });
    }
    sourceRef.current = source;
    setCompat(source.kind === "message");
    workerRef.current = worker;
    return () => { worker.postMessage({ type: "stop" }); worker.terminate(); workerRef.current = null; };
  }, []);

  // Dados da encenação.
  useEffect(() => {
    workerRef.current?.postMessage({
      type: "data",
      data: {
        homeLineup: result.homeLineup ?? [], awayLineup: result.awayLineup ?? [],
        homeFormation: result.homeFormation ?? "4-3-3", awayFormation: result.awayFormation ?? "4-3-3",
        events: result.events ?? [], possession: result.stats?.possession ?? 50, texture: result.texture ?? [],
      },
    });
    workerRef.current?.postMessage({ type: "clock", minute: effMinRef.current, rate: rateRef.current, reset: true });
  }, [result]);

  // Corte (troca de lance/reprise) → reset; mudança de ritmo/pausa → sem reset.
  useEffect(() => {
    workerRef.current?.postMessage({ type: "clock", minute: effMinRef.current, rate, reset: true });
  }, [resetKey]);
  useEffect(() => {
    workerRef.current?.postMessage({ type: "clock", minute: effMinRef.current, rate, reset: false });
  }, [rate]);
  // Ressincroniza o relógio da encenação com o relógio do HUD (evita deriva).
  useEffect(() => {
    let lastM = effMinRef.current, lastT = performance.now();
    const t = setInterval(() => {
      const now = performance.now(), m = effMinRef.current;
      const measured = Math.max(0, Math.min(10, (m - lastM) / ((now - lastT) / 1000)));
      lastM = m; lastT = now;
      const r = rateRef.current > 0 ? measured : 0;
      workerRef.current?.postMessage({ type: "clock", minute: m, rate: r, reset: false });
    }, 250);
    return () => clearInterval(t);
  }, []);

  // Laço de render.
  useEffect(() => {
    const a = makeSnapshot(), b = makeSnapshot();
    let raf = 0, frames = 0, lastFpsT = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      frames++;
      const now = performance.now();
      if (now - lastFpsT >= 1000) { setFps(Math.round((frames * 1000) / (now - lastFpsT))); frames = 0; lastFpsT = now; }
      const src = sourceRef.current, roster = rosterRef.current;
      if (!src || !roster) return;
      const latest = src.latestSeq();
      if (latest < 0) return;
      const renderT = performance.timeOrigin + now - baseRef.current - RENDER_DELAY_MS;
      // Acha o snapshot mais novo com realMs <= renderT (a) e o seguinte (b).
      let haveA = false, haveB = false;
      for (let s = latest; s > latest - RING_SLOTS + 1 && s >= 0; s--) {
        if (!src.readByIndex(s, a)) continue;
        if (a.realMs <= renderT) { haveA = true; break; }
        // a é mais novo que renderT: vira candidato a b.
        b.realMs = a.realMs; b.px.set(a.px); b.py.set(a.py); b.ballX = a.ballX; b.ballY = a.ballY; haveB = true;
      }
      if (!haveA && !haveB) return;
      let t = 0;
      if (haveA && haveB && b.realMs > a.realMs) t = Math.min(1, Math.max(0, (renderT - a.realMs) / (b.realMs - a.realMs)));
      const A = haveA ? a : b, B = haveB && haveA ? b : A;
      const dots: LiveDot[] = [];
      const n = Math.min(MAX_PLAYERS, roster.ids.length);
      for (let i = 0; i < n; i++) {
        dots.push({
          playerId: roster.ids[i], playerName: roster.names[i], slot: roster.slots[i], side: roster.sides[i],
          x: A.px[i] + (B.px[i] - A.px[i]) * t, y: A.py[i] + (B.py[i] - A.py[i]) * t,
        });
      }
      setFrame({ dots, ball: { x: A.ballX + (B.ballX - A.ballX) * t, y: A.ballY + (B.ballY - A.ballY) * t } });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { frame, fps, compat };
}

function createSnapshotSourceFallback(): SnapshotSource { return new MessageSource(); }
