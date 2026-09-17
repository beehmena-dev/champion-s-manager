import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { formatMoney, formatDate } from "@/lib/game-hooks";
import { computeStandings } from "@/game/standings";
import { isRivalry } from "@/game/rivalries";
import { ClubCrest } from "@/components/club-crest";
import { effectiveKnowledge, tierFor, fuzzRange } from "@/game/scouting";
import { positionLabel } from "@/game/types";
import { PageHeader, Pill, RatingBadge, EmptyState, ratingTone } from "@/components/fm";
import { NationalityFlag } from "@/components/nationality-flag";
import { Shield, Users, Trophy, Landmark, Wallet, Flame } from "lucide-react";

export const Route = createFileRoute("/_authenticated/saves/$saveId/clubs/$clubId")({
  component: ClubPage,
});

// -----------------------------------------------------------------------------
// Página de clube (infraestrutura pedida pra ligar inbox/mercado/análise a
// uma tela de verdade, não só texto) — funciona tanto pro clube do usuário
// quanto pra qualquer rival, exatamente como no FM: clube alheio nunca mostra
// finanças (só a diretoria do próprio clube vê isso) e o elenco de rival
// passa pelo MESMO fog of war já usado em analysis.tsx (fuzzedOverall), nunca
// o overall exato. Referência real: "Club Info" do FM21 Touch, conferido no
// vídeo Football Manager 2021 Touch_2026-09-11-13-53-26.mp4 (t≈530-540) —
// General Information + Facilities. Campos que a FM real mostra mas que a
// gente não rastreia de verdade (ano de fundação, apelido, lendas/ícones,
// "personalidade do elenco", preço de ingresso) ficam de FORA de propósito —
// nunca inventar dado só pra parecer completo.
// -----------------------------------------------------------------------------

function ClubPage() {
  const { saveId, clubId } = useParams({ from: "/_authenticated/saves/$saveId/clubs/$clubId" });

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => {
      const { data, error } = await supabase.from("saves").select("*").eq("id", saveId).single();
      if (error) throw error;
      return data;
    },
  });
  const myClubId = save.data?.my_club_id;
  const isMine = clubId === myClubId;

  const club = useQuery({
    queryKey: ["club-page", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("*, competitions!clubs_competition_id_fkey(id, name, season)")
        .eq("id", clubId).single();
      if (error) throw error;
      return data;
    },
  });
  const compId = (club.data as any)?.competitions?.id;
  const compName = (club.data as any)?.competitions?.name;
  const season = (club.data as any)?.competitions?.season;

  // Outros clubes da MESMA liga — usados pra achar rival (isRivalry cruza
  // nome contra nome) e pra montar a tabela de classificação.
  const leagueClubs = useQuery({
    queryKey: ["club-page-league-clubs", compId],
    enabled: !!compId,
    queryFn: async () => {
      const { data, error } = await supabase.from("clubs").select("id, name, crest_url, primary_color, secondary_color").eq("competition_id", compId!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const rival = (leagueClubs.data ?? []).find((c) => c.id !== clubId && club.data?.name && isRivalry(club.data.name, c.name));

  const standings = useQuery({
    queryKey: ["club-page-standings", compId, season, leagueClubs.data],
    enabled: !!compId && season != null && !!leagueClubs.data,
    queryFn: async () => {
      const { data: matches, error } = await supabase
        .from("matches").select("home_club_id, away_club_id, home_score, away_score, played")
        .eq("competition_id", compId!).eq("season", season);
      if (error) throw error;
      return computeStandings(leagueClubs.data ?? [], matches ?? []);
    },
  });
  const myPosition = standings.data?.findIndex((r) => r.club_id === clubId);

  const captain = useQuery({
    queryKey: ["club-page-captain", (club.data as any)?.captain_id],
    enabled: !!(club.data as any)?.captain_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("players").select("id, name").eq("id", (club.data as any).captain_id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const squad = useQuery({
    queryKey: ["club-page-squad", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players").select("id, name, position, natural_position, overall, scout_knowledge, age, nationality")
        .eq("club_id", clubId!).order("overall", { ascending: false }).limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Últimos resultados + próximo jogo numa consulta só (antes eram 2 — cada
  // navegação nesta tela já dispara umas 9 consultas em paralelo, e o banco
  // de dev (PGlite/WASM, single-threaded) engasga com muita concorrência ao
  // mesmo tempo; reduzir o total ajuda mesmo sem resolver a causa raiz do
  // banco, ver feedback_backend_flakiness_mitigation.md).
  const matchesForClub = useQuery({
    queryKey: ["club-page-matches", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("id, match_date, home_club_id, away_club_id, home_score, away_score, played, home:clubs!matches_home_club_id_fkey(id, name, crest_url, primary_color, secondary_color), away:clubs!matches_away_club_id_fkey(id, name, crest_url, primary_color, secondary_color)")
        .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
        .order("match_date", { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const recentMatches = { data: matchesForClub.data?.filter((m) => m.played).slice(0, 5) };
  const nextMatch = {
    data: [...(matchesForClub.data ?? [])].filter((m) => !m.played).sort((a, b) => a.match_date.localeCompare(b.match_date))[0],
  };

  const history = useQuery({
    queryKey: ["club-page-history", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("season_history").select("season, position, played, wins, draws, losses, points, competitions(name)")
        .eq("club_id", clubId!).order("season", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const titles = (history.data ?? []).filter((h: any) => h.position === 1).length;

  const c = club.data as any;
  if (club.isLoading) return <div className="text-muted-foreground">Carregando…</div>;
  if (club.isError) return <div className="text-muted-foreground">Não foi possível carregar este clube agora.</div>;
  if (!c) return <div>Clube não encontrado.</div>;

  const reputationStars = Math.max(1, Math.min(5, Math.round((c.reputation ?? 50) / 20)));

  function fuzzedOverall(p: { overall: number; scout_knowledge?: number | null; id: string }) {
    if (isMine) return { display: String(p.overall), tone: ratingTone(p.overall) };
    const knowledge = effectiveKnowledge(p.scout_knowledge ?? 0, c.reputation ?? 50, p.overall);
    const tier = tierFor(knowledge);
    const [lo, hi] = fuzzRange(p.overall, tier.overallSpread, `${p.id}-overall`);
    return { display: lo === hi ? String(lo) : `${lo}-${hi}`, tone: ratingTone(Math.round((lo + hi) / 2)) };
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <ClubCrest club={c} className="size-14 shrink-0 rounded-2xl border-2 border-white/15 shadow-sm" />
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">{c.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {compId && (
                  <Link to="/saves/$saveId/competitions/$competitionId" params={{ saveId, competitionId: compId }} className="hover:text-primary hover:underline">
                    {compName}
                  </Link>
                )}
                {myPosition != null && myPosition >= 0 && <><span>·</span><span>{myPosition + 1}º colocado</span></>}
                {isMine && <><span>·</span><Pill tone="ok">Seu clube</Pill></>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-warn font-display text-lg">
              {"★".repeat(reputationStars)}<span className="text-muted-foreground/40">{"★".repeat(5 - reputationStars)}</span>
            </div>
            <div className="fm-eyebrow">Reputação</div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoTile icon={Landmark} label="Centro de treinamento" value={`${c.training_facilities ?? 3}/5`} />
        <InfoTile icon={Landmark} label="Categoria de base" value={`${c.youth_facilities ?? 3}/5`} />
        <InfoTile
          icon={Shield}
          label="Estádio"
          value={(c.stadium_capacity ?? 0).toLocaleString("pt-BR")}
          hint={c.stadium_name ? `${c.stadium_name}${c.founded_year ? ` · fundado em ${c.founded_year}` : ""}` : "lugares"}
        />
        <InfoTile icon={Flame} label="Rival" value={rival ? <span className="inline-flex items-center gap-1.5"><ClubCrest club={rival} className="w-4 h-4" /> {rival.name}</span> : "—"} />
      </div>

      {isMine && (
        <Card className="p-4">
          <div className="fm-eyebrow mb-3 flex items-center gap-1.5"><Wallet className="size-3.5" /> Financeiro</div>
          <div className="flex flex-wrap gap-6 text-sm">
            <span>Caixa: <span className="font-semibold">{formatMoney(c.budget)}</span></span>
            <span>Verba de transferências: <span className="font-semibold">{formatMoney(c.transfer_budget)}</span></span>
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="fm-eyebrow mb-3">Próximo jogo</div>
          {nextMatch.data ? (
            <div className="text-sm">
              <div className="font-medium inline-flex items-center gap-1.5 flex-wrap">
                <ClubCrest club={(nextMatch.data as any).home} className="w-4 h-4" /> {(nextMatch.data as any).home?.name} <span className="text-muted-foreground">vs</span> <ClubCrest club={(nextMatch.data as any).away} className="w-4 h-4" /> {(nextMatch.data as any).away?.name}
              </div>
              <div className="text-muted-foreground">{formatDate((nextMatch.data as any).match_date)}</div>
            </div>
          ) : <p className="text-sm text-muted-foreground">Sem jogo agendado.</p>}
          <div className="fm-eyebrow mb-2 mt-4">Capitão</div>
          <p className="text-sm">{captain.data?.name ?? "—"}</p>
        </Card>

        <Card className="p-4">
          <div className="fm-eyebrow mb-3">Últimos resultados</div>
          {recentMatches.data && recentMatches.data.length > 0 ? (
            <div className="space-y-1.5 text-sm">
              {(recentMatches.data as any[]).map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground inline-flex items-center gap-1">
                    <ClubCrest club={m.home} className="w-3.5 h-3.5" /> {m.home?.name} × <ClubCrest club={m.away} className="w-3.5 h-3.5" /> {m.away?.name}
                  </span>
                  <span className="font-mono font-semibold">{m.home_score}–{m.away_score}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">Nenhum jogo disputado ainda.</p>}
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="fm-eyebrow flex items-center gap-1.5"><Users className="size-3.5" /> Elenco</span>
          {isMine && (
            <Link to="/saves/$saveId/squad" params={{ saveId }} className="text-xs font-semibold text-primary hover:underline">
              Ver elenco completo →
            </Link>
          )}
        </div>
        <div className="divide-y divide-border/50">
          {(squad.data ?? []).map((p: any) => {
            const ovr = fuzzedOverall(p);
            return (
              <div key={p.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <Link to="/saves/$saveId/players/$playerId" params={{ saveId, playerId: p.id }} className="min-w-0 flex-1 truncate hover:text-primary hover:underline">
                  <NationalityFlag nationality={p.nationality} /> {p.name}
                </Link>
                <span className="w-12 shrink-0 text-center text-xs text-muted-foreground">{positionLabel(p.natural_position ?? p.position)}</span>
                <RatingBadge value={ovr.display} tone={ovr.tone} className="w-14" />
              </div>
            );
          })}
          {(squad.data ?? []).length === 0 && <EmptyState icon={Users} title="Elenco vazio" />}
        </div>
      </Card>

      <Card className="p-4">
        <div className="fm-eyebrow mb-3 flex items-center gap-1.5"><Trophy className="size-3.5" /> Histórico ({titles} título{titles === 1 ? "" : "s"})</div>
        <div className="space-y-1.5">
          {(history.data ?? []).map((h: any) => (
            <div key={`${h.season}`} className="flex items-center justify-between border-t border-border/50 pt-1.5 text-sm first:border-t-0 first:pt-0">
              <span className="text-muted-foreground">Temporada {h.season} — {h.competitions?.name ?? compName}</span>
              <span className="font-semibold">{h.position}º{h.position === 1 ? " 🏆" : ""}</span>
            </div>
          ))}
          {(history.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma temporada concluída ainda.</p>}
        </div>
      </Card>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value, hint }: { icon: any; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="font-display text-lg font-bold">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
