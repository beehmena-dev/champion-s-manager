import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSave(saveId: string) {
  return useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saves")
        .select("*")
        .eq("id", saveId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useMyClub(saveId: string, clubId: string | null | undefined) {
  return useQuery({
    queryKey: ["club", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("*, competitions!clubs_competition_id_fkey(*)")
        .eq("id", clubId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useClubPlayers(clubId: string | null | undefined) {
  return useQuery({
    queryKey: ["players", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("club_id", clubId!)
        .order("overall", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function formatMoney(n: number | null | undefined) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(0)}k`;
  return `${sign}R$ ${abs}`;
}

export function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}