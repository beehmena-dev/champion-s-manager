// -----------------------------------------------------------------------------
// Tática de clubes controlados pela IA — antes era fixa (definida só na
// importação do seed e nunca mais tocada), então o mesmo adversário jogava
// com a mesma postura pro resto do save inteiro. Aqui a IA escolhe mentalidade/
// pressão/ritmo/linha/estilo de passe por partida, olhando a diferença de
// reputação pro adversário e o mando de campo — favorito de fora joga mais
// ousado, azarão em casa se fecha. Ver src/lib/advance-day.ts (tacticalCoefs
// em src/game/tactics.ts é quem converte esses valores em multiplicadores
// de xG/posse/cartões).
// -----------------------------------------------------------------------------

import type { Mentality, PassingStyle } from "./types";

export interface AiTacticsInput {
  clubReputation: number;
  opponentReputation: number;
  isHome: boolean;
}

export interface AiMatchTactics {
  mentality: Mentality;
  pressing: number;
  defensive_line: number;
  tempo: number;
  passing_style: PassingStyle;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function pickAiMatchTactics(input: AiTacticsInput, rng: () => number = Math.random): AiMatchTactics {
  const gap = input.clubReputation - input.opponentReputation + (input.isHome ? 6 : -6);
  const jitter = () => rng() * 2 - 1; // ±1

  const mentality: Mentality = gap >= 15 ? "attacking" : gap <= -15 ? "defensive" : "balanced";
  const pressing = clamp(3 + gap / 15 + jitter(), 1, 5);
  const defensive_line = clamp(3 + gap / 15 + jitter(), 1, 5);
  const tempo = clamp(3 + gap / 20 + (mentality === "attacking" ? 1 : mentality === "defensive" ? -1 : 0) + jitter(), 1, 5);
  const passing_style: PassingStyle = gap >= 20 ? "short" : gap <= -20 ? "direct" : "mixed";

  return { mentality, pressing, defensive_line, tempo, passing_style };
}
