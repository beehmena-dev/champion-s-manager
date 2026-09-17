import { describe, expect, it } from "vitest";
import { adjustMarketValue, applyFormMarketMomentum } from "../valuation";

describe("adjustMarketValue", () => {
  it("não muda o valor quando o delta de overall é zero", () => {
    expect(adjustMarketValue(1_000_000, 0)).toBe(1_000_000);
  });
  it("sobe ~7% por ponto de overall ganho", () => {
    expect(adjustMarketValue(1_000_000, 1)).toBe(1_070_000);
  });
  it("desce quando o overall cai", () => {
    expect(adjustMarketValue(1_000_000, -1)).toBeLessThan(1_000_000);
  });
  it("nunca deixa o valor abaixo do piso", () => {
    expect(adjustMarketValue(1000, -50)).toBe(1000);
  });
  it("valor zerado continua zerado (jogador sem valor nunca ganha um do nada)", () => {
    expect(adjustMarketValue(0, 5)).toBe(0);
  });
});

describe("applyFormMarketMomentum", () => {
  it("não muda o valor quando o delta de forma é zero", () => {
    expect(applyFormMarketMomentum(1_000_000, 0)).toBe(1_000_000);
  });
  it("sobe um pouco depois de uma partida boa (delta de forma positivo)", () => {
    const r = applyFormMarketMomentum(1_000_000, 7);
    expect(r).toBeGreaterThan(1_000_000);
  });
  it("desce um pouco depois de uma partida ruim (delta de forma negativo)", () => {
    const r = applyFormMarketMomentum(1_000_000, -3);
    expect(r).toBeLessThan(1_000_000);
  });
  it("o efeito de UMA partida é pequeno (menos de 3%), pra não parecer lance isolado", () => {
    const r = applyFormMarketMomentum(1_000_000, 15); // maior delta plausível numa partida só (hat-trick + vitória)
    expect(r / 1_000_000).toBeLessThan(1.03);
  });
  it("uma sequência de várias partidas boas compõe pra um efeito bem maior que uma só", () => {
    let value = 1_000_000;
    for (let i = 0; i < 10; i++) value = applyFormMarketMomentum(value, 7);
    const gainAfter10 = value / 1_000_000 - 1;
    const gainAfter1 = applyFormMarketMomentum(1_000_000, 7) / 1_000_000 - 1;
    expect(gainAfter10).toBeGreaterThan(gainAfter1 * 5);
  });
  it("nunca deixa o valor abaixo do piso", () => {
    expect(applyFormMarketMomentum(1000, -80)).toBeGreaterThanOrEqual(1000);
  });
});
