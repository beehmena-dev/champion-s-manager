// Versão web (Lovable Cloud): o "usuário atual" vem da sessão real de login.
import { supabase } from "@/integrations/supabase/client";

export async function getCurrentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Sem sessão ativa");
  return id;
}
