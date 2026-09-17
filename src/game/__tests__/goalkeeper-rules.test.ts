import { describe, it, expect } from "vitest";
import { eightSecondChancePerMinute, backpassChancePerMinute } from "../goalkeeper-rules";
import { makePlayer } from "./fixtures";

const greatGK = () => makePlayer({ position: "GK", natural_position: "GOL", attrs: { composure: 19, decisions: 19, kicking: 19 } });
const poorGK = () => makePlayer({ position: "GK", natural_position: "GOL", attrs: { composure: 5, decisions: 5, kicking: 5 } });

describe("eightSecondChancePerMinute", () => {
  it("goleiro pior (Compostura/Decisões baixas) é pego com mais frequência", () => {
    expect(eightSecondChancePerMinute(poorGK())).toBeGreaterThan(eightSecondChancePerMinute(greatGK()));
  });

  it("sem goleiro (undefined) não quebra — usa padrão neutro", () => {
    expect(() => eightSecondChancePerMinute(undefined)).not.toThrow();
  });
});

describe("backpassChancePerMinute", () => {
  it("goleiro pior erra a saída com mais frequência", () => {
    expect(backpassChancePerMinute(poorGK(), "mixed")).toBeGreaterThan(backpassChancePerMinute(greatGK(), "mixed"));
  });

  it("time de posse curta arrisca mais o passe pro goleiro que jogo direto", () => {
    const gk = greatGK();
    expect(backpassChancePerMinute(gk, "short")).toBeGreaterThan(backpassChancePerMinute(gk, "direct"));
  });
});
