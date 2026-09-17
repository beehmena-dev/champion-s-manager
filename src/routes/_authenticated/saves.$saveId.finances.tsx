import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/game-hooks";
import { PageHeader, MetricCard, EmptyState } from "@/components/fm";
import { Wallet, ArrowRightLeft, ReceiptText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/saves/$saveId/finances")({
  component: Finances,
});

function Finances() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/finances" });

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const clubId = save.data?.my_club_id;

  const club = useQuery({
    queryKey: ["club", clubId],
    enabled: !!clubId,
    // select completo (com o join de competitions) pra bater com a query do
    // layout raiz — mesma chave ["club", clubId], cache compartilhado (ver
    // Fase 0.2 do plano: evitar select() mais estreito sobrescrever campos
    // que outra tela precisa).
    queryFn: async () => (await supabase.from("clubs").select("*, competitions!clubs_competition_id_fkey(name)").eq("id", clubId!).single()).data,
  });

  const entries = useQuery({
    queryKey: ["finances", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase.from("finance_entries").select("*").eq("club_id", clubId!).order("entry_date", { ascending: false }).limit(100)).data ?? [],
  });

  const kindLabel: Record<string, string> = {
    wages: "Salários", gate: "Bilheteria", transfer_in: "Contratação", transfer_out: "Venda",
    sponsor: "Patrocínio", membership: "Sócio-torcedor", board_grant: "Aporte da diretoria", other: "Outros",
  };

  return (
    <div className="space-y-4">
      <PageHeader icon={Wallet} title="Finanças" subtitle="Caixa, verba de transferências e histórico de movimentações." />

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="Caixa (folha salarial)" icon={Wallet} tone="ok"
          value={formatMoney(club.data?.budget ?? 0)}
        />
        <MetricCard
          label="Verba de transferências" icon={ArrowRightLeft} tone="info"
          value={formatMoney(club.data?.transfer_budget ?? 0)}
        />
      </div>

      <Card className="p-4">
        <div className="fm-eyebrow mb-3">Movimentações</div>
        <div className="divide-y divide-border/50">
          {entries.data?.map((e) => (
            <div key={e.id} className="flex justify-between py-2 text-sm">
              <div>
                <div>{kindLabel[e.kind] ?? e.kind}</div>
                <div className="text-xs text-muted-foreground">{formatDate(e.entry_date)} · {e.description}</div>
              </div>
              <div className={`font-mono font-medium ${e.amount >= 0 ? "text-ok" : "text-danger"}`}>
                {e.amount >= 0 ? "+" : ""}{formatMoney(e.amount)}
              </div>
            </div>
          ))}
          {entries.data?.length === 0 && (
            <EmptyState icon={ReceiptText} title="Sem movimentações ainda" description="Salários, bilheteria e transferências aparecem aqui a cada avanço." />
          )}
        </div>
      </Card>
    </div>
  );
}