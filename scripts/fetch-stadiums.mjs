// -----------------------------------------------------------------------------
// Enriquece data/football-db/<país>/clubs.json com nome/cidade real do
// estádio e ano de fundação, puxados do openfootball/clubs
// (github.com/openfootball/clubs, licença CC0 — domínio público, uso livre
// confirmado). A CSV do FM Genie Scout NÃO traz isso (só capacidade), então
// não tem como vir de lá.
//
// Roda DEPOIS de fm-csv-to-football-db.mjs ter gerado a pasta (é um passo de
// enriquecimento, não de geração — não mexe em clube/jogador nenhum além de
// adicionar esses 3 campos). Casa por nome (incluindo os apelidos que o
// próprio dataset já lista, ex. "Arsenal" além de "Arsenal FC") — clube que
// não casar ou país sem cobertura no openfootball fica sem esses campos,
// nunca inventado.
//
// Uso:
//   node scripts/fetch-stadiums.mjs [data/football-db]
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";

const OUT_DIR = process.argv[2] || path.join(process.cwd(), "data", "football-db");

// País (código usado em data/football-db/<código>/) -> caminho do dataset no
// repo openfootball/clubs. Descoberto navegando o repo real (2026-09-14) —
// nem todo país tem cobertura lá (ex. Nigéria: sem dataset nenhum em africa/).
const SOURCES = {
  AR: "south-america/argentina/ar.clubs.txt",
  AT: "europe/austria/at.clubs.txt",
  BR: "south-america/brazil/br.clubs.txt",
  CH: "europe/switzerland/ch.clubs.txt",
  CL: "south-america/chile/cl.clubs.txt",
  CO: "south-america/colombia/co.clubs.txt",
  DE: "europe/germany/de.clubs.txt",
  EN: "europe/england/eng.clubs.txt",
  ES: "europe/spain/es.clubs.txt",
  FR: "europe/france/fr.clubs.txt",
  IN: "asia/india/in.clubs.txt",
  IT: "europe/italy/it.clubs.txt",
  JM: "caribbean/jamaica/jm.clubs.txt",
  JP: "asia/japan/jp.clubs.txt",
  MX: "north-america/mexico/mx.clubs.txt",
  NL: "europe/netherlands/nl.clubs.txt",
  NO: "europe/norway/no.clubs.txt",
  PL: "europe/poland/pl.clubs.txt",
  PT: "europe/portugal/pt.clubs.txt",
  RO: "europe/romania/ro.clubs.txt",
  SA: "middle-east/saudi-arabia/sa.clubs.txt",
  TR: "europe/turkey/tr.clubs.txt",
  US: "north-america/united-states/us.clubs.txt",
  UY: "south-america/uruguay/uy.clubs.txt",
  ZA: "africa/south-africa/za.clubs.txt",
  // NG (Nigéria): sem dataset no openfootball/clubs hoje.
};

const BASE_URL = "https://raw.githubusercontent.com/openfootball/clubs/master/";

// Formato football.db (ver NOTES.CLUBS.md do repo):
//   Nome do Clube, AnoFundação, @ Estádio, Cidade (Bairro)   ## comentário
//   | apelido1 | apelido2 | ...
// Ano e "@ Estádio" são opcionais — time sem estádio catalogado não tem como
// virar match útil (não sabemos o estádio dele), então essas linhas são
// puladas de propósito.
function parseClubsTxt(text) {
  const entries = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s*##.*$/, ""); // tira comentário de fim de linha
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("=") || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("|")) {
      if (!current) continue;
      for (const alias of trimmed.split("|").map((s) => s.trim()).filter(Boolean)) {
        current.aliases.push(alias);
      }
      continue;
    }
    const m = line.match(/^([^,]+),\s*(?:(\d{4}),\s*)?@\s*([^,]+),\s*(.+)$/);
    if (m) {
      const [, name, year, stadium, cityRaw] = m;
      const city = cityRaw.replace(/\s*\([^)]*\)\s*$/, "").trim();
      current = { name: name.trim(), founded: year ? Number(year) : null, stadium: stadium.trim(), city, aliases: [] };
      entries.push(current);
    } else {
      current = null; // linha sem "@ Estádio" — nada útil pra casar aqui
    }
  }
  return entries;
}

// Normaliza pra comparar: minúsculo, sem acento, sem sufixo genérico de
// clube (FC/CF/AC/...), só alfanumérico. "Manchester City FC" e
// "Manchester City" viram a mesma chave.
const GENERIC_SUFFIX = /\b(fc|cf|sc|ac|afc|cd|ce|ec|ca|ud|sd|rc|club|clube|futebol|futbol|calcio|clube de regatas|esporte clube|associação|atlético|atletico)\b/g;
function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(GENERIC_SUFFIX, "")
    .replace(/[^a-z0-9]/g, "");
}

async function fetchCountry(code, relPath) {
  const url = BASE_URL + relPath;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  [${code}] falhou (${res.status}) ${url}`);
    return null;
  }
  return parseClubsTxt(await res.text());
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error(`Pasta não encontrada: ${OUT_DIR} — rode fm-csv-to-football-db.mjs primeiro.`);
    process.exit(1);
  }
  let totalClubs = 0, totalMatched = 0;
  for (const country of fs.readdirSync(OUT_DIR).sort()) {
    const dir = path.join(OUT_DIR, country);
    if (!fs.statSync(dir).isDirectory()) continue;
    const clubsPath = path.join(dir, "clubs.json");
    if (!fs.existsSync(clubsPath)) continue;
    const clubs = JSON.parse(fs.readFileSync(clubsPath, "utf8"));
    totalClubs += clubs.length;

    const rel = SOURCES[country];
    if (!rel) {
      console.log(`[${country}] sem cobertura no openfootball/clubs — pulando (${clubs.length} clubes ficam sem estádio/fundação)`);
      continue;
    }
    const entries = await fetchCountry(country, rel);
    if (!entries) continue;

    const lookup = new Map();
    for (const e of entries) {
      lookup.set(normalize(e.name), e);
      for (const alias of e.aliases) if (!lookup.has(normalize(alias))) lookup.set(normalize(alias), e);
    }

    let matched = 0;
    for (const c of clubs) {
      const hit = lookup.get(normalize(c.name));
      if (!hit) continue;
      c.stadium_name = hit.stadium;
      c.stadium_city = hit.city;
      if (hit.founded) c.founded_year = hit.founded;
      matched++;
    }
    totalMatched += matched;
    fs.writeFileSync(clubsPath, JSON.stringify(clubs, null, 2));
    console.log(`[${country}] ${matched}/${clubs.length} clubes casados (${entries.length} no openfootball)`);
  }
  console.log(`\nTotal: ${totalMatched}/${totalClubs} clubes com estádio/fundação reais.`);
}

main();
