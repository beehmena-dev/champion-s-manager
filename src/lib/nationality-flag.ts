// Bandeiras por nacionalidade — o texto vem livre do FM Genie Scout, em
// português (players.nationality). Mapeia nome -> código ISO 3166-1 alpha-2
// pra usar com a lib flag-icons (SVG real, ver NationalityFlag em
// src/components/nationality-flag.tsx). Inglaterra/Escócia/País de Gales não
// têm código ISO próprio (fazem parte do Reino Unido) — flag-icons tem
// códigos de subdivisão próprios pra eles (gb-eng/gb-sct/gb-wls). Nome sem
// mapeamento (ex. território sem bandeira reconhecida, "País Basco") devolve
// null — quem renderiza mostra só o texto nesse caso, sem quebrar nada.
//
// Cobre as 164 nacionalidades reais encontradas na base atual (ver
// scripts/fm-csv-to-football-db.mjs) — se um país novo aparecer numa base
// futura sem estar aqui, só cai no fallback "sem bandeira, só texto".
//
// Histórico: a primeira versão gerava emoji via "regional indicator symbols"
// (Unicode), mas confirmado (14-15/09/2026) que nem o navegador nem o app
// desktop empacotado (WebView2) renderizam esses emoji de forma confiável no
// Windows — trocado pra SVG real via flag-icons (MIT).

const NAME_TO_ISO: Record<string, string> = {
  "Albânia": "al", "Alemanha": "de", "Angola": "ao", "Antígua e Barbuda": "ag",
  "Argentina": "ar", "Argélia": "dz", "Arménia": "am", "Aruba": "aw", "Arábia Saudita": "sa",
  "Austrália": "au", "Azerbaijão": "az", "Bahrein": "bh", "Bangladesh": "bd", "Barbados": "bb",
  "Benim": "bj", "Bielorrússia": "by", "Bolívia": "bo", "Bonaire": "bq", "Brasil": "br",
  "Bulgária": "bg", "Burkina Fasso": "bf", "Burundi": "bi", "Bélgica": "be", "Bósnia": "ba",
  "Cabo Verde": "cv", "Camarões": "cm", "Canadá": "ca", "Cazaquistão": "kz", "Chade": "td",
  "Chile": "cl", "Chipre": "cy", "Colômbia": "co", "Comores": "km", "Congo": "cd",
  "Coréia do Sul": "kr", "Costa Rica": "cr", "Costa do Marfim": "ci", "Croácia": "hr",
  "Cuba": "cu", "Curaçau": "cw", "Dinamarca": "dk", "Djibuti": "dj", "Egito": "eg",
  "El Salvador": "sv", "Equador": "ec", "Eritreia": "er", "Eslováquia": "sk",
  "Eslovénia": "si", "Espanha": "es", "Estados Unidos": "us", "Estónia": "ee",
  "Etiópia": "et", "Filipinas": "ph", "Finlândia": "fi", "França": "fr", "Gabão": "ga",
  "Gana": "gh", "Geórgia": "ge", "Granada": "gd", "Grécia": "gr", "Guadalupe": "gp",
  "Guatemala": "gt", "Guiana": "gy", "Guiana Francesa": "gf", "Guiné": "gn",
  "Guiné Equatorial": "gq", "Guiné-Bissau": "gw", "Gâmbia": "gm", "Haiti": "ht",
  "Honduras": "hn", "Hong Kong (RP China)": "hk", "Hungria": "hu", "Ilhas Faroé": "fo",
  "Ilhas Martinica": "mq", "Ilhas Reunião": "re", "Indonésia": "id", "Iraque": "iq",
  "Irlanda do Norte": "gb", "Irã": "ir", "Islândia": "is", "Israel": "il", "Itália": "it",
  "Jamaica": "jm", "Japão": "jp", "Jordânia": "jo", "Kosovo": "xk", "Letónia": "lv",
  "Libéria": "lr", "Lituânia": "lt", "Luxemburgo": "lu", "Líbano": "lb", "Líbia": "ly",
  "Macedónia do Norte": "mk", "Maiote": "yt", "Mali": "ml", "Malta": "mt", "Marrocos": "ma",
  "Mauritânia": "mr", "Maurícia": "mu", "Moldávia": "md", "Monserrate": "ms",
  "Montenegro": "me", "Moçambique": "mz", "México": "mx", "Mónaco": "mc", "Namíbia": "na",
  "Nigéria": "ng", "Noruega": "no", "Nova Caledónia": "nc", "Nova Zelândia": "nz",
  "Níger": "ne", "Palestina": "ps", "Panamá": "pa", "Paquistão": "pk", "Paraguai": "py",
  "Países Baixos": "nl", "Perú": "pe", "Polônia": "pl", "Porto Rico": "pr", "Portugal": "pt",
  "Quênia": "ke", "Rep. Centro-Africana": "cf", "Rep. do Congo": "cg",
  "República Dominicana": "do", "República Tcheca": "cz", "República da Irlanda": "ie",
  "Romênia": "ro", "Rússia": "ru", "S. Tomé e Príncipe": "st", "S. Vincente": "vc",
  "Samoa Ocidental": "ws", "Senegal": "sn", "Serra Leoa": "sl", "Somália": "so",
  "St Lucia": "lc", "Sudão": "sd", "Sudão do Sul": "ss", "Suriname": "sr", "Suécia": "se",
  "Suíça": "ch", "São Cristovão & Nevis": "kn", "Sérvia": "rs", "Síria": "sy",
  "Tanzânia": "tz", "Timor-Leste": "tl", "Togo": "tg", "Trinidad e Tobago": "tt",
  "Tunísia": "tn", "Turquia": "tr", "Ucrânia": "ua", "Uganda": "ug", "Uruguai": "uy",
  "Uzbequistão": "uz", "Venezuela": "ve", "Vietnã": "vn", "Zimbabué": "zw", "Zâmbia": "zm",
  "África do Sul": "za", "Áustria": "at", "Índia": "in",
};

// Inglaterra/Escócia/País de Gales — sem código ISO próprio, flag-icons tem
// códigos de subdivisão do Reino Unido pra isso.
const SPECIAL_FLAGS: Record<string, string> = {
  "Inglaterra": "gb-eng",
  "Escócia": "gb-sct",
  "País de Gales": "gb-wls",
};

// Nacionalidade dupla vem como "Brasil / Itália" (Genie Scout) — usa a
// primeira pro código da bandeira, o texto completo continua sendo exibido
// à parte por quem chama.
export function nationalityFlagCode(nationality: string | null | undefined): string | null {
  if (!nationality) return null;
  const primary = nationality.split("/")[0].trim();
  return SPECIAL_FLAGS[primary] ?? NAME_TO_ISO[primary] ?? null;
}
