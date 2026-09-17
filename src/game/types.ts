import type { PlayerAttributes } from "./attributes";
import type { PlayerInstructions } from "./player-instructions";
import type { TextureEvent } from "./texture";

export type Position = "GK" | "DEF" | "MID" | "FWD";

// -----------------------------------------------------------------------------
// Posições granulares (estilo Football Manager). Cada slot de formação mapeia
// para uma dessas — é o que permite dizer "esse jogador é ZAG natural mas
// joga VOL como proficiente" em vez de só "DEF" genérico.
// -----------------------------------------------------------------------------
export type GranularPosition =
  | "GOL"                 // goleiro
  | "ZAG"                 // zagueiro (centro)
  | "LD" | "LE"           // lateral direito / esquerdo
  | "ALD" | "ALE"         // ala direita / esquerda (wing-back — mais ofensivo que o lateral,
                          // nota própria no CSV do Genie Scout: "A E"/"A D", distinta de "D E"/"D D")
  | "VOL"                 // volante (meio defensivo)
  | "MC"                  // meio-campo central
  | "MD" | "ME"           // meia direita / esquerda (ou ponta recuado)
  | "MEI"                 // meia-atacante central (armador avançado)
  | "PD" | "PE"           // ponta direita / esquerda
  | "CA";                 // centroavante

export const GRANULAR_POSITIONS: GranularPosition[] = [
  "GOL", "ZAG", "LD", "LE", "ALD", "ALE", "VOL", "MC", "MD", "ME", "MEI", "PD", "PE", "CA",
];

export const GRANULAR_POSITION_LABELS: Record<GranularPosition, string> = {
  GOL: "Goleiro", ZAG: "Zagueiro", LD: "Lateral direito", LE: "Lateral esquerdo",
  ALD: "Ala direita", ALE: "Ala esquerda",
  VOL: "Volante", MC: "Meio-campo", MD: "Meia direita", ME: "Meia esquerda",
  MEI: "Meia-atacante", PD: "Ponta direita", PE: "Ponta esquerda", CA: "Centroavante",
};

// Traduz um código de posição granular (ex: "VOL") pro rótulo em português —
// usado em toda tela que lista jogadores, pra não mostrar o código cru.
export function positionLabel(code: string | null | undefined): string {
  if (!code) return "";
  return GRANULAR_POSITION_LABELS[code as GranularPosition] ?? code;
}

export interface PlayerLike {
  id: string;
  name: string;
  position: Position | string;
  // Posição natural granular (ex: "CA"). Rende 100% dos atributos nela.
  natural_position?: GranularPosition | string | null;
  // Posições onde o jogador é proficiente, mas não é seu forte (ex: ["PD"]).
  // Rendem ~90% dos atributos. Qualquer outra posição = ~72%, com mais chance
  // de lance ruim no relato da partida.
  secondary_positions?: (GranularPosition | string)[] | null;
  // Progresso evolutivo por posição (0-100), fonte da verdade da
  // familiaridade — ver familiarityFor() em tactics.ts. natural_position e
  // secondary_positions acima são sincronizados automaticamente a partir daqui.
  position_progress?: Record<string, number> | null;
  injured_until?: string | null;
  injury_type?: string | null;
  injury_history?: unknown[] | null;
  injury_risk_until?: string | null;
  suspended_matches?: number | null;
  yellow_cards_season?: number | null;
  // Data em que o jogador chegou no clube ATUAL (YYYY-MM-DD). NULL = elenco
  // importado via seed, sem data real conhecida — tratado como neutro pela
  // química de elenco (nunca penaliza um time que "sempre" jogou junto só
  // por falta de dado). Ver squadChemistryMultiplier em tactics.ts.
  club_since?: string | null;
  overall: number;
  // Atributos completos no padrão Football Manager (47 campos, escala 1-20
  // — ver src/game/attributes.ts). Substituiu os 12 campos soltos que
  // existiam antes (finishing/passing/tackling/... na raiz do jogador).
  attributes: PlayerAttributes;
  form: number;
  morale: number;
  condition: number;
}

export interface ClubLike {
  id: string;
  name: string;
  short_name?: string | null;
  morale?: number;
  reputation?: number;
  formation?: FormationCode;
  mentality?: Mentality;
  pressing?: number;        // 1..5
  defensive_line?: number;  // 1..5
  tempo?: number;           // 1..5
  passing_style?: PassingStyle;
  // Team Fluidity — o quanto o time se solta da posição fixa/troca de zona
  // (ver src/game/live-positions.ts::buildOpenPlay). Só afeta o POSICIONAMENTO
  // visual, nunca o motor estatístico (mesmo espírito de pressão/roamDepth).
  team_fluidity?: TeamFluidity;
  // Cobradores de bola parada + capitão (ver src/game/set-pieces.ts). NULL =
  // motor escolhe o melhor do XI. Só o clube do usuário grava isso; a IA
  // sempre cai na escolha automática.
  penalty_taker_id?: string | null;
  free_kick_taker_id?: string | null;
  corner_taker_id?: string | null;
  captain_id?: string | null;
}

// Antes era uma union fixa dos templates prontos — agora o rótulo exibido é
// CALCULADO a partir de onde o usuário realmente arrastou cada titular
// (ver detectFormationLabel em tactics.ts), então pode ser qualquer
// combinação tipo "4-1-3-2", não só uma das 11 conhecidas. Os templates
// prontos continuam existindo como `FORMATION_CODES` (tactics.ts) — usados
// pro dropdown de início rápido e pro auto-escalar da IA.
export type FormationCode = string;
export type Mentality = "defensive" | "balanced" | "attacking";
export type PassingStyle = "short" | "mixed" | "direct";
export type TeamFluidity = "structured" | "fluid";

export interface MatchStats {
  possession: number;      // 0..100 (casa)
  shotsHome: number;
  shotsAway: number;
  onTargetHome: number;
  onTargetAway: number;
  cornersHome: number;
  cornersAway: number;
  foulsHome: number;
  foulsAway: number;
  offsidesHome: number;
  offsidesAway: number;
}

export interface MatchEvent {
  minute: number;
  // "info" = narração sem lado específico (clima/árbitro no início, aviso
  // de acréscimo) — sempre grava side:"home" por convenção, ignorado na
  // exibição. "offside" = impedimento marcado (Lei 11), "var" = revisão do
  // VAR reverteu uma decisão (Lei 6, só usada em partidas com VAR).
  type: "goal" | "yellow" | "red" | "sub" | "chance" | "save" | "injury" | "info" | "offside" | "var";
  side: "home" | "away";
  text: string;
  playerId?: string;
}

export interface MatchLineupEntry {
  slot: string;
  playerId: string;
  playerName: string;
  // Função tática (chave em ROLES_BY_KEY, ver roles.ts) e instruções
  // normalizadas (ver player-instructions.ts) REALMENTE usadas nesta
  // partida — opcionais pra não quebrar partidas já salvas no banco antes
  // desses campos existirem. Permitem que o visualizador (live-positions.ts)
  // respeite a tática de verdade em vez de só a formação/posição crua.
  roleKey?: string;
  instructions?: PlayerInstructions;
  // Team Fluidity do time DESTE jogador (ver ClubLike.team_fluidity acima) —
  // repetido por jogador (mesmo padrão de roleKey/instructions) pra
  // live-positions.ts ler direto de MatchLineupEntry sem precisar de mais
  // parâmetros nas funções de posicionamento.
  teamFluidity?: TeamFluidity;
  // Coordenada livre (0-100%) escolhida pelo usuário na tela de Tática —
  // ver src/game/tactics.ts (SlotSpec.x/y). Ausente pra times sem lineup
  // customizado (IA), que caem pro layout estático do template
  // (slotCoords em formation-layout.ts) dentro de live-positions.ts.
  posX?: number;
  posY?: number;
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  homeAttackRating: number;
  awayAttackRating: number;
  // Desgaste tático de cada lado (pressão/ritmo escolhidos) — usado pra
  // escalar o desgaste de condição pós-jogo, ver src/lib/advance-day.ts.
  homeFatigue: number;
  awayFatigue: number;
  stats?: MatchStats;
  ratings?: { playerId: string; rating: number; goals: number }[];
  // Cartões e lesões da partida, prontos pra persistir (ver src/lib/advance-day.ts)
  cards?: { playerId: string; type: "yellow" | "red" }[];
  injuries?: { playerId: string; days: number; type: string }[];
  // Formação e escalação de cada lado — usado só pelo visualizador 2D
  // (ver src/components/match-pitch.tsx), não afeta a simulação em si.
  homeFormation?: FormationCode;
  awayFormation?: FormationCode;
  homeLineup?: MatchLineupEntry[];
  awayLineup?: MatchLineupEntry[];
  // Contexto da partida (Leis 1 e 5) — determinístico pela semente, só pra
  // exibição/sabor; ver src/game/match-context.ts.
  referee?: { name: string; strictness: number };
  weather?: { label: string };
  // Micro-eventos de textura tática (ver src/game/texture.ts) — 100%
  // cosméticos nesta fase (nunca influenciam placar/xG/estatística), guardados
  // à parte pra alimentar o visual numa fase futura.
  texture?: TextureEvent[];
}