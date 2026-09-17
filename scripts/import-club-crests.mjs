// -----------------------------------------------------------------------------
// Casa um pack de escudos reais (pasta local de imagens, ex. extraída de um
// zip de logos de clube tipo sortitoutsi/FMScout) com os clubes de
// data/football-db/<país>/clubs.json, por nome normalizado — mesmo padrão de
// scripts/fetch-stadiums.mjs (que fez o mesmo pra estádio/fundação via
// openfootball). Converte cada imagem casada pra webp (256×256 max, via
// sharp) em public/crests/<id-do-clube>.webp e grava clubs.json com
// crest_url = "/crests/<id>.webp" — Vite serve public/ como está tanto no
// dev quanto no build empacotado do Tauri (frontendDist = dist/client
// inteiro), então não precisa de nenhum passo extra de deploy.
//
// A estrutura de nome de arquivo varia de pack pra pack. Achado real
// testando com o pack de verdade (footbe/FMScout, 15/09/2026): os arquivos
// são nomeados só por ID numérico da SI (ex. "107201.png"), sem nome
// nenhum — mas esse MESMO ID já é o "ID Único" que scripts/
// fm-csv-to-football-db.mjs grava em clubs.json (vem do Genie Scout, que lê
// direto do banco da SI). Confirmado por amostragem: 8/10 clubes do Brasil
// bateram no ID exato. Então o match primário é por ID EXATO (nome do
// arquivo sem extensão === club.id) — muito mais confiável que nome. Fallback
// pra nome normalizado (heurística antiga) só quando o ID não bate em nada,
// pra continuar funcionando com pack de outro formato. Reporta honestamente
// quem não casou, pros dois lados. Nunca inventa match.
//
// Também extrai primary_color/secondary_color reais do próprio escudo
// (pixel mais frequente, ignorando fundo transparente) pra qualquer clube
// que ainda não tenha cor definida — mais confiável que adivinhar, e é a
// cor DAQUELE escudo específico. Nunca sobrescreve cor já pesquisada (ver
// scripts/fetch-club-colors.mjs).
//
// Uso:
//   node scripts/import-club-crests.mjs <pasta-com-as-imagens> [data/football-db]
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import sharp from "sharp";

const INPUT_DIR = process.argv[2];
const DB_DIR = process.argv[3] || path.join(process.cwd(), "data", "football-db");
const OUT_DIR = path.join(process.cwd(), "public", "crests");

const IMAGE_EXT = /\.(png|jpe?g|webp|svg)$/i;

if (!INPUT_DIR) {
  console.error("Uso: node scripts/import-club-crests.mjs <pasta-com-as-imagens> [data/football-db]");
  process.exit(1);
}
if (!fs.existsSync(INPUT_DIR)) {
  console.error(`Pasta não encontrada: ${INPUT_DIR}`);
  process.exit(1);
}

// Mesma normalização de scripts/fetch-stadiums.mjs (minúsculo, sem acento,
// sem sufixo genérico de clube, só alfanumérico) — assim "SE Palmeiras",
// "Palmeiras FC" e "palmeiras.png" caem na mesma chave.
const GENERIC_SUFFIX = /\b(fc|cf|sc|ac|afc|cd|ce|ec|ca|ud|sd|rc|club|clube|futebol|futbol|calcio|clube de regatas|esporte clube|associação|atlético|atletico)\b/g;
function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(GENERIC_SUFFIX, "")
    .replace(/[^a-z0-9]/g, "");
}

// Nome candidato a partir do nome do arquivo: tira extensão, troca
// _/-/. por espaço, tira um prefixo/sufixo de ID puramente numérico (comum
// em pack organizado por ID da SI, ex. "123456 Flamengo.png" ou
// "Flamengo_123456.png") — se sobrar só dígito, o arquivo fica sem candidato
// de nome (cai no relatório de "sem match", não tenta adivinhar).
function candidateNameFromFilename(file) {
  const base = file.replace(IMAGE_EXT, "").replace(/[_.-]+/g, " ").trim();
  const stripped = base.replace(/^\d+\s+/, "").replace(/\s+\d+$/, "").trim();
  return stripped || null;
}

// Cor real do clube extraída do próprio escudo — mais confiável que
// qualquer dataset externo (é o escudo DE VERDADE daquele clube). Ignora
// pixel transparente (fundo do PNG) via alpha < 128; quantiza canal em
// blocos de 24 pra agrupar sombras/variações de anti-aliasing na mesma cor;
// cor mais frequente = primária, próxima cor suficientemente distinta
// (distância euclidiana > 60) = secundária. Só roda em cima de quem JÁ
// casou (não adianta tentar em imagem sem clube).
async function extractColors(imgPath) {
  let data, info;
  try {
    ({ data, info } = await sharp(imgPath)
      .resize(48, 48, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }));
  } catch {
    return null; // formato que o sharp não consegue rasterizar (svg quebrado etc.)
  }
  const counts = new Map();
  const BUCKET = 24;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue; // pixel transparente = fundo
    const qr = Math.round(data[i] / BUCKET) * BUCKET;
    const qg = Math.round(data[i + 1] / BUCKET) * BUCKET;
    const qb = Math.round(data[i + 2] / BUCKET) * BUCKET;
    const key = `${qr},${qg},${qb}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null; // imagem toda transparente
  const toHex = (key) => "#" + key.split(",").map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join("");
  const dist = (k1, k2) => {
    const a = k1.split(",").map(Number), b = k2.split(",").map(Number);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  };
  const primaryKey = sorted[0][0];
  const secondaryEntry = sorted.find(([key]) => dist(key, primaryKey) > 60);
  return {
    primary: toHex(primaryKey),
    secondary: secondaryEntry ? toHex(secondaryEntry[0]) : toHex(primaryKey),
  };
}

// "small" = pasta de miniatura duplicada em resolução menor (confirmado no
// pack footbe: mesmos ~1400 IDs, imagem menor) — pulamos, controlamos nosso
// próprio resize via sharp de qualquer forma.
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
  // Dois índices de TODOS os países de uma vez (o pack não segue
  // necessariamente nossa pasta por país): por ID exato (prioridade) e por
  // nome normalizado (fallback).
  const byId = new Map();
  const byName = new Map();
  const byCountry = new Map();
  let totalClubs = 0;

  for (const country of fs.readdirSync(DB_DIR).sort()) {
    const dir = path.join(DB_DIR, country);
    if (!fs.statSync(dir).isDirectory()) continue;
    const clubsPath = path.join(dir, "clubs.json");
    if (!fs.existsSync(clubsPath)) continue;
    const clubs = JSON.parse(fs.readFileSync(clubsPath, "utf8"));
    byCountry.set(country, { clubsPath, clubs });
    totalClubs += clubs.length;
    for (const c of clubs) {
      if (c.id != null) byId.set(String(c.id), c);
      const key = normalize(c.name);
      if (key && !byName.has(key)) byName.set(key, c);
    }
  }

  const images = walkImages(INPUT_DIR);
  console.log(`Encontrei ${images.length} imagens em ${INPUT_DIR}, ${totalClubs} clubes na base.`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let matched = 0, byIdCount = 0, byNameCount = 0;
  const unmatchedFiles = [];
  const matchedClubIds = new Set();

  for (const imgPath of images) {
    const file = path.basename(imgPath);
    const rawStem = file.replace(IMAGE_EXT, "");
    let club = byId.get(rawStem);
    if (club) byIdCount++;
    if (!club) {
      const candidate = candidateNameFromFilename(file);
      if (candidate) club = byName.get(normalize(candidate));
      if (club) byNameCount++;
    }
    if (!club) {
      unmatchedFiles.push(file);
      continue;
    }
    const outFile = path.join(OUT_DIR, `${club.id}.webp`);
    await sharp(imgPath)
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toFile(outFile);
    club.crest_url = `/crests/${club.id}.webp`;

    // Só preenche cor se o clube ainda não tem uma real definida (nunca
    // sobrescreve uma cor já pesquisada/confirmada, ex. scripts/
    // fetch-club-colors.mjs) — preenche o resto que não tem nada ainda.
    if (!club.primary_color || !club.secondary_color) {
      const colors = await extractColors(imgPath);
      if (colors) {
        club.primary_color ??= colors.primary;
        club.secondary_color ??= colors.secondary;
      }
    }

    matchedClubIds.add(club.id);
    matched++;
  }

  for (const { clubsPath, clubs } of byCountry.values()) {
    fs.writeFileSync(clubsPath, JSON.stringify(clubs, null, 2));
  }

  console.log(`\n${matched}/${images.length} imagens casadas com um clube (${byIdCount} por ID exato, ${byNameCount} por nome).`);
  console.log(`${matchedClubIds.size}/${totalClubs} clubes da base ganharam escudo real.`);
  if (unmatchedFiles.length) {
    console.log(`\n${unmatchedFiles.length} imagens sem match (primeiras 20):`);
    for (const f of unmatchedFiles.slice(0, 20)) console.log(`  - ${f}`);
  }
}

main();
