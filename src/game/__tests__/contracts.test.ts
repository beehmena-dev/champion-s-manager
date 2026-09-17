import { describe, expect, it } from "vitest";
import { daysUntil, contractRisk, contractsAtRisk, CONTRACT_CRITICAL_DAYS, CONTRACT_WATCH_DAYS, CONTRACT_RADAR_DAYS } from "../contracts";

describe("daysUntil", () => {
  it("conta dias corretamente pra frente", () => {
    expect(daysUntil("2026-03-01", "2026-01-01")).toBe(59);
  });
  it("negativo quando já venceu", () => {
    expect(daysUntil("2025-12-01", "2026-01-01")).toBeLessThan(0);
  });
  it("zero no próprio dia", () => {
    expect(daysUntil("2026-01-01", "2026-01-01")).toBe(0);
  });
});

describe("contractRisk", () => {
  it("crítico dentro do limiar mais curto", () => {
    expect(contractRisk(0)).toBe("critico");
    expect(contractRisk(CONTRACT_CRITICAL_DAYS)).toBe("critico");
  });
  it("atenção logo acima do crítico, até o limiar maior", () => {
    expect(contractRisk(CONTRACT_CRITICAL_DAYS + 1)).toBe("atencao");
    expect(contractRisk(CONTRACT_WATCH_DAYS)).toBe("atencao");
  });
  it("sem risco além do limiar de atenção", () => {
    expect(contractRisk(CONTRACT_WATCH_DAYS + 1)).toBeNull();
  });
  it("vencido não é 'risco' — é outro problema (jogador já livre)", () => {
    expect(contractRisk(-1)).toBeNull();
  });
});

describe("contractsAtRisk", () => {
  const today = "2026-01-01";

  it("filtra fora quem não tem contract_until", () => {
    const r = contractsAtRisk([{ id: "a", contract_until: null }], today);
    expect(r).toHaveLength(0);
  });

  it("filtra fora contrato vencido e contrato muito longe (fora do radar)", () => {
    const r = contractsAtRisk(
      [
        { id: "expired", contract_until: "2025-01-01" },
        { id: "far", contract_until: "2029-01-01" },
      ],
      today,
    );
    expect(r).toHaveLength(0);
  });

  it("inclui quem está dentro do radar (até 365 dias), com dias e risco calculados", () => {
    const soon = new Date(today);
    soon.setUTCDate(soon.getUTCDate() + 30);
    const r = contractsAtRisk([{ id: "soon", contract_until: soon.toISOString().slice(0, 10) }], today);
    expect(r).toHaveLength(1);
    expect(r[0].daysRemaining).toBe(30);
    expect(r[0].risk).toBe("critico");
  });

  it("ordena por urgência — quem vence primeiro vem primeiro", () => {
    const r = contractsAtRisk(
      [
        { id: "later", contract_until: "2026-06-01" },
        { id: "sooner", contract_until: "2026-02-01" },
      ],
      today,
    );
    expect(r.map((p) => p.id)).toEqual(["sooner", "later"]);
  });

  it("no limite exato do radar (365 dias) ainda entra; um dia depois, não", () => {
    const edge = new Date(today);
    edge.setUTCDate(edge.getUTCDate() + CONTRACT_RADAR_DAYS);
    const past = new Date(today);
    past.setUTCDate(past.getUTCDate() + CONTRACT_RADAR_DAYS + 1);
    const r = contractsAtRisk(
      [
        { id: "edge", contract_until: edge.toISOString().slice(0, 10) },
        { id: "past", contract_until: past.toISOString().slice(0, 10) },
      ],
      today,
    );
    expect(r.map((p) => p.id)).toEqual(["edge"]);
  });
});
