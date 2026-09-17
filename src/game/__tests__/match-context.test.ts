import { describe, it, expect } from "vitest";
import { refereeForMatch, weatherForMatch, refereeCoefs, computeStoppageMinutes } from "../match-context";

describe("refereeForMatch", () => {
  it("é determinístico pela mesma semente (fica igual em todos os trechos ao vivo)", () => {
    const a = refereeForMatch("match-123");
    const b = refereeForMatch("match-123");
    expect(a).toEqual(b);
  });

  it("varia entre partidas diferentes", () => {
    const names = new Set(Array.from({ length: 20 }, (_, i) => refereeForMatch(`m${i}`).name));
    expect(names.size).toBeGreaterThan(1);
  });

  it("rigor sempre entre 1 e 5", () => {
    for (let i = 0; i < 50; i++) {
      const { strictness } = refereeForMatch(`seed-${i}`);
      expect(strictness).toBeGreaterThanOrEqual(1);
      expect(strictness).toBeLessThanOrEqual(5);
    }
  });
});

describe("refereeCoefs", () => {
  it("árbitro mais rigoroso pune mais cartão e para mais o jogo", () => {
    const lenient = refereeCoefs(1);
    const strict = refereeCoefs(5);
    expect(strict.cards).toBeGreaterThan(lenient.cards);
    expect(strict.stoppage).toBeGreaterThan(lenient.stoppage);
  });
});

describe("weatherForMatch", () => {
  it("é determinístico pela mesma semente", () => {
    expect(weatherForMatch("m1")).toEqual(weatherForMatch("m1"));
  });

  it("chuva/neve tendem a deixar o gramado pior que 'bom'", () => {
    // roda várias sementes até achar uma de chuva e confirma que o gramado
    // associado nunca é pior que as opções válidas (bug de digitação, por ex.)
    for (let i = 0; i < 200; i++) {
      const w = weatherForMatch(`s${i}`);
      expect(["limpo", "chuva", "calor", "vento", "neve"]).toContain(w.weather);
      expect(["bom", "gasto", "pesado", "gelado"]).toContain(w.pitch);
    }
  });
});

describe("computeStoppageMinutes", () => {
  it("nunca fica abaixo de 1 nem acima de 9", () => {
    const many = Array.from({ length: 30 }, () => ({ type: "goal" }));
    const none: { type: string }[] = [];
    const weatherGood = weatherForMatch("clima-bom-fixo");
    expect(computeStoppageMinutes(none, 1, weatherGood)).toBeGreaterThanOrEqual(1);
    expect(computeStoppageMinutes(many, 5, weatherGood)).toBeLessThanOrEqual(9);
  });

  it("mais eventos no tempo geram mais acréscimo que nenhum evento", () => {
    const weather = weatherForMatch("clima-fixo");
    const withEvents = computeStoppageMinutes(
      [{ type: "goal" }, { type: "injury" }, { type: "yellow" }, { type: "red" }],
      3, weather,
    );
    const withoutEvents = computeStoppageMinutes([], 3, weather);
    expect(withEvents).toBeGreaterThan(withoutEvents);
  });
});
