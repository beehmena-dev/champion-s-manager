import { supabase } from "@/integrations/supabase/client";
import { unrestReason, type UnrestReason, unrestDailyChance } from "@/game/unrest";
import { initialBidFee } from "@/game/transfer-negotiation";

const OFFER_LIFETIME_DAYS = 5;

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

/**
 * Chamado a cada advanceDays(): com pequena chance por dia, um jogador
 * insatisfeito (moral baixa ou contrato perto do fim) formaliza um pedido de
 * transferência — ver src/game/unrest.ts.
 */
export async function refreshTransferRequests(saveId: string, myClubId: string, today: string, daysAdvanced: number): Promise<void> {
  const { data: pending } = await supabase.from("transfer_requests")
    .select("id").eq("save_id", saveId).eq("club_id", myClubId).eq("status", "pending").limit(1);
  if (pending && pending.length > 0) return; // só um pedido pendente por vez

  const { data: roster } = await supabase.from("players")
    .select("id, morale, contract_until, guaranteed_starter, bench_streak").eq("club_id", myClubId);
  if (!roster || roster.length === 0) return;

  const withReason = roster
    .map((p) => ({ p, reason: unrestReason(p as any, today) }))
    .filter((x): x is { p: typeof roster[number]; reason: UnrestReason } => x.reason !== null);
  if (withReason.length === 0) return;

  for (let i = 0; i < daysAdvanced; i++) {
    for (const { p, reason } of withReason) {
      if (Math.random() < unrestDailyChance(reason)) {
        const { error } = await supabase.from("transfer_requests").insert({
          save_id: saveId, player_id: p.id, club_id: myClubId, status: "pending", reason, created_date: today,
        });
        if (error) throw error;
        return;
      }
    }
  }
}

/** Usuário pede pro jogador ficar — dá um respiro de moral e encerra o pedido (por ora). */
export async function dismissTransferRequest(requestId: string, playerId: string): Promise<void> {
  const { data: player } = await supabase.from("players").select("morale").eq("id", playerId).single();
  if (player) {
    const { error: moraleError } = await supabase.from("players").update({ morale: Math.min(100, (player.morale ?? 70) + 15) }).eq("id", playerId);
    if (moraleError) throw moraleError;
  }
  const { error } = await supabase.from("transfer_requests").update({ status: "dismissed" }).eq("id", requestId);
  if (error) throw error;
}

/**
 * Usuário decide liberar o jogador: o clube procura um comprador de IA na
 * hora (mesma precificação usada pelas sondagens espontâneas em
 * refreshTransferOffers) e abre uma negociação real — o usuário responde a
 * ela normalmente na tela de Mercado, em "Propostas recebidas".
 */
export async function listTransferRequest(requestId: string, saveId: string, myClubId: string, today: string): Promise<{ found: boolean }> {
  const { data: req } = await supabase.from("transfer_requests").select("*").eq("id", requestId).single();
  if (!req || req.status !== "pending") throw new Error("Esse pedido já foi resolvido");

  const { data: player } = await supabase.from("players").select("id, name, market_value").eq("id", req.player_id).single();
  const { error: statusError } = await supabase.from("transfer_requests").update({ status: "listed" }).eq("id", requestId);
  if (statusError) throw statusError;
  if (!player) return { found: false };

  const { data: myClub } = await supabase.from("clubs").select("reputation").eq("id", myClubId).single();
  const { data: aiClubs } = await supabase.from("clubs")
    .select("id, transfer_budget, reputation, name").eq("save_id", saveId).neq("id", myClubId);
  if (!aiClubs || aiClubs.length === 0) return { found: false };

  const affordable = aiClubs.filter((c) => {
    const fee = initialBidFee(player.market_value, c.reputation, myClub?.reputation ?? 50);
    return fee <= c.transfer_budget * 1.5;
  });
  if (affordable.length === 0) return { found: false };

  const bidder = affordable[Math.floor(Math.random() * affordable.length)];
  const fee = initialBidFee(player.market_value, bidder.reputation, myClub?.reputation ?? 50);

  const { error } = await supabase.from("transfer_offers").insert({
    save_id: saveId, player_id: player.id, seller_club_id: myClubId, buyer_club_id: bidder.id,
    initiator: "ai", current_fee: fee, last_actor: "ai", status: "pending",
    rounds: 1, expires_date: addDays(today, OFFER_LIFETIME_DAYS), deal_type: "permanent",
  });
  if (error) throw error;
  return { found: true };
}
