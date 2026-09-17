// -----------------------------------------------------------------------------
// Cores reais de clube (primary_color/secondary_color), pesquisadas à mão
// (infobox da Wikipedia de cada clube, 15/09/2026) — não existe nenhum
// dataset aberto abrangente de cores de clube pra todos os nossos 26 países
// (procurado: jimniels/teamcolors só cobre EPL/ligas americanas,
// jokecamp/FootballData não tem cores). Casa por nome normalizado DENTRO DO
// PAÍS certo, nunca globalmente — achado real testando a primeira versão
// deste script: "Atlético Nacional" (Colômbia, verde/branco de verdade)
// colidiu com o "Nacional" do Uruguai (branco/azul) porque a normalização
// tira "atlético" como palavra genérica, os dois viravam a mesma chave
// "nacional". CORES SÃO POR PAÍS AGORA, cada bloco só toca sua própria
// pasta — nunca mais risco de vazar cor de um país pro outro.
//
// Cobertura parcial de propósito — só os clubes que eu realmente conferi
// (hoje: Uruguai completo). scripts/import-club-crests.mjs também preenche
// cor (extraída do escudo real), mas nunca sobrescreve o que já estiver
// aqui — os dois só preenchem campo vazio, ordem não importa.
//
// Uso:
//   node scripts/fetch-club-colors.mjs [data/football-db]
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";

const DB_DIR = process.argv[2] || path.join(process.cwd(), "data", "football-db");

// Cada país é seu próprio bloco de nome->cor — nunca compartilha chave com
// outro país, mesmo que o nome pareça igual (ex. "River Plate" existe em
// vários países com cores diferentes).
const COLORS_BY_COUNTRY = {
  // Uruguai — Primera División 2024/25, conferido na Wikipedia (infobox de
  // cada clube) em 15/09/2026. Cores aproximadas em hex a partir da
  // descrição textual do kit principal (Wikipedia raramente dá hex exato).
  UY: {
    "Albion": { primary: "#dc2626", secondary: "#1d4ed8" }, // tricolor vermelho/azul/branco
    "Boston River": { primary: "#16a34a", secondary: "#dc2626" }, // "Verdirrojo"
    "Cerro": { primary: "#38bdf8", secondary: "#ffffff" }, // celeste/branco listrado
    "Progreso": { primary: "#dc2626", secondary: "#facc15" },
    "Cerro Largo": { primary: "#2563eb", secondary: "#ffffff" },
    "Danubio": { primary: "#ffffff", secondary: "#000000" }, // camisa branca, faixa preta
    "Defensor Sporting": { primary: "#7c3aed", secondary: "#ffffff" }, // "El Violeta"
    "Juventud": { primary: "#2563eb", secondary: "#facc15" }, // "Canarios"
    "Liverpool": { primary: "#000000", secondary: "#1d4ed8" }, // "Negriazules"
    "Miramar Misiones": { primary: "#ffffff", secondary: "#000000" },
    "Montevideo City Torque": { primary: "#38bdf8", secondary: "#000000" },
    "Nacional": { primary: "#ffffff", secondary: "#1d4ed8" }, // branco/azul/vermelho, "os Tricolores"
    "Peñarol": { primary: "#facc15", secondary: "#000000" }, // "Aurinegros"
    "Plaza Colonia": { primary: "#ffffff", secondary: "#16a34a" },
    "River Plate Montevideo": { primary: "#dc2626", secondary: "#ffffff" }, // listrado vermelho/branco
    "Wanderers": { primary: "#000000", secondary: "#ffffff" }, // listrado preto/branco
  },
};

const GENERIC_SUFFIX = /\b(fc|cf|sc|ac|afc|cd|ce|ec|ca|ud|sd|rc|club|clube|futebol|futbol|calcio|clube de regatas|esporte clube|associação|atlético|atletico)\b/g;
function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(GENERIC_SUFFIX, "")
    .replace(/[^a-z0-9]/g, "");
}

let totalClubs = 0, totalMatched = 0;
for (const country of fs.readdirSync(DB_DIR).sort()) {
  const dir = path.join(DB_DIR, country);
  if (!fs.statSync(dir).isDirectory()) continue;
  const clubsPath = path.join(dir, "clubs.json");
  if (!fs.existsSync(clubsPath)) continue;
  const countryColors = COLORS_BY_COUNTRY[country];
  if (!countryColors) continue; // sem cobertura pesquisada pra esse país ainda

  const lookup = new Map();
  for (const [name, colors] of Object.entries(countryColors)) lookup.set(normalize(name), colors);

  const clubs = JSON.parse(fs.readFileSync(clubsPath, "utf8"));
  totalClubs += clubs.length;

  let matched = 0;
  for (const c of clubs) {
    const hit = lookup.get(normalize(c.name));
    if (!hit) continue;
    // Nunca sobrescreve cor já preenchida (ex. por import-club-crests.mjs
    // rodado antes).
    c.primary_color ??= hit.primary;
    c.secondary_color ??= hit.secondary;
    matched++;
  }
  fs.writeFileSync(clubsPath, JSON.stringify(clubs, null, 2));
  console.log(`[${country}] ${matched}/${clubs.length} clubes com cor real conferida`);
  totalMatched += matched;
}

console.log(`\nTotal: ${totalMatched}/${totalClubs} clubes com cor real (só a cobertura pesquisada até agora — o resto continua no hash procedural).`);
