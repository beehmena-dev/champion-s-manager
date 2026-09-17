import type { PlayerLike } from "./types";

// -----------------------------------------------------------------------------
// Catálogo de tipos de lesão — igual o FM faz: cada tipo tem uma faixa de dias
// de recuperação e um risco de recaída diferente se o jogador for escalado
// cedo demais depois de voltar.
// -----------------------------------------------------------------------------

export type InjuryTypeKey = "contusao" | "muscular" | "ligamento" | "fratura";

export interface InjuryTypeSpec {
  key: InjuryTypeKey;
  label: string;
  minDays: number;
  maxDays: number;
  weight: number;       // peso no sorteio (não precisa somar 100)
  relapseRisk: number;  // chance de recaída (0..1) se jogar na janela de risco
  riskWindowDays: number; // quantos dias após a volta ele ainda é considerado frágil
}

export const INJURY_TYPES: InjuryTypeSpec[] = [
  { key: "contusao", label: "Contusão", minDays: 3, maxDays: 8, weight: 40, relapseRisk: 0.02, riskWindowDays: 5 },
  { key: "muscular", label: "Lesão muscular", minDays: 10, maxDays: 25, weight: 35, relapseRisk: 0.06, riskWindowDays: 12 },
  { key: "ligamento", label: "Lesão de ligamento", minDays: 30, maxDays: 60, weight: 20, relapseRisk: 0.05, riskWindowDays: 15 },
  { key: "fratura", label: "Fratura", minDays: 60, maxDays: 120, weight: 5, relapseRisk: 0.03, riskWindowDays: 20 },
];

export function injuryTypeLabel(key?: string | null): string {
  return INJURY_TYPES.find((t) => t.key === key)?.label ?? "Lesão";
}

/** Sorteia um tipo de lesão + duração em dias, usando um rng 0..1 (ex: Math.random). */
export function rollInjuryType(rng: () => number): { type: InjuryTypeKey; days: number } {
  const total = INJURY_TYPES.reduce((a, t) => a + t.weight, 0);
  let r = rng() * total;
  let spec = INJURY_TYPES[0];
  for (const t of INJURY_TYPES) {
    r -= t.weight;
    if (r <= 0) { spec = t; break; }
  }
  const days = spec.minDays + Math.floor(rng() * (spec.maxDays - spec.minDays + 1));
  return { type: spec.key, days };
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export interface InjuryHistoryEntry {
  type: InjuryTypeKey;
  days: number;
  started_at: string;
  expected_return: string;
  relapse?: boolean;
}

/** Monta o patch completo (injured_until, injury_type, injury_risk_until, histórico) pra uma nova lesão. */
export function buildInjuryPatch(
  player: Pick<PlayerLike, "injury_history">,
  todayISO: string,
  type: InjuryTypeKey,
  days: number,
  relapse = false,
) {
  const spec = INJURY_TYPES.find((t) => t.key === type)!;
  const expectedReturn = addDays(todayISO, days);
  const entry: InjuryHistoryEntry = { type, days, started_at: todayISO, expected_return: expectedReturn, relapse };
  const history = [...((player.injury_history as InjuryHistoryEntry[] | null) ?? []), entry].slice(-20); // guarda últimas 20
  return {
    injury_type: type,
    injured_until: expectedReturn,
    injury_risk_until: addDays(expectedReturn, spec.riskWindowDays),
    injury_history: history,
  };
}

/**
 * Checa se um jogador "frágil" (recém-recuperado, dentro da janela de risco)
 * deve sofrer uma recaída ao ser escalado. Retorna null se não recair.
 */
export function rollRelapse(
  player: PlayerLike & { injured_until?: string | null; injury_risk_until?: string | null; injury_type?: string | null },
  todayISO: string,
  rng: () => number,
): { type: InjuryTypeKey; days: number } | null {
  // Só entra na janela de risco se já recuperou da lesão anterior (injured_until no passado)
  // mas ainda está dentro de injury_risk_until.
  if (!player.injury_risk_until) return null;
  if (player.injured_until && player.injured_until >= todayISO) return null; // ainda lesionado, não é "recaída"
  if (player.injury_risk_until < todayISO) return null; // já saiu da janela de risco

  const spec = INJURY_TYPES.find((t) => t.key === player.injury_type) ?? INJURY_TYPES[1];
  if (rng() < spec.relapseRisk) {
    // Recaída costuma ser mais curta que a lesão original, mas do mesmo tipo.
    const days = Math.max(2, Math.round((spec.minDays + Math.floor(rng() * (spec.maxDays - spec.minDays + 1))) * 0.6));
    return { type: spec.key, days };
  }
  return null;
}