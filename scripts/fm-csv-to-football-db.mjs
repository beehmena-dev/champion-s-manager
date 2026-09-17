// -----------------------------------------------------------------------------
// Gera a base "padrão" do jogo (times/jogadores/competições reais) como
// pastas de JSON por país + entidade — modelo inspirado no FootSim (JSON
// estruturado editável à mão, compilado pro banco só na criação de um save).
// Usa a MESMA extração de fm-csv-to-seed.mjs (buildClubsAndPlayers, em
// fm-lib.mjs), só que grava em arquivos separados em vez de um seed.json
// único, e dá um `id` estável a cada clube (o "ID Único" do Genie Scout) pra
// players.json poder referenciar `club_id` em vez de aninhar os jogadores.
//
// A pasta gerada (data/football-db/ por padrão) fica de fora do git — dado
// licenciado de uso pessoal (Genie Scout), regenerável a qualquer momento
// rodando este script contra os CSVs do usuário. src/lib/football-db.ts é
// quem lê isso em runtime (via import.meta.glob, empacotado no build) e
// remonta pro mesmo formato Seed que src/lib/seed-import.ts já consome.
//
// Uso:
//   node scripts/fm-csv-to-football-db.mjs "<pasta com os CSVs>" [data/football-db]
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import { LEAGUES, buildClubsAndPlayers } from "./fm-lib.mjs";

const SRC_DIR = process.argv[2];
const OUT_DIR = process.argv[3] || path.join(process.cwd(), "data", "football-db");
if (!SRC_DIR) {
  console.error('Uso: node scripts/fm-csv-to-football-db.mjs "<pasta com CLUBES.csv e JOGADORES.csv>" [pasta-saida]');
  process.exit(1);
}

// Confederações reais — só informativo por enquanto, nenhum consumidor lê
// isso ainda (nem loader nem importSeed). Cobre só os países que a base
// atual (LEAGUES) realmente usa.
const FEDERATIONS = {
  CONMEBOL: ["BR", "AR", "CO", "UY"],
  UEFA: ["EN", "ES", "IT", "DE", "FR", "PT", "NL", "TR", "AT", "CH"],
  CONCACAF: ["US", "MX"],
  AFC: ["SA"],
};

const { finalClubs, usedComps, playableComps, attached } = buildClubsAndPlayers(SRC_DIR);

// Agrupa por país (competitionMeta.country, mesma fonte que o seed único usa).
const byCountry = new Map();
for (const c of finalClubs) {
  const league = LEAGUES[c._divId];
  const country = league?.country ?? "XX";
  const bucket = byCountry.get(country) ?? { clubs: [], competitions: new Set() };
  bucket.clubs.push(c);
  bucket.competitions.add(c.competition);
  byCountry.set(country, bucket);
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "federations.json"), JSON.stringify(FEDERATIONS, null, 2));

let totalPlayers = 0;
for (const [country, bucket] of byCountry) {
  const countryDir = path.join(OUT_DIR, country);
  fs.mkdirSync(countryDir, { recursive: true });

  const competitions = [...bucket.competitions].map((code) => {
    const l = LEAGUES[code.slice(1)];
    return { code, name: l.name, tier: l.tier ?? 1, country: l.country ?? null, playable: playableComps.includes(code) };
  });
  fs.writeFileSync(path.join(countryDir, "competitions.json"), JSON.stringify(competitions, null, 2));

  const clubsOut = bucket.clubs.map((c) => {
    // players sai daqui (vira players.json à parte); id/_divId/_playable
    // internos (Division ID, flag jogável) não interessam fora do script —
    // quem consome já sabe a competição/tier via competitions.json.
    const { players, _divId, _playable, ...rest } = c;
    return rest;
  });
  fs.writeFileSync(path.join(countryDir, "clubs.json"), JSON.stringify(clubsOut, null, 2));

  const playersOut = [];
  for (const c of bucket.clubs) {
    for (const p of c.players) playersOut.push({ club_id: c.id, ...p });
  }
  totalPlayers += playersOut.length;
  fs.writeFileSync(path.join(countryDir, "players.json"), JSON.stringify(playersOut, null, 2));
}

console.log(`OK -> ${OUT_DIR}`);
console.log(`  ${byCountry.size} países, ${finalClubs.length} clubes, ${totalPlayers} jogadores`);
console.log(`  jogadores anexados (bruto, antes do corte de plantel): ${attached}`);
