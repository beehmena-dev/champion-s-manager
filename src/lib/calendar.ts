import { supabase } from "@/integrations/supabase/client";
import { buildCalendarEventMap, type CalendarDayMap } from "@/game/calendar-events";

// -----------------------------------------------------------------------------
// Busca os dados reais (jogos, fim de contrato, caixa de entrada) pra um
// intervalo de datas e monta o mapa dia→eventos (ver src/game/calendar-events.ts).
// Reaproveitado pela tela de calendário (saves.$saveId.calendar.tsx) e pelo
// overlay de avanço de dia (saves.$saveId.tsx::DayAdvanceOverlay) — mesma
// fonte de dados nos dois lugares, nunca diverge.
// -----------------------------------------------------------------------------
export async function fetchCalendarEvents(saveId: string, clubId: string, fromISO: string, toISO: string): Promise<CalendarDayMap> {
  const [{ data: matches }, { data: players }, { data: inbox }] = await Promise.all([
    supabase.from("matches").select("match_date, played, home_score, away_score, home_club_id, away_club_id")
      .eq("save_id", saveId)
      .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .gte("match_date", fromISO).lte("match_date", toISO),
    supabase.from("players").select("name, contract_until")
      .eq("club_id", clubId)
      .not("contract_until", "is", null)
      .gte("contract_until", fromISO).lte("contract_until", toISO),
    supabase.from("inbox_messages").select("game_date, category, subject")
      .eq("save_id", saveId).eq("club_id", clubId)
      .gte("game_date", fromISO).lte("game_date", toISO),
  ]);

  const clubIds = new Set<string>();
  for (const m of matches ?? []) { clubIds.add(m.home_club_id); clubIds.add(m.away_club_id); }
  const { data: clubs } = clubIds.size
    ? await supabase.from("clubs").select("id, name").in("id", Array.from(clubIds))
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((clubs ?? []).map((c) => [c.id, c.name]));

  return buildCalendarEventMap({
    myClubId: clubId,
    matches: (matches ?? []).map((m) => ({ ...m, home_name: nameById.get(m.home_club_id), away_name: nameById.get(m.away_club_id) })),
    contracts: (players ?? []).map((p) => ({ contract_until: p.contract_until as string, name: p.name })),
    inbox: inbox ?? [],
  });
}
