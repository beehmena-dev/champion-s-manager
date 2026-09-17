import { describe, expect, it } from "vitest";
import { isTransferWindowOpen, currentWindowLabel, daysUntilNextWindow } from "../transfer-window";

describe("isTransferWindowOpen", () => {
  it("aberta na janela de verão (jun-ago)", () => {
    expect(isTransferWindowOpen("2026-06-01")).toBe(true);
    expect(isTransferWindowOpen("2026-07-15")).toBe(true);
    expect(isTransferWindowOpen("2026-08-31")).toBe(true);
  });
  it("aberta na janela de inverno (janeiro)", () => {
    expect(isTransferWindowOpen("2026-01-01")).toBe(true);
    expect(isTransferWindowOpen("2026-01-31")).toBe(true);
  });
  it("fechada fora das duas janelas", () => {
    expect(isTransferWindowOpen("2026-02-01")).toBe(false);
    expect(isTransferWindowOpen("2026-05-31")).toBe(false);
    expect(isTransferWindowOpen("2026-09-01")).toBe(false);
    expect(isTransferWindowOpen("2026-12-15")).toBe(false);
  });
});

describe("currentWindowLabel", () => {
  it("nomeia a janela certa quando aberta", () => {
    expect(currentWindowLabel("2026-07-01")).toBe("Janela de verão");
    expect(currentWindowLabel("2026-01-15")).toBe("Janela de inverno");
  });
  it("null quando fechada", () => {
    expect(currentWindowLabel("2026-03-01")).toBeNull();
  });
});

describe("daysUntilNextWindow", () => {
  it("0 quando já está aberta", () => {
    expect(daysUntilNextWindow("2026-06-15")).toBe(0);
    expect(daysUntilNextWindow("2026-01-10")).toBe(0);
  });
  it("conta corretamente até a próxima janela dentro do mesmo ano", () => {
    // 2026-02-01 -> próxima abertura é verão em 2026-06-01 (120 dias, ano não-bissexto conta certo)
    const d = daysUntilNextWindow("2026-02-01");
    expect(d).toBeGreaterThan(0);
    const expected = Math.round((new Date("2026-06-01T00:00:00Z").getTime() - new Date("2026-02-01T00:00:00Z").getTime()) / 86_400_000);
    expect(d).toBe(expected);
  });
  it("atravessa o fim do ano corretamente (dezembro -> janeiro do ano seguinte)", () => {
    const d = daysUntilNextWindow("2026-12-15");
    const expected = Math.round((new Date("2027-01-01T00:00:00Z").getTime() - new Date("2026-12-15T00:00:00Z").getTime()) / 86_400_000);
    expect(d).toBe(expected);
  });
});
