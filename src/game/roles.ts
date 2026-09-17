// -----------------------------------------------------------------------------
// Taxonomia de funções táticas no padrão Football Manager — nomes, posições
// elegíveis e atribuições (duty) reais do jogo, pra resolver o pedido do user
// (2026-09-11): "cada posição do campo tinha funções específicas... um
// atacante não pode ser um zagueiro construtor ou um volante." Antes
// (tactics.ts::ROLE_MOD) tínhamos 11 funções GENÉRICAS aplicáveis a QUALQUER
// posição — esse arquivo substitui aquilo por um catálogo real: ~38 famílias
// de função (Zagueiro Construtor, Box-to-Box, Falso Nove, etc.), cada uma só
// LEGÍVEL nas posições em que faz sentido de verdade, e cada uma com 1-3
// atribuições (Defender/Apoiar/Atacar) — a mesma estrutura de duas camadas
// (função + atribuição) que o FM usa.
//
// Cada família × atribuição vira uma entrada em ALL_ROLES (chave
// `${family.key}_${duty}`). `rolesForPosition(canonical)` filtra pra só as
// funções elegíveis daquela posição — é isso que a UI usa pra nunca oferecer
// "Zagueiro Construtor" pra um centroavante.
// -----------------------------------------------------------------------------
import type { GranularPosition } from "./types";

export type Duty = "defend" | "support" | "attack";

export const DUTY_LABEL: Record<Duty, string> = { defend: "Defender", support: "Apoiar", attack: "Atacar" };
export const DUTY_CODE: Record<Duty, string> = { defend: "De", support: "Su", attack: "At" };

export interface RoleFamily {
  key: string;
  label: string;
  code: string;
  positions: GranularPosition[];
  duties: Duty[];
  signature: string[];
  desc: string;
  diagram: { x: number; y: number; dx: number; dy: number };
}

// Vetor de diagrama em espaço de pixel do mini-campo (viewBox 0 0 100 140,
// y=0 = fundo do gol ADVERSÁRIO/ataque, "pra frente" é sempre dy negativo) —
// mesma convenção de src/routes/.../saves.$saveId.tactics.tsx. Pensado pro
// lado ESQUERDO/CENTRO; espelhado em runtime pro lado direito (ver
// mirrorDiagramForCanonical), então uma família só precisa de UM vetor.
const ROLE_FAMILIES: RoleFamily[] = [
  // --- Goleiro ---------------------------------------------------------------
  { key: "gk", label: "Goleiro", code: "GK", positions: ["GOL"], duties: ["defend"],
    signature: ["reflexes", "handling", "positioning", "command_of_area"],
    desc: "Guarda o gol sem se arriscar — não sai da linha nem se aventura com os pés.",
    diagram: { x: 50, y: 132, dx: 0, dy: 0 } },
  { key: "sk", label: "Goleiro-Líbero", code: "SK", positions: ["GOL"], duties: ["defend", "support", "attack"],
    signature: ["rushing_out", "one_on_ones", "kicking", "agility"],
    desc: "Sai da área pra cobrir o espaço nas costas da defesa e inicia jogadas com os pés.",
    diagram: { x: 50, y: 130, dx: 0, dy: -16 } },

  // --- Zagueiro ---------------------------------------------------------------
  { key: "cd", label: "Zagueiro", code: "CD", positions: ["ZAG"], duties: ["defend"],
    signature: ["marking", "tackling", "positioning", "heading"],
    desc: "Defende sem frescura — sólido no básico, sem se meter em ousadias.",
    diagram: { x: 35, y: 118, dx: 0, dy: -2 } },
  { key: "sp", label: "Zagueiro de Área", code: "SP", positions: ["ZAG"], duties: ["defend"],
    signature: ["heading", "marking", "bravery", "strength"],
    desc: "Sobe pra cortar e disputar bola aérea, prioriza segurança na frente da construção.",
    diagram: { x: 35, y: 116, dx: 2, dy: -6 } },
  { key: "bpd", label: "Zagueiro Construtor", code: "BPD", positions: ["ZAG"], duties: ["defend", "support"],
    signature: ["passing", "vision", "composure", "technique"],
    desc: "Inicia jogadas com passes mais arriscados desde a defesa, procurando o companheiro livre.",
    diagram: { x: 65, y: 116, dx: 6, dy: -18 } },
  { key: "libero", label: "Líbero", code: "L", positions: ["ZAG"], duties: ["support", "attack"],
    signature: ["pace", "passing", "composure", "stamina"],
    desc: "Sai de trás da zaga carregando a bola, quase um meio-campista extra na construção.",
    diagram: { x: 50, y: 110, dx: 0, dy: -40 } },

  // --- Lateral / Ala -----------------------------------------------------------
  { key: "fb", label: "Lateral", code: "FB", positions: ["LD", "LE"], duties: ["defend", "support", "attack"],
    signature: ["tackling", "marking", "pace", "crossing"],
    desc: "Sobe pela linha pra apoiar o ataque e cruzar, sem abrir mão da marcação.",
    diagram: { x: 12, y: 96, dx: 10, dy: -40 } },
  { key: "wb", label: "Ala", code: "WB", positions: ["ALD", "ALE"], duties: ["defend", "support", "attack"],
    signature: ["stamina", "crossing", "pace", "work_rate"],
    desc: "Ocupa toda a lateral como um ponta recuado — sobe e desce o jogo inteiro.",
    diagram: { x: 10, y: 100, dx: 14, dy: -56 } },
  { key: "cwb", label: "Ala Completo", code: "CWB", positions: ["ALD", "ALE"], duties: ["support", "attack"],
    signature: ["crossing", "dribbling", "pace", "technique"],
    desc: "O mais ofensivo dos laterais — vive no campo de ataque como um ponta de verdade.",
    diagram: { x: 10, y: 90, dx: 20, dy: -70 } },
  { key: "ifb", label: "Lateral Invertido", code: "IFB", positions: ["LD", "LE"], duties: ["defend", "support"],
    signature: ["passing", "positioning", "decisions", "tackling"],
    desc: "Fecha pro meio em vez de subir pela linha, virando um volante extra na construção.",
    diagram: { x: 12, y: 96, dx: 26, dy: -14 } },

  // --- Volante ------------------------------------------------------------
  { key: "dm", label: "Volante", code: "DM", positions: ["VOL"], duties: ["defend", "support"],
    signature: ["tackling", "positioning", "work_rate", "passing"],
    desc: "Protege a linha de zaga, quebra as jogadas do adversário no meio e distribui simples.",
    diagram: { x: 50, y: 80, dx: 10, dy: -6 } },
  { key: "anchor", label: "Trinco", code: "A", positions: ["VOL"], duties: ["defend"],
    signature: ["positioning", "tackling", "anticipation", "concentration"],
    desc: "Fica sempre na frente da zaga sem se aventurar — a última barreira antes da defesa.",
    diagram: { x: 50, y: 84, dx: 0, dy: -2 } },
  { key: "hb", label: "Meio-Campo Recuado", code: "HB", positions: ["VOL"], duties: ["defend"],
    signature: ["marking", "tackling", "composure", "passing"],
    desc: "Desce pra formar uma linha de 3 com os zagueiros quando o time tem a bola.",
    diagram: { x: 50, y: 100, dx: 0, dy: 14 } },
  { key: "dlp", label: "Armador Recuado", code: "DLP", positions: ["VOL", "MC"], duties: ["defend", "support"],
    signature: ["passing", "vision", "decisions", "first_touch"],
    desc: "Organiza o jogo mais recuado, manda a bola pros setores mais avançados do time.",
    diagram: { x: 50, y: 76, dx: -10, dy: -8 } },
  { key: "bwm", label: "Volante de Marcação", code: "BWM", positions: ["VOL", "MC"], duties: ["defend", "support"],
    signature: ["tackling", "aggression", "work_rate", "stamina"],
    desc: "Persegue o portador da bola adversário pelo campo inteiro pra recuperar a posse.",
    diagram: { x: 50, y: 78, dx: 16, dy: -10 } },
  { key: "regista", label: "Regista", code: "REG", positions: ["VOL"], duties: ["support"],
    signature: ["vision", "passing", "flair", "technique"],
    desc: "Livre pra circular e ditar o ritmo com passes verticais, sem função defensiva fixa.",
    diagram: { x: 50, y: 74, dx: -14, dy: -4 } },

  // --- Meio-campo central --------------------------------------------------
  { key: "cm", label: "Meio-Campo Central", code: "CM", positions: ["MC"], duties: ["defend", "support", "attack"],
    signature: ["passing", "stamina", "positioning", "decisions"],
    desc: "Função equilibrada — ajuda na marcação e na construção sem exagerar em nenhuma das duas.",
    diagram: { x: 50, y: 70, dx: 6, dy: -16 } },
  { key: "bbm", label: "Box-to-Box", code: "BBM", positions: ["MC"], duties: ["support"],
    signature: ["stamina", "work_rate", "tackling", "off_the_ball"],
    desc: "Corre o campo inteiro — ajuda na marcação recuado e chega à área adversária no fim da jogada.",
    diagram: { x: 50, y: 74, dx: 6, dy: -42 } },
  { key: "ap", label: "Armador Avançado", code: "AP", positions: ["MC", "MEI"], duties: ["support", "attack"],
    signature: ["vision", "flair", "technique", "passing"],
    desc: "Cria as jogadas mais perto do ataque, recebendo entre as linhas do meio e da defesa rival.",
    diagram: { x: 50, y: 56, dx: 6, dy: -16 } },
  { key: "mezzala", label: "Mezzala", code: "MEZ", positions: ["MC"], duties: ["support", "attack"],
    signature: ["dribbling", "passing", "off_the_ball", "technique"],
    desc: "Sai do corredor central pelos meios-espaços pra criar superioridade e chegar à área.",
    diagram: { x: 50, y: 66, dx: 20, dy: -30 } },
  { key: "rpm", label: "Armador Móvel", code: "RPM", positions: ["MC"], duties: ["support"],
    signature: ["vision", "flair", "passing", "decisions"],
    desc: "Larga a posição fixa pra sempre aparecer livre e manter a bola circulando.",
    diagram: { x: 50, y: 68, dx: -16, dy: -10 } },

  // --- Meia-atacante --------------------------------------------------------
  { key: "am", label: "Meia-Atacante", code: "AM", positions: ["MEI"], duties: ["support", "attack"],
    signature: ["passing", "vision", "technique", "off_the_ball"],
    desc: "Fica entre as linhas logo atrás do ataque, ligando o meio à finalização.",
    diagram: { x: 50, y: 44, dx: 4, dy: -16 } },
  { key: "ss", label: "Homem-Sombra", code: "SS", positions: ["MEI"], duties: ["attack"],
    signature: ["off_the_ball", "finishing", "acceleration", "composure"],
    desc: "Se esconde atrás do centroavante e surge de surpresa dentro da área pra finalizar.",
    diagram: { x: 50, y: 40, dx: 6, dy: -22 } },
  { key: "enganche", label: "Enganche", code: "ENG", positions: ["MEI"], duties: ["support"],
    signature: ["vision", "flair", "technique", "passing"],
    desc: "Joga livre de função defensiva, sempre de cara pro gol adversário criando pro ataque.",
    diagram: { x: 50, y: 48, dx: -6, dy: -8 } },
  { key: "trequartista", label: "Trequartista", code: "TQ", positions: ["MEI"], duties: ["attack"],
    signature: ["flair", "dribbling", "technique", "off_the_ball"],
    desc: "O criador mais livre e driblador de todos — resolve sozinho perto da área.",
    diagram: { x: 50, y: 42, dx: 8, dy: -14 } },

  // --- Meia lateral (mais recuado que a ponta) --------------------------------
  { key: "wm", label: "Meia Lateral", code: "WM", positions: ["MD", "ME"], duties: ["defend", "support", "attack"],
    signature: ["stamina", "crossing", "work_rate", "passing"],
    desc: "Ocupa a lateral do meio-campo — ajuda na marcação e apoia o ataque pelo corredor.",
    diagram: { x: 14, y: 66, dx: 20, dy: -14 } },
  { key: "dw", label: "Ponta Defensivo", code: "DW", positions: ["MD", "ME"], duties: ["defend"],
    signature: ["tackling", "positioning", "stamina", "work_rate"],
    desc: "Praticamente um lateral extra pela ponta — prioriza cobrir o corredor a atacar.",
    diagram: { x: 14, y: 70, dx: 6, dy: -4 } },

  // --- Ponta (mais avançado que a meia lateral) -------------------------------
  { key: "winger", label: "Ponta", code: "W", positions: ["PD", "PE"], duties: ["support", "attack"],
    signature: ["pace", "dribbling", "crossing", "acceleration"],
    desc: "Ataca pela linha lateral, dribla o marcador e cruza pra área.",
    diagram: { x: 14, y: 54, dx: 30, dy: -12 } },
  { key: "iw", label: "Ponta Invertida", code: "IW", positions: ["PD", "PE"], duties: ["support", "attack"],
    signature: ["technique", "passing", "dribbling", "vision"],
    desc: "Corta pra dentro no pé bom em vez de ir até a linha de fundo, criando pra área.",
    diagram: { x: 14, y: 52, dx: 34, dy: -16 } },
  { key: "insideforward", label: "Falso Ponta", code: "IF", positions: ["PD", "PE"], duties: ["support", "attack"],
    signature: ["finishing", "dribbling", "off_the_ball", "acceleration"],
    desc: "Corta pra dentro pra finalizar de perna boa, quase um segundo atacante.",
    diagram: { x: 14, y: 44, dx: 34, dy: -18 } },
  { key: "raumdeuter", label: "Raumdeuter", code: "RD", positions: ["PD", "PE"], duties: ["attack"],
    signature: ["off_the_ball", "acceleration", "anticipation", "finishing"],
    desc: "Fica escondido na linha do impedimento e ataca o espaço vazio na hora certa.",
    diagram: { x: 14, y: 30, dx: 30, dy: -20 } },

  // --- Centroavante --------------------------------------------------------
  { key: "af", label: "Atacante Avançado", code: "AF", positions: ["CA"], duties: ["attack"],
    signature: ["finishing", "off_the_ball", "acceleration", "composure"],
    desc: "Sempre na linha do último zagueiro, ataca o espaço nas costas da defesa.",
    diagram: { x: 50, y: 16, dx: 6, dy: -8 } },
  { key: "poacher", label: "Matador de Área", code: "P", positions: ["CA"], duties: ["attack"],
    signature: ["finishing", "off_the_ball", "composure", "anticipation"],
    desc: "Vive dentro da área — prioriza faro de gol e finalização, participa pouco da construção.",
    diagram: { x: 50, y: 14, dx: 8, dy: -4 } },
  { key: "cf", label: "Centroavante Completo", code: "CF", positions: ["CA"], duties: ["support", "attack"],
    signature: ["finishing", "passing", "technique", "strength"],
    desc: "Faz de tudo na frente — finaliza, cria e ainda participa do jogo aéreo.",
    diagram: { x: 50, y: 26, dx: 4, dy: -12 } },
  { key: "tm", label: "Pivô de Referência", code: "TM", positions: ["CA"], duties: ["support", "attack"],
    signature: ["heading", "strength", "first_touch", "jumping_reach"],
    desc: "Segura a bola de costas pro gol, brigando no jogo aéreo, e serve os companheiros.",
    diagram: { x: 50, y: 24, dx: 0, dy: 10 } },
  { key: "dlf", label: "Centroavante Recuado", code: "DLF", positions: ["CA"], duties: ["support", "attack"],
    signature: ["passing", "first_touch", "technique", "vision"],
    desc: "Recua pra receber de costas e ligar o jogo antes de voltar pra área.",
    diagram: { x: 50, y: 32, dx: -6, dy: 14 } },
  { key: "f9", label: "Falso Nove", code: "F9", positions: ["CA"], duties: ["support"],
    signature: ["vision", "technique", "passing", "off_the_ball"],
    desc: "Larga a posição de referência e recua pro meio, puxando a marcação e abrindo espaço.",
    diagram: { x: 50, y: 36, dx: -14, dy: 18 } },
  { key: "pf", label: "Atacante de Pressão", code: "PF", positions: ["CA"], duties: ["defend", "support", "attack"],
    signature: ["work_rate", "stamina", "aggression", "anticipation"],
    desc: "O primeiro a pressionar a saída de bola adversária, sempre no encalço do zagueiro.",
    diagram: { x: 50, y: 20, dx: 10, dy: -6 } },
];

export interface RoleDef {
  key: string;
  familyKey: string;
  label: string;
  shortCode: string;
  duty: Duty;
  positions: GranularPosition[];
  signature: string[];
  desc: string;
  diagram: { x: number; y: number; dx: number; dy: number };
  // Deltas táticos (potência bruta, não 0-100 — ver tactics.ts::rateTacticalTeam),
  // derivados da atribuição (Defender empurra def, Atacar empurra atk) com um
  // leve ajuste por família (funções de criação puxam mid, etc.).
  atk: number;
  mid: number;
  def: number;
}

const DUTY_BASE: Record<Duty, { atk: number; mid: number; def: number }> = {
  defend: { atk: 0, mid: 1, def: 3 },
  support: { atk: 1, mid: 2, def: 1 },
  attack: { atk: 3, mid: 1, def: 0 },
};

// Empurrão extra por família, além da base da atribuição — reflete o "sabor"
// de cada uma (armador puxa mid, pressão puxa def mesmo sem ser defend etc.)
const FAMILY_TACTICAL_NUDGE: Record<string, { atk?: number; mid?: number; def?: number }> = {
  bpd: { mid: 1 }, libero: { mid: 1, atk: 1 }, dlp: { mid: 2 }, regista: { mid: 2 },
  bwm: { def: 1 }, ap: { mid: 1, atk: 1 }, mezzala: { atk: 1 }, rpm: { mid: 1 },
  cwb: { atk: 1 }, wb: { atk: 1 }, pf: { def: 1 }, f9: { mid: 1 },
  cf: { mid: 1 }, dlf: { mid: 1 }, anchor: { def: 1 }, hb: { def: 1 },
};

function buildRoleDef(f: RoleFamily, duty: Duty): RoleDef {
  const base = DUTY_BASE[duty];
  const nudge = FAMILY_TACTICAL_NUDGE[f.key] ?? {};
  return {
    key: `${f.key}_${duty}`,
    familyKey: f.key,
    label: `${f.label} (${DUTY_LABEL[duty]})`,
    shortCode: `${f.code}-${DUTY_CODE[duty]}`,
    duty,
    positions: f.positions,
    signature: f.signature,
    desc: f.desc,
    diagram: f.diagram,
    atk: base.atk + (nudge.atk ?? 0),
    mid: base.mid + (nudge.mid ?? 0),
    def: base.def + (nudge.def ?? 0),
  };
}

export const ALL_ROLES: RoleDef[] = ROLE_FAMILIES.flatMap((f) => f.duties.map((d) => buildRoleDef(f, d)));
export const ROLES_BY_KEY: Record<string, RoleDef> = Object.fromEntries(ALL_ROLES.map((r) => [r.key, r]));

export function rolesForPosition(pos: GranularPosition): RoleDef[] {
  return ALL_ROLES.filter((r) => r.positions.includes(pos));
}

// Função-padrão de uma posição — a mais "genérica"/equilibrada de cada uma,
// usada como fallback quando um slot ainda não tem função escolhida. Uma por
// posição canônica (não por família), por isso mapeado explicitamente em vez
// de pego "o primeiro da lista" (a ordem de ROLE_FAMILIES é só didática).
const DEFAULT_ROLE_KEY: Record<GranularPosition, string> = {
  GOL: "gk_defend", ZAG: "cd_defend", LD: "fb_support", LE: "fb_support",
  ALD: "wb_support", ALE: "wb_support",
  VOL: "dm_support", MC: "cm_support", MD: "wm_support", ME: "wm_support",
  MEI: "am_support", PD: "winger_support", PE: "winger_support", CA: "af_attack",
};

export function defaultRoleForPosition(pos: GranularPosition): RoleDef {
  return ROLES_BY_KEY[DEFAULT_ROLE_KEY[pos]] ?? rolesForPosition(pos)[0] ?? ALL_ROLES[0];
}

// Resolve uma chave de função salva — se veio de ANTES dessa reforma (chave
// antiga tipo "sweeper_keeper"/"stopper", sem atribuição) ou aponta pra uma
// função que não é mais legal naquela posição (ex.: escalação salva antes,
// função removida/trocada), cai no padrão da posição em vez de mostrar vazio
// ou quebrar. Nunca lança erro — sempre devolve uma função válida.
export function resolveRole(key: string | null | undefined, pos: GranularPosition): RoleDef {
  if (key) {
    const found = ROLES_BY_KEY[key];
    if (found && found.positions.includes(pos)) return found;
  }
  return defaultRoleForPosition(pos);
}

// Espelha o vetor do diagrama pro lado direito quando a posição canônica é
// do lado direito (LD/MD/PD) — os diagramas em ROLE_FAMILIES foram pensados
// olhando pro lado esquerdo.
export function mirrorDiagramForCanonical(d: { x: number; y: number; dx: number; dy: number }, canonical: GranularPosition) {
  if (!/D$/.test(canonical) || canonical === "GOL") return d;
  return { ...d, x: 100 - d.x, dx: -d.dx };
}
