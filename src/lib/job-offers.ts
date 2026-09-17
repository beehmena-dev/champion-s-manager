import { supabase } from "@/integrations/supabase/client";
import { jobOfferDailyChance } from "@/game/job-offers";

const OFFER_LIFETIME_DAYS = 10;

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

/**
 * Chamado a cada advanceDays(): (1) expira sondagens vencidas, (2) com
 * pequena chance por dia avançado, um clube de reputação maior sonda o
 * usuário — só se ele estiver indo bem no clube atual (ver src/game/job-offers.ts).
 * A UI descobre a sondagem nova reconsultando ["pending-job-offer", saveId]
 * depois do invalidateQueries() padrão que já roda após todo avanço.
 */
export async function refreshJobOffers(saveId: string, myClubId: string, today: string, daysAdvanced: number): Promise<void> {
  const { error: expireError } = await supabase.from("job_offers")
    .update({ status: "expired" })
    .eq("save_id", saveId).eq("status", "pending").lt("expires_date", today);
  if (expireError) throw expireError;

  const { data: pending } = await supabase.from("job_offers")
    .select("id").eq("save_id", saveId).eq("status", "pending").limit(1);
  if (pending && pending.length > 0) return; // só uma sondagem pendente por vez

  const [{ data: myClub }, { data: save }] = await Promise.all([
    supabase.from("clubs").select("reputation, board_confidence").eq("id", myClubId).single(),
    supabase.from("saves").select("manager_reputation").eq("id", saveId).single(),
  ]);
  if (!myClub) return;
  const managerReputation = save?.manager_reputation ?? 50;

  const { data: candidates } = await supabase.from("clubs")
    .select("id, reputation")
    .eq("save_id", saveId).neq("id", myClubId).gt("reputation", myClub.reputation);
  if (!candidates || candidates.length === 0) return;

  const standing = { reputation: myClub.reputation, boardConfidence: myClub.board_confidence };
  for (let i = 0; i < daysAdvanced; i++) {
    for (const c of candidates) {
      const chance = jobOfferDailyChance(standing, c.reputation, managerReputation);
      if (chance > 0 && Math.random() < chance) {
        const { error } = await supabase.from("job_offers").insert({
          save_id: saveId, offering_club_id: c.id,
          offer_date: today, expires_date: addDays(today, OFFER_LIFETIME_DAYS), status: "pending",
        });
        if (error) throw error;
        return;
      }
    }
  }
}

export async function respondToJobOffer(offerId: string, saveId: string, action: "accept" | "decline"): Promise<{ accepted: boolean }> {
  const { data: offer } = await supabase.from("job_offers").select("*").eq("id", offerId).single();
  if (!offer || offer.status !== "pending") throw new Error("Essa sondagem já foi encerrada");

  if (action === "decline") {
    const { error } = await supabase.from("job_offers").update({ status: "declined" }).eq("id", offerId);
    if (error) throw error;
    return { accepted: false };
  }

  // Nenhuma dessas escritas checava erro — se "my_club_id" não gravar de
  // verdade, o usuário via "sondagem aceita" mas continuava no clube
  // antigo, com o job_offers já marcado accepted (não dá mais pra
  // reconsultar a sondagem pra tentar de novo).
  const { error: offerError } = await supabase.from("job_offers").update({ status: "accepted" }).eq("id", offerId);
  if (offerError) throw offerError;
  const { error: saveError } = await supabase.from("saves").update({ my_club_id: offer.offering_club_id }).eq("id", saveId);
  if (saveError) throw saveError;
  // Chegando num clube novo, a diretoria começa com confiança "normal" — não
  // carrega a confiança acumulada (ou perdida) no clube anterior.
  const { error: clubError } = await supabase.from("clubs").update({ board_confidence: 60 }).eq("id", offer.offering_club_id);
  if (clubError) throw clubError;
  return { accepted: true };
}
