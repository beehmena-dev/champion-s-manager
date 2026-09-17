import { ensureLocalSession } from "./auto-session";

// Perfil local único, sem login (ver src/lib/auto-session.ts).
export async function getCurrentUserId(): Promise<string> {
  return ensureLocalSession();
}
