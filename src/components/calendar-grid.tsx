import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarDayMap, CalendarEventTone } from "@/game/calendar-events";

// -----------------------------------------------------------------------------
// Grade de calendário mês (estilo FM: "toda vez que avança o dia, aparece o
// calendário com todos os dias do mês e o que há em cada dia" — pedido do
// user 2026-09-12). Componente puro de apresentação — quem chama já traz o
// mapa dia→eventos pronto (ver src/lib/calendar.ts).
//
// Reaproveitado em 2 lugares: a tela de calendário (navegação livre por mês)
// e o overlay de avanço de dia (mês fixo no dia de hoje, com os dias sendo
// avançados destacados via `advancingDates`/`advancingIndex`).
// -----------------------------------------------------------------------------

const TONE_DOT: Record<CalendarEventTone, string> = {
  ok: "bg-ok", info: "bg-info", warn: "bg-warn", danger: "bg-danger", neutral: "bg-muted-foreground",
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthGridDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay()); // volta até o domingo da semana do dia 1
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) { // 6 semanas cobre qualquer mês
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

export function CalendarGrid({
  monthYear, monthMonth, eventsByDate, todayISO, advancingDates, advancingIndex, className,
}: {
  monthYear: number;
  monthMonth: number; // 0-11
  eventsByDate: CalendarDayMap;
  todayISO?: string;
  /** Datas sendo avançadas agora (overlay) — pintadas de forma distinta. */
  advancingDates?: string[];
  /** Índice em `advancingDates` já "passado" (0-based, inclusive). */
  advancingIndex?: number;
  className?: string;
}) {
  const days = monthGridDays(monthYear, monthMonth);
  const monthLabelRaw = new Date(monthYear, monthMonth, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  // Só a 1ª letra maiúscula ("Fevereiro de 2026") — `capitalize` do Tailwind
  // deixaria "Fevereiro De 2026" (capitaliza toda palavra, "de" incluído).
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);
  const advancingSet = new Set(advancingDates ?? []);

  return (
    <div className={cn("select-none", className)}>
      <div className="mb-2 flex items-center justify-between px-0.5">
        <span className="text-sm font-semibold">{monthLabel}</span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {WEEKDAY_LABELS.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const iso = toISO(d);
          const inMonth = d.getMonth() === monthMonth;
          const events = eventsByDate.get(iso) ?? [];
          const isToday = iso === todayISO;
          const advIdx = advancingDates?.indexOf(iso) ?? -1;
          const isAdvancing = advIdx >= 0;
          const isPassed = isAdvancing && advancingIndex != null && advIdx <= advancingIndex;
          const isCurrentAdvance = isAdvancing && advancingIndex != null && advIdx === advancingIndex;
          return (
            <div
              key={iso}
              title={events.map((e) => e.label).join(" · ") || undefined}
              className={cn(
                "flex min-h-14 flex-col items-center gap-1 rounded-md border px-1 py-1 text-xs transition-colors",
                inMonth ? "bg-elevated/40" : "bg-transparent opacity-35",
                isToday && "border-primary",
                !isToday && "border-border/60",
                isCurrentAdvance && "border-primary ring-2 ring-primary/50",
                isPassed && !isCurrentAdvance && "bg-primary/10",
              )}
            >
              <span className={cn("font-mono tabular-nums", isToday && "font-bold text-primary")}>{d.getDate()}</span>
              {events.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-0.5">
                  {events.slice(0, 4).map((e, i) => (
                    <span key={i} className={cn("size-1.5 rounded-full", TONE_DOT[e.tone])} />
                  ))}
                  {events.length > 4 && <span className="text-[9px] text-muted-foreground">+{events.length - 4}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function monthNav(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function MonthNavButtons({
  onPrev, onNext, onToday,
}: { onPrev: () => void; onNext: () => void; onToday?: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onPrev} className="rounded-md border p-1 hover:bg-elevated/60" aria-label="Mês anterior">
        <ChevronLeft className="size-4" />
      </button>
      {onToday && (
        <button type="button" onClick={onToday} className="rounded-md border px-2 py-1 text-xs hover:bg-elevated/60">
          Hoje
        </button>
      )}
      <button type="button" onClick={onNext} className="rounded-md border p-1 hover:bg-elevated/60" aria-label="Próximo mês">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
