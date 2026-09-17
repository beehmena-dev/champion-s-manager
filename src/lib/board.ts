import { supabase } from "@/integrations/supabase/client";
import {
  evaluateBudgetRequest, generateObjective, evaluateBoardRequest,
  BOARD_REQUEST_CATALOG, type SeasonObjective, type BoardRequestKind,
} from "@/game/board";
import { promotionSlots } from "@/game/promotion";

/**
 * Garante que existe um objetivo de temporada pro clube na competição/temporada
 * atual — gera na primeira vez que alguém consulta (mesmo padrão preguiçoso de
 * ensureCandidatePool em src/lib/staff.ts) E proativamente logo após a virada
 * de temporada (ver season-rollover.ts) pra o painel inicial nunca ficar sem
 * a frase de meta esperando o usuário abrir a tela Diretoria pela 1ª vez.
 *
 * A meta usa o RANK de reputação do clube DENTRO da própria competição (não
 * um corte de reputação absoluta) — por isso busca a reputação de todo mundo
 * na competição, não só a do clube. O tamanho real da zona de rebaixamento
 * vem de promotionSlots() (mesma regra usada de verdade no rollover); 0
 * quando não existe divisão abaixo na pirâmide pra cair.
 */
export async function ensureSeasonObjective(
  saveId: string, clubId: string, competitionId: string, season: number,
): Promise<void> {
  const { data: existing } = await supabase
    .from("season_objectives").select("id")
    .eq("club_id", clubId).eq("competition_id", competitionId).eq("season", season).maybeSingle();
  if (existing) return;

  const [{ data: clubs }, { data: comp }] = await Promise.all([
    supabase.from("clubs").select("id, reputation").eq("competition_id", competitionId).order("reputation", { ascending: false }),
    supabase.from("competitions").select("tier, country").eq("id", competitionId).single(),
  ]);
  const leagueSize = clubs?.length ?? 20;
  const rankIdx = (clubs ?? []).findIndex((c) => c.id === clubId);
  const reputationRank = rankIdx >= 0 ? rankIdx + 1 : Math.ceil(leagueSize / 2);
  const topReputation = clubs?.[0]?.reputation ?? 0;
  const myReputation = rankIdx >= 0 ? clubs![rankIdx].reputation : topReputation;
  const reputationGapToLeader = Math.max(0, topReputation - (myReputation ?? topReputation));

  let relegationSlots = 0;
  if (comp?.country && comp?.tier != null) {
    const { count: lowerTierCount } = await supabase.from("competitions")
      .select("id", { count: "exact", head: true })
      .eq("country", comp.country).eq("tier", comp.tier + 1);
    if ((lowerTierCount ?? 0) > 0) relegationSlots = promotionSlots(leagueSize);
  }

  const obj = generateObjective(reputationRank, leagueSize, relegationSlots, reputationGapToLeader);
  const { error } = await supabase.from("season_objectives").insert({
    save_id: saveId, club_id: clubId, competition_id: competitionId, season,
    kind: obj.kind, target: obj.target,
  });
  if (error) throw error;
}

export type BudgetPot = "wage" | "transfer";

export async function requestBudget(saveId: string, clubId: string, amount: number, today: string, pot: BudgetPot = "wage") {
  const { data: club } = await supabase.from("clubs").select("budget, transfer_budget, reputation, board_confidence").eq("id", clubId).single();
  if (!club) throw new Error("Clube não encontrado");

  const result = evaluateBudgetRequest(amount, club.board_confidence, club.reputation);
  if (result.approved) {
    const patch: any = { board_confidence: Math.max(0, club.board_confidence - 3) }; // conceder verba custa um pouco de confiança
    if (pot === "transfer") patch.transfer_budget = club.transfer_budget + result.grantedAmount;
    else patch.budget = club.budget + result.grantedAmount;
    const { error: clubError } = await supabase.from("clubs").update(patch).eq("id", clubId);
    if (clubError) throw clubError;
    const { error: financeError } = await supabase.from("finance_entries").insert({
      save_id: saveId, club_id: clubId, entry_date: today,
      kind: "board_grant", amount: result.grantedAmount,
      description: pot === "transfer" ? "Aporte extra da diretoria (verba de transferências)" : "Aporte extra da diretoria (folha salarial)",
    });
    if (financeError) throw financeError;
  }
  return result;
}

// -----------------------------------------------------------------------------
// Catálogo de pedidos à diretoria (ver src/game/board.ts). Um pedido é
// deliberado na hora: aplica os efeitos, registra em board_requests (histórico
// + limite por temporada) e lança um finance_entry quando mexe no caixa.
// -----------------------------------------------------------------------------
export async function submitBoardRequest(
  saveId: string, clubId: string, kind: BoardRequestKind, today: string, season: number,
) {
  const [{ data: club }, { count: reqCount }] = await Promise.all([
    supabase.from("clubs")
      .select("budget, transfer_budget, reputation, board_confidence, stadium_capacity, training_facilities, youth_facilities")
      .eq("id", clubId).single(),
    supabase.from("board_requests").select("id", { count: "exact", head: true })
      .eq("club_id", clubId).eq("season", season),
  ]);
  if (!club) throw new Error("Clube não encontrado");

  const outcome = evaluateBoardRequest(kind, {
    boardConfidence: club.board_confidence,
    cash: club.budget,
    clubReputation: club.reputation,
    requestsThisSeason: reqCount ?? 0,
    trainingFacilities: (club as any).training_facilities ?? 3,
    youthFacilities: (club as any).youth_facilities ?? 3,
  });

  if (outcome.approved) {
    const e = outcome.effects;
    const patch: any = {};
    if (e.transfer_budget_delta) patch.transfer_budget = club.transfer_budget + e.transfer_budget_delta;
    if (e.budget_delta) patch.budget = Math.max(0, club.budget + e.budget_delta);
    if (e.training_facilities_delta) patch.training_facilities = ((club as any).training_facilities ?? 3) + e.training_facilities_delta;
    if (e.youth_facilities_delta) patch.youth_facilities = ((club as any).youth_facilities ?? 3) + e.youth_facilities_delta;
    if (e.stadium_capacity_delta) patch.stadium_capacity = (club.stadium_capacity ?? 20000) + e.stadium_capacity_delta;
    if (e.board_confidence_delta) patch.board_confidence = Math.max(0, Math.min(100, club.board_confidence + e.board_confidence_delta));
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("clubs").update(patch).eq("id", clubId);
      if (error) throw error;
    }

    const title = BOARD_REQUEST_CATALOG.find((i) => i.kind === kind)?.title ?? kind;
    if (e.budget_delta && e.budget_delta < 0) {
      await supabase.from("finance_entries").insert({
        save_id: saveId, club_id: clubId, entry_date: today,
        kind: "other", amount: e.budget_delta, description: `Investimento: ${title}`,
      });
    } else if ((e.budget_delta ?? 0) > 0 || (e.transfer_budget_delta ?? 0) > 0) {
      await supabase.from("finance_entries").insert({
        save_id: saveId, club_id: clubId, entry_date: today,
        kind: "board_grant", amount: (e.budget_delta ?? 0) + (e.transfer_budget_delta ?? 0),
        description: `Aporte da diretoria: ${title}`,
      });
    }
  }

  // Registra o pedido (aprovado ou não conta pro limite da temporada).
  const { error: reqErr } = await supabase.from("board_requests").insert({
    save_id: saveId, club_id: clubId, season, kind,
    status: outcome.approved ? "approved" : "rejected",
    response: outcome.response, game_date: today,
  });
  if (reqErr) throw reqErr;

  return outcome;
}
