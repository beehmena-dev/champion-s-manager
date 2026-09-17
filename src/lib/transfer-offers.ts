import { supabase } from "@/integrations/supabase/client";
import {
  evaluateAsBuyer, evaluateAsSeller, initialBidFee, MAX_NEGOTIATION_ROUNDS,
  loanReferenceValue, LOAN_DURATION_DAYS,
} from "@/game/transfer-negotiation";
import { evaluateContractOffer, MAX_CONTRACT_ROUNDS } from "@/game/contract-negotiation";
import { isTransferWindowOpen } from "@/game/transfer-window";
import { nextSquadNumber } from "@/game/squad-numbers";

export type DealType = "permanent" | "loan";

const OFFER_LIFETIME_DAYS = 5;

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

interface ClubMini { id: string; transfer_budget: number; reputation: number; name: string }
interface PlayerMini { id: string; name: string; market_value: number; club_id: string | null }

async function loadTriple(offerId: string) {
  const { data: offer, error } = await supabase.from("transfer_offers").select("*").eq("id", offerId).single();
  if (error || !offer) throw error ?? new Error("Proposta não encontrada");
  const [{ data: player }, { data: seller }, { data: buyer }] = await Promise.all([
    supabase.from("players").select("id, name, market_value, club_id").eq("id", offer.player_id).single(),
    supabase.from("clubs").select("id, transfer_budget, reputation, name").eq("id", offer.seller_club_id).single(),
    supabase.from("clubs").select("id, transfer_budget, reputation, name").eq("id", offer.buyer_club_id).single(),
  ]);
  return { offer, player: player as PlayerMini, seller: seller as ClubMini, buyer: buyer as ClubMini };
}

// -----------------------------------------------------------------------------
// Executa a transferência de fato: move o jogador, ajusta o caixa dos dois
// clubes e registra o lançamento financeiro + histórico (só pro lado do
// usuário, que é o único com extrato de finanças na UI).
// -----------------------------------------------------------------------------
export async function executeTransfer(opts: {
  saveId: string; myClubId: string; player: PlayerMini; seller: ClubMini; buyer: ClubMini; fee: number; today: string;
  dealType?: DealType; loanBuyOption?: number | null;
}) {
  const { saveId, myClubId, player, seller, buyer, fee, today, dealType = "permanent", loanBuyOption = null } = opts;
  // Química de elenco (ver squadChemistryMultiplier em tactics.ts): trocar de
  // clube — mesmo em empréstimo, é outro vestiário — zera o relógio de
  // "tempo jogando junto" a partir de hoje.
  const playerPatch: any = { club_id: buyer.id, club_since: today };
  // Número da camisa livre no clube que recebe o jogador (ver src/game/squad-numbers.ts).
  try {
    const [{ data: existing }, { data: row }] = await Promise.all([
      supabase.from("players").select("squad_number").eq("club_id", buyer.id),
      supabase.from("players").select("position").eq("id", player.id).single(),
    ]);
    playerPatch.squad_number = nextSquadNumber(
      (existing ?? []).map((r) => r.squad_number),
      row?.position ?? "MID",
    );
  } catch {
    // número é cosmético — se a consulta falhar, o jogador entra sem número
  }
  // Empréstimo: guarda quem é o dono de verdade, quando o jogador volta e a
  // cláusula de compra (se combinada) — ver processLoanReturns e
  // exerciseLoanBuyOption em src/lib/loans.ts / src/lib/transfer-offers.ts.
  // Transferência definitiva encerra qualquer empréstimo anterior.
  playerPatch.loaned_from_club_id = dealType === "loan" ? seller.id : null;
  playerPatch.loan_return_date = dealType === "loan" ? addDays(today, LOAN_DURATION_DAYS) : null;
  playerPatch.loan_buy_option = dealType === "loan" ? loanBuyOption : null;
  // A cláusula de rescisão é do contrato com o clube anterior — muda de mãos,
  // a cláusula não acompanha (o novo clube precisaria negociar uma nova).
  playerPatch.release_clause = null;
  // Nenhuma dessas escritas checava erro — uma falha silenciosa aqui é pior
  // que perder um log: dinheiro pode sumir/duplicar e o jogador pode não
  // trocar de clube de verdade enquanto o chamador ainda marca a proposta
  // como "completed". Lança na primeira falha em vez de seguir pra próxima
  // escrita com o estado já inconsistente.
  const { error: playerError } = await supabase.from("players").update(playerPatch).eq("id", player.id);
  if (playerError) throw playerError;
  // Taxa de transferência sai/entra da verba de transferências (não do
  // caixa geral) — ver migration transfer_budget e src/routes/.../saves.$saveId.board.tsx.
  const { error: buyerBudgetError } = await supabase.from("clubs").update({ transfer_budget: buyer.transfer_budget - fee }).eq("id", buyer.id);
  if (buyerBudgetError) throw buyerBudgetError;
  const { error: sellerBudgetError } = await supabase.from("clubs").update({ transfer_budget: seller.transfer_budget + fee }).eq("id", seller.id);
  if (sellerBudgetError) throw sellerBudgetError;

  const iAmBuyer = buyer.id === myClubId;
  const { error: financeError } = await supabase.from("finance_entries").insert({
    save_id: saveId, club_id: myClubId, entry_date: today,
    kind: iAmBuyer ? "transfer_in" : "transfer_out",
    amount: iAmBuyer ? -fee : fee,
    description: iAmBuyer ? `Contratação: ${player.name}` : `Venda: ${player.name} (${buyer.name})`,
  });
  if (financeError) throw financeError;
  const { error: transferRowError } = await supabase.from("transfers").insert({
    save_id: saveId, player_id: player.id, from_club_id: seller.id, to_club_id: buyer.id,
    fee, status: "completed", proposal_date: today, resolved_date: today,
  });
  if (transferRowError) throw transferRowError;
}

export type OfferOutcome =
  | { status: "completed"; fee: number }
  | { status: "pending"; fee: number } // a IA contra-propôs, aguardando o usuário
  | { status: "rejected" };

// -----------------------------------------------------------------------------
// Usuário abre uma negociação pra COMPRAR um jogador de um clube de IA.
// -----------------------------------------------------------------------------
export async function makeOutgoingOffer(
  saveId: string, myClubId: string, player: PlayerMini, fee: number, today: string, dealType: DealType = "permanent",
  loanBuyOption?: number | null,
): Promise<OfferOutcome> {
  // Item 04 do backlog FootSim: janela de transferência só trava negociação
  // ENTRE clubes — agente livre (player.club_id null) nunca chega aqui, ele
  // usa signFreeAgent abaixo, que não checa janela nenhuma de propósito.
  if (!isTransferWindowOpen(today)) {
    throw new Error("Janela de transferências fechada — só dá pra negociar com outro clube durante a janela (verão ou janeiro). Agentes livres continuam disponíveis a qualquer momento.");
  }
  const { data: seller } = await supabase.from("clubs").select("id, transfer_budget, reputation, name").eq("id", player.club_id!).single();
  const { data: buyer } = await supabase.from("clubs").select("id, transfer_budget, reputation, name").eq("id", myClubId).single();
  if (!seller || !buyer) throw new Error("Clube não encontrado");
  if (buyer.transfer_budget < fee) throw new Error("Verba de transferências insuficiente");

  const referenceValue = dealType === "loan" ? loanReferenceValue(player.market_value) : player.market_value;
  const decision = evaluateAsSeller({
    offerFee: fee, marketValue: referenceValue, round: 1,
    buyerReputation: buyer.reputation, sellerReputation: seller.reputation, clubBudget: seller.transfer_budget,
  });

  const { data: row, error } = await supabase.from("transfer_offers").insert({
    save_id: saveId, player_id: player.id, seller_club_id: seller.id, buyer_club_id: myClubId,
    initiator: "user", current_fee: fee, last_actor: "user",
    status: decision.decision === "counter" ? "pending" : "rejected",
    rounds: 1, expires_date: addDays(today, OFFER_LIFETIME_DAYS), deal_type: dealType,
    loan_buy_option: dealType === "loan" ? (loanBuyOption ?? null) : null,
  }).select().single();
  if (error) throw error;

  if (decision.decision === "accept") {
    await executeTransfer({ saveId, myClubId, player, seller, buyer, fee, today, dealType, loanBuyOption });
    await supabase.from("transfer_offers").update({ status: "completed", last_actor: "ai" }).eq("id", row.id);
    return { status: "completed", fee };
  }
  if (decision.decision === "reject") {
    return { status: "rejected" };
  }
  await supabase.from("transfer_offers").update({ current_fee: decision.counterFee, last_actor: "ai" }).eq("id", row.id);
  return { status: "pending", fee: decision.counterFee };
}

// -----------------------------------------------------------------------------
// Usuário responde a uma negociação pendente (seja uma que ele abriu e a IA
// contra-propôs, seja uma oferta que a IA fez por um jogador seu).
// -----------------------------------------------------------------------------
export async function respondToOffer(
  offerId: string, action: "accept" | "counter" | "decline", myClubId: string, today: string, counterFee?: number,
): Promise<OfferOutcome> {
  const { offer, player, seller, buyer } = await loadTriple(offerId);
  if (offer.status !== "pending") throw new Error("Essa negociação já foi encerrada");

  const iAmSeller = offer.seller_club_id === myClubId;
  const iAmBuyer = offer.buyer_club_id === myClubId;
  if (!iAmSeller && !iAmBuyer) throw new Error("Essa negociação não é sua");

  if (action === "decline") {
    await supabase.from("transfer_offers").update({ status: "rejected" }).eq("id", offerId);
    return { status: "rejected" };
  }

  const dealType: DealType = (offer.deal_type as DealType) ?? "permanent";

  if (action === "accept") {
    const fee = offer.current_fee;
    if (iAmBuyer && buyer.transfer_budget < fee) throw new Error("Verba de transferências insuficiente");
    await executeTransfer({ saveId: offer.save_id, myClubId, player, seller, buyer, fee, today, dealType, loanBuyOption: offer.loan_buy_option });
    await supabase.from("transfer_offers").update({ status: "completed" }).eq("id", offerId);
    return { status: "completed", fee };
  }

  // action === "counter": o usuário sugere um novo valor; a IA reavalia.
  if (counterFee == null) throw new Error("Informe um valor");
  const rounds = offer.rounds + 1;
  const referenceValue = dealType === "loan" ? loanReferenceValue(player.market_value) : player.market_value;
  const ctx = {
    offerFee: counterFee, marketValue: referenceValue, round: rounds,
    buyerReputation: buyer.reputation, sellerReputation: seller.reputation,
    clubBudget: iAmSeller ? buyer.transfer_budget : seller.transfer_budget,
  };
  // Quem responde é a IA — se o usuário é o vendedor, a IA é a compradora
  // (avalia se topa pagar); se o usuário é o comprador, a IA é a vendedora.
  const decision = iAmSeller ? evaluateAsBuyer(ctx) : evaluateAsSeller(ctx);

  if (decision.decision === "accept") {
    await executeTransfer({ saveId: offer.save_id, myClubId, player, seller, buyer, fee: counterFee, today, dealType, loanBuyOption: offer.loan_buy_option });
    await supabase.from("transfer_offers").update({ status: "completed", current_fee: counterFee, rounds, last_actor: "user" }).eq("id", offerId);
    return { status: "completed", fee: counterFee };
  }
  if (decision.decision === "reject" || rounds > MAX_NEGOTIATION_ROUNDS) {
    await supabase.from("transfer_offers").update({ status: "rejected", rounds }).eq("id", offerId);
    return { status: "rejected" };
  }
  await supabase.from("transfer_offers").update({
    current_fee: decision.counterFee, rounds, last_actor: "ai",
    expires_date: addDays(today, OFFER_LIFETIME_DAYS),
  }).eq("id", offerId);
  return { status: "pending", fee: decision.counterFee };
}

// -----------------------------------------------------------------------------
// Chamado a cada advanceDays(): (1) expira propostas vencidas cuja resposta
// era do usuário, (2) com pequena chance, clubes de IA abrem negociação por
// jogadores do usuário.
// -----------------------------------------------------------------------------
export async function refreshTransferOffers(saveId: string, myClubId: string, today: string): Promise<void> {
  // Propostas já pendentes continuam podendo ser respondidas fora da janela
  // (só NOVAS sondagens de IA ficam paradas) — expirar/negociar o que já tá
  // em aberto não é a mesma coisa que abrir negociação nova.
  const windowOpen = isTransferWindowOpen(today);

  const { error: expireError } = await supabase.from("transfer_offers")
    .update({ status: "expired" })
    .eq("save_id", saveId).eq("status", "pending").eq("last_actor", "ai").lt("expires_date", today);
  if (expireError) throw expireError;

  if (!windowOpen) return; // fora da janela, nenhuma sondagem NOVA de IA aparece

  const { data: pending } = await supabase.from("transfer_offers")
    .select("id").eq("save_id", saveId).eq("status", "pending");
  if ((pending?.length ?? 0) >= 3) return; // não empilha propostas demais na tela

  if (Math.random() > 0.12) return; // ~12% de chance por dia avançado de surgir uma proposta

  const { data: myPlayers } = await supabase.from("players")
    .select("id, name, market_value, club_id, overall").eq("club_id", myClubId).order("overall", { ascending: false }).limit(15);
  if (!myPlayers || myPlayers.length === 0) return;

  const { data: aiClubs } = await supabase.from("clubs")
    .select("id, transfer_budget, reputation, name").eq("save_id", saveId).neq("id", myClubId);
  if (!aiClubs || aiClubs.length === 0) return;

  const target = myPlayers[Math.floor(Math.random() * Math.min(myPlayers.length, 8))];
  const bidder = aiClubs[Math.floor(Math.random() * aiClubs.length)];
  const { data: myClub } = await supabase.from("clubs").select("reputation").eq("id", myClubId).single();

  const fee = initialBidFee(target.market_value, bidder.reputation, myClub?.reputation ?? 50);
  if (fee > bidder.transfer_budget * 1.5) return; // clube nem de longe teria como pagar isso

  const { error } = await supabase.from("transfer_offers").insert({
    save_id: saveId, player_id: target.id, seller_club_id: myClubId, buyer_club_id: bidder.id,
    initiator: "ai", current_fee: fee, last_actor: "ai", status: "pending",
    rounds: 1, expires_date: addDays(today, OFFER_LIFETIME_DAYS),
  });
  if (error) throw error;
}

export interface FreeAgentSignOutcome {
  accepted: boolean;
  wage: number;
}

const FREE_AGENT_CONTRACT_YEARS = 2;

// -----------------------------------------------------------------------------
// Contratar agente livre — item 04 do backlog FootSim. Sem clube vendedor,
// sem taxa, sem janela de transferência (ver isTransferWindowOpen — essa
// função de propósito NUNCA chama ela): é pegar ou largar num salário, na
// hora, o que já é o "mais rápido e barato" que o card pede. Reaproveita a
// mesma avaliação de proposta de renovação de contrato (contract-negotiation.ts)
// no último round, que só devolve accept/reject — nunca contra-proposta.
// -----------------------------------------------------------------------------
export async function signFreeAgent(
  saveId: string, myClubId: string,
  player: { id: string; name: string; wage: number | null; overall: number; age: number; position: string },
  offeredWage: number, today: string,
): Promise<FreeAgentSignOutcome> {
  const decision = evaluateContractOffer({
    offeredWage,
    currentWage: player.wage || Math.round(offeredWage * 0.8),
    overall: player.overall, age: player.age,
    round: MAX_CONTRACT_ROUNDS,
  });
  if (decision.decision !== "accept") return { accepted: false, wage: offeredWage };

  const patch: any = {
    club_id: myClubId, wage: offeredWage, contract_until: addDays(today, FREE_AGENT_CONTRACT_YEARS * 365), club_since: today,
    loaned_from_club_id: null, loan_return_date: null, loan_buy_option: null, release_clause: null,
  };
  try {
    const { data: existing } = await supabase.from("players").select("squad_number").eq("club_id", myClubId);
    patch.squad_number = nextSquadNumber((existing ?? []).map((r) => r.squad_number), player.position);
  } catch {
    // número é cosmético — se a consulta falhar, o jogador entra sem número
  }

  const { error: playerError } = await supabase.from("players").update(patch).eq("id", player.id);
  if (playerError) throw playerError;

  const { error: financeError } = await supabase.from("finance_entries").insert({
    save_id: saveId, club_id: myClubId, entry_date: today, kind: "transfer_in", amount: 0,
    description: `Contratação (agente livre): ${player.name}`,
  });
  if (financeError) throw financeError;

  const { error: transferRowError } = await supabase.from("transfers").insert({
    save_id: saveId, player_id: player.id, from_club_id: null, to_club_id: myClubId,
    fee: 0, status: "completed", proposal_date: today, resolved_date: today,
  });
  if (transferRowError) throw transferRowError;

  return { accepted: true, wage: offeredWage };
}
