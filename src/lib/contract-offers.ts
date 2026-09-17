import { supabase } from "@/integrations/supabase/client";
import { evaluateContractOffer, MAX_CONTRACT_ROUNDS } from "@/game/contract-negotiation";

function addYears(iso: string, years: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().split("T")[0];
}

export type ContractOutcome =
  | { status: "completed"; wage: number }
  | { status: "pending"; wage: number } // empresário contrapropôs, aguardando o usuário
  | { status: "rejected" };

async function applyRenewal(
  playerId: string, wage: number, years: number, today: string,
  releaseClause?: number | null, guaranteedStarter?: boolean,
) {
  const { error } = await supabase.from("players").update({
    wage, contract_until: addYears(today, years), release_clause: releaseClause ?? null,
    guaranteed_starter: guaranteedStarter ?? false, bench_streak: 0,
  }).eq("id", playerId);
  if (error) throw error;
}

export async function offerRenewal(
  saveId: string, myClubId: string, player: { id: string; wage: number; overall: number; age: number },
  wage: number, years: number, today: string, releaseClause?: number | null, guaranteedStarter?: boolean,
): Promise<ContractOutcome> {
  const decision = evaluateContractOffer({
    offeredWage: wage, currentWage: player.wage, overall: player.overall, age: player.age, round: 1,
  });

  const { data: row, error } = await supabase.from("contract_offers").insert({
    save_id: saveId, player_id: player.id, club_id: myClubId,
    current_wage: wage, contract_years: years, last_actor: "user",
    status: decision.decision === "counter" ? "pending" : "rejected",
    rounds: 1, release_clause: releaseClause ?? null, guaranteed_starter: guaranteedStarter ?? false,
  }).select().single();
  if (error) throw error;

  if (decision.decision === "accept") {
    await applyRenewal(player.id, wage, years, today, releaseClause, guaranteedStarter);
    const { error: statusError } = await supabase.from("contract_offers").update({ status: "completed", last_actor: "agent" }).eq("id", row.id);
    if (statusError) throw statusError;
    return { status: "completed", wage };
  }
  if (decision.decision === "reject") return { status: "rejected" };
  const { error: counterError } = await supabase.from("contract_offers").update({ current_wage: decision.counterWage, last_actor: "agent" }).eq("id", row.id);
  if (counterError) throw counterError;
  return { status: "pending", wage: decision.counterWage };
}

export async function respondToContractOffer(
  offerId: string, action: "accept" | "counter" | "decline", today: string, counterWage?: number,
): Promise<ContractOutcome> {
  const { data: offer, error: oErr } = await supabase.from("contract_offers").select("*").eq("id", offerId).single();
  if (oErr || !offer) throw oErr ?? new Error("Negociação não encontrada");
  if (offer.status !== "pending") throw new Error("Essa negociação já foi encerrada");

  const { data: player, error: pErr } = await supabase.from("players").select("id, wage, overall, age").eq("id", offer.player_id).single();
  if (pErr || !player) throw pErr ?? new Error("Jogador não encontrado");

  if (action === "decline") {
    const { error } = await supabase.from("contract_offers").update({ status: "withdrawn" }).eq("id", offerId);
    if (error) throw error;
    return { status: "rejected" };
  }
  if (action === "accept") {
    await applyRenewal(player.id, offer.current_wage, offer.contract_years, today, offer.release_clause, offer.guaranteed_starter);
    const { error } = await supabase.from("contract_offers").update({ status: "completed" }).eq("id", offerId);
    if (error) throw error;
    return { status: "completed", wage: offer.current_wage };
  }

  if (counterWage == null) throw new Error("Informe um valor");
  const rounds = offer.rounds + 1;
  const decision = evaluateContractOffer({
    offeredWage: counterWage, currentWage: player.wage, overall: player.overall, age: player.age, round: rounds,
  });

  if (decision.decision === "accept") {
    await applyRenewal(player.id, counterWage, offer.contract_years, today, offer.release_clause, offer.guaranteed_starter);
    const { error } = await supabase.from("contract_offers").update({ status: "completed", current_wage: counterWage, rounds }).eq("id", offerId);
    if (error) throw error;
    return { status: "completed", wage: counterWage };
  }
  if (decision.decision === "reject" || rounds > MAX_CONTRACT_ROUNDS) {
    const { error } = await supabase.from("contract_offers").update({ status: "rejected", rounds }).eq("id", offerId);
    if (error) throw error;
    return { status: "rejected" };
  }
  const { error } = await supabase.from("contract_offers").update({ current_wage: decision.counterWage, rounds, last_actor: "agent" }).eq("id", offerId);
  if (error) throw error;
  return { status: "pending", wage: decision.counterWage };
}
