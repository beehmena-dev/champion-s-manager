import { supabase } from "@/integrations/supabase/client";

// -----------------------------------------------------------------------------
// Caixa de entrada — helper de escrita. As mensagens são geradas ao avançar os
// dias (src/lib/advance-day.ts) e ao receber propostas (src/lib/ai-transfers.ts).
// A tela fica em src/routes/_authenticated/saves.$saveId.news.tsx.
// -----------------------------------------------------------------------------

export type InboxCategory =
  | "board" | "press" | "medical" | "transfer" | "result" | "youth" | "contract" | "general";

export interface InboxDraft {
  category: InboxCategory;
  sender: string;
  subject: string;
  body?: string;
  /** Rota relativa pra ação — ex. `/saves/${saveId}/market`. */
  link?: string;
  linkLabel?: string;
}

export const INBOX_CATEGORY_LABEL: Record<InboxCategory, string> = {
  board: "Diretoria",
  press: "Imprensa",
  medical: "Dep. Médico",
  transfer: "Mercado",
  result: "Resultado",
  youth: "Base",
  contract: "Contrato",
  general: "Geral",
};

/**
 * Insere uma ou mais mensagens na caixa de entrada do clube. Nunca lança —
 * a caixa de entrada é acessório: se falhar, o avanço do dia continua (só
 * loga no console). Recebe um client Supabase opcional pra reaproveitar o
 * mesmo do fluxo que chama (advance-day usa o global).
 */
export async function pushInbox(
  saveId: string,
  clubId: string,
  gameDate: string,
  drafts: InboxDraft | InboxDraft[],
  client = supabase,
): Promise<void> {
  const list = Array.isArray(drafts) ? drafts : [drafts];
  if (list.length === 0) return;
  const rows = list.map((d) => ({
    save_id: saveId,
    club_id: clubId,
    game_date: gameDate,
    category: d.category,
    sender: d.sender,
    subject: d.subject,
    body: d.body ?? "",
    link: d.link ?? null,
    link_label: d.linkLabel ?? null,
  }));
  const { error } = await client.from("inbox_messages").insert(rows);
  if (error) console.warn("[inbox] falha ao inserir mensagem:", error.message);
}
