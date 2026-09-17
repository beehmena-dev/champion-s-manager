export interface StandingRow {
  club_id: string;
  name: string;
  crest_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

interface MatchLite {
  home_club_id: string;
  away_club_id: string;
  home_score: number | null;
  away_score: number | null;
  played: boolean;
}

interface ClubLite {
  id: string;
  name: string;
  crest_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
}

export function computeStandings(clubs: ClubLite[], matches: MatchLite[]): StandingRow[] {
  const table = new Map<string, StandingRow>();
  for (const c of clubs) {
    table.set(c.id, {
      club_id: c.id,
      name: c.name,
      crest_url: c.crest_url,
      primary_color: c.primary_color,
      secondary_color: c.secondary_color,
      played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0,
    });
  }
  for (const m of matches) {
    if (!m.played || m.home_score == null || m.away_score == null) continue;
    const h = table.get(m.home_club_id);
    const a = table.get(m.away_club_id);
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += m.home_score; h.ga += m.away_score;
    a.gf += m.away_score; a.ga += m.home_score;
    if (m.home_score > m.away_score) { h.wins++; h.points += 3; a.losses++; }
    else if (m.home_score < m.away_score) { a.wins++; a.points += 3; h.losses++; }
    else { h.draws++; a.draws++; h.points++; a.points++; }
  }
  const rows = [...table.values()];
  for (const r of rows) r.gd = r.gf - r.ga;
  rows.sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name));
  return rows;
}