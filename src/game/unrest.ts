// -----------------------------------------------------------------------------
// Insatisfação de jogador — lógica pura (sem I/O).
//
// Até aqui toda negociação de transferência é iniciada pelo usuário ou por
// uma sondagem aleatória de IA (ver src/lib/transfer-offers.ts). Aqui é o
// jogador quem pressiona: moral baixa, contrato perto do fim, ou uma
// cláusula de titularidade garantida (ver src/routes/.../players.$playerId.tsx)
// descumprida.
// -----------------------------------------------------------------------------

export type UnrestReason = "low_morale" | "contract_ending" | "broken_starter_promise";

export interface UnrestPlayerLike {
  morale: number;
  contract_until: string | null;
  guaranteed_starter?: boolean;
  bench_streak?: number;
}

export const UNREST_MORALE_THRESHOLD = 35;
export const UNREST_CONTRACT_WINDOW_DAYS = 150;
export const BROKEN_PROMISE_BENCH_STREAK = 3;

export function unrestReason(p: UnrestPlayerLike, todayISO: string): UnrestReason | null {
  // Promessa quebrada pesa mais que moral baixa genérica — checa primeiro.
  if (p.guaranteed_starter && (p.bench_streak ?? 0) >= BROKEN_PROMISE_BENCH_STREAK) return "broken_starter_promise";
  if (p.morale <= UNREST_MORALE_THRESHOLD) return "low_morale";
  if (p.contract_until) {
    const days = (new Date(p.contract_until).getTime() - new Date(todayISO).getTime()) / 86_400_000;
    if (days >= 0 && days <= UNREST_CONTRACT_WINDOW_DAYS) return "contract_ending";
  }
  return null;
}

/** Chance (0-1) por dia avançado de UM jogador insatisfeito formalizar o pedido. */
export function unrestDailyChance(reason: UnrestReason): number {
  if (reason === "broken_starter_promise") return 0.08;
  return reason === "low_morale" ? 0.03 : 0.015;
}
