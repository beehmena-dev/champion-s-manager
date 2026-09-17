import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { rateTacticalTeam, ratingToDisplay } from "@/game/tactics";
import { computeStandings } from "@/game/standings";
import { analyzeOpponent } from "@/game/opponent-analysis";
import { clubColors, contrastText } from "@/game/club-colors";
import { playerScoutingNotes, type PlayerAttributes } from "@/game/attributes";
import { effectiveKnowledge, tierFor, fuzzRange } from "@/game/scouting";
import { PageHeader, SubTabs, Pill, StatBar, RatingBadge, ProsConsList, EmptyState, ratingTone } from "@/components/fm";
import { NationalityFlag } from "@/components/nationality-flag";
import { ClubCrest } from "@/components/club-crest";
import { BarChart3, Target, Zap, AlertTriangle, Compass, CalendarDays } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/saves/$saveId/analysis")({
  component: AnalysisPage,
});

function AnalysisPage() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/analysis" });
  const [tab, setTab] = useState<"opp" | "league">("opp");

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const clubId = save.data?.my_club_id;

  const club = useQuery({
    queryKey: ["club", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase
      .from("clubs").select("*, competitions!clubs_competition_id_fkey(name, season)")
      .eq("id", clubId!).single()).data,
  });
  const compId = club.data?.competition_id;
  const season = (club.data as any)?.competitions?.season;

  const nextMatch = useQuery({
    queryKey: ["next-match-analysis", saveId, clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase
      .from("matches").select("*")
      .eq("save_id", saveId).or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .eq("played", false).order("match_date", { ascending: true }).limit(1).maybeSingle()).data,
  });
  const oppId = nextMatch.data
    ? (nextMatch.data.home_club_id === clubId ? nextMatch.data.away_club_id : nextMatch.data.home_club_id)
    : null;

  const opp = useQuery({
    queryKey: ["opp-dossier", oppId],
    enabled: !!oppId,
    queryFn: async () => {
      const [{ data: c }, { data: roster }] = await Promise.all([
        supabase.from("clubs").select("*").eq("id", oppId!).single(),
        supabase.from("players").select("id, name, position, natural_position, overall, squad_number, attributes, scout_knowledge, nationality").eq("club_id", oppId!),
      ]);
      // as any[]: nationality ainda não está em types.ts (convenção do
      // projeto até regenerar esse arquivo — ver CLAUDE.md).
      return { club: c, roster: (roster ?? []) as any[] };
    },
  });

  const myFull = useQuery({
    queryKey: ["players", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase.from("players").select("*").eq("club_id", clubId!)).data ?? [],
  });
  const myLineup = useQuery({
    queryKey: ["lineup", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase.from("tactic_lineups").select("*").eq("club_id", clubId!)).data ?? [],
  });

  const standings = useQuery({
    queryKey: ["standings", saveId, compId, season],
    enabled: !!compId && season != null,
    queryFn: async () => {
      const [{ data: clubs }, { data: matches }] = await Promise.all([
        supabase.from("clubs").select("id, name, crest_url, primary_color, secondary_color").eq("competition_id", compId!),
        supabase.from("matches")
          .select("home_club_id, away_club_id, home_score, away_score, played")
          .eq("competition_id", compId!).eq("season", season),
      ]);
      return computeStandings(clubs ?? [], matches ?? []);
    },
  });

  const dossier = opp.data?.club && opp.data.roster.length > 0
    ? analyzeOpponent(opp.data.club as any, opp.data.roster as any)
    : null;
  const dangerManNotes = dossier?.dangerMan
    ? playerScoutingNotes(
        (dossier.dangerMan.position as "GK" | "DEF" | "MID" | "FWD") ?? "MID",
        (dossier.dangerMan.attributes ?? {}) as PlayerAttributes,
      )
    : { strengths: [], weaknesses: [] };

  const todayISO = save.data?.game_date as string | undefined;
  const myRating = club.data && myFull.data && myFull.data.length > 0
    ? rateTacticalTeam(myFull.data as any, club.data as any, myLineup.data as any, todayISO)
    : null;
  const oppRating = opp.data?.club && opp.data.roster.length > 0
    ? rateTacticalTeam(opp.data.roster as any, opp.data.club as any, undefined, todayISO)
    : null;

  const kit = opp.data?.club ? clubColors(opp.data.club as any) : { primary: "#334155", secondary: "#334155" };
  const kitText = contrastText(kit.primary);

  // Overall de jogador do adversário respeita o mesmo fog of war da ficha
  // do jogador/mercado (src/game/scouting.ts) — sem isso, dava pra "trapacear"
  // e ver o número exato aqui mesmo pra um jogador ainda não escoutado.
  const oppReputation = (opp.data?.club as any)?.reputation ?? 50;
  function fuzzedOverall(p: { overall: number; scout_knowledge?: number | null; id: string }) {
    const knowledge = effectiveKnowledge(p.scout_knowledge ?? 0, oppReputation, p.overall);
    const tier = tierFor(knowledge);
    const [lo, hi] = fuzzRange(p.overall, tier.overallSpread, `${p.id}-overall`);
    return { display: lo === hi ? String(lo) : `${lo}-${hi}`, tone: ratingTone(Math.round((lo + hi) / 2)) };
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={BarChart3}
        title="Análise"
        subtitle="Dossiê do próximo adversário e panorama de ataque × defesa da liga."
      />

      <SubTabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "opp", label: "Próximo adversário" },
          { value: "league", label: "Ataque × Defesa (liga)" },
        ]}
      />

      {tab === "opp" && (
        !dossier || !opp.data?.club ? (
          <EmptyState icon={CalendarDays} title="Sem próximo jogo agendado" description="O dossiê aparece quando houver um adversário na agenda." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Compass className="size-4 text-info" />
                  <span className="fm-eyebrow">
                    DNA tático —{" "}
                    <Link to="/saves/$saveId/clubs/$clubId" params={{ saveId, clubId: oppId! }} className="hover:text-primary hover:underline inline-flex items-center gap-1.5">
                      <ClubCrest club={opp.data.club as any} className="w-4 h-4" /> {opp.data.club.name}
                    </Link>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Pill tone="info">{dossier.dna.formacao}</Pill>
                  <Pill tone="neutral">{dossier.dna.mentalidade}</Pill>
                  <Pill tone="neutral">{dossier.dna.construcao}</Pill>
                  <Pill tone="neutral">{dossier.dna.linha}</Pill>
                  <Pill tone="neutral">{dossier.dna.pressao}</Pill>
                  <Pill tone="neutral">{dossier.dna.ritmo}</Pill>
                </div>

                {myRating && oppRating && (
                  <div className="mt-4 space-y-1.5 border-t pt-3">
                    <div className="fm-eyebrow flex items-center gap-1.5">Você × <ClubCrest club={opp.data.club as any} className="w-3.5 h-3.5" /> {opp.data.club.name} (tática atual)</div>
                    <StatBar label="Ataque" home={ratingToDisplay(myRating.attack)} away={ratingToDisplay(oppRating.attack)} />
                    <StatBar label="Meio" home={ratingToDisplay(myRating.midfield)} away={ratingToDisplay(oppRating.midfield)} />
                    <StatBar label="Defesa" home={ratingToDisplay(myRating.defense)} away={ratingToDisplay(oppRating.defense)} />
                  </div>
                )}
              </Card>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="border-ok/25 bg-ok/5 p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-ok">
                    <Zap className="size-3.5" />
                    <span className="fm-eyebrow text-ok">Pontos fortes a conter</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-foreground">
                    {dossier.strengths.map((s, i) => (
                      <li key={i} className="flex gap-1.5"><span className="text-ok">•</span>{s}</li>
                    ))}
                  </ul>
                </Card>
                <Card className="border-warn/25 bg-warn/5 p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-warn">
                    <AlertTriangle className="size-3.5" />
                    <span className="fm-eyebrow text-warn">Zonas para explorar</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-foreground">
                    {dossier.weaknesses.map((w, i) => (
                      <li key={i} className="flex gap-1.5"><span className="text-warn">•</span>{w}</li>
                    ))}
                  </ul>
                </Card>
              </div>

              <Card className="p-4">
                <div className="fm-eyebrow mb-1">Recomendação da análise</div>
                <p className="text-sm text-foreground">{dossier.recommendation}</p>
              </Card>
            </div>

            <div className="space-y-4">
              {dossier.dangerMan && (
                <Card className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Target className="size-4 text-danger" />
                    <span className="fm-eyebrow">Homem perigoso</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="grid size-12 shrink-0 place-items-center rounded-xl border-2 border-white/15 font-display text-base font-bold"
                      style={{ backgroundColor: kit.primary, color: kitText }}
                    >
                      {dossier.dangerMan.squad_number ?? dossier.dangerMan.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </div>
                    <div>
                      <Link
                        to="/saves/$saveId/players/$playerId"
                        params={{ saveId, playerId: dossier.dangerMan.id }}
                        className="font-display font-semibold hover:text-primary hover:underline"
                      >
                        <NationalityFlag nationality={dossier.dangerMan.nationality} /> {dossier.dangerMan.name}
                      </Link>
                      <div className="flex items-center gap-1.5 text-xs text-danger">
                        <span>{dossier.dangerMan.natural_position ?? dossier.dangerMan.position} · Overall</span>
                        <RatingBadge value={fuzzedOverall(dossier.dangerMan).display} tone={fuzzedOverall(dossier.dangerMan).tone} />
                      </div>
                    </div>
                  </div>
                  <ProsConsList
                    className="mt-3"
                    twoColumns={false}
                    strengths={dangerManNotes.strengths}
                    weaknesses={dangerManNotes.weaknesses}
                  />
                  <p className="mt-2 text-[11px] italic text-muted-foreground">{dossier.dangerMan.watch}</p>
                </Card>
              )}

              <Card className="p-4">
                <div className="fm-eyebrow mb-2">Titulares mais fortes</div>
                <div className="space-y-1.5">
                  {dossier.topPlayers.map((p) => {
                    const fuzzed = fuzzedOverall(p);
                    return (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <Link to="/saves/$saveId/players/$playerId" params={{ saveId, playerId: p.id }} className="truncate hover:text-primary hover:underline">
                          {p.squad_number != null && <span className="mr-1 font-mono text-muted-foreground">{p.squad_number}</span>}
                          <NationalityFlag nationality={p.nationality} /> {p.name}
                        </Link>
                        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                          {p.natural_position ?? p.position}
                          <RatingBadge value={fuzzed.display} tone={fuzzed.tone} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>
        )
      )}

      {tab === "league" && (
        <LeagueEfficiency standings={standings.data ?? []} clubId={clubId ?? ""} oppId={oppId} />
      )}
    </div>
  );
}

function LeagueEfficiency({
  standings, clubId, oppId,
}: { standings: any[]; clubId: string; oppId: string | null }) {
  if (standings.length === 0) {
    return <EmptyState icon={BarChart3} title="Liga sem jogos disputados ainda" description="A eficiência de cada time aparece após as primeiras rodadas." />;
  }
  const totalGoals = standings.reduce((s, r) => s + r.gf, 0);
  const totalGames = Math.max(1, standings.reduce((s, r) => s + r.played, 0));
  const leagueAvg = (totalGoals / totalGames).toFixed(2);

  const rows = [...standings].sort((a, b) => (b.gf / Math.max(b.played, 1)) - (a.gf / Math.max(a.played, 1)));

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="fm-eyebrow">Gols marcados × sofridos por jogo</span>
        <span className="text-xs text-muted-foreground">Média da liga: <strong className="text-foreground">{leagueAvg}</strong> gols/jogo</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const gp = r.played ? (r.gf / r.played).toFixed(2) : "0.00";
          const gc = r.played ? (r.ga / r.played).toFixed(2) : "0.00";
          const mine = r.club_id === clubId;
          const isOpp = oppId && r.club_id === oppId;
          return (
            <div
              key={r.club_id}
              className={`rounded-lg border p-2.5 text-xs ${
                mine ? "border-primary bg-primary/10" : isOpp ? "border-info/50 bg-info/5" : "bg-elevated/30"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={`truncate font-semibold inline-flex items-center gap-1.5 ${mine ? "text-primary" : isOpp ? "text-info" : ""}`}>
                  <ClubCrest club={{ id: r.club_id, ...r }} className="w-3.5 h-3.5 shrink-0" /> {r.name}
                </span>
                {mine && <Pill tone="ok">Você</Pill>}
                {isOpp && <Pill tone="info">Próximo</Pill>}
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Gols pró/jogo</span><span className="font-mono font-semibold text-ok">{gp}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Sofridos/jogo</span><span className="font-mono font-semibold text-danger">{gc}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Saldo</span><span className="font-mono font-semibold">{r.gd > 0 ? `+${r.gd}` : r.gd}</span></div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
