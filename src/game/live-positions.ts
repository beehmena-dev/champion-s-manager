import type { MatchEvent, MatchLineupEntry, FormationCode } from "./types";
import { slotCoords } from "./formation-layout";
import { DEFAULT_INSTRUCTIONS } from "./player-instructions";
import { ROLES_BY_KEY } from "./roles";
import type { TextureEvent } from "./texture";

// -----------------------------------------------------------------------------
// Posicionamento "ao vivo" pra visualização de partida (2D). Nosso motor
// (src/game/simulation.ts) não roda uma simulação espacial contínua — produz
// um resultado com eventos discretos por minuto, sem trajetória de bola nem
// posição de jogador. Este módulo decide, a partir disso, o ALVO tático de
// cada jogador num instante qualquer — "onde ele DEVERIA estar agora"; quem
// consome isso (match-pitch.tsx) persegue esse alvo com posição+velocidade
// reais via src/hooks/use-player-motion.ts, em vez de renderizar o valor
// direto (ver comentário lá pro motivo).
//
// Modelo: o jogo inteiro é dividido em "jogadas" (spells) de posse — cada uma
// com um lado, uma duração e (às vezes) um evento de ataque real que ela
// culmina. Dentro de uma jogada, a bola faz uma sequência de PASSES REAIS:
// visita as posições de verdade de companheiros de time (do mais recuado ao
// mais avançado, por faixa de profundidade — ver `attackerBases`/
// `pickByDepthBand`), não uma curva genérica — e o portador (quem "tem a
// bola" em `buildOpenPlay`) já é sempre quem estiver mais perto dela, então
// segue a sequência de passe sozinho. Quando a jogada termina em gol e o
// motor credita quem marcou, o alvo final é perto do gol de verdade (não a
// posição tática do jogador). Os jogadores reagem continuamente à posição da
// bola: o time que ataca empurra a linha pra frente, o time que defende
// recua e comprime — não é física real, mas também não é mais um
// "chacoalhar" no lugar: o formato do time muda o tempo todo com o jogo,
// como numa partida de verdade.
// -----------------------------------------------------------------------------

const ATTACKING_TYPES = new Set<MatchEvent["type"]>(["goal", "chance", "save"]);
const WINDOW_AFTER = 0.3;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function hash01(seed: number): number {
  const x = Math.sin(seed * 999.7) * 43758.5453;
  return x - Math.floor(x);
}
function hashId(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

// -- Jogadas de posse -----------------------------------------------------

interface Spell {
  start: number;
  end: number;
  side: "home" | "away";
  event: MatchEvent | null;
}

// Divide os 90 minutos em jogadas de posse de 8-22 minutos cada, alternando
// lado com peso pela posse de bola real da partida (result.stats.possession).
// Se um evento de ataque real cai dentro de uma jogada, ela passa a
// pertencer ao lado do evento e termina nele — o resto é "posse que não
// vira nada", que é a maior parte de uma partida de verdade.
function buildSpells(events: MatchEvent[], homePossessionPct: number): Spell[] {
  const attackEvents = events
    .filter((e) => ATTACKING_TYPES.has(e.type))
    .sort((a, b) => a.minute - b.minute);

  const spells: Spell[] = [];
  let t = 0;
  let ei = 0;
  const homeShare = Math.max(0.15, Math.min(0.85, homePossessionPct / 100));

  while (t < 90) {
    const len = 8 + hash01(t * 7.13 + 1) * 14;
    let end = Math.min(90, t + len);
    let side: "home" | "away" = hash01(t * 3.31 + 2) < homeShare ? "home" : "away";
    let event: MatchEvent | null = null;

    while (ei < attackEvents.length && attackEvents[ei].minute < t) ei++;
    if (ei < attackEvents.length && attackEvents[ei].minute <= end) {
      event = attackEvents[ei];
      side = event.side;
      end = Math.min(90, Math.max(t + 1, event.minute + WINDOW_AFTER));
      ei++;
    }

    spells.push({ start: t, end: Math.max(end, t + 0.5), side, event });
    t = end;
  }
  return spells;
}

function findSpell(spells: Spell[], minute: number): Spell {
  for (const s of spells) if (minute >= s.start && minute < s.end) return s;
  return spells[spells.length - 1] ?? { start: 0, end: 90, side: "home", event: null };
}

// y ao longo do eixo de ataque de um lado: depth 0 = campo próprio,
// depth 1 = entrada da área adversária.
function depthY(side: "home" | "away", depth: number): number {
  return side === "home" ? 92 - depth * 84 : 8 + depth * 84;
}

interface Waypoint { t: number; x: number; y: number }

// `eased` aplica a curva dentro de CADA perna (não no `t` global) — dá a
// sensação de passe de verdade: desacelera ao "chegar" em cada jogador,
// acelera pro próximo, em vez de um deslize contínuo sem parada.
function piecewise(t: number, pts: Waypoint[], eased = false): { x: number; y: number } {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (t >= a.t && t <= b.t) {
      let local = (t - a.t) / Math.max(0.0001, b.t - a.t);
      if (eased) local = easeInOut(local);
      return { x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local) };
    }
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y };
}

// --- Passes reais -----------------------------------------------------------
// A bola de uma jogada em aberto não segue mais uma curva genérica: visita
// as posições de verdade dos companheiros de time (pela função tática, do
// mais recuado ao mais avançado). `buildOpenPlay` (mais abaixo) já escolhe
// como "portador" quem estiver mais perto da bola a cada instante — seguindo
// essas posições reais, o boneco que "tem a bola" muda de jogador em
// jogador sozinho, sem precisar duplicar lógica aqui.

interface AttBase { l: MatchLineupEntry; x: number; y: number; depth: number }

// Jogadores de linha do time, ordenados do mais recuado (depth 0) ao mais
// avançado (depth 1) pela posição-base da função tática.
function attackerBases(lineup: MatchLineupEntry[], formation: FormationCode, side: "home" | "away"): AttBase[] {
  const ctx: PosCtx = { lineup, formation, side, minute: 0 };
  return lineup
    .filter((l) => l.slot !== "GK")
    .map((l) => {
      const b = baseFor(ctx, l);
      const depth = side === "home" ? (100 - b.y) / 100 : b.y / 100;
      return { l, x: b.x, y: b.y, depth };
    })
    .sort((a, b) => a.depth - b.depth);
}

// Sorteia (determinístico por seed) um jogador real dentro de uma faixa de
// profundidade — ex.: [0, 0.3] pega alguém da defesa/1º terço.
function pickByDepthBand(
  bases: AttBase[], band: [number, number], seed: number,
): { x: number; y: number } | null {
  if (!bases.length) return null;
  const lo = Math.max(0, Math.floor(band[0] * bases.length));
  const hi = Math.min(bases.length, Math.max(lo + 1, Math.ceil(band[1] * bases.length)));
  const slice = bases.slice(lo, hi);
  if (!slice.length) return null;
  const pick = slice[Math.floor(hash01(seed) * slice.length)] ?? slice[0];
  return { x: pick.x, y: pick.y };
}

// Dentro de uma faixa de profundidade, prefere quem estiver mais PERTO do
// portador atual (passe curto de verdade, não teleporte pro outro lado do
// campo) — com uma chance pequena de ainda escolher alguém mais distante
// (troca de lado / lançamento, também acontece numa partida de verdade).
function pickNearby(
  bases: AttBase[], from: { x: number; y: number }, band: [number, number], seed: number,
): { x: number; y: number } | null {
  if (!bases.length) return null;
  const lo = Math.max(0, Math.floor(band[0] * bases.length));
  const hi = Math.min(bases.length, Math.max(lo + 1, Math.ceil(band[1] * bases.length)));
  let slice = bases.slice(lo, hi);
  if (!slice.length) return null;
  // evita "autopasse" pra quem já está praticamente no mesmo lugar.
  const distinct = slice.filter((b) => Math.hypot(b.x - from.x, b.y - from.y) > 1.5);
  if (distinct.length) slice = distinct;
  const weights = slice.map((b) => 1 / (1 + Math.hypot(b.x - from.x, b.y - from.y) * 0.12));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = hash01(seed) * total;
  for (let i = 0; i < slice.length; i++) {
    r -= weights[i];
    if (r <= 0) return { x: slice[i].x, y: slice[i].y };
  }
  const last = slice[slice.length - 1];
  return { x: last.x, y: last.y };
}

// Minutos de jogo por passe — dá ritmo de posse de verdade (a bola troca de
// dono a cada poucos segundos reais, não desliza sozinha por minutos).
const PASS_DURATION = 0.45;

// Sequência de passes reais por uma jogada inteira: começa recuado, avança
// aos poucos (com recicladas pro lado/atrás de vez em quando, como posse de
// bola de verdade) e termina no ponto final dado (perto do gol numa
// finalização, ou bola solta se a posse se perdeu). `piecewise()` interpola
// (com ease por perna) entre esses pontos — quanto mais pernas, mais a bola
// "salta" de jogador em jogador em vez de deslizar numa curva genérica.
function buildPassSequence(
  bases: AttBase[], seed: number, spellSpan: number, finalPoint: { x: number; y: number },
): Waypoint[] {
  const legs = Math.max(3, Math.min(48, Math.ceil(spellSpan / PASS_DURATION)));
  const pts: Waypoint[] = [];
  let current = pickByDepthBand(bases, [0, 0.25], seed) ?? { x: 30, y: 50 };
  pts.push({ t: 0, x: current.x, y: current.y });
  for (let i = 1; i < legs; i++) {
    const depthNow = i / legs;
    const recycle = hash01(seed + i * 5.3) < 0.18;
    const band: [number, number] = recycle
      ? [Math.max(0, depthNow - 0.4), Math.min(1, depthNow + 0.1)]
      : [Math.max(0, depthNow - 0.12), Math.min(1, depthNow + 0.32)];
    const next = pickNearby(bases, current, band, seed + i * 7.9) ?? pickByDepthBand(bases, band, seed + i * 7.9);
    if (next) current = next;
    pts.push({ t: i / legs, x: current.x, y: current.y });
  }
  pts.push({ t: 1, x: finalPoint.x, y: finalPoint.y });
  return pts;
}

// --- Bola parada ---------------------------------------------------------
// O motor agora escreve a origem do gol no texto do evento (ver
// src/game/simulation.ts::attemptGoal). Aqui a gente lê isso pra encenar.
export type SetPieceKind = "corner" | "free_kick" | "penalty";
const SP_STAGE_DUR = 0.5; // minutos de jogo com o lance encenado antes da cobrança

export function detectSetPiece(e: MatchEvent | null): SetPieceKind | null {
  if (!e || e.type !== "goal") return null;
  const t = e.text;
  if (/pênalti/i.test(t)) return "penalty";
  if (/falta/i.test(t)) return "free_kick";
  if (/escanteio|de cabeça/i.test(t)) return "corner";
  return null;
}

// y na direção de ataque de um lado: depth 0 = linha de fundo adversária,
// depth 1 = linha de fundo própria.
function fwdY(side: "home" | "away", depth: number): number {
  return side === "home" ? depth * 100 : 100 - depth * 100;
}

// Ponto de origem da bola parada.
function setPieceOrigin(kind: SetPieceKind, side: "home" | "away", seed: number): { x: number; y: number } {
  if (kind === "penalty") return { x: 50, y: fwdY(side, 0.115) };
  if (kind === "corner") return { x: hash01(seed) < 0.5 ? 2.5 : 97.5, y: fwdY(side, 0.015) };
  // falta: 40-60 de largura, ~22-26m do gol
  return { x: 38 + hash01(seed + 3) * 24, y: fwdY(side, 0.24) };
}

function ballInSpell(
  spell: Spell, minute: number,
  attLineup: MatchLineupEntry[], attFormation: FormationCode,
): { x: number; y: number } {
  const span = Math.max(0.1, spell.end - spell.start);
  const p = Math.max(0, Math.min(1, (minute - spell.start) / span));
  const seed = spell.start;
  const wpX = (offset: number) => 22 + hash01(seed + offset) * 56;
  const bases = attackerBases(attLineup, attFormation, spell.side);

  if (spell.event) {
    const sp = detectSetPiece(spell.event);
    const targetX = 30 + hash01(spell.event.minute * 999.7) * 40;
    const targetY = spell.side === "home" ? 4 : 96;
    const evtMin = spell.event.minute;

    if (sp) {
      // Bola parada: em jogo normal até ~0,5 min antes; depois posicionada na
      // origem; no momento do evento viaja pro gol (o motor 3D transforma o
      // salto grande num arco de bola alçada; o pênalti fica rasteiro).
      const origin = setPieceOrigin(sp, spell.side, evtMin * 13.1);
      if (minute < evtMin) {
        if (minute < evtMin - SP_STAGE_DUR) {
          // ainda em jogo — bola progride até a beira da área e converge pro
          // ponto onde a jogada parou.
          const q = Math.max(0, Math.min(1, (minute - spell.start) / Math.max(0.1, evtMin - SP_STAGE_DUR - spell.start)));
          return {
            x: lerp(wpX(0.1), origin.x, q * 0.7),
            y: lerp(depthY(spell.side, 0.1), origin.y + (spell.side === "home" ? 14 : -14), q),
          };
        }
        return origin;
      }
      const fly = Math.max(0, Math.min(1, (minute - evtMin) / 0.16));
      return { x: lerp(origin.x, targetX, fly), y: lerp(origin.y, targetY, fly) };
    }

    // Jogada com finalização: sequência de passes reais (1 a cada ~0,45min
    // de jogo — ritmo de posse de verdade, não 3 pontos genéricos espalhados
    // por uma jogada de vários minutos), convergindo no alvo real do lance
    // perto do gol (mesma lógica de alvo por hash que já existia — isso é
    // "onde o chute sai", não a posição tática de quem chuta).
    const pts = buildPassSequence(bases, seed, span, { x: targetX, y: targetY });
    return piecewise(p, pts, true);
  }

  // Jogada sem finalização: a mesma sequência de passes reais, mas termina
  // em bola solta no meio-campo (posse que se perde, sem "dono" — a maioria
  // das jogadas reais não termina em finalização).
  const ptsNoFinish = buildPassSequence(bases, seed, span, { x: wpX(0.35), y: 50 });
  return piecewise(p, ptsNoFinish, true);
}

export function computeBallPosition(
  events: MatchEvent[],
  minute: number,
  homePossessionPct: number = 50,
  // Opcionais: sem eles, o passe cai de volta na curva genérica antiga (ver
  // fallbacks em `ballInSpell`/`pickByDepthBand`) — mas os 2 visualizadores
  // (2D e 3D) sempre têm a escalação/formação à mão, então sempre passam.
  homeLineup: MatchLineupEntry[] = [],
  awayLineup: MatchLineupEntry[] = [],
  homeFormation: FormationCode = "4-3-3",
  awayFormation: FormationCode = "4-3-3",
): { x: number; y: number } {
  const spells = buildSpells(events, homePossessionPct);
  const spell = findSpell(spells, minute);
  const attLineup = spell.side === "home" ? homeLineup : awayLineup;
  const attFormation = spell.side === "home" ? homeFormation : awayFormation;
  return ballInSpell(spell, minute, attLineup, attFormation);
}

const CAPTION_WINDOW = 4;

// Legenda sobreposta no campo (referência: banner do FM21 Touch, tipo "Fulano
// está na lateral pra efetuar o lançamento"). Um evento real recente tem
// prioridade (mostra o texto de verdade por alguns minutos); fora disso,
// mostra só quem está com a bola — não temos comentário jogada-a-jogada de
// verdade pra tudo, então não inventamos texto além do que os dados dizem.
export function currentCaption(
  events: MatchEvent[],
  minute: number,
  homeName: string,
  awayName: string,
  homePossessionPct: number = 50,
): string {
  let recent: MatchEvent | null = null;
  for (const e of events) {
    if (e.minute <= minute && minute - e.minute < CAPTION_WINDOW) recent = e;
  }
  if (recent) return recent.text;

  const spells = buildSpells(events, homePossessionPct);
  const spell = findSpell(spells, minute);
  const name = spell.side === "home" ? homeName : awayName;
  return `${name} construindo a jogada`;
}

export type DotAnim =
  | "run" | "shoot" | "celebrate" | "dejected" | "dive" | "down"
  | "wall" | "setpiece_taker" | "brace";

export interface LiveDot {
  playerId: string;
  playerName: string;
  slot: string;
  side: "home" | "away";
  x: number;
  y: number;
  anim?: DotAnim;
}

function roleOf(slot: string): "GK" | "DEF" | "MID" | "FWD" {
  if (slot === "GK") return "GK";
  if (slot.includes("ST") || slot === "LW" || slot === "RW") return "FWD";
  if (slot.endsWith("B")) return "DEF"; // LB/RB/CB/WB
  return "MID";
}

// Classificação mais fina que `roleOf` — só usada pelo movimento de jogada
// aberta (`buildOpenPlay`), pra lateral não se mexer igual zagueiro e ponta
// não se mexer igual volante. `roleOf` (mais grosseira) continua servindo
// bola parada/escalação, que não precisam dessa nuance.
type SubRole = "GK" | "FB" | "CB" | "DM" | "WM" | "CM" | "AM" | "W" | "ST";
function subRoleOf(slot: string): SubRole {
  if (slot === "GK") return "GK";
  if (slot === "LB" || slot === "RB" || slot === "LWB" || slot === "RWB") return "FB";
  if (slot === "CB" || slot === "LCB" || slot === "RCB") return "CB";
  if (slot === "DM" || slot === "LDM" || slot === "RDM") return "DM";
  if (slot === "LM" || slot === "RM") return "WM";
  if (slot === "LW" || slot === "RW") return "W";
  if (slot === "CAM" || slot === "LAM" || slot === "RAM") return "AM";
  if (slot.includes("ST")) return "ST";
  return "CM"; // CM/LCM/RCM
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Quantos defensores saem na pressão, dado o avanço da jogada (0..1) e a
// instrução média de Pressão do time que defende (-1..1) — extraído como
// função pura testável isoladamente (ver __tests__/live-positions.test.ts).
export function defensivePressN(advance: number, teamPressAvg: number): 0 | 1 | 2 {
  const bias = teamPressAvg * 0.15;
  if (advance > 0.62 - bias) return 2;
  if (advance > 0.42 - bias) return 1;
  return teamPressAvg > 0.5 ? 1 : 0;
}

interface PosCtx {
  lineup: MatchLineupEntry[];
  formation: FormationCode;
  side: "home" | "away";
  minute: number;
}

function baseFor(ctx: PosCtx, l: MatchLineupEntry) {
  // Tática livre: se a escalação carrega a coordenada real que o usuário
  // arrastou na tela de Tática, o replay usa ELA em vez do ponto genérico do
  // template — só cai pro layout estático quando o time nunca passou por lá
  // (IA, ou partida salva antes desse campo existir).
  const b = (l.posX != null && l.posY != null) ? { x: l.posX, y: l.posY } : slotCoords(ctx.formation, l.slot);
  return { x: b.x, y: ctx.side === "home" ? b.y : 100 - b.y };
}

function idle(playerId: string, minute: number, amp = 0.9) {
  const ph = hashId(playerId) * Math.PI * 2;
  return { x: Math.sin(minute * 1.05 + ph) * amp, y: Math.cos(minute * 0.87 + ph) * amp };
}

function dot(l: MatchLineupEntry, side: "home" | "away", x: number, y: number): LiveDot {
  return { playerId: l.playerId, playerName: l.playerName, slot: l.slot, side, x: clamp(x, 1.5, 98.5), y: clamp(y, 1.5, 98.5) };
}

// -- Bloco defensivo: bandas de altura por sub-função ------------------------
// Achado ao vivo (partida real Metz × PSG): com um vão fixo de só 15 entre
// lineY/midY, zagueiro/lateral/ponta/atacante-recuando caíam praticamente na
// MESMA faixa de altura — 8 dos 10 jogadores de linha espremidos em ~5 pontos
// percentuais, uma bolha em vez de um time. Cada sub-função agora tem uma
// FRAÇÃO própria e crescente (0 = linha de fundo, 1 = ponto mais adiantado que
// o time ainda segura recuado) de um vão bem maior (`DEF_BLOCK_SPAN_BASE`),
// então nunca colidem — mesmo com o bloco inteiro comprimido perto do próprio
// gol. Ordem (mais recuado → mais adiantado) preserva a intenção original:
// zagueiro trava a linha; lateral cobre o corredor um pouco à frente; volante
// escalona antes do meio; ponta/meia aberto um pouco mais adiantado que o
// volante; meia-central mais solto ainda; atacante só recua até perto do meio
// pro contra-ataque (não até a própria defesa).
const DEF_BLOCK_SPAN_BASE = 34;
const DEF_BAND_FRACTION: Record<SubRole, number> = {
  GK: 0, CB: 0.0, FB: 0.14, DM: 0.32, WM: 0.5, W: 0.5, AM: 0.66, CM: 0.66, ST: 0.85,
};
// Instrução/função individual também vale na fase defensiva — antes só o lado
// que ataca lia `instructions`/`roleKey` (ver buildOpenPlay), a defesa ignorava
// os dois por completo. Efeito mais discreto que no ataque (0.28/0.35): um
// time defendendo segura mais a forma, corrida individual é a exceção.
const DEF_ROAM_DEPTH_FACTOR = 0.06;
const DEF_ROAM_WIDTH_FACTOR = 0.1;

// -- Jogada em curso (open play) ----------------------------------------------

// Time que ATACA: sobe em bloco conforme a bola avança, um jogador "carrega" a
// bola (o mais perto), pontas seguram a largura e o(s) atacante(s) ameaçam a
// linha; time que DEFENDE: linha de zaga plana (linha de impedimento) na altura
// da bola, cada sub-função na sua banda própria (ver acima), 1-2 saem na
// pressão no terço defensivo.
function buildOpenPlay(
  att: PosCtx, def: PosCtx, ball: { x: number; y: number },
): LiveDot[] {
  // advance = 0 (bola no campo do atacante) .. 1 (bola na linha de fundo adversária)
  const advance = att.side === "home" ? (100 - ball.y) / 100 : ball.y / 100;
  const dir = att.side === "home" ? -1 : 1; // pra onde o atacante ataca em y

  // --- atacante: escolhe o portador (mais perto da bola, com peso pra não ser zagueiro) ---
  const attBases = att.lineup.map((l) => ({ l, b: baseFor(att, l), role: roleOf(l.slot) }));
  let carrierIdx = -1, bestD = Infinity;
  attBases.forEach((p, i) => {
    if (p.role === "GK") return;
    const pen = p.role === "DEF" ? 22 : p.role === "MID" ? 0 : 6;
    const d = Math.hypot(p.b.x - ball.x, p.b.y - ball.y) + pen;
    if (d < bestD) { bestD = d; carrierIdx = i; }
  });

  const attDots = attBases.map((p, i) => {
    if (p.role === "GK") {
      const gy = att.side === "home" ? 78 + advance * 12 : 22 - advance * 12;
      return dot(p.l, att.side, 50 + (ball.x - 50) * 0.12, gy);
    }
    if (i === carrierIdx) {
      const j = idle(p.l.playerId, att.minute, 0.5);
      return dot(p.l, att.side, ball.x + j.x, ball.y + dir * 1.6 + j.y); // logo atrás da bola
    }
    const j = idle(p.l.playerId, att.minute);
    // Fase individual (não é a mesma pra todo mundo) — sem isso, jogadores
    // da MESMA função se moviam em bloco perfeitamente sincronizado, o que
    // lê como robótico; cada um corre no seu próprio compasso.
    const ph = hashId(p.l.playerId) * Math.PI * 2;
    const sub = subRoleOf(p.l.slot);
    const isLeftSide = p.b.x < 50;
    const onBallSide = isLeftSide === (ball.x < 50);

    // Empurrão vertical + puxão de largura por SUB-função — antes era só
    // DEF/MID/FWD (3 valores pro time inteiro); agora lateral não se move
    // igual zagueiro, ponta não se move igual volante.
    let push: number, pull: number, runAmp: number;
    switch (sub) {
      case "CB": push = 16; pull = 0.10; runAmp = 2; break;
      case "FB": push = onBallSide ? 42 : 14; pull = onBallSide ? 0.32 : 0.08; runAmp = 3; break;
      case "DM": push = 22; pull = 0.16; runAmp = 3; break;
      case "CM": push = 34; pull = 0.24; runAmp = 6; break;
      case "AM": push = 42; pull = 0.30; runAmp = 6; break;
      case "WM": push = 30; pull = onBallSide ? 0.30 : 0.10; runAmp = 4; break;
      case "W": push = 46; pull = onBallSide ? 0.10 : 0.34; runAmp = 5; break;
      default: push = 48; pull = 0.16; runAmp = 9; break; // ST
    }

    // Instrução de jogador (ver player-instructions.ts) empurra a base por
    // SUB-função acima — antes disso o campo ignorava totalmente a tática
    // escalada (só usava formação/posição crua). "Avançado" (roamDepth+1)
    // empurra a linha mais alto; "aberto" (roamWidth+1) puxa mais forte pro
    // lado da bola; qualquer desvio da posição padrão aumenta um pouco a
    // amplitude de corrida (o jogador "se solta" mais da posição fixa).
    const ins = p.l.instructions ?? DEFAULT_INSTRUCTIONS;
    push *= 1 + ins.roamDepth * 0.28;
    pull *= 1 + ins.roamWidth * 0.35;
    runAmp *= 1 + (Math.abs(ins.roamDepth) + Math.abs(ins.roamWidth)) * 0.15;

    // Team Fluidity (ver tactics.tsx/ClubLike.team_fluidity) — fluido solta
    // mais o time da posição fixa (mais amplitude de corrida + troca de zona
    // mais forte pro lado da bola); estruturado prende mais na posição. Só
    // posicionamento, nunca estatística (mesmo espírito de roamDepth/Width).
    if (p.l.teamFluidity === "fluid") { runAmp *= 1.35; pull *= 1.15; }
    else if (p.l.teamFluidity === "structured") { runAmp *= 0.75; pull *= 0.85; }

    let ty = p.b.y + dir * advance * push;
    // corrida individual (frequência/fase próprias — nunca dois jogadores
    // exatamente no mesmo compasso, mesmo na mesma função).
    ty += Math.cos(att.minute * 0.5 + ph) * runAmp * 0.6;
    // atacante central recua um pouco quando a bola está lá atrás (vem linkar)
    if (sub === "ST" && advance < 0.35) ty -= dir * 10;

    const bandNear = Math.abs(p.b.y - ball.y) < 34;
    let tx = p.b.x + (bandNear ? (ball.x - p.b.x) * pull : (ball.x - p.b.x) * pull * 0.35);
    tx += Math.sin(att.minute * 0.45 + ph) * runAmp * 0.5;

    // ala/ponta: segura a própria lateral quando é o lado que está com a bola
    if ((sub === "W" || sub === "WM") && onBallSide) {
      tx = isLeftSide ? Math.min(tx, 14) : Math.max(tx, 86);
    }
    // lateral: overlap de verdade (sobe pela linha) quando a bola tá do seu
    // lado e o time empurrou — não só "puxa um pouco" como antes.
    if (sub === "FB" && onBallSide && advance > 0.3) {
      tx = isLeftSide ? Math.min(tx, ball.x - 6) : Math.max(tx, ball.x + 6);
    }
    // ponta corta pro meio (ameaça o 2º poste) quando a bola tá no outro lado
    if (sub === "W" && !onBallSide && advance > 0.55) { ty += dir * 5; tx += isLeftSide ? 10 : -10; }

    // Vetor de diagrama da função (ver roles.ts — antes só decorativo na
    // tela de tática) vira um viés real de posicionamento sem bola, mais
    // forte quanto mais o time avança: um Raumdeuter (corrida diagonal pro
    // 2º poste) realmente se desloca nessa direção, não só um lateral/ponta
    // genérico da mesma sub-função. O diagrama é autorado pro lado ESQUERDO
    // (ver comentário em roles.ts); espelha `dx` por `isLeftSide` (já
    // calculado acima a partir da posição real do jogador, mais confiável
    // aqui do que o nome do slot — "RDM"/"RCM" às vezes são posições
    // CENTRAIS apesar do prefixo R). `dy` no diagrama é NEGATIVO pra
    // "frente" (gol adversário); `dir` já é o sinal de "frente" deste
    // arquivo — por isso o sinal invertido (-dir * dy).
    const diag = p.l.roleKey ? ROLES_BY_KEY[p.l.roleKey]?.diagram : undefined;
    if (diag) {
      const dxEff = isLeftSide ? diag.dx : -diag.dx;
      ty += -dir * (diag.dy / 140) * 16 * advance;
      tx += (dxEff / 100) * 9 * advance;
    }

    return dot(p.l, att.side, tx + j.x, ty + j.y);
  });

  // --- defensor: linha plana na altura da bola + bandas por função + pressão ---
  const defBases = def.lineup.map((l) => ({ l, b: baseFor(def, l), role: roleOf(l.slot) }));
  // altura da linha de zaga (y) — recua conforme a bola chega perto do gol
  const lineY = def.side === "home" ? clamp(48 + advance * 34, 40, 88) : clamp(52 - advance * 34, 12, 60);
  const fwdSignDef = def.side === "home" ? -1 : 1;
  // Fluidez do time (geral, ver tactics.tsx/ClubLike.team_fluidity) estica ou
  // comprime o bloco defensivo — mesmo espírito já aplicado no lado que ataca.
  const defFluidity = defBases.find((p) => p.role !== "GK")?.l.teamFluidity;
  const blockSpan = DEF_BLOCK_SPAN_BASE * (defFluidity === "fluid" ? 1.15 : defFluidity === "structured" ? 0.85 : 1);
  // quem pressiona — instrução de Pressão (ver player-instructions.ts) desloca
  // os limiares: time instruído a pressionar mais sobe a marcação mais cedo
  // (limiar mais baixo), time instruído a recuar demora mais (limiar mais
  // alto). Antes disso a linha defensiva ignorava totalmente a instrução.
  const teamPressAvg = defBases.length
    ? defBases.reduce((s, p) => s + (p.l.instructions?.pressing ?? 0), 0) / defBases.length
    : 0;
  const pressN = defensivePressN(advance, teamPressAvg);
  const pressOrder = defBases
    .map((p, i) => ({ i, d: Math.hypot(p.b.x - ball.x, p.b.y - ball.y), role: p.role }))
    .filter((p) => p.role !== "GK")
    .sort((a, b) => a.d - b.d)
    .slice(0, pressN)
    .map((p) => p.i);

  const defDots = defBases.map((p, i) => {
    const j = idle(p.l.playerId, def.minute);
    if (p.role === "GK") {
      const gy = def.side === "home" ? clamp(94 - advance * 8, 84, 95) : clamp(6 + advance * 8, 5, 16);
      return dot(p.l, def.side, 50 + (ball.x - 50) * 0.14, gy + j.y * 0.4);
    }
    const sub = subRoleOf(p.l.slot);
    const ph = hashId(p.l.playerId) * Math.PI * 2;

    // Instrução de jogador (ver player-instructions.ts) — mesmo princípio do
    // lado que ataca, efeito mais discreto (ver DEF_ROAM_*_FACTOR acima):
    // "avançado" sobe um pouco a banda mesmo defendendo (marcação mais alta),
    // "aberto" puxa um pouco mais pro lado da bola.
    const ins = p.l.instructions ?? DEFAULT_INSTRUCTIONS;
    const depthNudge = ins.roamDepth * DEF_ROAM_DEPTH_FACTOR;
    const widthNudge = ins.roamWidth * DEF_ROAM_WIDTH_FACTOR;

    // compressão lateral leve + desloca pro lado da bola
    let tx = p.b.x + (50 - p.b.x) * 0.12 + (ball.x - p.b.x) * (0.22 + widthNudge);

    // Altura por banda própria da sub-função (ver DEF_BAND_FRACTION acima) —
    // nunca colide com a banda vizinha, mesmo com blockSpan comprimido pela
    // fluidez do time ou o bloco inteiro recuado perto do próprio gol.
    const frac = DEF_BAND_FRACTION[sub] ?? 0.5;
    let ty = lineY + fwdSignDef * (frac + depthNudge) * blockSpan;

    // Vetor de diagrama da função (mesma lógica do lado que ataca, ver
    // buildOpenPlay acima) — mais discreto aqui: defesa segura mais a forma
    // que o ataque, mas a função de cada jogador ainda pesa na posição.
    const diag = p.l.roleKey ? ROLES_BY_KEY[p.l.roleKey]?.diagram : undefined;
    if (diag) {
      const isLeftSideDef = p.b.x < 50;
      const dxEff = isLeftSideDef ? diag.dx : -diag.dx;
      ty += fwdSignDef * (diag.dy / 140) * 8;
      tx += (dxEff / 100) * 5;
    }

    ty += Math.sin(def.minute * 0.4 + ph) * 2;
    if (pressOrder.includes(i)) { tx += (ball.x - tx) * 0.4; ty += (ball.y - ty) * 0.4; }
    return dot(p.l, def.side, tx + j.x, ty + j.y);
  });

  return att.side === "home"
    ? [...attDots, ...defDots]
    : [...defDots, ...attDots];
}

// -- Bola parada encenada ---------------------------------------------------

// Distribui os titulares por prioridade de função numa lista de posições-alvo.
function assign(
  lineup: MatchLineupEntry[], side: "home" | "away", minute: number,
  gkTarget: { x: number; y: number },
  order: ("FWD" | "MID" | "DEF")[], targets: { x: number; y: number }[],
): LiveDot[] {
  const gk = lineup.find((l) => l.slot === "GK");
  const outs = lineup.filter((l) => l.slot !== "GK");
  const byRole: Record<string, MatchLineupEntry[]> = { FWD: [], MID: [], DEF: [] };
  for (const l of outs) byRole[roleOf(l.slot)].push(l);
  const queue: MatchLineupEntry[] = [];
  for (const r of order) queue.push(...byRole[r]);
  // completa com quem sobrou (ordem qualquer)
  for (const l of outs) if (!queue.includes(l)) queue.push(l);

  const out: LiveDot[] = [];
  if (gk) { const j = idle(gk.playerId, minute, 0.4); out.push(dot(gk, side, gkTarget.x + j.x, gkTarget.y + j.y)); }
  queue.forEach((l, i) => {
    const tgt = targets[i] ?? targets[targets.length - 1] ?? { x: 50, y: 50 };
    const j = idle(l.playerId, minute, 0.7);
    out.push(dot(l, side, tgt.x + j.x, tgt.y + j.y));
  });
  return out;
}

function stageSetPiece(
  kind: SetPieceKind, spell: Spell,
  homeLineup: MatchLineupEntry[], awayLineup: MatchLineupEntry[],
  minute: number,
): LiveDot[] {
  const att = spell.side;
  const def: "home" | "away" = att === "home" ? "away" : "home";
  const attLineup = att === "home" ? homeLineup : awayLineup;
  const defLineup = att === "home" ? awayLineup : homeLineup;
  const seed = (spell.event?.minute ?? spell.start) * 13.1;
  const yA = (depth: number) => fwdY(att, depth);

  let attDots: LiveDot[], defDots: LiveDot[];

  if (kind === "penalty") {
    // todos fora da área (>~y18 do gol) e atrás da bola, menos cobrador e goleiro
    attDots = assign(attLineup, att, minute, { x: 50, y: yA(0.80) },
      ["FWD", "MID", "DEF"], [
        { x: 50, y: yA(0.185) },  // cobrador, alguns passos atrás da marca
        { x: 38, y: yA(0.21) }, { x: 62, y: yA(0.21) }, { x: 44, y: yA(0.24) },
        { x: 56, y: yA(0.24) }, { x: 32, y: yA(0.25) }, { x: 68, y: yA(0.25) },
        { x: 50, y: yA(0.28) }, { x: 40, y: yA(0.30) }, { x: 60, y: yA(0.30) },
      ]);
    defDots = assign(defLineup, def, minute, { x: 50, y: yA(0.012) },
      ["DEF", "MID", "FWD"], [
        { x: 42, y: yA(0.205) }, { x: 58, y: yA(0.205) }, { x: 50, y: yA(0.225) },
        { x: 34, y: yA(0.22) }, { x: 66, y: yA(0.22) }, { x: 46, y: yA(0.25) },
        { x: 54, y: yA(0.25) }, { x: 37, y: yA(0.27) }, { x: 63, y: yA(0.27) }, { x: 50, y: yA(0.31) },
      ]);
  } else if (kind === "free_kick") {
    const bx = 38 + hash01(seed + 3) * 24;
    attDots = assign(attLineup, att, minute, { x: 50, y: yA(0.82) },
      ["FWD", "MID", "DEF"], [
        { x: bx - 1.5, y: yA(0.245) }, { x: bx + 2, y: yA(0.25) }, // 2 sobre a bola
        { x: 40, y: yA(0.07) }, { x: 50, y: yA(0.06) }, { x: 60, y: yA(0.08) }, { x: 55, y: yA(0.11) },
        { x: 35, y: yA(0.12) }, { x: 65, y: yA(0.12) }, { x: 45, y: yA(0.16) }, { x: 25, y: yA(0.22) },
      ]);
    // barreira entre a bola e o gol
    const wallX = clamp(bx * 0.55 + 22, 42, 58);
    defDots = assign(defLineup, def, minute, { x: clamp(bx, 44, 56), y: yA(0.02) },
      ["DEF", "MID", "FWD"], [
        { x: wallX - 3, y: yA(0.13) }, { x: wallX, y: yA(0.13) }, { x: wallX + 3, y: yA(0.13) }, { x: wallX + 6, y: yA(0.135) },
        { x: 42, y: yA(0.05) }, { x: 58, y: yA(0.05) }, { x: 50, y: yA(0.08) },
        { x: 35, y: yA(0.10) }, { x: 65, y: yA(0.10) }, { x: bx, y: yA(0.30) }, // 1 fecha o cobrador
      ]);
  } else {
    // escanteio
    const cx = hash01(seed) < 0.5 ? 3 : 97;
    const near = cx < 50 ? 42 : 58;
    attDots = assign(attLineup, att, minute, { x: 50, y: yA(0.82) },
      ["FWD", "MID", "DEF"], [
        { x: cx + (cx < 50 ? 3 : -3), y: yA(0.04) }, // cobrador na quina
        { x: near, y: yA(0.05) }, { x: 50, y: yA(0.06) }, { x: 60 - (cx < 50 ? 0 : 8), y: yA(0.07) },
        { x: 45, y: yA(0.09) }, { x: 55, y: yA(0.10) },
        { x: 35, y: yA(0.15) }, { x: 65, y: yA(0.15) }, { x: 50, y: yA(0.20) }, { x: 25, y: yA(0.30) },
      ]);
    defDots = assign(defLineup, def, minute, { x: 49, y: yA(0.015) },
      ["DEF", "MID", "FWD"], [
        { x: 43, y: yA(0.02) }, { x: 57, y: yA(0.02) }, // postes
        { x: near + 1, y: yA(0.055) }, { x: 51, y: yA(0.065) }, { x: 58, y: yA(0.075) },
        { x: 46, y: yA(0.095) }, { x: 56, y: yA(0.105) }, { x: 37, y: yA(0.14) },
        { x: cx + (cx < 50 ? 8 : -8), y: yA(0.05) }, { x: 40, y: yA(0.28) },
      ]);
  }

  // Poses da bola parada.
  attDots[1] && (attDots[1].anim = "setpiece_taker");
  for (let i = 2; i <= 6 && i < attDots.length; i++) attDots[i].anim = "brace";
  if (kind === "free_kick") {
    for (let i = 1; i <= 4 && i < defDots.length; i++) defDots[i].anim = "wall";
    for (let i = 5; i <= 7 && i < defDots.length; i++) defDots[i].anim = "brace";
  } else {
    for (let i = 1; i <= 6 && i < defDots.length; i++) defDots[i].anim = "brace";
  }

  return att === "home" ? [...attDots, ...defDots] : [...defDots, ...attDots];
}

// Sobrepõe poses de evento (lesão, comemoração de gol, chute) por cima das
// posições já calculadas.
function applyEventAnims(dots: LiveDot[], events: MatchEvent[], minute: number) {
  const at = (id: string) => dots.find((d) => d.playerId === id);

  // Lesão — jogador caído nos ~4 min seguintes ao evento.
  for (const e of events) {
    if (e.type === "injury" && e.playerId && e.minute <= minute && minute - e.minute < 4) {
      const d = at(e.playerId);
      if (d) d.anim = "down";
    }
  }

  // Gol — quem marcou comemora (corre pro escanteio), quem sofreu cabisbaixo,
  // goleiro batido no chão.
  const g = events.find((e) => e.type === "goal" && minute >= e.minute && minute <= e.minute + 3.4);
  if (g) {
    const p = (minute - g.minute) / 3.4;
    // canto do gol que o time de `g.side` estava atacando
    const cx = hash01(g.minute * 7.7) < 0.5 ? 6 : 94;
    const cy = g.side === "home" ? 8 : 92;
    for (const d of dots) {
      if (d.anim === "down") continue;
      if (d.side === g.side) {
        if (d.slot === "GK") continue;
        d.anim = "celebrate";
        d.x = lerp(d.x, cx, Math.min(0.7, p * 1.3));
        d.y = lerp(d.y, cy, Math.min(0.7, p * 1.3));
      } else {
        d.anim = d.slot === "GK" ? "dive" : "dejected";
      }
    }
  } else {
    // Chute — nos instantes antes de um gol/chance/defesa, o atacante mais
    // perto da bola faz a armada.
    const shot = events.find((e) =>
      (e.type === "goal" || e.type === "chance" || e.type === "save")
      && minute >= e.minute - 0.14 && minute < e.minute);
    if (shot) {
      const attacking = dots.filter((d) => d.side === shot.side && d.slot !== "GK");
      // o mais adiantado no ataque
      attacking.sort((a, b) => (shot.side === "home" ? a.y - b.y : b.y - a.y));
      if (attacking[0]) attacking[0].anim = "shoot";
      // goleiro adversário já se estica
      const gk = dots.find((d) => d.side !== shot.side && d.slot === "GK");
      if (gk) gk.anim = "dive";
    }
  }
}

// Janela (em minutos de jogo) que uma pose de textura fica visível — mesma
// ordem de grandeza das janelas de evento real acima (~4 min pra lesão, 3,4
// pra gol), mas mais curta: textura é frequente (vários por minuto entre os
// 22 jogadores), uma janela longa ia deixar sempre alguém "preso" numa pose.
export const TEXTURE_ANIM_WINDOW = 1.1;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Sobrepõe poses/pequenos deslocamentos dos micro-eventos de textura tática
// (ver src/game/texture.ts) — 100% visual, os eventos em si já são cosméticos
// (não alteram xG/placar). Roda ANTES de applyEventAnims: um evento de
// verdade (gol/cartão/lesão) sempre tem prioridade e sobrescreve.
export function applyTextureAnims(dots: LiveDot[], texture: TextureEvent[], minute: number) {
  const at = (id: string) => dots.find((d) => d.playerId === id);
  const dirFor = (side: "home" | "away") => (side === "home" ? -1 : 1);

  for (const t of texture) {
    if (t.minute > minute || minute - t.minute >= TEXTURE_ANIM_WINDOW) continue;
    const actor = at(t.playerId);
    const target = t.targetId ? at(t.targetId) : undefined;
    const progress = clamp01((minute - t.minute) / TEXTURE_ANIM_WINDOW);

    switch (t.kind) {
      case "press_win":
        // quem perdeu a bola pra pressão titubeia um instante.
        if (target && !target.anim) target.anim = "dejected";
        break;
      case "marked_out":
        // o marcador venceu a disputa → o atacante marcado fica sem espaço.
        if (t.won && target && !target.anim) target.anim = "dejected";
        break;
      case "overlap_run":
        // sem pose — o jogador visivelmente avança além da posição normal
        // por um instante (curva suave: sobe, sustenta, volta).
        if (actor) {
          const bump = Math.sin(Math.PI * progress) * 6;
          actor.y = clamp(actor.y + dirFor(actor.side) * bump, 1.5, 98.5);
        }
        break;
      case "long_shot":
        if (actor && !actor.anim) actor.anim = "shoot";
        break;
      case "skill_move":
        if (t.won) {
          if (target && !target.anim) target.anim = "dejected";
        } else if (actor && !actor.anim) {
          actor.anim = "dejected";
        }
        break;
    }
  }
}

// Posições de todo mundo em campo num instante. Fora de bola parada: bloco
// que sobe/desce com a bola, portador + apoio + linha de impedimento +
// pressão. Na janela de uma bola parada real (escanteio/falta/pênalti do
// motor), encena o lance.
export function computePlayerPositions(
  homeLineup: MatchLineupEntry[],
  awayLineup: MatchLineupEntry[],
  homeFormation: FormationCode,
  awayFormation: FormationCode,
  minute: number,
  events: MatchEvent[],
  homePossessionPct: number = 50,
  texture: TextureEvent[] = [],
): LiveDot[] {
  const spells = buildSpells(events, homePossessionPct);
  const spell = findSpell(spells, minute);
  const attLineup0 = spell.side === "home" ? homeLineup : awayLineup;
  const attFormation0 = spell.side === "home" ? homeFormation : awayFormation;
  const ball = ballInSpell(spell, minute, attLineup0, attFormation0);

  const sp = detectSetPiece(spell.event);
  const evtMin = spell.event?.minute ?? -99;
  let dots: LiveDot[];
  if (sp && minute >= evtMin - SP_STAGE_DUR && minute <= evtMin + 0.16) {
    dots = stageSetPiece(sp, spell, homeLineup, awayLineup, minute);
  } else {
    const attSide = spell.side;
    const defSide: "home" | "away" = attSide === "home" ? "away" : "home";
    const att: PosCtx = { lineup: attSide === "home" ? homeLineup : awayLineup, formation: attSide === "home" ? homeFormation : awayFormation, side: attSide, minute };
    const def: PosCtx = { lineup: defSide === "home" ? homeLineup : awayLineup, formation: defSide === "home" ? homeFormation : awayFormation, side: defSide, minute };
    dots = buildOpenPlay(att, def, ball);
  }
  applyTextureAnims(dots, texture, minute);
  applyEventAnims(dots, events, minute);
  return dots;
}
