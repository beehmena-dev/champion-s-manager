import { describe, it, expect } from "vitest";
import { simulateMatchSegment } from "../simulation";
import { makeClub, makeXI } from "./fixtures";

describe("Fase 1 (d): mesma seed = mesma partida", () => {
  it("50 seeds, placar e eventos idênticos campo a campo", () => {
    for (let i = 0; i < 50; i++) {
      const run = () => simulateMatchSegment(makeClub("h"), makeClub("a"), makeXI("h"), makeXI("a"), { seed: `det-${i}` }).result;
      const a = run(), b = run();
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
  });
});
