// -----------------------------------------------------------------------------
// Calendário — monta um mapa "dia → eventos" a partir de dados reais (jogos,
// fim de contrato, mensagens da caixa de entrada). Nunca inventa evento sem
// dado por trás (nada de jogo de sub-20/reserva fictício, nem transferência
// "agendada" — no nosso motor a transferência se resolve no mesmo dia que é
// aceita, não existe uma data futura de "saída acertada" ainda).
//
// Puro — sem Supabase aqui (isso fica em src/lib/calendar.ts), só pra poder
// testar a montagem do mapa sem banco.
// -----------------------------------------------------------------------------

export type CalendarEventKind = "match" | "contract_end" | "medical" | "transfer" | "youth" | "result" | "board" | "press" | "general";
// Subconjunto de Tone (src/components/fm.tsx) — sem "strategy", não faz
// sentido pra nenhum evento de calendário.
export type CalendarEventTone = "ok" | "info" | "warn" | "danger" | "neutral";

export interface CalendarDayEvent {
  kind: CalendarEventKind;
  label: string;
  tone: CalendarEventTone;
  link?: string;
}

export type CalendarDayMap = Map<string, CalendarDayEvent[]>;

export interface CalendarMatchRow {
  match_date: string;
  played: boolean;
  home_score: number | null;
  away_score: number | null;
  home_club_id: string;
  away_club_id: string;
  home_name?: string;
  away_name?: string;
}

export interface CalendarContractRow {
  contract_until: string;
  name: string;
}

export interface CalendarInboxRow {
  game_date: string;
  category: string;
  subject: string;
}

// Categorias da caixa de entrada que viram marcador no dia — "press"/"board"/
// "general" ficam de fora (não têm relação com um evento concreto do dia,
// poluiriam o calendário com ruído de baixo valor).
const INBOX_KIND: Record<string, CalendarEventKind | null> = {
  medical: "medical", transfer: "transfer", youth: "youth", result: null, // resultado já vem do próprio jogo
  contract: "contract_end", board: null, press: null, general: null,
};

function addEvent(map: CalendarDayMap, date: string, ev: CalendarDayEvent) {
  const list = map.get(date);
  if (list) list.push(ev);
  else map.set(date, [ev]);
}

export function buildCalendarEventMap(opts: {
  myClubId: string;
  matches: CalendarMatchRow[];
  contracts: CalendarContractRow[];
  inbox: CalendarInboxRow[];
}): CalendarDayMap {
  const map: CalendarDayMap = new Map();

  for (const m of opts.matches) {
    const isHome = m.home_club_id === opts.myClubId;
    const oppName = isHome ? m.away_name : m.home_name;
    const label = m.played
      ? `${isHome ? m.home_score : m.away_score} × ${isHome ? m.away_score : m.home_score} ${isHome ? "vs" : "@"} ${oppName ?? "adversário"}`
      : `${isHome ? "vs" : "@"} ${oppName ?? "adversário"}`;
    const won = m.played && ((isHome && (m.home_score ?? 0) > (m.away_score ?? 0)) || (!isHome && (m.away_score ?? 0) > (m.home_score ?? 0)));
    const lost = m.played && ((isHome && (m.home_score ?? 0) < (m.away_score ?? 0)) || (!isHome && (m.away_score ?? 0) < (m.home_score ?? 0)));
    addEvent(map, m.match_date, {
      kind: "match",
      label,
      tone: !m.played ? "info" : won ? "ok" : lost ? "danger" : "neutral",
    });
  }

  for (const c of opts.contracts) {
    addEvent(map, c.contract_until, { kind: "contract_end", label: `Contrato de ${c.name} termina`, tone: "warn" });
  }

  for (const i of opts.inbox) {
    const kind = INBOX_KIND[i.category];
    if (!kind) continue;
    addEvent(map, i.game_date, {
      kind,
      label: i.subject,
      tone: kind === "medical" ? "danger" : kind === "youth" ? "ok" : "info",
    });
  }

  return map;
}
