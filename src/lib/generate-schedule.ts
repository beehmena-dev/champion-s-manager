import { supabase } from "@/integrations/supabase/client";
import { doubleRoundRobin, scheduleDates } from "@/game/schedule";

// Gera o calendário para todas as competições do save (ou só uma, se compId for passado).
export async function generateScheduleForSave(saveId: string, startDate: string, onlyCompId?: string) {
  let compsQuery = supabase.from("competitions").select("id, season").eq("save_id", saveId);
  if (onlyCompId) compsQuery = compsQuery.eq("id", onlyCompId);
  const { data: comps, error: cErr } = await compsQuery;
  if (cErr) throw cErr;

  for (const comp of comps ?? []) {
    const { data: clubs, error: clErr } = await supabase
      .from("clubs")
      .select("id")
      .eq("competition_id", comp.id);
    if (clErr) throw clErr;
    if (!clubs || clubs.length < 2) continue;

    const rounds = doubleRoundRobin(clubs.map((c) => c.id));
    const dates = scheduleDates(startDate, rounds.length);
    const payload: any[] = [];
    rounds.forEach((pairs, i) => {
      pairs.forEach(([home, away]) => {
        payload.push({
          save_id: saveId,
          competition_id: comp.id,
          season: comp.season,
          round: i + 1,
          match_date: dates[i],
          home_club_id: home,
          away_club_id: away,
          played: false,
        });
      });
    });

    // batch insert
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase.from("matches").insert(payload.slice(i, i + 500));
      if (error) throw error;
    }
    const { error: compError } = await supabase.from("competitions").update({ total_rounds: rounds.length, current_round: 0 }).eq("id", comp.id);
    if (compError) throw compError;
  }
}