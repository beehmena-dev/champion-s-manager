import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/game-hooks";
import { INBOX_CATEGORY_LABEL, type InboxCategory } from "@/lib/inbox";
import { PageHeader, SubTabs, Pill, SplitView, EmptyState, type Tone } from "@/components/fm";
import { ClubCrest } from "@/components/club-crest";
import {
  Mail, Landmark, Newspaper, HeartPulse, ArrowLeftRight, Trophy, GraduationCap, FileText, ArrowRight, CheckCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/saves/$saveId/news")({
  component: NewsPage,
});

const CAT_TONE: Record<InboxCategory, Tone> = {
  board: "info", press: "neutral", medical: "danger", transfer: "warn",
  result: "ok", youth: "strategy", contract: "info", general: "neutral",
};
const CAT_ICON: Record<InboxCategory, typeof Mail> = {
  board: Landmark, press: Newspaper, medical: HeartPulse, transfer: ArrowLeftRight,
  result: Trophy, youth: GraduationCap, contract: FileText, general: Mail,
};

function NewsPage() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/news" });
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread" | InboxCategory>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const clubId = save.data?.my_club_id;

  const messages = useQuery({
    queryKey: ["inbox", saveId, clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase
      .from("inbox_messages")
      .select("*")
      .eq("save_id", saveId).eq("club_id", clubId!)
      .order("created_at", { ascending: false })
      .limit(120)).data ?? [],
  });

  const compQ = useQuery({
    queryKey: ["comp-of-club", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase.from("clubs").select("competition_id").eq("id", clubId!).single()).data,
  });
  const compId = compQ.data?.competition_id;

  const transfers = useQuery({
    queryKey: ["news-transfers", saveId],
    queryFn: async () => (await supabase
      .from("transfers")
      .select("*, players(name), from_club:clubs!transfers_from_club_id_fkey(id, name, crest_url, primary_color, secondary_color), to_club:clubs!transfers_to_club_id_fkey(id, name, crest_url, primary_color, secondary_color)")
      .eq("save_id", saveId).eq("status", "completed")
      .order("resolved_date", { ascending: false }).limit(15)).data ?? [],
  });

  const results = useQuery({
    queryKey: ["news-results", compId, clubId],
    enabled: !!compId && !!clubId,
    queryFn: async () => (await supabase
      .from("matches")
      .select("*, home:clubs!matches_home_club_id_fkey(id, name, crest_url, primary_color, secondary_color), away:clubs!matches_away_club_id_fkey(id, name, crest_url, primary_color, secondary_color)")
      .eq("competition_id", compId!).eq("played", true)
      .neq("home_club_id", clubId!).neq("away_club_id", clubId!)
      .order("match_date", { ascending: false }).limit(15)).data ?? [],
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inbox_messages").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox", saveId, clubId] });
      qc.invalidateQueries({ queryKey: ["inbox-unread", clubId] });
    },
  });
  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("inbox_messages").update({ read: true })
        .eq("save_id", saveId).eq("club_id", clubId!).eq("read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tudo marcado como lido.");
      qc.invalidateQueries({ queryKey: ["inbox", saveId, clubId] });
      qc.invalidateQueries({ queryKey: ["inbox-unread", clubId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const all = (messages.data ?? []) as any[];
  const unreadCount = all.filter((m) => !m.read).length;

  const catCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of all) c[m.category] = (c[m.category] ?? 0) + 1;
    return c;
  }, [all]);

  const shown = all.filter((m) =>
    filter === "all" ? true : filter === "unread" ? !m.read : m.category === filter,
  );
  const selected = shown.find((m) => m.id === selectedId) ?? shown[0] ?? null;

  function open(m: any) {
    setSelectedId(m.id);
    if (!m.read) markRead.mutate(m.id);
  }

  const tabs: { value: typeof filter; label: string; badge?: number }[] = [
    { value: "all", label: "Todas", badge: all.length || undefined },
    { value: "unread", label: "Não lidas", badge: unreadCount || undefined },
    ...(["board", "transfer", "medical", "result", "press", "youth"] as InboxCategory[])
      .filter((c) => catCounts[c])
      .map((c) => ({ value: c, label: INBOX_CATEGORY_LABEL[c], badge: catCounts[c] })),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Mail}
        title="Caixa de entrada"
        subtitle="Comunicados da diretoria, imprensa, departamento médico, mercado e resultados."
        actions={
          unreadCount > 0 ? (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              <CheckCheck className="size-3.5" /> Marcar todas como lidas
            </Button>
          ) : undefined
        }
      />

      {all.length > 0 && <SubTabs value={filter} onValueChange={setFilter} tabs={tabs} />}

      {all.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Nenhuma mensagem ainda"
          description="Assim que você avançar os dias, comunicados da diretoria, resultados e propostas de mercado aparecem aqui."
        />
      ) : (
        <SplitView
          list={
            <Card className="max-h-[560px] divide-y divide-border/50 overflow-y-auto p-0">
              {shown.map((m) => {
                const Icon = CAT_ICON[m.category as InboxCategory] ?? Mail;
                const isSel = selected?.id === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => open(m)}
                    className={`flex w-full gap-2.5 p-3 text-left transition-colors ${
                      isSel ? "bg-elevated" : "hover:bg-elevated/50"
                    } ${isSel ? "border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
                  >
                    <Icon className={`mt-0.5 size-4 shrink-0 ${m.read ? "text-muted-foreground" : "text-primary"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-xs ${m.read ? "text-muted-foreground" : "font-semibold text-foreground"}`}>
                          {m.sender}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{formatDate(m.game_date)}</span>
                      </div>
                      <div className={`truncate text-xs ${m.read ? "text-muted-foreground" : "font-medium text-primary"}`}>
                        {m.subject}
                      </div>
                      <p className="line-clamp-1 text-[11px] leading-relaxed text-muted-foreground">{m.body}</p>
                    </div>
                    {!m.read && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                );
              })}
              {shown.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">Nada nesta aba.</div>}
            </Card>
          }
          detail={
            <Card className="flex min-h-[300px] flex-col p-5">
              {selected ? (
                <>
                  <div className="border-b pb-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Pill tone={CAT_TONE[selected.category as InboxCategory] ?? "neutral"}>
                        {INBOX_CATEGORY_LABEL[selected.category as InboxCategory] ?? selected.category}
                      </Pill>
                      <span className="text-xs text-muted-foreground">{formatDate(selected.game_date)}</span>
                    </div>
                    <h3 className="font-display text-lg font-semibold">{selected.subject}</h3>
                    <div className="mt-1 text-xs text-muted-foreground">
                      De: <strong className="text-foreground">{selected.sender}</strong>
                    </div>
                  </div>
                  <p className="flex-1 whitespace-pre-line py-4 text-sm leading-relaxed text-foreground">{selected.body}</p>
                  {selected.link && (
                    <div className="border-t pt-3">
                      <Button asChild size="sm" className="gap-1.5">
                        <Link to={selected.link as string}>{selected.link_label ?? "Abrir"} <ArrowRight className="size-3.5" /></Link>
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="my-auto text-center text-xs text-muted-foreground">Selecione uma mensagem.</div>
              )}
            </Card>
          }
        />
      )}

      {/* Feed da liga — não são mensagens, é acompanhamento */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="fm-eyebrow mb-3">Transferências na liga</div>
          <div className="max-h-[320px] space-y-2 overflow-y-auto">
            {transfers.data?.map((t: any) => (
              <div key={t.id} className="border-t border-border/50 pt-2 text-sm first:border-t-0 first:pt-0">
                <div>
                  <span className="font-medium">{t.players?.name ?? "Jogador"}</span>{" "}
                  <span className="text-muted-foreground inline-flex items-center gap-1">
                    {t.from_club && <ClubCrest club={t.from_club} className="w-3.5 h-3.5" />} {t.from_club?.name ?? "livre"} → {t.to_club && <ClubCrest club={t.to_club} className="w-3.5 h-3.5" />} {t.to_club?.name ?? "?"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {t.fee > 0 ? formatMoney(t.fee) : "Livre"} · {t.resolved_date ? formatDate(t.resolved_date) : "—"}
                </div>
              </div>
            ))}
            {(transfers.data?.length ?? 0) === 0 && <p className="py-3 text-xs text-muted-foreground">Nenhuma transferência ainda.</p>}
          </div>
        </Card>

        <Card className="p-4">
          <div className="fm-eyebrow mb-3">Resultados da liga</div>
          <div className="max-h-[320px] space-y-2 overflow-y-auto">
            {results.data?.map((m: any) => (
              <div key={m.id} className="flex justify-between border-t border-border/50 pt-2 text-sm first:border-t-0 first:pt-0">
                <span className="inline-flex items-center gap-1">{m.home && <ClubCrest club={m.home} className="w-3.5 h-3.5" />} {m.home?.name ?? "?"} <span className="font-mono font-semibold">{m.home_score} × {m.away_score}</span> {m.away && <ClubCrest club={m.away} className="w-3.5 h-3.5" />} {m.away?.name ?? "?"}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{formatDate(m.match_date)}</span>
              </div>
            ))}
            {(results.data?.length ?? 0) === 0 && <p className="py-3 text-xs text-muted-foreground">Nenhum resultado ainda.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
