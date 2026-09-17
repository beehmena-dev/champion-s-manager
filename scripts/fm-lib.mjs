// -----------------------------------------------------------------------------
// Lógica pura de conversão do export do FM Genie Scout (CLUBES.csv +
// JOGADORES.csv) — extraída de fm-csv-to-seed.mjs pra ser reaproveitada por
// dois escritores diferentes: um seed.json único (fm-csv-to-seed.mjs, formato
// legado que a tela de setup ainda aceita via upload) e uma base em pastas de
// JSON por país/entidade (fm-csv-to-football-db.mjs, a base "padrão" que o
// jogo carrega direto, sem upload).
//
// Nada aqui tem side-effect (sem process.argv, sem fs.writeFileSync) — só lê
// os CSVs do diretório passado e devolve dados em memória.
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";

// --- Config de escopo -----------------------------------------------------
// Division ID -> nome/tier/país. Pra expandir a base, adicione linhas aqui
// (o Division ID sai da coluna "Division ID" do CLUBES.csv).
//
// `playable: true`  -> liga entra como JOGÁVEL por padrão (simulação completa,
//                      jogadores evoluem atributo a atributo, elenco de 30).
// `playable: false` -> liga entra como SEGUNDO PLANO (resultados/tabela/mercado
//                      seguem rodando, mas com simulação leve baseada na força
//                      média do elenco e elenco enxuto de 24). O usuário pode
//                      promover qualquer liga a jogável na tela de configuração,
//                      e a liga do clube escolhido vira jogável automaticamente.
// `tier` + `country` definem a pirâmide de acesso/rebaixamento: fim de
// temporada, os N piores da divisão de cima trocam de lugar com os N melhores
// da divisão de baixo do MESMO país (ver src/lib/season-rollover.ts).
export const LEAGUES = {
  // --- Núcleo jogável (mesmo conjunto histórico do seed) ---
  "102423": { name: "Brasileirão Série A", tier: 1, country: "BR", playable: true },
  "107191": { name: "Brasileirão Série B", tier: 2, country: "BR", playable: true },
  "11":     { name: "Premier League", tier: 1, country: "EN", playable: true },
  "67":     { name: "La Liga", tier: 1, country: "ES", playable: true },
  "32":     { name: "Serie A", tier: 1, country: "IT", playable: true },
  "22":     { name: "Bundesliga", tier: 1, country: "DE", playable: true },
  "16":     { name: "Ligue 1", tier: 1, country: "FR", playable: true },
  "102421": { name: "Liga Profesional (ARG)", tier: 1, country: "AR", playable: true },
  "60":     { name: "Liga Portugal", tier: 1, country: "PT", playable: true },
  // --- Ligas de segundo plano (ampliam o mundo sem pesar o motor) ---
  // Só primeiras divisões — esta base ("DB COM DADOS 2026") vem com as
  // segundas divisões estrangeiras truncadas (elencos vazios). Ligas que não
  // juntam clubes suficientes são descartadas automaticamente no final.
  "12":       { name: "EFL Championship", tier: 2, country: "EN", playable: false },
  "29":       { name: "Eredivisie", tier: 1, country: "NL", playable: false },
  "130286":   { name: "Süper Lig (TUR)", tier: 1, country: "TR", playable: false },
  "40":       { name: "Major League Soccer", tier: 1, country: "US", playable: false },
  "136543":   { name: "Bundesliga (AUT)", tier: 1, country: "AT", playable: false },
  "137889":   { name: "Super League (SUI)", tier: 1, country: "CH", playable: false },
  "135973":   { name: "Liga MX", tier: 1, country: "MX", playable: false },
  "7920263":  { name: "Saudi Pro League", tier: 1, country: "SA", playable: false },
  "5260948":  { name: "Liga BetPlay (COL)", tier: 1, country: "CO", playable: false },
  "5512770":  { name: "Primera División (URU)", tier: 1, country: "UY", playable: false },
  // --- Expansão mundial (2026-09-14) — 77 países novos, primeira divisão de
  // cada um, achados escaneando Division ID/País/Reputação na CLUBES.csv
  // real do usuário e filtrando ruído (baldes de "sem liga"/reservas: exige
  // 12-30 clubes e reputação consistente entre eles). Todos entram como
  // segundo plano (mesmo padrão das ligas de segundo plano já existentes) —
  // o usuário pode promover qualquer uma a jogável na tela de configuração.
  "130486": { name: "RPL", tier: 1, country: "RU", playable: false },
  "129650": { name: "Super League 1", tier: 1, country: "GR", playable: false },
  "79010950": { name: "Primera División", tier: 1, country: "PY", playable: false },
  "5250792": { name: "Campeonato AFP PlanVital", tier: 1, country: "CL", playable: false },
  "5290551": { name: "Liga 1", tier: 1, country: "PE", playable: false },
  "80000566": { name: "LigaPro Serie A", tier: 1, country: "EC", playable: false },
  "86000000": { name: "División Profesional", tier: 1, country: "BO", playable: false },
  "45": { name: "William Hill SPFL", tier: 1, country: "SC", playable: false },
  "131287": { name: "1. ceská fotbalová liga", tier: 1, country: "CZ", playable: false },
  "7520391": { name: "OTP Bank Liga", tier: 1, country: "HU", playable: false },
  "86000001": { name: "Primera División (VEN)", tier: 1, country: "VE", playable: false },
  "6": { name: "Superliga (DEN)", tier: 1, country: "DK", playable: false },
  "12015393": { name: "Premier League (EGY)", tier: 1, country: "EG", playable: false },
  "7880000": { name: "Pro League (UAE)", tier: 1, country: "AE", playable: false },
  "5314301": { name: "Premier League (UKR)", tier: 1, country: "UA", playable: false },
  "1300397": { name: "Eliteserien", tier: 1, country: "NO", playable: false },
  "7500000": { name: "efbet League", tier: 1, country: "BG", playable: false },
  "132321": { name: "SuperLiga (SRB)", tier: 1, country: "RS", playable: false },
  "129558": { name: "Ekstraklasa", tier: 1, country: "PL", playable: false },
  "5632126": { name: "QNB Stars League", tier: 1, country: "QA", playable: false },
  "102428": { name: "J1 League", tier: 1, country: "JP", playable: false },
  "2": { name: "Challenger Pro League", tier: 1, country: "BE", playable: false },
  "692430": { name: "A' Katigoria", tier: 1, country: "CY", playable: false },
  "12019164": { name: "CLP-1", tier: 1, country: "TN", playable: false },
  "136407": { name: "K League 1", tier: 1, country: "KR", playable: false },
  "59007527": { name: "Priemjer Ligasy", tier: 1, country: "KZ", playable: false },
  "1018789": { name: "Iran Pro League", tier: 1, country: "IR", playable: false },
  "7560276": { name: "Fortuna Liga", tier: 1, country: "SK", playable: false },
  "7860000": { name: "Ligat Ha`Al", tier: 1, country: "IL", playable: false },
  "131234": { name: "Premier Division (RSA)", tier: 1, country: "ZA", playable: false },
  "7540024": { name: "Liga I", tier: 1, country: "RO", playable: false },
  "50": { name: "Allsvenskan", tier: 1, country: "SE", playable: false },
  "12019395": { name: "Botola Pro 1", tier: 1, country: "MA", playable: false },
  "59135038": { name: "PFL (UZB)", tier: 1, country: "UZ", playable: false },
  "8401073": { name: "Premijer liga (BIH)", tier: 1, country: "BA", playable: false },
  "7840132": { name: "Besta-deild karla", tier: 1, country: "IS", playable: false },
  "80000563": { name: "Primera División (CRC)", tier: 1, country: "CR", playable: false },
  "129985": { name: "Isuzu UTE A-League", tier: 1, country: "AU", playable: false },
  "130931": { name: "Chinese Super League", tier: 1, country: "CN", playable: false },
  "5624920": { name: "Toyota Thai League", tier: 1, country: "TH", playable: false },
  "129120": { name: "Veikkausliiga", tier: 1, country: "FI", playable: false },
  "7483354": { name: "Vyejaja Liha", tier: 1, country: "BY", playable: false },
  "13109924": { name: "Premier League (GHA)", tier: 1, country: "GH", playable: false },
  "13211724": { name: "Vodacom Premier League", tier: 1, country: "TZ", playable: false },
  "5635022": { name: "Syrian Premier League", tier: 1, country: "SY", playable: false },
  "12015290": { name: "Ligue Professionnelle 1 (ALG)", tier: 1, country: "DZ", playable: false },
  "129646": { name: "Prva nogometa liga", tier: 1, country: "HR", playable: false },
  "36513629": { name: "Sudani Premier League", tier: 1, country: "SD", playable: false },
  "12016011": { name: "Nigeria National League", tier: 1, country: "NG", playable: false },
  "87000495": { name: "Liga Nacional (GUA)", tier: 1, country: "GT", playable: false },
  "12034515": { name: "Girabola", tier: 1, country: "AO", playable: false },
  "13109926": { name: "Ligue 1 (CIV)", tier: 1, country: "CI", playable: false },
  "13208974": { name: "Libyana Premier League", tier: 1, country: "LY", playable: false },
  "13135082": { name: "Super Division (ZAM)", tier: 1, country: "ZM", playable: false },
  "13162593": { name: "Ligue 1 Orange Mali", tier: 1, country: "ML", playable: false },
  "87001116": { name: "Primerà Division (SLV)", tier: 1, country: "SV", playable: false },
  "8401070": { name: "1. MFL", tier: 1, country: "MK", playable: false },
  "23038303": { name: "Dawri Al-Nokhba", tier: 1, country: "IQ", playable: false },
  "432266": { name: "Northern Premier League (NZL)", tier: 1, country: "NZ", playable: false },
  "5340000": { name: "BGL Ligue", tier: 1, country: "LU", playable: false },
  "13191657": { name: "Ligue 1 StarTimes", tier: 1, country: "SN", playable: false },
  "82000461": { name: "Pro League (TRI)", tier: 1, country: "TT", playable: false },
  "130023": { name: "NIFL Premiership", tier: 1, country: "GB", playable: false },
  "81001093": { name: "Red Stripe Premier League", tier: 1, country: "JM", playable: false },
  "40026565": { name: "Indian Super League", tier: 1, country: "IN", playable: false },
  "13172336": { name: "Elite One", tier: 1, country: "CM", playable: false },
  "5635278": { name: "Jordanian Pro League", tier: 1, country: "JO", playable: false },
  "1039313": { name: "Premier League (BHR)", tier: 1, country: "BH", playable: false },
  "5629952": { name: "Lebanese Premier League", tier: 1, country: "LB", playable: false },
  "5624536": { name: "Astro Liga Super Malaysia", tier: 1, country: "MY", playable: false },
  "23071760": { name: "Omantel League", tier: 1, country: "OM", playable: false },
  "19166492": { name: "Campeonato Nacional (CUB)", tier: 1, country: "CU", playable: false },
  "13211662": { name: "Fasofoot D1", tier: 1, country: "BF", playable: false },
  "8351372": { name: "Kategoria e Parë", tier: 1, country: "AL", playable: false },
  "13211690": { name: "Castel Ethiopia Premier League", tier: 1, country: "ET", playable: false },
  "13211639": { name: "SportPesa Premier League", tier: 1, country: "KE", playable: false },
  "39037297": { name: "Premier League (UGA)", tier: 1, country: "UG", playable: false },
};
export const MIN_REP = 2000;   // FM 0-10000 — mais baixo agora que há ligas menores
export const MAX_CLUBS_PER_LEAGUE = 20;
export const MIN_CLUBS_PER_LEAGUE = 12;
export const MIN_SQUAD = 11;

// Alguns clubes vêm com nome abreviado no CSV — normaliza os mais óbvios.
export const CLUB_NAME_FIX = {
  "Man City": "Manchester City",
  "Man Utd": "Manchester United",
  "Spurs": "Tottenham Hotspur",
  "Inter": "Internazionale",
  "Milan": "AC Milan",
  "Barcelona": "FC Barcelona",
  "Bayern München": "Bayern de Munique",
  "Paris Saint-Germain": "Paris Saint-Germain",
};

// Cores de uniforme (1ª e 2ª) pros clubes conhecidos — usadas nos tokens de
// jogador do quadro tático. Casa pelo nome JÁ normalizado (pós CLUB_NAME_FIX).
// Quem não estiver aqui cai no hash determinístico de defaultClubColors.
export const CLUB_COLORS = {
  "Real Madrid": ["#ffffff", "#febe10"], "FC Barcelona": ["#a50044", "#004d98"],
  "Atlético Madrid": ["#cb3524", "#ffffff"], "Atlético de Madrid": ["#cb3524", "#ffffff"],
  "Sevilla": ["#ffffff", "#d81920"], "Sevilla FC": ["#ffffff", "#d81920"],
  "Athletic Bilbao": ["#ee2523", "#ffffff"], "Real Sociedad": ["#0067b1", "#ffffff"],
  "Valencia": ["#ffffff", "#f7a800"], "Real Betis": ["#00954c", "#ffffff"],
  "Villarreal": ["#ffe667", "#005187"],
  "Manchester City": ["#6caddf", "#1c2c5b"], "Manchester United": ["#da291c", "#ffe500"],
  "Liverpool": ["#c8102e", "#00b2a9"], "Arsenal": ["#ef0107", "#ffffff"],
  "Chelsea": ["#034694", "#ffffff"], "Tottenham Hotspur": ["#ffffff", "#132257"],
  "Newcastle United": ["#241f20", "#ffffff"], "Aston Villa": ["#95bfe5", "#670e36"],
  "Internazionale": ["#0b1560", "#000000"], "AC Milan": ["#fb090b", "#000000"],
  "Juventus": ["#000000", "#ffffff"], "Napoli": ["#12a0d7", "#ffffff"],
  "Roma": ["#8e1f2f", "#f0bc42"], "Lazio": ["#87d8f7", "#ffffff"],
  "Atalanta": ["#1d1d1b", "#2b6cb0"],
  "Bayern de Munique": ["#dc052d", "#ffffff"], "Borussia Dortmund": ["#fde100", "#000000"],
  "RB Leipzig": ["#dd0741", "#001f47"], "Bayer Leverkusen": ["#e32219", "#000000"],
  "Paris Saint-Germain": ["#004170", "#da291c"], "Marseille": ["#ffffff", "#2faee0"],
  "AS Monaco": ["#e51b22", "#ffffff"], "Lyon": ["#ffffff", "#e2001a"],
  "Benfica": ["#e40521", "#ffffff"], "Porto": ["#00428c", "#ffffff"],
  "Sporting CP": ["#008057", "#ffffff"],
  "Flamengo": ["#e30613", "#000000"], "Palmeiras": ["#006437", "#ffffff"],
  "Corinthians": ["#000000", "#ffffff"], "São Paulo": ["#fe0000", "#000000"],
  "Fluminense": ["#870a28", "#00613b"], "Botafogo": ["#000000", "#ffffff"],
  "Grêmio": ["#0d80bf", "#000000"], "Internacional": ["#e5050f", "#ffffff"],
  "Atlético Mineiro": ["#000000", "#ffffff"], "Cruzeiro": ["#003da5", "#ffffff"],
  "Vasco da Gama": ["#000000", "#ffffff"], "Santos": ["#ffffff", "#000000"],
  "Boca Juniors": ["#0d47a1", "#ffc107"], "River Plate": ["#ffffff", "#e2001a"],
};

// --- CSV (todo campo entre aspas, sep ";", sem ";"/newline dentro) -------
export function loadCsv(srcDir, file) {
  const text = fs.readFileSync(path.join(srcDir, file)).toString("latin1");
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  const strip = (s) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);
  const header = lines[0].split(";").map(strip);
  return { idx: (n) => header.indexOf(n), rows: lines.slice(1).map((l) => l.split(";").map(strip)) };
}
export const digits = (s) => String(s ?? "").replace(/\./g, "");
export const num = (s) => parseFloat(digits(s).replace(",", ".")) || 0;
export const pct = (s) => parseFloat(String(s ?? "").replace(/%.*/, "").replace(",", ".")) || 0;
export const fmDateToISO = (s) => {
  const m = String(s ?? "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
// "Nível de Contentamento" do Genie Scout vai de -100 (péssimo) a 100
// (ótimo) — reescala pra 0-100 (nossa escala de moral). Confirmado
// amostrando ~86 mil jogadores com clube nesta base: min -100, max 100,
// mediana 28.
export const moraleFromContentment = (s) => Math.max(0, Math.min(100, Math.round((num(s) + 100) / 2)));
export const normalizeName = (raw) => {
  const s = String(raw ?? "").trim();
  const c = s.indexOf(", ");
  return c > 0 ? `${s.slice(c + 2)} ${s.slice(0, c)}`.trim() : s;
};

// As 16 colunas "Classificação <pos>" (% de habilidade em cada posição) do
// Genie Scout. GR L | D E/C/D | A E/D | MD | M E/C/D | MA E/C/D | PLR PLA.
export const POS_RATING_COLS = ["GR", "L", "D E", "D C", "D D", "A E", "A D", "MD", "M E", "M C", "M D", "MA E", "MA C", "MA D", "PLR", "PLA"];

// Destila as 16 notas em 8 "famílias" de posição — é isso que vai no seed e
// que deriveAttributesFromRoles (src/game/attributes.ts) usa pra moldar os 47.
export function roleScores(vals) {
  const v = Object.fromEntries(POS_RATING_COLS.map((k, i) => [k, vals[i]]));
  const mx = (...xs) => Math.max(...xs);
  return {
    gk: v["GR"],
    fb: mx(v["L"], v["A E"], v["A D"]),
    cb: mx(v["D C"], v["D E"], v["D D"]),
    dm: v["MD"],
    cm: mx(v["M E"], v["M C"], v["M D"]),
    am: mx(v["MA E"], v["MA C"], v["MA D"]),
    wing: mx(v["MA E"], v["MA D"]),
    st: mx(v["PLR"], v["PLA"]),
  };
}

// Posição natural = maior das 16 (mais confiável que a coluna "Posição",
// que às vezes lista uma secundária primeiro — ex. Rodri "Def C, MD" volante).
//
// Regra fina pra faixa de meia-atacante e centroavante: um "camisa 10"
// (Foden, De Bruyne) é avaliado quase igual nos três slots MA E/C/D e o FM
// costuma pontuar um pouco MENOS no meio — o argmax cru jogava esses caras pra
// ponta. Agora, se a nota central não fica muito atrás da melhor ponta, ele
// fica de MEI. E o empate esquerda×direita usa um hash do nome pra não
// empilhar todo mundo na esquerda (a ordem das colunas favorecia a esquerda).
export function mapPositionFromRatings(vals, name = "") {
  let bi = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] > vals[bi]) bi = i;
  const code = POS_RATING_COLS[bi];
  const col = (c) => vals[POS_RATING_COLS.indexOf(c)];
  const amL = col("MA E"), amC = col("MA C"), amR = col("MA D");
  const st = Math.max(col("PLR"), col("PLA"));

  const preferRight = () => {
    let h = 2166136261;
    for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 2 === 0;
  };
  const wide = () => {
    if (Math.abs(amL - amR) <= 2) return preferRight() ? { base: "FWD", natural: "PD" } : { base: "FWD", natural: "PE" };
    return amL > amR ? { base: "FWD", natural: "PE" } : { base: "FWD", natural: "PD" };
  };

  switch (code) {
    case "GR": return { base: "GK", natural: "GOL" };
    case "L": return { base: "DEF", natural: "LD" };
    case "D E": return { base: "DEF", natural: "LE" };
    case "D C": return { base: "DEF", natural: "ZAG" };
    case "D D": return { base: "DEF", natural: "LD" };
    case "A E": return { base: "DEF", natural: "ALE" };
    case "A D": return { base: "DEF", natural: "ALD" };
    case "MD": return { base: "MID", natural: "VOL" };
    case "M E": return { base: "MID", natural: "ME" };
    case "M C": return { base: "MID", natural: "MC" };
    case "M D": return { base: "MID", natural: "MD" };
    case "MA E":
    case "MA C":
    case "MA D": {
      if (amC >= Math.max(amL, amR) - 4) return { base: "MID", natural: "MEI" };
      return wide();
    }
    case "PLR":
    case "PLA": {
      // Só vira ponta se a melhor nota aberta quase encosta na de centroavante
      // E ele não é um meia central forte (senão é falso 9 = MEI).
      const bestWide = Math.max(amL, amR);
      if (amC >= st - 3 && amC >= bestWide) return { base: "MID", natural: "MEI" };
      if (bestWide >= st - 2) return wide();
      return { base: "FWD", natural: "CA" };
    }
    default: return { base: "MID", natural: "MC" };
  }
}

// Coluna → posição granular, só pras que têm significado direto e
// não-ambíguo (sem a heurística de comparação que mapPositionFromRatings usa
// pras colunas MA*/PLR/PLA acima) — usado só pra achar posições SECUNDÁRIAS
// a partir da nota bruta de cada uma das 16 colunas. "L" fica de fora (sem
// certeza do que representa no export do Genie Scout — não inventar).
const COL_TO_POSITION = {
  "GR": "GOL", "D E": "LE", "D C": "ZAG", "D D": "LD", "A E": "ALE", "A D": "ALD",
  "MD": "VOL", "M E": "ME", "M C": "MC", "M D": "MD", "MA C": "MEI",
  "MA E": "PE", "MA D": "PD", "PLR": "CA", "PLA": "CA",
};

// Posições SECUNDÁRIAS reais, a partir das 16 notas do CSV — antes eram
// descartadas de vez (só a de maior nota virava natural_position, achado
// real reportado pelo usuário: "Raphinha vira só bom em PD quando o CSV tem
// nota pra várias outras posições"). Pega até 3 posições diferentes da
// primária cuja nota fica perto da melhor (≥ melhor-15 pontos, ou ≥65, o que
// for maior) — mesmo espírito de "jogador realmente versátil tem 2-4
// posições reais" que o FM usa.
export function secondaryPositionsFromRatings(vals, primary) {
  const best = Math.max(...vals);
  const floor = Math.max(best - 15, 65);
  const seen = new Map(); // posição -> melhor nota encontrada pra ela
  for (let i = 0; i < POS_RATING_COLS.length; i++) {
    const pos = COL_TO_POSITION[POS_RATING_COLS[i]];
    if (!pos || pos === primary) continue;
    const v = vals[i];
    if (v < floor) continue;
    if (!seen.has(pos) || seen.get(pos) < v) seen.set(pos, v);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([pos]) => pos);
}

// Valor de mercado e salário — derivados de overall+idade. Os números do CSV
// desta base ("BR MUNDI UP") vêm inconsistentes (Haaland €1M, Rodri €0,6M ao
// lado de valores certos), então é mais coerente derivar tudo de uma curva
// só do que misturar dado bom com quebrado.
export function derivedValue(overall, age) {
  // Curva exponencial: OVR 45 ~ €45k, 55 ~ €235k, 65 ~ €1,2M, 75 ~ €6,4M,
  // 85 ~ €33M, 95 ~ €173M — na faixa que o mercado real usa.
  const base = Math.exp((overall - 45) * 0.165) * 45000;
  const ageMul = age <= 20 ? 1.1 : age <= 24 ? 1.2 : age <= 28 ? 1 : age <= 31 ? 0.55 : age <= 34 ? 0.25 : 0.08;
  return Math.round(base * ageMul);
}
export function derivedWage(overall) {
  return Math.round(3000 + Math.pow(Math.max(overall - 40, 1), 2.1) * 22);
}

// Monta os clubes (com jogadores aninhados) a partir dos dois CSVs do Genie
// Scout em `csvDir`. Devolve o resultado em memória, ainda com `id` (o "ID
// Único" do CSV, chave estável — útil pra quem for referenciar clube↔jogador
// entre arquivos separados) e os campos internos `_divId`/`_playable` — quem
// escreve a saída final decide o que manter/descartar.
export function buildClubsAndPlayers(csvDir) {
  const C = loadCsv(csvDir, "CLUBES.csv");
  const P = loadCsv(csvDir, "JOGADORES.csv");
  const cId = (n) => C.idx(n);
  const pId = (n) => P.idx(n);

  const wantedDivIds = new Set(Object.keys(LEAGUES));
  const clubs = new Map();
  for (const r of C.rows) {
    const divId = r[cId("Division ID")];
    if (!wantedDivIds.has(divId)) continue;
    const rep = num(r[cId("Reputação")]);
    if (rep < MIN_REP) continue;
    const id = digits(r[cId("ID Único")]);
    let name = (r[cId("Nome")] ?? "").trim();
    if (!id || !name) continue;
    name = CLUB_NAME_FIX[name] ?? name;
    const balance = num(r[cId("Balanço")]);
    const transferBudget = num(r[cId("Orçamento Transferências Época")]);
    const colors = CLUB_COLORS[name] ?? null;
    const repScaled = Math.round(rep / 100); // 0-100
    // "Condições Treino"/"Condições Camadas Jovens" do FM vão de 1-20 →
    // nossa escala de instalações é 1-5 (mesma conversão pros dois campos,
    // eram exportados lado a lado na CLUBES.csv). Antes a gente derivava
    // youth_facilities da reputação por achar que a CSV não trazia isso —
    // trazia, só não estava sendo lida.
    const scaleFacility = (raw) => (raw > 0 ? Math.max(1, Math.min(5, Math.round(raw / 4))) : 3);
    const training_facilities = scaleFacility(num(r[cId("Condições Treino")]));
    const youth_facilities = scaleFacility(num(r[cId("Condições Camadas Jovens")]));
    const wageBudget = num(r[cId("Orçamento Salários")]);
    const avgAttendance = num(r[cId("Assistência Média")]);
    clubs.set(id, {
      id,
      competition: `D${divId}`,
      _divId: divId,
      _playable: LEAGUES[divId].playable !== false,
      name,
      short_name: name.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 3).toUpperCase(),
      primary_color: colors?.[0] ?? null,
      secondary_color: colors?.[1] ?? null,
      budget: Math.max(0, Math.round(balance > 0 ? balance : transferBudget * 2 || rep * 500)),
      // Informativos por enquanto — não substituem o cálculo de orçamento
      // acima (que já é ajustado por causa de dados inconsistentes na base),
      // só ficam guardados pra exibição/imersão real.
      wage_budget: wageBudget > 0 ? Math.round(wageBudget) : null,
      avg_attendance: avgAttendance > 0 ? Math.round(avgAttendance) : null,
      reputation: repScaled,
      stadium_capacity: num(r[cId("Capacidade Estádio")]) || 15000,
      training_facilities,
      youth_facilities,
      division: LEAGUES[divId].tier,
      morale: 70,
      players: [],
    });
  }

  // Cada liga fica com no máx. MAX_CLUBS_PER_LEAGUE clubes (os de maior
  // reputação) — a base do FM lista divisões inteiras com 20-30 times e times
  // filiais; um número redondo por liga mantém o calendário são. Ligas que
  // não juntam o mínimo são descartadas por inteiro mais abaixo.
  {
    const byDiv = new Map();
    for (const [id, c] of clubs) {
      const list = byDiv.get(c._divId) ?? [];
      list.push([id, c]);
      byDiv.set(c._divId, list);
    }
    for (const [, list] of byDiv) {
      if (list.length <= MAX_CLUBS_PER_LEAGUE) continue;
      list.sort((a, b) => b[1].reputation - a[1].reputation);
      for (const [id] of list.slice(MAX_CLUBS_PER_LEAGUE)) clubs.delete(id);
    }
  }

  const posRatingIdx = POS_RATING_COLS.map((p) => pId(`Classificação ${p}`));
  let attached = 0;
  for (const r of P.rows) {
    const club = clubs.get(digits(r[pId("ID do Clube")]));
    if (!club) continue;
    const name = normalizeName(r[pId("Nome")]);
    if (!name) continue;
    const ratingVals = posRatingIdx.map((i) => pct(r[i]));
    const { base, natural } = mapPositionFromRatings(ratingVals, name);
    // Teto real do jogo é 99 (ver src/lib/advance-day.ts e src/game/youth.ts,
    // que já clampam em 99) — antes vinha 95/97 aqui, artificialmente mais
    // baixo que o resto do motor, sem necessidade.
    const overall = Math.max(20, Math.min(99, Math.round(pct(r[pId("Melhor Classificação")]))));
    const potential = Math.max(overall, Math.min(99, Math.round(pct(r[pId("Melhor Classificação Potencial")]))));
    const age = num(r[pId("Idade")]) || 24;
    const releaseClause = num(r[pId("Cláusula Mínima")]);
    const caps = num(r[pId("Internacionalizações")]);
    const capGoals = num(r[pId("Gols Internacionais")]);

    club.players.push({
      // "ID Único" do jogador (JOGADORES.csv) — mesmo princípio do id de
      // clube (ver acima), chave estável pra casar foto real de jogador
      // (scripts/import-player-faces.mjs) igual já funciona pra escudo.
      id: digits(r[pId("ID Único")]),
      name, age, position: base,
      natural_position: natural, secondary_positions: secondaryPositionsFromRatings(ratingVals, natural),
      role_scores: roleScores(ratingVals),
      foot: "right",
      overall, potential,
      market_value: derivedValue(overall, age),
      wage: derivedWage(overall),
      contract_until: fmDateToISO(r[pId("Fim Contrato")]),
      // Real, direto da CSV — antes vinham fixos (70/100/65) porque a gente
      // achava que a base não trazia isso. "Condição"/"Forma" já são % (0-100,
      // mesma escala nossa); "Nível de Contentamento" é -100..100 (rescala
      // pra moral 0-100 — ver moraleFromContentment acima).
      morale: moraleFromContentment(r[pId("Nível de Contentamento")]),
      condition: Math.max(0, Math.min(100, Math.round(pct(r[pId("Condição")])))) || 100,
      form: Math.max(0, Math.min(100, Math.round(pct(r[pId("Forma")])))),
      injured_until: null,
      // Novos campos reais (ver migration 20260914170000_fm_import_real_fields).
      nationality: (r[pId("País")] ?? "").trim() || null,
      birth_date: fmDateToISO(r[pId("Data De Nascimento")]),
      international_caps: caps > 0 ? Math.round(caps) : 0,
      international_goals: capGoals > 0 ? Math.round(capGoals) : 0,
      // "Ingressou No Clube" — química de elenco por tempo junto
      // (squadChemistryMultiplier). Antes ficava sempre null pra qualquer
      // elenco importado por não termos a data real; agora temos.
      club_since: fmDateToISO(r[pId("Ingressou No Clube")]),
      release_clause: releaseClause > 0 ? Math.round(releaseClause) : null,
    });
    attached++;
  }

  // A base do FM lista o elenco inteiro (base, reservas, emprestados) —
  // clubes grandes vêm com 60-98 nomes. Corta pra um plantel de tamanho de
  // jogo: os melhores por overall, garantindo um mínimo por setor pra não
  // faltar goleiro. Liga jogável guarda 30; liga de segundo plano guarda 24
  // (XI + reservas + um pouco de banco), o bastante pra tela de elenco/
  // olheiro sem inflar o banco.
  const CAP_PLAYABLE = 30;
  const CAP_BACKGROUND = 24;
  const MIN_BY_POS = { GK: 3, DEF: 8, MID: 7, FWD: 4 };
  for (const c of clubs.values()) {
    const cap = c._playable ? CAP_PLAYABLE : CAP_BACKGROUND;
    if (c.players.length > cap) {
      const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
      for (const p of [...c.players].sort((a, b) => b.overall - a.overall)) byPos[p.position].push(p);
      const keep = new Set();
      for (const [pos, min] of Object.entries(MIN_BY_POS)) byPos[pos].slice(0, min).forEach((p) => keep.add(p));
      for (const p of [...c.players].sort((a, b) => b.overall - a.overall)) {
        if (keep.size >= cap) break;
        keep.add(p);
      }
      c.players = c.players.filter((p) => keep.has(p));
    }
    // Força média do elenco (top 18 por overall) — cache usado pela
    // simulação leve das ligas de segundo plano e pela virada de temporada
    // rápida, pra o motor nunca precisar carregar os jogadores desses clubes.
    const top = [...c.players].sort((a, b) => b.overall - a.overall).slice(0, 18);
    c.strength = top.length ? Math.round(top.reduce((s, p) => s + p.overall, 0) / top.length) : 45;
  }

  // Só clubes com elenco jogável de verdade (>= MIN_SQUAD e com goleiro).
  // Esta base do FM ("DB COM DADOS 2026", editada com foco no Brasil) traz
  // várias divisões estrangeiras com elencos truncados/vazios — este filtro
  // tira o lixo.
  let finalClubs = [...clubs.values()].filter(
    (c) => c.players.length >= MIN_SQUAD && c.players.some((p) => p.position === "GK"),
  );

  // Descarta ligas que, DEPOIS do filtro acima, não juntaram o mínimo de
  // clubes (calendário quebra sem isso), e força número PAR de clubes por
  // liga (round robin não lida bem com bye) — corta o(s) de menor reputação.
  {
    const byComp = new Map();
    for (const c of finalClubs) {
      const list = byComp.get(c.competition) ?? [];
      list.push(c);
      byComp.set(c.competition, list);
    }
    const drop = new Set();
    for (const [code, list] of byComp) {
      if (list.length < MIN_CLUBS_PER_LEAGUE) {
        for (const c of list) drop.add(c);
        console.warn(`  (liga ${code} "${LEAGUES[code.slice(1)]?.name}" descartada: só ${list.length} clubes jogáveis)`);
        continue;
      }
      if (list.length % 2 === 1) {
        const weakest = [...list].sort((a, b) => a.reputation - b.reputation)[0];
        drop.add(weakest);
      }
    }
    finalClubs = finalClubs.filter((c) => !drop.has(c));
  }

  const usedComps = new Set(finalClubs.map((c) => c.competition));
  const playableComps = [...usedComps].filter((code) => LEAGUES[code.slice(1)]?.playable !== false);

  return { finalClubs, usedComps, playableComps, attached };
}
