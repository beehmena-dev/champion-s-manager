// -----------------------------------------------------------------------------
// Cobradores de bola parada + capitão.
//
// O usuário escolhe quem bate pênalti, falta e escanteio (e quem é o capitão)
// na tela de Tática; fica salvo em clubs.penalty_taker_id / free_kick_taker_id
// / corner_taker_id / captain_id. Se o campo for NULL — ou se o jogador
// escolhido não estiver no XI daquela partida (lesão, poupado, vendido) — o
// motor cai na escolha automática (o melhor do XI pra cada função). A IA nunca
// grava nada, então sempre usa a escolha automática.
//
// Efeito no jogo (ver src/game/simulation.ts): parte dos gols nasce de bola
// parada e o cobrador designado leva o gol/assistência; pênalti tem chance de
// perda que depende de Cobrança de Pênalti + Compostura; o capitão dá um
// empurrãozinho de moral ao time em campo.
// -----------------------------------------------------------------------------
import type { PlayerAttributes } from "./attributes";
import type { PlayerLike } from "./types";

export type SetPieceRole = "penalty" | "free_kick" | "corner" | "captain";

export interface SetPieceRoleMeta {
  id: SetPieceRole;
  label: string;
  desc: string;
}

export const SET_PIECE_ROLES: SetPieceRoleMeta[] = [
  { id: "penalty", label: "Pênaltis", desc: "Cobrança de Pênalti · Compostura" },
  { id: "free_kick", label: "Faltas", desc: "Cobrança de Falta · Técnica" },
  { id: "corner", label: "Escanteios", desc: "Escanteios · Cruzamento" },
  { id: "captain", label: "Capitão", desc: "Liderança · Determinação" },
];

const at = (p: PlayerLike, k: keyof PlayerAttributes): number => p.attributes?.[k] ?? 10;

export function penaltyScore(p: PlayerLike): number {
  return at(p, "penalty_taking") * 2.2 + at(p, "composure") * 1.3 + at(p, "finishing") * 0.6 + at(p, "technique") * 0.4;
}
export function freeKickScore(p: PlayerLike): number {
  return at(p, "free_kick_taking") * 2.4 + at(p, "technique") * 1.0 + at(p, "long_shots") * 0.6;
}
export function cornerScore(p: PlayerLike): number {
  return at(p, "corners") * 2.2 + at(p, "crossing") * 1.4 + at(p, "technique") * 0.4;
}
export function captainScore(p: PlayerLike): number {
  // Liderança pesa acima de tudo — o capitão não é "o melhor jogador",
  // é quem comanda o grupo. Overall entra só como leve desempate.
  return at(p, "leadership") * 3.2 + at(p, "determination") * 1.1 + at(p, "composure") * 0.5
    + at(p, "teamwork") * 0.4 + (p.overall ?? 50) * 0.05;
}
export function headerScore(p: PlayerLike): number {
  return at(p, "heading") * 2.4 + at(p, "bravery") * 0.6 + at(p, "strength") * 0.6 + at(p, "jumping_reach") * 1.2;
}

const SCORE_BY_ROLE: Record<SetPieceRole, (p: PlayerLike) => number> = {
  penalty: penaltyScore,
  free_kick: freeKickScore,
  corner: cornerScore,
  captain: captainScore,
};

export function bestBy(players: PlayerLike[], score: (p: PlayerLike) => number): PlayerLike | null {
  let best: PlayerLike | null = null;
  let bestScore = -Infinity;
  for (const p of players) {
    const s = score(p);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best;
}

export interface SetPieceTakers {
  penalty_taker_id: string | null;
  free_kick_taker_id: string | null;
  corner_taker_id: string | null;
  captain_id: string | null;
}

/** Melhor de cada função dentro de um conjunto de jogadores (elenco ou XI). */
export function suggestSetPieceTakers(players: PlayerLike[]): SetPieceTakers {
  return {
    penalty_taker_id: bestBy(players, penaltyScore)?.id ?? null,
    free_kick_taker_id: bestBy(players, freeKickScore)?.id ?? null,
    corner_taker_id: bestBy(players, cornerScore)?.id ?? null,
    captain_id: bestBy(players, captainScore)?.id ?? null,
  };
}

export interface ResolvedTakers {
  penalty: PlayerLike | null;
  freeKick: PlayerLike | null;
  corner: PlayerLike | null;
  captain: PlayerLike | null;
}

/**
 * Resolve quem cobra cada bola parada NESTA partida: usa o id salvo do clube
 * se o jogador está no XI; senão o melhor do XI pra aquela função.
 */
export function resolveTakersForXI(xi: PlayerLike[], saved: Partial<SetPieceTakers>): ResolvedTakers {
  const inXI = (id: string | null | undefined): PlayerLike | null =>
    id ? xi.find((p) => p.id === id) ?? null : null;
  const pick = (role: SetPieceRole, id: string | null | undefined): PlayerLike | null =>
    inXI(id) ?? bestBy(xi, SCORE_BY_ROLE[role]);
  return {
    penalty: pick("penalty", saved.penalty_taker_id),
    freeKick: pick("free_kick", saved.free_kick_taker_id),
    corner: pick("corner", saved.corner_taker_id),
    captain: pick("captain", saved.captain_id),
  };
}

// --- Resolução de gol de bola parada (usado pela simulação) ------------------

export type GoalKind = "open" | "penalty" | "free_kick" | "corner";

/** Sorteia a origem de um gol. ~10% pênalti, ~8% falta, ~12% escanteio. */
export function rollGoalKind(rng: () => number): GoalKind {
  const r = rng();
  if (r < 0.10) return "penalty";
  if (r < 0.18) return "free_kick";
  if (r < 0.30) return "corner";
  return "open";
}

/** Probabilidade de converter um pênalti, de Cobrança de Pênalti + Compostura. */
export function penaltyConversion(taker: PlayerLike | null): number {
  if (!taker) return 0.78;
  const skill = (at(taker, "penalty_taking") + at(taker, "composure")) / 2; // 1..20
  return 0.70 + (Math.max(1, Math.min(20, skill)) / 20) * 0.27; // ~0.70..0.97
}
