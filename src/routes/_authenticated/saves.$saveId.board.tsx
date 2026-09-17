import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/game-hooks";
import { computeStandings } from "@/game/standings";
import {
  objectiveLabel, BOARD_CONFIDENCE_CRITICAL,
  BOARD_REQUEST_CATALOG, MAX_BOARD_REQUESTS_PER_SEASON, evaluateBoardRequest,
  fanTemperamentFromClubId, FAN_TEMPERAMENT_LABEL, type FanTemperament,
  type SeasonObjective, type BoardRequestKind,
} from "@/game/board";
import { ensureSeasonObjective, submitBoardRequest } from "@/lib/board";
import { PageHeader, MeterBar, Pill } from "@/components/fm";
import { Landmark, Dumbbell, GraduationCap, Building2, Send, Flame } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/saves/$saveId/board")({
  component: BoardPage,
});

const FAN_TEMPERAMENT_HINT: Record<FanTemperament, string> = {
  apaixonada: "estádio quase sempre cheio",
  exigente: "só lota quando o time empolga",
  tradicional: "ocupação padrão",
};

function BoardPage() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/board" });
  const qc = useQueryClient();
  const [selectedKind, setSelectedKind] = useState<BoardRequestKind>("verba_transferencia");
  const [lastResponse, setLastResponse] = useState<string | null>(null);

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const clubId = save.data?.my_club_id;
  const today = save.data?.game_date;

  const club = useQuery({
    queryKey: ["club-board", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase
      .from("clubs")
      .select("budget, transfer_budget, reputation, board_confidence, stadium_capacity, training_facilities, youth_facilities, competition_id, competitions!clubs_competition_id_fkey(id, name, season)")
      .eq("id", clubId!).single()).data,
  });
  const compId = (club.data as any)?.competitions?.id;
  const season = (club.data as any)?.competitions?.season;

  const standings = useQuery({
    queryKey: ["standings", saveId, compId, season],
    enabled: !!compId && season != null,
    queryFn: async () => {
      const [{ data: clubs }, { data: matches }] = await Promise.all([
        supabase.from("clubs").select("id, name").eq("competition_id", compId!),
        supabase.from("matches").select("home_club_id, away_club_id, home_score, away_score, played").eq("competition_id", compId!).eq("season", season),
      ]);
      return computeStandings(clubs ?? [], matches ?? []);
    },
  });
  const myPosition = standings.data ? standings.data.findIndex((r) => r.club_id === clubId) + 1 : null;

  const objective = useQuery({
    queryKey: ["season-objective", saveId, clubId, compId, season],
    enabled: !!clubId && !!compId && season != null,
    queryFn: async () => {
      await ensureSeasonObjective(saveId, clubId!, compId!, season);
      const { data } = await supabase
        .from("season_objectives").select("*")
        .eq("club_id", clubId!).eq("competition_id", compId!).eq("season", season).single();
      return data;
    },
  });

  const history = useQuery({
    queryKey: ["season-objectives-history", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase
      .from("season_objectives").select("*, competitions(name)")
      .eq("club_id", clubId!).neq("status", "in_progress")
      .order("season", { ascending: false })).data ?? [],
  });

  const awards = useQuery({
    queryKey: ["season-awards", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase
      .from("season_awards").select("*")
      .eq("club_id", clubId!)
      .order("season", { ascending: false })).data ?? [],
  });
  const AWARD_LABEL: Record<string, string> = { top_scorer: "Artilheiro", player_of_season: "Craque da temporada" };

  const confidence = club.data?.board_confidence ?? 60;

  const requests = useQuery({
    queryKey: ["board-requests", clubId, season],
    enabled: !!clubId && season != null,
    queryFn: async () => (await supabase
      .from("board_requests").select("*")
      .eq("club_id", clubId!).eq("season", season)
      .order("created_at", { ascending: false })).data ?? [],
  });
  const reqCount = requests.data?.length ?? 0;

  const submit = useMutation({
    mutationFn: () => submitBoardRequest(saveId, clubId!, selectedKind, today!, season),
    onSuccess: (r) => {
      setLastResponse(r.response);
      if (r.approved) toast.success("Pedido aprovado pela diretoria.");
      else toast.error("Pedido recusado.");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao enviar o pedido"),
  });

  // Prévia do resultado (mesma avaliação que submitBoardRequest usa).
  const preview = club.data && season != null
    ? evaluateBoardRequest(selectedKind, {
        boardConfidence: confidence,
        cash: club.data.budget ?? 0,
        clubReputation: club.data.reputation ?? 50,
        requestsThisSeason: reqCount,
        trainingFacilities: (club.data as any).training_facilities ?? 3,
        youthFacilities: (club.data as any).youth_facilities ?? 3,
      })
    : null;
  const selectedItem = BOARD_REQUEST_CATALOG.find((i) => i.kind === selectedKind)!;

  return (
    <div className="space-y-4">
      <PageHeader icon={Landmark} tone="info" title="Diretoria" subtitle="Confiança, objetivo da temporada, instalações e pedidos à diretoria." />

      <Card className="p-4">
        <div className="fm-eyebrow mb-2">Confiança da diretoria</div>
        <MeterBar
          value={confidence}
          showValue
          tone={confidence <= BOARD_CONFIDENCE_CRITICAL ? "danger" : confidence < 50 ? "warn" : "ok"}
        />
        {confidence <= BOARD_CONFIDENCE_CRITICAL && (
          <p className="mt-2 text-sm text-danger">
            A diretoria está muito insatisfeita — seu emprego corre risco se os resultados não melhorarem.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <div className="fm-eyebrow mb-3">Objetivo da temporada</div>
        {objective.data ? (
          <div className="text-sm">
            <div className="font-medium">{objectiveLabel({ kind: objective.data.kind as any, target: objective.data.target })}</div>
            <div className="text-muted-foreground mt-1">
              Posição atual: {myPosition ? `${myPosition}º` : "—"} de {standings.data?.length ?? "—"}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        )}
      </Card>

      <Card className="p-4">
        <div className="fm-eyebrow mb-3">Instalações</div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Facility icon={Dumbbell} label="Centro de treinamento" level={(club.data as any)?.training_facilities ?? 3} />
          <Facility icon={GraduationCap} label="Categoria de base" level={(club.data as any)?.youth_facilities ?? 3} />
          <div className="rounded-lg border bg-elevated/40 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="size-3.5" /> Estádio
            </div>
            <div className="font-display text-lg font-bold">{(club.data?.stadium_capacity ?? 0).toLocaleString("pt-BR")}</div>
            <div className="text-[11px] text-muted-foreground">lugares</div>
          </div>
          {clubId && (
            <div className="rounded-lg border bg-elevated/40 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Flame className="size-3.5" /> Torcida
              </div>
              <div className="font-display text-lg font-bold">{FAN_TEMPERAMENT_LABEL[fanTemperamentFromClubId(clubId)]}</div>
              <div className="text-[11px] text-muted-foreground">{FAN_TEMPERAMENT_HINT[fanTemperamentFromClubId(clubId)]}</div>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>Caixa: <span className="font-medium text-foreground">{formatMoney(club.data?.budget ?? 0)}</span></span>
          <span>Verba de transferências: <span className="font-medium text-foreground">{formatMoney(club.data?.transfer_budget ?? 0)}</span></span>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="fm-eyebrow">Pedidos à diretoria</div>
          <span className="text-xs text-muted-foreground">{reqCount}/{MAX_BOARD_REQUESTS_PER_SEASON} nesta temporada</span>
        </div>

        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
          <div className="space-y-1.5">
            {BOARD_REQUEST_CATALOG.map((item) => (
              <button
                key={item.kind}
                onClick={() => { setSelectedKind(item.kind); setLastResponse(null); }}
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  selectedKind === item.kind
                    ? "border-info bg-info/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="font-semibold text-foreground">{item.title}</div>
                <div className="mt-0.5">{item.cashCost > 0 ? formatMoney(-item.cashCost) : "Aporte da diretoria"}</div>
              </button>
            ))}
          </div>

          <div className="space-y-3 rounded-lg border bg-elevated/30 p-4">
            <div>
              <div className="font-semibold">{selectedItem.title}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">{selectedItem.description}</p>
            </div>
            <div className="space-y-1.5 rounded-md border bg-background/50 p-3 text-xs">
              <Row label="Benefício" value={selectedItem.benefit} valueClass="text-ok" />
              <Row
                label="Confiança necessária"
                value={`${selectedItem.minConfidence}% (atual: ${confidence}%)`}
                valueClass={confidence >= selectedItem.minConfidence ? "text-ok" : "text-warn"}
              />
              {selectedItem.cashCost > 0 && (
                <Row
                  label="Custo do caixa"
                  value={`${formatMoney(selectedItem.cashCost)} (caixa: ${formatMoney(club.data?.budget ?? 0)})`}
                  valueClass={(club.data?.budget ?? 0) >= selectedItem.cashCost * 0.6 ? "text-ok" : "text-danger"}
                />
              )}
            </div>

            {lastResponse ? (
              <div className={`rounded-md border p-3 text-xs ${
                submit.data?.approved ? "border-ok/30 bg-ok/5 text-ok" : "border-danger/30 bg-danger/5 text-danger"
              }`}>
                {lastResponse}
              </div>
            ) : (
              preview && !preview.approved && (
                <p className="text-xs text-warn">Prévia: a diretoria provavelmente vai recusar — {preview.response}</p>
              )
            )}

            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => submit.mutate()}
              disabled={submit.isPending || reqCount >= MAX_BOARD_REQUESTS_PER_SEASON}
            >
              <Send className="size-3.5" /> Apresentar pedido
            </Button>
          </div>
        </div>

        {(requests.data?.length ?? 0) > 0 && (
          <div className="mt-4 space-y-1.5 border-t pt-3">
            <div className="fm-eyebrow">Nesta temporada</div>
            {requests.data!.map((r: any) => (
              <div key={r.id} className="flex items-start justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  {BOARD_REQUEST_CATALOG.find((i) => i.kind === r.kind)?.title ?? r.kind}
                </span>
                <Pill tone={r.status === "approved" ? "ok" : "danger"}>{r.status === "approved" ? "Aprovado" : "Recusado"}</Pill>
              </div>
            ))}
          </div>
        )}
      </Card>

      {history.data && history.data.length > 0 && (
        <Card className="p-4">
          <div className="fm-eyebrow mb-3">Histórico de objetivos</div>
          <div className="space-y-2">
            {history.data.map((h: any) => (
              <div key={h.id} className="flex items-center justify-between text-sm border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
                <div>
                  <span className="font-medium">Temporada {h.season}</span>
                  <span className="text-muted-foreground"> — {h.competitions?.name}</span>
                  <div className="text-muted-foreground">{objectiveLabel({ kind: h.kind, target: h.target })} · terminou em {h.final_position}º</div>
                </div>
                <Pill tone={h.status === "met" ? "ok" : "danger"}>{h.status === "met" ? "Batida" : "Não batida"}</Pill>
              </div>
            ))}
          </div>
        </Card>
      )}

      {awards.data && awards.data.length > 0 && (
        <Card className="p-4">
          <div className="fm-eyebrow mb-3">Prêmios do clube</div>
          <div className="space-y-2">
            {awards.data.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between text-sm border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
                <div>
                  <span className="font-medium">Temporada {a.season}</span>
                  <span className="text-muted-foreground"> — {AWARD_LABEL[a.kind] ?? a.kind}</span>
                </div>
                <span className="font-medium text-warn">
                  {a.player_name} {a.kind === "top_scorer" ? `(${a.value} gols)` : `(${a.value} overall)`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Facility({ icon: Icon, label, level }: { icon: any; label: string; level: number }) {
  return (
    <div className="rounded-lg border bg-elevated/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="text-warn">
        {"★".repeat(Math.max(0, Math.min(5, level)))}
        <span className="text-muted-foreground/40">{"★".repeat(Math.max(0, 5 - level))}</span>
      </div>
      <div className="text-[11px] text-muted-foreground">{level}/5 estrelas</div>
    </div>
  );
}

function Row({ label, value, valueClass = "" }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}
