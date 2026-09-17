import { describe, expect, it } from "vitest";
import { loanOutProgress } from "../loan-status";

describe("loanOutProgress", () => {
  it("no dia em que o empréstimo começou, 0 dias decorridos e progresso 0%", () => {
    const r = loanOutProgress("2025-07-14", "2025-01-15"); // 180 dias depois de 15/jan
    expect(r.daysElapsed).toBe(0);
    expect(r.progressPct).toBe(0);
    expect(r.daysRemaining).toBe(180);
  });
  it("na metade do prazo, ~50% de progresso", () => {
    const r = loanOutProgress("2025-07-14", "2025-04-15"); // ~90 dias depois de 15/jan
    expect(r.progressPct).toBeGreaterThan(45);
    expect(r.progressPct).toBeLessThan(55);
  });
  it("no dia do retorno, 100% de progresso e 0 dias restantes", () => {
    const r = loanOutProgress("2025-07-14", "2025-07-14");
    expect(r.progressPct).toBe(100);
    expect(r.daysRemaining).toBe(0);
  });
  it("nunca fica negativo mesmo se a data de retorno já passou (atraso de processamento)", () => {
    const r = loanOutProgress("2025-07-14", "2025-08-01");
    expect(r.daysRemaining).toBe(0);
    expect(r.progressPct).toBe(100);
  });
});
