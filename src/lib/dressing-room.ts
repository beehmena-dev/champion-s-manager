import { supabase } from "@/integrations/supabase/client";
import {
  applyConversation, conversationOnCooldown,
  type ConversationTopic, type DressingRoomPlayer,
} from "@/game/dressing-room";

/**
 * Conversa individual do técnico com um jogador. Checa o cooldown, aplica o
 * efeito na moral e registra a data. Devolve a fala de retorno pra UI.
 */
export async function talkToPlayer(
  playerId: string,
  topic: ConversationTopic,
  gameDate: string,
): Promise<{ moraleDelta: number; response: string }> {
  const { data: p, error } = await supabase
    .from("players")
    .select("id, name, age, position, overall, morale, form, guaranteed_starter, last_talk_date, attributes")
    .eq("id", playerId).single();
  if (error || !p) throw error ?? new Error("Jogador não encontrado");

  const player = p as unknown as DressingRoomPlayer;
  const cd = conversationOnCooldown(player, gameDate);
  if (cd > 0) throw new Error(`Você já conversou com ${player.name} há pouco — aguarde ${cd} dia${cd > 1 ? "s" : ""}.`);

  const result = applyConversation(player, topic);
  const nextMorale = Math.max(0, Math.min(100, (player.morale ?? 70) + result.moraleDelta));
  const { error: upErr } = await supabase
    .from("players")
    .update({ morale: nextMorale, last_talk_date: gameDate })
    .eq("id", playerId);
  if (upErr) throw upErr;

  return result;
}
