// -----------------------------------------------------------------------------
// Simulador de posicionamento com estado pro 2D (pedido do usuário: "quero o
// comportamento real do FM Touch"). `live-positions.ts` continua calculando
// exatamente igual — pra qualquer minuto, "onde esse jogador DEVERIA estar
// agora" (função tática, instrução, fluidez do time, bola). Isso vira o ALVO
// (target) que este módulo persegue com posição+velocidade DE VERDADE,
// nunca mais um teleporte direto pro valor calculado — é a diferença entre
// "fórmula sem memória" e "física com inércia".
//
// smoothDamp1D é o algoritmo padrão de game dev (mesma matemática do
// Mathf.SmoothDamp da Unity — aproximação crítica de mola, sem overshoot,
// com teto de velocidade real). Usado pura e independentemente em x/y.
// -----------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// unidades do campo (0-100) por segundo REAL — bem acima do sprint humano
// real (~8-9 m/s ≈ 8-9 unidades no eixo comprido do campo) de propósito: é
// só o TETO, atingido apenas quando o alvo muda bastante de repente (troca
// de posse, início de novo lance). No dia a dia o jogador nunca chega perto
// disso. Calibrado por olho ao vivo, não por fórmula física exata.
export const DEFAULT_MAX_SPEED = 30;
// segundos pra fechar ~90% da distância até um alvo PARADO, ignorando o
// teto de velocidade — baixo = reação quase instantânea ("elétrico"), alto
// = reação preguiçosa ("atrasado"). Também calibrado por olho.
export const DEFAULT_SMOOTH_TIME = 0.2;

/**
 * Aproxima `current` de `target` suavemente, sem overshoot, respeitando um
 * teto de velocidade real. Devolve [novoValor, novaVelocidade].
 */
export function smoothDamp1D(
  current: number,
  currentVelocity: number,
  target: number,
  smoothTime: number,
  maxSpeed: number,
  dt: number,
): [number, number] {
  if (dt <= 0) return [current, currentVelocity];
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

  const originalTo = target;
  const maxChange = maxSpeed * st;
  let change = clamp(current - target, -maxChange, maxChange);
  const adjustedTarget = current - change;

  const temp = (currentVelocity + omega * change) * dt;
  let newVelocity = (currentVelocity - omega * temp) * exp;
  let output = adjustedTarget + (change + temp) * exp;

  // Nunca ultrapassa o alvo original (o teto de velocidade acima já evita a
  // maioria dos casos, isso aqui é só o resíduo numérico da aproximação).
  if ((originalTo - current > 0) === (output > originalTo)) {
    output = originalTo;
    newVelocity = (output - originalTo) / dt;
  }
  return [output, newVelocity];
}

export interface PlayerMotionState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PlayerMotionOptions {
  smoothTime?: number;
  maxSpeed?: number;
}

/** Avança o estado físico de UM jogador por `dt` segundos reais, em direção a `target`. */
export function stepPlayerMotion(
  state: PlayerMotionState,
  target: { x: number; y: number },
  dt: number,
  opts?: PlayerMotionOptions,
): PlayerMotionState {
  const smoothTime = opts?.smoothTime ?? DEFAULT_SMOOTH_TIME;
  const maxSpeed = opts?.maxSpeed ?? DEFAULT_MAX_SPEED;
  const [x, vx] = smoothDamp1D(state.x, state.vx, target.x, smoothTime, maxSpeed, dt);
  const [y, vy] = smoothDamp1D(state.y, state.vy, target.y, smoothTime, maxSpeed, dt);
  return { x, y, vx, vy };
}

// -----------------------------------------------------------------------------
// Separação entre jogadores — futebol de verdade (e o FM) nunca mostra dois
// jogadores exatamente no mesmo ponto. Roda POR CIMA do resultado do
// smoothDamp a cada frame: qualquer par mais perto que `minDistance` é
// empurrado pra longe um do outro (metade do ajuste pra cada lado,
// simétrico). Uma única passagem já resolve um par isolado por completo
// (a distância final bate exatamente em `minDistance`); clusters de 3+
// convergem ao longo de poucos frames — rodando todo frame, isso não é
// perceptível, e evita o custo de múltiplas iterações por chamada.
// -----------------------------------------------------------------------------

export const DEFAULT_MIN_SEPARATION = 3;
const FIELD_MIN = 1.5;
const FIELD_MAX = 98.5;

export interface SeparationPoint {
  id: string;
  x: number;
  y: number;
}

export function applySeparation<T extends SeparationPoint>(
  points: T[],
  minDistance: number = DEFAULT_MIN_SEPARATION,
): T[] {
  const out = points.map((p) => ({ ...p }));
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= minDistance) continue;

      let nx: number, ny: number;
      if (dist < 1e-6) {
        // Exatamente sobrepostos — não dá pra normalizar (0,0); espalha numa
        // direção determinística (baseada nos índices, não Math.random) pra
        // manter o resultado reprodutível em teste.
        const angle = (i * 2.399963 + j * 0.618034) % (Math.PI * 2);
        nx = Math.cos(angle);
        ny = Math.sin(angle);
      } else {
        nx = dx / dist;
        ny = dy / dist;
      }
      const overlap = (minDistance - dist) / 2;
      a.x = clamp(a.x - nx * overlap, FIELD_MIN, FIELD_MAX);
      a.y = clamp(a.y - ny * overlap, FIELD_MIN, FIELD_MAX);
      b.x = clamp(b.x + nx * overlap, FIELD_MIN, FIELD_MAX);
      b.y = clamp(b.y + ny * overlap, FIELD_MIN, FIELD_MAX);
    }
  }
  return out;
}
