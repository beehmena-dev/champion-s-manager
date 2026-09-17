import { describe, it, expect } from "vitest";
import { offsideChancePerMinute, pickOffsidePlayer } from "../offside";
import { makePlayer } from "./fixtures";
import { mulberry32 } from "./rng";

describe("offsideChancePerMinute", () => {
  it("ataque direto contra linha alta gera mais impedimento que ataque curto contra linha baixa", () => {
    const trap = offsideChancePerMinute({ attackTempo: 5, attackPassing: "direct", defenderLine: 5 });
    const patient = offsideChancePerMinute({ attackTempo: 2, attackPassing: "short", defenderLine: 1 });
    expect(trap).toBeGreaterThan(patient);
  });

  it("nunca é negativo", () => {
    const v = offsideChancePerMinute({ attackTempo: 1, attackPassing: "short", defenderLine: 1 });
    expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe("pickOffsidePlayer", () => {
  it("sempre escolhe alguém do grupo recebido", () => {
    const rng = mulberry32(42);
    const pool = [
      makePlayer({ position: "FWD", natural_position: "CA" }),
      makePlayer({ position: "FWD", natural_position: "PE" }),
      makePlayer({ position: "MID", natural_position: "MEI" }),
    ];
    for (let i = 0; i < 50; i++) {
      const picked = pickOffsidePlayer(pool, rng);
      expect(pool.some((p) => p.id === picked?.id)).toBe(true);
    }
  });

  it("devolve undefined pra lista vazia (nunca lança erro)", () => {
    expect(pickOffsidePlayer([], Math.random)).toBeUndefined();
  });
});
