// -----------------------------------------------------------------------------
// Preenche players[].id (o "ID Único" do Genie Scout) nos players.json JÁ
// GERADOS, sem regenerar clubs.json/players.json do zero — script pontual,
// só pra não perder o crest_url/primary_color/secondary_color já
// enriquecidos por scripts/fetch-*.mjs e scripts/import-club-crests.mjs.
// fm-csv-to-football-db.mjs/fm-lib.mjs já foram atualizados pra capturar
// esse id em regenerações futuras — este script é só o backfill da base
// atual, que já existia antes dessa mudança.
//
// Casa por (ID do Clube + nome normalizado) — único dentro de um clube,
// então não tem risco de colisão entre clubes como aconteceu com nome de
// clube cross-country.
//
// Uso:
//   node scripts/backfill-player-ids.mjs <pasta-com-CLUBES.csv-e-JOGADORES.csv> [data/football-db]
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import { loadCsv, digits, normalizeName } from "./fm-lib.mjs";

const SRC_DIR = process.argv[2];
const DB_DIR = process.argv[3] || path.join(process.cwd(), "data", "football-db");

if (!SRC_DIR) {
  console.error("Uso: node scripts/backfill-player-ids.mjs <pasta-com-os-csvs> [data/football-db]");
  process.exit(1);
}

function normKey(clubId, name) {
  return `${clubId}::${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "")}`;
}

const P = loadCsv(SRC_DIR, "JOGADORES.csv");
const pId = (n) => P.idx(n);

const csvLookup = new Map();
let dup = 0;
for (const r of P.rows) {
  const uid = digits(r[pId("ID Único")]);
  const clubId = digits(r[pId("ID do Clube")]);
  const name = normalizeName(r[pId("Nome")]);
  if (!uid || !clubId || !name) continue;
  const key = normKey(clubId, name);
  if (csvLookup.has(key)) { dup++; continue; } // homônimo no mesmo clube — não arrisca
  csvLookup.set(key, uid);
}
console.log(`CSV: ${csvLookup.size} jogadores indexados (${dup} homônimos pulados).`);

let totalPlayers = 0, matched = 0;
for (const country of fs.readdirSync(DB_DIR).sort()) {
  const dir = path.join(DB_DIR, country);
  if (!fs.statSync(dir).isDirectory()) continue;
  const playersPath = path.join(dir, "players.json");
  if (!fs.existsSync(playersPath)) continue;
  const players = JSON.parse(fs.readFileSync(playersPath, "utf8"));
  totalPlayers += players.length;

  let countryMatched = 0;
  for (const p of players) {
    if (p.id) continue; // já tem (regeneração mais nova) — não sobrescreve
    const uid = csvLookup.get(normKey(p.club_id, p.name));
    if (!uid) continue;
    p.id = uid;
    countryMatched++;
  }
  matched += countryMatched;
  fs.writeFileSync(playersPath, JSON.stringify(players, null, 2));
  console.log(`[${country}] ${countryMatched}/${players.length} jogadores ganharam id`);
}

console.log(`\nTotal: ${matched}/${totalPlayers} jogadores com ID Único preenchido.`);
