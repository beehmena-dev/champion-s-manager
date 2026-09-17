// -----------------------------------------------------------------------------
// Scouting e atributos ocultos — lógica pura (sem I/O).
//
// Jogadores do SEU clube são sempre conhecidos por completo (você os vê
// treinar todo dia). Jogadores de outros clubes começam com um "conhecimento
// público" baseado na reputação do clube e no overall (estrelas grandes são
// conhecidas mesmo sem escalar olheiro) — e sobe de verdade só com uma
// scouting_assignment ativa (ver src/lib/scouting.ts), que soma a esse valor
// público um "conhecimento de olheiro" que cresce dia a dia.
//
// Conforme o conhecimento efetivo sobe, os atributos deixam de ser uma faixa
// larga e imprecisa e viram números exatos — a mesma progressão do FM/FM
// Touch (jogador "desconhecido" → "observado" → "bem escoutado" → "conhecido
// a fundo").
// -----------------------------------------------------------------------------

export interface KnowledgeTier {
  min: number;
  label: string;
  overallSpread: number; // 0 = número exato
  attrSpread: number;    // 0 = número exato; -1 = nem mostra
  showValue: boolean;    // valor de mercado / salário
}

export const KNOWLEDGE_TIERS: KnowledgeTier[] = [
  { min: 85, label: "Conhecido a fundo", overallSpread: 0, attrSpread: 0, showValue: true },
  { min: 55, label: "Bem escoutado", overallSpread: 2, attrSpread: 2, showValue: true },
  { min: 25, label: "Observado", overallSpread: 6, attrSpread: 4, showValue: false },
  { min: 0, label: "Pouco conhecido", overallSpread: 12, attrSpread: -1, showValue: false },
];

export function tierFor(knowledge: number): KnowledgeTier {
  return KNOWLEDGE_TIERS.find((t) => knowledge >= t.min) ?? KNOWLEDGE_TIERS[KNOWLEDGE_TIERS.length - 1];
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Conhecimento público de base — o que qualquer torcedor/analista já sabe
 * sobre um jogador sem escalar olheiro nenhum. Calibrado contra dados reais
 * de uma base FM24 importada (reputação de clube 36-92, overall 40-95):
 * um astro global de um clube badalado (ex. Mbappé 95 no Real Madrid rep91)
 * já nasce "Conhecido a fundo" (≥85, atributos exatos) — pedido explícito
 * do backlog ("jogador famoso mostra atributos exatos pra todo mundo").
 * Um jogador mediano de clube pequeno (ex. overall 50/reputação 40) fica
 * perto de 0 ("Pouco conhecido") e só sobe de verdade escalando olheiro.
 */
export function baseKnowledge(clubReputation: number, overall: number): number {
  return clamp(Math.round(overall * 1.1 + clubReputation * 0.6 - 72), 0, 100);
}

export function effectiveKnowledge(scoutKnowledge: number, clubReputation: number, overall: number): number {
  return clamp(baseKnowledge(clubReputation, overall) + scoutKnowledge, 0, 100);
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Gera uma faixa "lo-hi" ao redor do valor real, deslocada de forma
 * determinística (mesma semente = mesma faixa sempre, não fica variando a
 * cada render) pra não entregar o valor real centralizado na faixa.
 */
export function fuzzRange(trueValue: number, spread: number, seed: string): [number, number] {
  if (spread <= 0) return [trueValue, trueValue];
  const rng = mulberry32(hashSeed(seed));
  const bias = Math.round((rng() - 0.5) * spread * 1.4);
  const lo = clamp(trueValue + bias - spread, 1, 99);
  const hi = clamp(trueValue + bias + spread, 1, 99);
  return [lo, hi];
}

export const SCOUT_KNOWLEDGE_GAIN_PER_DAY = 8;
export const MAX_CONCURRENT_SCOUTING = 3;

/**
 * Um olheiro-chefe bom acelera o ritmo de observação e libera mais vagas
 * simultâneas — ver src/game/staff.ts (skill 0 = sem olheiro-chefe contratado).
 */
export function scoutGainPerDay(chiefScoutSkill: number): number {
  return Math.round(SCOUT_KNOWLEDGE_GAIN_PER_DAY * (1 + chiefScoutSkill / 20));
}

export function maxConcurrentScouting(chiefScoutSkill: number): number {
  return MAX_CONCURRENT_SCOUTING + (chiefScoutSkill >= 15 ? 1 : 0);
}
