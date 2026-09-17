// Round-robin (ida) para uma competição de liga.
// Retorna uma lista de rodadas; cada rodada é uma lista de pares [home, away].

export function roundRobin<T>(teams: T[]): Array<Array<[T, T]>> {
  const list = [...teams];
  if (list.length % 2 === 1) list.push(null as unknown as T); // bye
  const n = list.length;
  const rounds: Array<Array<[T, T]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[T, T]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) {
        // Alternar mando de campo para "equilíbrio"
        if (r % 2 === 0) pairs.push([a, b]);
        else pairs.push([b, a]);
      }
    }
    rounds.push(pairs);
    // Rotaciona (mantém o primeiro fixo)
    const fixed = list[0];
    const rotated = [fixed, list[n - 1], ...list.slice(1, n - 1)];
    for (let i = 0; i < n; i++) list[i] = rotated[i];
  }
  return rounds;
}

// Turno + returno: cada confronto acontece duas vezes, com mando de campo
// invertido na segunda metade — é o padrão de qualquer liga de futebol de
// verdade (Brasileirão, Premier League etc. são todos ida e volta).
export function doubleRoundRobin<T>(teams: T[]): Array<Array<[T, T]>> {
  const firstLeg = roundRobin(teams);
  const secondLeg = firstLeg.map((round) => round.map(([home, away]) => [away, home] as [T, T]));
  return [...firstLeg, ...secondLeg];
}

// Gera uma agenda de datas (uma rodada por semana).
export function scheduleDates(startISO: string, numRounds: number): string[] {
  const start = new Date(startISO + "T00:00:00Z");
  const dates: string[] = [];
  for (let i = 0; i < numRounds; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i * 7);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}