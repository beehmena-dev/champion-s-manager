import { supabase } from "@/integrations/supabase/client";
import { generateYouthPlayer } from "@/game/youth";
import { nextSquadNumber } from "@/game/squad-numbers";

function addYears(iso: string, years: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().split("T")[0];
}

/**
 * Gera 1-2 juniores novos (16-18 anos) pro clube, com primeiro contrato
 * profissional de 2-3 anos. Chamado uma vez por clube a cada virada de
 * temporada — ver src/lib/season-rollover.ts.
 */
export async function generateYouthIntake(
  saveId: string, clubId: string, reputation: number, today: string, facilityLevel = 3,
): Promise<number> {
  const count = 1 + Math.floor(Math.random() * 2); // 1-2

  // Números da camisa livres no clube — juniores costumam pegar número alto.
  const { data: existingNums } = await supabase
    .from("players").select("squad_number").eq("club_id", clubId);
  const takenNumbers = (existingNums ?? []).map((r) => r.squad_number as number | null);

  // any[]: o gerado inclui natural_position/secondary_positions/position_progress,
  // colunas reais no banco que o types.ts gerado ainda não reflete (mesma
  // situação de src/lib/seed-import.ts).
  const rows: any[] = Array.from({ length: count }, () => {
    const y = generateYouthPlayer(reputation, facilityLevel);
    const num = nextSquadNumber(takenNumbers, y.position);
    takenNumbers.push(num);
    return {
      save_id: saveId, club_id: clubId, name: y.name, age: y.age, position: y.position,
      natural_position: y.naturalPosition, secondary_positions: [],
      position_progress: { [y.naturalPosition]: 100 },
      foot: y.foot,
      squad_number: num,
      attributes: y.attributes,
      overall: y.overall, potential: y.potential, market_value: y.marketValue, wage: y.wage,
      contract_until: addYears(today, 2 + Math.floor(Math.random() * 2)),
      morale: 70, condition: 100, form: 65,
      club_since: today,
    };
  });
  const { error } = await supabase.from("players").insert(rows);
  if (error) throw error;
  return count;
}
