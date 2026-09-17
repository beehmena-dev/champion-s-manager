// -----------------------------------------------------------------------------
// Negociação de transferências — lógica pura (sem I/O), consumida por
// src/lib/transfer-offers.ts.
//
// Cada proposta é avaliada do ponto de vista de QUEM PRECISA RESPONDER:
//  - evaluateAsSeller: o clube é dono do jogador e quer vender caro.
//  - evaluateAsBuyer:  o clube quer comprar o jogador e quer pagar barato.
// Ambas seguem a mesma forma: comparam a proposta com um "preço-alvo" que
// depende do valor de mercado e da diferença de reputação entre os clubes,
// e decidem aceitar, contra-propor ou recusar. Depois de MAX_ROUNDS rodadas
// sem acordo, a paciência acaba — é pegar ou largar.
// -----------------------------------------------------------------------------

export type OfferDecision =
  | { decision: "accept" }
  | { decision: "counter"; counterFee: number }
  | { decision: "reject" };

export interface NegotiationContext {
  offerFee: number;
  marketValue: number;
  round: number; // 1-indexed: rodada atual da negociação
  buyerReputation: number;
  sellerReputation: number;
  clubBudget?: number; // orçamento de quem está avaliando (clube vendedor, em evaluateAsSeller)
}

export const MAX_NEGOTIATION_ROUNDS = 3;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Avalia uma proposta do ponto de vista do clube VENDEDOR (dono do jogador).
 */
export function evaluateAsSeller(ctx: NegotiationContext, rng: () => number = Math.random): OfferDecision {
  const ratio = ctx.marketValue > 0 ? ctx.offerFee / ctx.marketValue : 1;
  // Clube de reputação maior segura mais o preço — relutância em vender barato
  // pra um clube menor. Reputação menor topa vender mais perto do valor de mercado.
  const repGap = clamp(ctx.sellerReputation - ctx.buyerReputation, -50, 50) / 50; // -1..1
  const minAcceptRatio = 1.0 + repGap * 0.25;
  // No vermelho, o clube fica mais flexível — precisa do dinheiro.
  const desperation = ctx.clubBudget != null && ctx.clubBudget < 0 ? 0.15 : 0;
  const effectiveRatio = ratio + desperation;

  if (ctx.round >= MAX_NEGOTIATION_ROUNDS) {
    return effectiveRatio >= minAcceptRatio * 0.9 ? { decision: "accept" } : { decision: "reject" };
  }
  if (effectiveRatio >= minAcceptRatio) return { decision: "accept" };
  if (effectiveRatio < minAcceptRatio * 0.55) return { decision: "reject" }; // oferta vergonhosa

  const target = ctx.marketValue * minAcceptRatio;
  const counterFee = Math.round(ctx.offerFee + (target - ctx.offerFee) * (0.5 + rng() * 0.2));
  return { decision: "counter", counterFee: Math.max(counterFee, ctx.offerFee + 1) };
}

/**
 * Avalia uma contra-demanda do ponto de vista do clube COMPRADOR.
 * Usado quando um clube de IA propôs comprar um jogador seu e você (vendedor)
 * contra-propôs um valor mais alto — aqui é a IA decidindo se paga ou não.
 */
export function evaluateAsBuyer(ctx: NegotiationContext, rng: () => number = Math.random): OfferDecision {
  const ratio = ctx.marketValue > 0 ? ctx.offerFee / ctx.marketValue : 1; // >1 = pedindo acima do valor
  const repGap = clamp(ctx.buyerReputation - ctx.sellerReputation, -50, 50) / 50;
  const maxPayRatio = 1.15 + repGap * 0.2; // clube grande topa pagar mais

  if (ctx.round >= MAX_NEGOTIATION_ROUNDS) {
    return ratio <= maxPayRatio * 1.05 ? { decision: "accept" } : { decision: "reject" };
  }
  if (ratio <= maxPayRatio) return { decision: "accept" };
  if (ratio > maxPayRatio * 1.6) return { decision: "reject" }; // pediu longe demais

  const target = ctx.marketValue * maxPayRatio;
  const counterFee = Math.round(ctx.offerFee - (ctx.offerFee - target) * (0.5 + rng() * 0.2));
  return { decision: "counter", counterFee: Math.min(counterFee, ctx.offerFee - 1) };
}

/**
 * Valor inicial que um clube de IA oferece ao abrir uma negociação
 * (seja propondo comprar um jogador seu, seja uma referência pro usuário
 * saber o que costuma ser aceito).
 */
export function initialBidFee(
  marketValue: number,
  buyerReputation: number,
  sellerReputation: number,
  rng: () => number = Math.random,
): number {
  const repGap = clamp(buyerReputation - sellerReputation, -50, 50) / 50;
  const ratio = 0.85 + repGap * 0.15 + rng() * 0.25;
  return Math.max(1, Math.round(marketValue * ratio));
}

// -----------------------------------------------------------------------------
// Empréstimos — mesma máquina de negociação (evaluateAsSeller/evaluateAsBuyer)
// acima, só que aplicada sobre um "valor de referência" bem menor que o valor
// de mercado cheio: uma taxa de empréstimo perto desse valor já soa justa pro
// clube dono, sem precisar de uma lógica de avaliação separada.
// -----------------------------------------------------------------------------
export const LOAN_DURATION_DAYS = 180;

export function loanReferenceValue(marketValue: number): number {
  return Math.round(marketValue * 0.15);
}
