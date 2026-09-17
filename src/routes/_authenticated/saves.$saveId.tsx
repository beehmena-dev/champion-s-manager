import { createFileRoute, Link, Outlet, useParams, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { advanceDays } from "@/lib/advance-day";
import { formatDate, formatMoney } from "@/lib/game-hooks";
import { fetchCalendarEvents } from "@/lib/calendar";
import { CalendarGrid } from "@/components/calendar-grid";
import { toast } from "sonner";
import { useState, useEffect, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MatchViewer } from "@/components/match-viewer";
import {
  findNextUserMatchInWindow, startLiveMatch, continueLiveMatch,
  makeHalftimeSubstitution, setHalftimeMentality, setLiveInstructions, changeHalftimeFormation, type LiveMatchSession,
} from "@/lib/live-match";
import { respondToJobOffer } from "@/lib/job-offers";
import { pickPressQuestion, pressContextForResult, type PressContext, type PressQuestion } from "@/game/press";
import { applyPressMoraleDelta } from "@/lib/press";
import type { MatchResult, MatchLineupEntry, Mentality, FormationCode } from "@/game/types";
import { formationSlots } from "@/game/tactics";
import { checkAvailability } from "@/game/availability";
import { ClubCrest } from "@/components/club-crest";
import { liveMatchStats, shotMapEntries, xgMomentum, coachingAnalysis } from "@/game/live-stats";
import { SHOUTS, resolveShout, type ShoutId } from "@/game/shouts";
import { TEAM_TALKS, resolveTeamTalk, type TeamTalkId } from "@/game/team-talk";
import {
  LayoutDashboard, Users, Target, CalendarDays, ListOrdered, Wallet, ArrowLeftRight, ChevronLeft, HeartPulse, Trophy, Briefcase, Landmark, Newspaper, GraduationCap, Award, BarChart3, Settings,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/saves/$saveId")({
  component: SaveLayout,
});

// Pontos de pausa da partida ao vivo — minuto 45 é o intervalo de verdade
// (painel completo, como sempre foi); os outros são paradas mais rápidas da
// barra tática ao vivo (mentalidade/instruções/grito/substituição). O motor
// (simulateMatchSegment) reavalia tática/escalação do banco a cada trecho —
// é por isso que um ajuste feito numa pausa passa a valer de verdade pro
// resto da partida, não só cosmético. 90 não pausa — fecha a partida.
const CHECKPOINTS = [15, 30, 45, 60, 75, 90];

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Duração mínima da animação de calendário — corre em paralelo com a
// chamada de verdade (Promise.all), então uma resposta rápida do servidor
// não faz a folhinha só "piscar" sem dar tempo de ler a data.
function minDelay(dayCount: number): Promise<void> {
  const ms = dayCount <= 0 ? 0 : Math.max(500, Math.min(2400, 250 * dayCount));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Overlay de calendário ao avançar dia(s) — pedido do user (2026-09-12):
// "toda vez que clica pra avançar, ele carrega com a tela do calendário,
// indicando se passou o dia ou não". Antes disso era só uma folhinha
// genérica virando (f7-dayadvance) com a data em texto, sem mostrar o que
// tem em cada dia — agora é a grade do mês de verdade (mesmo componente da
// tela de Calendário, ver src/components/calendar-grid.tsx), com os dias
// desta janela destacados e "acendendo" um a um conforme avançam. A parte
// difícil (parar no primeiro dia que precisa de ação do user, em vez de
// avançar cego) já existe em handleAdvance/findNextUserMatchInWindow; isso é
// só a camada visual por cima da espera. `dates` já vem pronta de quem chama
// (a janela real que vai ser avançada, não um placeholder).
function DayAdvanceOverlay({ dates, saveId, clubId }: { dates: string[]; saveId: string; clubId?: string | null }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (dates.length <= 1) return;
    const perDay = Math.max(140, Math.min(480, 2400 / dates.length));
    const id = setInterval(() => {
      setI((prev) => (prev + 1 < dates.length ? prev + 1 : prev));
    }, perDay);
    return () => clearInterval(id);
  }, [dates]);

  const current = dates[Math.min(i, dates.length - 1)] ?? dates[0];
  const currentDate = new Date(current + "T00:00:00");
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Mesma janela de mês que a tela de Calendário busca (ver
  // src/lib/calendar.ts) — cacheia junto (mesma queryKey), então abrir a
  // tela de Calendário logo depois de avançar não refaz a busca à toa.
  const rangeStart = new Date(year, month, 1); rangeStart.setDate(rangeStart.getDate() - 7);
  const rangeEnd = new Date(year, month + 1, 0); rangeEnd.setDate(rangeEnd.getDate() + 7);
  const rangeStartISO = rangeStart.toISOString().slice(0, 10);
  const rangeEndISO = rangeEnd.toISOString().slice(0, 10);

  const events = useQuery({
    queryKey: ["calendar-events", saveId, clubId, rangeStartISO, rangeEndISO],
    enabled: !!clubId,
    queryFn: () => fetchCalendarEvents(saveId, clubId!, rangeStartISO, rangeEndISO),
  });

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background/90 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-3 shadow-2xl">
        <CalendarGrid
          monthYear={year} monthMonth={month}
          eventsByDate={events.data ?? new Map()}
          advancingDates={dates} advancingIndex={i}
        />
      </div>
      {dates.length > 1 && (
        <div className="flex gap-1">
          {dates.map((dt, idx) => (
            <span key={dt} className={`h-1.5 w-1.5 rounded-full transition-colors ${idx <= i ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      )}
      <div className="text-xs text-muted-foreground">Avançando o calendário…</div>
    </div>
  );
}

function SaveLayout() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isSetup = pathname.endsWith("/setup");
  const [advancing, setAdvancing] = useState(false);
  // Datas reais sendo avançadas nesta chamada (janela até o dia de jogo, ou
  // os `days` inteiros se não há partida no caminho) — alimenta o overlay de
  // calendário virando (f7-dayadvance). `null` = overlay escondido.
  const [advanceDates, setAdvanceDates] = useState<string[] | null>(null);
  const [matchDialog, setMatchDialog] = useState<null | {
    result: MatchResult; home: string; away: string; homeId?: string; awayId?: string; resumeFrom?: number; pressContext?: PressContext;
  }>(null);
  const [liveSession, setLiveSession] = useState<LiveMatchSession | null>(null);
  // A barra tática ao vivo pausa em vários pontos da partida (ver
  // CHECKPOINTS), não só no intervalo tradicional — `checkpointIdx` diz em
  // qual desses pontos estamos; `paused` diz se estamos VENDO a pausa
  // (painel de intervalo ou barra tática) em vez do 3D/2D rodando.
  const [checkpointIdx, setCheckpointIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [finishingHalf, setFinishingHalf] = useState(false);
  const [halftimeShout, setHalftimeShout] = useState<ShoutId | null>(null);
  // Substituições contam pra partida INTEIRA (regra de campeonato), não só
  // pro intervalo — por isso mora aqui em cima, não dentro de cada painel.
  const [subsUsedTotal, setSubsUsedTotal] = useState(0);
  const [prePress, setPrePress] = useState<{ q: PressQuestion; matchId: string } | null>(null);
  const [pendingTeamTalk, setPendingTeamTalk] = useState<{ matchId: string } | null>(null);
  const [postPress, setPostPress] = useState<PressQuestion | null>(null);
  const [pendingContinuationDays, setPendingContinuationDays] = useState(0);

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => {
      const { data, error } = await supabase.from("saves").select("*").eq("id", saveId).single();
      if (error) throw error;
      return data;
    },
  });

  const club = useQuery({
    queryKey: ["club", save.data?.my_club_id],
    enabled: !!save.data?.my_club_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs").select("*, competitions!clubs_competition_id_fkey(name, season)")
        .eq("id", save.data!.my_club_id!).single();
      if (error) throw error;
      return data;
    },
  });

  // Sondagem de outro clube pendente (ver src/lib/job-offers.ts) — recarrega
  // sozinha porque handleAdvance/advanceToCheckpoint já chamam invalidateQueries()
  // depois de todo avanço, então uma sondagem nova aparece aqui sem esforço extra.
  const jobOffer = useQuery({
    queryKey: ["pending-job-offer", saveId],
    enabled: !!save.data?.my_club_id,
    queryFn: async () => (await supabase
      .from("job_offers")
      .select("id, offering_club_id, clubs!job_offers_offering_club_id_fkey(id, name, reputation, crest_url, primary_color, secondary_color)")
      .eq("save_id", saveId).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(1).maybeSingle()).data,
  });

  // Contador de mensagens não lidas na caixa de entrada (ver
  // src/lib/inbox.ts). Invalida junto de tudo em handleAdvance/advanceToCheckpoint.
  const inboxBadge = useQuery({
    queryKey: ["inbox-unread", save.data?.my_club_id],
    enabled: !!save.data?.my_club_id,
    queryFn: async () => {
      const { count } = await supabase
        .from("inbox_messages").select("id", { count: "exact", head: true })
        .eq("save_id", saveId).eq("club_id", save.data!.my_club_id!).eq("read", false);
      return count ?? 0;
    },
  });

  // Contador pro badge do Mercado no menu lateral — propostas de
  // transferência e pedidos de saída pendentes só aparecem entrando na
  // tela, então isso evita que passem batido (sondagem de emprego já
  // aparece sozinha via diálogo bloqueante, não precisa de badge).
  const marketBadge = useQuery({
    queryKey: ["market-badge-count", saveId, save.data?.my_club_id],
    enabled: !!save.data?.my_club_id,
    queryFn: async () => {
      const myClubId = save.data!.my_club_id!;
      const [{ count: offersCount }, { count: requestsCount }] = await Promise.all([
        supabase.from("transfer_offers").select("id", { count: "exact", head: true })
          .eq("save_id", saveId).eq("status", "pending")
          .or(`seller_club_id.eq.${myClubId},buyer_club_id.eq.${myClubId}`),
        supabase.from("transfer_requests").select("id", { count: "exact", head: true })
          .eq("club_id", myClubId).eq("status", "pending"),
      ]);
      return (offersCount ?? 0) + (requestsCount ?? 0);
    },
  });

  function reportRollover(r: Awaited<ReturnType<typeof advanceDays>>) {
    if (!r.seasonRolledOver) return;
    toast.success(`Temporada encerrada! Bem-vindo à temporada ${r.newSeason}.`, { duration: 6000 });
    if (r.retirements && r.retirements.length > 0) {
      toast.info(`${r.retirements.join(", ")} se aposentou${r.retirements.length > 1 ? "ram" : ""}.`, { duration: 6000 });
    }
    if (r.youthPromoted) {
      toast.info(`${r.youthPromoted} jogador${r.youthPromoted > 1 ? "es" : ""} da base promovido${r.youthPromoted > 1 ? "s" : ""} ao elenco.`, { duration: 6000 });
    }
    if (r.fired) {
      toast.error(`Você foi demitido do ${r.firedFromClub}! A diretoria perdeu a confiança em você.`, { duration: 8000 });
    }
    for (const a of r.seasonAwards ?? []) {
      if (a.kind === "top_scorer") toast.success(`🥇 ${a.playerName} foi o artilheiro do clube na temporada, com ${a.value} gols!`, { duration: 6000 });
      else toast.success(`⭐ ${a.playerName} foi eleito o craque do clube na temporada (${a.value} overall).`, { duration: 6000 });
    }
  }

  // Lesão de treino (ver src/game/training.ts) e cláusula de rescisão
  // acionada (ver src/lib/release-clauses.ts) — nenhum dos dois é exclusivo
  // de virada de temporada, então rodam fora de reportRollover().
  function reportTrainingInjuries(r: Awaited<ReturnType<typeof advanceDays>>) {
    for (const inj of r.trainingInjuries ?? []) {
      toast.error(`🩹 ${inj.name} se lesionou no treino — ${inj.days} dias afastado.`, { duration: 6000 });
    }
    for (const t of r.releaseClauseTriggers ?? []) {
      toast.error(`📝 ${t.clubName} pagou a cláusula de rescisão de ${t.playerName} (${formatMoney(t.fee)}) — o jogador já saiu.`, { duration: 8000 });
    }
  }

  async function beginLiveMatch(matchId: string, teamTalk: TeamTalkId | null = null) {
    setAdvancing(true);
    try {
      const session = await startLiveMatch(saveId, matchId, save.data!.my_club_id!, CHECKPOINTS[0], teamTalk);
      setLiveSession(session);
      setCheckpointIdx(0);
      setPaused(false);
      setSubsUsedTotal(0);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao iniciar a partida");
    } finally {
      setAdvancing(false);
    }
  }

  // Avança a partida ao vivo do checkpoint atual até CHECKPOINTS[nextIdx] —
  // chamado tanto pela barra tática (paradas rápidas) quanto pelo painel de
  // intervalo tradicional (nextIdx aponta pro 60') e, quando o alvo é 90,
  // encerra e persiste a partida (mesma lógica que já existia só pro 2º
  // tempo, generalizada pra qualquer checkpoint final).
  async function advanceToCheckpoint(nextIdx: number, shout: ShoutId | null = null) {
    if (!liveSession) return;
    const toMinute = CHECKPOINTS[nextIdx];
    setFinishingHalf(true);
    try {
      const { result, carryState, lastMinute } = await continueLiveMatch(liveSession, toMinute, shout);
      if (toMinute >= 90) {
        let r = await advanceDays(saveId, 1, {
          precomputedUserMatch: { matchId: liveSession.matchId, result },
        });
        // Se veio de um "+7d" que caiu num dia de jogo, continua o restante
        // da janela agora que a partida ao vivo terminou (ver handleAdvance).
        const remaining = pendingContinuationDays;
        setPendingContinuationDays(0);
        if (remaining > 0 && !r.seasonRolledOver) {
          r = await advanceDays(saveId, remaining);
        }
        await qc.invalidateQueries();
        reportRollover(r);
        reportTrainingInjuries(r);
        const myScore = liveSession.isHome ? result.homeScore : result.awayScore;
        const oppScore = liveSession.isHome ? result.awayScore : result.homeScore;
        setMatchDialog({
          result, home: liveSession.homeName, away: liveSession.awayName, resumeFrom: 45,
          homeId: liveSession.homeClub?.id, awayId: liveSession.awayClub?.id,
          pressContext: pressContextForResult(myScore, oppScore),
        });
        setLiveSession(null);
        setCheckpointIdx(0);
        setPaused(false);
        setHalftimeShout(null);
      } else {
        setLiveSession({ ...liveSession, result, carryState, lastMinute });
        setCheckpointIdx(nextIdx);
        setPaused(false);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao continuar a partida");
    } finally {
      setFinishingHalf(false);
    }
  }

  async function respondPrePress(optionId: string) {
    if (!prePress) return;
    const opt = prePress.q.options.find((o) => o.id === optionId);
    const matchId = prePress.matchId;
    setPrePress(null);
    if (opt && save.data?.my_club_id) {
      try {
        await applyPressMoraleDelta(save.data.my_club_id, opt.moraleDelta);
      } catch (e: any) {
        toast.error(e.message ?? "Falha ao aplicar efeito da coletiva na moral");
      }
    }
    // Passa pela preleção antes do apito inicial (ver src/game/team-talk.ts).
    setPendingTeamTalk({ matchId });
  }

  async function respondTeamTalk(talk: TeamTalkId | null) {
    if (!pendingTeamTalk) return;
    const matchId = pendingTeamTalk.matchId;
    setPendingTeamTalk(null);
    await beginLiveMatch(matchId, talk);
  }

  async function handleAdvance(days: number) {
    // Se em algum ponto da janela de dias (não só o primeiro) houver jogo do
    // seu clube, avança em lote só até a véspera, entra no modo ao vivo pra
    // esse jogo (barra tática ao vivo em vários pontos da partida — ver
    // src/lib/live-match.ts) e guarda o restante da janela pra continuar
    // depois, em advanceToCheckpoint(). Antes do jogo, uma coletiva de imprensa
    // pré-jogo (ver src/game/press.ts).
    if (save.data?.my_club_id && save.data?.game_date) {
      setAdvancing(true);
      try {
        const found = await findNextUserMatchInWindow(saveId, save.data.my_club_id, save.data.game_date, days);
        if (found) {
          if (found.daysFromStart > 0) {
            const dates = Array.from({ length: found.daysFromStart }, (_, k) => addDaysISO(save.data!.game_date, k + 1));
            setAdvanceDates(dates);
            const [r] = await Promise.all([advanceDays(saveId, found.daysFromStart), minDelay(dates.length)]);
            setAdvanceDates(null);
            await qc.invalidateQueries();
            reportRollover(r);
            reportTrainingInjuries(r);
            // Temporada virou antes do dia do jogo (raro, perto do fim da
            // temporada) — o calendário foi refeito, esse jogo pode nem
            // existir mais. Encerra o avanço com segurança aqui.
            if (r.seasonRolledOver) { setAdvancing(false); return; }
          }
          setPendingContinuationDays(days - found.daysFromStart - 1);
          setPrePress({ q: pickPressQuestion("pre_match"), matchId: found.matchId });
          setAdvancing(false);
          return;
        }
      } catch (e: any) {
        setAdvanceDates(null);
        toast.error(e.message ?? "Erro ao avançar");
        setAdvancing(false);
        return;
      }
    }

    setAdvancing(true);
    const dates = save.data?.game_date ? Array.from({ length: days }, (_, k) => addDaysISO(save.data!.game_date, k + 1)) : [];
    setAdvanceDates(dates);
    try {
      const [r] = await Promise.all([advanceDays(saveId, days), minDelay(dates.length)]);
      setAdvanceDates(null);
      const lastUserMatch = r.userMatch;
      // Avançar o jogo pode mexer em praticamente qualquer coisa (partidas,
      // finanças, elenco, propostas de transferência, scouting, copa, tabela)
      // — mais simples e seguro invalidar tudo do que manter uma lista de
      // queryKeys sincronizada manualmente.
      await qc.invalidateQueries();
      reportRollover(r);
      reportTrainingInjuries(r);
      if (lastUserMatch) {
        const isHome = lastUserMatch.home.id === save.data?.my_club_id;
        const myScore = isHome ? lastUserMatch.result.homeScore : lastUserMatch.result.awayScore;
        const oppScore = isHome ? lastUserMatch.result.awayScore : lastUserMatch.result.homeScore;
        setMatchDialog({
          result: lastUserMatch.result,
          home: lastUserMatch.home.name,
          away: lastUserMatch.away.name,
          homeId: lastUserMatch.home.id,
          awayId: lastUserMatch.away.id,
          pressContext: pressContextForResult(myScore, oppScore),
        });
      } else if (!r.seasonRolledOver) {
        toast.success(`Avançou ${days} dia${days > 1 ? "s" : ""}`);
      }
    } catch (e: any) {
      setAdvanceDates(null);
      toast.error(e.message ?? "Erro ao avançar");
    } finally {
      setAdvancing(false);
    }
  }

  if (isSetup) {
    return <Outlet />;
  }

  if (save.isLoading || club.isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  }
  // Falha de rede/servidor passageira não pode virar "essa save não tem
  // clube" — antes disso um 503 transitório na consulta derrubava o usuário
  // direto pra tela de "Configurar save" (parecendo que o progresso sumiu),
  // quando na verdade era só o banco de dev tropeçando por um instante.
  if (save.isError || club.isError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>Não foi possível carregar esta save agora.</p>
        <Button size="sm" variant="outline" onClick={() => { save.refetch(); club.refetch(); }}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  if (!save.data?.my_club_id) {
    return <RedirectToSetup saveId={saveId} />;
  }

  const tabs = [
    { to: "/saves/$saveId", label: "Visão geral", icon: LayoutDashboard },
    { to: "/saves/$saveId/squad", label: "Elenco", icon: Users },
    { to: "/saves/$saveId/academy", label: "Central da base", icon: GraduationCap },
    { to: "/saves/$saveId/medical", label: "Central Médica", icon: HeartPulse },
    { to: "/saves/$saveId/tactics", label: "Tática", icon: Target },
    { to: "/saves/$saveId/analysis", label: "Análise", icon: BarChart3 },
    { to: "/saves/$saveId/staff", label: "Comissão técnica", icon: Briefcase },
    { to: "/saves/$saveId/calendar", label: "Calendário", icon: CalendarDays },
    { to: "/saves/$saveId/table", label: "Classificação", icon: ListOrdered },
    { to: "/saves/$saveId/cup", label: "Copa", icon: Trophy },
    { to: "/saves/$saveId/finances", label: "Finanças", icon: Wallet },
    { to: "/saves/$saveId/board", label: "Diretoria", icon: Landmark },
    { to: "/saves/$saveId/career", label: "Carreira", icon: Award },
    { to: "/saves/$saveId/market", label: "Mercado", icon: ArrowLeftRight },
    { to: "/saves/$saveId/news", label: "Caixa de entrada", icon: Newspaper },
    { to: "/saves/$saveId/settings", label: "Configurações", icon: Settings },
  ] as const;

  const initials = (club.data?.short_name ?? club.data?.name ?? "?")
    .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
        <div className="px-4 py-4 border-b border-sidebar-border">
          <Link to="/dashboard" className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors">
            <ChevronLeft className="size-3.5" /> Saves
          </Link>
        </div>
        <nav className="flex-1 py-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            const badge = t.to === "/saves/$saveId/market"
              ? (marketBadge.data ?? 0)
              : t.to === "/saves/$saveId/news"
                ? (inboxBadge.data ?? 0)
                : 0;
            return (
              <Link
                key={t.to}
                to={t.to}
                params={{ saveId }}
                activeOptions={{ exact: t.to === "/saves/$saveId" }}
                activeProps={{ className: "bg-sidebar-accent text-sidebar-primary border-l-2 border-sidebar-primary" }}
                inactiveProps={{ className: "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground border-l-2 border-transparent" }}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors"
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1">{t.label}</span>
                {badge > 0 && (
                  <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-sidebar-border">
          <div className="fm-eyebrow">FootyManager</div>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border bg-card sticky top-0 z-10">
          <div className="px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {club.data ? (
                <ClubCrest club={club.data} className="size-9 rounded-md shrink-0" />
              ) : (
                <div className="size-9 rounded-md bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                  {initials}
                </div>
              )}
              <div>
                <Link to="/saves/$saveId/clubs/$clubId" params={{ saveId, clubId: save.data.my_club_id! }} className="font-semibold leading-tight hover:text-primary hover:underline">
                  {club.data?.name}
                </Link>
                <div className="fm-eyebrow">
                  {club.data?.competition_id ? (
                    <Link to="/saves/$saveId/competitions/$competitionId" params={{ saveId, competitionId: club.data.competition_id }} className="hover:text-primary hover:underline">
                      {club.data?.competitions?.name}
                    </Link>
                  ) : club.data?.competitions?.name}
                  {" "}· Caixa {formatMoney(club.data?.budget)} · Transferências {formatMoney(club.data?.transfer_budget)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground mr-2">{formatDate(save.data.game_date)}</div>
              <Button size="sm" variant="outline" onClick={() => handleAdvance(7)} disabled={advancing}>
                +7d
              </Button>
              <Button size="sm" onClick={() => handleAdvance(1)} disabled={advancing} className="font-semibold">
                {advancing ? "…" : "Avançar 1 dia"}
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 py-6">
          <Outlet />
        </main>
      </div>

      {advanceDates && <DayAdvanceOverlay dates={advanceDates} saveId={saveId} clubId={save.data?.my_club_id} />}

      {matchDialog && (
        <MatchDayScreen
          // Sem o placar no título — o visualizador (2D ou os melhores
          // momentos do 3D) ainda vai "revelar" o resultado; botar o placar
          // final aqui em cima entrega o final antes da hora.
          title={`${matchDialog.home} × ${matchDialog.away}`}
          onClose={() => {
            if (matchDialog.pressContext) setPostPress(pickPressQuestion(matchDialog.pressContext));
            setMatchDialog(null);
          }}
        >
          <MatchViewer
            result={matchDialog.result} homeName={matchDialog.home} awayName={matchDialog.away}
            homeClubId={matchDialog.homeId} awayClubId={matchDialog.awayId}
            initialMinute={matchDialog.resumeFrom ?? 0}
          />
        </MatchDayScreen>
      )}

      {liveSession && (
        <MatchDayScreen title={`${liveSession.homeName} × ${liveSession.awayName}`}>
          {!paused && (
            <div className="space-y-3">
              {liveSession.teamTalkResponse && checkpointIdx === 0 && (
                <p className="rounded-md border border-border bg-elevated/40 px-3 py-2 text-sm text-muted-foreground">
                  <span className="fm-eyebrow mr-2">Vestiário</span>{liveSession.teamTalkResponse}
                </p>
              )}
              <MatchViewer
                key={`live-chunk-${checkpointIdx}`}
                result={liveSession.result} homeName={liveSession.homeName} awayName={liveSession.awayName}
                homeClubId={liveSession.homeClub?.id} awayClubId={liveSession.awayClub?.id}
                initialMinute={checkpointIdx === 0 ? 0 : CHECKPOINTS[checkpointIdx - 1]}
                maxMinute={CHECKPOINTS[checkpointIdx]} onReachMax={() => setPaused(true)}
              />
            </div>
          )}
          {paused && checkpointIdx === 2 && (
            <HalftimePanel
              saveId={saveId} clubId={liveSession.myClubId} matchDate={liveSession.matchDate}
              actualLineup={liveSession.isHome ? liveSession.result.homeLineup : liveSession.result.awayLineup}
              result={liveSession.result} myIsHome={liveSession.isHome}
              homeName={liveSession.homeName} awayName={liveSession.awayName}
              shout={halftimeShout} onShout={setHalftimeShout}
              subsUsed={subsUsedTotal} onSubUsed={() => setSubsUsedTotal((n) => n + 1)}
              onContinue={() => advanceToCheckpoint(3, halftimeShout)} continuing={finishingHalf}
            />
          )}
          {paused && checkpointIdx !== 2 && (
            <InPlayTacticsBar
              clubId={liveSession.myClubId} matchDate={liveSession.matchDate}
              actualLineup={liveSession.isHome ? liveSession.result.homeLineup : liveSession.result.awayLineup}
              subsUsed={subsUsedTotal} onSubUsed={() => setSubsUsedTotal((n) => n + 1)}
              minute={CHECKPOINTS[checkpointIdx]}
              onContinue={(shout) => advanceToCheckpoint(checkpointIdx + 1, shout)}
              continuing={finishingHalf}
            />
          )}
        </MatchDayScreen>
      )}

      {jobOffer.data && !matchDialog && !liveSession && !prePress && !pendingTeamTalk && (
        <JobOfferDialog saveId={saveId} offer={jobOffer.data as any} onDone={() => qc.invalidateQueries()} />
      )}

      {prePress && <PressDialog title="Coletiva pré-jogo" question={prePress.q} onAnswer={respondPrePress} />}

      {pendingTeamTalk && save.data?.my_club_id && (
        <TeamTalkDialog
          matchId={pendingTeamTalk.matchId} myClubId={save.data.my_club_id}
          onConfirm={respondTeamTalk}
        />
      )}

      {postPress && (
        <PressDialog
          title="Coletiva pós-jogo"
          question={postPress}
          onAnswer={async (optionId) => {
            const opt = postPress.options.find((o) => o.id === optionId);
            setPostPress(null);
            if (opt && save.data?.my_club_id) {
              try {
                await applyPressMoraleDelta(save.data.my_club_id, opt.moraleDelta);
              } catch (e: any) {
                toast.error(e.message ?? "Falha ao aplicar efeito da coletiva na moral");
              }
            }
            qc.invalidateQueries();
          }}
        />
      )}
    </div>
  );
}

// Tela de dia de jogo — cobre a viewport inteira, sem cara de modal (sem
// backdrop, sem X clicável fora, sem largura travada). O usuário pediu
// explicitamente pra não ser "um pop-up": no estilo FM Touch, o dia de jogo
// é sua própria tela, não uma caixinha em cima do resto do app. O estado da
// sessão ao vivo continua morando em SaveLayout (tem uma função de RNG
// dentro, que não dá pra serializar numa rota/URL) — isso aqui só troca a
// apresentação visual de "diálogo" pra "tela".
function MatchDayScreen({
  title, onClose, children,
}: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="shrink-0 border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="font-display text-lg font-semibold">{title}</div>
        {onClose && <Button size="sm" variant="outline" onClick={onClose}>Fechar</Button>}
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-5xl mx-auto">{children}</div>
      </div>
    </div>
  );
}

const MENTALITY_LABEL: Record<Mentality, string> = { defensive: "Defensiva", balanced: "Equilibrada", attacking: "Ofensiva" };
const MAX_HALFTIME_SUBS = 3;

const FORMATION_CODES: FormationCode[] = ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "5-3-2", "4-1-4-1"];

// Mini-campo com os "chutes" do 1º tempo — tamanho do ponto pelo xG
// aproximado (ver src/game/live-stats.ts; não é dado real de qualidade de
// chute, é decoração informada pelo tipo do evento).
function HalftimeShotMap({ result }: { result: MatchResult }) {
  const shots = shotMapEntries(result.events ?? []).filter((s) => s.eventMinute <= 45);
  if (!shots.length) return null;
  return (
    <div className="relative w-full aspect-[68/50] max-h-36 mx-auto rounded overflow-hidden" style={{ background: "#1b6b3c" }}>
      <svg viewBox="0 0 100 50" className="absolute inset-0 w-full h-full">
        <rect x="1" y="1" width="98" height="48" fill="none" stroke="#ffffff40" strokeWidth="0.5" />
        {shots.map((s, i) => {
          const y = s.side === "home" ? s.y * 0.5 : (100 - s.y) * 0.5;
          return (
            <circle
              key={i} cx={s.x / 2 + 25} cy={y} r={1.6 + s.xg * 5}
              fill={s.scored ? "#facc15" : s.side === "home" ? "#3b82f6" : "#e11d48"}
              stroke="#ffffffaa" strokeWidth="0.3" opacity={0.85}
            >
              <title>{`${s.eventMinute}' — xG ${s.xg.toFixed(2)}`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

// Gráfico de "momento do jogo" — xG acumulado de cada lado ao longo do 1º
// tempo (linha azul = mandante, vermelha = visitante).
function HalftimeXgGraph({ result }: { result: MatchResult }) {
  const points = xgMomentum(result.events ?? [], 45);
  const maxXg = Math.max(0.3, ...points.flatMap((p) => [p.home, p.away]));
  const path = (key: "home" | "away") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${(p.minute / 45) * 100} ${100 - (p[key] / maxXg) * 90}`).join(" ");
  return (
    <div className="w-full h-20 rounded border bg-muted/30 overflow-hidden">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        <path d={path("away")} fill="none" stroke="#e11d48" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={path("home")} fill="none" stroke="#3b82f6" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function HalftimeAnalysis({ result, homeName, awayName, myIsHome }: {
  result: MatchResult; homeName: string; awayName: string; myIsHome: boolean;
}) {
  const stats = liveMatchStats(result.stats, result.events ?? [], 45, 90);
  const analysis = coachingAnalysis(result.events ?? [], 45, myIsHome);
  return (
    <div className="space-y-3 border rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Conselho da comissão técnica</div>
      <p className="text-sm">{analysis}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="fm-eyebrow mb-1">Mapa de finalizações</div>
          <HalftimeShotMap result={result} />
        </div>
        <div>
          <div className="fm-eyebrow mb-1">Momento do jogo (xG)</div>
          <HalftimeXgGraph result={result} />
        </div>
      </div>
      {result.stats && (
        <div className="space-y-1.5 text-xs pt-1 border-t">
          <StatRow label="Posse de bola" home={stats.possession} away={100 - stats.possession} suffix="%" />
          <StatRow label="Chutes" home={stats.shotsHome} away={stats.shotsAway} />
          <StatRow label="No alvo" home={stats.onTargetHome} away={stats.onTargetAway} />
        </div>
      )}
      <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
        <span>{homeName}</span>
        <span>{awayName}</span>
      </div>
    </div>
  );
}

function StatRow({ label, home, away, suffix = "" }: { label: string; home: number; away: number; suffix?: string }) {
  const total = home + away;
  const homePct = total > 0 ? (home / total) * 100 : 50;
  return (
    <div>
      <div className="flex items-center justify-between text-muted-foreground mb-0.5">
        <span className="font-mono font-semibold text-foreground">{home}{suffix}</span>
        <span>{label}</span>
        <span className="font-mono font-semibold text-foreground">{away}{suffix}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-muted flex">
        <div className="h-full bg-blue-500" style={{ width: `${homePct}%` }} />
        <div className="h-full bg-rose-500" style={{ width: `${100 - homePct}%` }} />
      </div>
    </div>
  );
}

function HalftimePanel({
  saveId, clubId, matchDate, actualLineup, result, myIsHome, homeName, awayName,
  shout, onShout, subsUsed, onSubUsed, onContinue, continuing,
}: {
  saveId: string; clubId: string; matchDate: string; actualLineup?: MatchLineupEntry[];
  result: MatchResult; myIsHome: boolean; homeName: string; awayName: string;
  shout: ShoutId | null; onShout: (s: ShoutId | null) => void;
  // Contagem de substituições da partida inteira (regra de campeonato) — vem
  // de cima (SaveLayout), não é mais local: outras pausas da barra tática
  // ao vivo também consomem esse limite.
  subsUsed: number; onSubUsed: () => void;
  onContinue: () => void; continuing: boolean;
}) {
  const qc = useQueryClient();
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [mentality, setMentality] = useState<Mentality | null>(null);

  const club = useQuery({
    queryKey: ["halftime-club", clubId],
    queryFn: async () => (await supabase.from("clubs").select("mentality, formation").eq("id", clubId).single()).data,
  });
  useEffect(() => {
    if (club.data?.mentality && mentality === null) setMentality(club.data.mentality as Mentality);
  }, [club.data, mentality]);

  const lineup = useQuery({
    queryKey: ["halftime-lineup", clubId],
    queryFn: async () => (await supabase.from("tactic_lineups").select("slot, player_id").eq("club_id", clubId)).data ?? [],
  });
  const players = useQuery({
    queryKey: ["halftime-players", clubId],
    queryFn: async () => (await supabase
      .from("players").select("id, name, position, injured_until, suspended_matches").eq("club_id", clubId)).data ?? [],
  });

  const mentalityMutation = useMutation({
    mutationFn: (m: Mentality) => setHalftimeMentality(clubId, m),
    onSuccess: (_r, m) => {
      setMentality(m);
      qc.invalidateQueries({ queryKey: ["halftime-club", clubId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao mudar mentalidade"),
  });

  const formationMutation = useMutation({
    mutationFn: (f: FormationCode) => changeHalftimeFormation(saveId, clubId, f, matchDate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["halftime-club", clubId] });
      qc.invalidateQueries({ queryKey: ["halftime-lineup", clubId] });
      toast.success("Formação trocada — XI remontado.");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao trocar formação"),
  });

  const subMutation = useMutation({
    mutationFn: (vars: { slot: string; playerId: string }) => makeHalftimeSubstitution(clubId, vars.slot, vars.playerId),
    onSuccess: () => {
      onSubUsed();
      setOpenSlot(null);
      qc.invalidateQueries({ queryKey: ["halftime-lineup", clubId] });
      toast.success("Substituição feita.");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha na substituição"),
  });

  if (club.isLoading || lineup.isLoading || players.isLoading) {
    return <div className="text-sm text-muted-foreground">Carregando escalação…</div>;
  }

  // O motor de simulação já filtra disponibilidade e substitui automaticamente
  // um titular salvo que ficou indisponível (ver src/game/simulation.ts) — o
  // XI que REALMENTE entrou em campo é actualLineup (vindo de
  // liveSession.result), não a escalação salva crua em
  // tactic_lineups. Sem isso, o painel do intervalo podia mostrar um jogador
  // indisponível como "titular" e oferecer quem entrou de verdade no lugar
  // dele como se estivesse livre no banco.
  const actualLineupMap = new Map((actualLineup ?? []).map((l) => [l.slot, l.playerId]));
  const startingIds = actualLineup
    ? new Set(actualLineup.map((l) => l.playerId))
    : new Set((lineup.data ?? []).map((l) => l.player_id));
  // Antes tratava QUALQUER injured_until não-nulo como "ainda machucado" — mas
  // essa data nunca é limpa depois que o jogador recupera (a recuperação é só
  // uma comparação de data, ver src/game/availability.ts), então qualquer
  // jogador que já se machucou uma vez sumia da lista de reservas do
  // intervalo pra sempre, mesmo 100% apto. Reusa a mesma checagem que
  // tactics.tsx/squad.tsx/live-match.ts já usam.
  const bench = (players.data ?? []).filter(
    (p) => !startingIds.has(p.id) && checkAvailability(p as any, matchDate).available,
  );
  const playerName = (id: string) => players.data?.find((p) => p.id === id)?.name ?? "—";

  // Ordena pela ordem tática da formação (GK → DEF → MEI → ATA), não pela
  // ordem "de chegada" do banco — senão a lista pula de lugar a cada troca.
  const slotOrder = formationSlots((club.data?.formation as FormationCode) ?? "4-4-2").map((s) => s.slot);
  const orderedLineup = [...(lineup.data ?? [])].sort(
    (a, b) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot),
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Intervalo — ajuste a mentalidade ou faça até {MAX_HALFTIME_SUBS} substituições antes do 2º tempo.</p>

      <HalftimeAnalysis result={result} homeName={homeName} awayName={awayName} myIsHome={myIsHome} />

      <div>
        <h3 className="font-semibold text-sm mb-2">Formação</h3>
        <select
          className="w-full h-9 px-2 rounded border bg-background text-sm"
          value={(club.data?.formation as FormationCode) ?? "4-4-2"}
          disabled={formationMutation.isPending}
          onChange={(e) => formationMutation.mutate(e.target.value as FormationCode)}
        >
          {FORMATION_CODES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <p className="text-xs text-muted-foreground mt-1">Troca a formação inteira e remonta o XI automaticamente (não conta como substituição).</p>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">Mentalidade</h3>
        <div className="flex gap-2">
          {(Object.keys(MENTALITY_LABEL) as Mentality[]).map((m) => (
            <Button
              key={m} size="sm" variant={mentality === m ? "default" : "outline"}
              onClick={() => mentalityMutation.mutate(m)} disabled={mentalityMutation.isPending}
            >
              {MENTALITY_LABEL[m]}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-1">Grito de beira de campo</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Um recado só — o efeito vale para o 2º tempo e depende da situação do placar.
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {SHOUTS.map((s) => {
            const active = shout === s.id;
            return (
              <button
                key={s.id}
                type="button"
                title={s.hint}
                onClick={() => onShout(active ? null : s.id)}
                className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        {shout && (() => {
          const myHT = myIsHome ? result.homeScore : result.awayScore;
          const oppHT = myIsHome ? result.awayScore : result.homeScore;
          const r = resolveShout(shout, myHT - oppHT);
          return (
            <p className={`mt-2 text-xs ${r.moraleShift >= 0 ? "text-ok" : "text-danger"}`}>
              {r.response} <span className="font-mono font-semibold">({r.moraleShift >= 0 ? "+" : ""}{r.moraleShift} moral)</span>
            </p>
          );
        })()}
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">Substituições ({subsUsed}/{MAX_HALFTIME_SUBS})</h3>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {orderedLineup.map((l) => (
            <div key={l.slot} className="flex items-center justify-between text-sm border rounded px-2 py-1.5 gap-2">
              <span className="truncate">{l.slot} · {playerName(actualLineupMap.get(l.slot) ?? l.player_id)}</span>
              {openSlot === l.slot ? (
                <select
                  className="bg-transparent border rounded px-1 py-0.5 text-xs shrink-0"
                  onChange={(e) => e.target.value && subMutation.mutate({ slot: l.slot, playerId: e.target.value })}
                  defaultValue=""
                >
                  <option value="" disabled>Escolher…</option>
                  {bench.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.position})</option>)}
                </select>
              ) : (
                <Button
                  size="sm" variant="outline" className="shrink-0"
                  onClick={() => setOpenSlot(l.slot)} disabled={subsUsed >= MAX_HALFTIME_SUBS || subMutation.isPending}
                >
                  Substituir
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Button className="w-full" onClick={onContinue} disabled={continuing}>
        {continuing ? "Processando…" : "Continuar para o 2º tempo"}
      </Button>
    </div>
  );
}

// Barra tática ao vivo — paradas mais rápidas que o intervalo tradicional
// (ver CHECKPOINTS), nos minutos 15/30/60/75: mentalidade, instruções
// (pressão/ritmo), grito e substituição, sem o resumo tático completo do
// HalftimePanel (esse continua só no 45'). Cada parada pode ter o seu
// próprio grito — o efeito vale pro trecho até a PRÓXIMA parada, não a
// partida inteira (ver continueLiveMatch em src/lib/live-match.ts).
function InPlayTacticsBar({
  clubId, matchDate, actualLineup, subsUsed, onSubUsed, minute, onContinue, continuing,
}: {
  clubId: string; matchDate: string; actualLineup?: MatchLineupEntry[];
  subsUsed: number; onSubUsed: () => void; minute: number;
  onContinue: (shout: ShoutId | null) => void; continuing: boolean;
}) {
  const qc = useQueryClient();
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [mentality, setMentality] = useState<Mentality | null>(null);
  const [pressing, setPressing] = useState<number | null>(null);
  const [tempo, setTempo] = useState<number | null>(null);
  const [shout, setShout] = useState<ShoutId | null>(null);

  const club = useQuery({
    queryKey: ["live-tactics-club", clubId],
    queryFn: async () => (await supabase.from("clubs").select("mentality, formation, pressing, tempo").eq("id", clubId).single()).data,
  });
  useEffect(() => {
    if (!club.data) return;
    if (mentality === null) setMentality(club.data.mentality as Mentality);
    if (pressing === null) setPressing(club.data.pressing as number);
    if (tempo === null) setTempo(club.data.tempo as number);
  }, [club.data, mentality, pressing, tempo]);

  const lineup = useQuery({
    queryKey: ["live-tactics-lineup", clubId],
    queryFn: async () => (await supabase.from("tactic_lineups").select("slot, player_id").eq("club_id", clubId)).data ?? [],
  });
  const players = useQuery({
    queryKey: ["live-tactics-players", clubId],
    queryFn: async () => (await supabase
      .from("players").select("id, name, position, injured_until, suspended_matches").eq("club_id", clubId)).data ?? [],
  });

  const mentalityMutation = useMutation({
    mutationFn: (m: Mentality) => setHalftimeMentality(clubId, m),
    onSuccess: (_r, m) => { setMentality(m); qc.invalidateQueries({ queryKey: ["live-tactics-club", clubId] }); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao mudar mentalidade"),
  });
  const instructionsMutation = useMutation({
    mutationFn: (patch: { pressing?: number; tempo?: number }) => setLiveInstructions(clubId, patch),
    onSuccess: (_r, patch) => {
      if (patch.pressing != null) setPressing(patch.pressing);
      if (patch.tempo != null) setTempo(patch.tempo);
      qc.invalidateQueries({ queryKey: ["live-tactics-club", clubId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao ajustar instruções"),
  });
  const subMutation = useMutation({
    mutationFn: (vars: { slot: string; playerId: string }) => makeHalftimeSubstitution(clubId, vars.slot, vars.playerId),
    onSuccess: () => {
      onSubUsed();
      setOpenSlot(null);
      qc.invalidateQueries({ queryKey: ["live-tactics-lineup", clubId] });
      toast.success("Substituição feita.");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha na substituição"),
  });

  if (club.isLoading || lineup.isLoading || players.isLoading) {
    return <div className="text-sm text-muted-foreground">Carregando escalação…</div>;
  }

  // Mesma ressalva do HalftimePanel: o XI que REALMENTE está em campo é
  // actualLineup (do resultado simulado), não a escalação salva crua.
  const actualLineupMap = new Map((actualLineup ?? []).map((l) => [l.slot, l.playerId]));
  const startingIds = actualLineup
    ? new Set(actualLineup.map((l) => l.playerId))
    : new Set((lineup.data ?? []).map((l) => l.player_id));
  const bench = (players.data ?? []).filter(
    (p) => !startingIds.has(p.id) && checkAvailability(p as any, matchDate).available,
  );
  const playerName = (id: string) => players.data?.find((p) => p.id === id)?.name ?? "—";
  const slotOrder = formationSlots((club.data?.formation as FormationCode) ?? "4-4-2").map((s) => s.slot);
  const orderedLineup = [...(lineup.data ?? [])].sort(
    (a, b) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot),
  );

  const step = (v: number | null, dir: 1 | -1) => Math.max(1, Math.min(5, (v ?? 3) + dir));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pausa tática · {minute}' — ajustes valem a partir daqui. Sem pressa, a partida espera.
      </p>

      <div>
        <h3 className="font-semibold text-sm mb-2">Mentalidade</h3>
        <div className="flex gap-2">
          {(Object.keys(MENTALITY_LABEL) as Mentality[]).map((m) => (
            <Button
              key={m} size="sm" variant={mentality === m ? "default" : "outline"}
              onClick={() => mentalityMutation.mutate(m)} disabled={mentalityMutation.isPending}
            >
              {MENTALITY_LABEL[m]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="font-semibold text-sm mb-2">Pressão</h3>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="px-2.5"
              onClick={() => instructionsMutation.mutate({ pressing: step(pressing, -1) })}
              disabled={instructionsMutation.isPending || (pressing ?? 3) <= 1}
            >−</Button>
            <span className="w-6 text-center font-mono text-sm">{pressing ?? 3}</span>
            <Button size="sm" variant="outline" className="px-2.5"
              onClick={() => instructionsMutation.mutate({ pressing: step(pressing, 1) })}
              disabled={instructionsMutation.isPending || (pressing ?? 3) >= 5}
            >+</Button>
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-sm mb-2">Ritmo</h3>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="px-2.5"
              onClick={() => instructionsMutation.mutate({ tempo: step(tempo, -1) })}
              disabled={instructionsMutation.isPending || (tempo ?? 3) <= 1}
            >−</Button>
            <span className="w-6 text-center font-mono text-sm">{tempo ?? 3}</span>
            <Button size="sm" variant="outline" className="px-2.5"
              onClick={() => instructionsMutation.mutate({ tempo: step(tempo, 1) })}
              disabled={instructionsMutation.isPending || (tempo ?? 3) >= 5}
            >+</Button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-1">Grito de beira de campo</h3>
        <p className="text-xs text-muted-foreground mb-2">Um recado só — vale até a próxima parada.</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {SHOUTS.map((s) => {
            const active = shout === s.id;
            return (
              <button
                key={s.id} type="button" title={s.hint}
                onClick={() => setShout(active ? null : s.id)}
                className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">Substituições ({subsUsed}/{MAX_HALFTIME_SUBS})</h3>
        <div className="space-y-1.5 max-h-52 overflow-y-auto">
          {orderedLineup.map((l) => (
            <div key={l.slot} className="flex items-center justify-between text-sm border rounded px-2 py-1.5 gap-2">
              <span className="truncate">{l.slot} · {playerName(actualLineupMap.get(l.slot) ?? l.player_id)}</span>
              {openSlot === l.slot ? (
                <select
                  className="bg-transparent border rounded px-1 py-0.5 text-xs shrink-0"
                  onChange={(e) => e.target.value && subMutation.mutate({ slot: l.slot, playerId: e.target.value })}
                  defaultValue=""
                >
                  <option value="" disabled>Escolher…</option>
                  {bench.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.position})</option>)}
                </select>
              ) : (
                <Button
                  size="sm" variant="outline" className="shrink-0"
                  onClick={() => setOpenSlot(l.slot)} disabled={subsUsed >= MAX_HALFTIME_SUBS || subMutation.isPending}
                >
                  Substituir
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Button className="w-full" onClick={() => onContinue(shout)} disabled={continuing}>
        {continuing ? "Processando…" : "Continuar assistindo"}
      </Button>
    </div>
  );
}

interface JobOfferData {
  id: string;
  offering_club_id: string;
  clubs: { id: string; name: string; reputation: number; crest_url?: string | null; primary_color?: string | null; secondary_color?: string | null } | null;
}

function JobOfferDialog({ saveId, offer, onDone }: { saveId: string; offer: JobOfferData; onDone: () => void }) {
  const [responding, setResponding] = useState(false);
  const clubName = offer.clubs?.name ?? "Outro clube";

  async function respond(action: "accept" | "decline") {
    setResponding(true);
    try {
      const res = await respondToJobOffer(offer.id, saveId, action);
      if (res.accepted) toast.success(`Você assinou com o ${clubName}!`, { duration: 6000 });
      else toast.info("Sondagem recusada.");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao responder a sondagem");
    } finally {
      setResponding(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sondagem de emprego</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          O <strong className="inline-flex items-center gap-1.5">{offer.clubs && <ClubCrest club={offer.clubs} className="w-4 h-4" />} {clubName}</strong> (reputação {offer.clubs?.reputation ?? "?"}) está de olho no seu trabalho e quer te contratar como técnico. Aceitar troca você de clube imediatamente.
        </p>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={() => respond("decline")} disabled={responding}>Recusar</Button>
          <Button onClick={() => respond("accept")} disabled={responding}>Aceitar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PressDialog({ title, question, onAnswer }: { title: string; question: PressQuestion; onAnswer: (optionId: string) => void }) {
  const [answering, setAnswering] = useState(false);
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm font-medium">"{question.text}"</p>
        <div className="flex flex-col gap-2 pt-2">
          {question.options.map((opt) => (
            <Button
              key={opt.id} variant="outline" className="justify-start h-auto py-2 text-left whitespace-normal"
              disabled={answering}
              onClick={() => { setAnswering(true); onAnswer(opt.id); }}
            >
              {opt.text}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Preleção pré-jogo — o técnico escolhe UM tom pra falar ao elenco antes do
// apito. Efeito transiente de moral só no 1º tempo (ver src/game/team-talk.ts).
// Determinístico pela situação (favorito/azarão + mando), então mostramos a
// prévia da reação de cada tom antes de escolher.
function TeamTalkDialog({
  matchId, myClubId, onConfirm,
}: { matchId: string; myClubId: string; onConfirm: (t: TeamTalkId | null) => void }) {
  const [busy, setBusy] = useState(false);

  const ctx = useQuery({
    queryKey: ["team-talk-ctx", matchId],
    queryFn: async () => {
      const { data: m } = await supabase
        .from("matches").select("home_club_id, away_club_id").eq("id", matchId).single();
      if (!m) return null;
      const isHome = m.home_club_id === myClubId;
      const oppId = isHome ? m.away_club_id : m.home_club_id;
      const [{ data: mine }, { data: opp }] = await Promise.all([
        supabase.from("clubs").select("reputation").eq("id", myClubId).single(),
        supabase.from("clubs").select("name, reputation").eq("id", oppId).single(),
      ]);
      const edge = (mine?.reputation ?? 50) - (opp?.reputation ?? 50);
      const favourite: -1 | 0 | 1 = edge >= 8 ? 1 : edge <= -8 ? -1 : 0;
      return { isHome, favourite, oppName: opp?.name ?? "adversário" };
    },
  });

  const pick = (t: TeamTalkId | null) => { setBusy(true); onConfirm(t); };
  const label = ctx.data
    ? `${ctx.data.isHome ? "Em casa" : "Fora de casa"} · ${ctx.data.favourite > 0 ? "favorito" : ctx.data.favourite < 0 ? "azarão" : "jogo equilibrado"}`
    : "";

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Preleção — vestiário</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Um recado ao elenco antes de entrar em campo{ctx.data ? ` contra o ${ctx.data.oppName}` : ""}.
          O efeito vale só para o 1º tempo. {label && <span className="font-medium text-foreground">{label}.</span>}
        </p>
        <div className="flex flex-col gap-2 pt-1">
          {TEAM_TALKS.map((tt) => {
            const preview = ctx.data ? resolveTeamTalk(tt.id, { isHome: ctx.data.isHome, favourite: ctx.data.favourite }) : null;
            return (
              <button
                key={tt.id}
                type="button"
                disabled={busy}
                onClick={() => pick(tt.id)}
                className="rounded-md border border-border px-3 py-2 text-left transition-colors hover:border-primary hover:bg-elevated/50 disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{tt.label}</span>
                  {preview && (
                    <span className={`font-mono text-xs font-semibold ${preview.moraleShift >= 0 ? "text-ok" : "text-danger"}`}>
                      {preview.moraleShift >= 0 ? "+" : ""}{preview.moraleShift} moral
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{preview ? preview.response : tt.hint}</div>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => pick(null)}
          className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
        >
          Entrar sem preleção
        </button>
      </DialogContent>
    </Dialog>
  );
}

function RedirectToSetup({ saveId }: { saveId: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/saves/$saveId/setup", params: { saveId } });
  }, [navigate, saveId]);
  return null;
}