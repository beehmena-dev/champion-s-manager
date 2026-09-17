// -----------------------------------------------------------------------------
// Negociação de renovação de contrato — lógica pura (sem I/O).
// Mesmo formato de src/game/transfer-negotiation.ts: o empresário do jogador
// avalia a proposta e decide aceitar, contra-propor um salário maior ou
// recusar de vez. Depois de MAX_ROUNDS sem acordo, é pegar ou largar.
// -----------------------------------------------------------------------------

export type ContractDecision =
  | { decision: "accept" }
  | { decision: "counter"; counterWage: number }
  | { decision: "reject" };

export interface ContractNegotiationContext {
  offeredWage: number;
  currentWage: number;
  overall: number;
  age: number;
  round: number; // 1-indexed
}

export const MAX_CONTRACT_ROUNDS = 3;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Salário que o empresário considera justo — estrelas jovens em ascensão
 * querem aumento de verdade; veteranos valorizam mais a estabilidade e
 * topam até uma leve redução pra continuar jogando.
 */
export function expectedWage(currentWage: number, overall: number, age: number): number {
  const overallFactor = 1 + Math.max(0, overall - 60) * 0.012; // cada ponto de OVR acima de 60 = +1.2%
  const ageFactor = age <= 23 ? 1.15 : age <= 29 ? 1.0 : age <= 33 ? 0.9 : 0.75;
  return Math.round(currentWage * overallFactor * ageFactor);
}

export function evaluateContractOffer(ctx: ContractNegotiationContext, rng: () => number = Math.random): ContractDecision {
  const target = expectedWage(ctx.currentWage, ctx.overall, ctx.age);
  const ratio = target > 0 ? ctx.offeredWage / target : 1;

  if (ctx.round >= MAX_CONTRACT_ROUNDS) {
    return ratio >= 0.92 ? { decision: "accept" } : { decision: "reject" };
  }
  if (ratio >= 1.0) return { decision: "accept" };
  if (ratio < 0.6) return { decision: "reject" }; // proposta ofensivamente baixa

  const counterWage = Math.round(ctx.offeredWage + (target - ctx.offeredWage) * (0.5 + rng() * 0.2));
  return { decision: "counter", counterWage: clamp(counterWage, ctx.offeredWage + 1, target * 1.1) };
}
