import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { injuryTypeLabel } from "@/game/medical";
import type { InjuryHistoryEntry } from "@/game/medical";
import { positionLabel } from "@/game/types";
import { PageHeader } from "@/components/fm";
import { NationalityFlag } from "@/components/nationality-flag";
import { HeartPulse } from "lucide-react";

export const Route = createFileRoute("/_authenticated/saves/$saveId/medical")({
  component: MedicalPage,
});

function MedicalPage() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/medical" });

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const clubId = save.data?.my_club_id;
  const todayISO = save.data?.game_date as string | undefined;

  const players = useQuery({
    queryKey: ["players-medical", clubId],
    enabled: !!clubId,
    queryFn: async () => (await supabase.from("players").select("*").eq("club_id", clubId!)).data ?? [],
  });

  if (!clubId || players.isLoading || !todayISO) {
    return <div className="text-muted-foreground">Carregando…</div>;
  }

  const all = (players.data ?? []) as any[];

  const injured = all.filter((p) => p.injured_until && p.injured_until >= todayISO);
  const suspended = all.filter((p) => (p.suspended_matches ?? 0) > 0);
  const withYellows = all
    .filter((p) => (p.yellow_cards_season ?? 0) > 0)
    .sort((a, b) => (b.yellow_cards_season ?? 0) - (a.yellow_cards_season ?? 0));
  const atRisk = all.filter(
    (p) => (!p.injured_until || p.injured_until < todayISO) && p.injury_risk_until && p.injury_risk_until >= todayISO,
  );

  // Histórico combinado: achata injury_history de todos os jogadores, ordenado do mais recente pro mais antigo.
  const history: { player: any; entry: InjuryHistoryEntry }[] = [];
  for (const p of all) {
    for (const entry of (p.injury_history as InjuryHistoryEntry[] | null) ?? []) {
      history.push({ player: p, entry });
    }
  }
  history.sort((a, b) => (a.entry.started_at < b.entry.started_at ? 1 : -1));

  return (
    <div className="space-y-4">
      <PageHeader
        icon={HeartPulse}
        tone="danger"
        title="Central Médica"
        subtitle="Suspensão vale entre competições — o contador é do jogador, não da competição."
      />

      <Card className="p-4">
        <div className="fm-eyebrow mb-3">Lesionados ({injured.length})</div>
        {injured.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum jogador lesionado no momento.</p>
        ) : (
          <div className="space-y-2">
            {injured.map((p) => {
              const daysLeft = Math.round((new Date(p.injured_until).getTime() - new Date(todayISO).getTime()) / 86400000);
              const [, m, d] = (p.injured_until as string).split("-");
              return (
                <div key={p.id} className="flex items-center justify-between text-sm border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
                  <div>
                    <Link to="/saves/$saveId/players/$playerId" params={{ saveId, playerId: p.id }} className="font-medium hover:underline">
                      <NationalityFlag nationality={p.nationality} /> {p.name}
                    </Link>
                    <span className="text-muted-foreground"> · {positionLabel(p.natural_position ?? p.position)}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-danger">{injuryTypeLabel(p.injury_type)}</div>
                    <div className="text-xs text-muted-foreground">
                      volta {d}/{m} {daysLeft > 0 ? `(${daysLeft}d)` : "(a qualquer momento)"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="fm-eyebrow mb-3">Suspensos ({suspended.length})</div>
        {suspended.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum jogador suspenso no momento.</p>
        ) : (
          <div className="space-y-2">
            {suspended.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
                <div>
                  <Link to="/saves/$saveId/players/$playerId" params={{ saveId, playerId: p.id }} className="font-medium hover:underline">
                    <NationalityFlag nationality={p.nationality} /> {p.name}
                  </Link>
                  <span className="text-muted-foreground"> · {positionLabel(p.natural_position ?? p.position)}</span>
                </div>
                <div className="font-medium text-warn">
                  {p.suspended_matches} jogo{p.suspended_matches === 1 ? "" : "s"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {withYellows.length > 0 && (
        <Card className="p-4">
          <div className="fm-eyebrow mb-3">Cartões amarelos na temporada ({withYellows.length})</div>
          <p className="fm-eyebrow mb-3">3 amarelos na temporada = 1 jogo de suspensão automática.</p>
          <div className="space-y-2">
            {withYellows.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
                <div>
                  <Link to="/saves/$saveId/players/$playerId" params={{ saveId, playerId: p.id }} className="font-medium hover:underline">
                    <NationalityFlag nationality={p.nationality} /> {p.name}
                  </Link>
                  <span className="text-muted-foreground"> · {positionLabel(p.natural_position ?? p.position)}</span>
                </div>
                <div className={p.yellow_cards_season >= 2 ? "font-medium text-warn" : "text-muted-foreground"}>
                  {p.yellow_cards_season}/3 {p.yellow_cards_season >= 2 && "⚠️"}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {atRisk.length > 0 && (
        <Card className="p-4">
          <div className="fm-eyebrow mb-3">Recém-recuperados — risco de recaída ({atRisk.length})</div>
          <div className="space-y-2">
            {atRisk.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
                <div>
                  <Link to="/saves/$saveId/players/$playerId" params={{ saveId, playerId: p.id }} className="font-medium hover:underline">
                    <NationalityFlag nationality={p.nationality} /> {p.name}
                  </Link>
                  <span className="text-muted-foreground"> · {positionLabel(p.natural_position ?? p.position)}</span>
                </div>
                <span className="text-xs text-muted-foreground">escalar com cautela</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="fm-eyebrow mb-3">Histórico médico</div>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma lesão registrada ainda nesta temporada.</p>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {history.map(({ player, entry }, i) => (
              <div key={i} className="flex items-center justify-between text-xs border-t border-border/50 pt-1.5 first:border-t-0 first:pt-0">
                <div>
                  <span className="font-medium">{player.name}</span>
                  <span className="text-muted-foreground"> — {injuryTypeLabel(entry.type)}{entry.relapse ? " (recaída)" : ""}</span>
                </div>
                <div className="text-muted-foreground">
                  {entry.started_at} → {entry.expected_return} ({entry.days}d)
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}