// Sigla/monograma derivado do nome do clube, pro escudo procedural
// (src/components/club-crest.tsx) quando não tem crest_url real. Mesma ideia
// de normalização de sufixo genérico já usada em scripts/fetch-stadiums.mjs
// (pra casar nome de clube), só que aqui o objetivo é a sigla, não a chave
// de comparação.
const GENERIC_WORD = /^(fc|cf|sc|ac|afc|cd|ce|ec|ca|ud|sd|rc|club|clube|futebol|futbol|calcio|de|do|da|dos|das|e)$/i;

export function crestMonogram(clubName: string): string {
  const words = clubName
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[\s.-]+/)
    .filter((w) => w && !GENERIC_WORD.test(w));

  if (words.length === 0) return clubName.slice(0, 3).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
}
