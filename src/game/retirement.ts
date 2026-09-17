// -----------------------------------------------------------------------------
// Aposentadoria — lógica pura (sem I/O). Sem isso, elencos de clubes de IA
// acumulariam veteranos de 40+ anos pra sempre, deixando o mundo do save
// cada vez mais artificial numa carreira longa.
// -----------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

const RETIREMENT_START_AGE = 33;
const FORCED_RETIREMENT_AGE = 40;
const GOALKEEPER_GRACE_YEARS = 3; // goleiros costumam jogar até mais tarde

/**
 * Probabilidade de um jogador se aposentar NESTA virada de temporada,
 * dada a idade (já somado o +1 ano da temporada) e a posição.
 */
export function retirementChance(age: number, position: string): number {
  const effectiveAge = position === "GK" ? age - GOALKEEPER_GRACE_YEARS : age;
  if (effectiveAge >= FORCED_RETIREMENT_AGE) return 1;
  if (effectiveAge < RETIREMENT_START_AGE) return 0;
  return clamp((effectiveAge - (RETIREMENT_START_AGE - 1)) / 8, 0, 0.95);
}

export function rollRetirement(age: number, position: string, rng: () => number = Math.random): boolean {
  return rng() < retirementChance(age, position);
}
