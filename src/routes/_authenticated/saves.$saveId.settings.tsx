import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/fm";
import { Settings, Sun, Moon, Globe2, ShieldCheck, Save as SaveIcon } from "lucide-react";
import { getStoredTheme, setTheme, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/saves/$saveId/settings")({
  head: () => ({ meta: [{ title: "Configurações — TáticaFC" }] }),
  component: SettingsPage,
});

// -----------------------------------------------------------------------------
// Item 09 do backlog (FootSim): "configurações de carreira" — autosave,
// países/ligas ativas, idioma/tema, edição segura pós-início.
//
// Escopo real (não fabricado):
// - Tema: de fato liga/desliga a classe .dark (já existia inteira em
//   styles.css, nunca tinha sido usada) — preferência de APP/device, não do
//   save (por isso localStorage via src/lib/theme.ts, não coluna no banco).
// - Ligas ativas: o toggle playable/background já existia só na tela de
//   setup, só ANTES de escolher clube. Aqui vira uma tela revisitável a
//   qualquer momento da carreira, com a trava de edição segura: uma liga que
//   já tem partida jogada não pode voltar pra segundo plano (perderia dado
//   real já simulado), e a liga do seu próprio clube nunca pode ser
//   desligada. Ligar uma liga (background→jogável) continua sempre livre —
//   só adiciona detalhe, nunca destrói nada.
// - Autosave: NÃO existe um controle de frequência fake aqui. Nesta
//   arquitetura (Postgres local via PostgREST, sem sessão em memória) toda
//   ação já grava direto no arquivo local na hora — não existe "progresso
//   não salvo" pra proteger com um intervalo. A seção abaixo explica isso em
//   vez de fingir que tem um dial que não faz nada.
// - Idioma: a interface é 100% português por decisão de produto, sem
//   infraestrutura de i18n — mostrado travado, sem seletor funcional falso.
// -----------------------------------------------------------------------------
function SettingsPage() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/settings" });
  const qc = useQueryClient();
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => {
      const { data, error } = await supabase.from("saves").select("*").eq("id", saveId).single();
      if (error) throw error;
      return data;
    },
  });

  const myClub = useQuery({
    queryKey: ["settings-my-club", saveId, save.data?.my_club_id],
    enabled: !!save.data?.my_club_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs").select("id, competition_id").eq("id", save.data!.my_club_id!).single();
      if (error) throw error;
      return data;
    },
  });

  const comps = useQuery({
    queryKey: ["settings-comps", saveId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitions")
        .select("id, name, playable, type, clubs:clubs!clubs_competition_id_fkey(id)")
        .eq("save_id", saveId).eq("type", "league").order("name");
      if (error) throw error;
      return (data ?? []).map((c: any) => ({ id: c.id, name: c.name, playable: c.playable, clubCount: c.clubs?.length ?? 0 }));
    },
  });

  // Quais ligas já têm pelo menos 1 partida jogada nesta save — define a
  // trava de edição segura (desligar uma dessas perderia dado real).
  const playedCompIds = useQuery({
    queryKey: ["settings-played-comps", saveId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches").select("competition_id").eq("save_id", saveId).eq("played", true);
      if (error) throw error;
      return new Set((data ?? []).map((m) => m.competition_id).filter(Boolean) as string[]);
    },
  });

  async function toggleLeaguePlayable(compId: string, next: boolean) {
    const { error } = await supabase.from("competitions").update({ playable: next }).eq("id", compId);
    if (error) return toast.error(error.message);
    toast.success(next ? "Liga passou a rodar em simulação completa." : "Liga voltou a rodar em segundo plano.");
    await comps.refetch();
  }

  function handleTheme(next: Theme) {
    setTheme(next);
    setThemeState(next);
  }

  return (
    <div className="space-y-4">
      <PageHeader icon={Settings} title="Configurações" subtitle="Preferências de aparência e como esta carreira roda." />

      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <div className="fm-eyebrow flex items-center gap-2">
          <Sun className="size-3.5" /> Aparência
        </div>
        <p className="text-xs text-muted-foreground">
          Vale pro app nesta máquina, não é salvo por carreira.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleTheme("light")}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              theme === "light" ? "border-primary bg-primary text-primary-foreground font-semibold" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sun className="size-4" /> Claro
          </button>
          <button
            type="button"
            onClick={() => handleTheme("dark")}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              theme === "dark" ? "border-primary bg-primary text-primary-foreground font-semibold" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Moon className="size-4" /> Escuro
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <div className="fm-eyebrow flex items-center gap-2">
          <Globe2 className="size-3.5" /> Ligas em simulação completa
        </div>
        <p className="text-xs text-muted-foreground">
          Ligas jogáveis têm simulação completa (jogadores evoluem dia a dia, elencos detalhados). As demais rodam em
          segundo plano — resultados e tabela seguem, com simulação leve. A liga do seu clube e qualquer liga que já
          tenha partida jogada nesta carreira não podem voltar pra segundo plano (perderia dado real já simulado).
        </p>
        {comps.data && comps.data.length > 0 ? (
          <div className="divide-y rounded-md border">
            {comps.data.map((c) => {
              const isOwnLeague = myClub.data?.competition_id === c.id;
              const hasPlayed = playedCompIds.data?.has(c.id) ?? false;
              const lockedOn = c.playable && (isOwnLeague || hasPlayed);
              return (
                <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={c.playable}
                    disabled={lockedOn}
                    onChange={(e) => toggleLeaguePlayable(c.id, e.target.checked)}
                  />
                  <span className={c.playable ? "font-medium" : "text-muted-foreground"}>{c.name}</span>
                  <span className="text-xs text-muted-foreground">· {c.clubCount} clubes</span>
                  {isOwnLeague && <span className="text-xs text-primary">· sua liga</span>}
                  {!isOwnLeague && lockedOn && <span className="text-xs text-muted-foreground">· já tem partida jogada</span>}
                </label>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Globe2} title="Nenhuma liga encontrada" />
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
        <div className="fm-eyebrow flex items-center gap-2">
          <SaveIcon className="size-3.5" /> Salvamento
        </div>
        <p className="text-xs text-muted-foreground">
          Não existe um botão "salvar" nem um intervalo de autosave pra configurar: cada ação (avançar dia, mudar
          tática, negociar um jogador) já grava direto no arquivo local desta carreira na hora que acontece. Não há
          progresso não salvo pra perder.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
        <div className="fm-eyebrow flex items-center gap-2">
          <ShieldCheck className="size-3.5" /> Idioma
        </div>
        <p className="text-xs text-muted-foreground">
          Português (Brasil) — único idioma disponível no momento.
        </p>
      </div>
    </div>
  );
}
