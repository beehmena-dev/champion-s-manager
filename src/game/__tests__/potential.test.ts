import { describe, expect, it } from "vitest";
import { developmentTrend, driftPotential } from "../potential";

describe("developmentTrend", () => {
  it("sem potencial definido, mantém o comportamento antigo (só por idade)", () => {
    expect(developmentTrend(20, 60, null)).toBe(1);
    expect(developmentTrend(32, 70, null)).toBe(-1);
    expect(developmentTrend(26, 70, null)).toBe(0);
  });

  it("jovem com folga real de potencial sobe (comportamento de antes preservado)", () => {
    expect(developmentTrend(20, 60, 75)).toBe(1);
  });

  it("jovem já colado no próprio teto estagna mesmo sendo novo — o 'flop'", () => {
    expect(developmentTrend(20, 74, 75)).toBe(0);
    expect(developmentTrend(20, 75, 75)).toBe(0);
  });

  it("veterano SEM folga real continua caindo (comportamento de antes preservado)", () => {
    expect(developmentTrend(32, 70, 70)).toBe(-1);
    expect(developmentTrend(32, 70, 71)).toBe(-1);
  });

  it("veterano com folga real de verdade segura em vez de cair — o 'late bloomer'", () => {
    expect(developmentTrend(32, 70, 75)).toBe(0);
  });

  it("idade intermediária (24-29) nunca muda de trend, mesmo com folga", () => {
    expect(developmentTrend(26, 60, 90)).toBe(0);
    expect(developmentTrend(26, 60, 60)).toBe(0);
  });
});

describe("driftPotential", () => {
  it("nunca deixa o potencial cair abaixo do overall atual", () => {
    const alwaysBust = () => 0; // < 0.06, sempre bust
    const d = driftPotential(19, 60, 61, alwaysBust);
    expect(d.potential).toBeGreaterThanOrEqual(61);
    expect(d.kind).toBe("bust");
  });

  it("nunca passa de 99", () => {
    const alwaysBreakout = () => 0.1; // entre 0.06 e 0.12, sempre breakout
    const d = driftPotential(18, 97, 98, alwaysBreakout);
    expect(d.potential).toBeLessThanOrEqual(99);
    expect(d.kind).toBe("breakout");
  });

  it("rolagem normal (fora das caudas) classifica como 'normal'", () => {
    const middle = () => 0.5; // fora de bust(< 0.06) e breakout(< 0.12)
    const d = driftPotential(22, 65, 72, middle);
    expect(d.kind).toBe("normal");
  });

  it("veterano tem volatilidade bem menor que um jovem (calibrado contra o banco real)", () => {
    const youngBreakout = driftPotential(18, 60, 67, () => 0.1);
    const oldBreakout = driftPotential(34, 60, 61, () => 0.1);
    expect(youngBreakout.potential - 67).toBeGreaterThan(oldBreakout.potential - 61);
  });
});
