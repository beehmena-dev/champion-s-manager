import { supabase } from "@/integrations/supabase/client";
import { defaultClubColors } from "@/game/club-colors";
import {
  deriveFullAttributes, deriveAttributesFromRoles, generateAttributes, footLabelFromAttributes,
  type LegacyBasicAttrs, type RoleScores, type PlayerAttributes,
} from "@/game/attributes";
import { assignSquadNumbers } from "@/game/squad-numbers";

// Formato do seed.json. Dois casos de origem de atributo:
//  - seed antigo (seed.mjs): traz os 12 atributos legados -> deriveFullAttributes
//  - seed do FM (scripts/fm-csv-to-seed.mjs): traz role_scores (habilidade por
//    família de posição, extraída das colunas do Genie Scout) -> deriveAttributesFromRoles
//  - nenhum dos dois: cai em generateAttributes(posição, overall)

export interface SeedPlayer {
  // Presente só na base "padrão" — é o "ID Único" do jogador no Genie Scout
  // (JOGADORES.csv), chave estável pra casar foto real (scripts/
  // import-player-faces.mjs), mesmo princípio de SeedClub.id abaixo.
  // importSeed() nunca lê isso, é só um campo de passagem inofensivo.
  id?: string | number;
  name: string;
  age: number;
  position: string;
  natural_position?: string | null;
  secondary_positions?: string[] | null;
  foot: string;
  // Atributos legados (seed.mjs) — opcionais agora.
  finishing?: number; passing?: number; tackling?: number; pace?: number;
  stamina?: number; dribbling?: number; heading?: number; vision?: number;
  positioning?: number; gk_reflexes?: number; gk_handling?: number; gk_positioning?: number;
  // Habilidade por família de posição (seed do FM) — opcional.
  role_scores?: RoleScores | null;
  overall: number; potential?: number | null; market_value: number; wage: number;
  contract_until: string | null; morale: number; condition: number; form: number;
  injured_until: string | null;
  // Campos reais do FM (opcionais — ausentes em seeds antigos/procedurais).
  nationality?: string | null; birth_date?: string | null;
  international_caps?: number | null; international_goals?: number | null;
  club_since?: string | null; release_clause?: number | null;
  // Foto real, via scripts/import-player-faces.mjs (mesmo princípio de
  // SeedClub.crest_url) — ausente = fallback procedural no cliente.
  face_url?: string | null;
}

export interface SeedClub {
  // Presente só na base "padrão" (data/football-db/, via football-db.ts) —
  // é o "ID Único" do Genie Scout, chave estável pra ligar clube↔jogador
  // entre clubs.json/players.json. importSeed() nunca lê isso (a ligação
  // aqui dentro é por índice de array), é só um campo de passagem inofensivo.
  id?: string | number;
  competition: string;
  name: string;
  short_name?: string | null;
  crest_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  budget: number;
  reputation: number;
  stadium_capacity: number;
  training_facilities?: number | null;
  youth_facilities?: number | null;
  strength?: number | null;
  division: number;
  morale: number;
  wage_budget?: number | null;
  avg_attendance?: number | null;
  // Reais, de fora da CSV do FM (que não traz isso) — puxados do
  // openfootball/clubs (CC0) via scripts/fetch-stadiums.mjs. Ausentes quando
  // o país não tem cobertura lá ou o nome não casou (nunca inventado).
  stadium_name?: string | null;
  stadium_city?: string | null;
  founded_year?: number | null;
  players: SeedPlayer[];
}

export interface Seed {
  competitions?: string[];
  // Nome de exibição por código de competição — o seed do FM traz este mapa
  // (o seed.mjs antigo usa códigos conhecidos do COMPETITION_NAMES abaixo).
  competitionNames?: Record<string, string>;
  // Competições que entram como JOGÁVEIS (simulação completa). As demais
  // entram em segundo plano. Ausente = todas jogáveis (compat. seed antigo).
  playableCompetitions?: string[];
  // tier + país por código de competição — define a pirâmide de acesso/
  // rebaixamento. Ausente = tier 1, sem país (nenhuma promoção/rebaixamento).
  competitionMeta?: Record<string, { tier: number; country: string | null }>;
  clubs: SeedClub[];
}

// Overall médio do elenco (top 18) — usado como clubs.strength quando o seed
// não traz o cache pronto (seed antigo). O motor usa isso pra simular/rolar
// ligas de segundo plano sem carregar os jogadores.
function squadStrength(players: SeedPlayer[]): number | null {
  if (!players.length) return null;
  const top = [...players].sort((a, b) => b.overall - a.overall).slice(0, 18);
  return Math.round(top.reduce((s, p) => s + p.overall, 0) / top.length);
}

const COMPETITION_NAMES: Record<string, string> = {
  BSA: "Brasileirão Série A",
  PL: "Premier League",
  PD: "La Liga",
  SA: "Serie A",
  BL1: "Bundesliga",
  FL1: "Ligue 1",
};

const BASE_TO_NATURAL: Record<string, string> = { GK: "GOL", DEF: "ZAG", MID: "MC", FWD: "CA" };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface ImportProgress {
  step: string;
  current: number;
  total: number;
}

export async function importSeed(
  saveId: string,
  seed: Seed,
  onProgress?: (p: ImportProgress) => void,
): Promise<{ clubs: number; players: number }> {
  const codes = seed.competitions ?? Array.from(new Set(seed.clubs.map((c) => c.competition)));

  onProgress?.({ step: "Criando competições", current: 0, total: codes.length });

  // Insere competições
  const compsPayload = codes.map((code) => ({
    save_id: saveId,
    code,
    name: seed.competitionNames?.[code] ?? COMPETITION_NAMES[code] ?? code,
    type: "league",
    season: 2025,
    // Ausente = seed antigo, tudo jogável. Presente = só as listadas.
    playable: seed.playableCompetitions ? seed.playableCompetitions.includes(code) : true,
    tier: seed.competitionMeta?.[code]?.tier ?? 1,
    country: seed.competitionMeta?.[code]?.country ?? null,
  }));
  const { data: comps, error: compErr } = await supabase
    .from("competitions")
    .insert(compsPayload)
    .select();
  if (compErr) throw compErr;
  const codeToCompId = new Map<string, string>();
  for (const c of comps ?? []) codeToCompId.set(c.code, c.id);

  // Insere clubes
  onProgress?.({ step: "Criando clubes", current: 0, total: seed.clubs.length });
  // any[]: wage_budget/avg_attendance existem na tabela mas ainda não estão
  // em types.ts (convenção do projeto — regenerar esse arquivo é manual,
  // ver CLAUDE.md). Mesmo padrão já usado em playersPayload logo abaixo.
  const clubsPayload: any[] = seed.clubs.map((c) => {
    const totalBudget = c.budget ?? 0;
    // Mesma proporção usada na migration que separou o caixa em dois fundos
    // (ver 20260810180000_transfer_budget.sql) — 40% nasce como verba de
    // transferências, o resto como caixa operacional (salários/bilheteria).
    const transferBudget = Math.round(totalBudget * 0.4);
    const fallbackColors = defaultClubColors(c.name);
    return {
      save_id: saveId,
      competition_id: codeToCompId.get(c.competition) ?? null,
      name: c.name,
      short_name: c.short_name ?? c.name.slice(0, 3).toUpperCase(),
      crest_url: c.crest_url ?? null,
      primary_color: c.primary_color ?? fallbackColors.primary,
      secondary_color: c.secondary_color ?? fallbackColors.secondary,
      budget: totalBudget - transferBudget,
      transfer_budget: transferBudget,
      reputation: c.reputation ?? 50,
      morale: c.morale ?? 70,
      stadium_capacity: c.stadium_capacity ?? 20000,
      training_facilities: c.training_facilities ?? 3,
      youth_facilities: c.youth_facilities ?? 3,
      strength: c.strength ?? squadStrength(c.players ?? []),
      division: c.division ?? 1,
      wage_budget: c.wage_budget ?? null,
      avg_attendance: c.avg_attendance ?? null,
      stadium_name: c.stadium_name ?? null,
      stadium_city: c.stadium_city ?? null,
      founded_year: c.founded_year ?? null,
    };
  });

  // insert em batches para evitar timeout
  const clubIdByIndex: string[] = [];
  let done = 0;
  for (const batch of chunk(clubsPayload, 200)) {
    const { data: inserted, error } = await supabase
      .from("clubs")
      .insert(batch)
      .select("id");
    if (error) throw error;
    for (const row of inserted ?? []) clubIdByIndex.push(row.id);
    done += batch.length;
    onProgress?.({ step: "Criando clubes", current: done, total: seed.clubs.length });
  }

  // Insere jogadores
  const playersPayload: any[] = [];
  seed.clubs.forEach((c, idx) => {
    const clubId = clubIdByIndex[idx];
    const clubPlayers = c.players ?? [];
    // Números da camisa — numera o elenco inteiro do clube de uma vez (id
    // sintético = posição no array, já que o id real só existe pós-insert).
    const squadNumbers = assignSquadNumbers(
      clubPlayers.map((p, i) => ({ id: String(i), position: p.position, overall: p.overall })),
    );
    clubPlayers.forEach((p, pIdx) => {
      const naturalPos = p.natural_position ?? BASE_TO_NATURAL[p.position] ?? "MC";
      const secondaryPos = p.secondary_positions ?? [];
      const positionProgress: Record<string, number> = { [naturalPos]: 100 };
      for (const sp of secondaryPos) positionProgress[sp] = 60;
      // Os 47 atributos são sempre calculados por nós (o overall real do seed
      // é mantido, não recalculado). Fonte de derivação, em ordem de preferência:
      //  1) role_scores (seed do FM) -> deriveAttributesFromRoles (mais fiel)
      //  2) 12 atributos legados (seed.mjs antigo) -> deriveFullAttributes
      //  3) só posição+overall -> generateAttributes
      const basePosition = (p.position as "GK" | "DEF" | "MID" | "FWD") ?? "MID";
      const seedStr = `${p.name}-${idx}-${playersPayload.length}`;
      let attributes: PlayerAttributes;
      if (p.role_scores) {
        attributes = deriveAttributesFromRoles(p.role_scores, basePosition, p.overall, seedStr);
      } else if (p.finishing != null) {
        const legacy: LegacyBasicAttrs = {
          finishing: p.finishing ?? 10, passing: p.passing ?? 10, tackling: p.tackling ?? 10, pace: p.pace ?? 10,
          stamina: p.stamina ?? 10, dribbling: p.dribbling ?? 10, heading: p.heading ?? 10, vision: p.vision ?? 10,
          positioning: p.positioning ?? 10, gk_reflexes: p.gk_reflexes ?? 10, gk_handling: p.gk_handling ?? 10,
          gk_positioning: p.gk_positioning ?? 10,
        };
        attributes = deriveFullAttributes(legacy, basePosition, seedStr);
      } else {
        attributes = generateAttributes(basePosition, p.overall / 5);
      }
      playersPayload.push({
        save_id: saveId,
        club_id: clubId,
        name: p.name,
        age: p.age,
        position: p.position,
        natural_position: naturalPos,
        secondary_positions: secondaryPos,
        position_progress: positionProgress,
        // Derivado da força real de cada pé (attributes.left_foot/right_foot,
        // geradas junto com o resto acima) — não do p.foot do seed, que hoje
        // sempre vem "right" fixo pra base importada do FM (a CSV do Genie
        // Scout não traz essa coluna).
        foot: footLabelFromAttributes(attributes),
        squad_number: squadNumbers[String(pIdx)] ?? null,
        attributes,
        overall: p.overall,
        potential: p.potential ?? p.overall,
        market_value: p.market_value,
        wage: p.wage,
        contract_until: p.contract_until,
        morale: p.morale,
        condition: p.condition,
        form: p.form,
        injured_until: p.injured_until,
        nationality: p.nationality ?? null,
        birth_date: p.birth_date ?? null,
        international_caps: p.international_caps ?? 0,
        international_goals: p.international_goals ?? 0,
        club_since: p.club_since ?? null,
        release_clause: p.release_clause ?? null,
        face_url: p.face_url ?? null,
      });
    });
  });

  onProgress?.({ step: "Criando jogadores", current: 0, total: playersPayload.length });
  let insertedPlayers = 0;
  for (const batch of chunk(playersPayload, 500)) {
    const { error } = await supabase.from("players").insert(batch);
    if (error) throw error;
    insertedPlayers += batch.length;
    onProgress?.({ step: "Criando jogadores", current: insertedPlayers, total: playersPayload.length });
  }

  // Se isso falhar em silêncio, clubes/jogadores já foram criados mas
  // save.seeded continua false — a tela de setup ia pedir pra importar de
  // novo, duplicando clubes/jogadores no mesmo save.
  const { error: seededError } = await supabase.from("saves").update({ seeded: true }).eq("id", saveId);
  if (seededError) throw seededError;

  return { clubs: clubIdByIndex.length, players: insertedPlayers };
}