import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { objectiveLabel } from "@/game/board";
import { firedSeasonByClub, isFiringSeason } from "@/game/career";
import { formatDate } from "@/lib/game-hooks";
import { PageHeader, MetricCard, MeterBar, Pill, EmptyState } from "@/components/fm";
import { ClubCrest } from "@/components/club-crest";
import { Award, Trophy, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/saves/$saveId/career")({
  component: CareerPage,
});

// -----------------------------------------------------------------------------
// Carreira do técnico (item 14 do backlog FootSim) — não introduz tabela nova
// pro histórico: season_objectives já registra (clube, temporada, resultado)
// toda vez que um clube é "meu" numa temporada (ver ensureSeasonObjective em
// src/lib/board.ts), incluindo trocas de clube no meio do caminho — então já
// É, de fato, a trajetória da carreira. job_offers (nunca apagado, guarda
// accepted/declined/expired) vira o histórico de sondagens. Demissão é
// inferida cruzando com saves.fired_from_club_ids (ver wasFiredAfter abaixo).
//
// Escopo deliberadamente FORA: aposentadoria do técnico. Isso é o item 22
// do backlog ("Encerramento, recordes e legado da carreira") — construir
// aqui seria antecipar um item maior sem o desenho que ele merece (tela de
// hall da fama, decisão do que acontece com o save depois). Card explícito
// do item 14 só pede reputação/histórico/sondagens/demissão, que é o que
// esta tela cobre.
// -----------------------------------------------------------------------------
function CareerPage() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/career" });
  const qc = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });

  const timeline = useQuery({
    queryKey: ["career-timeline", saveId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("season_objectives")
        .select("*, clubs(id, name, crest_url, primary_color, secondary_color), competitions(name)")
        .eq("save_id", saveId)
        .neq("status", "in_progress")
        .order("season", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Sondagens de emprego já respondidas (item 14 do backlog FootSim) —
  // job_offers já guarda tudo isso (status accepted/declined/expired,
  // nunca apagado), só faltava mostrar em algum lugar.
  const offers = useQuery({
    queryKey: ["career-job-offers", saveId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_offers")
        .select("id, status, offer_date, clubs!job_offers_offering_club_id_fkey(id, name, reputation, crest_url, primary_color, secondary_color)")
        .eq("save_id", saveId).neq("status", "pending")
        .order("offer_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const saveName = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("saves").update({ manager_name: name || "Técnico" }).eq("id", saveId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Nome atualizado."); qc.invalidateQueries({ queryKey: ["save", saveId] }); setEditingName(false); },
  });

  const titles = (timeline.data ?? []).filter((h) => h.final_position === 1).length;
  const reputation = save.data?.manager_reputation ?? 50;

  // Marca a temporada em que uma demissão aconteceu (item 14 do backlog
  // FootSim: "demissão" na trajetória, não só "meta não batida") — lógica
  // pura em src/game/career.ts.
  const firedClubIds = new Set((save.data?.fired_from_club_ids as string[] | null) ?? []);
  const firedMap = firedSeasonByClub(timeline.data ?? [], firedClubIds);
  const wasFiredAfter = (h: { club_id: string | null; season: number }) => isFiringSeason(h, firedMap);

  const OFFER_STATUS_LABEL: Record<string, string> = { accepted: "Aceita", declined: "Recusada", expired: "Expirou" };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Award}
        title={
          editingName ? (
            <span className="flex items-center gap-2">
              <input
                autoFocus
                className="h-8 rounded border bg-background px-2 text-lg font-bold"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
              />
              <Button size="sm" onClick={() => saveName.mutate(nameDraft)} disabled={saveName.isPending}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancelar</Button>
            </span>
          ) : (
            <span
              className="cursor-pointer hover:underline"
              onClick={() => { setNameDraft(save.data?.manager_name ?? ""); setEditingName(true); }}
              title="Clique para editar"
            >
              {save.data?.manager_name ?? "Técnico"}
            </span>
          )
        }
        subtitle="Trajetória e reputação do técnico."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Títulos de campeão" icon={Trophy} tone="warn" value={titles} hint="na carreira" />
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="fm-eyebrow">Reputação do técnico</span>
          </div>
          <div className="mb-2 font-display text-2xl font-bold text-primary">{reputation}</div>
          <MeterBar value={reputation} tone="ok" />
        </div>
      </div>

      <Card className="p-4">
        <div className="fm-eyebrow mb-3">Trajetória</div>
        <div className="space-y-2">
          {timeline.data?.map((h) => (
            <div key={h.id} className="flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-sm first:border-t-0 first:pt-0">
              <div>
                <span className="font-medium">Temporada {h.season}</span>
                <span className="text-muted-foreground inline-flex items-center gap-1"> — {h.clubs && <ClubCrest club={h.clubs} className="w-3.5 h-3.5" />} {h.clubs?.name ?? "?"} · {h.competitions?.name ?? "?"}</span>
                <div className="text-muted-foreground">
                  {objectiveLabel({ kind: h.kind, target: h.target })} · terminou em {h.final_position}º
                  {h.final_position === 1 ? " 🏆" : ""}
                </div>
              </div>
              <Pill tone={wasFiredAfter(h) ? "danger" : h.status === "met" ? "ok" : "danger"}>
                {wasFiredAfter(h) ? "Demitido" : h.status === "met" ? "Batida" : "Não batida"}
              </Pill>
            </div>
          ))}
          {timeline.data?.length === 0 && <EmptyState icon={Award} title="Nenhuma temporada concluída ainda" />}
        </div>
      </Card>

      <Card className="p-4">
        <div className="fm-eyebrow mb-3">Sondagens de emprego</div>
        <div className="space-y-2">
          {offers.data?.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-sm first:border-t-0 first:pt-0">
              <div>
                <span className="font-medium inline-flex items-center gap-1.5">{o.clubs && <ClubCrest club={o.clubs} className="w-4 h-4" />} {o.clubs?.name ?? "?"}</span>
                <span className="text-muted-foreground"> · reputação {o.clubs?.reputation ?? "?"} · {formatDate(o.offer_date)}</span>
              </div>
              <Pill tone={o.status === "accepted" ? "ok" : o.status === "declined" ? "neutral" : "warn"}>
                {OFFER_STATUS_LABEL[o.status] ?? o.status}
              </Pill>
            </div>
          ))}
          {offers.data?.length === 0 && (
            <EmptyState icon={Mail} title="Nenhuma sondagem recebida ainda" description="Clubes de reputação maior que a do seu, se você estiver indo bem, podem te sondar." />
          )}
        </div>
      </Card>
    </div>
  );
}
