import { supabase } from "@/integrations/supabase/client";
import { initialBidFee, loanReferenceValue } from "@/game/transfer-negotiation";

const OFFER_LIFETIME_DAYS = 5;

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

/**
 * Chamado a cada advanceDays(): devolve automaticamente pro dono original
 * todo jogador cujo empréstimo venceu (ver executeTransfer em
 * src/lib/transfer-offers.ts, que grava loaned_from_club_id/loan_return_date
 * na hora que o empréstimo é fechado).
 */
export async function processLoanReturns(saveId: string, today: string): Promise<void> {
  const { data: due } = await supabase
    .from("players")
    .select("id, loaned_from_club_id")
    .eq("save_id", saveId)
    .not("loaned_from_club_id", "is", null)
    .lte("loan_return_date", today);
  if (!due || due.length === 0) return;

  for (const p of due) {
    const { error } = await supabase.from("players")
      // club_since: voltar de empréstimo também reinicia a química (o jogador
      // esteve fora do vestiário original por meses) — ver transfer-offers.ts.
      // `as any`: coluna nova, ainda não existe no types.ts gerado (mesmo
      // padrão de sempre pra colunas novas, ver CLAUDE.md).
      .update({ club_id: p.loaned_from_club_id, loaned_from_club_id: null, loan_return_date: null, loan_buy_option: null, club_since: today } as any)
      .eq("id", p.id);
    if (error) throw error;
  }
}

/**
 * O clube que pegou o jogador emprestado paga a cláusula de compra
 * combinada na proposta (se houver) e efetiva a transferência na hora,
 * encerrando o empréstimo — o dono original recebe a taxa na verba de
 * transferências.
 */
export async function exerciseLoanBuyOption(saveId: string, playerId: string, myClubId: string, today: string): Promise<void> {
  const { data: player } = await supabase.from("players")
    .select("id, name, club_id, loaned_from_club_id, loan_buy_option").eq("id", playerId).single();
  if (!player) throw new Error("Jogador não encontrado");
  if (player.club_id !== myClubId) throw new Error("Esse jogador não está no seu elenco");
  if (!player.loaned_from_club_id) throw new Error("Esse jogador não está emprestado");
  if (player.loan_buy_option == null) throw new Error("Esse empréstimo não tem cláusula de compra");

  const fee = player.loan_buy_option;
  const [{ data: buyer }, { data: seller }] = await Promise.all([
    supabase.from("clubs").select("id, transfer_budget").eq("id", myClubId).single(),
    supabase.from("clubs").select("id, transfer_budget").eq("id", player.loaned_from_club_id).single(),
  ]);
  if (!buyer || !seller) throw new Error("Clube não encontrado");
  if (buyer.transfer_budget < fee) throw new Error("Verba de transferências insuficiente");

  // Mesma classe de bug já corrigida em executeTransfer/simulateAITransferActivity
  // — nenhuma dessas escritas checava erro, o que podia debitar/creditar
  // caixa sem o jogador trocar de clube de fato (ou o contrário).
  const { error: playerError } = await supabase.from("players").update({
    loaned_from_club_id: null, loan_return_date: null, loan_buy_option: null,
  }).eq("id", playerId);
  if (playerError) throw playerError;
  const { error: buyerBudgetError } = await supabase.from("clubs").update({ transfer_budget: buyer.transfer_budget - fee }).eq("id", buyer.id);
  if (buyerBudgetError) throw buyerBudgetError;
  const { error: sellerBudgetError } = await supabase.from("clubs").update({ transfer_budget: seller.transfer_budget + fee }).eq("id", seller.id);
  if (sellerBudgetError) throw sellerBudgetError;
  const { error: financeError } = await supabase.from("finance_entries").insert({
    save_id: saveId, club_id: myClubId, entry_date: today,
    kind: "transfer_in", amount: -fee, description: `Cláusula de compra exercida: ${player.name}`,
  });
  if (financeError) throw financeError;
  const { error: transferRowError } = await supabase.from("transfers").insert({
    save_id: saveId, player_id: playerId, from_club_id: seller.id, to_club_id: buyer.id,
    fee, status: "completed", proposal_date: today, resolved_date: today,
  });
  if (transferRowError) throw transferRowError;
}

/**
 * O dono original chama de volta um jogador emprestado antes do prazo —
 * sem taxa envolvida (não é uma transferência, só o fim antecipado do
 * empréstimo). Só o clube que emprestou o jogador pode fazer isso.
 */
export async function recallLoan(playerId: string, myClubId: string): Promise<void> {
  const { data: player } = await supabase.from("players")
    .select("id, loaned_from_club_id").eq("id", playerId).single();
  if (!player) throw new Error("Jogador não encontrado");
  if (player.loaned_from_club_id !== myClubId) throw new Error("Esse jogador não está emprestado pelo seu clube");

  const { error } = await supabase.from("players").update({
    club_id: myClubId, loaned_from_club_id: null, loan_return_date: null, loan_buy_option: null,
  }).eq("id", playerId);
  if (error) throw error;
}

/**
 * Usuário empresta um jogador do próprio elenco pra um clube de IA —
 * mesma busca de comprador de listTransferRequest em
 * src/lib/transfer-requests.ts, mas sempre como empréstimo.
 */
export async function proposeLoanOut(saveId: string, myClubId: string, playerId: string, today: string): Promise<{ found: boolean }> {
  const { data: player } = await supabase.from("players").select("id, name, market_value, club_id").eq("id", playerId).single();
  if (!player) throw new Error("Jogador não encontrado");
  if (player.club_id !== myClubId) throw new Error("Esse jogador não está no seu elenco");

  const { data: myClub } = await supabase.from("clubs").select("reputation").eq("id", myClubId).single();
  const { data: aiClubs } = await supabase.from("clubs")
    .select("id, transfer_budget, reputation, name").eq("save_id", saveId).neq("id", myClubId);
  if (!aiClubs || aiClubs.length === 0) return { found: false };

  const referenceValue = loanReferenceValue(player.market_value);
  const affordable = aiClubs.filter((c) => {
    const fee = initialBidFee(referenceValue, c.reputation, myClub?.reputation ?? 50);
    return fee <= c.transfer_budget * 1.5;
  });
  if (affordable.length === 0) return { found: false };

  const bidder = affordable[Math.floor(Math.random() * affordable.length)];
  const fee = initialBidFee(referenceValue, bidder.reputation, myClub?.reputation ?? 50);

  const { error } = await supabase.from("transfer_offers").insert({
    save_id: saveId, player_id: player.id, seller_club_id: myClubId, buyer_club_id: bidder.id,
    initiator: "ai", current_fee: fee, last_actor: "ai", status: "pending",
    rounds: 1, expires_date: addDays(today, OFFER_LIFETIME_DAYS), deal_type: "loan",
  });
  if (error) throw error;
  return { found: true };
}
