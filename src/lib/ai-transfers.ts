import { supabase } from "@/integrations/supabase/client";
import {
  evaluateAsBuyer, evaluateAsSeller, initialBidFee, MAX_NEGOTIATION_ROUNDS,
} from "@/game/transfer-negotiation";
import { isNotableTransfer, plausibleSuitor, pickRumorTarget, RUMOR_MORALE_BOOST } from "@/game/transfer-rumors";
import { pushInbox } from "./inbox";

const AI_TRANSFER_CHANCE = 0.18; // por chamada de advanceDays, não por dia (mesmo padrão de refreshTransferOffers)
const PROTECTED_STARTERS = 11; // não vende os titulares prováveis (melhores do elenco)
const MIN_SQUAD_SIZE = 16; // não deixa o elenco de IA esvaziar
const TRANSFER_RUMOR_CHANCE = 0.25; // por chamada de advanceDays — mais frequente que a negociação de IA, é só especulação de baixo custo

// -----------------------------------------------------------------------------
// Clubes de IA compram e vendem jogadores ENTRE SI em segundo plano — sem
// isso, o mercado só teria vida quando envolvesse o clube do usuário. Como
// não há humano dos dois lados, a negociação inteira (proposta inicial →
// contraproposta → aceite) roda síncrona numa única chamada, reaproveitando
// a mesma matemática de src/game/transfer-negotiation.ts usada no mercado
// do usuário.
// -----------------------------------------------------------------------------
export async function simulateAITransferActivity(saveId: string, myClubId: string | null, gameDate: string): Promise<void> {
  if (Math.random() > AI_TRANSFER_CHANCE) return;

  const { data: clubs } = await supabase
    .from("clubs").select("id, name, transfer_budget, reputation").eq("save_id", saveId);
  const aiClubs = (clubs ?? []).filter((c) => c.id !== myClubId);
  if (aiClubs.length < 2) return;

  const buyer = aiClubs[Math.floor(Math.random() * aiClubs.length)];
  const sellerCandidates = aiClubs.filter((c) => c.id !== buyer.id);
  const seller = sellerCandidates[Math.floor(Math.random() * sellerCandidates.length)];
  if (!seller) return;

  const { data: roster } = await supabase
    .from("players").select("id, name, market_value, overall")
    .eq("club_id", seller.id).order("overall", { ascending: false });
  if (!roster || roster.length <= MIN_SQUAD_SIZE) return;

  const { data: pendingOffers } = await supabase
    .from("transfer_offers").select("player_id").eq("save_id", saveId).eq("status", "pending");
  const lockedIds = new Set((pendingOffers ?? []).map((o) => o.player_id));

  const sellable = roster.slice(PROTECTED_STARTERS).filter((p) => !lockedIds.has(p.id));
  if (sellable.length === 0) return;
  const target = sellable[Math.floor(Math.random() * sellable.length)];

  let fee = initialBidFee(target.market_value, buyer.reputation, seller.reputation);
  if (fee > buyer.transfer_budget) return;

  let accepted = false;
  let round = 1;
  while (round <= MAX_NEGOTIATION_ROUNDS) {
    const sellerDecision = evaluateAsSeller({
      offerFee: fee, marketValue: target.market_value, round,
      buyerReputation: buyer.reputation, sellerReputation: seller.reputation, clubBudget: seller.transfer_budget,
    });
    if (sellerDecision.decision === "accept") { accepted = true; break; }
    if (sellerDecision.decision === "reject") break;

    if (sellerDecision.counterFee > buyer.transfer_budget) break;
    const buyerDecision = evaluateAsBuyer({
      offerFee: sellerDecision.counterFee, marketValue: target.market_value, round: round + 1,
      buyerReputation: buyer.reputation, sellerReputation: seller.reputation,
    });
    fee = sellerDecision.counterFee;
    if (buyerDecision.decision === "accept") { accepted = true; break; }
    if (buyerDecision.decision === "reject") break;
    fee = buyerDecision.counterFee;
    round += 2;
  }
  if (!accepted || fee > buyer.transfer_budget) return;

  const today = new Date().toISOString().split("T")[0];
  // Nenhuma dessas escritas checava erro — mesma classe de bug já corrigida
  // em executeTransfer (src/lib/transfer-offers.ts): uma falha silenciosa
  // aqui pode debitar/creditar caixa sem o jogador trocar de clube de
  // verdade (ou o contrário), e isso roda automaticamente em TODO
  // advanceDays(), não só quando o usuário mexe no mercado.
  const { error: playerError } = await supabase.from("players").update({ club_id: buyer.id }).eq("id", target.id);
  if (playerError) throw playerError;
  const { error: buyerBudgetError } = await supabase.from("clubs").update({ transfer_budget: buyer.transfer_budget - fee }).eq("id", buyer.id);
  if (buyerBudgetError) throw buyerBudgetError;
  const { error: sellerBudgetError } = await supabase.from("clubs").update({ transfer_budget: seller.transfer_budget + fee }).eq("id", seller.id);
  if (sellerBudgetError) throw sellerBudgetError;
  const { error: transferRowError } = await supabase.from("transfers").insert({
    save_id: saveId, player_id: target.id, from_club_id: seller.id, to_club_id: buyer.id,
    fee, status: "completed", proposal_date: today, resolved_date: today,
  });
  if (transferRowError) throw transferRowError;

  // Notícia de mercado (item 19 do backlog FootSim) — transferências de IA
  // pra IA sempre existiram aqui, mas ficavam 100% silenciosas pro usuário
  // (só um registro em `transfers`, nunca surgia na caixa de entrada). Só as
  // notáveis (astro ou taxa alta — ver isNotableTransfer) viram manchete,
  // pra não afogar o usuário com toda venda irrelevante de clube pequeno.
  if (myClubId && isNotableTransfer(target.overall, fee)) {
    await pushInbox(saveId, myClubId, gameDate, {
      category: "transfer", sender: "Imprensa",
      subject: `${target.name} é anunciado no ${buyer.name}`,
      body: `O ${buyer.name} confirmou a contratação de ${target.name}, que chega do ${seller.name} por uma taxa de transferência de peso.`,
    });
  }
}

// -----------------------------------------------------------------------------
// Rumor de mercado sobre um jogador do PRÓPRIO usuário (item 19 do backlog
// FootSim) — especulação sem negociação real por trás, exatamente o que o
// card pede ("ainda sem negociação real"). Não cria transfer_offers nem
// força nada — só sorteia um clube de IA PLAUSÍVEL (orçamento/reputação
// compatíveis, ver plausibleSuitor em src/game/transfer-rumors.ts) como
// "pretendente" de um dos jogadores mais valiosos do elenco, e aplica uma
// leve alta de moral (ser cobiçado é bom pro ego).
// -----------------------------------------------------------------------------
export async function generateTransferRumor(saveId: string, myClubId: string | null, gameDate: string): Promise<void> {
  if (!myClubId || Math.random() > TRANSFER_RUMOR_CHANCE) return;

  const [{ data: myTop }, { data: myClubRow }, { data: aiClubsRaw }] = await Promise.all([
    supabase.from("players").select("id, name, market_value, morale").eq("club_id", myClubId)
      .order("market_value", { ascending: false }).limit(5),
    supabase.from("clubs").select("reputation").eq("id", myClubId).single(),
    supabase.from("clubs").select("id, name, reputation, transfer_budget").eq("save_id", saveId).neq("id", myClubId),
  ]);
  const target = pickRumorTarget(myTop ?? []);
  if (!target) return;
  const suitor = plausibleSuitor(aiClubsRaw ?? [], target.market_value, myClubRow?.reputation ?? 50);
  if (!suitor) return;

  const currentMorale = (myTop ?? []).find((p) => p.id === target.id)?.morale ?? 70;
  const { error: moraleError } = await supabase.from("players")
    .update({ morale: Math.max(0, Math.min(100, currentMorale + RUMOR_MORALE_BOOST)) })
    .eq("id", target.id);
  if (moraleError) throw moraleError;

  await pushInbox(saveId, myClubId, gameDate, {
    category: "transfer", sender: "Imprensa",
    subject: `Rumor: ${suitor.name} de olho em ${target.name}`,
    body: `Segundo a imprensa esportiva, o ${suitor.name} monitora a situação de ${target.name} — nenhuma proposta foi feita até agora, mas o clube parece disposto a avançar se a janela de transferências permitir.`,
    link: `/saves/${saveId}/players/${target.id}`, linkLabel: "Ver jogador",
  });
}
