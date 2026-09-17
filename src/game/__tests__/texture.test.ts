import { describe, it, expect } from "vitest";
import {
  pressWinChancePerMinute, pickPresser, markDuelChancePerMinute, markDuelWinner,
  overlapRunChance, longShotChance, skillMoveChance, skillMoveDuel,
} from "../texture";
import { DEFAULT_INSTRUCTIONS } from "../player-instructions";
import { makePlayer } from "./fixtures";
import { mulberry32 } from "./rng";

describe("pressWinChancePerMinute", () => {
  it("sobe com a instrução média de pressão do time", () => {
    expect(pressWinChancePerMinute(1)).toBeGreaterThan(pressWinChancePerMinute(0));
    expect(pressWinChancePerMinute(0)).toBeGreaterThan(pressWinChancePerMinute(-1));
  });
  it("nunca é negativo dentro da faixa -1..1", () => {
    expect(pressWinChancePerMinute(-1)).toBeGreaterThanOrEqual(0);
  });
});

describe("pickPresser", () => {
  it("sempre escolhe alguém do grupo recebido", () => {
    const rng = mulberry32(7);
    const pool = [
      makePlayer({ position: "MID", natural_position: "VOL" }),
      makePlayer({ position: "FWD", natural_position: "CA" }),
    ];
    for (let i = 0; i < 30; i++) {
      const p = pickPresser(pool, new Map(), rng);
      expect(pool.some((x) => x.id === p?.id)).toBe(true);
    }
  });
  it("devolve undefined pra lista vazia", () => {
    expect(pickPresser([], new Map(), Math.random)).toBeUndefined();
  });
});

describe("markDuelChancePerMinute", () => {
  it("sobe com a instrução média de marcação do time", () => {
    expect(markDuelChancePerMinute(1)).toBeGreaterThan(markDuelChancePerMinute(0));
  });
});

describe("markDuelWinner", () => {
  it("marcador com Marcação/Posicionamento muito acima do driblador vence a maioria das disputas", () => {
    const marker = makePlayer({ position: "DEF", natural_position: "ZAG", attrs: { marking: 19, positioning: 19 } });
    const attacker = makePlayer({ position: "FWD", natural_position: "CA", attrs: { dribbling: 4, off_the_ball: 4, flair: 4 } });
    const rng = mulberry32(11);
    let wins = 0;
    for (let i = 0; i < 200; i++) if (markDuelWinner(marker, attacker, 1, rng)) wins++;
    expect(wins).toBeGreaterThan(150);
  });
  it("driblador muito acima do marcador vence a maioria das disputas", () => {
    const marker = makePlayer({ position: "DEF", natural_position: "ZAG", attrs: { marking: 4, positioning: 4 } });
    const attacker = makePlayer({ position: "FWD", natural_position: "CA", attrs: { dribbling: 19, off_the_ball: 19, flair: 19 } });
    const rng = mulberry32(12);
    let wins = 0;
    for (let i = 0; i < 200; i++) if (markDuelWinner(marker, attacker, -1, rng)) wins++;
    expect(wins).toBeLessThan(50);
  });
});

describe("overlapRunChance", () => {
  it("sobe com roamWidth/roamDepth e com a magnitude do diagrama", () => {
    expect(overlapRunChance(1, 1, 60)).toBeGreaterThan(overlapRunChance(0, 0, 60));
    expect(overlapRunChance(0, 0, 60)).toBeGreaterThan(overlapRunChance(0, 0, 0));
  });
});

describe("longShotChance", () => {
  it("sobe com a instrução de finalização/risco e com o atributo Chute de Longe", () => {
    expect(longShotChance(1, 1, 18)).toBeGreaterThan(longShotChance(0, 0, 10));
    expect(longShotChance(0, 0, 18)).toBeGreaterThan(longShotChance(0, 0, 4));
  });
  it("nunca é negativo mesmo com instruções cautelosas", () => {
    expect(longShotChance(-1, -1, 4)).toBeGreaterThanOrEqual(0);
  });
});

describe("skillMoveChance", () => {
  it("sobe com a instrução de drible e o atributo Drible", () => {
    expect(skillMoveChance(1, 18)).toBeGreaterThan(skillMoveChance(0, 10));
    expect(skillMoveChance(0, 18)).toBeGreaterThan(skillMoveChance(0, 4));
  });
});

describe("skillMoveDuel", () => {
  it("driblador muito melhor vence a maioria dos dribles", () => {
    const dribbler = makePlayer({ position: "FWD", natural_position: "PE", attrs: { dribbling: 19, agility: 19, flair: 19 } });
    const defender = makePlayer({ position: "DEF", natural_position: "LD", attrs: { tackling: 4, marking: 4 } });
    const rng = mulberry32(21);
    let wins = 0;
    for (let i = 0; i < 200; i++) if (skillMoveDuel(dribbler, defender, 1, rng)) wins++;
    expect(wins).toBeGreaterThan(150);
  });
  it("defensor muito melhor ganha a maioria dos desarmes", () => {
    const dribbler = makePlayer({ position: "FWD", natural_position: "PE", attrs: { dribbling: 1, agility: 1, flair: 1 } });
    const defender = makePlayer({ position: "DEF", natural_position: "LD", attrs: { tackling: 20, marking: 20 } });
    const rng = mulberry32(22);
    let wins = 0;
    for (let i = 0; i < 300; i++) if (skillMoveDuel(dribbler, defender, -1, rng)) wins++;
    expect(wins).toBeLessThan(80);
  });
});

describe("DEFAULT_INSTRUCTIONS sanity (usado como fallback nas rolagens de textura)", () => {
  it("padrão é neutro (tudo 0)", () => {
    expect(Object.values(DEFAULT_INSTRUCTIONS).every((v) => v === 0)).toBe(true);
  });
});
