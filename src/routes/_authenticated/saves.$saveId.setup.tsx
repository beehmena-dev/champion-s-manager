import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { importSeed, type Seed } from "@/lib/seed-import";
import { generateScheduleForSave } from "@/lib/generate-schedule";
import { formatMoney } from "@/lib/game-hooks";
import { listSeedLibrary, loadSeedFromLibrary, saveSeedToLibrary, deleteSeedFromLibrary } from "@/lib/seed-library";
import { loadFootballDb, hasFootballDb } from "@/lib/football-db";

export const Route = createFileRoute("/_authenticated/saves/$saveId/setup")({
  head: () => ({ meta: [{ title: "Configurar save — TáticaFC" }] }),
  component: SetupPage,
});

function SetupPage() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/setup" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ step: string; current: number; total: number } | null>(null);
  // Guard síncrono (não é state — não depende de re-render pra valer) contra
  // clique duplo. `disabled={importing}` sozinho não bastava: handleUseDefault
  // (e os outros dois chamadores) fazem um await ANTES de runImport chamar
  // setImporting(true) — nessa janela o botão ainda não tinha desabilitado, e
  // um segundo clique rápido disparava a importação inteira de novo
  // (competição/clube/jogador todos duplicados no banco). Achado ao vivo:
  // toda competição de um save vinha em par, mesmo código, duas linhas.
  const importBusyRef = useRef(false);

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => {
      const { data, error } = await supabase.from("saves").select("*").eq("id", saveId).single();
      if (error) throw error;
      return data;
    },
    refetchInterval: importing ? 1500 : false,
  });

  const clubs = useQuery({
    queryKey: ["setup-clubs", saveId],
    enabled: !!save.data?.seeded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, short_name, reputation, budget, transfer_budget, competition_id, competitions!clubs_competition_id_fkey(name, playable)")
        .eq("save_id", saveId)
        .order("reputation", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Ligas do save e o estado jogável/segundo plano de cada uma.
  const comps = useQuery({
    queryKey: ["setup-comps", saveId],
    enabled: !!save.data?.seeded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitions")
        .select("id, name, playable, type, clubs:clubs!clubs_competition_id_fkey(id)")
        .eq("save_id", saveId)
        .eq("type", "league")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((c: any) => ({ id: c.id, name: c.name, playable: c.playable, clubCount: c.clubs?.length ?? 0 }));
    },
  });

  async function toggleLeaguePlayable(compId: string, next: boolean) {
    const { error } = await supabase.from("competitions").update({ playable: next }).eq("id", compId);
    if (error) return toast.error(error.message);
    await comps.refetch();
  }

  // Se já rolou alguma partida nesse save, chegar aqui de novo (com
  // my_club_id nulo) significa que o usuário foi demitido — não é a
  // primeira configuração.
  const wasFired = useQuery({
    queryKey: ["setup-was-fired", saveId],
    enabled: !!save.data?.seeded,
    queryFn: async () => {
      const { count } = await supabase
        .from("matches").select("id", { count: "exact", head: true })
        .eq("save_id", saveId).eq("played", true);
      return (count ?? 0) > 0;
    },
  });

  const library = useQuery({
    queryKey: ["seed-library"],
    enabled: !save.data?.seeded,
    queryFn: listSeedLibrary,
  });

  async function runImport(seed: Seed) {
    // Checagem+trava síncrona — ver comentário do importBusyRef acima.
    // Bloqueia tanto um segundo clique real quanto uma segunda chamada
    // concorrente vinda de handleFile/handleUseLibrary/handleUseDefault.
    if (importBusyRef.current) return;
    importBusyRef.current = true;
    setImporting(true);
    try {
      if (!seed.clubs || !Array.isArray(seed.clubs)) throw new Error("seed.json inválido: falta 'clubs'.");
      const { clubs: c, players: p } = await importSeed(saveId, seed, setProgress);
      toast.success(`${c} clubes e ${p} jogadores importados`);
      setProgress({ step: "Gerando calendário", current: 0, total: 1 });
      const { data: cur } = await supabase.from("saves").select("game_date").eq("id", saveId).single();
      await generateScheduleForSave(saveId, cur!.game_date);
      setProgress(null);
      toast.success("Calendário gerado");
      await save.refetch();
      await clubs.refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Falha na importação");
    } finally {
      importBusyRef.current = false;
      setImporting(false);
      setProgress(null);
    }
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const seed = JSON.parse(text) as Seed;
    await runImport(seed);
    // Guarda pra reaproveitar em saves futuros sem precisar reenviar o
    // arquivo — se isso falhar, a importação principal já terminou com
    // sucesso, então só avisa e segue (não desfaz o que já funcionou).
    try {
      await saveSeedToLibrary(file.name, seed);
      await library.refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Base importada, mas não deu pra salvar pra reaproveitar depois");
    }
  }

  async function handleUseDefault() {
    try {
      const seed = await loadFootballDb();
      await runImport(seed);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao carregar a base padrão");
    }
  }

  async function handleUseLibrary(id: string) {
    try {
      const seed = await loadSeedFromLibrary(id);
      await runImport(seed);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao carregar a base salva");
    }
  }

  async function handleDeleteLibrary(id: string) {
    try {
      await deleteSeedFromLibrary(id);
      await library.refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao remover a base salva");
    }
  }

  async function chooseClub(clubId: string) {
    const club = clubs.data?.find((c: any) => c.id === clubId) as any;
    // A liga do clube escolhido SEMPRE roda em simulação completa.
    if (club?.competition_id && club?.competitions?.playable === false) {
      await supabase.from("competitions").update({ playable: true }).eq("id", club.competition_id);
    }
    const { error } = await supabase.from("saves").update({ my_club_id: clubId }).eq("id", saveId);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["save", saveId] });
    navigate({ to: "/saves/$saveId", params: { saveId } });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold">Configurar: {save.data?.name}</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {!save.data?.seeded ? (
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">1. Importar base de dados</h2>

            {hasFootballDb() && (
              <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
                <div>
                  <div className="text-sm font-medium">Base padrão (times e jogadores reais)</div>
                  <div className="text-xs text-muted-foreground">
                    data/football-db/ — sem upload, dá pra editar os JSONs à mão a qualquer momento.
                  </div>
                </div>
                <Button size="sm" disabled={importing} onClick={handleUseDefault}>
                  Usar base padrão
                </Button>
              </div>
            )}

            {library.data && library.data.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Bases já importadas antes — reaproveite sem reenviar o arquivo:</p>
                <div className="divide-y rounded-md border">
                  {library.data.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <div className="text-sm font-medium">{entry.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.clubs_count} clubes · {entry.players_count} jogadores
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" disabled={importing} onClick={() => handleUseLibrary(entry.id)}>
                          Usar esta base
                        </Button>
                        <Button size="sm" variant="ghost" disabled={importing} onClick={() => handleDeleteLibrary(entry.id)}>
                          Remover
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Ou envie um arquivo diferente:</p>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Envie o arquivo <code>seed.json</code> gerado pelo script fornecido (clubes + elencos reais).
            </p>
            <label className="block">
              <input
                type="file"
                accept="application/json,.json"
                disabled={importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="text-sm"
              />
            </label>
            {progress && (
              <div className="text-sm">
                <div>{progress.step}</div>
                <div className="mt-1 h-2 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, (progress.current / Math.max(1, progress.total)) * 100)}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{progress.current} / {progress.total}</div>
              </div>
            )}
          </Card>
        ) : (
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">
              {wasFired.data ? "Você foi demitido. Escolha seu próximo desafio" : "2. Escolha o clube que você vai comandar"}
            </h2>
            {comps.data && comps.data.length > 1 && (
              <details className="rounded-md border bg-muted/30 [&_summary]:cursor-pointer">
                <summary className="px-3 py-2 text-sm font-medium">
                  Ligas em simulação completa ({comps.data.filter((c) => c.playable).length}/{comps.data.length})
                </summary>
                <div className="px-3 pb-3 pt-1 space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">
                    Ligas jogáveis têm simulação completa (jogadores evoluem dia a dia, elencos detalhados).
                    As demais rodam em segundo plano — resultados, tabela e mercado seguem, com simulação leve.
                    A liga do clube que você escolher vira jogável automaticamente.
                  </p>
                  {comps.data.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm py-1">
                      <input
                        type="checkbox"
                        checked={c.playable}
                        onChange={(e) => toggleLeaguePlayable(c.id, e.target.checked)}
                      />
                      <span className={c.playable ? "font-medium" : "text-muted-foreground"}>{c.name}</span>
                      <span className="text-xs text-muted-foreground">· {c.clubCount} clubes</span>
                    </label>
                  ))}
                </div>
              </details>
            )}
            {/* Clubes que já demitiram o usuário nesse save não voltam a
                aparecer aqui — ver fired_from_club_ids em src/lib/season-rollover.ts. */}
            <div className="max-h-[60vh] overflow-y-auto divide-y">
              {clubs.data?.filter((c: any) => !save.data?.fired_from_club_ids?.includes(c.id)).map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => chooseClub(c.id)}
                  className="w-full flex items-center justify-between py-3 hover:bg-muted/50 px-2 rounded text-left"
                >
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.competitions?.name ?? "—"} · Reputação {c.reputation}
                      {c.competitions?.playable === false && " · liga em segundo plano (vira jogável ao escolher)"}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatMoney((c.budget ?? 0) + (c.transfer_budget ?? 0))}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}