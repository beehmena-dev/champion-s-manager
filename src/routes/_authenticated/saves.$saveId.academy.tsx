import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { positionLabel } from "@/game/types";
import { PageHeader, EmptyState } from "@/components/fm";
import { NationalityFlag } from "@/components/nationality-flag";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/saves/$saveId/academy")({
  component: AcademyPage,
});

const YOUTH_AGE_LIMIT = 20;

function AcademyPage() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/academy" });
  const qc = useQueryClient();

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const clubId = save.data?.my_club_id;

  const prospects = useQuery({
    queryKey: ["academy", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players").select("*")
        .eq("club_id", clubId!).lte("age", YOUTH_AGE_LIMIT)
        .order("potential", { ascending: false, nullsFirst: false });
      if (error) throw error;
      // as any[]: nationality (e nos outros campos reais do FM24) ainda não
      // está em types.ts — convenção do projeto até alguém regenerar esse
      // arquivo (ver CLAUDE.md).
      return (data ?? []) as any[];
    },
  });

  const release = useMutation({
    mutationFn: async (playerId: string) => {
      const { error } = await supabase.from("players").update({ club_id: null }).eq("id", playerId);
      if (error) throw error;
    },
    onSuccess: () => { toast.info("Jogador dispensado — virou agente livre."); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        icon={GraduationCap}
        title="Central da base"
        subtitle={`Jogadores até ${YOUTH_AGE_LIMIT} anos. O potencial é um teto informativo — quanto mais acima do overall atual, mais espaço pra crescer com treino e jogos.`}
      />

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm [font-variant-numeric:tabular-nums]">
            <thead className="border-b bg-elevated/60 fm-eyebrow">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Nome</th>
                <th className="px-3 py-2.5 font-semibold">Pos</th>
                <th className="px-3 py-2.5 font-semibold">Idade</th>
                <th className="px-3 py-2.5 font-semibold">OVR</th>
                <th className="px-3 py-2.5 font-semibold">Potencial</th>
                <th className="px-3 py-2.5 text-left font-semibold">Progresso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {prospects.data?.map((p) => {
                const pot = p.potential ?? p.overall;
                const pct = Math.max(0, Math.min(100, Math.round((p.overall / Math.max(pot, 1)) * 100)));
                return (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-elevated/50">
                    <td className="px-3 py-2 font-medium">
                      <Link to="/saves/$saveId/players/$playerId" params={{ saveId, playerId: p.id }} className="hover:text-primary hover:underline">
                        <NationalityFlag nationality={p.nationality} /> {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">{positionLabel(p.natural_position ?? p.position)}</td>
                    <td className="px-3 py-2 text-center text-muted-foreground">{p.age}</td>
                    <td className="px-3 py-2 text-center font-semibold">{p.overall}</td>
                    <td className="px-3 py-2 text-center font-semibold text-info">{pot}</td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-[100px] items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right font-mono text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm" variant="destructive"
                        onClick={() => release.mutate(p.id)} disabled={release.isPending}
                      >
                        Dispensar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {prospects.data?.length === 0 && <EmptyState icon={GraduationCap} title="Nenhum jogador jovem no elenco" />}
      </Card>
    </div>
  );
}
