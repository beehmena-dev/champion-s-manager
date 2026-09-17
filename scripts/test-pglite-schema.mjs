// Teste isolado (Fase 2 do plano desktop): confirma que as 38 migrations
// originais do supabase/migrations/ rodam sem alteração dentro do PGlite,
// desde que a gente simule antes as pecinhas do Supabase que elas esperam
// (schema auth, auth.uid(), roles authenticated/service_role).
//
// Isso e so um teste de schema, roda num diretorio descartavel — nada disso
// e usado pelo app ainda (isso e a Fase 3). Ver project_desktop_windows_offline.md.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const dataDir = join(root, ".pglite-schema-test");

rmSync(dataDir, { recursive: true, force: true });

const db = new PGlite(dataDir);

// Shim: simula o que o Supabase ja provisiona antes de qualquer migration
// de projeto rodar. Uma unica "conta" local representa o unico usuario
// do app desktop (sem login de verdade).
const SHIM = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT '00000000-0000-0000-0000-000000000001'::uuid
$$;
DO $$ BEGIN
  CREATE ROLE anon;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'local@taticafc.app')
ON CONFLICT (id) DO NOTHING;
`;

console.log("[shim] aplicando compatibilidade auth.* ...");
await db.exec(SHIM);
console.log("[shim] OK");

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log(`[migrations] ${files.length} arquivos encontrados`);

let ok = 0;
for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  try {
    await db.exec(sql);
    ok++;
  } catch (err) {
    console.error(`\n[FALHOU] ${file}`);
    console.error(err.message ?? err);
    process.exit(1);
  }
}
console.log(`[migrations] ${ok}/${files.length} aplicadas com sucesso`);

const tables = await db.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
);
console.log(`\n[schema] ${tables.rows.length} tabelas em public:`);
console.log(tables.rows.map((r) => r.table_name).join(", "));

const fn = await db.query(
  `SELECT proname FROM pg_proc WHERE proname = 'rollover_background_players'`
);
console.log(
  `\n[rpc] rollover_background_players ${fn.rows.length > 0 ? "existe, OK" : "NAO ENCONTRADA"}`
);

await db.close();
console.log("\n[ok] teste de schema concluido com sucesso.");
