import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney } from "@/lib/game-hooks";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { checkAvailability } from "@/game/availability";
import { positionLabel } from "@/game/types";
import { contractsAtRisk, CONTRACT_RISK_LABEL, type ContractRisk } from "@/game/contracts";
import { proposeLoanOut, recallLoan, exerciseLoanBuyOption } from "@/lib/loans";
import { loanOutProgress } from "@/game/loan-status";
import { marketTrendFromForm } from "@/game/valuation";
import { suggestNumberUpgrades, type NumberUpgradeSuggestion } from "@/game/squad-numbers";
import { SQUAD_TIER_LABELS, type SquadTier } from "@/game/squad-tiers";
import { NationalityFlag } from "@/components/nationality-flag";
import { ClubCrest } from "@/components/club-crest";
import { PlayerFace } from "@/components/player-face";
import { PageHeader, SubTabs, Pill, RatingBadge, EmptyState, type Tone } from "@/components/fm";
import { DressingRoomView } from "@/components/dressing-room-view";
import { Users, Search, RefreshCw, ArrowDownUp, Shirt } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/saves/$saveId/squad")({
  component: Squad,
});

type SortKey = "overall" | "name" | "age" | "position" | "market_value" | "wage" | "goals_season";

const POS_TONE: Record<string, Tone> = { GK: "warn", DEF: "info", MID: "ok", FWD: "danger" };

function moraleInfo(v: number): { label: string; tone: Tone } {
  if (v >= 80) return { label: "Excelente", tone: "ok" };
  if (v >= 60) return { label: "Alta", tone: "ok" };
  if (v >= 40) return { label: "Normal", tone: "neutral" };
  if (v >= 25) return { label: "Baixa", tone: "warn" };
  return { label: "Péssima", tone: "danger" };
}

function Squad() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/squad" });
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("overall");
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [tierFilter, setTierFilter] = useState<"ALL" | SquadTier>("ALL");
  const [view, setView] = useState<"list" | "room" | "contracts" | "loans">("list");

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const clubId = save.data?.my_club_id;
  const todayISO = save.data?.game_date as string | undefined;

  const players = useQuery({
    queryKey: ["players", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase.from("players").select("*").eq("club_id", clubId!)).data ?? [],
  });

  const loanedOut = useQuery({
    queryKey: ["loaned-out", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase
      .from("players").select("id, name, position, overall, club_id, loan_return_date, clubs!players_club_id_fkey(id, name, crest_url, primary_color, secondary_color)")
      .eq("loaned_from_club_id", clubId!)).data ?? [],
  });

  // Empréstimos PRA o clube do usuário (item 10 do backlog FootSim) — esses
  // jogadores já fazem parte do elenco carregado acima (players.data), com
  // forma/presença/gols reais (o motor simula tudo isso normalmente pra
  // quem está no elenco do usuário) — só falta o nome do clube de origem.
  const loanedInOriginIds = useMemo(
    () => Array.from(new Set((players.data ?? []).map((p: any) => p.loaned_from_club_id).filter(Boolean))),
    [players.data],
  );
  const loanedInOrigins = useQuery({
    queryKey: ["loaned-in-origins", loanedInOriginIds],
    enabled: loanedInOriginIds.length > 0,
    queryFn: async () => (await supabase.from("clubs").select("id, name, crest_url, primary_color, secondary_color").in("id", loanedInOriginIds)).data ?? [],
  });

  const loanOut = useMutation({
    mutationFn: (playerId: string) => proposeLoanOut(saveId, clubId!, playerId, save.data!.game_date),
    onSuccess: (res) => {
      if (res.found) toast.info("Jogador emprestado — uma proposta deve chegar em breve.");
      else toast.error("Nenhum clube demonstrou interesse por enquanto.");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });
  const recall = useMutation({
    mutationFn: (playerId: string) => recallLoan(playerId, clubId!),
    onSuccess: () => { toast.success("Jogador chamado de volta."); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });
  const buyOut = useMutation({
    mutationFn: (playerId: string) => exerciseLoanBuyOption(saveId, playerId, clubId!, save.data!.game_date),
    onSuccess: () => { toast.success("Cláusula de compra exercida — transferência definitiva."); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const all = (players.data ?? []) as any[];

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: all.length, GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of all) c[p.position] = (c[p.position] ?? 0) + 1;
    return c;
  }, [all]);

  // Lista consolidada de contratos a vencer (item 03 do backlog FootSim) —
  // em vez de só uma coluna solta na tabela geral, junta quem está dentro
  // do radar de 1 temporada, ordenado por urgência, com nível de risco.
  const atRiskContracts = useMemo(
    () => (todayISO ? contractsAtRisk(all, todayISO) : []),
    [all, todayISO],
  );

  const loanedIn = useMemo(() => all.filter((p) => p.loaned_from_club_id), [all]);
  const loanTotal = loanedIn.length + (loanedOut.data?.length ?? 0);

  // Numeração dinâmica (item 11 do backlog FootSim) — recalculado do elenco
  // atual sempre que ele muda, cobre qualquer forma de saída (transferência,
  // liberação, aposentadoria) sem precisar de gatilho específico.
  const numberSuggestions = useMemo(() => suggestNumberUpgrades(all), [all]);
  const applyNumber = useMutation({
    mutationFn: async (s: NumberUpgradeSuggestion) => {
      const { error } = await supabase.from("players").update({ squad_number: s.suggestedNumber }).eq("id", s.playerId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: any) => toast.error(e.message ?? "Falha ao trocar número"),
  });

  // Equipes B / elenco reserva (item 15 do backlog FootSim) — contagem pro
  // badge do filtro + mutation de mover jogador entre os dois tiers, sempre
  // por escolha do técnico (nunca automática).
  const bTeamCount = useMemo(() => all.filter((p) => p.squad_tier === "b_team").length, [all]);
  const setTier = useMutation({
    mutationFn: async ({ playerId, tier }: { playerId: string; tier: SquadTier }) => {
      const { error } = await supabase.from("players").update({ squad_tier: tier } as any).eq("id", playerId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["players", clubId] }),
    onError: (e: any) => toast.error(e.message ?? "Falha ao mover jogador"),
  });

  const filtered = useMemo(() => {
    let list = [...all];
    if (posFilter !== "ALL") list = list.filter((p) => p.position === posFilter);
    if (tierFilter !== "ALL") list = list.filter((p) => (p.squad_tier ?? "first_team") === tierFilter);
    if (filter) {
      const f = filter.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(f) || (p.nationality ?? "").toLowerCase().includes(f));
    }
    list.sort((a: any, b: any) => {
      const av = a[sort]; const bv = b[sort];
      if (typeof av === "number") return bv - av;
      return String(av).localeCompare(String(bv));
    });
    return list;
  }, [all, filter, sort, posFilter, tierFilter]);

  const COLS: { key: SortKey; label: string; align?: "right" }[] = [
    { key: "name", label: "Jogador" },
    { key: "position", label: "Pos" },
    { key: "age", label: "Idade" },
    { key: "overall", label: "OVR" },
    { key: "goals_season", label: "Gols" },
    { key: "market_value", label: "Valor", align: "right" },
    { key: "wage", label: "Salário", align: "right" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Users}
        title="Elenco"
        subtitle={`${counts.ALL} jogadores · ${counts.GK} GK · ${counts.DEF} DEF · ${counts.MID} MID · ${counts.FWD} FWD${bTeamCount ? ` · ${bTeamCount} na Equipe B` : ""}`}
        actions={
          view === "list" ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-9 w-40 pl-8 sm:w-52"
              />
            </div>
          ) : undefined
        }
      />

      <SubTabs
        value={view}
        onValueChange={setView}
        tabs={[
          { value: "list", label: "Lista de atletas" },
          { value: "contracts", label: "Contratos a vencer", badge: atRiskContracts.length || undefined },
          { value: "loans", label: "Empréstimos", badge: loanTotal || undefined },
          { value: "room", label: "Dinâmica do vestiário" },
        ]}
      />

      {view === "room" ? (
        clubId && todayISO
          ? <DressingRoomView saveId={saveId} clubId={clubId} gameDate={todayISO} />
          : <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : view === "contracts" ? (
        <ContractsAtRiskList saveId={saveId} players={atRiskContracts} />
      ) : view === "loans" ? (
        <LoansView
          saveId={saveId}
          loanedIn={loanedIn}
          loanedInOrigins={loanedInOrigins.data ?? []}
          loanedOut={loanedOut.data ?? []}
          todayISO={todayISO}
          onRecall={(id) => recall.mutate(id)}
          recallPending={recall.isPending}
        />
      ) : (
      <>
      {numberSuggestions.length > 0 && (
        <Card className="border-info/30 bg-info/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Shirt className="size-4 text-info" />
            <span className="text-sm font-semibold">Números melhores disponíveis</span>
          </div>
          <div className="space-y-1.5">
            {numberSuggestions.map((s) => {
              const p = all.find((x) => x.id === s.playerId);
              return (
                <div key={s.playerId} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-medium">{p?.name ?? "?"}</span>{" "}
                    <span className="text-muted-foreground">#{s.currentNumber} → #{s.suggestedNumber}</span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => applyNumber.mutate(s)} disabled={applyNumber.isPending}>
                    Trocar
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <SubTabs
        value={posFilter}
        onValueChange={setPosFilter}
        tabs={[
          { value: "ALL", label: "Todos", badge: counts.ALL },
          { value: "GK", label: "Goleiros", badge: counts.GK },
          { value: "DEF", label: "Defesa", badge: counts.DEF },
          { value: "MID", label: "Meio", badge: counts.MID },
          { value: "FWD", label: "Ataque", badge: counts.FWD },
        ]}
      />
      <SubTabs
        value={tierFilter}
        onValueChange={setTierFilter as (v: string) => void}
        tabs={[
          { value: "ALL", label: "Elenco inteiro" },
          { value: "first_team", label: "Elenco principal", badge: all.length - bTeamCount },
          { value: "b_team", label: "Equipe B", badge: bTeamCount || undefined },
        ]}
      />

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm [font-variant-numeric:tabular-nums]">
            <thead>
              <tr className="border-b bg-elevated/60 text-left fm-eyebrow">
                <th className="w-9 px-2 py-2.5 text-center font-semibold">#</th>
                <th className="px-3 py-2.5 font-semibold">Estado</th>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => setSort(c.key)}
                    className={`cursor-pointer select-none px-3 py-2.5 font-semibold hover:text-foreground ${c.align === "right" ? "text-right" : ""}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {sort === c.key && <ArrowDownUp className="size-3 text-primary" />}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 font-semibold">Cond.</th>
                <th className="px-3 py-2.5 font-semibold">Moral</th>
                <th className="px-3 py-2.5 font-semibold">Contrato</th>
                <th className="px-3 py-2.5 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const avail = todayISO ? checkAvailability(p as any, todayISO) : { available: true };
                const mor = moraleInfo(p.morale ?? 70);
                return (
                  <tr key={p.id} className={`border-b border-border/50 transition-colors hover:bg-elevated/50 ${!avail.available ? "opacity-70" : ""}`}>
                    <td className="px-2 py-2 text-center font-mono text-xs text-muted-foreground">{p.squad_number ?? "–"}</td>
                    <td className="px-3 py-2">
                      {avail.available ? (
                        <Pill tone="ok">Disponível</Pill>
                      ) : (
                        <Pill tone={(avail as any).reason === "injured" ? "danger" : "warn"}>
                          {(avail as any).reason === "injured" ? "Lesionado" : (avail as any).reason === "doubtful" ? "Dúvida" : "Suspenso"}
                        </Pill>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to="/saves/$saveId/players/$playerId"
                        params={{ saveId, playerId: p.id }}
                        className="font-medium hover:text-primary hover:underline inline-flex items-center gap-2"
                      >
                        <PlayerFace player={p} className="w-7 h-7 shrink-0" />
                        {p.name}
                      </Link>
                      {p.loaned_from_club_id && (
                        <RefreshCw
                          className="ml-1.5 inline size-3 text-info"
                          aria-label="emprestado"
                        />
                      )}
                      {p.nationality && (
                        <div className="text-[11px] text-muted-foreground">
                          <NationalityFlag nationality={p.nationality} /> {p.nationality}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Pill tone={POS_TONE[p.position] ?? "neutral"}>{positionLabel(p.natural_position ?? p.position)}</Pill>
                      {p.squad_tier === "b_team" && (
                        <Pill tone="neutral" className="ml-1" title="Treina com bônus de velocidade (minutos regulares na Equipe B)">
                          Equipe B
                        </Pill>
                      )}
                      {p.secondary_positions?.length > 0 && (
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          {p.secondary_positions.map(positionLabel).join(" ")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{p.age}</td>
                    <td className="px-3 py-2"><RatingBadge value={p.overall} /></td>
                    <td className="px-3 py-2 text-muted-foreground">{p.goals_season ?? 0}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{formatMoney(p.market_value)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{formatMoney(p.wage)}</td>
                    <td className="px-3 py-2"><MiniBar v={p.condition ?? 100} /></td>
                    <td className="px-3 py-2"><Pill tone={mor.tone}>{mor.label}</Pill></td>
                    <td className="px-3 py-2"><ContractBadge contractUntil={p.contract_until} today={todayISO} /></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {p.loan_buy_option != null ? (
                          <Button size="sm" variant="outline" onClick={() => buyOut.mutate(p.id)} disabled={buyOut.isPending}>
                            Comprar ({formatMoney(p.loan_buy_option)})
                          </Button>
                        ) : !p.loaned_from_club_id ? (
                          <Button size="sm" variant="outline" onClick={() => loanOut.mutate(p.id)} disabled={loanOut.isPending}>
                            Emprestar
                          </Button>
                        ) : null}
                        <Button
                          size="sm" variant="ghost"
                          title={p.squad_tier === "b_team" ? "Promover pro elenco principal" : "Mover pra Equipe B — minutos regulares, treina com bônus de velocidade"}
                          onClick={() => setTier.mutate({ playerId: p.id, tier: p.squad_tier === "b_team" ? "first_team" : "b_team" })}
                          disabled={setTier.isPending}
                        >
                          {p.squad_tier === "b_team" ? "↑ Principal" : "↓ Equipe B"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState
            icon={Search}
            title="Nenhum jogador encontrado"
            description={filter || posFilter !== "ALL" ? "Ajuste a busca ou o filtro de posição." : undefined}
          />
        )}
      </Card>
      </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Empréstimos (item 10 do backlog FootSim) — duas listas, escopo deliberadamente
// assimétrico: "emprestados por você" (OUT, pro time de um clube de IA) só tem
// progresso de prazo real (o motor não simula minutos/forma de clube de IA);
// "emprestados pra você" (IN) já fazem parte do elenco simulado normalmente,
// então mostram forma/presença/gols de verdade — nunca uma "felicidade"
// inventada sem dado real por trás. Ver src/game/loan-status.ts.
// -----------------------------------------------------------------------------
function LoansView({
  saveId, loanedIn, loanedInOrigins, loanedOut, todayISO, onRecall, recallPending,
}: {
  saveId: string; loanedIn: any[]; loanedInOrigins: any[]; loanedOut: any[]; todayISO?: string;
  onRecall: (playerId: string) => void; recallPending: boolean;
}) {
  const originClub = (clubId: string | null) => loanedInOrigins.find((c) => c.id === clubId);

  if (loanedIn.length === 0 && loanedOut.length === 0) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="Nenhum empréstimo ativo"
        description="Jogadores emprestados por você ou pra você aparecem aqui, com situação real do empréstimo."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="fm-eyebrow mb-3">Emprestados pra você ({loanedIn.length})</div>
        {loanedIn.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum jogador emprestado por outro clube no momento.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {loanedIn.map((p) => {
              const trend = marketTrendFromForm(p.form);
              return (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <Link to="/saves/$saveId/players/$playerId" params={{ saveId, playerId: p.id }} className="font-medium hover:text-primary hover:underline">
                      {p.name}
                    </Link>{" "}
                    <span className="text-muted-foreground inline-flex items-center gap-1">{positionLabel(p.natural_position ?? p.position)} · de {originClub(p.loaned_from_club_id) && <ClubCrest club={originClub(p.loaned_from_club_id)} className="w-3.5 h-3.5" />} {originClub(p.loaned_from_club_id)?.name ?? "?"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{p.appearances_season ?? 0} jogos</span>
                    <span>{p.goals_season ?? 0} gols</span>
                    {trend !== "stable" && (
                      <Pill tone={trend === "rising" ? "ok" : "danger"}>
                        {trend === "rising" ? "↑ em forma" : "↓ fora de forma"}
                      </Pill>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="fm-eyebrow mb-3">Emprestados por você ({loanedOut.length})</div>
        {loanedOut.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum jogador seu emprestado no momento.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {loanedOut.map((p) => {
              const progress = todayISO && p.loan_return_date ? loanOutProgress(p.loan_return_date, todayISO) : null;
              return (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-[160px]">
                    <span className="font-medium">{p.name}</span>{" "}
                    <span className="text-muted-foreground inline-flex items-center gap-1">{positionLabel(p.position)} · OVR {p.overall} · com {p.clubs && <ClubCrest club={p.clubs} className="w-3.5 h-3.5" />} {p.clubs?.name ?? "?"}</span>
                  </div>
                  {progress && (
                    <div className="flex min-w-[160px] items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-info" style={{ width: `${progress.progressPct}%` }} />
                      </div>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {progress.daysRemaining === 0 ? "volta a qualquer momento" : `volta em ${progress.daysRemaining}d`}
                      </span>
                    </div>
                  )}
                  <Button size="sm" variant="outline" onClick={() => onRecall(p.id)} disabled={recallPending}>
                    Chamar de volta
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <p className="fm-eyebrow mt-3">
          Sem forma/presença aqui de propósito: o motor não simula estatística individual de clube de IA — só sabemos o prazo real do empréstimo.
        </p>
      </Card>
    </div>
  );
}

function ContractBadge({ contractUntil, today }: { contractUntil: string | null; today?: string }) {
  if (!contractUntil || !today) return <span className="text-xs text-muted-foreground">—</span>;
  const days = Math.round((new Date(contractUntil + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86_400_000);
  const tone = days <= 60 ? "text-danger" : days <= 180 ? "text-warn" : "text-muted-foreground";
  return <span className={`font-mono text-xs font-medium ${tone}`}>{days <= 0 ? "Vencido" : `${days}d`}</span>;
}

const RISK_TONE: Record<ContractRisk, Tone> = { critico: "danger", atencao: "warn" };

function ContractsAtRiskList({ saveId, players }: { saveId: string; players: any[] }) {
  if (players.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Nenhum contrato vencendo em breve"
        description="Jogadores com contrato terminando dentro de 1 temporada aparecem aqui, do mais urgente pro menos urgente."
      />
    );
  }
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm [font-variant-numeric:tabular-nums]">
          <thead>
            <tr className="border-b bg-elevated/60 text-left fm-eyebrow">
              <th className="px-3 py-2.5 font-semibold">Jogador</th>
              <th className="px-3 py-2.5 font-semibold">Pos</th>
              <th className="px-3 py-2.5 font-semibold">OVR</th>
              <th className="px-3 py-2.5 font-semibold">Risco</th>
              <th className="px-3 py-2.5 font-semibold">Vence em</th>
              <th className="px-3 py-2.5 text-right font-semibold">Salário</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className="border-b border-border/50 transition-colors hover:bg-elevated/50">
                <td className="px-3 py-2">
                  <Link
                    to="/saves/$saveId/players/$playerId"
                    params={{ saveId, playerId: p.id }}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Pill tone={POS_TONE[p.position] ?? "neutral"}>{positionLabel(p.natural_position ?? p.position)}</Pill>
                </td>
                <td className="px-3 py-2"><RatingBadge value={p.overall} /></td>
                <td className="px-3 py-2">
                  {p.risk ? <Pill tone={RISK_TONE[p.risk as ContractRisk]}>{CONTRACT_RISK_LABEL[p.risk as ContractRisk]}</Pill> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.daysRemaining}d</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{formatMoney(p.wage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MiniBar({ v }: { v: number }) {
  const pct = Math.max(0, Math.min(100, v));
  const color = pct >= 75 ? "bg-ok" : pct >= 50 ? "bg-warn" : pct >= 25 ? "bg-warn" : "bg-danger";
  return (
    <div className="flex min-w-[72px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right font-mono text-[11px] text-muted-foreground">{pct}</span>
    </div>
  );
}
