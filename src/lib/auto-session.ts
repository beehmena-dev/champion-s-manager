import { supabase } from "@/integrations/supabase/client";

// O jogo é single-player e roda "na máquina" — não tem tela de login.
// Mesmo assim o banco continua protegido por RLS por usuário, então
// criamos/reutilizamos silenciosamente um perfil local: as credenciais
// ficam guardadas no próprio navegador e nunca são pedidas ao jogador.
const KEY = "taticafc-local-profile";

type LocalProfile = { email: string; password: string };

function readProfile(): LocalProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalProfile;
    return parsed?.email && parsed?.password ? parsed : null;
  } catch {
    return null;
  }
}

function createProfile(): LocalProfile {
  const id = crypto.randomUUID();
  const profile: LocalProfile = {
    email: `jogador-${id}@taticafc.app`,
    password: `tfc-${crypto.randomUUID()}`,
  };
  localStorage.setItem(KEY, JSON.stringify(profile));
  return profile;
}

let inFlight: Promise<string> | null = null;

export async function ensureLocalSession(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;

  inFlight ??= (async () => {
    const existing = readProfile();
    if (existing) {
      const { data: signedIn } = await supabase.auth.signInWithPassword(existing);
      if (signedIn.session?.user) return signedIn.session.user.id;
    }

    const profile = existing ?? createProfile();
    const { error } = await supabase.auth.signUp(profile);
    if (error) throw error;

    const { data: after } = await supabase.auth.getSession();
    if (after.session?.user) return after.session.user.id;

    const { data: retry, error: retryError } = await supabase.auth.signInWithPassword(profile);
    if (retryError) throw retryError;
    if (!retry.session?.user) throw new Error("Não consegui abrir o perfil local do jogo");
    return retry.session.user.id;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
