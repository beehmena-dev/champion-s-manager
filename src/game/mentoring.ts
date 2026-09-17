// -----------------------------------------------------------------------------
// Mentoria de jovens por veteranos — lógica pura (sem I/O).
//
// Item 16 do backlog FootSim: veterano de personalidade forte acelera o
// desenvolvimento de um jovem no mesmo elenco. Não existe (e não é este
// item que decide) um sistema de TRAÇOS de personalidade de verdade — isso
// é o item 23, maior escopo, adiado de propósito até ter desenho próprio.
// Em vez de fabricar um traço novo, "personalidade forte" aqui é derivada
// dos atributos mentais que JÁ existem em todo jogador (liderança +
// determinação) — mesmo espírito de reaproveitar dado real já usado em
// squadChemistryMultiplier (química) e fanTemperamentFromClubId (torcida).
// -----------------------------------------------------------------------------

export const MENTOR_MIN_AGE = 28;
export const MENTEE_MAX_AGE = 21;
// Média liderança+determinação (escala 1-20) que qualifica um veterano como
// mentor — abaixo disso ele é só "mais um jogador velho", não um exemplo.
// Calibrado contra o banco real (base FM24 importada), não chutado: entre
// jogadores 28+, a média real é ~8,4 e só ~11% passam de 11 — barra alta o
// bastante pra "personalidade forte" continuar sendo exceção, mas comum o
// bastante pra a feature aparecer de verdade num elenco grande (a primeira
// calibração, 14, deixava só 0,9% dos veteranos qualificados — quase
// nenhum clube teria mentor nenhum).
export const MENTOR_MIN_MENTAL = 11;

export interface MentorLike {
  id: string;
  age: number;
  attributes: { leadership: number; determination: number };
  overall: number;
}

// Força mental do jogador (0-20) — o sinal que substitui "personalidade
// forte" sem inventar atributo novo.
export function mentorStrength(p: MentorLike): number {
  return (p.attributes.leadership + p.attributes.determination) / 2;
}

export function isMentorCandidate(p: MentorLike): boolean {
  return p.age >= MENTOR_MIN_AGE && mentorStrength(p) >= MENTOR_MIN_MENTAL;
}

export function isMenteeCandidate(age: number): boolean {
  return age <= MENTEE_MAX_AGE;
}

// Melhor mentor disponível no MESMO elenco pra um jovem — nunca soma vários
// mentores ao mesmo tempo (evitar empilhar veterano em cima de veterano),
// só o mais forte (mental × overall, um bom exemplo E referência técnica)
// conta.
export function bestMentorFor<T extends MentorLike>(menteeId: string, squad: T[]): T | null {
  const candidates = squad.filter((m) => m.id !== menteeId && isMentorCandidate(m));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, m) =>
    mentorStrength(m) * m.overall > mentorStrength(best) * best.overall ? m : best,
  );
}

// Multiplicador de velocidade de treino do jovem mentorado — cresce com a
// força do mentor (mental × habilidade), teto de +35% no melhor caso
// possível (mentor com mental 20 e overall 99). Efeito real, mas nunca
// decide sozinho o desenvolvimento — mesmo tempero, não dial disfarçado,
// da química de elenco (item 08).
export function mentoringSpeedMultiplier(mentor: MentorLike | null): number {
  if (!mentor) return 1;
  const mentalFactor = mentorStrength(mentor) / 20;
  const skillFactor = mentor.overall / 100;
  return 1 + mentalFactor * skillFactor * 0.35;
}
