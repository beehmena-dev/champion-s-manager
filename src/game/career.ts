// -----------------------------------------------------------------------------
// Carreira do técnico (item 14 do backlog FootSim) — lógica pura (sem I/O).
//
// Marca, na trajetória season-a-season (season_objectives), qual temporada
// foi a última antes de uma demissão. Não existe coluna "fired" em
// season_objectives — infere cruzando com saves.fired_from_club_ids (um
// clube só entra ali quando o usuário é demitido dele de verdade, ver
// season-rollover.ts): a temporada mais recente registrada NAQUELE clube é,
// por definição, a última antes da demissão (demissão sempre troca de clube
// na hora, nunca fica "pendurado" no mesmo clube depois).
// -----------------------------------------------------------------------------

export interface CareerSeasonRow {
  club_id: string | null;
  season: number;
}

/** clubId → última temporada registrada naquele clube, só pros clubes de onde o técnico foi demitido. */
export function firedSeasonByClub(rows: CareerSeasonRow[], firedClubIds: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.club_id || !firedClubIds.has(r.club_id)) continue;
    const cur = out.get(r.club_id) ?? -1;
    if (r.season > cur) out.set(r.club_id, r.season);
  }
  return out;
}

export function isFiringSeason(row: CareerSeasonRow, firedMap: Map<string, number>): boolean {
  return !!row.club_id && firedMap.get(row.club_id) === row.season;
}
