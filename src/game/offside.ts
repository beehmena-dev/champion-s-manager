// -----------------------------------------------------------------------------
// Impedimento (Lei 11) — o motor de simulação é agregado/estatístico (ver
// simulation.ts), não rastreia posição X/Y de jogador durante a decisão de
// gol/chance. Construir um modelo espacial só pra essa checagem foi
// deliberadamente descartado (ver decisão registrada em 2026-09-12, memória
// do projeto) — o custo de reconciliar com rateTacticalTeam/roles/
// instructions/set-pieces já construídos não valia o ganho, e o próprio
// motor 2D/3D (live-positions.ts) também não faz física espacial de
// verdade, só reconstrói visualmente eventos já decididos.
//
// Em vez disso, o impedimento aqui é um evento probabilístico ligado aos
// MESMOS parâmetros táticos que também controlam a altura da linha
// defensiva na renderização 2D/3D (live-positions.ts::lineY, função de
// `defensive_line`): quanto mais alta a linha do time que defende e mais
// direto/vertical o ataque do adversário, maior a chance de pegar um
// atacante impedido — o número de entrada é o MESMO parâmetro tático que
// dita a armadilha de impedimento na tela, mesmo sem geometria por passe.
// -----------------------------------------------------------------------------

import type { PassingStyle, PlayerLike } from "./types";

export interface OffsideContext {
  attackTempo: number;               // 1..5 do time atacante
  attackPassing: PassingStyle;
  defenderLine: number;              // 1..5 do time que defende (linha alta = mais armadilha)
}

/** Chance de impedimento POR MINUTO em que esse time ataca. */
export function offsideChancePerMinute(ctx: OffsideContext): number {
  const directness = ctx.attackPassing === "direct" ? 1.3 : ctx.attackPassing === "mixed" ? 1 : 0.75;
  const tempoFactor = 0.7 + ctx.attackTempo * 0.12;   // ataque rápido busca mais bola em profundidade
  const trapFactor = 0.5 + ctx.defenderLine * 0.22;   // linha alta do adversário = armadilha mais frequente
  return 0.0016 * directness * tempoFactor * trapFactor;
}

/**
 * Sorteia qual atacante ficou impedido — pesa pela falta de Antecipação (lê
 * mal o momento do passe) e por depender mais do jogo em profundidade
 * (Movimentação Sem Bola alta = ataca mais o espaço nas costas = mais
 * exposto à armadilha).
 */
export function pickOffsidePlayer(attackers: PlayerLike[], rng: () => number): PlayerLike | undefined {
  if (!attackers.length) return undefined;
  const weights = attackers.map((p) => {
    const discipline = (p.attributes?.anticipation ?? 10) * 0.7 + (p.attributes?.decisions ?? 10) * 0.3;
    const depthRisk = (p.attributes?.off_the_ball ?? 10) * 0.4;
    return Math.max(1, 22 - discipline * 0.7 + depthRisk * 0.3);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < attackers.length; i++) {
    r -= weights[i];
    if (r <= 0) return attackers[i];
  }
  return attackers[attackers.length - 1];
}
