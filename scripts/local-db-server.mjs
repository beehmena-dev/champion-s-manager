// Servidor de banco local (Fase 3 do app desktop, motor trocado em
// 2026-09-14). Sobe um Postgres NATIVO de verdade (não mais PGlite/WASM —
// ver project_desktop_windows_offline.md pra história completa da troca:
// PGlite vinha travando sob carga, e testado que os arquivos em disco do
// PGlite não são binário-compatíveis com um Postgres nativo, então a
// migração de dado existente é feita à parte por
// scripts/migrate-pglite-to-native.mjs, não por este arquivo).
//
// Mesmo contrato de sempre por fora — CLI, ordem de log, linha
// "LOCAL_DB_READY" — pra não precisar mexer em src-tauri/src/lib.rs nem em
// scripts/dev-backend.mjs, que já sobem isso via `node <este arquivo>
// --data-dir X --port Y` e esperam essa linha aparecer no stdout antes de
// subir o PostgREST.
//
// Uso: node scripts/local-db-server.mjs [--data-dir <caminho>] [--port <numero>]
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { connect } from "node:net";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

const dataDir = resolve(argValue("--data-dir", join(root, ".local-db-data")));
const port = Number(argValue("--port", "54329"));

// Empacotado: server/local-db-server.mjs (bundle.resources "binaries/server/"
// em tauri.conf.json), binários em ../pgsql/bin (bundle.resources
// "binaries/pgsql/" — irmão de server/, mesmo padrão da pasta migrations/
// já usada abaixo). Dev: src-tauri/binaries/pgsql/bin diretamente.
const packagedPgBin = join(scriptDir, "..", "pgsql", "bin");
const pgBinDir = existsSync(packagedPgBin) ? packagedPgBin : join(root, "src-tauri", "binaries", "pgsql", "bin");
const exe = (name) => join(pgBinDir, `${name}.exe`);

const AUTH_SHIM = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT '00000000-0000-0000-0000-000000000001'::uuid
$$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'local@taticafc.app')
ON CONFLICT (id) DO NOTHING;
`;

// Patch pos-migrations pra versao desktop sem login (decisao ja confirmada
// com o usuario, ver project_desktop_windows_offline.md): saves.user_id
// e NOT NULL + FK pra auth.users, mas aqui so existe um usuario local
// (o proprio fake criado no shim acima). Em vez de mudar os 41 arquivos
// que chamam supabase.from() pra sempre mandar user_id, damos um DEFAULT
// pra essa coluna que aponta pro usuario local unico. `profiles` nao
// precisa de patch: a trigger handle_new_user() do proprio shim ja criou
// a linha correspondente quando inserimos o usuario fake acima.
const DESKTOP_PATCH = `
ALTER TABLE public.saves ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
`;

function psqlExec(sql) {
  execFileSync(exe("psql"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "inherit" });
}
function psqlFile(path) {
  execFileSync(exe("psql"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", path], { stdio: "inherit" });
}

async function waitReady(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const sock = connect({ host: "127.0.0.1", port }, () => { sock.end(); resolve(true); });
      sock.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`postgres nao ficou pronto em ${timeoutMs}ms (porta ${port})`);
}

// O postmaster aceita a conexao TCP assim que comeca a escutar, mas apos um
// desligamento sujo (queda de energia, kill forcado, Windows Update
// reiniciando o PC) ele ainda esta fazendo o replay do WAL nesse momento e
// responde "FATAL: o sistema de banco de dados esta iniciando" pra qualquer
// query — waitReady() sozinho nao cobre isso (so testa a porta). Sem retry
// aqui, ensureSchema() falhava e o processo node morria antes do replay
// terminar, o que interrompia o proprio replay (kill do postgres filho) e so
// piorava a proxima tentativa (visto na pratica: 2 tentativas seguidas
// geraram "sistema de banco de dados foi interrompido enquanto estava sendo
// recuperado").
async function waitQueryable(timeoutMs = 60000) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    try {
      execFileSync(exe("psql"), [
        "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-t", "-A", "-c", "SELECT 1",
      ], { stdio: ["ignore", "ignore", "pipe"] });
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`postgres nao aceitou queries em ${timeoutMs}ms: ${lastErr?.message}`);
}

async function ensureSchema() {
  // -t -A: saida "tuples only, unaligned" -> só o valor cru ("t"/"f"), sem
  // cabeçalho nem formatação de tabela.
  const out = execFileSync(exe("psql"), [
    "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
    "SELECT to_regclass('public.saves') IS NOT NULL",
  ]).toString().trim();
  if (out === "t") {
    console.log("[local-db] schema ja existe, pulando migrations");
    return;
  }
  console.log("[local-db] primeira execucao: aplicando shim + migrations...");
  psqlExec(AUTH_SHIM);
  // Em dev, o script mora em scripts/ e as migrations ficam em ../supabase/migrations.
  // Empacotado (bundle rodando via node.exe sidecar), o script mora em
  // server/local-db-server.mjs e o build-server-sidecar.mjs copia as
  // migrations pra server/migrations/ (irma do bundle, mesma pasta).
  const packagedMigrations = join(scriptDir, "migrations");
  const migrationsDir = existsSync(packagedMigrations) ? packagedMigrations : join(root, "supabase", "migrations");
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) psqlFile(join(migrationsDir, file));
  console.log(`[local-db] ${files.length} migrations aplicadas`);
  console.log("[local-db] aplicando patch desktop (sem login: user_id ganha default)...");
  psqlExec(DESKTOP_PATCH);
}

let pgChild = null;

async function shutdown() {
  console.log("[local-db] encerrando...");
  try {
    execFileSync(exe("pg_ctl"), ["-D", dataDir, "stop", "-m", "fast"], { stdio: "inherit", timeout: 10000 });
  } catch (e) {
    console.warn("[local-db] pg_ctl stop falhou, forcando kill:", e.message);
    pgChild?.kill();
  }
  process.exit(0);
}

async function main() {
  console.log(`[local-db] abrindo banco em ${dataDir}`);
  if (!existsSync(join(dataDir, "PG_VERSION"))) {
    console.log("[local-db] data-dir novo, rodando initdb...");
    execFileSync(exe("initdb"), ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8"], { stdio: "inherit" });
  }

  pgChild = spawn(exe("postgres"), ["-D", dataDir, "-p", String(port), "-h", "127.0.0.1"], { stdio: "inherit" });
  pgChild.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[local-db] postgres.exe saiu com codigo ${code}`);
      process.exit(1);
    }
  });

  await waitReady();
  console.log(`[local-db] postgres nativo ouvindo em 127.0.0.1:${port}`);
  await waitQueryable();
  console.log("[local-db] postgres pronto pra queries (replay do WAL concluido, se havia)");

  await ensureSchema();

  // Marcador que o processo pai (Tauri / script de teste) usa pra saber
  // que ja pode conectar o PostgREST.
  console.log("LOCAL_DB_READY");
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("[local-db] erro fatal:", err);
  process.exit(1);
});
