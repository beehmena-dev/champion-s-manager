import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/game-hooks";
import { effectiveKnowledge, fuzzRange, tierFor } from "@/game/scouting";
import { startScouting, cancelScouting } from "@/lib/scouting";
import { offerRenewal, respondToContractOffer } from "@/lib/contract-offers";
import { expectedWage } from "@/game/contract-negotiation";
import { injuryTypeLabel, type InjuryHistoryEntry } from "@/game/medical";
import { WEEKLY_FOCUS_OPTIONS, WEEKLY_FOCUS_LABELS, resolveWeeklyFocus, type TrainingFocus, type WeeklyFocus } from "@/game/training";
import {
  ATTRIBUTE_GROUPS, ATTRIBUTE_LABEL, radarScores, attributeTone, playerScoutingNotes,
  type AttributeKey, type PlayerAttributes,
} from "@/game/attributes";
import { familiarityFor, roleFitStars } from "@/game/tactics";
import { rolesForPosition, type RoleDef } from "@/game/roles";
import { Star } from "lucide-react";
import { marketTrendFromForm } from "@/game/valuation";
import { bestMentorFor, isMenteeCandidate, isMentorCandidate, type MentorLike } from "@/game/mentoring";
import { GRANULAR_POSITIONS, positionLabel, type GranularPosition } from "@/game/types";
import { clubColors, contrastText } from "@/game/club-colors";
import { NationalityFlag } from "@/components/nationality-flag";
import { ClubCrest } from "@/components/club-crest";
import { PlayerFace } from "@/components/player-face";
import { RadarChart, Pill, ProsConsList, RatingBadge } from "@/components/fm";
import { useState } from "react";
import { toast } from "sonner";

const TONE_BAR: Record<ReturnType<typeof attributeTone>, string> = {
  ok: "bg-ok", info: "bg-info", warn: "bg-warn", neutral: "bg-muted-foreground/60",
};
const TONE_TXT: Record<ReturnType<typeof attributeTone>, string> = {
  ok: "text-ok", info: "text-info", warn: "text-warn", neutral: "text-muted-foreground",
};
const CMP_KEYS: AttributeKey[] = ["finishing", "passing", "dribbling", "pace", "tackling", "vision"];

export const Route = createFileRoute("/_authenticated/saves/$saveId/players/$playerId")({
  component: PlayerDetail,
});

function PlayerDetail() {
  const { saveId, playerId } = useParams({ from: "/_authenticated/saves/$saveId/players/$playerId" });
  const qc = useQueryClient();
  const [renewWage, setRenewWage] = useState<number | null>(null);
  const [renewYears, setRenewYears] = useState(3);
  const [renewClause, setRenewClause] = useState<number | "">("");
  const [renewGuaranteedStarter, setRenewGuaranteedStarter] = useState(false);
  const [counterWage, setCounterWage] = useState<number | null>(null);

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const myClubId = save.data?.my_club_id;
  const today = save.data?.game_date;

  const player = useQuery({
    queryKey: ["player", playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players").select("*, clubs!players_club_id_fkey(id, name, short_name, reputation, crest_url, primary_color, secondary_color)")
        .eq("id", playerId).single();
      // PGRST116 = .single() genuinely não achou linha nenhuma (jogador não
      // existe de verdade) — qualquer OUTRO erro (503/rede/timeout do banco
      // de dev flakeando) precisa VIRAR erro de query, não "jogador null",
      // senão um 503 passageiro renderizava "Jogador não encontrado" como se
      // o dado tivesse sumido de verdade.
      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }
      return data;
    },
  });

  const assignment = useQuery({
    queryKey: ["scouting-assignment", playerId, myClubId],
    enabled: !!myClubId,
    queryFn: async () => (await supabase
      .from("scouting_assignments").select("*")
      .eq("player_id", playerId).eq("club_id", myClubId!).eq("status", "active").maybeSingle()).data,
  });

  const scout = useMutation({
    mutationFn: () => startScouting(saveId, myClubId!, playerId, today!),
    onSuccess: () => { toast.success("Olheiro escalado."); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });
  const unscout = useMutation({
    mutationFn: (id: string) => cancelScouting(id),
    onSuccess: () => { toast.info("Observação encerrada."); qc.invalidateQueries(); },
  });

  const contractOffer = useQuery({
    queryKey: ["contract-offer", playerId],
    enabled: !!myClubId,
    queryFn: async () => (await supabase.from("contract_offers").select("*").eq("player_id", playerId).eq("status", "pending").maybeSingle()).data,
  });

  const propose = useMutation({
    mutationFn: (vars: { wage: number; years: number; overall: number; age: number; currentWage: number; releaseClause: number | null; guaranteedStarter: boolean }) =>
      offerRenewal(saveId, myClubId!, { id: playerId, wage: vars.currentWage, overall: vars.overall, age: vars.age }, vars.wage, vars.years, today!, vars.releaseClause, vars.guaranteedStarter),
    onSuccess: (result) => {
      if (result.status === "completed") toast.success(`Contrato renovado por ${formatMoney(result.wage)}/quinzena.`);
      else if (result.status === "pending") toast.info(`Empresário contrapropôs ${formatMoney(result.wage)}/quinzena.`);
      else toast.error("Empresário recusou a proposta.");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const respond = useMutation({
    mutationFn: (vars: { action: "accept" | "counter" | "decline"; wage?: number }) =>
      respondToContractOffer(contractOffer.data!.id, vars.action, today!, vars.wage),
    onSuccess: (result) => {
      if (result.status === "completed") toast.success(`Contrato renovado por ${formatMoney(result.wage)}/quinzena.`);
      else if (result.status === "pending") toast.info(`Nova contraproposta: ${formatMoney(result.wage)}/quinzena.`);
      else toast.error("Negociação encerrada sem acordo.");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const club = useQuery({
    queryKey: ["club-training", myClubId],
    enabled: !!myClubId,
    queryFn: async () => (await supabase.from("clubs").select("training_focus, weekly_training").eq("id", myClubId!).single() as any).data,
  });
  const todayClubFocus = resolveWeeklyFocus(club.data?.weekly_training ?? null, (club.data?.training_focus as TrainingFocus) ?? "balanced", today ?? new Date().toISOString().slice(0, 10));

  // Elenco do usuário — pro comparador de atributos lado a lado.
  const squadForCompare = useQuery({
    queryKey: ["squad-compare", myClubId],
    enabled: !!myClubId,
    // as any[]: nationality ainda não está em types.ts (convenção do
    // projeto até regenerar esse arquivo — ver CLAUDE.md).
    queryFn: async () => ((await supabase
      .from("players").select("id, name, position, overall, age, attributes, nationality")
      .eq("club_id", myClubId!).order("overall", { ascending: false })).data ?? []) as any[],
  });
  const [compareId, setCompareId] = useState<string>("");

  const setFocus = useMutation({
    mutationFn: async (focus: WeeklyFocus | null) => {
      const { error } = await supabase.from("players").update({ individual_training_focus: focus }).eq("id", playerId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Foco de treino individual salvo."); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  if (player.isLoading) return <div className="text-muted-foreground">Carregando…</div>;
  if (player.isError) {
    return (
      <div className="flex flex-col items-start gap-2 text-muted-foreground">
        <p>Não foi possível carregar este jogador agora.</p>
        <Button size="sm" variant="outline" onClick={() => player.refetch()}>Tentar de novo</Button>
      </div>
    );
  }
  const p = player.data as any;
  if (!p) return <div>Jogador não encontrado.</div>;

  // Salário que o empresário considera justo — mesma fórmula que
  // evaluateContractOffer() usa pra aceitar/contrapropor/recusar (ver
  // src/game/contract-negotiation.ts). Antes o campo pré-preenchia com um
  // +10% fixo, que não batia com o que a negociação realmente aceita.
  const suggestedWage = expectedWage(p.wage ?? 0, p.overall, p.age);

  const isMine = !!myClubId && p.club_id === myClubId;
  const knowledge = isMine ? 100 : effectiveKnowledge(p.scout_knowledge ?? 0, p.clubs?.reputation ?? 50, p.overall);
  const tier = tierFor(knowledge);
  const [ovrLo, ovrHi] = fuzzRange(p.overall, tier.overallSpread, `${p.id}-overall`);

  const basePos = (p.position as "GK" | "DEF" | "MID" | "FWD") ?? "MID";
  const footLabel = p.foot === "right" ? "direito" : p.foot === "left" ? "esquerdo" : "ambidestro";
  const attrKnown = tier.attrSpread >= 0;
  const rawAttrs: PlayerAttributes = p.attributes ?? {};
  // Atributos "de exibição": exatos pro meu jogador, ponto-médio da faixa
  // difusa pros de fora (o número na grade ainda mostra a faixa lo-hi).
  const viewAttrs: Record<string, number> = {};
  for (const k of Object.keys(ATTRIBUTE_LABEL) as AttributeKey[]) {
    const raw = rawAttrs[k] ?? 10;
    if (isMine) viewAttrs[k] = raw;
    else {
      const [lo, hi] = fuzzRange(raw, Math.max(0, tier.attrSpread), `${p.id}-${k}`);
      viewAttrs[k] = Math.round((lo + hi) / 2);
    }
  }
  const radar = radarScores(viewAttrs as unknown as PlayerAttributes, basePos);
  const scoutingNotes = playerScoutingNotes(basePos, viewAttrs as unknown as PlayerAttributes);

  const cmp = compareId ? (squadForCompare.data ?? []).find((x) => x.id === compareId) : null;
  const cmpAttrs = (cmp?.attributes ?? {}) as unknown as PlayerAttributes;
  const cmpRadar = cmp ? radarScores(cmpAttrs, ((cmp.position as any) ?? "MID")) : undefined;

  const marketTrend = marketTrendFromForm(p.form);

  // Mentoria de jovens por veteranos (item 16 do backlog FootSim) — só faz
  // sentido calcular pro MEU elenco (squadForCompare só carrega pra isso, ver
  // acima); mostra "Mentor" pro jovem sendo mentorado, ou a lista de
  // mentorados pro veterano em questão. Ver src/game/mentoring.ts.
  const squad = (squadForCompare.data ?? []) as MentorLike[];
  const myMentor = isMine && isMenteeCandidate(p.age) ? bestMentorFor(p.id, squad) : null;
  const myMentees = isMine && isMentorCandidate(p as MentorLike)
    ? squad.filter((s) => isMenteeCandidate(s.age) && bestMentorFor(s.id, squad)?.id === p.id)
    : [];

  const kit = clubColors({
    id: p.club_id ?? p.id,
    primary_color: (p.clubs as any)?.primary_color,
    secondary_color: (p.clubs as any)?.secondary_color,
  });
  const kitText = contrastText(kit.primary);

  return (
    <div className="space-y-4">
      <Link to="/saves/$saveId/squad" params={{ saveId }} className="text-sm text-muted-foreground hover:text-foreground">← Elenco</Link>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="relative shrink-0">
              <PlayerFace player={p} className="size-14 border-2 border-white/15 shadow-sm" />
              {p.squad_number != null && (
                <div
                  className="absolute -bottom-1.5 -right-1.5 grid size-6 place-items-center rounded-full border-2 border-background text-[11px] font-display font-bold"
                  style={{ backgroundColor: kit.primary, color: kitText }}
                >
                  {p.squad_number}
                </div>
              )}
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">{p.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <Pill tone="info">{p.natural_position ?? p.position}</Pill>
                <span>{p.age} anos</span>
                <span>·</span>
                <span>Pé {footLabel}</span>
                {p.nationality && (
                  <>
                    <span>·</span>
                    <span><NationalityFlag nationality={p.nationality} /> {p.nationality}</span>
                  </>
                )}
                {p.clubs?.name && !isMine && (<><span>·</span><span className="inline-flex items-center gap-1"><ClubCrest club={p.clubs as any} className="w-3.5 h-3.5" /> {p.clubs.name}</span></>)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-4xl font-bold text-primary">{ovrLo === ovrHi ? ovrLo : `${ovrLo}-${ovrHi}`}</div>
            <div className="fm-eyebrow">Overall</div>
            {isMine && p.potential != null && (
              <div className="mt-1 text-sm font-semibold text-info">Potencial {p.potential}</div>
            )}
            {myMentor && (
              <div className="mt-1 text-xs text-muted-foreground" title="Veterano de liderança/determinação forte no elenco — acelera o desenvolvimento dele em treino.">
                Mentor: <Link to="/saves/$saveId/players/$playerId" params={{ saveId, playerId: myMentor.id }} className="font-semibold text-foreground hover:underline">
                  {(myMentor as any).name}
                </Link>
              </div>
            )}
            {myMentees.length > 0 && (
              <div className="mt-1 text-xs text-muted-foreground" title="Jovens do elenco acelerando o desenvolvimento por causa da liderança/determinação dele.">
                Mentorando: {myMentees.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && ", "}
                    <Link to="/saves/$saveId/players/$playerId" params={{ saveId, playerId: m.id }} className="font-semibold text-foreground hover:underline">
                      {(m as any).name}
                    </Link>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {!isMine && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
            <span className="fm-eyebrow">{tier.label} · conhecimento {knowledge}%</span>
            <div className="h-1.5 min-w-[80px] max-w-[160px] flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${knowledge}%` }} />
            </div>
            {assignment.data ? (
              <Button size="sm" variant="outline" onClick={() => unscout.mutate(assignment.data!.id)} disabled={unscout.isPending}>
                Olheiro em campo — parar observação
              </Button>
            ) : knowledge < 100 ? (
              <Button size="sm" onClick={() => scout.mutate()} disabled={scout.isPending}>
                Escalar olheiro
              </Button>
            ) : null}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <Field
            label="Valor"
            value={
              tier.showValue ? (
                <span className="inline-flex items-center gap-1.5">
                  {formatMoney(p.market_value)}
                  {isMine && marketTrend !== "stable" && (
                    <Pill tone={marketTrend === "rising" ? "ok" : "danger"}>
                      {marketTrend === "rising" ? "↑ valorizando" : "↓ desvalorizando"}
                    </Pill>
                  )}
                </span>
              ) : "Desconhecido"
            }
          />
          <Field label="Salário (quinzenal)" value={isMine || tier.showValue ? formatMoney(p.wage) : "—"} />
          <Field label="Contrato até" value={isMine ? (p.contract_until ? formatDate(p.contract_until) : "—") : "—"} />
          {isMine && (<>
            <Field label="Moral" value={p.morale} />
            <Field label="Condição" value={`${p.condition}%`} />
            <Field label="Forma" value={p.form} />
            <Field label="Gols na carreira" value={p.career_goals ?? 0} />
            <Field label="Jogos na carreira" value={p.career_appearances ?? 0} />
          </>)}
        </div>
      </Card>

      {/* Perfil de atributos — radar + comparador */}
      {attrKnown && (
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Perfil de atributos</h3>
            {isMine && (squadForCompare.data?.length ?? 0) > 1 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Comparar com
                <select
                  className="h-8 rounded border bg-background px-2 text-xs text-foreground"
                  value={compareId}
                  onChange={(e) => setCompareId(e.target.value)}
                >
                  <option value="">—</option>
                  {(squadForCompare.data ?? [])
                    .filter((x) => x.id !== p.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} ({x.position} · {x.overall})
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>

          <div className="grid gap-5 md:grid-cols-[minmax(0,300px)_1fr] md:items-center">
            <RadarChart
              data={radar}
              compare={cmpRadar}
              aLabel={String(p.name).split(" ").slice(-1)[0]}
              bLabel={cmp ? String(cmp.name).split(" ").slice(-1)[0] : undefined}
            />

            {cmp ? (
              <div className="space-y-1.5 text-sm">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b pb-1.5 text-center text-xs font-semibold">
                  <span className="text-primary">{String(p.name).split(" ").slice(-1)[0]}</span>
                  <span className="text-muted-foreground">atributo</span>
                  <span className="text-info">{String(cmp.name).split(" ").slice(-1)[0]}</span>
                </div>
                {([
                  ["Overall", p.overall, cmp.overall, false],
                  ["Idade", p.age, cmp.age, true],
                  ...CMP_KEYS.map((k) => [ATTRIBUTE_LABEL[k], viewAttrs[k], cmpAttrs[k] ?? 10, false] as const),
                ] as const).map(([label, a, b, lowerIsBetter], i) => {
                  const aBetter = lowerIsBetter ? a < b : a > b;
                  const bBetter = lowerIsBetter ? a > b : a < b;
                  return (
                    <div key={i} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                      <span className={`font-mono font-semibold ${aBetter ? "text-ok" : ""}`}>{a}</span>
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                      <span className={`font-mono font-semibold ${bBetter ? "text-ok" : ""}`}>{b}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="hidden text-xs text-muted-foreground md:block">
                {isMine
                  ? "Escolha um jogador do elenco no menu acima para sobrepor os perfis."
                  : "Média dos atributos em 5 eixos (0–100)."}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Prós/contras — mesmo tratamento visual do dossiê de time (Análise),
          agora por jogador. Some sozinho se não houver atributo conhecido. */}
      {attrKnown && (scoutingNotes.strengths.length > 0 || scoutingNotes.weaknesses.length > 0) && (
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Prós e contras</h3>
          <ProsConsList strengths={scoutingNotes.strengths} weaknesses={scoutingNotes.weaknesses} />
        </Card>
      )}

      {/* Posições e funções — quais ele joga e quão bem, estilo FM.
          `familiarityFor` já mistura progresso real (partidas jogadas) com
          secondary_positions/aptidão por atributo quando não há progresso
          registrado ainda (ver tactics.ts::fallbackProgress) — cobre tanto
          quem já atuou na posição quanto quem só tem a nota do CSV. */}
      {attrKnown && (() => {
        const playerForFit = { ...p, attributes: viewAttrs as unknown as PlayerAttributes };
        const byRoleKey = new Map<string, { pos: GranularPosition; role: RoleDef; stars: number }>();
        for (const pos of GRANULAR_POSITIONS) {
          for (const role of rolesForPosition(pos)) {
            const stars = roleFitStars(playerForFit, role, pos);
            const prev = byRoleKey.get(role.key);
            if (!prev || stars > prev.stars) byRoleKey.set(role.key, { pos, role, stars });
          }
        }
        const topRolesSorted = [...byRoleKey.values()].sort((a, b) => b.stars - a.stars).slice(0, 8);

        return (
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Posições</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {GRANULAR_POSITIONS.map((pos) => {
                const fam = familiarityFor(playerForFit, pos);
                const isNatural = (p.natural_position ?? p.position) === pos;
                return (
                  <div
                    key={pos}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                      isNatural ? "border-primary/50 bg-primary/5" : "border-border"
                    }`}
                  >
                    <span className={isNatural ? "font-semibold text-primary" : ""}>
                      {positionLabel(pos)}
                      {isNatural && " ★"}
                    </span>
                    <RatingBadge value={fam.progress} />
                  </div>
                );
              })}
            </div>

            <h4 className="mb-2 mt-4 text-xs font-semibold text-muted-foreground">Melhores funções táticas</h4>
            <div className="space-y-1">
              {topRolesSorted.map(({ pos, role, stars }) => (
                <div key={role.key} className="flex items-center justify-between gap-2 border-t border-border/50 pt-1.5 text-xs first:border-t-0 first:pt-0">
                  <span>{role.label} <span className="text-muted-foreground">· {positionLabel(pos)}</span></span>
                  <div className="flex shrink-0 gap-[1px]">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`size-3 ${i < stars ? "fill-warn text-warn" : "text-muted-foreground/30"}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {isMine && (() => {
        const injuryHistory = ((p.injury_history as InjuryHistoryEntry[] | null) ?? []).slice().reverse();
        const totalDaysOut = injuryHistory.reduce((a, e) => a + e.days, 0);
        return (
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Histórico de lesões</h3>
            {injuryHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma lesão registrada.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{injuryHistory.length} lesão(ões) · {totalDaysOut} dias afastado ao todo</p>
                <div className="space-y-1.5 text-sm">
                  {injuryHistory.map((e, i) => (
                    <div key={i} className="flex items-center justify-between border-t pt-1.5 first:border-t-0 first:pt-0">
                      <span>{injuryTypeLabel(e.type)}{e.relapse ? " (recaída)" : ""}</span>
                      <span className="text-muted-foreground">{formatDate(e.started_at)} · {e.days}d</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })()}

      {isMine && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Contrato</h3>
          {contractOffer.data ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Empresário pede <span className="font-semibold text-foreground">{formatMoney(contractOffer.data.current_wage)}</span>/quinzena
                por {contractOffer.data.contract_years} ano(s).
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number" className="w-32 text-right bg-transparent border rounded px-2 py-1 text-sm"
                  value={counterWage ?? contractOffer.data.current_wage}
                  onChange={(e) => setCounterWage(Number(e.target.value))}
                />
                <Button size="sm" variant="outline" onClick={() => respond.mutate({ action: "counter", wage: counterWage ?? contractOffer.data!.current_wage })} disabled={respond.isPending}>
                  Contrapropor
                </Button>
                <Button size="sm" onClick={() => respond.mutate({ action: "accept" })} disabled={respond.isPending}>
                  Aceitar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => respond.mutate({ action: "decline" })} disabled={respond.isPending}>
                  Recusar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-muted-foreground">Novo salário</label>
              <input
                type="number" className="w-32 text-right bg-transparent border rounded px-2 py-1 text-sm"
                value={renewWage ?? suggestedWage}
                onChange={(e) => setRenewWage(Number(e.target.value))}
              />
              <label className="text-sm text-muted-foreground">Anos</label>
              <select
                className="bg-transparent border rounded px-2 py-1 text-sm"
                value={renewYears}
                onChange={(e) => setRenewYears(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <label className="text-sm text-muted-foreground">Cláusula de rescisão (opcional)</label>
              <input
                type="number" placeholder="Sem cláusula" className="w-36 text-right bg-transparent border rounded px-2 py-1 text-sm"
                value={renewClause}
                onChange={(e) => setRenewClause(e.target.value === "" ? "" : Number(e.target.value))}
              />
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={renewGuaranteedStarter}
                  onChange={(e) => setRenewGuaranteedStarter(e.target.checked)}
                />
                Prometer titularidade garantida
              </label>
              <Button
                size="sm"
                onClick={() => propose.mutate({
                  wage: renewWage ?? suggestedWage, years: renewYears,
                  overall: p.overall, age: p.age, currentWage: p.wage,
                  releaseClause: renewClause === "" ? null : renewClause,
                  guaranteedStarter: renewGuaranteedStarter,
                })}
                disabled={propose.isPending}
              >
                Propor renovação
              </Button>
            </div>
          )}
          {isMine && p.release_clause != null && (
            <p className="text-xs text-muted-foreground mt-2">
              Cláusula de rescisão vigente: <span className="font-medium text-foreground">{formatMoney(p.release_clause)}</span>
            </p>
          )}
          {isMine && p.guaranteed_starter && (
            <p className={`text-xs mt-1 ${(p.bench_streak ?? 0) >= 2 ? "text-amber-400" : "text-muted-foreground"}`}>
              Titularidade garantida prometida
              {(p.bench_streak ?? 0) > 0 ? ` — ${p.bench_streak} jogo${p.bench_streak > 1 ? "s" : ""} seguido${p.bench_streak > 1 ? "s" : ""} no banco` : ""}
            </p>
          )}
        </Card>
      )}

      {isMine && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Treino individual</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Sobrescreve, só pra este jogador, a grade semanal do time — vale todo dia, inclusive nos dias de descanso
            do time (hoje o time treina: {WEEKLY_FOCUS_LABELS[todayClubFocus]}).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFocus.mutate(null)}
              disabled={setFocus.isPending}
              className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                !p.individual_training_focus ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
              }`}
            >
              Padrão do clube
            </button>
            {WEEKLY_FOCUS_OPTIONS.map((f) => (
              <button
                key={f}
                onClick={() => setFocus.mutate(f)}
                disabled={setFocus.isPending}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  p.individual_training_focus === f ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
                }`}
              >
                {WEEKLY_FOCUS_LABELS[f]}
              </button>
            ))}
          </div>
        </Card>
      )}

      {!attrKnown ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Sua comissão técnica ainda não conhece este jogador de perto. Escale um olheiro pra revelar os atributos.
        </Card>
      ) : (() => {
        // Grupo "Goleiro" só aparece pra quem realmente é goleiro — jogador de
        // linha tem esses atributos gerados (pra não quebrar cálculo interno),
        // mas mostrá-los na ficha seria ruído (igual ao FM real: um zagueiro
        // não tem card de Goleiro na tela dele).
        const groups = ATTRIBUTE_GROUPS.filter((g) => g.label !== "Goleiro" || p.position === "GK");
        return (
          <div className={`grid gap-4 ${groups.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
            {groups.map((g) => (
              <Card key={g.label} className="p-4">
                <div className="fm-eyebrow mb-3">{g.label}</div>
                <div className="space-y-1.5">
                  {g.keys.map((k: AttributeKey) => {
                    const raw = rawAttrs[k] ?? 10;
                    const [lo, hi] = isMine ? [raw, raw] : fuzzRange(raw, tier.attrSpread, `${p.id}-${k}`);
                    const mid = (lo + hi) / 2;
                    const tone = attributeTone(mid);
                    return (
                      <div key={k} className="flex items-center gap-2.5">
                        <div className="w-32 shrink-0 truncate text-[13px] text-muted-foreground">{ATTRIBUTE_LABEL[k]}</div>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${(mid / 20) * 100}%` }} />
                        </div>
                        <div className={`w-9 shrink-0 text-right font-mono text-[13px] font-semibold ${TONE_TXT[tone]}`}>
                          {lo === hi ? lo : `${lo}-${hi}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        );
      })()}
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
