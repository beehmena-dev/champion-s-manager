import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard, Pill } from "@/components/fm";
import { Link } from "@tanstack/react-router";
import { Users, Crown, Shield, Star, MessageSquare, Smile } from "lucide-react";
import { toast } from "sonner";
import {
  hierarchyTiers, dressingRoomAtmosphere, conversationOnCooldown,
  CONVERSATION_TOPICS, HIERARCHY_LABEL,
  type DressingRoomPlayer, type HierarchyTier, type ConversationTopic,
} from "@/game/dressing-room";
import { talkToPlayer } from "@/lib/dressing-room";

const TIER_META: Record<HierarchyTier, { icon: typeof Crown; tone: "warn" | "info" | "neutral" }> = {
  leader: { icon: Crown, tone: "warn" },
  very_influential: { icon: Shield, tone: "info" },
  influential: { icon: Star, tone: "neutral" },
  squad: { icon: Users, tone: "neutral" },
};

export function DressingRoomView({
  saveId, clubId, gameDate,
}: { saveId: string; clubId: string; gameDate: string }) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const players = useQuery({
    queryKey: ["players", clubId],
    queryFn: async () => (await supabase.from("players").select("*").eq("club_id", clubId)).data ?? [],
  });
  const club = useQuery({
    queryKey: ["club-board-confidence", clubId],
    queryFn: async () => (await supabase.from("clubs").select("board_confidence, competition_id").eq("id", clubId).single()).data,
  });
  const form = useQuery({
    queryKey: ["recent-form", clubId],
    queryFn: async () => {
      const { data } = await supabase
        .from("matches").select("home_club_id, home_score, away_score")
        .eq("save_id", saveId)
        .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
        .eq("played", true).order("match_date", { ascending: false }).limit(6);
      return [...(data ?? [])].reverse().map((m) => {
        const isHome = m.home_club_id === clubId;
        const my = (isHome ? m.home_score : m.away_score) ?? 0;
        const opp = (isHome ? m.away_score : m.home_score) ?? 0;
        return (my > opp ? "V" : my < opp ? "D" : "E") as "V" | "E" | "D";
      });
    },
  });

  const talk = useMutation({
    mutationFn: (v: { playerId: string; topic: ConversationTopic }) => talkToPlayer(v.playerId, v.topic, gameDate),
    onSuccess: (r) => {
      setFeedback(r.response);
      toast.success(`Moral ${r.moraleDelta >= 0 ? "+" : ""}${r.moraleDelta}`);
      qc.invalidateQueries({ queryKey: ["players", clubId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha na conversa"),
  });

  if (players.isLoading || !players.data) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  const list = (players.data as any[]) as DressingRoomPlayer[];
  const atmosphere = dressingRoomAtmosphere({
    players: list,
    boardConfidence: club.data?.board_confidence ?? 60,
    recentForm: form.data ?? [],
  });
  const tiers = hierarchyTiers(list);
  const byTier = (t: HierarchyTier) => tiers.filter((x) => x.tier === t);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Coesão do grupo" icon={Smile} tone={atmosphere.cohesion.value >= 60 ? "ok" : atmosphere.cohesion.value >= 40 ? "warn" : "danger"}
          value={atmosphere.cohesion.label} hint={`${atmosphere.cohesion.value}%`} />
        <MetricCard label="Apoio ao treinador" icon={Crown} tone={atmosphere.managerSupport.value >= 60 ? "ok" : atmosphere.managerSupport.value >= 40 ? "warn" : "danger"}
          value={atmosphere.managerSupport.label} hint={`${atmosphere.managerSupport.value}%`} />
        <MetricCard label="Moral do vestiário" icon={Users} tone={atmosphere.morale.value >= 60 ? "ok" : atmosphere.morale.value >= 40 ? "warn" : "danger"}
          value={atmosphere.morale.label} hint={`${atmosphere.morale.value}%`} />
      </div>

      {(["leader", "very_influential", "influential", "squad"] as HierarchyTier[]).map((tier) => {
        const rows = byTier(tier);
        if (rows.length === 0) return null;
        const M = TIER_META[tier];
        return (
          <Card key={tier} className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <M.icon className={`size-4 ${M.tone === "warn" ? "text-warn" : M.tone === "info" ? "text-info" : "text-muted-foreground"}`} />
              <span className="fm-eyebrow">{HIERARCHY_LABEL[tier]} · {rows.length}</span>
            </div>
            <div className={tier === "squad" ? "grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" : "grid gap-2 sm:grid-cols-2"}>
              {rows.map(({ player: p }) => {
                const cd = conversationOnCooldown(p, gameDate);
                const mor = p.morale ?? 70;
                return (
                  <div key={p.id} className="rounded-lg border bg-elevated/40 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        to="/saves/$saveId/players/$playerId"
                        params={{ saveId, playerId: p.id }}
                        className="truncate text-sm font-medium hover:text-primary hover:underline"
                      >
                        {p.name}
                      </Link>
                      <Pill tone={mor >= 60 ? "ok" : mor >= 40 ? "neutral" : "danger"}>{mor}</Pill>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{p.position} · {p.overall} · {p.age} anos</div>

                    {tier !== "squad" && (
                      openId === p.id ? (
                        <div className="mt-2 space-y-1 border-t pt-2">
                          {CONVERSATION_TOPICS.map((t) => (
                            <button
                              key={t.id}
                              disabled={talk.isPending || cd > 0}
                              onClick={() => talk.mutate({ playerId: p.id, topic: t.id })}
                              title={t.hint}
                              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] text-foreground transition-colors hover:bg-background disabled:opacity-50"
                            >
                              <MessageSquare className="size-3 text-primary shrink-0" /> {t.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          onClick={() => { setOpenId(p.id); setFeedback(null); }}
                          disabled={cd > 0}
                          className="mt-2 w-full rounded border border-border/60 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                        >
                          {cd > 0 ? `Conversou recentemente (${cd}d)` : "Conversar"}
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {feedback && (
        <Card className="flex items-start gap-2 border-primary/30 bg-primary/5 p-3 text-sm">
          <MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>{feedback}</p>
        </Card>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        Hierarquia e clima são calculados a partir de liderança, moral e resultados recentes. Conversas têm limite de 10 dias por jogador.
      </p>
    </div>
  );
}
