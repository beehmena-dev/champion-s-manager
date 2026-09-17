import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { computeStandings } from "@/game/standings";
import { promotionSlots } from "@/game/promotion";
import { PageHeader, EmptyState } from "@/components/fm";
import { ClubCrest } from "@/components/club-crest";
import { Trophy, ListOrdered } from "lucide-react";

export const Route = createFileRoute("/_authenticated/saves/$saveId/competitions/$competitionId")({
  component: CompetitionPage,
});

// -----------------------------------------------------------------------------
// Página de liga/competição (infraestrutura pedida junto com a página de
// clube). Referência real: tela "Overview" de liga do FM21 Touch, conferida
// no vídeo Football Manager 2021 Touch_2026-09-12-07-55-11.mp4 (t≈605-618) —
// Title Holders + tabela + Reputation + Past Winners. "Competition Reputation"
// (gráfico histórico) e "Awards" (prêmios oficiais da liga) ficam de FORA —
// não temos histórico de reputação de competição nem prêmio oficial por liga,
// só o que já é rastreado de verdade: classificação ao vivo (computeStandings,
// já genérico) e campeões passados (season_history JÁ grava a posição final
// de TODO clube em TODA temporada, não só a do usuário — achado ao explorar
// o código, sem precisar de migration nova). Artilheiro atual é calculado ao
// vivo (players.goals_season existe pra QUALQUER jogador de QUALQUER clube,
// não só o do usuário).
// -----------------------------------------------------------------------------

function CompetitionPage() {
  const { saveId, competitionId } = useParams({ from: "/_authenticated/saves/$saveId/competitions/$competitionId" });

  const comp = useQuery({
    queryKey: ["competition-page", competitionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("competitions").select("*").eq("id", competitionId).single();
      if (error) throw error;
      return data;
    },
  });

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => {
      const { data, error } = await supabase.from("saves").select("my_club_id").eq("id", saveId).single();
      if (error) throw error;
      return data;
    },
  });
  const myClubId = save.data?.my_club_id;

  const clubs = useQuery({
    queryKey: ["competition-page-clubs", competitionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clubs").select("id, name, crest_url, primary_color, secondary_color").eq("competition_id", competitionId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const season = comp.data?.season;
  const matches = useQuery({
    queryKey: ["competition-page-matches", competitionId, season],
    enabled: season != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches").select("home_club_id, away_club_id, home_score, away_score, played")
        .eq("competition_id", competitionId!).eq("season", season!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const standings = clubs.data && matches.data ? computeStandings(clubs.data, matches.data) : [];

  // Zona de acesso/rebaixamento — mesma regra real de promotion.ts, só pra
  // colorir a tabela (não decide nada aqui, só informa visualmente).
  const pyramid = useQuery({
    queryKey: ["competition-page-pyramid", saveId, comp.data?.country],
    enabled: !!comp.data?.country,
    queryFn: async () => {
      const { data, error } = await supabase.from("competitions").select("tier").eq("save_id", saveId).eq("country", comp.data!.country!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const tiers = (pyramid.data ?? []).map((c) => c.tier as number);
  const canPromote = comp.data?.tier != null && tiers.includes(comp.data.tier - 1);
  const canRelegate = comp.data?.tier != null && tiers.includes(comp.data.tier + 1);
  const slots = standings.length > 0 ? promotionSlots(standings.length) : 0;
  const promoteTop = canPromote ? slots : 0;
  const relegateBottom = canRelegate ? slots : 0;

  // Campeões passados — season_history já guarda a posição final de TODO
  // clube em TODA temporada (não só do usuário), então isso é dado real.
  const pastChampions = useQuery({
    queryKey: ["competition-page-champions", competitionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("season_history").select("season, clubs(id, name, crest_url, primary_color, secondary_color)")
        .eq("competition_id", competitionId!).eq("position", 1)
        .order("season", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const titleHolder = pastChampions.data?.[0];

  // Artilheiro atual — goals_season existe pra qualquer jogador de qualquer
  // clube (não é dado exclusivo do elenco do usuário), então dá pra montar
  // um ranking de verdade ao vivo, sem precisar arquivar nada por temporada.
  const topScorers = useQuery({
    queryKey: ["competition-page-scorers", competitionId, clubs.data],
    enabled: !!clubs.data && clubs.data.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players").select("id, name, goals_season, club_id, clubs(id, name, crest_url, primary_color, secondary_color)")
        .in("club_id", (clubs.data ?? []).map((c) => c.id)).gt("goals_season", 0)
        .order("goals_season", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (comp.isLoading) return <div className="text-muted-foreground">Carregando…</div>;
  if (comp.isError) return <div className="text-muted-foreground">Não foi possível carregar esta competição agora.</div>;
  if (!comp.data) return <div>Competição não encontrada.</div>;

  return (
    <div className="space-y-4">
      <PageHeader icon={Trophy} title={comp.data.name} subtitle={season != null ? `Temporada ${season}` : undefined} />

      {(promoteTop > 0 || relegateBottom > 0) && (
        <div className="flex flex-wrap gap-3 px-1 text-xs text-muted-foreground">
          {promoteTop > 0 && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ok/70" />Acesso ({promoteTop})</span>}
          {relegateBottom > 0 && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-danger/70" />Rebaixamento ({relegateBottom})</span>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="fm-eyebrow flex items-center gap-1.5 border-b bg-elevated/60 px-3 py-2.5">
            <ListOrdered className="size-3.5" /> Classificação
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm [font-variant-numeric:tabular-nums]">
              <thead>
                <tr className="border-b bg-elevated/40 fm-eyebrow">
                  <th className="px-3 py-2 text-left font-semibold">#</th>
                  <th className="px-3 py-2 text-left font-semibold">Time</th>
                  <th className="px-2 py-2 font-semibold">P</th>
                  <th className="px-2 py-2 font-semibold">J</th>
                  <th className="px-2 py-2 font-semibold">V</th>
                  <th className="px-2 py-2 font-semibold">E</th>
                  <th className="px-2 py-2 font-semibold">D</th>
                  <th className="px-2 py-2 font-semibold">SG</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((r, i) => {
                  const pos = i + 1;
                  const zone = pos <= promoteTop ? "promo" : pos > standings.length - relegateBottom ? "rele" : null;
                  return (
                    <tr key={r.club_id} className={`border-b border-border/50 ${r.club_id === myClubId ? "bg-primary/10 font-semibold" : "hover:bg-elevated/50"}`}>
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
                      <td className="px-2 py-1.5 text-center">{r.gd}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {standings.length === 0 && <EmptyState icon={ListOrdered} title="Temporada ainda não começou" />}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="fm-eyebrow mb-2">Campeão atual</div>
            {titleHolder ? (
              <div className="flex items-center gap-2">
                <Trophy className="size-5 text-warn" />
                <div>
                  <div className="font-semibold flex items-center gap-1.5">
                    {(titleHolder as any).clubs && <ClubCrest club={(titleHolder as any).clubs} className="w-4 h-4" />}
                    {(titleHolder as any).clubs?.name ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">Temporada {(titleHolder as any).season}</div>
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Nenhuma temporada concluída ainda.</p>}
          </Card>

          <Card className="p-4">
            <div className="fm-eyebrow mb-3">Artilheiros da temporada</div>
            <div className="space-y-1.5">
              {(topScorers.data ?? []).map((p: any, i: number) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-muted-foreground">{i + 1}.</span> {p.name}
                    <span className="text-muted-foreground inline-flex items-center gap-1"> — {p.clubs && <ClubCrest club={p.clubs} className="w-3.5 h-3.5" />} {p.clubs?.name}</span>
                  </span>
                  <span className="font-semibold">{p.goals_season}</span>
                </div>
              ))}
              {(topScorers.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Ninguém marcou ainda nesta temporada.</p>}
            </div>
          </Card>

          <Card className="p-4">
            <div className="fm-eyebrow mb-3">Campeões anteriores</div>
            <div className="space-y-1">
              {(pastChampions.data ?? []).map((h: any) => (
                <div key={h.season} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{h.season}</span>
                  <span className="font-medium inline-flex items-center gap-1.5">{h.clubs && <ClubCrest club={h.clubs} className="w-4 h-4" />} {h.clubs?.name ?? "?"}</span>
                </div>
              ))}
              {(pastChampions.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Ainda sem histórico.</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
