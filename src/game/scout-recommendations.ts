// -----------------------------------------------------------------------------
// Assistente técnico — sugestões de reforço (lógica pura, sem I/O).
//
// Olha o melhor overall do elenco em cada posição base (GK/DEF/MID/FWD) pra
// achar o ponto mais fraco, depois filtra candidatos do mercado que seriam
// upgrade real ali — um por posição fraca, da mais fraca pra menos fraca.
// -----------------------------------------------------------------------------

export type BasePosition = "GK" | "DEF" | "MID" | "FWD";
const BASE_POSITIONS: BasePosition[] = ["GK", "DEF", "MID", "FWD"];

export interface SquadPositionStrength {
  position: BasePosition;
  bestOverall: number;
}

export function weakestPositions(squad: { position: string; overall: number }[]): SquadPositionStrength[] {
  return BASE_POSITIONS
    .map((position) => {
      const inPos = squad.filter((p) => p.position === position);
      const bestOverall = inPos.length > 0 ? Math.max(...inPos.map((p) => p.overall)) : 0;
      return { position, bestOverall };
    })
    .sort((a, b) => a.bestOverall - b.bestOverall);
}

export interface ScoutCandidate {
  id: string;
  position: string;
  overall: number;
}

export function recommendSignings<T extends ScoutCandidate>(
  squad: { position: string; overall: number }[],
  candidates: T[],
  maxResults = 3,
): T[] {
  const weak = weakestPositions(squad);
  const recommendations: T[] = [];
  const used = new Set<string>();
  for (const w of weak) {
    if (recommendations.length >= maxResults) break;
    const upgrade = candidates
      .filter((c) => c.position === w.position && c.overall > w.bestOverall && !used.has(c.id))
      .sort((a, b) => b.overall - a.overall)[0];
    if (upgrade) { recommendations.push(upgrade); used.add(upgrade.id); }
  }
  return recommendations;
}
