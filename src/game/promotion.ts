// Acesso e rebaixamento entre divisões do mesmo país.
//
// Uma pirâmide = competições com o mesmo `country` e `tier` consecutivos.
// No fim da temporada, os N piores de cada divisão trocam de lugar com os N
// melhores da divisão imediatamente abaixo. A aplicação fica em
// src/lib/season-rollover.ts::applyPromotionRelegation; aqui só a regra do N.

export const PROMOTION_SPOTS = 3;

// Quantas vagas de acesso/rebaixamento entre duas divisões, em função do
// tamanho da MENOR delas. Ligas pequenas trocam menos (ou nenhum) clube pra
// não esvaziar demais nenhuma das duas.
export function promotionSlots(minLeagueSize: number): number {
  if (minLeagueSize < 8) return 0;
  if (minLeagueSize < 14) return 2;
  return PROMOTION_SPOTS;
}
