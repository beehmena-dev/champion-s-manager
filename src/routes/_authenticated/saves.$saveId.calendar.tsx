import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/game-hooks";
import { fetchCalendarEvents } from "@/lib/calendar";
import { isRivalry } from "@/game/rivalries";
import { dayDiff } from "@/game/congestion";
import { PageHeader, Pill, EmptyState, SubViewDropdown } from "@/components/fm";
import { ClubCrest } from "@/components/club-crest";
import { CalendarGrid, MonthNavButtons, monthNav } from "@/components/calendar-grid";
import { CalendarDays, Flame, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/saves/$saveId/calendar")({
  component: Calendar,
});

const EVENT_LEGEND: { tone: "ok" | "info" | "warn" | "danger" | "neutral"; label: string }[] = [
  { tone: "info", label: "Jogo agendado" },
  { tone: "ok", label: "Vitória / notícia boa" },
  { tone: "danger", label: "Derrota / lesão" },
  { tone: "warn", label: "Fim de contrato" },
  { tone: "neutral", label: "Empate / outro" },
];

function Calendar() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/calendar" });
  const [view, setView] = useState<"grid" | "list">("grid");

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const clubId = save.data?.my_club_id;
  const todayISO = save.data?.game_date as string | undefined;

  const todayDate = todayISO ? new Date(todayISO + "T00:00:00") : new Date();
  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(null);
  const { year, month } = cursor ?? { year: todayDate.getFullYear(), month: todayDate.getMonth() };

  // Janela um pouco maior que o mês exibido (a grade mostra ~6 semanas, então
  // pode vazar pro mês vizinho nas pontas) pra nenhum dia visível ficar sem dado.
  const rangeStart = useMemo(() => {
    const d = new Date(year, month, 1); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10);
  }, [year, month]);
  const rangeEnd = useMemo(() => {
    const d = new Date(year, month + 1, 0); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10);
  }, [year, month]);

  const events = useQuery({
    queryKey: ["calendar-events", saveId, clubId, rangeStart, rangeEnd],
    enabled: !!clubId,
    queryFn: () => fetchCalendarEvents(saveId, clubId!, rangeStart, rangeEnd),
  });

  const all = useQuery({
    queryKey: ["cal", saveId, clubId],
    enabled: !!clubId && view === "list",
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("*")
        .eq("save_id", saveId)
        .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
        .order("match_date", { ascending: true });
      const ids = new Set<string>();
      for (const m of data ?? []) { ids.add(m.home_club_id); ids.add(m.away_club_id); }
      const { data: clubs } = await supabase.from("clubs").select("id, name, short_name, crest_url, primary_color, secondary_color").in("id", Array.from(ids));
      const map = new Map((clubs ?? []).map((c) => [c.id, c]));
      return (data ?? []).map((m) => ({ ...m, home: map.get(m.home_club_id), away: map.get(m.away_club_id) }));
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        icon={CalendarDays}
        title="Calendário"
        subtitle="Jogos, fim de contrato e novidades do clube, dia a dia."
        actions={
          <SubViewDropdown
            options={[
              { value: "grid", label: "Grade do mês" },
              { value: "list", label: "Lista de jogos" },
            ]}
            value={view}
            onValueChange={setView}
          />
        }
      />

      {view === "grid" ? (
        <Card className="p-3">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {EVENT_LEGEND.map((l) => (
                <span key={l.label} className="inline-flex items-center gap-1">
                  <span className={`size-1.5 rounded-full ${l.tone === "ok" ? "bg-ok" : l.tone === "info" ? "bg-info" : l.tone === "warn" ? "bg-warn" : l.tone === "danger" ? "bg-danger" : "bg-muted-foreground"}`} />
                  {l.label}
                </span>
              ))}
            </div>
            <MonthNavButtons
              onPrev={() => setCursor(monthNav(year, month, -1))}
              onNext={() => setCursor(monthNav(year, month, 1))}
              onToday={() => setCursor(null)}
            />
          </div>
          <CalendarGrid monthYear={year} monthMonth={month} eventsByDate={events.data ?? new Map()} todayISO={todayISO} />
        </Card>
      ) : (
        <Card className="p-2">
          <div className="divide-y divide-border/50">
            {all.data?.map((m: any, i: number) => {
              const isMine = m.home_club_id === clubId || m.away_club_id === clubId;
              const derby = m.home?.name && m.away?.name && isRivalry(m.home.name, m.away.name);
              // Intervalo desde o jogo anterior do MEU clube (a lista já é só dos meus).
              const prev = all.data![i - 1] as any;
              const gap = prev ? dayDiff(prev.match_date, m.match_date) : null;
              const tight = gap != null && gap > 0 && gap <= 3;
              return (
                <div key={m.id} className={`flex items-center gap-2 px-2 py-2 text-sm ${isMine ? "" : "opacity-75"}`}>
                  <div className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{formatDate(m.match_date)}</div>
                  <div className="flex flex-1 items-center gap-2">
                    <span className={`inline-flex items-center gap-1 ${m.home_club_id === clubId ? "font-semibold" : ""}`}>{m.home && <ClubCrest club={m.home} className="w-3.5 h-3.5" />} {m.home?.name}</span>
                    {m.played ? (
                      <span className="mx-1 font-mono font-semibold">{m.home_score} × {m.away_score}</span>
                    ) : (
                      <span className="mx-1 text-muted-foreground">×</span>
                    )}
                    <span className={`inline-flex items-center gap-1 ${m.away_club_id === clubId ? "font-semibold" : ""}`}>{m.away && <ClubCrest club={m.away} className="w-3.5 h-3.5" />} {m.away?.name}</span>
                    {derby && <Flame className="size-3.5 text-warn" aria-label="Clássico" />}
                    {tight && !m.played && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-warn/15 px-1 py-0.5 text-[10px] font-semibold text-warn" title={`Só ${gap} dia${gap > 1 ? "s" : ""} desde o jogo anterior`}>
                        <Zap className="size-3" /> {gap}d
                      </span>
                    )}
                  </div>
                  {isMine && <Pill tone="ok">Meu jogo</Pill>}
                </div>
              );
            })}
            {all.data?.length === 0 && <EmptyState icon={CalendarDays} title="Sem jogos agendados" />}
          </div>
        </Card>
      )}
    </div>
  );
}
