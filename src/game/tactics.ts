import type { FormationCode, GranularPosition, Mentality, PassingStyle, PlayerLike, Position } from "./types";
import { positionAptitude } from "./attributes";
import { defaultRoleForPosition, resolveRole, type RoleDef } from "./roles";
import { normalizeInstructions, instructionTacticalDelta, type PlayerInstructions } from "./player-instructions";

// -----------------------------------------------------------------------------
// Slots por formação. Cada slot mapeia para a posição base (GK/DEF/MID/FWD) e
// a posição granular canônica (usada pra calcular familiaridade — ver
// familiarityFor() mais abaixo — e pra saber quais FUNÇÕES são legais ali,
// ver src/game/roles.ts). `defaultRole` é resolvido dinamicamente a partir da
// posição canônica (a função mais equilibrada dela), não mais uma string
// solta escrita à mão por slot — antes disso apontava pra 11 funções
// genéricas (tactics.ts::ROLE_MOD, removido) que valiam pra QUALQUER posição,
// o que permitia um centroavante "Zagueiro Construtor". Ver roles.ts.
// -----------------------------------------------------------------------------

export interface SlotSpec {
  slot: string;
  position: Position;
  defaultRole: string;
  canonical: GranularPosition;
  // Coordenada livre (0-100%, mesma convenção de FORMATION_LAYOUT) que o
  // usuário deu a esse slot na tela de Tática — ausente quando o slot ainda
  // não saiu do layout padrão do template (ver rateTacticalTeam, que monta
  // um slot "efetivo" com x/y + canonical/position recalculados quando a
  // linha salva em tactic_lineups tiver pos_x/pos_y).
  x?: number;
  y?: number;
}

const F = (slot: string, position: Position, canonical: GranularPosition): SlotSpec =>
  ({ slot, position, canonical, defaultRole: defaultRoleForPosition(canonical).key });

export const FORMATIONS: Record<FormationCode, SlotSpec[]> = {
  "4-4-2": [
    F("GK","GK","GOL"),
    F("LB","DEF","LE"), F("LCB","DEF","ZAG"), F("RCB","DEF","ZAG"), F("RB","DEF","LD"),
    F("LM","MID","ME"), F("LCM","MID","MC"), F("RCM","MID","MC"), F("RM","MID","MD"),
    F("LST","FWD","CA"), F("RST","FWD","CA"),
  ],
  "4-3-3": [
    F("GK","GK","GOL"),
    F("LB","DEF","LE"), F("LCB","DEF","ZAG"), F("RCB","DEF","ZAG"), F("RB","DEF","LD"),
    F("DM","MID","VOL"), F("LCM","MID","MC"), F("RCM","MID","MEI"),
    F("LW","FWD","PE"), F("ST","FWD","CA"), F("RW","FWD","PD"),
  ],
  "4-2-3-1": [
    F("GK","GK","GOL"),
    F("LB","DEF","LE"), F("LCB","DEF","ZAG"), F("RCB","DEF","ZAG"), F("RB","DEF","LD"),
    F("LDM","MID","VOL"), F("RDM","MID","VOL"),
    F("LAM","MID","ME"), F("CAM","MID","MEI"), F("RAM","MID","MD"),
    F("ST","FWD","CA"),
  ],
  "3-5-2": [
    F("GK","GK","GOL"),
    F("LCB","DEF","ZAG"), F("CB","DEF","ZAG"), F("RCB","DEF","ZAG"),
    F("LWB","MID","ALE"), F("LCM","MID","MC"), F("CM","MID","MC"), F("RCM","MID","MC"), F("RWB","MID","ALD"),
    F("LST","FWD","CA"), F("RST","FWD","CA"),
  ],
  "5-3-2": [
    F("GK","GK","GOL"),
    F("LWB","DEF","ALE"), F("LCB","DEF","ZAG"), F("CB","DEF","ZAG"), F("RCB","DEF","ZAG"), F("RWB","DEF","ALD"),
    F("LCM","MID","MC"), F("CM","MID","VOL"), F("RCM","MID","MC"),
    F("LST","FWD","CA"), F("RST","FWD","CA"),
  ],
  "4-1-4-1": [
    F("GK","GK","GOL"),
    F("LB","DEF","LE"), F("LCB","DEF","ZAG"), F("RCB","DEF","ZAG"), F("RB","DEF","LD"),
    F("DM","MID","VOL"),
    F("LM","MID","ME"), F("LCM","MID","MC"), F("RCM","MID","MC"), F("RM","MID","MD"),
    F("ST","FWD","CA"),
  ],
  "4-5-1": [
    F("GK","GK","GOL"),
    F("LB","DEF","LE"), F("LCB","DEF","ZAG"), F("RCB","DEF","ZAG"), F("RB","DEF","LD"),
    F("LM","MID","ME"), F("LCM","MID","MC"), F("CM","MID","MC"), F("RCM","MID","MC"), F("RM","MID","MD"),
    F("ST","FWD","CA"),
  ],
  "3-4-3": [
    F("GK","GK","GOL"),
    F("LCB","DEF","ZAG"), F("CB","DEF","ZAG"), F("RCB","DEF","ZAG"),
    F("LWB","MID","ALE"), F("LCM","MID","MC"), F("RCM","MID","MC"), F("RWB","MID","ALD"),
    F("LW","FWD","PE"), F("ST","FWD","CA"), F("RW","FWD","PD"),
  ],
  "4-4-1-1": [
    F("GK","GK","GOL"),
    F("LB","DEF","LE"), F("LCB","DEF","ZAG"), F("RCB","DEF","ZAG"), F("RB","DEF","LD"),
    F("LM","MID","ME"), F("LCM","MID","MC"), F("RCM","MID","MC"), F("RM","MID","MD"),
    F("SS","FWD","MEI"), F("ST","FWD","CA"),
  ],
  "5-4-1": [
    F("GK","GK","GOL"),
    F("LWB","DEF","ALE"), F("LCB","DEF","ZAG"), F("CB","DEF","ZAG"), F("RCB","DEF","ZAG"), F("RWB","DEF","ALD"),
    F("LM","MID","ME"), F("LCM","MID","MC"), F("RCM","MID","MC"), F("RM","MID","MD"),
    F("ST","FWD","CA"),
  ],
  "4-3-1-2": [
    F("GK","GK","GOL"),
    F("LB","DEF","LE"), F("LCB","DEF","ZAG"), F("RCB","DEF","ZAG"), F("RB","DEF","LD"),
    F("DM","MID","VOL"), F("LCM","MID","MC"), F("RCM","MID","MC"),
    F("AM","MID","MEI"),
    F("LST","FWD","CA"), F("RST","FWD","CA"),
  ],
};

export function formationSlots(f: FormationCode): SlotSpec[] {
  return FORMATIONS[f] ?? FORMATIONS["4-4-2"];
}

// -----------------------------------------------------------------------------
// Tática 100% livre no campo (estilo FM): o usuário arrasta cada titular pra
// QUALQUER ponto do campo, não só pros 11 marcadores fixos de um template —
// ver src/routes/_authenticated/saves.$saveId.tactics.tsx. As três funções
// abaixo fecham esse ciclo: dado o ponto (x,y) onde um jogador foi largado,
// qual posição granular ele passa a jogar de verdade (`canonicalFromCoords`)
// e qual grupo base pra fins de pontuação (`positionGroupFromY`); e dado o
// XI inteiro já posicionado, qual o NOME da formação resultante
// (`detectFormationLabel`) — a etiqueta é sempre CALCULADA a partir da
// arrumação real, nunca escolhida antes.
// -----------------------------------------------------------------------------

// Âncora de referência (x,y) de cada posição granular OUTFIELD — calibrada a
// partir das coordenadas já usadas nos 11 templates de FORMATION_LAYOUT.
// GOL fica de fora de propósito: o goleiro nunca é reclassificado por
// coordenada (ver comentário no chamador, saves.$saveId.tactics.tsx) — um
// jogador de linha empurrado até o fundo do campo deve virar ZAG, não GOL.
const POSITION_ANCHORS: Partial<Record<GranularPosition, { x: number; y: number }>> = {
  ZAG: { x: 50, y: 78 },
  LD: { x: 85, y: 70 }, LE: { x: 15, y: 70 },
  ALD: { x: 88, y: 55 }, ALE: { x: 12, y: 55 },
  VOL: { x: 50, y: 58 },
  MC: { x: 50, y: 48 },
  MD: { x: 80, y: 45 }, ME: { x: 20, y: 45 },
  MEI: { x: 50, y: 28 },
  PD: { x: 82, y: 16 }, PE: { x: 18, y: 16 },
  CA: { x: 50, y: 10 },
};

export function canonicalFromCoords(x: number, y: number): GranularPosition {
  let best: GranularPosition = "MC";
  let bestDist = Infinity;
  for (const [pos, anchor] of Object.entries(POSITION_ANCHORS)) {
    const dist = (anchor!.x - x) ** 2 + (anchor!.y - y) ** 2;
    if (dist < bestDist) { bestDist = dist; best = pos as GranularPosition; }
  }
  return best;
}

// Grupo base (pra fórmula de pontuação ataque/meio/defesa) puramente por
// profundidade — de propósito NÃO depende da posição canônica: um ala (ALD/
// ALE) jogando recuado conta como defesa, o mesmo ala empurrado conta como
// meio, igual acontece de verdade num 5-3-2 vs. 3-5-2.
export function positionGroupFromY(y: number): Position {
  return y >= 65 ? "DEF" : y >= 33 ? "MID" : "FWD";
}

// Vão (em pontos percentuais de profundidade) que separa duas "linhas" do
// time — folga suficiente pra absorver o zigue-zague natural de uma mesma
// linha (ex. zagueiros a 76-80) sem juntar linhas de verdade distintas
// (ex. linha de zagueiro a 76 vs. ala avançado a 55 — vão de 21, bem acima).
const FORMATION_LINE_GAP = 10;

// Nome da formação — calculado, nunca escolhido. Recebe a profundidade (y)
// de cada um dos 10 jogadores de linha (SEM o goleiro), agrupa em linhas por
// vão de profundidade (clustering simples por gap, método padrão pra dado
// 1D) e formata como "4-3-3". Testado contra as coordenadas dos 11
// templates prontos em __tests__/tactics.test.ts — todos batem com o nome
// literal do próprio template.
export function detectFormationLabel(outfieldY: number[]): string {
  if (outfieldY.length === 0) return "";
  const sorted = [...outfieldY].sort((a, b) => b - a); // mais recuado primeiro
  const bands: number[] = [];
  let last: number | null = null;
  for (const y of sorted) {
    if (last === null || last - y > FORMATION_LINE_GAP) bands.push(0);
    bands[bands.length - 1]++;
    last = y;
  }
  return bands.join("-");
}

// -----------------------------------------------------------------------------
// Familiaridade de posição — o coração do que foi pedido: um jogador jogando
// fora da sua posição natural rende menos, e a queda é maior quanto mais longe
// da posição ele está (e não é só um corte fixo: aumenta a chance de lance
// ruim, não só reduz a média).
// -----------------------------------------------------------------------------

export type Familiarity = "natural" | "proficiente" | "desconhecida";

export interface FamiliarityResult {
  level: Familiarity;
  progress: number;      // 0-100, o valor bruto por trás do nível
  multiplier: number;    // aplicado aos atributos efetivos do jogador no slot
  errorChance: number;   // chance extra de "lance ruim" no relato (0..1)
}

// Progresso "assumido" quando o jogador não tem position_progress calculado
// pra essa posição AINDA (nunca atuou ali de verdade — position_progress só
// ganha uma entrada quando o jogador realmente joga a posição, ver
// applyPositionProgress em development.ts). Antes era um corte fixo (60 pra
// qualquer secundária, 15 pra qualquer posição não-listada) — não distinguia
// um lateral que também é ótimo de ala de um que seria péssimo de ponta.
// Agora usa `positionAptitude` (o quanto os ATRIBUTOS do jogador combinam
// com a posição, sem depender de experiência) como estimativa de partida:
// secundária vira um piso de 60 que a aptidão pode empurrar pra cima; posição
// nunca registrada fica sempre abaixo do patamar "proficiente" (50) — a
// aptidão só acelera ou atrasa DENTRO da faixa "desconhecida", a promoção de
// verdade continua exigindo jogar a posição.
function fallbackProgress(player: PlayerLike, canonical: GranularPosition): number {
  const natural = (player.natural_position ?? player.position) as string;
  if (natural === canonical) return 100;
  const aptitude = positionAptitude(player.attributes, canonical);
  if ((player.secondary_positions ?? []).includes(canonical)) {
    return Math.max(60, Math.min(84, aptitude));
  }
  return Math.min(45, Math.round(aptitude * 0.55));
}

export function familiarityFor(player: PlayerLike, canonical: GranularPosition): FamiliarityResult {
  const stored = player.position_progress?.[canonical];
  const progress = typeof stored === "number" ? stored : fallbackProgress(player, canonical);

  const level: Familiarity = progress >= 85 ? "natural" : progress >= 50 ? "proficiente" : "desconhecida";
  // Multiplicador contínuo: 15 de progresso ≈ 0.72x, 100 de progresso = 1.0x.
  // Isso faz o jogador melhorar GRADUALMENTE numa posição nova conforme joga
  // nela, em vez de pular de um degrau fixo pro outro.
  const multiplier = 0.65 + Math.min(100, Math.max(0, progress)) / 100 * 0.35;
  const errorChance = Math.max(0, 0.15 * (1 - progress / 100));

  return { level, progress, multiplier, errorChance };
}

// Quão bem os atributos do jogador batem com a "assinatura" de uma função
// (4 atributos-chave dela, ver roles.ts) — 0..1. Extraído de
// saves.$saveId.tactics.tsx (era local ali) pra reusar também no painel de
// posições da ficha do jogador (saves.$saveId.players.$playerId.tsx).
export function signatureFit(player: Pick<PlayerLike, "attributes" | "overall">, signature: string[]): number {
  const a = (player.attributes ?? {}) as unknown as Record<string, number>;
  const sigAvg = signature.length ? signature.reduce((s, k) => s + (a[k] ?? 10), 0) / signature.length : 10;
  return (sigAvg / 20) * 0.7 + ((player.overall ?? 50) / 100) * 0.3;
}

// Estrela (1-5) de uma função ESPECÍFICA pra um jogador numa posição —
// compara funções entre si pro mesmo jogador na mesma posição.
export function roleFitStars(player: PlayerLike, role: RoleDef, canonical: GranularPosition): number {
  const fam = familiarityFor(player, canonical);
  const score = signatureFit(player, role.signature) * fam.multiplier;
  return Math.max(1, Math.min(5, Math.round(score * 5)));
}

// -----------------------------------------------------------------------------
// Escala coeficientes globais por tática.
// -----------------------------------------------------------------------------

export interface TacticalCoefs {
  attack: number;     // multiplicador do xG ofensivo
  defense: number;    // multiplicador da defesa
  chance: number;     // frequência de chances (0..2)
  possession: number; // viés de posse (-10..+10)
  cards: number;      // multiplicador de cartões
  fatigue: number;    // desgaste extra por jogo (0..1)
}

export function tacticalCoefs(c: {
  mentality?: Mentality;
  pressing?: number;
  defensive_line?: number;
  tempo?: number;
  passing_style?: PassingStyle;
}): TacticalCoefs {
  const mentality = c.mentality ?? "balanced";
  const pressing = clamp(c.pressing ?? 3, 1, 5);
  const line = clamp(c.defensive_line ?? 3, 1, 5);
  const tempo = clamp(c.tempo ?? 3, 1, 5);
  const passing = c.passing_style ?? "mixed";

  const mAtk = mentality === "attacking" ? 1.15 : mentality === "defensive" ? 0.88 : 1.0;
  const mDef = mentality === "attacking" ? 0.92 : mentality === "defensive" ? 1.15 : 1.0;

  return {
    attack: mAtk * (1 + (tempo - 3) * 0.04),
    defense: mDef * (1 + (line - 3) * 0.03) * (1 + (pressing - 3) * 0.02),
    chance: 1 + (tempo - 3) * 0.06 + (pressing - 3) * 0.04,
    possession: (passing === "short" ? 6 : passing === "direct" ? -4 : 0) + (tempo - 3) * -1,
    cards: 1 + (pressing - 3) * 0.15,
    fatigue: 0.05 + (pressing - 3) * 0.02 + (tempo - 3) * 0.01,
  };
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

// -----------------------------------------------------------------------------
// Templates de estilo tático — filosofias reais de futebol (Gegenpressing,
// Tiki-Taka etc., mesma autorização de nomenclatura real do FM usada em
// roles.ts). Cada template é só um atalho pros 5 campos que já existem
// (mentalidade/pressão/linha/ritmo/passe) — não mexe em formação nem
// escalação, então aplicar um nunca perde a configuração de jogadores/funções
// já montada (igual trocar mentalidade ou ritmo manualmente, só que os 5
// juntos de uma vez, coerentes com uma identidade tática de verdade).
// -----------------------------------------------------------------------------

export interface TacticStyle {
  key: string;
  label: string;
  desc: string;
  mentality: Mentality;
  pressing: number;
  defensive_line: number;
  tempo: number;
  passing_style: PassingStyle;
}

export const TACTIC_STYLES: TacticStyle[] = [
  {
    key: "gegenpress", label: "Gegenpressing",
    desc: "Pressão asfixiante assim que perde a bola, pra recuperar rápido perto do gol adversário e atacar em transição.",
    mentality: "attacking", pressing: 5, defensive_line: 5, tempo: 5, passing_style: "mixed",
  },
  {
    key: "tikitaka", label: "Tiki-Taka",
    desc: "Posse de bola paciente com passes curtos e triangulações, sufocando o adversário sem precisar correr atrás da bola.",
    mentality: "balanced", pressing: 3, defensive_line: 4, tempo: 2, passing_style: "short",
  },
  {
    key: "vertical_tikitaka", label: "Tiki-Taka Vertical",
    desc: "Posse de bola rápida — troca curta, mas sempre buscando o próximo passe pra frente em vez de só circular.",
    mentality: "attacking", pressing: 4, defensive_line: 4, tempo: 4, passing_style: "short",
  },
  {
    key: "catenaccio", label: "Catenaccio",
    desc: "Bloco baixo fechado, prioridade total em não sofrer gol — ataca só no contra-golpe pontual.",
    mentality: "defensive", pressing: 2, defensive_line: 1, tempo: 2, passing_style: "direct",
  },
  {
    key: "route_one", label: "Contra-Ataque Direto",
    desc: "Bola longa e rápida pro ataque assim que recupera a posse, sem se preocupar em construir jogada.",
    mentality: "balanced", pressing: 2, defensive_line: 2, tempo: 5, passing_style: "direct",
  },
  {
    key: "wing_play", label: "Jogo pelas Pontas",
    desc: "Ataque construído pelos corredores — pontas e alas isolam o marcador e cruzam pra área.",
    mentality: "balanced", pressing: 3, defensive_line: 3, tempo: 4, passing_style: "mixed",
  },
  {
    key: "total_football", label: "Futebol Total",
    desc: "Linha altíssima e troca de posição constante — o time inteiro ataca e o time inteiro defende junto.",
    mentality: "attacking", pressing: 4, defensive_line: 5, tempo: 3, passing_style: "short",
  },
  {
    key: "park_the_bus", label: "Ônibus na Frente do Gol",
    desc: "Time inteiro recuado atrás da bola, abrindo mão da posse pra não tomar gol a qualquer custo.",
    mentality: "defensive", pressing: 1, defensive_line: 1, tempo: 1, passing_style: "direct",
  },
];

// -----------------------------------------------------------------------------
// Escalação automática dado formação e elenco.
// Considera form × condition × attribute-score por posição.
// -----------------------------------------------------------------------------

export interface StartingXI {
  entries: { slot: SlotSpec; player: PlayerLike }[];
  bench: PlayerLike[];
}

function playerScore(p: PlayerLike, pos: Position, slot?: SlotSpec): number {
  const a = p.attributes;
  const base =
    pos === "GK" ? (a.reflexes + a.handling + a.one_on_ones + a.command_of_area) :
    pos === "DEF" ? (a.marking + a.tackling + a.positioning + a.heading + p.overall / 5) :
    pos === "MID" ? (a.passing + a.vision + a.stamina + a.decisions + p.overall / 5) :
    (a.finishing + a.dribbling + a.pace + a.off_the_ball + p.overall / 5);
  const formMul = 0.7 + (p.form ?? 70) / 300;
  const condMul = 0.6 + (p.condition ?? 100) / 250;
  const famMul = slot ? familiarityFor(p, slot.canonical).multiplier : 1;
  return base * formMul * condMul * famMul;
}

export function autoLineup(players: PlayerLike[], formation: FormationCode): StartingXI {
  const slots = formationSlots(formation);
  const used = new Set<string>();
  const entries: StartingXI["entries"] = [];
  // Prioriza slots por especialidade: GK primeiro, depois DEF/MID/FWD
  const order = [...slots].sort((a, b) => posOrder(a.position) - posOrder(b.position));
  for (const slot of order) {
    // Primeiro tenta achar alguém da posição base (GK/DEF/MID/FWD) certa,
    // ordenado já considerando familiaridade granular (natural > proficiente > desconhecida).
    const cand = players
      .filter((p) => !used.has(p.id) && p.position === slot.position)
      .sort((a, b) => playerScore(b, slot.position, slot) - playerScore(a, slot.position, slot));
    let chosen = cand[0];
    if (!chosen) {
      // fallback: melhor sobrando de qualquer posição (ex: falta lateral, usa outro DEF)
      const any = players
        .filter((p) => !used.has(p.id))
        .sort((a, b) => playerScore(b, slot.position, slot) - playerScore(a, slot.position, slot));
      chosen = any[0];
    }
    if (chosen) {
      used.add(chosen.id);
      entries.push({ slot, player: chosen });
    }
  }
  const bench = players.filter((p) => !used.has(p.id));
  return { entries, bench };
}
function posOrder(p: Position): number {
  return p === "GK" ? 0 : p === "DEF" ? 1 : p === "MID" ? 2 : 3;
}

// -----------------------------------------------------------------------------
// Rating tático de time (com formação, roles, form, condition).
// -----------------------------------------------------------------------------
export interface TeamTacticalRating {
  attack: number;
  midfield: number;
  defense: number;
  overall: number;
  xi: StartingXI;
  coefs: TacticalCoefs;
  // Instruções de jogador REALMENTE escaladas por jogador (ver
  // src/game/player-instructions.ts) — usado pelo motor de simulação pra
  // vieses de cartão/finalização/erro além do delta ataque/meio/defesa já
  // aplicado aqui.
  instructionsByPlayerId: Map<string, PlayerInstructions>;
  // Função REALMENTE escalada por jogador (ver src/game/roles.ts) — usado
  // pela textura tática (src/game/texture.ts, vetor de diagrama) e pelo
  // visualizador (live-positions.ts, via MatchLineupEntry.roleKey).
  roleByPlayerId: Map<string, RoleDef>;
  // Multiplicador de química de elenco já aplicado em attack/midfield/defense
  // (ver squadChemistryMultiplier abaixo) — exposto pra UI mostrar o efeito,
  // não precisa ser reaplicado por quem consome o rating.
  chemistry: number;
}

// -----------------------------------------------------------------------------
// Química de elenco — decisão do FootSim (ver comunidade.footsim.com.br,
// "o entrosamento do elenco deve afetar o motor de partida") venceu de forma
// clara e propositalmente MINIMALISTA: só o tempo que os jogadores já jogam
// juntos, sem nacionalidade/idioma/personalidade (adiado por eles também).
// Aqui: tempo médio de casa (club_since) do XI escalado, mapeado numa curva
// suave. club_since ausente (elenco de seed importado, sem data real) conta
// como "1 ano" (neutro) pra não penalizar times que sempre jogaram juntos só
// por falta de dado — só times remontados via transferência/empréstimo/base
// acumulam a curva de verdade a partir da própria janela de gameplay.
// Efeito pequeno de propósito (±3-4%, nunca decide sozinho um jogo) — é
// tempero, não um dial novo disfarçado.
// -----------------------------------------------------------------------------
const NEUTRAL_TENURE_YEARS = 1;

function tenureYears(clubSince: string | null | undefined, todayISO: string): number {
  if (!clubSince) return NEUTRAL_TENURE_YEARS;
  const days = (new Date(todayISO + "T00:00:00Z").getTime() - new Date(clubSince + "T00:00:00Z").getTime()) / 86_400_000;
  return Math.max(0, days) / 365;
}

export function squadChemistryMultiplier(xiPlayers: { club_since?: string | null }[], todayISO?: string): number {
  if (!todayISO || xiPlayers.length === 0) return 1;
  const avgYears = xiPlayers.reduce((s, p) => s + tenureYears(p.club_since, todayISO), 0) / xiPlayers.length;
  return clamp(1 + (avgYears - NEUTRAL_TENURE_YEARS) * 0.02, 0.94, 1.03);
}

export function rateTacticalTeam(
  players: PlayerLike[],
  club: { formation?: FormationCode; mentality?: Mentality; pressing?: number; defensive_line?: number; tempo?: number; passing_style?: PassingStyle },
  savedLineup?: { player_id: string; slot: string; role: string | null; instructions?: unknown; pos_x?: number | null; pos_y?: number | null }[],
  todayISO?: string,
): TeamTacticalRating {
  const formation = club.formation ?? "4-4-2";
  const slots = formationSlots(formation);

  let xi: StartingXI;
  if (savedLineup && savedLineup.length >= 8) {
    const byId = new Map(players.map((p) => [p.id, p]));
    const bySlot = new Map(savedLineup.map((l) => [l.slot, l]));
    const entries: StartingXI["entries"] = [];
    const used = new Set<string>();
    for (const s of slots) {
      const l = bySlot.get(s.slot);
      const p = l ? byId.get(l.player_id) : undefined;
      if (p && l) {
        // Tática livre: a linha salva pode trazer a coordenada de verdade
        // (usuário arrastou pra fora do ponto padrão do template) — nesse
        // caso a posição/canônica usada na pontuação é a EFETIVA (derivada
        // do ponto real), não mais a fixa do template. Goleiro nunca muda
        // (ver canonicalFromCoords).
        const effSlot = (l.pos_x != null && l.pos_y != null && s.position !== "GK")
          ? { ...s, canonical: canonicalFromCoords(l.pos_x, l.pos_y), position: positionGroupFromY(l.pos_y), x: l.pos_x, y: l.pos_y }
          : s;
        entries.push({ slot: effSlot, player: p });
        used.add(p.id);
      }
    }
    // preenche slots faltantes automaticamente
    for (const s of slots) {
      if (entries.find((e) => e.slot.slot === s.slot)) continue;
      const cand = players.filter((p) => !used.has(p.id) && p.position === s.position)
        .sort((a, b) => playerScore(b, s.position, s) - playerScore(a, s.position, s))[0];
      if (cand) { entries.push({ slot: s, player: cand }); used.add(cand.id); }
    }
    xi = { entries, bench: players.filter((p) => !used.has(p.id)) };
  } else {
    xi = autoLineup(players, formation);
  }

  const coefs = tacticalCoefs(club);
  // Função REALMENTE escolhida por slot (não só a padrão da posição) — antes
  // essa informação existia em `savedLineup` mas só servia pra achar QUEM
  // joga onde; a nota de ataque/meio/defesa sempre usava a função padrão do
  // slot, ignorando a escolhida de verdade. Agora usa a real quando existe.
  const roleBySlot = new Map((savedLineup ?? []).map((l) => [l.slot, l.role]));
  const insBySlot = new Map((savedLineup ?? []).map((l) => [l.slot, normalizeInstructions(l.instructions)]));
  const instructionsByPlayerId = new Map<string, PlayerInstructions>();
  const roleByPlayerId = new Map<string, RoleDef>();

  let atkAcc = 0, midAcc = 0, defAcc = 0, cAtk = 0, cMid = 0, cDef = 0;
  for (const { slot, player } of xi.entries) {
    const role = resolveRole(roleBySlot.get(slot.slot) ?? slot.defaultRole, slot.canonical);
    const instructions = insBySlot.get(slot.slot) ?? normalizeInstructions(null);
    instructionsByPlayerId.set(player.id, instructions);
    roleByPlayerId.set(player.id, role);
    const insDelta = instructionTacticalDelta(instructions);
    const fam = familiarityFor(player, slot.canonical);
    const formMul = 0.7 + (player.form ?? 70) / 300;
    const condMul = 0.6 + (player.condition ?? 100) / 250;
    // familiaridade de posição entra como multiplicador direto nos atributos —
    // jogador fora de posição rende visivelmente menos, não é só um detalhe.
    const eff = (v: number) => v * formMul * condMul * fam.multiplier;
    const a = player.attributes;
    if (slot.position === "FWD") {
      atkAcc += eff(a.finishing + a.dribbling + a.pace + a.off_the_ball + player.overall / 4) + (role.atk ?? 0) * 5 + insDelta.atk;
      defAcc += insDelta.def;
      cAtk++;
    } else if (slot.position === "MID") {
      midAcc += eff(a.passing + a.vision + a.stamina + a.decisions + player.overall / 4) + (role.mid ?? 0) * 5 + insDelta.mid;
      atkAcc += eff(player.overall) * 0.3 + (role.atk ?? 0) * 3 + insDelta.atk;
      defAcc += eff(player.overall) * 0.2 + (role.def ?? 0) * 3 + insDelta.def;
      cMid++;
    } else if (slot.position === "DEF") {
      defAcc += eff(a.tackling + a.marking + a.positioning + a.heading + player.overall / 4) + (role.def ?? 0) * 5 + insDelta.def;
      atkAcc += insDelta.atk;
      cDef++;
    } else {
      // GK — mesmo padrão do DEF: delta de ataque entra como contribuição
      // cruzada (goleiro-líbero avançado/arriscado participa mais da
      // construção), delta de defesa soma direto.
      defAcc += eff(a.reflexes + a.handling + a.one_on_ones + a.command_of_area) + (role.def ?? 0) * 5 + insDelta.def;
      atkAcc += insDelta.atk;
      cDef++;
    }
  }
  const chemistry = squadChemistryMultiplier(xi.entries.map((e) => e.player), todayISO);
  const attack = (atkAcc / Math.max(1, cAtk + cMid * 0.3)) * coefs.attack * chemistry;
  const midfield = (midAcc / Math.max(1, cMid)) * chemistry;
  const defense = (defAcc / Math.max(1, cDef + cMid * 0.2)) * coefs.defense * chemistry;
  const overall = (attack + midfield + defense) / 3;
  return { attack, midfield, defense, overall, xi, coefs, instructionsByPlayerId, roleByPlayerId, chemistry };
}

// attack/midfield/defense de rateTacticalTeam são "potência" bruta (alimentam
// a razão de xG na simulação, não uma escala 0-100) — times de elite passam
// de 100. Pra EXIBIR (barras e números na UI), comprime a faixa acima de 90 e
// trava em 100, sem mexer no valor que o motor usa.
export function ratingToDisplay(v: number): number {
  if (v <= 90) return Math.max(1, Math.round(v));
  return Math.min(100, Math.round(90 + (v - 90) * 0.4));
}