// -----------------------------------------------------------------------------
// Comissão técnica — lógica pura (sem I/O).
//
// Três papéis, cada um plugado num sistema que já existe:
//  - coach (treinador): acelera a evolução de atributos no treino (training.ts)
//  - fitness_coach (preparador físico): acelera a recuperação de condição
//  - chief_scout (olheiro-chefe): acelera o scouting e libera mais vagas
//    simultâneas de observação (scouting.ts)
// Sem ninguém contratado num papel, o efeito correspondente roda no ritmo
// básico (nunca trava por falta de comissão — só fica mais lento).
// -----------------------------------------------------------------------------

export type StaffRole = "coach" | "fitness_coach" | "chief_scout";

export const STAFF_ROLES: StaffRole[] = ["coach", "fitness_coach", "chief_scout"];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  coach: "Treinador",
  fitness_coach: "Preparador físico",
  chief_scout: "Olheiro-chefe",
};

export const STAFF_ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  coach: "Acelera a evolução de atributos dos jogadores no treino.",
  fitness_coach: "Acelera a recuperação de condição física do elenco.",
  chief_scout: "Acelera o scouting e libera vagas extras de observação simultânea.",
};

const FIRST_NAMES = [
  "Carlos", "Marcelo", "Fernando", "Roberto", "Paulo", "Ricardo", "André", "Eduardo",
  "Luiz", "Sérgio", "Cláudio", "Marcos", "Alexandre", "Rogério", "Fábio", "Renato",
  "Vagner", "Wagner", "Hélio", "Ivo",
];
const LAST_NAMES = [
  "Menezes", "Barbosa", "Teixeira", "Andrade", "Cavalcanti", "Nogueira", "Pereira",
  "Moraes", "Correia", "Vieira", "Bastos", "Lacerda", "Guimarães", "Fontoura",
  "Salgado", "Duarte", "Amorim", "Prado", "Siqueira", "Machado",
];

export function generateStaffName(rng: () => number): string {
  const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

export interface StaffCandidate {
  name: string;
  role: StaffRole;
  skill: number;
  wage: number;
}

export function generateCandidate(role: StaffRole, rng: () => number = Math.random): StaffCandidate {
  const skill = Math.round(4 + rng() * 16); // 4-20
  const wage = Math.round(6000 + skill * 900 + rng() * 2000);
  return { name: generateStaffName(rng), role, skill, wage };
}

// Comissão técnica de clube de IA — antes NENHUM clube de IA tinha comissão
// (staff.club_id nunca era setado fora da contratação manual do usuário),
// então trainingSpeedMultiplier/conditionRegenPerDay pra IA sempre caíam no
// skill 0 (ritmo básico) e a folha de pagamento da IA nunca incluía staff —
// uma folga artificial de caixa. Skill escala com a reputação do clube (clube
// grande contrata treinador melhor), com uma variação pra não empatar todo
// mundo do mesmo patamar de reputação. Ver src/lib/staff.ts::assignAIStaff.
export function generateAIStaffCandidate(role: StaffRole, clubReputation: number, rng: () => number = Math.random): StaffCandidate {
  const base = 4 + (clubReputation / 100) * 14;
  const skill = Math.max(1, Math.min(20, Math.round(base + (rng() - 0.5) * 6)));
  const wage = Math.round(6000 + skill * 900 + rng() * 2000);
  return { name: generateStaffName(rng), role, skill, wage };
}

// -----------------------------------------------------------------------------
// Modificadores que a comissão aplica em outros sistemas.
// skill 0 = ninguém contratado nesse papel (efeito básico, sem bônus).
// -----------------------------------------------------------------------------

export function trainingSpeedMultiplier(coachSkill: number): number {
  return 1 + coachSkill / 20; // treinador nota 20 quase dobra o ritmo
}

export function conditionRegenPerDay(fitnessCoachSkill: number): number {
  const BASE_REGEN = 2; // recuperação de descanso, mesmo sem preparador físico
  return BASE_REGEN + Math.round((fitnessCoachSkill / 20) * 3); // até +3 com preparador nota 20
}
