import { useRef } from "react";
import type { LiveDot } from "@/game/live-positions";
import { stepPlayerMotion, applySeparation, type PlayerMotionState } from "@/game/position-motion";

// -----------------------------------------------------------------------------
// Hook fino — toda a matemática mora em src/game/position-motion.ts (pura,
// testada). Aqui só orquestra o estado por jogador (posição+velocidade real)
// entre renders via useRef, e decide quando "resetar" (snap direto pro alvo,
// sem perseguição) em vez de integrar suavemente.
//
// Impureza de propósito: lê `performance.now()` durante o render (tempo REAL
// decorrido, não de jogo — ver justificativa em position-motion.ts) e muta
// refs sem passar por setState. É o mesmo tipo de padrão usado por qualquer
// biblioteca de animação orientada a frame — a saída depende de QUANDO foi
// chamada, não só dos argumentos. `targets` mudar de referência é o sinal de
// "novo frame de verdade"; a mesma referência (StrictMode double-invoke, ou
// um re-render por motivo alheio) devolve a saída já calculada, sem rodar a
// física de novo pro mesmo instante.
// -----------------------------------------------------------------------------

const MAX_DT = 0.2; // teto de segundos reais por passo — nunca "explode" depois da aba voltar do 2º plano

export function usePlayerMotion(targets: LiveDot[], resetKey: unknown): LiveDot[] {
  const stateRef = useRef<Map<string, PlayerMotionState>>(new Map());
  const lastResetKeyRef = useRef<unknown>(resetKey);
  const lastTsRef = useRef<number | null>(null);
  const lastTargetsRef = useRef<LiveDot[] | null>(null);
  const lastOutputRef = useRef<LiveDot[]>([]);

  if (targets === lastTargetsRef.current) {
    return lastOutputRef.current;
  }
  lastTargetsRef.current = targets;

  // Corte real (troca de lance, início/fim de reprise de gol) — limpa todo
  // o estado; cada jogador some do Map e é reinserido DIRETO no alvo no
  // próprio loop abaixo (`!s`), sem precisar de um caminho de código à parte.
  if (resetKey !== lastResetKeyRef.current) {
    lastResetKeyRef.current = resetKey;
    stateRef.current.clear();
    lastTsRef.current = null;
  }

  const now = performance.now();
  const dt = lastTsRef.current == null ? 0 : Math.min(MAX_DT, (now - lastTsRef.current) / 1000);
  lastTsRef.current = now;

  const stepped: LiveDot[] = targets.map((t) => {
    let s = stateRef.current.get(t.playerId);
    if (!s) {
      s = { x: t.x, y: t.y, vx: 0, vy: 0 };
      stateRef.current.set(t.playerId, s);
    } else if (dt > 0) {
      s = stepPlayerMotion(s, t, dt);
      stateRef.current.set(t.playerId, s);
    }
    return { ...t, x: s.x, y: s.y };
  });

  // Nunca dois jogadores desenhados no mesmo ponto — roda em cima do
  // resultado do passo físico, todo frame (ver justificativa de convergência
  // gradual em position-motion.ts).
  const forSeparation = stepped.map((d) => ({ id: d.playerId, x: d.x, y: d.y }));
  const separated = applySeparation(forSeparation);
  const output = stepped.map((d, i) => ({ ...d, x: separated[i].x, y: separated[i].y }));

  lastOutputRef.current = output;
  return output;
}
