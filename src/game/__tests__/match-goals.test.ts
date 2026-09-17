import { describe, expect, it } from "vitest";
import { evaluateMatchGoal, matchGoalLabel, matchGoalDefaultThreshold, MATCH_GOAL_FORM_DELTA, type PlayerMatchGoal } from "../match-goals";

const baseCtx = { isHome: true, homeScore: 2, awayScore: 1, ratings: [{ playerId: "p1", rating: 7.5, goals: 1 }], cards: [] as { playerId: string; type: "yellow" | "red" }[] };

function goal(kind: PlayerMatchGoal["kind"], threshold?: number): PlayerMatchGoal {
  return { playerId: "p1", playerName: "Fulano", kind, threshold };
}

describe("evaluateMatchGoal — score_goals", () => {
  it("bate a meta quando marca o suficiente", () => {
    const r = evaluateMatchGoal(goal("score_goals", 1), baseCtx);
    expect(r.achieved).toBe(true);
  });
  it("não bate quando marca menos que o pedido", () => {
    const r = evaluateMatchGoal(goal("score_goals", 2), baseCtx);
    expect(r.achieved).toBe(false);
  });
  it("jogador sem rating (não jogou) conta 0 gols, nunca quebra", () => {
    const r = evaluateMatchGoal(goal("score_goals", 1), { ...baseCtx, ratings: [] });
    expect(r.achieved).toBe(false);
  });
});

describe("evaluateMatchGoal — clean_sheet", () => {
  it("bate quando o time (do lado do jogador) não sofre gol", () => {
    const r = evaluateMatchGoal(goal("clean_sheet"), { ...baseCtx, isHome: true, awayScore: 0 });
    expect(r.achieved).toBe(true);
  });
  it("não bate quando sofre gol", () => {
    const r = evaluateMatchGoal(goal("clean_sheet"), { ...baseCtx, isHome: true, awayScore: 1 });
    expect(r.achieved).toBe(false);
  });
  it("olha o lado certo quando o jogador é do time visitante", () => {
    const r = evaluateMatchGoal(goal("clean_sheet"), { ...baseCtx, isHome: false, homeScore: 0, awayScore: 3 });
    expect(r.achieved).toBe(true); // visitante não sofreu (homeScore=0), mesmo fazendo 3
  });
});

describe("evaluateMatchGoal — good_rating", () => {
  it("bate quando a nota alcança o limiar", () => {
    const r = evaluateMatchGoal(goal("good_rating", 7), baseCtx);
    expect(r.achieved).toBe(true);
  });
  it("não bate quando fica abaixo", () => {
    const r = evaluateMatchGoal(goal("good_rating", 8), baseCtx);
    expect(r.achieved).toBe(false);
  });
});

describe("evaluateMatchGoal — no_cards", () => {
  it("bate quando não tem cartão registrado pro jogador", () => {
    const r = evaluateMatchGoal(goal("no_cards"), baseCtx);
    expect(r.achieved).toBe(true);
  });
  it("não bate quando o jogador foi advertido", () => {
    const r = evaluateMatchGoal(goal("no_cards"), { ...baseCtx, cards: [{ playerId: "p1", type: "yellow" }] });
    expect(r.achieved).toBe(false);
  });
  it("cartão de OUTRO jogador não afeta a meta deste", () => {
    const r = evaluateMatchGoal(goal("no_cards"), { ...baseCtx, cards: [{ playerId: "outro", type: "red" }] });
    expect(r.achieved).toBe(true);
  });
});

describe("evaluateMatchGoal — win_match", () => {
  it("bate quando o time do jogador vence", () => {
    const r = evaluateMatchGoal(goal("win_match"), { ...baseCtx, isHome: true, homeScore: 2, awayScore: 1 });
    expect(r.achieved).toBe(true);
  });
  it("não bate em empate ou derrota", () => {
    expect(evaluateMatchGoal(goal("win_match"), { ...baseCtx, homeScore: 1, awayScore: 1 }).achieved).toBe(false);
    expect(evaluateMatchGoal(goal("win_match"), { ...baseCtx, homeScore: 0, awayScore: 1 }).achieved).toBe(false);
  });
});

describe("matchGoalLabel / matchGoalDefaultThreshold", () => {
  it("gera rótulo legível pra cada tipo", () => {
    expect(matchGoalLabel("score_goals", 2)).toContain("2 gols");
    expect(matchGoalLabel("score_goals", 1)).toContain("1 gol");
    expect(matchGoalLabel("clean_sheet")).toMatch(/não sofrer/i);
    expect(matchGoalLabel("win_match")).toMatch(/vencer/i);
  });
  it("threshold padrão existe só pros tipos que usam threshold", () => {
    expect(matchGoalDefaultThreshold("score_goals")).toBe(1);
    expect(matchGoalDefaultThreshold("good_rating")).toBe(7);
    expect(matchGoalDefaultThreshold("clean_sheet")).toBeUndefined();
    expect(matchGoalDefaultThreshold("no_cards")).toBeUndefined();
    expect(matchGoalDefaultThreshold("win_match")).toBeUndefined();
  });
});

describe("MATCH_GOAL_FORM_DELTA", () => {
  it("recompensa bater a meta mais do que pune não bater (incentivo, não cobrança)", () => {
    expect(MATCH_GOAL_FORM_DELTA.met).toBeGreaterThan(0);
    expect(Math.abs(MATCH_GOAL_FORM_DELTA.missed)).toBeLessThan(MATCH_GOAL_FORM_DELTA.met);
  });
});
