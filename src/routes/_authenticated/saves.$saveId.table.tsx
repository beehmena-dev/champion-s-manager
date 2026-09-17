import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ClubCrest } from "@/components/club-crest";
import { computeStandings } from "@/game/standings";
import { promotionSlots } from "@/game/promotion";
import { PageHeader, SubViewDropdown } from "@/components/fm";
import { ListOrdered } from "lucide-react";

type TableView = "current" | "history";

export const Route = createFileRoute("/_authenticated/saves/$saveId/table")({
  component: Standings,
});

function Standings() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/table" });
  const [view, setView] = useState<TableView>("current");

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const clubId = save.data?.my_club_id;

  const compQ = useQuery({
    queryKey: ["comp-of-club", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase.from("clubs").select("competition_id, competitions!clubs_competition_id_fkey(name, season, tier, country)").eq("id", clubId!).single()).data,
  });
  const compId = compQ.data?.competition_id;
  const season = (compQ.data as any)?.competitions?.season;
  const tier = (compQ.data as any)?.competitions?.tier as number | undefined;
  const country = (compQ.data as any)?.competitions?.country as string | null | undefined;

  // Divisões do mesmo país — pra saber se há acesso (divisão abaixo existe) e
  // rebaixamento (divisão acima existe) nesta liga.
  const pyramid = useQuery({
    queryKey: ["pyramid", saveId, country],
    enabled: !!country,
    queryFn: async () => {
      const { data } = await supabase
        .from("competitions").select("tier").eq("save_id", saveId).eq("country", country!);
      return (data ?? []).map((c) => c.tier as number);
    },
  });

  const standings = useQuery({
    queryKey: ["standings", saveId, compId, season],
    enabled: !!compId && season != null,
    queryFn: async () => {
      const [{ data: clubs }, { data: matches }] = await Promise.all([
        supabase.from("clubs").select("id, name, crest_url, primary_color, secondary_color").eq("competition_id", compId!),
        supabase.from("matches").select("home_club_id, away_club_id, home_score, away_score, played").eq("competition_id", compId!).eq("season", season),
      ]);
      return computeStandings(clubs ?? [], matches ?? []);
    },
  });

  const history = useQuery({
    queryKey: ["season-history", saveId, clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("season_history")
        .select("season, position, played, wins, draws, losses, gf, ga, points, competitions(name)")
        .eq("club_id", clubId!)
        .order("season", { ascending: false });
      return data ?? [];
    },
  });

  const rows = standings.data ?? [];
  const tiers = pyramid.data ?? [];
  // Sobe quem termina no topo se existe uma divisão ACIMA; cai quem termina
  // na base se existe uma divisão ABAIXO.
  const canPromote = tier != null && tiers.includes(tier - 1);
  const canRelegate = tier != null && tiers.includes(tier + 1);
  const slots = rows.length > 0 ? promotionSlots(rows.length) : 0;
  const promoteTop = canPromote ? slots : 0;
  const relegateBottom = canRelegate ? slots : 0;

  const hasHistory = (history.data?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
    <PageHeader
      icon={ListOrdered}
      title={(compQ.data as any)?.competitions?.name ?? "Classificação"}
      subtitle={season != null ? `Temporada ${season}` : undefined}
      actions={
        hasHistory ? (
          <SubViewDropdown
            options={[
              { value: "current", label: "Classificação atual" },
              { value: "history", label: "Histórico de temporadas" },
            ]}
            value={view}
            onValueChange={setView}
          />
        ) : undefined
      }
    />
    {view === "current" && (promoteTop > 0 || relegateBottom > 0) && (
      <div className="flex flex-wrap gap-3 px-1 text-xs text-muted-foreground">
        {promoteTop > 0 && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ok/70" />Acesso ({promoteTop})</span>}
        {relegateBottom > 0 && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-danger/70" />Rebaixamento ({relegateBottom})</span>}
      </div>
    )}
    {view === "current" && (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm [font-variant-numeric:tabular-nums]">
          <thead className="border-b bg-elevated/60 fm-eyebrow">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">#</th>
              <th className="px-3 py-2.5 text-left font-semibold">Time</th>
              <th className="px-2 py-2.5 font-semibold">P</th>
              <th className="px-2 py-2.5 font-semibold">J</th>
              <th className="px-2 py-2.5 font-semibold">V</th>
              <th className="px-2 py-2.5 font-semibold">E</th>
              <th className="px-2 py-2.5 font-semibold">D</th>
              <th className="px-2 py-2.5 font-semibold">GP</th>
              <th className="px-2 py-2.5 font-semibold">GC</th>
              <th className="px-2 py-2.5 font-semibold">SG</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const pos = i + 1;
              const zone = pos <= promoteTop ? "promo" : pos > rows.length - relegateBottom ? "rele" : null;
              return (
              <tr key={r.club_id} className={`border-b border-border/50 ${r.club_id === clubId ? "bg-primary/10 font-semibold" : "hover:bg-elevated/50"}`}>
                <td className={`px-3 py-1.5 text-muted-foreground border-l-2 ${zone === "promo" ? "border-ok" : zone === "rele" ? "border-danger" : "border-transparent"}`}>{pos}</td>
                <td className="px-3 py-1.5 text-left">
                  <Link to="/saves/$saveId/clubs/$clubId" params={{ saveId, clubId: r.club_id }} className="hover:text-primary hover:underline inline-flex items-center gap-1.5">
                    <ClubCrest club={{ id: r.club_id, ...r }} className="w-4 h-4" /> {r.name}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-center font-semibold">{r.points}</td>
                <td className="px-2 py-1.5 text-center text-muted-foreground">{r.played}</td>
                <td className="px-2 py-1.5 text-center">{r.wins}</td>
                <td className="px-2 py-1.5 text-center">{r.draws}</td>
                <td className="px-2 py-1.5 text-center">{r.losses}</td>
                <td className="px-2 py-1.5 text-center text-muted-foreground">{r.gf}</td>
                <td className="px-2 py-1.5 text-center text-muted-foreground">{r.ga}</td>
                <td className="px-2 py-1.5 text-center">{r.gd}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
    )}

    {view === "history" && hasHistory && (
      <Card className="p-4">
        <div className="fm-eyebrow mb-3">Temporadas anteriores</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm [font-variant-numeric:tabular-nums]">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-1">Temporada</th>
                <th className="text-left px-2 py-1">Competição</th>
                <th className="px-2 py-1">Posição</th>
                <th className="px-2 py-1">P</th>
                <th className="px-2 py-1">J</th>
                <th className="px-2 py-1">V</th>
                <th className="px-2 py-1">E</th>
                <th className="px-2 py-1">D</th>
                <th className="px-2 py-1">SG</th>
              </tr>
            </thead>
            <tbody>
              {(history.data ?? []).map((h: any) => (
                <tr key={`${h.season}-${h.competitions?.name}`} className="border-t">
                  <td className="px-2 py-1">{h.season}</td>
                  <td className="px-2 py-1">{h.competitions?.name ?? "—"}</td>
                  <td className="px-2 py-1 text-center font-semibold">{h.position}º</td>
                  <td className="px-2 py-1 text-center">{h.points}</td>
                  <td className="px-2 py-1 text-center">{h.played}</td>
                  <td className="px-2 py-1 text-center">{h.wins}</td>
                  <td className="px-2 py-1 text-center">{h.draws}</td>
                  <td className="px-2 py-1 text-center">{h.losses}</td>
                  <td className="px-2 py-1 text-center">{h.gf - h.ga}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    )}
    </div>
  );
}