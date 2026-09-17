import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/desktop-mode";
import type { Seed } from "./seed-import";

// Biblioteca de bases importadas — evita ter que reenviar o mesmo seed.json
// toda vez que um save novo é criado (ver src/routes/.../saves.$saveId.setup.tsx).

export interface SeedLibraryEntry {
  id: string;
  name: string;
  clubs_count: number;
  players_count: number;
  created_at: string;
}

export async function saveSeedToLibrary(name: string, seed: Seed): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  // Evita duplicar a mesma base a cada save novo — se já existe uma entrada
  // com esse nome pra esse usuário, não reinsere.
  const { count } = await supabase
    .from("seed_library").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("name", name);
  if ((count ?? 0) > 0) return;
  const clubsCount = seed.clubs.length;
  const playersCount = seed.clubs.reduce((a, c) => a + (c.players?.length ?? 0), 0);
  const { error } = await supabase.from("seed_library").insert({
    user_id: userId, name, seed: seed as any,
    clubs_count: clubsCount, players_count: playersCount,
  });
  if (error) throw error;
}

export async function listSeedLibrary(): Promise<SeedLibraryEntry[]> {
  const { data } = await supabase
    .from("seed_library")
    .select("id, name, clubs_count, players_count, created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function loadSeedFromLibrary(id: string): Promise<Seed> {
  const { data, error } = await supabase.from("seed_library").select("seed").eq("id", id).single();
  if (error || !data) throw error ?? new Error("Base não encontrada");
  return data.seed as unknown as Seed;
}

export async function deleteSeedFromLibrary(id: string): Promise<void> {
  const { error } = await supabase.from("seed_library").delete().eq("id", id);
  if (error) throw error;
}
