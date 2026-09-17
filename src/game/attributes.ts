// -----------------------------------------------------------------------------
// Atributos de jogador no padrão Football Manager — escala 1-20 cada, mesma
// lista oficial usada pelo próprio jogo (conferida em duas fontes: fminside.net
// e sortitoutsi.net). Substitui o conjunto simplificado de 12 atributos que o
// projeto usava antes (finishing/passing/tackling/pace/stamina/dribbling/
// heading/vision/positioning/gk_reflexes/gk_handling/gk_positioning).
//
// First Touch e Passing são os DOIS atributos que o FM mostra tanto no grupo
// Técnico quanto no grupo Goleiro — não são duplicados aqui, são o mesmo
// campo reaproveitado nos dois grupos (é assim que o FM real funciona: um
// goleiro "usa" first_touch/passing da lista técnica, não tem uma versão
// própria). Por isso o grupo "Goleiro" abaixo tem 11 campos exclusivos, não 13
// — os outros 2 do grupo (First Touch, Passing) apontam pros mesmos campos
// do grupo Técnico.
// -----------------------------------------------------------------------------

export interface PlayerAttributes {
  // Técnico (14)
  corners: number;
  crossing: number;
  dribbling: number;
  finishing: number;
  first_touch: number;
  free_kick_taking: number;
  heading: number;
  long_shots: number;
  long_throws: number;
  marking: number;
  passing: number;
  penalty_taking: number;
  tackling: number;
  technique: number;
  // Mental (14)
  aggression: number;
  anticipation: number;
  bravery: number;
  composure: number;
  concentration: number;
  decisions: number;
  determination: number;
  flair: number;
  leadership: number;
  off_the_ball: number;
  positioning: number;
  teamwork: number;
  vision: number;
  work_rate: number;
  // Físico (8)
  acceleration: number;
  agility: number;
  balance: number;
  jumping_reach: number;
  natural_fitness: number;
  pace: number;
  stamina: number;
  strength: number;
  // Goleiro — exclusivos (11; first_touch/passing acima cobrem os 2 restantes)
  aerial_reach: number;
  command_of_area: number;
  communication: number;
  eccentricity: number;
  handling: number;
  kicking: number;
  one_on_ones: number;
  reflexes: number;
  rushing_out: number;
  tendency_to_punch: number;
  throwing: number;
  // Pés (2) — igual ao FM real, força de cada pé (1-20), não é só uma
  // categoria "destro/canhoto". Gerado à parte do resto (ver FOOT_KEYS):
  // não é ligado à posição, segue a distribuição real do futebol.
  left_foot: number;
  right_foot: number;
}

export type AttributeKey = keyof PlayerAttributes;

export const TECHNICAL_KEYS: AttributeKey[] = [
  "corners", "crossing", "dribbling", "finishing", "first_touch", "free_kick_taking",
  "heading", "long_shots", "long_throws", "marking", "passing", "penalty_taking",
  "tackling", "technique",
];
export const MENTAL_KEYS: AttributeKey[] = [
  "aggression", "anticipation", "bravery", "composure", "concentration", "decisions",
  "determination", "flair", "leadership", "off_the_ball", "positioning", "teamwork",
  "vision", "work_rate",
];
export const PHYSICAL_KEYS: AttributeKey[] = [
  "acceleration", "agility", "balance", "jumping_reach", "natural_fitness", "pace",
  "stamina", "strength",
];
// Grupo "Goleiro" pra exibição — inclui first_touch/passing (compartilhados
// com o Técnico) junto dos 11 exclusivos, igual à tela real do FM.
export const GOALKEEPING_KEYS: AttributeKey[] = [
  "aerial_reach", "command_of_area", "communication", "eccentricity", "first_touch",
  "handling", "kicking", "one_on_ones", "passing", "reflexes", "rushing_out",
  "tendency_to_punch", "throwing",
];
// Grupo à parte (igual ao FM real, fora dos 4 grupos principais).
export const FOOT_KEYS: AttributeKey[] = ["left_foot", "right_foot"];

export const ATTRIBUTE_LABEL: Record<AttributeKey, string> = {
  corners: "Escanteios", crossing: "Cruzamentos", dribbling: "Drible", finishing: "Finalização",
  first_touch: "Primeiro Toque", free_kick_taking: "Cobrança de Falta", heading: "Cabeceio",
  long_shots: "Chute de Longe", long_throws: "Arremesso Longo", marking: "Marcação",
  passing: "Passe", penalty_taking: "Cobrança de Pênalti", tackling: "Desarme", technique: "Técnica",
  aggression: "Agressividade", anticipation: "Antecipação", bravery: "Bravura", composure: "Compostura",
  concentration: "Concentração", decisions: "Decisões", determination: "Determinação", flair: "Criatividade",
  leadership: "Liderança", off_the_ball: "Movimentação", positioning: "Posicionamento", teamwork: "Trabalho em Equipe",
  vision: "Visão de Jogo", work_rate: "Ritmo de Trabalho",
  acceleration: "Aceleração", agility: "Agilidade", balance: "Equilíbrio", jumping_reach: "Impulsão",
  natural_fitness: "Condicionamento", pace: "Velocidade", stamina: "Fôlego", strength: "Força",
  aerial_reach: "Alcance Aéreo", command_of_area: "Domínio de Área", communication: "Comunicação",
  eccentricity: "Excentricidade", handling: "Segurança nas Mãos", kicking: "Chute de Meta",
  one_on_ones: "Um contra Um", reflexes: "Reflexos", rushing_out: "Saída do Gol",
  tendency_to_punch: "Tendência a Socar", throwing: "Reposição de Mão",
  left_foot: "Pé Esquerdo", right_foot: "Pé Direito",
};

export const ATTRIBUTE_GROUPS: { label: string; keys: AttributeKey[] }[] = [
  { label: "Técnico", keys: TECHNICAL_KEYS },
  { label: "Mental", keys: MENTAL_KEYS },
  { label: "Físico", keys: PHYSICAL_KEYS },
  { label: "Goleiro", keys: GOALKEEPING_KEYS },
  { label: "Pés", keys: FOOT_KEYS },
];

function clamp(v: number, lo = 1, hi = 20): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

// -----------------------------------------------------------------------------
// Resumo em 5 eixos (escala 0-100) pro gráfico radar da ficha do jogador e do
// comparador. Média simples dos atributos relevantes × 5. Goleiro tem eixos
// próprios. Ordem = ordem dos vértices no radar (eixos afins ficam adjacentes).
// -----------------------------------------------------------------------------
export interface RadarAxis {
  label: string;
  value: number;
}

export function radarScores(a: PlayerAttributes, position: "GK" | "DEF" | "MID" | "FWD"): RadarAxis[] {
  const avg = (keys: AttributeKey[]) =>
    Math.round((keys.reduce((s, k) => s + (a[k] ?? 10), 0) / keys.length) * 5);

  if (position === "GK") {
    return [
      { label: "Reflexos", value: avg(["reflexes", "one_on_ones", "aerial_reach"]) },
      { label: "Área", value: avg(["command_of_area", "handling", "rushing_out", "communication"]) },
      { label: "Distribuição", value: avg(["kicking", "throwing", "passing", "first_touch"]) },
      { label: "Mental", value: avg(["concentration", "decisions", "positioning", "composure", "anticipation"]) },
      { label: "Físico", value: avg(["agility", "acceleration", "jumping_reach", "strength"]) },
    ];
  }
  return [
    { label: "Técnico", value: avg(["first_touch", "technique", "passing", "dribbling", "crossing"]) },
    { label: "Ofensivo", value: avg(["finishing", "off_the_ball", "long_shots", "flair", "composure"]) },
    { label: "Físico", value: avg(["pace", "acceleration", "stamina", "strength", "agility", "jumping_reach"]) },
    { label: "Defensivo", value: avg(["marking", "tackling", "positioning", "heading", "aggression", "bravery"]) },
    { label: "Mental", value: avg(["vision", "decisions", "anticipation", "concentration", "teamwork", "work_rate"]) },
  ];
}

// Cor de um atributo pela faixa, no estilo FM (verde forte / mediano / fraco).
export function attributeTone(v: number): "ok" | "info" | "warn" | "neutral" {
  if (v >= 15) return "ok";
  if (v >= 11) return "info";
  if (v >= 7) return "warn";
  return "neutral";
}

// -----------------------------------------------------------------------------
// Prós/contras por jogador — mesma ideia do dossiê de time em
// opponent-analysis.ts (frases curtas de olheiro), mas em cima do PERFIL DE
// ATRIBUTOS individual. Só considera os atributos relevantes pra posição do
// jogador (mesma lista de PRIMARY_BY_POSITION que já guia a geração) — não
// faz sentido elogiar/criticar a marcação de um centroavante.
// -----------------------------------------------------------------------------
const PRO_PHRASE: Partial<Record<AttributeKey, string>> = {
  finishing: "Finalizador nato — poucas chances desperdiçadas na área.",
  long_shots: "Chute de fora perigoso — arrisca e acerta de longe.",
  dribbling: "Drible de ruptura — desequilibra no 1x1.",
  pace: "Velocidade de ponta — ganha a corrida na maioria das vezes.",
  acceleration: "Explosão nos primeiros metros — sai na frente da marcação.",
  heading: "Presença aérea forte — perigoso em bolas paradas.",
  crossing: "Cruzamento de qualidade — cria pelos flancos.",
  passing: "Passe preciso — visão pra furar linhas defensivas.",
  vision: "Enxerga o passe que os outros não veem.",
  tackling: "Desarme limpo — ganha a bola sem sujar.",
  marking: "Marcação grudada — não dá espaço pro atacante.",
  positioning: "Sempre no lugar certo — leitura de jogo apurada.",
  strength: "Físico avassalador no corpo a corpo.",
  stamina: "Fôlego de sobra — mantém o nível os 90 minutos.",
  composure: "Frio na hora de decidir.",
  work_rate: "Corre por dois — intensidade do início ao fim.",
  reflexes: "Reflexos rápidos debaixo das traves.",
  handling: "Segurança nas mãos — poucos rebotes perigosos.",
  one_on_ones: "Especialista em cara a cara com o atacante.",
  command_of_area: "Domina a área em cruzamentos e escanteios.",
  off_the_ball: "Movimentação inteligente — sempre se livra da marcação.",
  decisions: "Decide bem sob pressão — poucas escolhas erradas.",
  technique: "Técnica refinada — controla qualquer bola.",
  first_touch: "Primeiro toque impecável — nunca perde o controle.",
  anticipation: "Antecipa a jogada antes de acontecer.",
  bravery: "Não teme o choque — entra em qualquer disputa.",
  flair: "Criatividade rara — resolve fora do óbvio.",
  jumping_reach: "Impulsão de sobra — domina o jogo aéreo.",
  teamwork: "Joga pro coletivo — encaixa em qualquer sistema.",
};
const CON_PHRASE: Partial<Record<AttributeKey, string>> = {
  finishing: "Desperdiça chances — pouco frio na hora da finalização.",
  pace: "Falta de velocidade — sofre em corridas longas.",
  acceleration: "Lento pra sair do lugar — perde a primeira disputa.",
  heading: "Fraco no jogo aéreo — perde disputas simples de cabeça.",
  tackling: "Desarme impreciso — comete faltas ou erra o carrinho.",
  marking: "Marcação relapsa — perde a referência do atacante.",
  positioning: "Posicionamento questionável — se perde nas coberturas.",
  strength: "Físico frágil — perde o corpo a corpo.",
  stamina: "Cansa cedo — cai de rendimento no 2º tempo.",
  passing: "Passe impreciso — erra saídas simples.",
  vision: "Visão de jogo limitada — joga no óbvio.",
  composure: "Afobado nos momentos decisivos.",
  work_rate: "Pouca intensidade — some em alguns lances.",
  reflexes: "Reflexos lentos — vulnerável a chutes de perto.",
  handling: "Insegurança nas mãos — gera rebote perigoso.",
  decisions: "Toma decisões ruins sob pressão.",
  dribbling: "Trava no 1x1 — perde a bola com facilidade.",
  crossing: "Cruzamento impreciso — pouca qualidade pelos flancos.",
  bravery: "Evita o choque — recua na disputa física.",
  off_the_ball: "Movimentação previsível — fácil de marcar.",
  jumping_reach: "Pouca impulsão — perde disputas aéreas.",
  technique: "Técnica crua — trava com a bola no pé.",
};

export interface ScoutBullet { key: AttributeKey; label: string; value: number; text: string }

export function playerScoutingNotes(
  position: "GK" | "DEF" | "MID" | "FWD",
  a: Partial<PlayerAttributes>,
): { strengths: ScoutBullet[]; weaknesses: ScoutBullet[] } {
  const keys = PRIMARY_BY_POSITION[position];
  const withVals = keys.map((k) => ({ key: k, label: ATTRIBUTE_LABEL[k], value: a[k] ?? 10 }));

  const strong = withVals
    .filter((x) => PRO_PHRASE[x.key])
    .sort((x, y) => y.value - x.value);
  const weak = withVals
    .filter((x) => CON_PHRASE[x.key])
    .sort((x, y) => x.value - y.value);

  // Corte fixo (>=14 / <=9) quando existe destaque de verdade; sem nenhum
  // ponto extremo, cai pro "relativamente melhor/pior" — mas só dentro de uma
  // faixa que ainda faz sentido como tal (um craque com tudo em 16-20 não
  // pode ter o "menos alto" virando ponto fraco, por isso o fallback de
  // fraqueza trava em <=12 em vez de aceitar qualquer coisa). Um mesmo
  // atributo nunca aparece nos dois lados (`strengthKeys`).
  let strengths = strong.filter((x) => x.value >= 14).slice(0, 4);
  if (strengths.length === 0 && strong.length > 0) strengths = strong.slice(0, 1);

  const strengthKeys = new Set(strengths.map((x) => x.key));
  let weaknesses = weak.filter((x) => x.value <= 9 && !strengthKeys.has(x.key)).slice(0, 4);
  if (weaknesses.length === 0) {
    const fallback = weak.find((x) => x.value <= 12 && !strengthKeys.has(x.key));
    if (fallback) weaknesses = [fallback];
  }

  return {
    strengths: strengths.map((x) => ({ ...x, text: PRO_PHRASE[x.key]! })),
    weaknesses: weaknesses.map((x) => ({ ...x, text: CON_PHRASE[x.key]! })),
  };
}

// -----------------------------------------------------------------------------
// Overall — média ponderada por posição, na mesma escala 5-100 que o projeto
// já usava (permite reaproveitar toda fórmula de salário/valor de mercado/
// negociação calibrada nessa faixa sem precisar remexer em outro lugar).
// Os pesos não são de um datamine oficial do FM (a fórmula real é fechada),
// são uma aproximação razoável do que cada posição mais valoriza.
// -----------------------------------------------------------------------------
type Weighted = [AttributeKey, number];

const GK_WEIGHTS: Weighted[] = [
  ["reflexes", 3], ["handling", 2.5], ["one_on_ones", 2], ["command_of_area", 1.5],
  ["aerial_reach", 1.5], ["positioning", 1.5], ["anticipation", 1.5], ["concentration", 1],
  ["communication", 1], ["kicking", 1], ["decisions", 1], ["agility", 1], ["throwing", 0.5],
];
const DEF_WEIGHTS: Weighted[] = [
  ["marking", 2.5], ["tackling", 2.5], ["positioning", 2.5], ["heading", 1.5], ["strength", 1.5],
  ["anticipation", 2], ["composure", 1], ["bravery", 1], ["aggression", 1], ["concentration", 1],
  ["decisions", 1], ["passing", 1], ["pace", 1.5],
];
const MID_WEIGHTS: Weighted[] = [
  ["passing", 2.5], ["vision", 2], ["technique", 1.5], ["stamina", 1.5], ["work_rate", 1.5],
  ["decisions", 1.5], ["teamwork", 1.5], ["first_touch", 1.5], ["composure", 1], ["positioning", 1],
  ["tackling", 1], ["off_the_ball", 1],
];
const FWD_WEIGHTS: Weighted[] = [
  ["finishing", 2.5], ["dribbling", 1.5], ["pace", 1.5], ["off_the_ball", 2], ["composure", 1.5],
  ["technique", 1.5], ["first_touch", 1.5], ["heading", 1], ["flair", 1], ["decisions", 1], ["acceleration", 1],
];

function weightedAvg(a: PlayerAttributes, weights: Weighted[]): number {
  let sum = 0, total = 0;
  for (const [key, w] of weights) { sum += (a[key] ?? 10) * w; total += w; }
  return total > 0 ? sum / total : 10;
}

export function attributesOverall(position: "GK" | "DEF" | "MID" | "FWD", a: PlayerAttributes): number {
  const weights = position === "GK" ? GK_WEIGHTS : position === "DEF" ? DEF_WEIGHTS : position === "MID" ? MID_WEIGHTS : FWD_WEIGHTS;
  return clamp(Math.round(weightedAvg(a, weights) * 5), 5, 99);
}

// -----------------------------------------------------------------------------
// Aptidão por posição granular (estilo FM) — quão bem os ATRIBUTOS do jogador
// combinam com cada uma das 12 posições do campo, 0-100. Independente de
// experiência de verdade (isso é `position_progress`/`familiarityFor` em
// tactics.ts) — aptidão é só "ele TEM o perfil pra jogar ali", não "ele JÁ
// jogou ali". As duas coisas juntas é que fazem sentido: um zagueiro com
// atributos de lateral (drible/cruzamento decentes) se adapta mais rápido a
// jogar de lateral do que um zagueiro raiz, mesmo que nenhum dos dois nunca
// tenha jogado ali antes. Usado como estimativa de partida em
// `familiarityFor` quando não há progresso registrado pra aquela posição —
// ver a nota em tactics.ts. LD/LE, MD/ME e PD/PE compartilham perfil (lado
// não muda quais atributos importam).
// -----------------------------------------------------------------------------
const POSITION_WEIGHTS: Record<string, Weighted[]> = {
  GOL: GK_WEIGHTS,
  ZAG: DEF_WEIGHTS,
  // LD/LE, ALD/ALE, MD/ME e PD/PE têm o MESMO peso dos dois lados — só a
  // direção que muda, não o perfil de atributo. Antes só o lado D estava
  // definido aqui (L caía no fallback genérico de 50, ignorando o atributo
  // real do jogador — achado ao mexer nessa tabela pra adicionar Ala).
  LD: [
    ["tackling", 2], ["marking", 1.5], ["pace", 2], ["stamina", 1.5], ["crossing", 2],
    ["work_rate", 1.5], ["positioning", 1.5], ["decisions", 1], ["acceleration", 1.5], ["dribbling", 1],
  ],
  // Ala (wing-back) — mais ofensivo/resistente que o lateral, nota própria no
  // CSV do Genie Scout ("A E"/"A D", distinta de "D E"/"D D"). Mesmo perfil de
  // LD, com menos peso em marcação/desarme e mais em cruzamento/resistência.
  ALD: [
    ["crossing", 2], ["stamina", 2.5], ["pace", 2], ["work_rate", 2], ["dribbling", 1.5],
    ["tackling", 1], ["marking", 0.75], ["acceleration", 1.5], ["decisions", 1], ["technique", 1],
  ],
  VOL: [
    ["tackling", 2], ["marking", 1.5], ["positioning", 2], ["passing", 2], ["stamina", 1.5],
    ["work_rate", 1.5], ["decisions", 1.5], ["aggression", 1], ["anticipation", 1.5], ["teamwork", 1],
  ],
  MC: MID_WEIGHTS,
  MD: [
    ["crossing", 2], ["dribbling", 1.5], ["pace", 1.5], ["stamina", 1.5], ["work_rate", 1.5],
    ["technique", 1.5], ["passing", 1.5], ["off_the_ball", 1], ["acceleration", 1.5], ["decisions", 1],
  ],
  MEI: [
    ["passing", 2], ["vision", 2.5], ["technique", 1.5], ["flair", 1.5], ["decisions", 1.5],
    ["first_touch", 1.5], ["off_the_ball", 1.5], ["dribbling", 1.5], ["composure", 1], ["long_shots", 1],
  ],
  PD: [
    ["dribbling", 2.5], ["pace", 2], ["acceleration", 1.5], ["crossing", 1.5], ["flair", 1.5],
    ["technique", 1.5], ["off_the_ball", 1.5], ["finishing", 1], ["agility", 1], ["first_touch", 1],
  ],
  CA: FWD_WEIGHTS,
};
POSITION_WEIGHTS.LE = POSITION_WEIGHTS.LD;
POSITION_WEIGHTS.ALE = POSITION_WEIGHTS.ALD;
POSITION_WEIGHTS.ME = POSITION_WEIGHTS.MD;
POSITION_WEIGHTS.PE = POSITION_WEIGHTS.PD;
POSITION_WEIGHTS.LE = POSITION_WEIGHTS.LD;
POSITION_WEIGHTS.ME = POSITION_WEIGHTS.MD;
POSITION_WEIGHTS.PE = POSITION_WEIGHTS.PD;

export function positionAptitude(a: PlayerAttributes, canonical: string): number {
  const weights = POSITION_WEIGHTS[canonical];
  if (!weights) return 50;
  return clamp(Math.round(weightedAvg(a, weights) * 5), 1, 100);
}

// -----------------------------------------------------------------------------
// Geração "nativa" — usada pra juniores novos e (indiretamente, via
// deriveFullAttributes abaixo) pra qualquer jogador sem atributo completo
// ainda. Nível médio escala com reputação/overall alvo, posição empurra os
// atributos relevantes pra cima, resto fica num nível mais baixo/genérico —
// igual a como o FM distribui: um center-forward não tem Marcação boa.
// -----------------------------------------------------------------------------
const PRIMARY_BY_POSITION: Record<"GK" | "DEF" | "MID" | "FWD", AttributeKey[]> = {
  GK: ["reflexes", "handling", "one_on_ones", "command_of_area", "aerial_reach", "positioning", "communication", "kicking", "throwing", "rushing_out", "agility", "concentration"],
  DEF: ["marking", "tackling", "positioning", "heading", "strength", "anticipation", "bravery", "concentration", "composure"],
  MID: ["passing", "vision", "technique", "stamina", "work_rate", "decisions", "teamwork", "first_touch", "off_the_ball"],
  FWD: ["finishing", "dribbling", "pace", "off_the_ball", "composure", "technique", "first_touch", "flair", "acceleration"],
};

// Atributos que, pra aquela posição, o FM mantém tipicamente BAIXOS (a marcação
// de um centroavante, a finalização de um zagueiro). Sem isso os atributos
// ficam todos amontoados perto do nível-alvo e um craque parece bom em tudo.
const WEAK_BY_POSITION: Record<"GK" | "DEF" | "MID" | "FWD", AttributeKey[]> = {
  GK: [],
  DEF: ["finishing", "long_shots", "flair", "off_the_ball", "dribbling", "crossing", "corners", "free_kick_taking", "penalty_taking", "long_throws"],
  MID: ["long_throws"],
  FWD: ["marking", "tackling", "long_throws"],
};

export function generateAttributes(
  position: "GK" | "DEF" | "MID" | "FWD",
  level: number, // nível médio alvo, escala 1-20
  rng: () => number = Math.random,
): PlayerAttributes {
  const primary = new Set(PRIMARY_BY_POSITION[position]);
  const weak = new Set(WEAK_BY_POSITION[position]);
  const isGkOnly = new Set(["reflexes", "handling", "one_on_ones", "command_of_area", "aerial_reach", "communication", "kicking", "throwing", "rushing_out", "tendency_to_punch", "eccentricity"]);
  const allKeys = [...TECHNICAL_KEYS, ...MENTAL_KEYS, ...PHYSICAL_KEYS, ...GOALKEEPING_KEYS.filter((k) => !TECHNICAL_KEYS.includes(k))];

  const out = {} as PlayerAttributes;
  for (const key of allKeys) {
    // Três faixas: chave da posição (~alvo), genérico (bem abaixo) e fraco
    // (baixo, quase não escala) — dá o espalhamento que o FM real tem.
    let base = level - 3;
    let spread = 3.5;
    if (primary.has(key)) { base = level + 2.5; spread = 3; }
    else if (weak.has(key)) { base = level * 0.33 + 2; spread = 2.5; }
    // Goleiro tem os técnicos de linha (cruzamento, escanteio, marcação...)
    // bem mais fracos; jogador de linha tem os exclusivos de goleiro quase
    // irrelevantes — os dois casos ficam num nível baixo fixo, não escalado.
    if (position === "GK" && TECHNICAL_KEYS.includes(key) && !primary.has(key)) base = 4 + level * 0.15;
    if (position !== "GK" && isGkOnly.has(key)) base = 2 + level * 0.1;
    out[key] = clamp(base + (rng() - 0.45) * spread);
  }

  // Pé bom/pé ruim — força de CADA pé (1-20), não só uma categoria. Não é
  // ligado à posição (um lateral não é mais canhoto que um centroavante),
  // segue a distribuição real do futebol: maioria destra com o esquerdo bem
  // mais fraco, uma minoria canhota (espelhado), poucos genuinamente
  // ambidestros. Mesma proporção 72/20/8 que já era usada só pro rótulo
  // categórico em src/game/youth.ts — agora o número de verdade nasce aqui,
  // e o rótulo (players.foot) passa a ser DERIVADO desses dois valores.
  const footRoll = rng();
  if (footRoll < 0.72) { // destro
    out.right_foot = clamp(14 + rng() * 6);
    out.left_foot = clamp(4 + rng() * 7);
  } else if (footRoll < 0.92) { // canhoto
    out.left_foot = clamp(14 + rng() * 6);
    out.right_foot = clamp(4 + rng() * 7);
  } else { // ambidestro
    const twoFooted = 13 + rng() * 6;
    out.right_foot = clamp(twoFooted + (rng() - 0.5) * 3);
    out.left_foot = clamp(twoFooted + (rng() - 0.5) * 3);
  }
  return out;
}

// Rótulo simples (players.foot) a partir da força real de cada pé — usado
// tanto na importação (seed-import.ts) quanto na geração de base (youth.ts),
// pra nunca ficar dessincronizado do que os atributos realmente dizem.
export function footLabelFromAttributes(a: Pick<PlayerAttributes, "left_foot" | "right_foot">): "left" | "right" | "both" {
  if (a.right_foot >= a.left_foot + 3) return "right";
  if (a.left_foot >= a.right_foot + 3) return "left";
  return "both";
}

// -----------------------------------------------------------------------------
// Deriva o conjunto completo a partir do modelo antigo (12 campos) — usado
// pra importar seed.json existentes (que só trazem esses 12) e pra migrar
// jogadores já salvos no banco. Não é dado real: é uma aproximação
// determinística (mesma entrada → mesma saída) a partir do que já tínhamos,
// documentada como tal — igual ao xG aproximado em src/game/live-stats.ts.
// -----------------------------------------------------------------------------
export interface LegacyBasicAttrs {
  finishing: number; passing: number; tackling: number; pace: number; stamina: number;
  dribbling: number; heading: number; vision: number; positioning: number;
  gk_reflexes: number; gk_handling: number; gk_positioning: number;
}

function hash01(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}
// PRNG determinístico simples (mulberry32) semeado por uma string — pra
// deriveFullAttributes dar sempre o mesmo resultado pro mesmo jogador,
// sem precisar guardar um rng externo.
function seededRng(seed: string): () => number {
  let a = 0;
  for (let i = 0; i < seed.length; i++) a = (a * 31 + seed.charCodeAt(i)) >>> 0;
  a = a || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deriveFullAttributes(
  legacy: LegacyBasicAttrs,
  position: "GK" | "DEF" | "MID" | "FWD",
  seed: string,
): PlayerAttributes {
  const rng = seededRng(seed);
  const level = position === "GK"
    ? (legacy.gk_reflexes + legacy.gk_handling + legacy.gk_positioning) / 3
    : (legacy.finishing + legacy.passing + legacy.tackling + legacy.pace + legacy.stamina + legacy.dribbling + legacy.heading + legacy.vision + legacy.positioning) / 9;

  const base = generateAttributes(position, level, rng);

  // Sobrescreve com correlações diretas onde já tínhamos o dado equivalente
  // (mantém o jogador reconhecível, não gera do zero em cima do que já existia).
  const overrides: Partial<PlayerAttributes> = {
    finishing: legacy.finishing, passing: legacy.passing, tackling: legacy.tackling,
    pace: legacy.pace, stamina: legacy.stamina, dribbling: legacy.dribbling, heading: legacy.heading,
    vision: legacy.vision, positioning: legacy.positioning,
    acceleration: clamp(legacy.pace + (hash01(seed + "acc") - 0.5) * 3),
    agility: clamp(legacy.pace * 0.5 + legacy.dribbling * 0.5 + (hash01(seed + "agi") - 0.5) * 3),
    balance: clamp(legacy.dribbling * 0.5 + level * 0.5 + (hash01(seed + "bal") - 0.5) * 3),
    jumping_reach: clamp(legacy.heading + (hash01(seed + "jmp") - 0.5) * 3),
    strength: clamp(legacy.tackling * 0.4 + level * 0.6 + (hash01(seed + "str") - 0.5) * 3),
    natural_fitness: clamp(legacy.stamina + (hash01(seed + "fit") - 0.5) * 3),
    first_touch: clamp(legacy.passing * 0.4 + legacy.dribbling * 0.4 + level * 0.2),
    technique: clamp(legacy.passing * 0.5 + legacy.dribbling * 0.5),
    decisions: clamp(legacy.vision * 0.6 + level * 0.4),
    anticipation: clamp(legacy.positioning * 0.6 + level * 0.4),
    off_the_ball: clamp(legacy.positioning * 0.4 + legacy.pace * 0.3 + level * 0.3),
  };
  if (position === "GK") {
    Object.assign(overrides, {
      reflexes: legacy.gk_reflexes, handling: legacy.gk_handling, command_of_area: legacy.gk_positioning,
      positioning: legacy.gk_positioning,
      one_on_ones: clamp(legacy.gk_reflexes * 0.5 + legacy.gk_positioning * 0.5),
      aerial_reach: clamp(legacy.gk_positioning * 0.6 + level * 0.4),
    });
  }

  return { ...base, ...overrides };
}

// -----------------------------------------------------------------------------
// Deriva os 47 atributos a partir das notas de habilidade POR POSIÇÃO do FM
// (as 16 colunas "Classificação <pos>" que o Genie Scout exporta — os
// atributos individuais em si a EULA bloqueia). Cada família de posição em
// que o jogador é forte "puxa" pra cima os atributos relevantes: quem pontua
// bem como CA ganha finalização/movimentação, quem pontua bem como zagueiro
// ganha marcação/desarme, ala ganha cruzamento/velocidade, etc. É calculado
// por nós (não é dado cru do FM), mas fica bem mais fiel ao perfil real do
// jogador do que só posição+overall.
// -----------------------------------------------------------------------------
export interface RoleScores {
  gk: number; fb: number; cb: number; dm: number; cm: number; am: number; wing: number; st: number;
}

export function deriveAttributesFromRoles(
  roles: RoleScores,
  position: "GK" | "DEF" | "MID" | "FWD",
  overall: number, // escala 5-100 (o overall real do FM)
  seed: string,
): PlayerAttributes {
  const rng = seededRng(seed);
  const level = overall / 5; // -> escala 1-20
  // Base BEM abaixo do nível: generateAttributes() já dá +2.5 sozinho pros
  // atributos "primary" da posição base (GK/DEF/MID/FWD, ~9 chaves cada) —
  // com offset raso aqui isso sozinho já encostava perto de 20 ANTES do
  // impulso por eixo (A/C/D/W) abaixo rodar, e os dois pulsos se somavam nos
  // MESMOS atributos (ex.: eixo "A" de atacante e o primary de FWD
  // compartilham finishing/off_the_ball/technique/first_touch). Achado real
  // (15/09/2026): simulação mostrava 9-13 atributos em 20 até pra overall 70,
  // bem acima da própria meta documentada aqui (3-5 num craque). Offset mais
  // fundo deixa o impulso por eixo ser quem realmente decide o que fica alto.
  const base = generateAttributes(position, level - 3.6, rng);
  if (position === "GK") return generateAttributes(position, level, rng); // goleiro: geração por posição já cobre bem

  // As notas de habilidade por posição do FM sobem TODAS junto com a qualidade
  // geral do jogador (um craque pontua ok em quase tudo). O que carrega
  // informação de perfil é o FORMATO: quais famílias se destacam acima da
  // média do próprio jogador. Por isso trabalhamos com desvio da média, não
  // com razão pro auge.
  const shape = [roles.fb, roles.cb, roles.dm, roles.cm, roles.am, roles.wing, roles.st];
  const mean = shape.reduce((s, v) => s + v, 0) / shape.length;
  const dev = (v: number) => (v - mean) / 14; // ~ -1..+1 (14 p.p. ≈ desvio grande)

  // Eixos de perfil, só como IMPULSO (>= 0) — os "baixos" de cada posição já
  // vêm de generateAttributes (faixa "weak"); aqui só reforçamos onde o
  // jogador realmente se especializa dentro da posição dele.
  const gate = position === "DEF" ? { D: 1, C: 0.6, A: 0.25, W: 0.7 }
    : position === "FWD" ? { D: 0.25, C: 0.7, A: 1, W: 0.9 }
    : { D: 0.7, C: 1, A: 0.8, W: 0.85 }; // MID
  const pos = (x: number) => Math.max(0, x);
  const A = pos(Math.max(dev(roles.st), dev(roles.am) * 0.8)) * gate.A;
  const C = pos(Math.max(dev(roles.cm), dev(roles.dm) * 0.7, dev(roles.am) * 0.8)) * gate.C;
  const W = pos(Math.max(dev(roles.wing), dev(roles.fb)) - pos(dev(roles.cb) * 0.6)) * gate.W;
  const box = pos((dev(roles.cm) + dev(roles.dm)) / 2);
  const fbApt = pos(dev(roles.fb));
  // Defensivo pode ir LEVEMENTE negativo (meia/atacante puro perde marcação),
  // limitado pra não zerar; o positivo vem de quem joga recuado de verdade.
  const Draw = Math.max(dev(roles.cb), dev(roles.fb) * 0.7, dev(roles.dm) * 0.65) - A * 0.6;
  const D = Math.max(-0.7, Draw) * gate.D;

  // Fator global no impulso por eixo — achado real (15/09/2026, simulação):
  // sem isso, um perfil bem especializado (eixo perto de 1) somado ao base já
  // alto empurrava 9+ atributos pro teto até em overall mediano. Ajustado por
  // tentativa contra scripts/_sim-attrs.ts até bater a meta documentada
  // acima (craque = 3-5 em 20, não a base inteira).
  const AXIS_SCALE = 0.4;
  const b = (v: number, axis: number, k: number) => clamp(v + axis * k * AXIS_SCALE);
  const a: PlayerAttributes = { ...base };

  a.finishing = b(a.finishing, A, 6);
  a.long_shots = b(a.long_shots, A, 5);
  a.off_the_ball = b(a.off_the_ball, A, 5);
  a.composure = b(a.composure, A, 3);
  a.penalty_taking = b(a.penalty_taking, A, 4);

  a.marking = b(a.marking, D, 7);
  a.tackling = b(a.tackling, D, 7);
  a.positioning = b(a.positioning, D, 5);
  a.aggression = b(a.aggression, D, 3);
  a.bravery = b(a.bravery, pos(D), 3);
  a.strength = b(a.strength, Math.max(D, A * 0.6), 4);
  a.heading = b(a.heading, Math.max(D * 0.8, A * 0.7), 5);
  a.jumping_reach = b(a.jumping_reach, Math.max(D * 0.8, A * 0.6), 4);

  a.passing = b(a.passing, C, 6);
  a.vision = b(a.vision, C, 6);
  a.technique = b(a.technique, Math.max(C, A * 0.6), 4);
  a.first_touch = b(a.first_touch, Math.max(C * 0.7, A * 0.5), 4);
  a.decisions = b(a.decisions, C, 3);
  a.free_kick_taking = b(a.free_kick_taking, C, 4);
  a.corners = b(a.corners, Math.max(C, W), 4);

  a.dribbling = b(a.dribbling, Math.max(A * 0.7, W), 5);
  a.flair = b(a.flair, Math.max(A * 0.6, W), 5);
  a.crossing = b(a.crossing, W, 7);
  a.long_throws = b(a.long_throws, fbApt, 3);

  a.pace = b(a.pace, Math.max(W * 0.6, A * 0.5), 4);
  a.acceleration = b(a.acceleration, Math.max(W * 0.6, A * 0.5), 4);
  a.agility = b(a.agility, Math.max(W * 0.5, A * 0.4), 3);

  a.work_rate = b(a.work_rate, Math.max(box, fbApt * 0.7), 4);
  a.stamina = b(a.stamina, Math.max(box, fbApt * 0.8), 4);
  a.teamwork = b(a.teamwork, box, 2);

  return a;
}
