// -----------------------------------------------------------------------------
// Clássicos — lógica pura (sem I/O).
//
// A base de clubes não tem cidade/estado, então a rivalidade é reconhecida
// por uma lista curada de pares conhecidos, casando por trecho do nome do
// clube (funciona com qualquer prefixo/sufixo de sigla — "Cruzeiro EC",
// "CR Flamengo" etc.).
// -----------------------------------------------------------------------------

const RIVALRY_PAIRS: [string, string][] = [
  ["Flamengo", "Fluminense"],
  ["Flamengo", "Vasco"],
  ["Flamengo", "Botafogo"],
  ["Vasco", "Fluminense"],
  ["Vasco", "Botafogo"],
  ["Fluminense", "Botafogo"],
  ["Corinthians", "Palmeiras"],
  ["Corinthians", "São Paulo"],
  ["Corinthians", "Santos"],
  ["Palmeiras", "São Paulo"],
  ["Palmeiras", "Santos"],
  ["São Paulo", "Santos"],
  ["Cruzeiro", "Mineiro"],
  ["Grêmio", "Internacional"],
  ["Bahia", "Vitória"],
  ["Sport", "Náutico"],
  ["Ceará", "Fortaleza"],
  ["Coritiba", "Paranaense"],
  // clássicos internacionais — só relevantes se o usuário acabar assumindo
  // um desses clubes (ver src/game/job-offers.ts).
  ["Real Madrid", "Barcelona"],
  ["Bayern", "Dortmund"],
  ["Arsenal", "Tottenham"],
  ["Internazionale", "Juventus"],
  ["Paris Saint-Germain", "Marseille"],
];

function nameMatches(clubName: string, needle: string): boolean {
  return clubName.toLowerCase().includes(needle.toLowerCase());
}

export function isRivalry(homeName: string, awayName: string): boolean {
  return RIVALRY_PAIRS.some(
    ([a, b]) =>
      (nameMatches(homeName, a) && nameMatches(awayName, b)) ||
      (nameMatches(homeName, b) && nameMatches(awayName, a)),
  );
}

// Clássico amplifica o efeito de moral do resultado (ver src/lib/advance-day.ts).
export const RIVALRY_MORALE_MULTIPLIER = 1.8;

// Quanto o resultado de UMA partida move o moral do clube — usado tanto pro
// clube do usuário quanto (agora) pros clubes de IA, dos dois lados de toda
// partida simulada. Antes só o lado do usuário recebia esse ajuste, deixando
// o moral de todo o resto da liga congelado em 70 (o valor neutro da
// simulação) pro save inteiro — ver src/lib/advance-day.ts.
export function matchMoraleDelta(goalDiff: number, isDerby: boolean): number {
  return (goalDiff > 0 ? 4 : goalDiff < 0 ? -4 : 1) * (isDerby ? RIVALRY_MORALE_MULTIPLIER : 1);
}
