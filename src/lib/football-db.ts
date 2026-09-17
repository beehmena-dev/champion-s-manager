import type { Seed, SeedClub, SeedPlayer } from "./seed-import";

// Carrega a base "padrão" (data/football-db/, gerada por
// scripts/fm-csv-to-football-db.mjs a partir do CSV real do FM Genie Scout,
// modelo de pastas por país/entidade inspirado no FootSim) e remonta pro
// mesmo formato Seed que importSeed() já consome (saves.$saveId.setup.tsx)
// — nenhuma mudança no pipeline de import, só troca de onde o Seed vem: em
// vez de upload manual de um seed.json, os arquivos já vêm empacotados no
// build (import.meta.glob é resolvido em tempo de build pelo Vite, vira
// code-split normal, sem acesso a filesystem em runtime).
//
// data/football-db/ fica fora do git (.gitignore) — dado licenciado de uso
// pessoal, regenerável a qualquer momento. Editar os JSONs à mão ali edita a
// base que o próximo save novo vai usar (não afeta saves já em andamento).

interface CompetitionEntry {
  code: string;
  name: string;
  tier: number;
  country: string | null;
  playable: boolean;
}

const clubModules = import.meta.glob<{ default: (SeedClub & { id: string })[] }>(
  "/data/football-db/*/clubs.json",
);
const playerModules = import.meta.glob<{ default: (SeedPlayer & { club_id: string })[] }>(
  "/data/football-db/*/players.json",
);
const competitionModules = import.meta.glob<{ default: CompetitionEntry[] }>(
  "/data/football-db/*/competitions.json",
);

export function hasFootballDb(): boolean {
  return Object.keys(clubModules).length > 0;
}

export async function loadFootballDb(): Promise<Seed> {
  const clubPaths = Object.keys(clubModules);
  if (clubPaths.length === 0) {
    throw new Error(
      "Base padrão não encontrada — rode scripts/fm-csv-to-football-db.mjs pra gerar data/football-db/ antes de usar esta opção.",
    );
  }

  const clubs: SeedClub[] = [];
  const competitions: string[] = [];
  const competitionNames: Record<string, string> = {};
  const playableCompetitions: string[] = [];
  const competitionMeta: Record<string, { tier: number; country: string | null }> = {};

  for (const clubPath of clubPaths) {
    const playerPath = clubPath.replace("/clubs.json", "/players.json");
    const competitionPath = clubPath.replace("/clubs.json", "/competitions.json");

    const [clubMod, playerMod, compMod] = await Promise.all([
      clubModules[clubPath](),
      playerModules[playerPath]?.() ?? Promise.resolve({ default: [] }),
      competitionModules[competitionPath]?.() ?? Promise.resolve({ default: [] }),
    ]);

    const playersByClub = new Map<string, SeedPlayer[]>();
    for (const { club_id, ...player } of playerMod.default) {
      const list = playersByClub.get(String(club_id)) ?? [];
      list.push(player as SeedPlayer);
      playersByClub.set(String(club_id), list);
    }

    for (const club of clubMod.default) {
      clubs.push({ ...club, players: playersByClub.get(String(club.id)) ?? [] });
    }

    for (const comp of compMod.default) {
      competitions.push(comp.code);
      competitionNames[comp.code] = comp.name;
      competitionMeta[comp.code] = { tier: comp.tier, country: comp.country };
      if (comp.playable) playableCompetitions.push(comp.code);
    }
  }

  return { competitions, competitionNames, playableCompetitions, competitionMeta, clubs };
}
