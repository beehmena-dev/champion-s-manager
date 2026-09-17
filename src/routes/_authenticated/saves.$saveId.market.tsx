import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ClubCrest } from "@/components/club-crest";
import { PlayerFace } from "@/components/player-face";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/game-hooks";
import { makeOutgoingOffer, respondToOffer, signFreeAgent, type DealType } from "@/lib/transfer-offers";
import { startScouting, cancelScouting } from "@/lib/scouting";
import { effectiveKnowledge, fuzzRange, tierFor, maxConcurrentScouting } from "@/game/scouting";
import { initialBidFee, loanReferenceValue } from "@/game/transfer-negotiation";
import { isTransferWindowOpen, currentWindowLabel, daysUntilNextWindow } from "@/game/transfer-window";
import { dismissTransferRequest, listTransferRequest } from "@/lib/transfer-requests";
import { recommendSignings } from "@/game/scout-recommendations";
import { NationalityFlag } from "@/components/nationality-flag";
import { PageHeader, EmptyState } from "@/components/fm";
import { ArrowLeftRight, Search, AlertTriangle, UserPlus, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/saves/$saveId/market")({
  component: Market,
});

function Market() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/market" });
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [minOvr, setMinOvr] = useState(60);
  const [fees, setFees] = useState<Record<string, number>>({});
  const [counterFees, setCounterFees] = useState<Record<string, number>>({});
  const [dealTypes, setDealTypes] = useState<Record<string, DealType>>({});
  const [buyOptions, setBuyOptions] = useState<Record<string, number>>({});
  const [faWages, setFaWages] = useState<Record<string, number>>({});

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const myClubId = save.data?.my_club_id;
  const today = save.data?.game_date;

  const club = useQuery({
    queryKey: ["club", myClubId],
    enabled: !!myClubId,
    // select completo (com o join de competitions), mesma chave ["club", clubId]
    // compartilhada com o layout raiz — ver Fase 0.2 do plano.
    queryFn: async () => (await supabase.from("clubs").select("*, competitions!clubs_competition_id_fkey(name)").eq("id", myClubId!).single()).data,
  });

  const chiefScout = useQuery({
    queryKey: ["staff-chief-scout", myClubId],
    enabled: !!myClubId,
    queryFn: async () => (await supabase.from("staff").select("skill").eq("club_id", myClubId!).eq("role", "chief_scout").maybeSingle()).data,
  });
  const scoutingCap = maxConcurrentScouting(chiefScout.data?.skill ?? 0);

  // Assistente técnico: elenco (só posição/overall, pra achar o ponto mais
  // fraco) e um pool amplo de candidatos independente do filtro da tabela
  // abaixo — ver src/game/scout-recommendations.ts.
  const myRoster = useQuery({
    queryKey: ["squad-positions", myClubId],
    enabled: !!myClubId,
    queryFn: async () => (await supabase.from("players").select("position, overall").eq("club_id", myClubId!)).data ?? [],
  });
  const scoutPool = useQuery({
    queryKey: ["scout-pool", saveId, myClubId],
    enabled: !!myClubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, name, position, overall, market_value, nationality, clubs!players_club_id_fkey(id, name, primary_color, secondary_color, crest_url)")
        .eq("save_id", saveId).neq("club_id", myClubId!)
        .order("overall", { ascending: false }).limit(80);
      if (error) throw error;
      // as any[]: nationality ainda não está em types.ts (convenção do
      // projeto até regenerar esse arquivo — ver CLAUDE.md).
      return (data ?? []) as any[];
    },
  });
  const recommendations = useMemo(
    () => recommendSignings(myRoster.data ?? [], scoutPool.data ?? []),
    [myRoster.data, scoutPool.data],
  );

  const players = useQuery({
    queryKey: ["market", saveId, minOvr, q],
    enabled: !!myClubId,
    queryFn: async () => {
      let query = supabase
        .from("players")
        .select("id, name, age, position, overall, market_value, wage, club_id, scout_knowledge, nationality, face_url, clubs!players_club_id_fkey(id, name, short_name, reputation, primary_color, secondary_color, crest_url)")
        .eq("save_id", saveId)
        .neq("club_id", myClubId!)
        // Agente livre (club_id null) tem seção própria mais abaixo — sem
        // janela, sem taxa, sem negociação de ida-e-volta (ver signFreeAgent).
        // Explícito em vez de contar com o .neq() acima já excluir NULL por
        // três-valores do SQL, pra deixar a intenção clara no código.
        .not("club_id", "is", null)
        .gte("overall", minOvr)
        .order("overall", { ascending: false })
        .limit(60);
      if (q) query = query.or(`name.ilike.%${q}%,nationality.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Agentes livres — item 04 do backlog FootSim: disponíveis a qualquer
  // momento, sem depender da janela de transferência (ver signFreeAgent em
  // src/lib/transfer-offers.ts, que nunca checa isTransferWindowOpen).
  const freeAgents = useQuery({
    queryKey: ["free-agents", saveId, q],
    enabled: !!myClubId,
    queryFn: async () => {
      let query = supabase
        .from("players")
        .select("id, name, age, position, overall, wage, attributes, nationality, face_url")
        .eq("save_id", saveId)
        .is("club_id", null)
        .order("overall", { ascending: false })
        .limit(30);
      if (q) query = query.or(`name.ilike.%${q}%,nationality.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const signFA = useMutation({
    mutationFn: async (player: any) => {
      const wage = faWages[player.id] ?? Math.round((player.wage || player.overall * 400) * 1.05);
      return { player, wage, result: await signFreeAgent(saveId, myClubId!, player, wage, today!) };
    },
    onSuccess: ({ player, result }) => {
      if (result.accepted) toast.success(`${player.name} assinou por ${formatMoney(result.wage)}/quinzena.`);
      else toast.error(`${player.name} achou o salário baixo — tente um valor maior.`);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  // Negociações pendentes envolvendo o meu clube (dos dois lados).
  const offers = useQuery({
    queryKey: ["transfer-offers", saveId, myClubId],
    enabled: !!myClubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_offers")
        .select(
          "*, players(name, market_value), seller:clubs!transfer_offers_seller_club_id_fkey(id, name, crest_url, primary_color, secondary_color), buyer:clubs!transfer_offers_buyer_club_id_fkey(id, name, crest_url, primary_color, secondary_color)",
        )
        .eq("save_id", saveId)
        .eq("status", "pending")
        .or(`seller_club_id.eq.${myClubId},buyer_club_id.eq.${myClubId}`)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const scouting = useQuery({
    queryKey: ["scouting-assignments", myClubId],
    enabled: !!myClubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scouting_assignments")
        .select("*, players(name, scout_knowledge, overall)")
        .eq("club_id", myClubId!).eq("status", "active");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const scoutedPlayerIds = useMemo(() => new Set((scouting.data ?? []).map((a) => a.player_id)), [scouting.data]);

  // Pedidos de saída de jogadores insatisfeitos (ver src/lib/transfer-requests.ts).
  const requests = useQuery({
    queryKey: ["transfer-requests", myClubId],
    enabled: !!myClubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_requests")
        .select("*, players(name, overall)")
        .eq("club_id", myClubId!).eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const REASON_LABEL: Record<string, string> = {
    low_morale: "moral baixa", contract_ending: "contrato perto do fim",
    broken_starter_promise: "promessa de titularidade quebrada",
  };

  const listRequest = useMutation({
    mutationFn: (requestId: string) => listTransferRequest(requestId, saveId, myClubId!, today!),
    onSuccess: (res) => {
      if (res.found) toast.info("Jogador colocado na lista — uma proposta de compra deve chegar em breve.");
      else toast.error("Nenhum clube demonstrou interesse por enquanto.");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });
  const dismissRequest = useMutation({
    mutationFn: (vars: { requestId: string; playerId: string }) => dismissTransferRequest(vars.requestId, vars.playerId),
    onSuccess: () => { toast.success("Você conversou com o jogador — moral recuperada."); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const scout = useMutation({
    mutationFn: (playerId: string) => startScouting(saveId, myClubId!, playerId, today!),
    onSuccess: () => { toast.success("Olheiro escalado."); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });
  const unscout = useMutation({
    mutationFn: (assignmentId: string) => cancelScouting(assignmentId),
    onSuccess: () => { toast.info("Observação encerrada."); qc.invalidateQueries(); },
  });

  const incoming = useMemo(() => (offers.data ?? []).filter((o) => o.seller_club_id === myClubId), [offers.data, myClubId]);
  const outgoing = useMemo(() => (offers.data ?? []).filter((o) => o.buyer_club_id === myClubId), [offers.data, myClubId]);
  const negotiatingPlayerIds = useMemo(() => new Set((offers.data ?? []).map((o) => o.player_id)), [offers.data]);

  const propose = useMutation({
    mutationFn: async (player: any) => {
      const dealType = dealTypes[player.id] ?? "permanent";
      const baseFee = dealType === "loan" ? loanReferenceValue(player.market_value) : player.market_value;
      // Referência escalada pela diferença de reputação entre os clubes —
      // antes era um +10% fixo, que não batia com o que evaluateAsSeller()
      // realmente aceita (o vendedor pode exigir até 1.25x se for mais
      // reputado, ou topar bem menos se o comprador for maior).
      const defaultFee = initialBidFee(baseFee, club.data?.reputation ?? 50, player.clubs?.reputation ?? 50, () => 0.5);
      const fee = fees[player.id] ?? defaultFee;
      const buyOption = dealType === "loan" && buyOptions[player.id] ? buyOptions[player.id] : null;
      return { player, dealType, result: await makeOutgoingOffer(saveId, myClubId!, player, fee, today!, dealType, buyOption) };
    },
    onSuccess: ({ player, dealType, result }) => {
      const dealLabel = dealType === "loan" ? "emprestado" : "contratado";
      if (result.status === "completed") toast.success(`${player.name} ${dealLabel} por ${formatMoney(result.fee)}`);
      else if (result.status === "pending") toast.info(`${player.clubs?.name} contrapropôs ${formatMoney(result.fee)}`);
      else toast.error(`${player.clubs?.name} recusou a proposta.`);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const respond = useMutation({
    mutationFn: async (vars: { offerId: string; action: "accept" | "counter" | "decline"; counterFee?: number }) =>
      respondToOffer(vars.offerId, vars.action, myClubId!, today!, vars.counterFee),
    onSuccess: (result) => {
      if (result.status === "completed") toast.success(`Negócio fechado por ${formatMoney(result.fee)}`);
      else if (result.status === "pending") toast.info(`Nova contraproposta: ${formatMoney(result.fee)}`);
      else toast.error("Negociação encerrada sem acordo.");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const list = useMemo(() => players.data ?? [], [players.data]);
  const windowOpen = today ? isTransferWindowOpen(today) : true;
  const windowLabel = today ? currentWindowLabel(today) : null;
  const daysToWindow = today ? daysUntilNextWindow(today) : 0;

  return (
    <div className="space-y-4">
      <PageHeader icon={ArrowLeftRight} title="Mercado & olheiros" subtitle="Propostas, negociações, scouting e busca de reforços." />

      {!windowOpen && (
        <Card className="flex flex-wrap items-center gap-3 border-warn/40 bg-warn/5 p-4">
          <AlertTriangle className="size-5 shrink-0 text-warn" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-semibold">Janela de transferências fechada</div>
            <p className="text-xs text-muted-foreground">
              Só dá pra negociar com outro clube na janela de verão (jun-ago) ou de inverno (janeiro) — reabre em {daysToWindow} dia{daysToWindow === 1 ? "" : "s"}.
              Agentes livres continuam disponíveis a qualquer momento, sem taxa e sem espera — ver abaixo.
            </p>
          </div>
        </Card>
      )}
      {windowOpen && windowLabel && (
        <Card className="flex items-center gap-2 border-ok/40 bg-ok/5 p-3">
          <CheckCircle2 className="size-4 shrink-0 text-ok" />
          <span className="text-xs font-medium text-ok">{windowLabel} aberta — negociações com outros clubes liberadas.</span>
        </Card>
      )}

      {incoming.length > 0 && (
        <Card className="p-4">
          <div className="fm-eyebrow mb-3">Propostas recebidas</div>
          <div className="space-y-2">
            {incoming.map((o) => (
              <OfferRow
                key={o.id}
                label={<span className="inline-flex items-center gap-1">{o.buyer && <ClubCrest club={o.buyer} className="w-3.5 h-3.5" />} {o.buyer?.name ?? "Clube"} quer {o.deal_type === "loan" ? "pegar emprestado" : "comprar"} {o.players?.name ?? "jogador"}</span>}
                fee={o.current_fee}
                expires={o.expires_date}
                counterValue={counterFees[o.id] ?? o.current_fee}
                onCounterChange={(v) => setCounterFees((s) => ({ ...s, [o.id]: v }))}
                onAccept={() => respond.mutate({ offerId: o.id, action: "accept" })}
                onDecline={() => respond.mutate({ offerId: o.id, action: "decline" })}
                onCounter={() => respond.mutate({ offerId: o.id, action: "counter", counterFee: counterFees[o.id] ?? o.current_fee })}
                pending={respond.isPending}
              />
            ))}
          </div>
        </Card>
      )}

      {outgoing.length > 0 && (
        <Card className="p-4">
          <div className="fm-eyebrow mb-3">Suas negociações em andamento</div>
          <div className="space-y-2">
            {outgoing.map((o) => (
              <OfferRow
                key={o.id}
                label={<span className="inline-flex items-center gap-1">{o.players?.name ?? "Jogador"}{o.deal_type === "loan" ? " (empréstimo)" : ""} — contraproposta de {o.seller && <ClubCrest club={o.seller} className="w-3.5 h-3.5" />} {o.seller?.name ?? "clube"}</span>}
                fee={o.current_fee}
                expires={o.expires_date}
                counterValue={counterFees[o.id] ?? o.current_fee}
                onCounterChange={(v) => setCounterFees((s) => ({ ...s, [o.id]: v }))}
                onAccept={() => respond.mutate({ offerId: o.id, action: "accept" })}
                onDecline={() => respond.mutate({ offerId: o.id, action: "decline" })}
                onCounter={() => respond.mutate({ offerId: o.id, action: "counter", counterFee: counterFees[o.id] ?? o.current_fee })}
                pending={respond.isPending}
                acceptLabel="Aceitar"
                declineLabel="Desistir"
                counterLabel="Subir oferta"
              />
            ))}
          </div>
        </Card>
      )}

      {(requests.data?.length ?? 0) > 0 && (
        <Card className="p-4">
          <div className="fm-eyebrow mb-3">Pedidos de saída</div>
          <div className="space-y-2">
            {requests.data!.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 border rounded-md p-2">
                <div className="flex-1 min-w-[220px] text-sm">
                  <span className="font-medium">{r.players?.name ?? "Jogador"}</span> quer sair do clube
                  <span className="text-xs text-muted-foreground"> · {REASON_LABEL[r.reason] ?? r.reason}</span>
                </div>
                <Button
                  size="sm" variant="outline"
                  onClick={() => dismissRequest.mutate({ requestId: r.id, playerId: r.player_id })}
                  disabled={dismissRequest.isPending || listRequest.isPending}
                >
                  Pedir pra ficar
                </Button>
                <Button
                  size="sm" variant="destructive"
                  onClick={() => listRequest.mutate(r.id)}
                  disabled={dismissRequest.isPending || listRequest.isPending}
                >
                  Colocar na lista
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(scouting.data?.length ?? 0) > 0 && (
        <Card className="p-4">
          <div className="fm-eyebrow mb-3">Central de scouting ({scouting.data!.length}/{scoutingCap})</div>
          <div className="space-y-2">
            {scouting.data!.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border rounded-md p-2">
                <div className="flex-1 min-w-[160px] text-sm font-medium">{a.players?.name}</div>
                <div className="flex-1 h-2 bg-muted rounded overflow-hidden max-w-[160px]">
                  <div className="h-full bg-primary" style={{ width: `${a.players?.scout_knowledge ?? 0}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-10 text-right">{a.players?.scout_knowledge ?? 0}%</span>
                <Button size="sm" variant="outline" onClick={() => unscout.mutate(a.id)} disabled={unscout.isPending}>
                  Encerrar
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {recommendations.length > 0 && (
        <Card className="p-4">
          <div className="fm-eyebrow mb-3">Assistente técnico — sugestões de reforço</div>
          <p className="text-xs text-muted-foreground mb-3">Pontos mais fracos do elenco, com um upgrade real disponível no mercado.</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {recommendations.map((c: any) => (
              <Link
                key={c.id}
                to="/saves/$saveId/players/$playerId"
                params={{ saveId, playerId: c.id }}
                className="border rounded-md p-2 text-sm hover:bg-muted/50"
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.position} · OVR {c.overall} · {c.clubs && <ClubCrest club={c.clubs} className="w-3.5 h-3.5" />} {c.clubs?.name}
                  {c.nationality && <> · <NationalityFlag nationality={c.nationality} /> {c.nationality}</>}
                </div>
                <div className="text-xs text-muted-foreground">{formatMoney(c.market_value)}</div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-1 flex items-center gap-2 fm-eyebrow">
          <UserPlus className="size-3.5" /> Agentes livres
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Sem clube, sem taxa de transferência, sem janela — proponha um salário e o empresário aceita ou recusa na hora.
        </p>
        {freeAgents.data && freeAgents.data.length > 0 ? (
          <div className="space-y-2">
            {freeAgents.data.map((p: any) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 border rounded-md p-2">
                <div className="min-w-[180px] flex-1 text-sm">
                  <Link to="/saves/$saveId/players/$playerId" params={{ saveId, playerId: p.id }} className="font-medium hover:underline inline-flex items-center gap-1.5">
                    <PlayerFace player={p} className="w-6 h-6 shrink-0" /> {p.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {p.position} · OVR {p.overall} · {p.age} anos
                    {p.nationality && <> · <NationalityFlag nationality={p.nationality} /> {p.nationality}</>}
                  </span>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Salário/quinzena
                  <input
                    type="number"
                    className="w-28 rounded border bg-transparent px-2 py-1 text-right text-sm text-foreground"
                    value={faWages[p.id] ?? Math.round((p.wage || p.overall * 400) * 1.05)}
                    onChange={(e) => setFaWages((s) => ({ ...s, [p.id]: Number(e.target.value) }))}
                  />
                </label>
                <Button size="sm" onClick={() => signFA.mutate(p)} disabled={signFA.isPending}>
                  Contratar
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum agente livre disponível agora.</p>
        )}
      </Card>

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <Input placeholder="Buscar jogador…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <label className="text-sm flex items-center gap-2">
          Overall mínimo
          <input
            type="range" min={0} max={99} value={minOvr}
            onChange={(e) => setMinOvr(Number(e.target.value))}
          />
          <span className="w-8 text-right">{minOvr}</span>
        </label>
        <div className="ml-auto text-sm text-muted-foreground">
          Verba de transferências: <span className="font-semibold text-foreground">{formatMoney(club.data?.transfer_budget ?? 0)}</span>
        </div>
      </Card>

      <div className="border rounded-md overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-elevated/60 fm-eyebrow">
            <tr>
              <th className="text-left px-3 py-2">Nome</th>
              <th className="px-3 py-2">Pos</th>
              <th className="px-3 py-2">Idade</th>
              <th className="px-3 py-2">OVR</th>
              <th className="text-left px-3 py-2">Clube</th>
              <th className="px-3 py-2">Valor</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Sua proposta</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p: any) => {
              const negotiating = negotiatingPlayerIds.has(p.id);
              const knowledge = effectiveKnowledge(p.scout_knowledge ?? 0, p.clubs?.reputation ?? 50, p.overall);
              const tier = tierFor(knowledge);
              const [ovrLo, ovrHi] = fuzzRange(p.overall, tier.overallSpread, `${p.id}-overall`);
              const dealType = dealTypes[p.id] ?? "permanent";
              const referenceValue = tier.showValue ? p.market_value : p.overall * 5000;
              const baseFee = dealType === "loan" ? loanReferenceValue(referenceValue) : referenceValue;
              const defaultFee = initialBidFee(baseFee, club.data?.reputation ?? 50, p.clubs?.reputation ?? 50, () => 0.5);
              const fee = fees[p.id] ?? defaultFee;
              const beingScouted = scoutedPlayerIds.has(p.id);
              return (
                <tr key={p.id} className="border-b border-border/50 hover:bg-elevated/50">
                  <td className="px-3 py-2 font-medium">
                    <Link to="/saves/$saveId/players/$playerId" params={{ saveId, playerId: p.id }} className="hover:underline inline-flex items-center gap-1.5">
                      <PlayerFace player={p} className="w-6 h-6 shrink-0" />
                      <NationalityFlag nationality={p.nationality} /> {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-center">{p.position}</td>
                  <td className="px-3 py-2 text-center">{p.age}</td>
                  <td className="px-3 py-2 text-center font-semibold">{ovrLo === ovrHi ? ovrLo : `${ovrLo}-${ovrHi}`}</td>
                  <td className="px-3 py-2">
                    {p.club_id ? (
                      <Link to="/saves/$saveId/clubs/$clubId" params={{ saveId, clubId: p.club_id }} className="hover:text-primary hover:underline inline-flex items-center gap-1.5">
                        {p.clubs && <ClubCrest club={p.clubs} className="w-4 h-4" />} {p.clubs?.name}
                      </Link>
                    ) : p.clubs?.name}
                  </td>
                  <td className="px-3 py-2 text-right">{tier.showValue ? formatMoney(p.market_value) : "?"}</td>
                  <td className="px-3 py-2 text-center">
                    <select
                      className="bg-transparent border rounded px-1 py-1 text-xs"
                      value={dealType} disabled={negotiating}
                      onChange={(e) => {
                        const v = e.target.value as DealType;
                        setDealTypes((s) => ({ ...s, [p.id]: v }));
                        setFees((s) => { const n = { ...s }; delete n[p.id]; return n; });
                      }}
                    >
                      <option value="permanent">Definitiva</option>
                      <option value="loan">Empréstimo</option>
                    </select>
                    {dealType === "loan" && (
                      <input
                        type="number" placeholder="Cláusula (opc.)"
                        className="mt-1 w-24 bg-transparent border rounded px-1 py-0.5 text-xs"
                        value={buyOptions[p.id] ?? ""} disabled={negotiating}
                        onChange={(e) => setBuyOptions((s) => ({ ...s, [p.id]: Number(e.target.value) }))}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" className="w-28 text-right bg-transparent border rounded px-2 py-1"
                      value={fee} disabled={negotiating}
                      onChange={(e) => setFees((s) => ({ ...s, [p.id]: Number(e.target.value) }))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      size="sm" onClick={() => propose.mutate(p)}
                      disabled={negotiating || propose.isPending || !windowOpen || (club.data?.transfer_budget ?? 0) < fee}
                      title={!windowOpen ? "Janela de transferências fechada" : undefined}
                    >
                      {negotiating ? "Negociando…" : !windowOpen ? "Janela fechada" : "Propor"}
                    </Button>
                  </td>
                  <td className="px-3 py-2">
                    {knowledge >= 100 ? null : beingScouted ? (
                      <span className="text-xs text-muted-foreground">Observando…</span>
                    ) : (
                      <Button
                        size="sm" variant="outline" onClick={() => scout.mutate(p.id)}
                        disabled={scout.isPending || (scouting.data?.length ?? 0) >= scoutingCap}
                      >
                        Escalar olheiro
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <EmptyState icon={Search} title="Nenhum jogador encontrado" />}
      </div>
    </div>
  );
}

function OfferRow(props: {
  label: React.ReactNode; fee: number; expires: string;
  counterValue: number; onCounterChange: (v: number) => void;
  onAccept: () => void; onDecline: () => void; onCounter: () => void;
  pending: boolean; acceptLabel?: string; declineLabel?: string; counterLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border rounded-md p-2">
      <div className="flex-1 min-w-[220px]">
        <div className="text-sm font-medium">{props.label}</div>
        <div className="text-xs text-muted-foreground">
          {formatMoney(props.fee)} na mesa · expira em {formatDate(props.expires)}
        </div>
      </div>
      <input
        type="number" className="w-28 text-right bg-transparent border rounded px-2 py-1 text-sm"
        value={props.counterValue}
        onChange={(e) => props.onCounterChange(Number(e.target.value))}
      />
      <Button size="sm" variant="outline" onClick={props.onCounter} disabled={props.pending}>
        {props.counterLabel ?? "Contrapropor"}
      </Button>
      <Button size="sm" onClick={props.onAccept} disabled={props.pending}>
        {props.acceptLabel ?? "Aceitar"}
      </Button>
      <Button size="sm" variant="destructive" onClick={props.onDecline} disabled={props.pending}>
        {props.declineLabel ?? "Recusar"}
      </Button>
    </div>
  );
}
