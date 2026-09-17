// -----------------------------------------------------------------------------
// Converte a dupla de CSVs exportada do FM Genie Scout (CLUBES.csv +
// JOGADORES.csv) num seed.json no formato que src/lib/seed-import.ts consome.
// Escopo configurável por lista de ligas (Division ID) + piso de reputação —
// ver LEAGUES em scripts/fm-lib.mjs.
//
// O CSV NÃO traz os atributos individuais do FM (só o rollup de habilidade
// por posição — nível que a EULA permite). O seed carrega esse rollup como
// role_scores por jogador; os 47 atributos são derivados dele + overall no
// import (deriveAttributesFromRoles em src/game/attributes.ts).
//
// Uso:
//   node scripts/fm-csv-to-seed.mjs "<pasta com os CSVs>" [saida.json]
//
// Formato "upload manual" legado — a base "padrão" que o jogo carrega sem
// upload (tela de setup) vem de scripts/fm-csv-to-football-db.mjs, que usa a
// mesma extração (buildClubsAndPlayers, em fm-lib.mjs) só que grava em pastas
// por país/entidade em vez de um JSON único.
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import { LEAGUES, buildClubsAndPlayers } from "./fm-lib.mjs";

const SRC_DIR = process.argv[2];
const OUT = process.argv[3] || path.join(process.cwd(), "seed-fm24.json");
if (!SRC_DIR) {
  console.error('Uso: node scripts/fm-csv-to-seed.mjs "<pasta com CLUBES.csv e JOGADORES.csv>" [saida.json]');
  process.exit(1);
}

const { finalClubs, usedComps, playableComps, attached } = buildClubsAndPlayers(SRC_DIR);

// Remove os campos internos (id/_divId/_playable — o id só importa pra quem
// separa clubes/jogadores em arquivos diferentes; aqui os jogadores já vêm
// aninhados dentro do clube, não precisa de referência por id) antes de
// serializar.
for (const c of finalClubs) { delete c.id; delete c._divId; delete c._playable; }
const seed = {
  competitions: [...usedComps],
  competitionNames: Object.fromEntries([...usedComps].map((code) => [code, LEAGUES[code.slice(1)].name])),
  playableCompetitions: playableComps,
  // tier + país por competição — pirâmide de acesso/rebaixamento.
  competitionMeta: Object.fromEntries([...usedComps].map((code) => {
    const l = LEAGUES[code.slice(1)];
    return [code, { tier: l.tier ?? 1, country: l.country ?? null }];
  })),
  clubs: finalClubs,
};
fs.writeFileSync(OUT, JSON.stringify(seed));

const total = finalClubs.reduce((a, c) => a + c.players.length, 0);
const bg = finalClubs.filter((c) => !playableComps.includes(c.competition));
const posCount = {};
for (const c of finalClubs) for (const p of c.players) posCount[p.natural_position] = (posCount[p.natural_position] ?? 0) + 1;
console.log(`OK -> ${OUT}`);
console.log(`  ${usedComps.size} competições (${playableComps.length} jogáveis, ${usedComps.size - playableComps.length} segundo plano)`);
console.log(`  ${finalClubs.length} clubes (${bg.length} em segundo plano), ${total} jogadores, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`);
console.log(`  jogadores anexados: ${attached}`);
console.log(`  posições:`, JSON.stringify(posCount));
