import { describe, it, expect } from "vitest";
import {
  normalizeInstructions, isDefaultInstructions, DEFAULT_INSTRUCTIONS,
  instructionTacticalDelta, instructionCardWeight, instructionScorerWeight,
} from "../player-instructions";

describe("normalizeInstructions", () => {
  it("nunca quebra em dado ausente/velho — undefined vira o padrão completo", () => {
    expect(normalizeInstructions(undefined)).toEqual(DEFAULT_INSTRUCTIONS);
    expect(normalizeInstructions(null)).toEqual(DEFAULT_INSTRUCTIONS);
    expect(normalizeInstructions({})).toEqual(DEFAULT_INSTRUCTIONS);
  });

  it("valor fora de -1/0/1 é tratado como 0 (nunca propaga lixo)", () => {
    const r = normalizeInstructions({ pressing: 99, risk: -7 });
    expect(r.pressing).toBe(0);
    expect(r.risk).toBe(0);
  });

  it("preserva valores válidos", () => {
    const r = normalizeInstructions({ pressing: 1, risk: -1 });
    expect(r.pressing).toBe(1);
    expect(r.risk).toBe(-1);
  });
});

describe("isDefaultInstructions", () => {
  it("true pro padrão, false pra qualquer desvio", () => {
    expect(isDefaultInstructions(DEFAULT_INSTRUCTIONS)).toBe(true);
    expect(isDefaultInstructions({ ...DEFAULT_INSTRUCTIONS, risk: 1 })).toBe(false);
  });
});

describe("instructionTacticalDelta", () => {
  it("mais avançado/arriscado empurra ataque e tira defesa", () => {
    const advanced = instructionTacticalDelta({ ...DEFAULT_INSTRUCTIONS, roamDepth: 1, risk: 1 });
    const cautious = instructionTacticalDelta({ ...DEFAULT_INSTRUCTIONS, roamDepth: -1, risk: -1 });
    expect(advanced.atk).toBeGreaterThan(cautious.atk);
    expect(advanced.def).toBeLessThan(cautious.def);
  });

  it("padrão (tudo 0) não muda nada", () => {
    const d = instructionTacticalDelta(DEFAULT_INSTRUCTIONS);
    expect(d.atk).toBe(0);
    expect(d.mid).toBe(0);
    expect(d.def).toBe(0);
  });
});

describe("instructionCardWeight / instructionScorerWeight", () => {
  it("entradas duras aumentam peso de cartão; nunca fica negativo", () => {
    expect(instructionCardWeight({ ...DEFAULT_INSTRUCTIONS, tackling: 1 })).toBeGreaterThan(0);
    expect(instructionCardWeight({ ...DEFAULT_INSTRUCTIONS, tackling: -1 })).toBeGreaterThanOrEqual(0);
  });

  it("mais finalização/drible aumenta peso de finalizador; nunca fica negativo", () => {
    expect(instructionScorerWeight({ ...DEFAULT_INSTRUCTIONS, shoot: 1, dribble: 1 })).toBeGreaterThan(0);
    expect(instructionScorerWeight({ ...DEFAULT_INSTRUCTIONS, shoot: -1, dribble: -1 })).toBeGreaterThanOrEqual(0);
  });
});
