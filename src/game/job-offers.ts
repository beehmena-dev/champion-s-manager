// -----------------------------------------------------------------------------
// Sondagem de outro clube — lógica pura (sem I/O).
//
// Hoje a única forma de trocar de clube é ser demitido (ver src/game/board.ts).
// Aqui é o inverso: um clube de reputação maior chama o usuário quando ele
// está indo bem no clube atual — sinalizado pela confiança da diretoria.
// -----------------------------------------------------------------------------

export interface JobOfferClubStanding {
  reputation: number;
  boardConfidence: number;
}

export const JOB_OFFER_MIN_CONFIDENCE = 65;
export const JOB_OFFER_MIN_REPUTATION_GAP = 12;

export function isEligibleForJobOffers(myClub: JobOfferClubStanding): boolean {
  return myClub.boardConfidence >= JOB_OFFER_MIN_CONFIDENCE;
}

/**
 * Chance (0-1) de UM clube específico de reputação maior sondar o usuário
 * num dado dia avançado. Cresce com a confiança da diretoria (sinal de que
 * o trabalho está indo bem) e com a diferença de reputação entre os clubes.
 * Um técnico com reputação pessoal alta (ver managerReputationDelta em
 * src/game/board.ts) reduz essa diferença "efetiva" — grandes clubes
 * enxergam além da reputação do clube pequeno que ele comanda hoje.
 */
export function jobOfferDailyChance(myClub: JobOfferClubStanding, offeringClubReputation: number, managerReputation = 50): number {
  if (!isEligibleForJobOffers(myClub)) return 0;
  const managerBoost = Math.max(0, (managerReputation - 50) * 0.3);
  const gap = offeringClubReputation - myClub.reputation + managerBoost;
  if (gap < JOB_OFFER_MIN_REPUTATION_GAP) return 0;

  const confidenceFactor = Math.min(1, (myClub.boardConfidence - JOB_OFFER_MIN_CONFIDENCE) / (100 - JOB_OFFER_MIN_CONFIDENCE));
  const gapFactor = Math.min(1, gap / 40);
  return 0.01 + 0.05 * confidenceFactor * gapFactor; // ~1% a 6% por dia avançado
}
