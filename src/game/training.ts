// -----------------------------------------------------------------------------
// Treino — lógica pura (sem I/O).
//
// Cada foco treina um conjunto de atributos (ver src/game/attributes.ts pro
// catálogo completo). A cada dia de treino, cada atributo do foco tem uma
// pequena chance de subir +1 (limite 20), chance essa que depende da idade do
// jogador (jovens evoluem bem mais rápido que veteranos) e da nota do
// treinador contratado (ver src/game/staff.ts — sem treinador, o treino roda
// no ritmo básico, nunca trava).
//
// Grade semanal (item 01 do backlog FootSim): o clube pode variar o foco por
// dia da semana em vez de um único foco fixo pra todos os dias — inclusive
// marcar um dia como "Descanso" (sem treino, sem risco de lesão de treino,
// recuperação de condição maior nesse dia — ver countRestDays/advance-day.ts,
// que é onde o bônus de regeneração é somado). Esse é o trade-off explícito
// que o card pede: mais dias de foco = desenvolvimento mais rápido, mais
// dias de descanso = elenco mais fresco e com menos risco de lesão de
// treino. O foco individual do jogador (já existia antes desta feature)
// continua tendo prioridade sobre a grade do time, dia a dia — inclusive
// pode ser "Descanso" pra um jogador específico mesmo num dia de treino do
// time (ex. poupar um veterano proposital).
//
// Treino pesado também carrega um pequeno risco de lesão (maior em foco
// físico) — ver rollInjuryType/buildInjuryPatch em src/game/medical.ts, que
// já são reaproveitados aqui pra manter o mesmo catálogo de lesões da
// partida. O risco roda mesmo quando o foco do dia não bate com a posição
// do jogador (ex. time treina ataque com o goleiro junto) — só o GANHO de
// atributo é bloqueado nesse caso, igual já era antes desta reforma.
// -----------------------------------------------------------------------------

import { rollInjuryType, type InjuryTypeKey } from "./medical";
import type { AttributeKey, PlayerAttributes } from "./attributes";

export type TrainingFocus = "attack" | "defense" | "physical" | "technical" | "goalkeeping" | "balanced";

export const TRAINING_FOCUS_OPTIONS: TrainingFocus[] = ["balanced", "attack", "defense", "physical", "technical", "goalkeeping"];

export const TRAINING_FOCUS_LABELS: Record<TrainingFocus, string> = {
  balanced: "Equilibrado",
  attack: "Ataque",
  defense: "Defesa",
  physical: "Físico",
  technical: "Técnica",
  goalkeeping: "Goleiros",
};

// "Descanso" não treina nada — é o outro lado explícito do trade-off, não
// mais um foco de atributo.
export type WeeklyFocus = TrainingFocus | "rest";

export const WEEKLY_FOCUS_OPTIONS: WeeklyFocus[] = [...TRAINING_FOCUS_OPTIONS, "rest"];

export const WEEKLY_FOCUS_LABELS: Record<WeeklyFocus, string> = {
  ...TRAINING_FOCUS_LABELS,
  rest: "Descanso",
};

// Grade semanal: 7 posições, índice = getUTCDay() (0=domingo..6=sábado).
export type WeeklySchedule = WeeklyFocus[];
export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const ATTACK_ATTRS: AttributeKey[] = ["finishing", "dribbling", "off_the_ball", "composure", "technique"];
const DEFENSE_ATTRS: AttributeKey[] = ["tackling", "marking", "positioning", "anticipation"];
const PHYSICAL_ATTRS: AttributeKey[] = ["pace", "acceleration", "stamina", "strength"];
const TECHNICAL_ATTRS: AttributeKey[] = ["passing", "vision", "first_touch", "decisions"];
const GK_ATTRS: AttributeKey[] = ["reflexes", "handling", "one_on_ones", "command_of_area", "positioning"];
const BALANCED_ATTRS: AttributeKey[] = [...ATTACK_ATTRS, ...DEFENSE_ATTRS, ...PHYSICAL_ATTRS, ...TECHNICAL_ATTRS];

const FOCUS_ATTRS: Record<TrainingFocus, AttributeKey[]> = {
  attack: ATTACK_ATTRS,
  defense: DEFENSE_ATTRS,
  physical: PHYSICAL_ATTRS,
  technical: TECHNICAL_ATTRS,
  goalkeeping: GK_ATTRS,
  balanced: BALANCED_ATTRS,
};

const BASE_DAILY_CHANCE = 0.02; // 2%/dia por atributo no foco, antes de idade/treinador

function ageFactor(age: number): number {
  if (age <= 20) return 1.6;
  if (age <= 24) return 1.2;
  if (age <= 29) return 0.8;
  if (age <= 32) return 0.4;
  return 0.15;
}

// Risco de lesão por dia de treino, antes de idade — físico é o foco mais
// puxado fisicamente, por isso o maior risco.
const FOCUS_INJURY_RISK: Record<TrainingFocus, number> = {
  physical: 0.006, attack: 0.003, defense: 0.003, technical: 0.002, goalkeeping: 0.002, balanced: 0.0025,
};

function injuryAgeFactor(age: number): number {
  if (age >= 32) return 1.6;
  if (age >= 29) return 1.2;
  if (age <= 21) return 0.8;
  return 1;
}

// dateISO "YYYY-MM-DD" -> próximo dia, também "YYYY-MM-DD". UTC pra nunca
// sofrer de fuso horário do ambiente rodando o código.
function nextDateISO(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(dateISO: string): number {
  return new Date(dateISO + "T00:00:00Z").getUTCDay();
}

// Resolve o foco de um dia específico: usa a grade semanal se ela existir e
// tiver os 7 dias preenchidos; senão cai pro foco fixo do clube (mesmo
// comportamento de sempre — clube que nunca configurou grade semanal treina
// igual em todos os dias, sem mudança nenhuma de comportamento).
export function resolveWeeklyFocus(
  weekly: WeeklySchedule | null | undefined,
  flatFocus: TrainingFocus,
  dateISO: string,
): WeeklyFocus {
  if (!weekly || weekly.length !== 7) return flatFocus;
  return weekly[weekdayOf(dateISO)] ?? flatFocus;
}

// Recuperação de condição extra por dia de descanso, somada por cima da
// regeneração normal (ver conditionRegenPerDay em src/game/staff.ts) — é a
// metade concreta do trade-off "treinar mais rápido vs. elenco mais fresco".
export const REST_DAY_REGEN_BONUS = 6;

// Quantos dias de uma janela caem em "Descanso" pela grade do clube — usado
// pra somar o bônus de recuperação de condição desses dias (ver
// applyTrainingAndRecovery em src/lib/advance-day.ts). É por CLUBE (grade
// coletiva), não por jogador — foco individual não entra aqui de propósito,
// senão o bônus de recuperação variaria jogador a jogador de um jeito que a
// tela não consegue mostrar de forma simples.
export function countRestDays(
  weekly: WeeklySchedule | null | undefined,
  flatFocus: TrainingFocus,
  fromISO: string,
  days: number,
): number {
  let count = 0;
  let dateISO = fromISO;
  for (let i = 0; i < days; i++) {
    if (resolveWeeklyFocus(weekly, flatFocus, dateISO) === "rest") count++;
    dateISO = nextDateISO(dateISO);
  }
  return count;
}

export interface TrainablePlayer {
  id: string;
  age: number;
  position: string;
  attributes: PlayerAttributes;
  individual_training_focus?: WeeklyFocus | null;
  injured_until?: string | null;
}

export interface TrainingPatch {
  id: string;
  attrDeltas: Partial<Record<AttributeKey, number>>;
  overallDelta: number;
  injury?: { type: InjuryTypeKey; days: number };
}

export function applyTraining(
  players: TrainablePlayer[],
  focusForDate: (dateISO: string) => WeeklyFocus,
  fromISO: string,
  days: number,
  speedMultiplier: number,
  rng: () => number = Math.random,
  // Mentoria de jovens por veteranos (item 16 do backlog FootSim) — fator
  // EXTRA por jogador além do speedMultiplier do clube (treinador/CT, igual
  // pra todo mundo). Opcional/default neutro pra não quebrar nenhum
  // chamador existente — ver bestMentorFor/mentoringSpeedMultiplier em
  // src/game/mentoring.ts, calculado fora daqui (advance-day.ts) porque
  // precisa olhar o elenco inteiro, não só o jogador sendo treinado.
  individualMultiplier: (p: TrainablePlayer) => number = () => 1,
): TrainingPatch[] {
  const patches: TrainingPatch[] = [];
  for (const p of players) {
    // Jogador já lesionado está em repouso/reabilitação, não treino pesado
    // — sem risco extra de lesão nova, sem ganho de atributo.
    if (p.injured_until && p.injured_until >= fromISO) continue;

    const gainedAttrs = new Set<AttributeKey>();
    let injury: TrainingPatch["injury"];
    let dateISO = fromISO;

    for (let i = 0; i < days; i++) {
      const dayFocus = p.individual_training_focus ?? focusForDate(dateISO);
      dateISO = nextDateISO(dateISO);
      if (dayFocus === "rest") continue;

      const dailyRisk = FOCUS_INJURY_RISK[dayFocus] * injuryAgeFactor(p.age ?? 24);
      if (rng() < dailyRisk) {
        const rolled = rollInjuryType(rng);
        injury = { type: rolled.type, days: rolled.days };
        break; // lesionou nesse dia — para de treinar o resto da janela
      }

      // Goleiro só evolui em foco de goleiro, e foco de goleiro só treina
      // goleiro — mas o risco de lesão acima já rolou de qualquer jeito.
      const mismatch = (dayFocus === "goalkeeping") !== (p.position === "GK");
      if (mismatch) continue;

      const chancePerAttr = BASE_DAILY_CHANCE * ageFactor(p.age ?? 24) * speedMultiplier * individualMultiplier(p);
      for (const attr of FOCUS_ATTRS[dayFocus]) {
        if (gainedAttrs.has(attr)) continue;
        const cur = p.attributes?.[attr] ?? 10;
        if (cur >= 20) continue;
        if (rng() < chancePerAttr) gainedAttrs.add(attr);
      }
    }

    const attrDeltas: Partial<Record<AttributeKey, number>> = {};
    for (const attr of gainedAttrs) attrDeltas[attr] = 1;
    const gained = gainedAttrs.size;
    if (gained > 0 || injury) {
      // Overall só sente quando pelo menos 2 atributos do foco avançam na
      // mesma janela — evita inflar o overall a cada tiquinho de atributo.
      patches.push({ id: p.id, attrDeltas, overallDelta: gained >= 2 ? 1 : 0, injury });
    }
  }
  return patches;
}
