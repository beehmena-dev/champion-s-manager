// -----------------------------------------------------------------------------
// Exportar/importar tática em JSON — lógica pura (sem I/O).
//
// Item 05 do backlog FootSim: "botão que salva formação+função+instruções
// num arquivo, outro que aplica isso num save diferente — dá pra
// compartilhar tática pronta com outro jogador." De propósito, o formato
// exportado NUNCA carrega playerId — um jogador específico só existe dentro
// do save de origem, não faz sentido tentar levar isso pra outro save (nem
// pro MESMO save num save novo). O que é compartilhável de verdade é a
// FORMA da tática: formação, mentalidade, os 3 dials, estilo de passe,
// fluidez, e — por posição (slot) — a função e as instruções. Quem importa
// escala os próprios jogadores nessa forma depois (Auto-escalar ou manual),
// igual já faz ao trocar de formação hoje.
// -----------------------------------------------------------------------------

import type { FormationCode, Mentality, PassingStyle, TeamFluidity } from "./types";
import { normalizeInstructions, type PlayerInstructions } from "./player-instructions";

export const TACTIC_EXPORT_VERSION = 1;

export const FORMATION_CODES: FormationCode[] = [
  "4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "5-3-2", "4-1-4-1",
  "4-5-1", "3-4-3", "4-4-1-1", "5-4-1", "4-3-1-2",
];
const MENTALITIES: Mentality[] = ["defensive", "balanced", "attacking"];
const PASSING_STYLES: PassingStyle[] = ["short", "mixed", "direct"];

export interface TacticExportSlot {
  slot: string;
  role: string;
  instructions?: PlayerInstructions;
  // Coordenada livre (0-100%) do slot na tela de Tática — opcional pra não
  // quebrar arquivos exportados antes da tática 100% livre existir. Sem
  // isso, importar um arquivo antigo cai pro layout padrão do template
  // (mesmo comportamento de sempre).
  pos_x?: number;
  pos_y?: number;
}

export interface TacticExport {
  version: number;
  formation: FormationCode;
  mentality: Mentality;
  pressing: number;
  defensive_line: number;
  tempo: number;
  passing_style: PassingStyle;
  team_fluidity: TeamFluidity;
  slots: TacticExportSlot[];
}

// Shape mínimo aceito de um TacticSnapshot (tactics.tsx) — não importa o
// tipo exato de lá pra não criar dependência de rota↔motor, só o formato.
export interface TacticSnapshotLike {
  formation: FormationCode;
  mentality: Mentality;
  pressing: number;
  defensive_line: number;
  tempo: number;
  passing_style: PassingStyle;
  team_fluidity?: TeamFluidity;
  lineup: { slot: string; playerId: string; role: string; instructions?: PlayerInstructions; pos_x?: number; pos_y?: number }[];
}

export function toTacticExport(snapshot: TacticSnapshotLike): TacticExport {
  return {
    version: TACTIC_EXPORT_VERSION,
    formation: snapshot.formation,
    mentality: snapshot.mentality,
    pressing: snapshot.pressing,
    defensive_line: snapshot.defensive_line,
    tempo: snapshot.tempo,
    passing_style: snapshot.passing_style,
    team_fluidity: snapshot.team_fluidity ?? "structured",
    slots: snapshot.lineup
      .filter((l) => l.role)
      .map((l) => ({ slot: l.slot, role: l.role, instructions: l.instructions, pos_x: l.pos_x, pos_y: l.pos_y })),
  };
}

export class TacticImportError extends Error {}

function clampDial(v: unknown, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/**
 * Valida e normaliza um JSON externo — nunca é dado confiável (pode vir de
 * qualquer arquivo que alguém arraste ali, de outra sessão/pessoa/versão do
 * jogo). Rejeita explicitamente o que não bate com o formato; nunca deixa
 * passar um valor de enum bagunçado adiante silenciosamente.
 */
export function parseTacticExport(raw: unknown): TacticExport {
  if (!raw || typeof raw !== "object") throw new TacticImportError("Arquivo inválido: não é um objeto JSON.");
  const r = raw as Record<string, unknown>;

  if (typeof r.formation !== "string" || !FORMATION_CODES.includes(r.formation as FormationCode)) {
    throw new TacticImportError("Arquivo inválido: formação desconhecida ou ausente.");
  }
  if (typeof r.mentality !== "string" || !MENTALITIES.includes(r.mentality as Mentality)) {
    throw new TacticImportError("Arquivo inválido: mentalidade desconhecida ou ausente.");
  }
  if (!Array.isArray(r.slots) || r.slots.length === 0) {
    throw new TacticImportError("Arquivo inválido: nenhuma posição encontrada.");
  }

  const slots: TacticExportSlot[] = r.slots.map((s, i) => {
    if (!s || typeof s !== "object" || typeof (s as any).slot !== "string" || typeof (s as any).role !== "string") {
      throw new TacticImportError(`Arquivo inválido: posição ${i + 1} da lista está mal formada.`);
    }
    const entry = s as { slot: string; role: string; instructions?: unknown; pos_x?: unknown; pos_y?: unknown };
    const pos_x = typeof entry.pos_x === "number" && Number.isFinite(entry.pos_x) ? Math.max(5, Math.min(95, entry.pos_x)) : undefined;
    const pos_y = typeof entry.pos_y === "number" && Number.isFinite(entry.pos_y) ? Math.max(5, Math.min(95, entry.pos_y)) : undefined;
    return { slot: entry.slot, role: entry.role, instructions: normalizeInstructions(entry.instructions as any), pos_x, pos_y };
  });

  return {
    version: typeof r.version === "number" ? r.version : 1,
    formation: r.formation as FormationCode,
    mentality: r.mentality as Mentality,
    pressing: clampDial(r.pressing, 3),
    defensive_line: clampDial(r.defensive_line, 3),
    tempo: clampDial(r.tempo, 3),
    passing_style: typeof r.passing_style === "string" && PASSING_STYLES.includes(r.passing_style as PassingStyle)
      ? (r.passing_style as PassingStyle) : "mixed",
    team_fluidity: r.team_fluidity === "fluid" ? "fluid" : "structured",
    slots,
  };
}
