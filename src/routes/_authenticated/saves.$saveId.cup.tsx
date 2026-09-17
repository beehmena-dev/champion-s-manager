import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";
import { createCupCompetition } from "@/lib/cup-progression";
import { PageHeader, Pill, EmptyState } from "@/components/fm";
import { ClubCrest } from "@/components/club-crest";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/saves/$saveId/cup")({
  component: CupPage,
});

function CupPage() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/cup" });
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  // Sempre buscar a linha inteira aqui: várias telas reaproveitam a mesma
  // queryKey ["save", saveId] com listas de colunas diferentes, e o
  // TanStack Query cacheia por key, não pelo shape — um select() mais
  // estreito (ex: só "my_club_id") pode sobrescrever o cache compartilhado
  // e derrubar campos (como game_date) que o layout precisa pro cabeçalho.
  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const myClubId = save.data?.my_club_id;

  // Temporada atual é a da LIGA do clube do usuário — a copa não avança
  // sozinha junto com a liga (ver src/lib/season-rollover.ts), então é
  // preciso comparar contra a temporada da liga pra saber se a copa desta
  // temporada específica já existe ou se precisa ser (re)criada.
  const leagueSeason = useQuery({
    queryKey: ["league-season-for-cup", myClubId],
    enabled: !!myClubId,
    queryFn: async () => (await supabase
      .from("clubs").select("competitions!clubs_competition_id_fkey(season)").eq("id", myClubId!).single()).data
      ?.competitions?.season as number | undefined,
  });

  const cupComp = useQuery({
    queryKey: ["cup-competition", saveId, leagueSeason.data],
    enabled: leagueSeason.data != null,
    queryFn: async () => (await supabase
      .from("competitions").select("*").eq("save_id", saveId).eq("type", "cup").eq("season", leagueSeason.data!)
      .maybeSingle()).data,
  });

  const ties = useQuery({
    queryKey: ["cup-ties", cupComp.data?.id],
    enabled: !!cupComp.data?.id,
    queryFn: async () => (await supabase
      .from("cup_ties").select("*").eq("competition_id", cupComp.data!.id).eq("season", cupComp.data!.season)
      .order("round_index", { ascending: true })).data ?? [],
  });

  const clubIds = Array.from(new Set((ties.data ?? []).flatMap((t) => [t.home_club_id, t.away_club_id]).filter((id): id is string => !!id)));
  const clubs = useQuery({
    queryKey: ["cup-clubs", clubIds.join(",")],
    enabled: clubIds.length > 0,
    queryFn: async () => (await supabase.from("clubs").select("id, name, short_name, crest_url, primary_color, secondary_color").in("id", clubIds)).data ?? [],
  });
  const clubObj = (id?: string | null) => clubs.data?.find((c) => c.id === id);
  const clubName = (id?: string | null) => clubObj(id)?.short_name ?? clubObj(id)?.name ?? "?";

  const matchIds = Array.from(new Set((ties.data ?? []).flatMap((t) => [t.leg1_match_id, t.leg2_match_id]).filter((id): id is string => !!id)));
  const matches = useQuery({
    queryKey: ["cup-matches", matchIds.join(",")],
    enabled: matchIds.length > 0,
    queryFn: async () => (await supabase.from("matches").select("id, home_club_id, away_club_id, home_score, away_score, played, match_date").in("id", matchIds)).data ?? [],
  });
  const matchById = (id?: string | null) => matches.data?.find((m) => m.id === id);

  async function handleCreate() {
    setCreating(true);
    const res = await createCupCompetition(saveId);
    setCreating(false);
    if (res.created) {
      toast.success("Copa criada! Primeira fase sorteada.");
      qc.invalidateQueries({ queryKey: ["cup-competition", saveId] });
    } else {
      toast.error(res.reason ?? "Não foi possível criar a copa.");
    }
  }

  if (save.isLoading || leagueSeason.isLoading || cupComp.isLoading) return <div className="text-muted-foreground">Carregando…</div>;

  if (!cupComp.data) {
    return (
      <div className="space-y-4">
        <PageHeader icon={Trophy} title="Copa" subtitle="Mata-mata da temporada." />
        <EmptyState
          icon={Trophy}
          title="Nenhuma copa criada ainda"
          description="Cria a copa mata-mata desta temporada com os clubes da sua liga — ida e volta até a semifinal, final em jogo único."
          action={
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Criando…" : "Criar copa desta temporada"}
            </Button>
          }
        />
      </div>
    );
  }

  const rounds = Array.from(new Set((ties.data ?? []).map((t) => t.round_index))).sort((a, b) => a - b);
  const champion = cupComp.data.champion_club_id;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Trophy}
        title={cupComp.data.name}
        subtitle={`Temporada ${cupComp.data.season}`}
        actions={champion ? <Pill tone="warn">🏆 Campeão: {clubObj(champion) && <ClubCrest club={clubObj(champion)!} className="w-3.5 h-3.5" />} {clubName(champion)}</Pill> : undefined}
      />

      {rounds.map((roundIndex) => {
        const roundTies = (ties.data ?? []).filter((t) => t.round_index === roundIndex);
        return (
          <Card key={roundIndex} className="p-4">
            <div className="fm-eyebrow mb-3">{roundTies[0]?.round_name ?? `Fase ${roundIndex + 1}`}</div>
            <div className="space-y-2">
              {roundTies.map((t) => {
                const isMine = t.home_club_id === myClubId || t.away_club_id === myClubId;
                const leg1 = matchById(t.leg1_match_id);
                const leg2 = matchById(t.leg2_match_id);
                const bye = !t.away_club_id;
                return (
                  <div key={t.id} className={`text-sm border-t border-border/50 pt-2 first:border-t-0 first:pt-0 ${isMine ? "-mx-2 rounded bg-primary/5 px-2" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium inline-flex items-center gap-1 flex-wrap">
                        {clubObj(t.home_club_id) && <ClubCrest club={clubObj(t.home_club_id)!} className="w-4 h-4" />} {clubName(t.home_club_id)}
                        {bye ? " — passou direto (bye)" : (
                          <>x {clubObj(t.away_club_id) && <ClubCrest club={clubObj(t.away_club_id)!} className="w-4 h-4" />} {clubName(t.away_club_id)}</>
                        )}
                      </div>
                      {t.resolved && t.winner_club_id && (
                        <Pill tone="ok">Classificado: {clubObj(t.winner_club_id) && <ClubCrest club={clubObj(t.winner_club_id)!} className="w-3.5 h-3.5" />} {clubName(t.winner_club_id)}</Pill>
                      )}
                    </div>
                    {!bye && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {leg1 && (
                          <span>Ida: {leg1.played ? `${leg1.home_score} x ${leg1.away_score}` : `agendado ${leg1.match_date}`}</span>
                        )}
                        {t.is_single_leg ? null : (
                          <span className="ml-2">
                            Volta: {leg2 ? (leg2.played ? `${leg2.home_score} x ${leg2.away_score}` : `agendado ${leg2.match_date}`) : "—"}
                          </span>
                        )}
                        {t.penalty_home != null && (
                          <span className="ml-2">Pênaltis: {t.penalty_home} x {t.penalty_away}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}