import { describe, expect, it } from "vitest";
import { trainingMultiplierForTier, B_TEAM_TRAINING_BONUS, SQUAD_TIER_LABELS } from "../squad-tiers";

describe("trainingMultiplierForTier", () => {
  it("é neutro (1x) pro elenco principal, ausente, ou null", () => {
    expect(trainingMultiplierForTier("first_team")).toBe(1);
    expect(trainingMultiplierForTier(null)).toBe(1);
    expect(trainingMultiplierForTier(undefined)).toBe(1);
  });

  it("aplica o bônus da Equipe B", () => {
    expect(trainingMultiplierForTier("b_team")).toBe(B_TEAM_TRAINING_BONUS);
  });

  it("qualquer valor desconhecido cai pro neutro (nunca quebra com dado inesperado)", () => {
    expect(trainingMultiplierForTier("algo-nao-mapeado")).toBe(1);
  });
});

describe("SQUAD_TIER_LABELS", () => {
  it("tem rótulo pros dois tiers", () => {
    expect(SQUAD_TIER_LABELS.first_team).toBeTruthy();
    expect(SQUAD_TIER_LABELS.b_team).toBeTruthy();
  });
});
