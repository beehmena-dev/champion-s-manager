import { supabase } from "@/integrations/supabase/client";

export async function applyPressMoraleDelta(clubId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  const { data: club, error: selectError } = await supabase.from("clubs").select("morale").eq("id", clubId).single();
  if (selectError) throw selectError;
  if (!club) return;
  const next = Math.max(0, Math.min(100, (club.morale ?? 70) + delta));
  const { error: updateError } = await supabase.from("clubs").update({ morale: next }).eq("id", clubId);
  if (updateError) throw updateError;
}
