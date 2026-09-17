// -----------------------------------------------------------------------------
// Depois de regenerar data/football-db/ do zero (fm-csv-to-football-db.mjs),
// crest_url/face_url voltam a null — mas public/crests/*.webp e
// public/faces/*.webp continuam no disco (o import original já converteu as
// imagens; o "ID Único" de clube/jogador é estável entre regenerações, vem
// direto do CSV). Em vez de reextrair os packs de 2-3GB de novo só pra
// reconverter a MESMA imagem, este script só reconecta: pra cada clube/
// jogador, se existir public/crests|faces/<id>.webp, seta a URL.
//
// Uso: node scripts/relink-media.mjs [data/football-db]
// -----------------------------------------------------------------------------
import fs from "fs";
import path from "path";

const DB_DIR = process.argv[2] || path.join(process.cwd(), "data", "football-db");
const CRESTS_DIR = path.join(process.cwd(), "public", "crests");
const FACES_DIR = path.join(process.cwd(), "public", "faces");

const crestIds = new Set(fs.existsSync(CRESTS_DIR) ? fs.readdirSync(CRESTS_DIR).map((f) => f.replace(/\.webp$/, "")) : []);
const faceIds = new Set(fs.existsSync(FACES_DIR) ? fs.readdirSync(FACES_DIR).map((f) => f.replace(/\.webp$/, "")) : []);
console.log(`${crestIds.size} escudos e ${faceIds.size} fotos já convertidos em public/.`);

let clubsRelinked = 0, playersRelinked = 0;
for (const country of fs.readdirSync(DB_DIR).sort()) {
  const dir = path.join(DB_DIR, country);
  if (!fs.statSync(dir).isDirectory()) continue;

  const clubsPath = path.join(dir, "clubs.json");
  if (fs.existsSync(clubsPath)) {
    const clubs = JSON.parse(fs.readFileSync(clubsPath, "utf8"));
    let changed = false;
    for (const c of clubs) {
      if (crestIds.has(String(c.id))) { c.crest_url = `/crests/${c.id}.webp`; clubsRelinked++; changed = true; }
    }
    if (changed) fs.writeFileSync(clubsPath, JSON.stringify(clubs, null, 2));
  }

  const playersPath = path.join(dir, "players.json");
  if (fs.existsSync(playersPath)) {
    const players = JSON.parse(fs.readFileSync(playersPath, "utf8"));
    let changed = false;
    for (const p of players) {
      if (p.id != null && faceIds.has(String(p.id))) { p.face_url = `/faces/${p.id}.webp`; playersRelinked++; changed = true; }
    }
    if (changed) fs.writeFileSync(playersPath, JSON.stringify(players, null, 2));
  }
}

console.log(`Reconectado: ${clubsRelinked} clubes com escudo, ${playersRelinked} jogadores com foto.`);
