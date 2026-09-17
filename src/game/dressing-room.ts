// -----------------------------------------------------------------------------
// Dinâmica do vestiário — hierarquia (quem manda no grupo), clima e conversas
// individuais do técnico com os jogadores. Lógica pura; a persistência fica em
// src/lib/dressing-room.ts e a tela em saves.$saveId.squad.tsx (aba "Dinâmica").
// -----------------------------------------------------------------------------
import type { PlayerAttributes } from "./attributes";

export interface DressingRoomPlayer {
  id: string;
  name: string;
  age: number;
  position: string;
  overall: number;
  morale: number; // 0-100
  form?: number | null; // 0-10
  guaranteed_starter?: boolean | null;
  last_talk_date?: string | null;
  attributes?: Partial<PlayerAttributes> | null;
}

const attr = (p: DressingRoomPlayer, k: keyof PlayerAttributes) => Number(p.attributes?.[k] ?? 10);

/** Peso do jogador na hierarquia do grupo. Liderança pesa mais; idade e
 *  overall dão "cadeira cativa"; ego (pouco trabalho em equipe) não conta. */
export function standingScore(p: DressingRoomPlayer): number {
  const ageBonus = Math.max(0, Math.min(12, (p.age - 22) * 1.4));
  return (
    attr(p, "leadership") * 2.3 +
    attr(p, "determination") * 1.0 +
    attr(p, "teamwork") * 0.7 +
    p.overall * 0.14 +
    ageBonus
  );
}

export type HierarchyTier = "leader" | "very_influential" | "influential" | "squad";

export const HIERARCHY_LABEL: Record<HierarchyTier, string> = {
  leader: "Líder de equipe",
  very_influential: "Muito influente",
  influential: "Influente",
  squad: "Grupo geral",
};

/** Classifica o elenco em 4 faixas de influência, por tamanho relativo do grupo. */
export function hierarchyTiers(players: DressingRoomPlayer[]): { player: DressingRoomPlayer; tier: HierarchyTier }[] {
  const ranked = [...players].sort((a, b) => standingScore(b) - standingScore(a));
  const n = ranked.length;
  const nLeaders = Math.max(1, Math.min(3, Math.round(n * 0.12)));
  const nVery = Math.max(2, Math.round(n * 0.18));
  const nInfl = Math.max(3, Math.round(n * 0.3));
  return ranked.map((player, i) => ({
    player,
    tier:
      i < nLeaders ? "leader" :
      i < nLeaders + nVery ? "very_influential" :
      i < nLeaders + nVery + nInfl ? "influential" :
      "squad",
  }));
}

// --- Clima do vestiário -------------------------------------------------------
export interface AtmosphereMetric {
  value: number; // 0-100
  label: string;
}
export interface DressingRoomAtmosphere {
  cohesion: AtmosphereMetric;
  managerSupport: AtmosphereMetric;
  morale: AtmosphereMetric;
}

function labelFor(v: number): string {
  if (v >= 82) return "Excelente";
  if (v >= 66) return "Muito boa";
  if (v >= 48) return "Estável";
  if (v >= 32) return "Baixa";
  return "Crítica";
}
const clamp01to100 = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export function dressingRoomAtmosphere(opts: {
  players: DressingRoomPlayer[];
  boardConfidence: number; // 0-100
  recentForm: ("V" | "E" | "D")[]; // mais antigo → mais novo
}): DressingRoomAtmosphere {
  const { players, boardConfidence, recentForm } = opts;
  const n = Math.max(1, players.length);
  const avgMorale = players.reduce((s, p) => s + (p.morale ?? 70), 0) / n;
  const avgTeamwork = players.reduce((s, p) => s + attr(p, "teamwork"), 0) / n;
  const unhappy = players.filter((p) => (p.morale ?? 70) < 40).length;
  const formPts = recentForm.reduce((s, r) => s + (r === "V" ? 1 : r === "E" ? 0 : -1), 0);

  const tiers = hierarchyTiers(players);
  const leaders = tiers.filter((t) => t.tier === "leader").map((t) => t.player);
  const leadersMorale = leaders.length
    ? leaders.reduce((s, p) => s + (p.morale ?? 70), 0) / leaders.length
    : avgMorale;

  const cohesion = clamp01to100(avgTeamwork * 4 + avgMorale * 0.35 - unhappy * 6);
  const managerSupport = clamp01to100(boardConfidence * 0.5 + leadersMorale * 0.35 + formPts * 3 + 8);
  const morale = clamp01to100(avgMorale);

  return {
    cohesion: { value: cohesion, label: labelFor(cohesion) },
    managerSupport: { value: managerSupport, label: labelFor(managerSupport) },
    morale: { value: morale, label: labelFor(morale) },
  };
}

// --- Conversas individuais ----------------------------------------------------
export type ConversationTopic = "praise_form" | "praise_training" | "demand_more" | "reassure_future";

export const CONVERSATION_TOPICS: { id: ConversationTopic; label: string; hint: string }[] = [
  { id: "praise_form", label: "Elogiar o bom momento", hint: "Rende bem quando a forma está alta; soa vazio quando está ruim." },
  { id: "praise_training", label: "Reconhecer a dedicação nos treinos", hint: "Ganho modesto e seguro." },
  { id: "demand_more", label: "Cobrar mais intensidade", hint: "Jogadores determinados aceitam; os de ego frágil se irritam." },
  { id: "reassure_future", label: "Garantir que faz parte dos planos", hint: "Ótimo para quem está desanimado ou muito tempo no banco." },
];

export const CONVERSATION_COOLDOWN_DAYS = 10;

export function conversationOnCooldown(p: DressingRoomPlayer, todayISO: string): number {
  if (!p.last_talk_date) return 0;
  const days = Math.round(
    (new Date(todayISO + "T00:00:00Z").getTime() - new Date(p.last_talk_date + "T00:00:00Z").getTime()) / 86_400_000,
  );
  return Math.max(0, CONVERSATION_COOLDOWN_DAYS - days);
}

export function applyConversation(
  p: DressingRoomPlayer,
  topic: ConversationTopic,
): { moraleDelta: number; response: string } {
  const form = p.form ?? 6;
  const determ = attr(p, "determination");
  const teamwork = attr(p, "teamwork");

  switch (topic) {
    case "praise_form":
      return form >= 7
        ? { moraleDelta: +7, response: `${p.name} agradeceu o reconhecimento e prometeu manter o nível.` }
        : form >= 5
          ? { moraleDelta: +2, response: `${p.name} recebeu bem o elogio, ainda que discreto.` }
          : { moraleDelta: -3, response: `${p.name} não se reconheceu no elogio — sabe que não está bem.` };
    case "praise_training":
      return { moraleDelta: +4, response: `${p.name} ficou satisfeito por ter o empenho nos treinos notado.` };
    case "demand_more":
      return determ >= 14
        ? { moraleDelta: +3, response: `${p.name} encarou a cobrança como um desafio e prometeu resposta em campo.` }
        : teamwork <= 8
          ? { moraleDelta: -6, response: `${p.name} não gostou nada da cobrança pública e ficou contrariado.` }
          : { moraleDelta: -2, response: `${p.name} ouviu a cobrança em silêncio, visivelmente incomodado.` };
    case "reassure_future":
      return (p.morale ?? 70) < 55 || !p.guaranteed_starter
        ? { moraleDelta: +8, response: `${p.name} agradeceu a transparência e saiu da conversa mais motivado.` }
        : { moraleDelta: +3, response: `${p.name} já se sentia parte do grupo, mas gostou de ouvir.` };
  }
}
