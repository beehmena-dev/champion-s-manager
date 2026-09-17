import { supabase } from "@/integrations/supabase/client";
import { STAFF_ROLES, generateCandidate, generateAIStaffCandidate, type StaffRole } from "@/game/staff";

const AI_STAFF_ROLES: StaffRole[] = ["coach", "fitness_coach"];

// Preenche treinador + preparador físico pros clubes de IA que ainda não têm
// (rodado a cada virada de temporada — ver src/lib/season-rollover.ts). Clube
// que já tem alguém no papel não é mexido, então quem já foi preenchido numa
// temporada anterior só volta a mudar se o cargo ficar vago por algum outro
// motivo (hoje não há demissão de staff de IA, então na prática é um preenchimento único).
export async function assignAIStaff(saveId: string, myClubId: string | null): Promise<void> {
  const { data: clubs } = await supabase
    .from("clubs").select("id, reputation").eq("save_id", saveId);
  const aiClubs = (clubs ?? []).filter((c) => c.id !== myClubId);
  if (aiClubs.length === 0) return;

  const { data: existingStaff } = await supabase
    .from("staff").select("club_id, role").eq("save_id", saveId).not("club_id", "is", null);
  const filled = new Set((existingStaff ?? []).map((s) => `${s.club_id}:${s.role}`));

  const rows: any[] = [];
  for (const c of aiClubs) {
    for (const role of AI_STAFF_ROLES) {
      if (filled.has(`${c.id}:${role}`)) continue;
      const candidate = generateAIStaffCandidate(role, c.reputation ?? 50);
      rows.push({ save_id: saveId, club_id: c.id, name: candidate.name, role: candidate.role, skill: candidate.skill, wage: candidate.wage });
    }
  }
  if (rows.length > 0) await supabase.from("staff").insert(rows);
}

const CANDIDATES_PER_ROLE = 2;

export async function ensureCandidatePool(saveId: string): Promise<void> {
  for (const role of STAFF_ROLES) {
    const { count } = await supabase
      .from("staff").select("id", { count: "exact", head: true })
      .eq("save_id", saveId).is("club_id", null).eq("role", role);
    const missing = CANDIDATES_PER_ROLE - (count ?? 0);
    if (missing <= 0) continue;
    const rows = Array.from({ length: missing }, () => {
      const c = generateCandidate(role);
      return { save_id: saveId, club_id: null, name: c.name, role: c.role, skill: c.skill, wage: c.wage };
    });
    await supabase.from("staff").insert(rows);
  }
}

export async function hireStaff(saveId: string, myClubId: string, staffId: string, role: StaffRole, today: string): Promise<void> {
  const { data: existing } = await supabase
    .from("staff").select("id").eq("club_id", myClubId).eq("role", role).maybeSingle();
  if (existing) throw new Error("Você já tem alguém nesse cargo — demita antes de contratar outro.");
  const { error } = await supabase.from("staff").update({ club_id: myClubId, hired_date: today }).eq("id", staffId);
  if (error) throw error;
}

export async function fireStaff(staffId: string): Promise<void> {
  await supabase.from("staff").delete().eq("id", staffId);
}
