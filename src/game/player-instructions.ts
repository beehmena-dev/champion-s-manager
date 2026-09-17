// -----------------------------------------------------------------------------
// Instruções de jogador — a 3ª camada do sistema tático real do FM, além de
// Função+Atribuição (ver roles.ts). No vídeo do FM21 Touch que o user mandou,
// a tela "PLAYER INSTRUCTIONS" (aberta a partir de cada slot) tem, além do
// dropdown de Função/Atribuição: Intensidade de Pressão, Entradas (Tackling),
// Marcação, Liberdade de Movimento (uma "bússola" 2 eixos — profundidade ×
// amplitude), Passe (curto/direto), Drible, Finalização e Risco.
//
// "Marcar um jogador específico do adversário por NOME" ficou de fora aqui de
// propósito — no FM de verdade isso é uma tela SEPARADA ("Opposition
// Instructions", escolhida por partida, sabendo quem é o adversário), não faz
// sentido gravado numa tática/preset genérico reutilizado indefinidamente.
// "Marcação" aqui é o instrução GENÉRICA real do FM (Tight/Loose Marking).
//
// Cada campo é 1 passo (-1/0/+1) em torno do padrão do FM em vez de um valor
// contínuo — mais simples de exibir (3 botões ou um dial) e já é a resolução
// real do FM Touch mobile (não tem slider fino, tem estados discretos).
// -----------------------------------------------------------------------------

export type InstructionLevel = -1 | 0 | 1;

export interface PlayerInstructions {
  pressing: InstructionLevel;   // Intensidade de pressão: menos ↔ mais
  tackling: InstructionLevel;   // Entradas: cuidado ↔ duro (carrinho)
  marking: InstructionLevel;    // Marcação: solta ↔ colada
  roamDepth: InstructionLevel;  // Bússola (eixo Y): recuado ↔ avançado
  roamWidth: InstructionLevel;  // Bússola (eixo X): fechado ↔ aberto
  passing: InstructionLevel;    // Passe: curto ↔ direto
  dribble: InstructionLevel;    // Drible: menos ↔ mais
  shoot: InstructionLevel;      // Finalização: menos ↔ mais
  risk: InstructionLevel;       // Risco: cauteloso ↔ arriscado
}

export const DEFAULT_INSTRUCTIONS: PlayerInstructions = {
  pressing: 0, tackling: 0, marking: 0, roamDepth: 0, roamWidth: 0,
  passing: 0, dribble: 0, shoot: 0, risk: 0,
};

function clampLevel(v: unknown): InstructionLevel {
  return v === -1 || v === 1 ? v : 0;
}

// Nunca quebra em dado ausente/velho (tactic_lineups sem a coluna, presets
// salvos antes desta feature) — sempre volta um objeto completo no padrão.
export function normalizeInstructions(v: unknown): PlayerInstructions {
  const o = (v ?? {}) as Partial<Record<keyof PlayerInstructions, unknown>>;
  return {
    pressing: clampLevel(o.pressing), tackling: clampLevel(o.tackling), marking: clampLevel(o.marking),
    roamDepth: clampLevel(o.roamDepth), roamWidth: clampLevel(o.roamWidth), passing: clampLevel(o.passing),
    dribble: clampLevel(o.dribble), shoot: clampLevel(o.shoot), risk: clampLevel(o.risk),
  };
}

export function isDefaultInstructions(ins: PlayerInstructions): boolean {
  return (Object.keys(DEFAULT_INSTRUCTIONS) as (keyof PlayerInstructions)[]).every((k) => ins[k] === 0);
}

// -----------------------------------------------------------------------------
// Efeito mecânico — nudge pequeno em cima do que a Função+Atribuição já dá
// (ver FAMILY_TACTICAL_NUDGE/DUTY_BASE em roles.ts, escala ~0-4 por eixo antes
// de ×5 em rateTacticalTeam). Aqui a escala já sai comparável a ESSE ×5 pra
// somar direto sem reescalar de novo — um jogador em "recuado -1" some pouco
// (não troca de função sozinho), "avançado +1" empurra um pouco mais de ataque
// às custas de defesa, igual um lateral que sobe mais na prática.
// -----------------------------------------------------------------------------
export function instructionTacticalDelta(ins: PlayerInstructions): { atk: number; mid: number; def: number } {
  const atk = ins.roamDepth * 2.2 + ins.risk * 1.6 + ins.shoot * 1.4 + ins.dribble * 0.8 - ins.marking * 1.2;
  const def = -ins.roamDepth * 1.6 - ins.risk * 1.0 + ins.marking * 1.8 + ins.tackling * 1.2;
  const mid = -ins.passing * 0.6 + Math.abs(ins.roamWidth) * 0.6;
  return { atk, mid, def };
}

// Peso extra no sorteio de quem toma cartão (ver pickWeighted em simulation.ts)
// — só valores positivos (entrada mais dura/pressão mais alta arrisca mais
// falta; nenhuma instrução aqui reduz o risco abaixo do que a Agressividade
// natural do jogador já dá).
export function instructionCardWeight(ins: PlayerInstructions): number {
  return Math.max(0, ins.tackling * 3 + ins.pressing * 1.5);
}

// Peso extra no sorteio de quem finaliza/decide a jogada (ver openPlayScorer
// em simulation.ts) — jogador instruído a arriscar mais/driblar mais/chutar
// mais participa mais das finalizações do time.
export function instructionScorerWeight(ins: PlayerInstructions): number {
  return Math.max(0, ins.shoot * 3 + ins.dribble * 1.5 + ins.risk * 1);
}

// Delta na chance de "lance ruim" (ver familiarityFor().errorChance em
// tactics.ts, usado em simulation.ts) — jogar arriscado/com muito drible gera
// mais perda de bola; jogar cauteloso reduz. Pode ficar negativo (o clamp de
// não-negativo final é feito por quem soma, em simulation.ts).
export function instructionRiskDelta(ins: PlayerInstructions): number {
  return ins.risk * 0.02 + ins.dribble * 0.01 + Math.max(0, ins.passing) * 0.01;
}

export const INSTRUCTION_META: Record<keyof Omit<PlayerInstructions, "roamDepth" | "roamWidth">, { label: string; low: string; high: string; desc: string }> = {
  pressing: { label: "Pressão", low: "Menos", high: "Mais", desc: "Intensidade com que persegue o portador da bola sem a posse." },
  tackling: { label: "Entradas", low: "Cuidado", high: "Duro", desc: "Quão forte disputa a bola no desarme — mais duro arrisca mais cartão." },
  marking: { label: "Marcação", low: "Solta", high: "Colada", desc: "Marcação colada prioriza grudar no adversário em vez de atacar." },
  passing: { label: "Passe", low: "Curto", high: "Direto", desc: "Prioriza troca de passes curtos ou bola mais direta e vertical." },
  dribble: { label: "Drible", low: "Menos", high: "Mais", desc: "Tenta menos ou mais dribles individuais na condução de bola." },
  shoot: { label: "Finalização", low: "Menos", high: "Mais", desc: "Arrisca menos ou mais chutes de média/longa distância." },
  risk: { label: "Risco", low: "Cauteloso", high: "Arriscado", desc: "Joga mais seguro (menos erro, menos criação) ou mais arriscado (mais erro, mais criação)." },
};

export const ROAM_META = {
  depth: { label: "Profundidade", low: "Recuado", high: "Avançado" },
  width: { label: "Amplitude", low: "Fechado", high: "Aberto" },
  desc: "Liberdade de movimento — o quanto se posiciona mais recuado/avançado e mais fechado/aberto do que a função pede.",
};
