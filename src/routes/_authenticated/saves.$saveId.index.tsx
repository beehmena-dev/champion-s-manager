import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/game-hooks";
import { isRivalry } from "@/game/rivalries";
import { rateTacticalTeam, ratingToDisplay } from "@/game/tactics";
import { computeStandings } from "@/game/standings";
import { objectiveLabel, type SeasonObjective } from "@/game/board";
import { analyzeCongestion } from "@/game/congestion";
import { contractsAtRisk, CONTRACT_RISK_LABEL, type ContractRisk } from "@/game/contracts";
import { positionLabel } from "@/game/types";
import { effectiveKnowledge, tierFor, fuzzRange } from "@/game/scouting";
import { HeroBanner, MetricCard, StatBar, EmptyState, Pill, RatingBadge } from "@/components/fm";
import { NationalityFlag } from "@/components/nationality-flag";
import { ClubCrest } from "@/components/club-crest";
import {
  LayoutDashboard, Trophy, Landmark, Users, Wallet, CalendarDays, Flame, ArrowRight, AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/saves/$saveId/")({
  component: Overview,
});

const MENTALITY_LABEL: Record<string, string> = {
  defensive: "Defensiva", balanced: "Equilibrada", attacking: "Ofensiva",
};

function Overview() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/" });

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const clubId = save.data?.my_club_id;

  const club = useQuery({
    queryKey: ["club", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase
      .from("clubs")
      .select("*, competitions!clubs_competition_id_fkey(name, season)")
      .eq("id", clubId!).single()).data,
  });
  const compId = club.data?.competition_id;
  const season = (club.data as any)?.competitions?.season;

  const standings = useQuery({
    queryKey: ["standings", saveId, compId, season],
    enabled: !!compId && season != null,
    queryFn: async () => {
      const [{ data: clubs }, { data: matches }] = await Promise.all([
        supabase.from("clubs").select("id, name").eq("competition_id", compId!),
        supabase.from("matches")
          .select("home_club_id, away_club_id, home_score, away_score, played")
          .eq("competition_id", compId!).eq("season", season),
      ]);
      return computeStandings(clubs ?? [], matches ?? []);
    },
  });

  const objective = useQuery({
    queryKey: ["season-objective", clubId, compId, season],
    enabled: !!clubId && !!compId && season != null,
    queryFn: async () => (await supabase
      .from("season_objectives").select("kind, target")
      .eq("club_id", clubId!).eq("competition_id", compId!).eq("season", season).maybeSingle()).data,
  });

  const upcoming = useQuery({
    queryKey: ["upcoming", saveId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("matches").select("*").eq("save_id", saveId)
        .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
        .eq("played", false).order("match_date", { ascending: true }).limit(8);
      const ids = new Set<string>();
      const compIds = new Set<string>();
      for (const m of data ?? []) { ids.add(m.home_club_id); ids.add(m.away_club_id); if (m.competition_id) compIds.add(m.competition_id); }
      const [{ data: clubs }, { data: comps }] = await Promise.all([
        supabase.from("clubs").select("id, name, short_name, crest_url, primary_color, secondary_color").in("id", Array.from(ids)),
        compIds.size ? supabase.from("competitions").select("id, type").in("id", Array.from(compIds)) : Promise.resolve({ data: [] as any[] }),
      ]);
      const map = new Map((clubs ?? []).map((c) => [c.id, c]));
      const compType = new Map((comps ?? []).map((c) => [c.id, c.type]));
      return (data ?? []).map((m) => ({
        ...m, home: map.get(m.home_club_id), away: map.get(m.away_club_id),
        competitionType: m.competition_id ? compType.get(m.competition_id) ?? null : null,
      }));
    },
  });

  // Condição dos titulares — pra mostrar quantos entram desgastados numa
  // sequência apertada (ver src/game/congestion.ts).
  const lineupCondition = useQuery({
    queryKey: ["lineup-condition", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tactic_lineups").select("players(condition)").eq("club_id", clubId!);
      return (data ?? []).map((r: any) => r.players?.condition ?? 100) as number[];
    },
  });

  // Elenco do dia de jogo — checagem rápida do XI salvo (nota/condição/moral)
  // no estilo "Matchday Squad" do FM, só quando o jogo é HOJE (não em
  // qualquer dia com partida futura marcada — isso é o painel de pré-jogo,
  // não um widget permanente).
  const matchdaySquad = useQuery({
    queryKey: ["matchday-squad", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tactic_lineups")
        .select("slot, players(id, name, position, natural_position, overall, condition, morale)")
        .eq("club_id", clubId!);
      return (data ?? [])
        .map((r: any) => (r.players ? { slot: r.slot as string, ...r.players } : null))
        .filter((p: any): p is NonNullable<typeof p> => !!p);
    },
  });

  const recent = useQuery({
    queryKey: ["recent", saveId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("matches").select("*").eq("save_id", saveId)
        .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
        .eq("played", true).order("match_date", { ascending: false }).limit(6);
      const ids = new Set<string>();
      for (const m of data ?? []) { ids.add(m.home_club_id); ids.add(m.away_club_id); }
      const { data: clubs } = await supabase.from("clubs").select("id, name, short_name, crest_url, primary_color, secondary_color").in("id", Array.from(ids));
      const map = new Map((clubs ?? []).map((c) => [c.id, c]));
      return (data ?? []).map((m) => ({ ...m, home: map.get(m.home_club_id), away: map.get(m.away_club_id) }));
    },
  });

  const squad = useQuery({
    queryKey: ["squad-summary", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data } = await supabase.from("players").select("overall, wage").eq("club_id", clubId!);
      const n = data?.length ?? 0;
      const overall = n ? Math.round(data!.reduce((a, b) => a + b.overall, 0) / n) : 0;
      const wageTotal = (data ?? []).reduce((a, b) => a + b.wage, 0);
      return { n, overall, wageTotal };
    },
  });

  const nextMatch = upcoming.data?.[0];
  const opponentId = nextMatch ? (nextMatch.home_club_id === clubId ? nextMatch.away_club_id : nextMatch.home_club_id) : null;

  const congestion = analyzeCongestion(
    (upcoming.data ?? []).map((m: any) => ({
      id: m.id, date: m.match_date, competitionType: m.competitionType,
      label: `${m.home?.short_name ?? "?"} × ${m.away?.short_name ?? "?"}`,
    })),
    (save.data?.game_date as string) ?? "2025-01-01",
  );
  const tiredStarters = (lineupCondition.data ?? []).filter((c) => c < 70).length;

  const opponentReport = useQuery({
    queryKey: ["opponent-report", opponentId],
    enabled: !!opponentId,
    queryFn: async () => {
      const [{ data: oClub }, { data: roster }] = await Promise.all([
        supabase.from("clubs").select("*").eq("id", opponentId!).single(),
        supabase.from("players").select("*").eq("club_id", opponentId!),
      ]);
      const sorted = [...(roster ?? [])].sort((a, b) => b.overall - a.overall);
      const avgOverall = sorted.length ? Math.round(sorted.reduce((a, b) => a + b.overall, 0) / sorted.length) : 0;
      const rating = oClub && roster && roster.length > 0
        ? rateTacticalTeam(roster as any, oClub as any, undefined, save.data?.game_date as string | undefined)
        : null;
      return { club: oClub, topPlayers: sorted.slice(0, 5), avgOverall, rating };
    },
  });

  // Overall individual de jogador do adversário respeita o mesmo fog of war
  // da ficha do jogador/mercado (src/game/scouting.ts) — sem isso dava pra
  // ver o número exato aqui mesmo pra alguém ainda não escoutado. avgOverall
  // (força média do elenco) não entra nessa regra — é leitura tática de
  // equipe, não o "segredo" de um jogador específico.
  function fuzzedOverall(p: { overall: number; scout_knowledge?: number | null; id: string }) {
    const knowledge = effectiveKnowledge(p.scout_knowledge ?? 0, opponentReport.data?.club?.reputation ?? 50, p.overall);
    const tier = tierFor(knowledge);
    const [lo, hi] = fuzzRange(p.overall, tier.overallSpread, `${p.id}-overall`);
    return lo === hi ? String(lo) : `${lo}-${hi}`;
  }

  const myPlayersFull = useQuery({
    queryKey: ["players", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase.from("players").select("*").eq("club_id", clubId!)).data ?? [],
  });
  const myLineup = useQuery({
    queryKey: ["lineup", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase.from("tactic_lineups").select("*").eq("club_id", clubId!)).data ?? [],
  });
  const myRating = club.data && myPlayersFull.data && myPlayersFull.data.length > 0
    ? rateTacticalTeam(myPlayersFull.data as any, club.data as any, myLineup.data as any, save.data?.game_date as string | undefined)
    : null;

  // Alerta proativo de contrato a vencer (item 03 do backlog FootSim) — o
  // ponto do card é não deixar passar batido "por esquecimento"; só a coluna
  // na tela de Elenco não resolve isso porque o usuário precisa ir procurar.
  const todayForContracts = save.data?.game_date as string | undefined;
  const atRiskContracts = todayForContracts && myPlayersFull.data
    ? contractsAtRisk(myPlayersFull.data as any, todayForContracts)
    : [];
  const criticalContracts = atRiskContracts.filter((p) => p.risk === "critico").length;

  // --- derivados de tabela / meta -------------------------------------------
  const leagueSize = standings.data?.length ?? 0;
  const myIdx = standings.data?.findIndex((r) => r.club_id === clubId) ?? -1;
  const myPos = myIdx >= 0 ? myIdx + 1 : null;
  const myRow = myIdx >= 0 ? standings.data![myIdx] : null;

  const posTone = myPos == null ? "neutral"
    : myPos === 1 ? "warn"
    : myPos <= 4 ? "ok"
    : leagueSize > 0 && myPos > leagueSize - 4 ? "danger"
    : "neutral";

  const conf = club.data?.board_confidence ?? 70;
  const confTone = conf >= 70 ? "ok" : conf >= 40 ? "warn" : "danger";

  const obj = objective.data as SeasonObjective | null | undefined;
  const objOnTrack = obj && myPos != null ? myPos <= obj.target : null;

  // forma recente do usuário (mais antigo → mais novo)
  const form = [...(recent.data ?? [])].reverse().map((m) => {
    const isHome = m.home_club_id === clubId;
    const my = isHome ? m.home_score : m.away_score;
    const opp = isHome ? m.away_score : m.home_score;
    if (my == null || opp == null) return "E" as const;
    return (my > opp ? "V" : my < opp ? "D" : "E") as "V" | "E" | "D";
  });

  const nextIsHome = nextMatch?.home_club_id === clubId;
  const nextOppName = nextMatch ? (nextIsHome ? nextMatch.away : nextMatch.home)?.short_name ?? "?" : null;
  const nextClassic = nextMatch?.home?.name && nextMatch?.away?.name
    && isRivalry((nextMatch.home as any).name, (nextMatch.away as any).name);

  const isMatchToday = !!nextMatch && nextMatch.match_date === save.data?.game_date;
  const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const matchdaySquadSorted = [...(matchdaySquad.data ?? [])].sort(
    (a, b) => (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9),
  );

  return (
    <div className="space-y-4">
      <HeroBanner
        eyebrow="Central de comando"
        title={
          <>
            {club.data?.name}
            {season != null && <span className="text-muted-foreground"> · Temporada {season}</span>}
          </>
        }
        action={
          nextMatch ? (
            <Link
              to="/saves/$saveId/calendar"
              params={{ saveId }}
              className="block rounded-xl border bg-background/60 p-3 text-center transition-colors hover:border-foreground/20"
            >
              <div className="fm-eyebrow mb-1 flex items-center justify-center gap-1">
                <CalendarDays className="size-3" /> Próximo jogo
              </div>
              <div className="font-display text-sm font-semibold inline-flex items-center justify-center gap-1">
                <ClubCrest club={club.data as any} className="w-4 h-4" /> {club.data?.short_name} <span className="text-muted-foreground">vs</span> {nextMatch && <ClubCrest club={(nextIsHome ? nextMatch.away : nextMatch.home) as any} className="w-4 h-4" />} {nextOppName}
                {nextClassic && <Flame className="ml-1 inline size-3.5 text-warn" />}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {nextIsHome ? "Em casa" : "Fora"} · {formatDate(nextMatch.match_date)}
              </div>
            </Link>
          ) : undefined
        }
      >
        {myPos != null
          ? (
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <strong className="text-foreground">{myPos}º lugar</strong>
              <span>
                com {myRow?.points} {myRow?.points === 1 ? "ponto" : "pontos"} em {myRow?.played} {myRow?.played === 1 ? "jogo" : "jogos"}.
              </span>
              {obj && (
                <Pill tone={objOnTrack ? "ok" : "warn"} className="ml-0.5">
                  {objectiveLabel(obj)} — {objOnTrack ? "dentro do alvo" : "abaixo do esperado"}
                </Pill>
              )}
            </span>
          )
          : "Temporada ainda não começou — monte a tática e avance os dias."}
      </HeroBanner>

      {isMatchToday && matchdaySquadSorted.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="fm-eyebrow flex items-center gap-1.5">
              <Users className="size-3.5" /> Elenco do dia de jogo
            </span>
            <span className="flex shrink-0 gap-1 text-[10px] font-semibold text-muted-foreground">
              <span className="w-7 text-center">OVR</span>
              <span className="w-7 text-center">CON</span>
              <span className="w-7 text-center">MOR</span>
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {matchdaySquadSorted.map((p) => (
              <div key={p.slot} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="w-9 shrink-0 text-[10px] font-semibold text-muted-foreground">
                  {positionLabel(p.natural_position ?? p.position)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <span className="flex shrink-0 gap-1">
                  <RatingBadge value={p.overall} className="w-7" />
                  <RatingBadge value={p.condition ?? 100} className="w-7" />
                  <RatingBadge value={p.morale ?? 70} className="w-7" />
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {congestion.level !== "none" && congestion.nextRun && (
        <Card className={`flex flex-wrap items-start gap-3 p-4 ${congestion.level === "severe" ? "border-danger/40 bg-danger/5" : "border-warn/40 bg-warn/5"}`}>
          <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${congestion.level === "severe" ? "text-danger" : "text-warn"}`} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-sm font-semibold">Calendário apertado — {congestion.headline}</span>
              {tiredStarters > 0 && (
                <Pill tone={congestion.level === "severe" ? "danger" : "warn"}>
                  {tiredStarters} titular{tiredStarters > 1 ? "es" : ""} abaixo de 70% de condição
                </Pill>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{congestion.advice}</p>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {congestion.nextRun.matches.map((m) => (
                <span key={m.id} className="rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {formatDate(m.date)}{m.competitionType === "cup" ? " · copa" : ""}
                </span>
              ))}
            </div>
          </div>
          <Link
            to="/saves/$saveId/tactics" params={{ saveId }}
            className="shrink-0 self-center rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:border-foreground/20"
          >
            Rodar elenco
          </Link>
        </Card>
      )}

      {atRiskContracts.length > 0 && (
        <Card className={`flex flex-wrap items-start gap-3 p-4 ${criticalContracts > 0 ? "border-danger/40 bg-danger/5" : "border-warn/40 bg-warn/5"}`}>
          <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${criticalContracts > 0 ? "text-danger" : "text-warn"}`} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-sm font-semibold">
                {atRiskContracts.length} contrato{atRiskContracts.length > 1 ? "s" : ""} vencendo
              </span>
              {criticalContracts > 0 && (
                <Pill tone="danger">{criticalContracts} crítico{criticalContracts > 1 ? "s" : ""}</Pill>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {atRiskContracts.slice(0, 3).map((p: any) =>
                `${p.name} (${CONTRACT_RISK_LABEL[p.risk as ContractRisk] ?? "—"}, ${p.daysRemaining}d)`,
              ).join(" · ")}
              {atRiskContracts.length > 3 ? ` · +${atRiskContracts.length - 3}` : ""}
            </p>
          </div>
          <Link
            to="/saves/$saveId/squad" params={{ saveId }}
            className="shrink-0 self-center rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:border-foreground/20"
          >
            Ver contratos
          </Link>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCardLink
          saveId={saveId} to="/saves/$saveId/table"
          label="Classificação" tone={posTone} icon={Trophy}
          value={myPos != null ? `${myPos}º` : "—"}
          hint={myRow ? `${myRow.points} pts · ${myRow.wins}V-${myRow.draws}E-${myRow.losses}D` : "sem jogos"}
        />
        <MetricCardLink
          saveId={saveId} to="/saves/$saveId/board"
          label="Confiança da diretoria" tone={confTone} icon={Landmark}
          value={`${conf}%`}
          hint={obj ? `Meta: ${objectiveLabel(obj)}` : (conf >= 70 ? "Seguro no cargo" : conf >= 40 ? "Pressão moderada" : "Risco de demissão")}
        />
        <MetricCardLink
          saveId={saveId} to="/saves/$saveId/squad"
          label="Elenco" icon={Users}
          value={squad.data?.overall ?? "—"}
          hint={`${squad.data?.n ?? "—"} jogadores · overall médio`}
        />
        <MetricCard
          label="Folha salarial" icon={Wallet} tone="neutral"
          value={squad.data ? formatMoney(squad.data.wageTotal) : "—"}
          hint="quinzenal"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Relatório do adversário */}
        <Card className="p-4">
          <div className="fm-eyebrow mb-3 flex items-center gap-1.5">
            Próximo adversário
            {opponentReport.data?.club && (
              <span className="inline-flex items-center gap-1.5">
                — <ClubCrest club={opponentReport.data.club as any} className="w-4 h-4" /> {opponentReport.data.club.name}
              </span>
            )}
          </div>
          {opponentReport.data?.club ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <Field label="Formação" value={opponentReport.data.club.formation} />
                <Field label="Mentalidade" value={MENTALITY_LABEL[opponentReport.data.club.mentality] ?? opponentReport.data.club.mentality} />
                <Field
                  label="Overall médio"
                  value={<>{opponentReport.data.avgOverall}<span className="text-xs font-normal text-muted-foreground"> (vc {squad.data?.overall ?? "—"})</span></>}
                />
              </div>

              {myRating && opponentReport.data.rating && (
                <div className="space-y-1.5 border-t pt-3">
                  <div className="fm-eyebrow">Seu time × adversário (tática atual)</div>
                  <StatBar label="Ataque" home={ratingToDisplay(myRating.attack)} away={ratingToDisplay(opponentReport.data.rating.attack)} />
                  <StatBar label="Meio" home={ratingToDisplay(myRating.midfield)} away={ratingToDisplay(opponentReport.data.rating.midfield)} />
                  <StatBar label="Defesa" home={ratingToDisplay(myRating.defense)} away={ratingToDisplay(opponentReport.data.rating.defense)} />
                </div>
              )}

              <div className="border-t pt-3">
                <div className="fm-eyebrow mb-1.5">Principais jogadores</div>
                <div className="flex flex-wrap gap-1.5">
                  {opponentReport.data.topPlayers.map((p: any) => (
                    <Pill key={p.name} tone="neutral">
                      <NationalityFlag nationality={p.nationality} /> {p.name} <span className="opacity-60">· {p.position} {fuzzedOverall(p)}</span>
                    </Pill>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState icon={CalendarDays} title="Sem próximo jogo agendado" />
          )}
        </Card>

        {/* Forma + próximos jogos */}
        <Card className="p-4 space-y-4">
          <div>
            <div className="fm-eyebrow mb-2">Forma recente</div>
            {form.length ? (
              <div className="flex gap-1.5">
                {form.map((r, i) => (
                  <span
                    key={i}
                    className={`grid size-7 place-items-center rounded-md text-xs font-bold ${
                      r === "V" ? "bg-ok/15 text-ok" : r === "D" ? "bg-danger/15 text-danger" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum jogo disputado ainda.</p>
            )}
          </div>

          <div className="border-t pt-3">
            <div className="fm-eyebrow mb-2 flex items-center justify-between">
              <span>Próximos jogos</span>
              <Link to="/saves/$saveId/calendar" params={{ saveId }} className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline">
                Calendário <ArrowRight className="size-3" />
              </Link>
            </div>
            {upcoming.data?.length ? (
              <ul className="space-y-1.5 text-sm">
                {upcoming.data.map((m: any) => (
                  <li key={m.id} className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1">
                      {m.home && <ClubCrest club={m.home} className="w-3.5 h-3.5" />} {m.home?.short_name ?? "?"} <span className="text-muted-foreground">×</span> {m.away && <ClubCrest club={m.away} className="w-3.5 h-3.5" />} {m.away?.short_name ?? "?"}
                      {m.home?.name && m.away?.name && isRivalry(m.home.name, m.away.name) && (
                        <Flame className="ml-1 inline size-3 text-warn" />
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(m.match_date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sem jogos agendados.</p>
            )}
          </div>

          <div className="border-t pt-3">
            <div className="fm-eyebrow mb-2">Últimos resultados</div>
            {recent.data?.length ? (
              <ul className="space-y-1.5 text-sm">
                {recent.data.slice(0, 5).map((m: any) => {
                  const isHome = m.home_club_id === clubId;
                  const my = isHome ? m.home_score : m.away_score;
                  const opp = isHome ? m.away_score : m.home_score;
                  const res = my > opp ? "ok" : my < opp ? "danger" : "neutral";
                  return (
                    <li key={m.id} className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1">
                        {m.home && <ClubCrest club={m.home} className="w-3.5 h-3.5" />} {m.home?.short_name ?? "?"}{" "}
                        <span className={res === "ok" ? "font-bold text-ok" : res === "danger" ? "font-bold text-danger" : "font-bold"}>
                          {m.home_score} × {m.away_score}
                        </span>{" "}
                        {m.away && <ClubCrest club={m.away} className="w-3.5 h-3.5" />} {m.away?.short_name ?? "?"}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDate(m.match_date)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum jogo disputado. <Link className="text-primary hover:underline" to="/saves/$saveId/calendar" params={{ saveId }}>Ver calendário</Link>.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="fm-eyebrow">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

// MetricCard que navega — usa o Link do router em volta do card.
function MetricCardLink({
  saveId, to, ...rest
}: {
  saveId: string;
  to: "/saves/$saveId/table" | "/saves/$saveId/board" | "/saves/$saveId/squad";
} & React.ComponentProps<typeof MetricCard>) {
  return (
    <Link to={to} params={{ saveId }} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
      <MetricCard
        {...rest}
        className="h-full transition-colors hover:border-foreground/20 hover:bg-elevated"
      />
    </Link>
  );
}
