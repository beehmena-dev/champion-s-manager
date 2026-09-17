// -----------------------------------------------------------------------------
// Rumores de mercado e notícias de transferência (item 19 do backlog
// FootSim) — lógica pura (sem I/O).
//
// O card junta dois pedidos da comunidade num cluster só:
// 1) NOTÍCIA: reportar transferências REAIS que já acontecem em segundo
//    plano entre clubes de IA (src/lib/ai-transfers.ts já executa essas
//    negociações de ponta a ponta, mas nunca vira nada visível pro usuário —
//    só um registro silencioso na tabela `transfers`). isNotableTransfer()
//    decide o que vira manchete, calibrado contra a base real importada
//    (overall≥78 é ~top 10% dos jogadores; fee≥15M é ~top 10% de valor de
//    mercado).
// 2) RUMOR: especulação sobre um jogador do PRÓPRIO usuário sendo
//    monitorado por outro clube — sem negociação real por trás (exatamente
//    o que o card pede: "ainda sem negociação real"). O "pretendente" é
//    sorteado só entre clubes de IA PLAUSÍVEIS (orçamento e reputação
//    compatíveis com o valor do jogador), não qualquer clube aleatório —
//    não é flavor text solto, é grounded em dado real do save.
// -----------------------------------------------------------------------------

export const NOTABLE_TRANSFER_MIN_OVERALL = 78;
export const NOTABLE_TRANSFER_MIN_FEE = 15_000_000;

export function isNotableTransfer(overall: number, fee: number): boolean {
  return overall >= NOTABLE_TRANSFER_MIN_OVERALL || fee >= NOTABLE_TRANSFER_MIN_FEE;
}

export interface RumorSuitor {
  id: string;
  name: string;
  reputation: number;
  transfer_budget: number;
}

// Mesmo espírito de initialBidFee (transfer-negotiation.ts): um clube não
// precisa ter o valor de mercado CHEIO disponível pra ser um pretendente
// plausível (proposta inicial já costuma vir abaixo do valor de tabela).
const RUMOR_BUDGET_MARGIN = 0.5;
// Clube com reputação bem mais baixa que a do usuário não é um rumor
// plausível de "cobiça" — não faz sentido um time pequeno especular sobre
// a estrela de um clube grande.
const RUMOR_REPUTATION_MARGIN = 12;

/** Sorteia um clube de IA plausível como "pretendente" pro rumor — null se nenhum clube bate os critérios. */
export function plausibleSuitor(
  clubs: RumorSuitor[], playerMarketValue: number, myClubReputation: number, rng: () => number = Math.random,
): RumorSuitor | null {
  const candidates = clubs.filter(
    (c) => c.transfer_budget >= playerMarketValue * RUMOR_BUDGET_MARGIN && c.reputation >= myClubReputation - RUMOR_REPUTATION_MARGIN,
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

export interface RumorTarget {
  id: string;
  name: string;
  market_value: number;
}

const RUMOR_TARGET_POOL_SIZE = 5;

/** Sorteia um alvo de rumor entre os jogadores mais valiosos do elenco — astro vira rumor, reserva não. */
export function pickRumorTarget(players: RumorTarget[], rng: () => number = Math.random): RumorTarget | null {
  if (players.length === 0) return null;
  const pool = [...players].sort((a, b) => b.market_value - a.market_value).slice(0, RUMOR_TARGET_POOL_SIZE);
  return pool[Math.floor(rng() * pool.length)];
}

// Ser cobiçado por outro clube é, na prática, bom pro ego — leve alta de
// moral, não um evento neutro. Pequeno de propósito: é especulação, não uma
// proposta real (essa sim mexeria mais, via transfer_requests/transfer_offers).
export const RUMOR_MORALE_BOOST = 2;
