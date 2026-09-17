// -----------------------------------------------------------------------------
// Metas individuais por partida — lógica pura (sem I/O).
//
// Item 06 do backlog FootSim: "definir um objetivo específico pra um
// jogador numa partida (ex. 'marque 1 gol'), plugado no sistema de
// instrução de jogador que já existe." Só metas HONESTAMENTE verificáveis
// contra dado real de MatchResult (nunca "dar assistência" — o motor não
// conta assistência como número separado, só bônus de nota; inventar isso
// seria fabricar granularidade que não existe, mesma regra já aplicada em
// player-instructions.ts/tactics.tsx).
// -----------------------------------------------------------------------------

export type MatchGoalKind = "score_goals" | "clean_sheet" | "good_rating" | "no_cards" | "win_match";

export const MATCH_GOAL_KINDS: MatchGoalKind[] = ["score_goals", "clean_sheet", "good_rating", "no_cards", "win_match"];

// Só "score_goals" e "good_rating" usam threshold — os outros são liga/desliga.
export const MATCH_GOAL_HAS_THRESHOLD: Record<MatchGoalKind, boolean> = {
  score_goals: true, clean_sheet: false, good_rating: true, no_cards: false, win_match: false,
};

export function matchGoalDefaultThreshold(kind: MatchGoalKind): number | undefined {
  if (kind === "score_goals") return 1;
  if (kind === "good_rating") return 7;
  return undefined;
}

export function matchGoalLabel(kind: MatchGoalKind, threshold?: number): string {
  switch (kind) {
    case "score_goals": {
      const n = threshold ?? 1;
      return `Marcar ${n} gol${n === 1 ? "" : "s"}`;
    }
    case "clean_sheet": return "Time não sofrer gol";
    case "good_rating": return `Nota ${(threshold ?? 7).toFixed(1)} ou mais`;
    case "no_cards": return "Não levar cartão";
    case "win_match": return "Vencer a partida";
  }
}

export interface PlayerMatchGoal {
  playerId: string;
  playerName: string;
  kind: MatchGoalKind;
  threshold?: number;
}

export interface MatchGoalOutcome {
  playerId: string;
  playerName: string;
  kind: MatchGoalKind;
  threshold?: number;
  achieved: boolean;
  detail: string;
}

export interface MatchGoalContext {
  isHome: boolean;
  homeScore: number;
  awayScore: number;
  ratings?: { playerId: string; rating: number; goals: number }[];
  cards?: { playerId: string; type: "yellow" | "red" }[];
}

export function evaluateMatchGoal(goal: PlayerMatchGoal, ctx: MatchGoalContext): MatchGoalOutcome {
  const myRating = ctx.ratings?.find((r) => r.playerId === goal.playerId);
  const gotCard = ctx.cards?.some((c) => c.playerId === goal.playerId) ?? false;
  const goalsFor = ctx.isHome ? ctx.homeScore : ctx.awayScore;
  const goalsAgainst = ctx.isHome ? ctx.awayScore : ctx.homeScore;

  const base = { playerId: goal.playerId, playerName: goal.playerName, kind: goal.kind, threshold: goal.threshold };

  switch (goal.kind) {
    case "score_goals": {
      const need = goal.threshold ?? 1;
      const got = myRating?.goals ?? 0;
      return { ...base, achieved: got >= need, detail: `marcou ${got} gol${got === 1 ? "" : "s"} (meta: ${need})` };
    }
    case "clean_sheet": {
      const achieved = goalsAgainst === 0;
      return { ...base, achieved, detail: achieved ? "o time não sofreu gol" : `o time sofreu ${goalsAgainst} gol${goalsAgainst === 1 ? "" : "s"}` };
    }
    case "good_rating": {
      const need = goal.threshold ?? 7;
      const got = myRating?.rating ?? 0;
      return { ...base, achieved: got >= need, detail: `nota ${got.toFixed(1)} (meta: ${need.toFixed(1)})` };
    }
    case "no_cards": {
      return { ...base, achieved: !gotCard, detail: gotCard ? "levou cartão" : "não levou cartão" };
    }
    case "win_match": {
      const achieved = goalsFor > goalsAgainst;
      return { ...base, achieved, detail: achieved ? "o time venceu" : "o time não venceu" };
    }
  }
}

// Bônus/penalidade de FORMA (players.form, escala 0-100, mesmo campo que já
// sobe/desce por gol/vitória em advance-day.ts) — não moral, pra reaproveitar
// o pipeline de escrita que já existe em vez de abrir uma escrita nova só
// pra isso. Penalidade pequena de propósito: uma meta não é uma cobrança,
// é um incentivo — não bater não deveria doer tanto quanto perder a partida.
export const MATCH_GOAL_FORM_DELTA = { met: 8, missed: -2 };
