// -----------------------------------------------------------------------------
// Infrações específicas de goleiro/lateral (Lei 12) — eventos raros de tiro
// livre indireto que o motor agregado não modelava. Cada uma é uma chance
// POR MINUTO, ponderada pelos atributos do goleiro e o estilo de passe do
// próprio time (times de posse curta arriscam mais o passe pro goleiro).
// -----------------------------------------------------------------------------

import type { PassingStyle, PlayerLike } from "./types";

/**
 * Regra dos 8 segundos (temporada 2025/26 da IFAB): goleiro que demora demais
 * pra soltar a bola concede ESCANTEIO ao adversário — substituiu a punição
 * antiga de tiro livre indireto. Goleiro com Decisões/Compostura baixas
 * demora mais e é pego com mais frequência.
 */
export function eightSecondChancePerMinute(gk: PlayerLike | undefined): number {
  const composure = gk?.attributes?.composure ?? 12;
  const decisions = gk?.attributes?.decisions ?? 12;
  const skillFactor = Math.max(0.4, 1.5 - (composure + decisions) / 40);
  return 0.00035 * skillFactor;
}

/**
 * Back-pass: goleiro toca com a mão numa bola jogada de pé por um
 * companheiro (ou lançamento lateral) — tiro livre indireto perigoso pro
 * adversário perto da área. Times de posse curta arriscam mais esse passe;
 * goleiro com Chute de Meta/Compostura baixos erra a saída com mais frequência.
 */
export function backpassChancePerMinute(gk: PlayerLike | undefined, passing: PassingStyle): number {
  const composure = gk?.attributes?.composure ?? 12;
  const kicking = gk?.attributes?.kicking ?? 12;
  const base = 0.00025;
  const passingFactor = passing === "short" ? 1.3 : passing === "mixed" ? 1 : 0.7;
  const skillFactor = Math.max(0.4, 1.4 - (composure + kicking) / 40);
  return base * passingFactor * skillFactor;
}
