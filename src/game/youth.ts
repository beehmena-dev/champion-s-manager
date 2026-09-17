// -----------------------------------------------------------------------------
// Geração de juniores — lógica pura (sem I/O).
//
// A cada temporada, cada clube recebe 1-2 juniores novos (16-18 anos) pra
// base. A qualidade média escala com a reputação do clube (academia de clube
// grande produz talento melhor, em média), mas com variância generosa —
// de vez em quando sai uma "joia" acima do esperado até em clube pequeno.
// Atributos completos no padrão FM — ver src/game/attributes.ts. Overall
// segue a mesma fórmula ponderada por posição usada no resto do elenco.
// -----------------------------------------------------------------------------

import type { GranularPosition } from "./types";
import { generateAttributes, attributesOverall, footLabelFromAttributes, type PlayerAttributes } from "./attributes";

export type BasePosition = "GK" | "DEF" | "MID" | "FWD";

const SLOTS: { position: BasePosition; natural: GranularPosition }[] = [
  { position: "GK", natural: "GOL" },
  { position: "DEF", natural: "ZAG" }, { position: "DEF", natural: "ZAG" },
  { position: "DEF", natural: "LD" }, { position: "DEF", natural: "LE" },
  { position: "DEF", natural: "ALD" }, { position: "DEF", natural: "ALE" },
  { position: "MID", natural: "VOL" }, { position: "MID", natural: "MC" }, { position: "MID", natural: "MEI" },
  { position: "FWD", natural: "PD" }, { position: "FWD", natural: "PE" }, { position: "FWD", natural: "CA" },
];

const FIRST_NAMES = [
  "Kauã", "Ryan", "Miguel", "Davi", "Gustavo", "Bryan", "Emerson", "Wesley",
  "Matheus", "Lucas", "Gabriel", "Vitor", "Yuri", "Breno", "Caio", "Theo",
  "Nathan", "Erick", "Igor", "Rafael",
];
const LAST_NAMES = [
  "Nascimento", "Farias", "Rocha", "Azevedo", "Monteiro", "Pinheiro", "Cardoso",
  "Ramalho", "Brandão", "Siqueira", "Freitas", "Aguiar", "Lopes", "Correia",
  "Barros", "Tavares", "Medeiros", "Coutinho", "Sampaio", "Guedes",
];

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function generateYouthName(rng: () => number = Math.random): string {
  const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

export interface YouthPlayer {
  name: string;
  age: number;
  position: BasePosition;
  naturalPosition: GranularPosition;
  foot: "left" | "right" | "both";
  attributes: PlayerAttributes;
  overall: number;
  potential: number;
  marketValue: number;
  wage: number;
}

export function generateYouthPlayer(
  clubReputation: number, facilityLevel = 3, rng: () => number = Math.random,
): YouthPlayer {
  const slot = SLOTS[Math.floor(rng() * SLOTS.length)];
  const age = 16 + Math.floor(rng() * 3); // 16-18

  // Nível médio de atributo (escala 1-20) escalado pela reputação do clube —
  // reputação 30 → ~7.7, reputação 90 → ~13.1 — com variância generosa
  // (aplicada dentro de generateAttributes). Base de elite (5 estrelas) dá
  // um empurrão; base fraca (1 estrela) puxa pra baixo (ver catálogo da
  // diretoria em src/game/board.ts).
  const facilityBonus = (facilityLevel - 3) * 0.6;
  const baseLevel = 5 + clubReputation * 0.09 + facilityBonus;
  const attributes = generateAttributes(slot.position, baseLevel, rng);
  const overall = attributesOverall(slot.position, attributes);

  // Potencial: teto de overall que o jogador pode alcançar desenvolvendo
  // (treino/jogos — ver applyPositionProgress em development.ts e
  // applyTraining em training.ts não impõem esse teto hoje, é só
  // informativo pra tela de Central da base). Quanto mais novo, maior a
  // margem; de vez em quando ("joia") sai bem acima do normal.
  const ageMargin = age <= 16 ? 22 : age === 17 ? 17 : 12;
  const isGem = rng() < 0.08 + (facilityLevel - 3) * 0.015; // base melhor = mais joias
  const potentialMargin = Math.round(ageMargin * (0.5 + rng() * 0.7) * (isGem ? 1.8 : 1) * (1 + (facilityLevel - 3) * 0.08));
  const potential = clamp(overall + potentialMargin, overall, 99);

  return {
    name: generateYouthName(rng),
    age,
    position: slot.position,
    naturalPosition: slot.natural,
    // Derivado da força real de cada pé (attributes.left_foot/right_foot,
    // já geradas por generateAttributes acima) — não é mais um sorteio à
    // parte, fica sempre consistente com o que os atributos mostram.
    foot: footLabelFromAttributes(attributes),
    attributes,
    overall,
    potential,
    marketValue: Math.round(Math.pow(Math.max(overall - 25, 1), 2.1) * 12),
    wage: Math.round(2000 + overall * 180),
  };
}
