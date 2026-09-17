import type { GranularPosition, PlayerLike } from "./types";
import { GRANULAR_POSITIONS } from "./types";

// -----------------------------------------------------------------------------
// Evolução de familiaridade posicional.
//
// Cada vez que um jogador atua numa posição em uma partida:
//  - o progresso NAQUELA posição sobe (ele vai se acostumando)
//  - o progresso da posição NATURAL atual cai um pouco, SE ele estiver jogando
//    em outro lugar com frequência (ela "enferruja" por desuso)
//
// Se uma posição não-natural ultrapassa 85 de progresso E supera o progresso
// da posição natural atual, ela vira a nova posição natural — e a antiga
// natural volta a ser tratada como posição secundária (guardando o progresso
// que sobrou dela).
// -----------------------------------------------------------------------------

const GAIN_PER_MATCH = 3;
const RUST_PER_MATCH = 1;
const RUST_FLOOR = 20; // a posição natural nunca esquece de vez
const PROMOTION_THRESHOLD = 85;

export interface PositionProgressUpdate {
  id: string;
  position_progress: Record<string, number>;
  natural_position?: string;
  secondary_positions?: string[];
}

/**
 * Aplica progresso de familiaridade após uma partida.
 * `appearances` mapeia playerId -> posição granular canônica jogada nessa partida.
 */
export function applyPositionProgress(
  players: PlayerLike[],
  appearances: Map<string, GranularPosition>,
): PositionProgressUpdate[] {
  const updates: PositionProgressUpdate[] = [];

  for (const player of players) {
    const playedCanonical = appearances.get(player.id);
    if (!playedCanonical) continue; // não jogou essa partida, sem mudança

    const naturalPos = (player.natural_position ?? player.position) as string;
    const progress: Record<string, number> = { ...(player.position_progress ?? {}) };

    // Garante que a posição natural atual tenha um valor de partida (100 se
    // nunca foi setado, pra jogadores importados antes desse sistema existir).
    if (progress[naturalPos] == null) progress[naturalPos] = 100;

    // Sobe o progresso da posição jogada nesta partida.
    const before = progress[playedCanonical] ?? (playedCanonical === naturalPos ? 100 : 15);
    progress[playedCanonical] = Math.min(100, before + GAIN_PER_MATCH);

    // Enferruja a posição natural SE ele jogou em outro lugar.
    if (playedCanonical !== naturalPos) {
      progress[naturalPos] = Math.max(RUST_FLOOR, (progress[naturalPos] ?? 100) - RUST_PER_MATCH);
    }

    // Checa promoção: a posição jogada supera a natural e passa do teto?
    let newNatural = naturalPos;
    if (
      playedCanonical !== naturalPos &&
      progress[playedCanonical] >= PROMOTION_THRESHOLD &&
      progress[playedCanonical] > (progress[naturalPos] ?? 0)
    ) {
      newNatural = playedCanonical;
    }

    // Recalcula a lista de posições secundárias (exibição/compat) a partir do
    // progresso: qualquer posição com 50-84 de progresso que não seja a
    // natural atual entra como secundária.
    const secondary = GRANULAR_POSITIONS.filter(
      (pos) => pos !== newNatural && (progress[pos] ?? 0) >= 50 && (progress[pos] ?? 0) < PROMOTION_THRESHOLD,
    );
    // Posições >= 85 que não sejam a nova natural também contam como
    // secundárias "fortes" (ex: um jogador pode ter duas posições ótimas).
    for (const pos of GRANULAR_POSITIONS) {
      if (pos !== newNatural && (progress[pos] ?? 0) >= PROMOTION_THRESHOLD && !secondary.includes(pos)) {
        secondary.push(pos);
      }
    }

    updates.push({
      id: player.id,
      position_progress: progress,
      ...(newNatural !== naturalPos ? { natural_position: newNatural } : {}),
      secondary_positions: secondary,
    });
  }

  return updates;
}