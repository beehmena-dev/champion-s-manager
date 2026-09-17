// -----------------------------------------------------------------------------
// Casa um pack de fotos reais de jogador (pasta local de imagens) com os
// jogadores de data/football-db/<país>/players.json — mesmo padrão de
// scripts/import-club-crests.mjs. players.json agora tem um "id" próprio
// (o "ID Único" do Genie Scout, backfilled via scripts/backfill-player-ids.mjs
// em 15/09/2026, capturado nativamente por fm-lib.mjs em regenerações
// futuras) — MESMO id usado pelo pack de escudos pra casar por ID exato, e
// muito provavelmente o mesmo esquema que um pack de faces do
// sortitoutsi/FMScout usa (arquivo nomeado só pelo ID numérico da SI).
//
// Match primário: ID exato (nome do arquivo sem extensão === player.id).
// Fallback: nome normalizado + club_id (pra desambiguar homônimos) — só
// funciona se o pack tiver nome de verdade no arquivo, não ID puro.
//
// Converte cada imagem casada pra webp (256×256 max, via sharp) em
// public/faces/<id>.webp e grava face_url no JSON do jogador.
//
// Uso:
//   node scripts/import-player-faces.mjs <pasta-com-as-imagens> [data/football-db]
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import sharp from "sharp";

const INPUT_DIR = process.argv[2];
const DB_DIR = process.argv[3] || path.join(process.cwd(), "data", "football-db");
const OUT_DIR = path.join(process.cwd(), "public", "faces");

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

if (!INPUT_DIR) {
  console.error("Uso: node scripts/import-player-faces.mjs <pasta-com-as-imagens> [data/football-db]");
  process.exit(1);
}
if (!fs.existsSync(INPUT_DIR)) {
  console.error(`Pasta não encontrada: ${INPUT_DIR}`);
  process.exit(1);
}

function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function candidateNameFromFilename(file) {
  const base = file.replace(IMAGE_EXT, "").replace(/[_.-]+/g, " ").trim();
  const stripped = base.replace(/^\d+\s+/, "").replace(/\s+\d+$/, "").trim();
  return stripped || null;
}

function walkImages(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.toLowerCase() === "small") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkImages(full));
    else if (IMAGE_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

async function main() {
  const byId = new Map();
  // Nome normalizado -> lista de jogadores com esse nome (pode ter mais de
  // um homônimo) — só usado quando o match por ID não bate.
  const byName = new Map();
  const byCountry = new Map();
  let totalPlayers = 0;

  for (const country of fs.readdirSync(DB_DIR).sort()) {
    const dir = path.join(DB_DIR, country);
    if (!fs.statSync(dir).isDirectory()) continue;
    const playersPath = path.join(dir, "players.json");
    if (!fs.existsSync(playersPath)) continue;
    const players = JSON.parse(fs.readFileSync(playersPath, "utf8"));
    byCountry.set(country, { playersPath, players });
    totalPlayers += players.length;
    for (const p of players) {
      if (p.id != null) byId.set(String(p.id), p);
      const key = normalize(p.name);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(p);
    }
  }

  const images = walkImages(INPUT_DIR);
  console.log(`Encontrei ${images.length} imagens em ${INPUT_DIR}, ${totalPlayers} jogadores na base.`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let matched = 0, byIdCount = 0, byNameCount = 0, ambiguous = 0;
  const unmatchedFiles = [];

  for (const imgPath of images) {
    const file = path.basename(imgPath);
    const rawStem = file.replace(IMAGE_EXT, "");
    let player = byId.get(rawStem);
    if (player) byIdCount++;
    if (!player) {
      const candidate = candidateNameFromFilename(file);
      const hits = candidate ? byName.get(normalize(candidate)) : null;
      if (hits && hits.length === 1) { player = hits[0]; byNameCount++; }
      else if (hits && hits.length > 1) { ambiguous++; }
    }
    if (!player) {
      unmatchedFiles.push(file);
      continue;
    }
    const outFile = path.join(OUT_DIR, `${player.id ?? rawStem}.webp`);
    await sharp(imgPath)
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 88 })
      .toFile(outFile);
    player.face_url = `/faces/${player.id ?? rawStem}.webp`;
    matched++;
  }

  for (const { playersPath, players } of byCountry.values()) {
    fs.writeFileSync(playersPath, JSON.stringify(players, null, 2));
  }

  console.log(`\n${matched}/${images.length} imagens casadas com um jogador (${byIdCount} por ID exato, ${byNameCount} por nome).`);
  if (ambiguous > 0) console.log(`${ambiguous} imagens puladas por nome homônimo (não deu pra saber qual jogador, e não casou por ID).`);
  if (unmatchedFiles.length) {
    console.log(`\n${unmatchedFiles.length} imagens sem match (primeiras 20):`);
    for (const f of unmatchedFiles.slice(0, 20)) console.log(`  - ${f}`);
  }
}

main();
