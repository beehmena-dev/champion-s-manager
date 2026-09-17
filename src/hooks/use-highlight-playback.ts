import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchEvent } from "@/game/types";
import { buildHighlights, HL_CUT_MS, HL_SPEED, type HighlightSegment } from "@/game/highlights";

// -----------------------------------------------------------------------------
// Máquina de estado de "melhores momentos", extraída do Live3DView original
// (match-viewer.tsx) pra ser reaproveitada pelo 2D também — ver o comentário
// grande em src/game/highlights.ts sobre o motivo. Comportamento idêntico ao
// que já rodava no 3D (mesmos efeitos, mesma ordem, mesmas notas sobre os
// bugs de trava já corrigidos), só generalizado com `speed`/`cutMs`
// configuráveis e sem as partes específicas de 3D (câmera/áudio) — quem usa
// o hook cuida disso por fora, reagindo a `minute`/`replay`.
// -----------------------------------------------------------------------------

const REPLAY_LOOKBACK = 0.7; // minutos de jogo re-simulados na reprise
const REPLAY_REAL_SECONDS = 3.6;

export type PlaybackPhase = "playing" | "cut" | "done" | "empty";

export interface GoalReplayState {
  goalMin: number;
  scorer: string;
  hs: number;
  as: number;
}

export function useHighlightPlayback({
  events, initialMinute, maxMinute, speed = HL_SPEED, cutMs = HL_CUT_MS, onReachMax, resolveScorer,
}: {
  events: MatchEvent[];
  initialMinute: number;
  maxMinute: number;
  speed?: number;
  cutMs?: number;
  onReachMax?: () => void;
  // Resolve o nome do artilheiro pro banner/reprise de gol (playerNameById.get, tipicamente).
  resolveScorer?: (playerId: string | undefined, fallbackText: string) => string;
}) {
  const segments = useMemo(
    () => buildHighlights(events, initialMinute, maxMinute),
    [events, initialMinute, maxMinute],
  );

  const [segIndex, setSegIndex] = useState(0);
  const [minute, setMinute] = useState(() => segments[0]?.start ?? initialMinute);
  const [playing, setPlaying] = useState(true);
  const [phase, setPhase] = useState<PlaybackPhase>(segments.length ? "playing" : "empty");
  const [replay, setReplay] = useState<GoalReplayState | null>(null);
  const [replayMin, setReplayMin] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const prevMinRef = useRef(minute);
  const replayedRef = useRef<Set<number>>(new Set());

  // Avanço do relógio: dentro do lance atual, no ritmo normal, até o fim dele.
  useEffect(() => {
    if (phase !== "playing" && !replay) return;
    function tick(ts: number) {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (replay) {
        setReplayMin((rm) => {
          const next = rm + dt * ((REPLAY_LOOKBACK + 0.35) / REPLAY_REAL_SECONDS);
          if (next >= replay.goalMin + 0.35) { setReplay(null); return next; }
          return next;
        });
      } else if (playing && phase === "playing") {
        const seg = segments[segIndex];
        setMinute((m) => Math.min(seg ? seg.end : maxMinute, m + dt * speed));
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); lastTsRef.current = null; };
  }, [playing, phase, replay, segments, segIndex, maxMinute, speed]);

  // Fim do lance atual → entra em "cut" (ou encerra). Só DETECTA e troca de
  // fase — quem faz a contagem do corte é o efeito de baixo, separado (ver
  // comentário no efeito de corte sobre o bug de trava que essa separação evita).
  useEffect(() => {
    if (phase !== "playing" || replay) return;
    const seg = segments[segIndex];
    if (!seg || minute < seg.end - 1e-4) return;
    if (segIndex + 1 < segments.length) {
      setPhase("cut");
      return;
    }
    if (!doneRef.current) {
      doneRef.current = true;
      setPhase("done");
      setPlaying(false);
      onReachMax?.();
    }
  }, [minute, phase, replay, segments, segIndex, onReachMax]);

  // Corte entre lances: `phase` como ÚNICA dep (ver match-viewer.tsx original
  // pro histórico do bug de trava que essa separação corrige).
  useEffect(() => {
    if (phase !== "cut") return;
    const nextStart = segments[segIndex + 1]?.start ?? maxMinute;
    const t = setTimeout(() => {
      prevMinRef.current = nextStart;
      setSegIndex((i) => i + 1);
      setMinute(nextStart);
      setPhase("playing");
    }, cutMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Detecta gol recém-cruzado → dispara a reprise (uma vez por gol). Nunca
  // dispara pra evento "pulado" no corte entre lances, porque o corte já
  // adianta `prevMinRef` pro início do próximo lance antes do salto.
  useEffect(() => {
    if (replay || phase !== "playing" || !playing) { prevMinRef.current = minute; return; }
    const from = prevMinRef.current;
    const crossed = events.find(
      (e) => e.type === "goal" && e.minute > from && e.minute <= minute && !replayedRef.current.has(e.minute),
    );
    prevMinRef.current = minute;
    if (crossed) {
      replayedRef.current.add(crossed.minute);
      const hs = events.filter((e) => e.type === "goal" && e.side === "home" && e.minute <= crossed.minute).length;
      const as = events.filter((e) => e.type === "goal" && e.side === "away" && e.minute <= crossed.minute).length;
      const fallback = crossed.text.replace(/^.*?GOL[^!]*!\s*/i, "").replace(/\s+(marca|converte|completa).*$/i, "").trim() || "Gol";
      const scorer = resolveScorer ? resolveScorer(crossed.playerId, fallback) : fallback;
      setReplayMin(Math.max(initialMinute, crossed.minute - REPLAY_LOOKBACK));
      setReplay({ goalMin: crossed.minute, scorer, hs, as });
    }
  }, [minute, playing, phase, replay, events, initialMinute, resolveScorer]);

  function skipToNext() {
    if (replay || phase !== "playing") return;
    const seg = segments[segIndex];
    if (!seg) return;
    setPlaying(true);
    setMinute(seg.end);
  }

  function rewatch() {
    if (!segments.length) return;
    replayedRef.current.clear();
    doneRef.current = false;
    prevMinRef.current = segments[0].start;
    setSegIndex(0);
    setMinute(segments[0].start);
    setPhase("playing");
    setPlaying(true);
  }

  const effMin = replay ? replayMin : minute;

  return {
    segments, segIndex, minute, effMin, playing, setPlaying, phase, replay, replayMin,
    skipToNext, rewatch,
  };
}
