import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MatchResult } from "@/game/types";
import { clubColors } from "@/game/club-colors";
import { MatchPitch } from "@/components/match-pitch";

// -----------------------------------------------------------------------------
// Wrapper fino em torno do pitch 2D (match-pitch.tsx): busca cores reais do
// clube, número de camisa e capacidade do estádio (via Supabase) e repassa
// pro visualizador. O visualizador 3D (Three.js) que existia aqui foi
// removido por decisão do usuário (15/09/2026) — reconstrói depois se
// quiser, mas por ora o projeto foca só em motor + 2D.
// -----------------------------------------------------------------------------

export function MatchViewer({
  result, homeName, awayName, homeClubId, awayClubId,
  initialMinute = 0, maxMinute = 90, onReachMax,
}: {
  result: MatchResult;
  homeName: string;
  awayName: string;
  homeClubId?: string;
  awayClubId?: string;
  initialMinute?: number;
  maxMinute?: number;
  onReachMax?: () => void;
}) {
  const lineupIds = useMemo(
    () => [...(result.homeLineup ?? []), ...(result.awayLineup ?? [])].map((l) => l.playerId),
    [result.homeLineup, result.awayLineup],
  );

  const colors = useQuery({
    queryKey: ["match-viewer-scene", homeClubId, awayClubId, lineupIds.length],
    enabled: !!homeClubId && !!awayClubId,
    queryFn: async () => {
      if (!homeClubId || !awayClubId) throw new Error("Clube ausente");
      const [{ data, error }, { data: players }] = await Promise.all([
        supabase.from("clubs").select("id, short_name, primary_color, secondary_color, stadium_capacity")
          .in("id", [homeClubId, awayClubId]),
        lineupIds.length
          ? supabase.from("players").select("id, squad_number").in("id", lineupIds)
          : Promise.resolve({ data: [] as { id: string; squad_number: number | null }[] }),
      ]);
      if (error) throw error;
      const byId = new Map((data ?? []).map((c) => [c.id, c]));
      const homeC = byId.get(homeClubId) as { short_name?: string | null; stadium_capacity?: number } | undefined;
      return {
        home: clubColors(byId.get(homeClubId) ?? { id: homeClubId }),
        away: clubColors(byId.get(awayClubId) ?? { id: awayClubId }),
        homeCapacity: homeC?.stadium_capacity ?? 30000,
        numbers: new Map((players ?? []).map((p) => [p.id, p.squad_number ?? undefined] as const)),
      };
    },
  });

  return (
    <MatchPitch
      result={result} homeName={homeName} awayName={awayName}
      homeColors={colors.data?.home} awayColors={colors.data?.away} numbers={colors.data?.numbers}
      stadiumCapacity={colors.data?.homeCapacity}
      initialMinute={initialMinute} maxMinute={maxMinute} onReachMax={onReachMax}
    />
  );
}
