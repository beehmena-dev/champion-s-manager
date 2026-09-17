import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { formatDate } from "@/lib/game-hooks";
import { getCurrentUserId } from "@/lib/desktop-mode";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Meus saves — TáticaFC" }] }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [managerName, setManagerName] = useState("");

  const saves = useQuery({
    queryKey: ["saves"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saves").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (vars: { name: string; managerName: string }) => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("saves")
        .insert({ name: vars.name, user_id: userId, manager_name: vars.managerName || "Técnico" })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["saves"] });
      toast.success("Save criado!");
      navigate({ to: "/saves/$saveId/setup", params: { saveId: s.id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar save"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saves").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saves"] }),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold">TáticaFC</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <section>
          <h2 className="text-lg font-semibold mb-3">Novo save</h2>
          <Card className="p-4">
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                create.mutate({ name: newName.trim(), managerName: managerName.trim() });
                setNewName("");
                setManagerName("");
              }}
            >
              <Input
                placeholder="Nome do save (ex.: Carreira 2025)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Input
                placeholder="Seu nome como técnico (opcional)"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
              />
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "..." : "Criar"}
              </Button>
            </form>
          </Card>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Meus saves</h2>
          {saves.isLoading ? (
            <p className="text-muted-foreground text-sm">Carregando…</p>
          ) : saves.isError ? (
            <div className="text-sm space-y-2">
              <p className="text-destructive">
                Não consegui carregar os saves: {(saves.error as any)?.message ?? "erro desconhecido"}
              </p>
              <Button size="sm" variant="outline" onClick={() => saves.refetch()}>
                Tentar de novo
              </Button>
            </div>
          ) : saves.data?.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum save ainda. Crie o primeiro acima.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {saves.data?.map((s) => (
                <Card key={s.id} className="p-4 flex flex-col gap-3">
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.seeded ? `Em ${formatDate(s.game_date)}` : "Precisa importar base"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {s.seeded && s.my_club_id ? (
                      <Button asChild size="sm">
                        <Link to="/saves/$saveId" params={{ saveId: s.id }}>Continuar</Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm">
                        <Link to="/saves/$saveId/setup" params={{ saveId: s.id }}>Configurar</Link>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => del.mutate(s.id)}>Excluir</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}