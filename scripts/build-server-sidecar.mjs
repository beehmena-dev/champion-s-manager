// Empacota o local-db-server.mjs num unico arquivo, pra rodar via node.exe
// portatil dentro do app Tauri, sem precisar de node_modules na maquina do
// usuario final. Desde a troca do motor de PGlite pra Postgres nativo
// (14/09/2026), local-db-server.mjs só usa módulos built-in do Node (fs,
// child_process, net) — sem dependência npm nenhuma pra empacotar, mas
// mantém o esbuild mesmo assim (barato, já funcionava, protege se algum dia
// voltar a ter import externo).
//
// IMPORTANTE: isto SEMPRE precisa rodar antes de empacotar de verdade
// (chamado automaticamente por build-desktop.mjs) — sem isso, o app
// empacotado roda com a pasta migrations/ desatualizada (achado ao testar o
// build real em 15/09/2026: só 37 das 45 migrations reais estavam
// empacotadas, causando "permission denied for function owns_save" — a
// migration 20260914110000_fix_owns_save_grant.sql, e outras mais novas,
// nunca tinham sido copiadas pro bundle).
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src-tauri", "binaries", "server");
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(root, "scripts", "local-db-server.mjs")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: join(outDir, "local-db-server.mjs"),
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  // fs.readdirSync/readFileSync em supabase/migrations continuam apontando
  // pro caminho relativo ao projeto (--data-dir/migrations ficam fora do
  // bundle) — isso e resolvido copiando a pasta de migrations tambem.
});

const migrationsSrc = join(root, "supabase", "migrations");
const migrationsOut = join(outDir, "migrations");
// Limpa antes de copiar — sem isso, um arquivo renomeado/apagado do lado
// real ficaria "fantasma" no bundle indefinidamente.
rmSync(migrationsOut, { recursive: true, force: true });
mkdirSync(migrationsOut, { recursive: true });
let copied = 0;
for (const file of readdirSync(migrationsSrc)) {
  if (!file.endsWith(".sql")) continue;
  copyFileSync(join(migrationsSrc, file), join(migrationsOut, file));
  copied++;
}
console.log(`[build-server-sidecar] ${copied} migrations copiadas pra ${migrationsOut}`);

console.log(`[build-server-sidecar] bundle pronto em ${outDir}`);
