import { supabase } from "@/integrations/supabase/client";
import { maxConcurrentScouting, scoutGainPerDay } from "@/game/scouting";

async function chiefScoutSkill(myClubId: string): Promise<number> {
  const { data } = await supabase.from("staff").select("skill").eq("club_id", myClubId).eq("role", "chief_scout").maybeSingle();
  return data?.skill ?? 0;
}

export async function startScouting(saveId: string, myClubId: string, playerId: string, today: string): Promise<void> {
  const [{ count }, skill] = await Promise.all([
    supabase.from("scouting_assignments").select("id", { count: "exact", head: true }).eq("club_id", myClubId).eq("status", "active"),
    chiefScoutSkill(myClubId),
  ]);
  const cap = maxConcurrentScouting(skill);
  if ((count ?? 0) >= cap) {
    throw new Error(`Sua equipe de scouts só acompanha ${cap} jogadores por vez.`);
  }
  const { error } = await supabase.from("scouting_assignments").insert({
    save_id: saveId, club_id: myClubId, player_id: playerId, status: "active", started_date: today,
  });
  if (error) throw error;
}

export async function cancelScouting(assignmentId: string): Promise<void> {
  await supabase.from("scouting_assignments").update({ status: "cancelled" }).eq("id", assignmentId);
}

// -----------------------------------------------------------------------------
// Chamado a cada advanceDays(): soma o progresso de olheiro nos jogadores sob
// observação e encerra a designação quando o conhecimento bate no teto.
// -----------------------------------------------------------------------------
export async function advanceScouting(myClubId: string, days: number): Promise<void> {
  const { data: assignments } = await supabase
    .from("scouting_assignments").select("id, player_id")
    .eq("club_id", myClubId).eq("status", "active");
  if (!assignments || assignments.length === 0) return;

  const [{ data: players }, skill] = await Promise.all([
    supabase.from("players").select("id, scout_knowledge").in("id", assignments.map((a) => a.player_id)),
    chiefScoutSkill(myClubId),
  ]);
  const knowledgeById = new Map((players ?? []).map((p) => [p.id, p.scout_knowledge]));

  const gain = scoutGainPerDay(skill) * days;
  for (const a of assignments) {
    const cur = knowledgeById.get(a.player_id) ?? 0;
    const next = Math.min(100, cur + gain);
    await supabase.from("players").update({ scout_knowledge: next }).eq("id", a.player_id);
    if (next >= 100) {
      await supabase.from("scouting_assignments").update({ status: "completed" }).eq("id", a.id);
    }
  }
}
