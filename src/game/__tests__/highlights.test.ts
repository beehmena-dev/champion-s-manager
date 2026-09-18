import { describe, expect, it } from "vitest";
import { buildHighlights } from "@/game/highlights";
import type { MatchEvent } from "@/game/types";

const ev = (minute: number, type: MatchEvent["type"]): MatchEvent => ({ minute, type, side: "home", text: "x" });

describe("buildHighlights", () => {
  it("período sem lance marcado nunca fica sem campo: devolve o período inteiro", () => {
    expect(buildHighlights([ev(10, "info")], 0, 45, "key")).toEqual([{ start: 0, end: 45 }]);
  });

  it("modo chave pega gol/grande chance/expulsão", () => {
    const segs = buildHighlights([ev(20, "goal"), ev(30, "yellow")], 0, 45, "key");
    expect(segs).toHaveLength(1);
    expect(segs[0].start).toBeCloseTo(18.7);
  });

  it("modo estendido também pega cartão e defesa", () => {
    const segs = buildHighlights([ev(10, "yellow"), ev(40, "save")], 0, 45, "extended");
    expect(segs).toHaveLength(2);
  });

  it("modo completo é um único segmento contínuo", () => {
    expect(buildHighlights([ev(20, "goal")], 45, 90, "full")).toEqual([{ start: 45, end: 90 }]);
  });
});
