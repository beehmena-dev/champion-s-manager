import { supabase } from "@/integrations/supabase/client";
import { executeTransfer } from "./transfer-offers";

const DAILY_TRIGGER_CHANCE = 0.02; // por dia avançado, por jogador com cláusula

/**
 * Chamado a cada advanceDays(): com pequena chance por dia, um clube de IA
 * com caixa pra isso simplesmente paga a cláusula de rescisão de um
 * jogador do usuário e leva na hora — sem negociação (é o ponto de ter uma
 * cláusula). Reaproveita executeTransfer de src/lib/transfer-offers.ts.
 */
export async function checkReleaseClauses(
  saveId: string, myClubId: string, today: string, daysAdvanced: number,
): Promise<{ playerName: string; clubName: string; fee: number }[]> {
  const [{ data: clausedPlayers }, { data: sellerClub }] = await Promise.all([
    supabase.from("players").select("id, name, market_value, club_id, release_clause")
      .eq("club_id", myClubId).not("release_clause", "is", null),
    supabase.from("clubs").select("id, transfer_budget, reputation, name").eq("id", myClubId).single(),
  ]);
  if (!clausedPlayers || clausedPlayers.length === 0 || !sellerClub) return [];

  const { data: aiClubs } = await supabase.from("clubs")
    .select("id, transfer_budget, reputation, name").eq("save_id", saveId).neq("id", myClubId);
  if (!aiClubs || aiClubs.length === 0) return [];

  const remaining = [...clausedPlayers];
  const triggered: { playerName: string; clubName: string; fee: number }[] = [];
  for (let i = 0; i < daysAdvanced && remaining.length > 0; i++) {
    for (const p of remaining) {
      const fee = p.release_clause as number;
      const affordable = aiClubs.filter((c) => c.transfer_budget >= fee);
      if (affordable.length === 0) continue;
      if (Math.random() > DAILY_TRIGGER_CHANCE) continue;

      const buyer = affordable[Math.floor(Math.random() * affordable.length)];
      try {
        await executeTransfer({ saveId, myClubId, player: p as any, seller: sellerClub, buyer, fee, today });
      } catch (e) {
        // Gatilho de cláusula é um evento de fundo dentro do avanço de dia em
        // lote — se essa transferência específica falhar (agora que
        // executeTransfer lança em vez de falhar em silêncio), não pode
        // travar o resto do advanceDays() (folha, empréstimos, calendário
        // etc.), então só pula esse gatilho em vez de propagar.
        console.error("checkReleaseClauses: falha ao executar transferência por cláusula", e);
        continue;
      }
      triggered.push({ playerName: p.name, clubName: buyer.name, fee });
      buyer.transfer_budget -= fee; // reflete localmente pra não estourar o caixa em dois gatilhos no mesmo avanço
      remaining.splice(remaining.indexOf(p), 1);
      break; // no máximo 1 cláusula acionada por dia
    }
  }
  return triggered;
}
