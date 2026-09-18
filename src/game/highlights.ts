import type { MatchEvent } from "@/game/types";

// -----------------------------------------------------------------------------
// Motor de "melhores momentos" — compartilhado entre o visualizador 2D
// (match-pitch.tsx) e o 3D (match-viewer.tsx). Antes só o 3D usava isso; o 2D
// tinha seu próprio relógio contínuo (0→90 min a 6-15 min de jogo por
// segundo real), o que fazia a partida INTEIRA passar em 6-30s — rápido
// demais pra qualquer movimento parecer futebol de verdade (usuário: "nada
// parecido com a realidade de uma partida"). O real FM (vídeo de referência)
// também funciona por lances de destaque (Key/Extended/Comprehensive
// Highlights), nunca simulação contínua a velocidade turbo.
//
// 2026-09-18 ("o 2D está quebrado"): o modo único de lances-chave fazia o
// campo simplesmente NÃO EXISTIR num período sem gol/grande chance — a tela
// ficava só com o aviso "sem lances de perigo", que é o primeiro jogo de
// qualquer save sem gol no 1º tempo. Agora existem os três modos do FM real
// (chave / estendido / partida completa) e, em qualquer modo, um período sem
// nada marcado cai num segmento único cobrindo o período inteiro — o campo
// sempre aparece, nunca some.
// -----------------------------------------------------------------------------

export const HL_SPEED = 0.35; // minutos de jogo por segundo real — ritmo normal de um lance
export const HL_PRE = 1.3;    // minutos antes do evento
export const HL_POST = 2.6;   // minutos depois (dá tempo da comemoração/reprise)
export const HL_CUT_MS = 500; // pausa de corte entre lances (curta — "tempo de espera mínimo")
export const HL_TYPES = new Set<MatchEvent["type"]>(["goal", "chance", "red"]);

/** Modos de destaque, equivalentes aos do FM (Key / Extended / Comprehensive). */
export type HighlightMode = "key" | "extended" | "full";

const MODE_TYPES: Record<HighlightMode, Set<MatchEvent["type"]>> = {
  key: HL_TYPES,
  extended: new Set<MatchEvent["type"]>(["goal", "chance", "red", "yellow", "save", "injury", "offside", "var"]),
  full: new Set<MatchEvent["type"]>(),
};

export interface HighlightSegment {
  start: number;
  end: number;
}

export function buildHighlights(
  events: MatchEvent[],
  from: number,
  to: number,
  mode: HighlightMode = "key",
): HighlightSegment[] {
  // Partida completa: um único segmento do período inteiro (o relógio corre
  // do início ao fim sem corte, como o "Comprehensive" do FM).
  if (mode === "full") return to > from ? [{ start: from, end: to }] : [];

  const types = MODE_TYPES[mode];
  const marks = events
    .filter((e) => types.has(e.type) && e.minute >= from && e.minute <= to)
    .map((e) => e.minute)
    .sort((a, b) => a - b);
  const segs: HighlightSegment[] = [];
  for (const m of marks) {
    const start = Math.max(from, m - HL_PRE);
    const end = Math.min(to, m + HL_POST);
    const last = segs[segs.length - 1];
    if (last && start <= last.end + 0.4) last.end = Math.max(last.end, end);
    else segs.push({ start, end });
  }
  // Período morto (nenhum lance marcado): em vez de "sem lances" com a tela
  // vazia, toca o período inteiro — o campo nunca desaparece.
  if (segs.length === 0 && to > from) return [{ start: from, end: to }];
  return segs;
}
