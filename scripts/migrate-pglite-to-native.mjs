// Migração ÚNICA de dado real: PGlite (motor antigo, WASM) -> Postgres
// nativo (motor novo — ver scripts/local-db-server.mjs e
// project_desktop_windows_offline.md pro histórico completo da troca).
//
// Os arquivos em disco do PGlite NÃO são binário-compatíveis com um
// Postgres nativo (testado: "database cluster was initialized without
// USE_FLOAT8_BYVAL but the server was compiled with USE_FLOAT8_BYVAL") —
// então isso não é um simples "copia a pasta", é uma migração lógica de
// verdade: pg_dump do PGlite ao vivo (protocolo de rede é idêntico, só o
// arquivo em disco que não é) -> pg_restore num cluster nativo criado do
// zero (initdb + migrations, via local-db-server.mjs).
//
// NUNCA apaga o data-dir do PGlite original — só lê dele (pg_dump é
// read-only). Se algo der errado, o original continua intacto.
//
// Uso:
//   node scripts/migrate-pglite-to-native.mjs --from-port <porta do PGlite ao vivo> --to-data-dir <pasta nova>
// Pré-requisito: o backend PGlite ANTIGO já precisa estar rodando na porta
// indicada (ex. já com `node scripts/local-db-server.mjs --data-dir
// .local-db-data-fresh --port 54329` de pé) — ESTE script não sobe ele.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "node:net";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

const fromPort = Number(argValue("--from-port", "54329"));
const toDataDir = resolve(argValue("--to-data-dir", join(root, ".local-db-data-native")));
const toPort = Number(argValue("--to-port", "54330")); // porta temporária só durante a migração

const pgBinDir = join(root, "src-tauri", "binaries", "pgsql", "bin");
const exe = (name) => join(pgBinDir, `${name}.exe`);

const TABLES_TO_CHECK = ["saves", "clubs", "players", "matches", "competitions"];

function countRows(host, port, table) {
  // search_path do PGlite vem vazio por padrão (o PostgREST sempre define
  // explicitamente via PGRST_DB_SCHEMAS, então isso nunca importou antes) —
  // precisa qualificar com public. pra não dar "relation does not exist".
  const out = execFileSync(exe("psql"), [
    "-h", host, "-p", String(port), "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
    `SELECT count(*) FROM public.${table}`,
  ]).toString().trim();
  return Number(out);
}

async function waitReady(port, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const sock = connect({ host: "127.0.0.1", port }, () => { sock.end(); resolve(true); });
      sock.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`porta ${port} nao respondeu em ${timeoutMs}ms`);
}

async function main() {
  console.log(`[migrate] checando backend PGlite antigo em 127.0.0.1:${fromPort}...`);
  await waitReady(fromPort, 5000).catch(() => {
    throw new Error(`Backend antigo nao esta respondendo em ${fromPort} — suba ele primeiro (node scripts/local-db-server.mjs original, ou o app rodando).`);
  });

  if (existsSync(toDataDir)) {
    throw new Error(`${toDataDir} já existe — apague antes se quiser refazer a migração, ou use --to-data-dir outro caminho.`);
  }

  console.log("[migrate] 1/4 dump do PGlite ao vivo (só dado, sem schema/grants)...");
  const tmp = mkdtempSync(join(tmpdir(), "pg-migrate-"));
  const dumpPath = join(tmp, "backup.dump");
  execFileSync(exe("pg_dump"), [
    "-h", "127.0.0.1", "-p", String(fromPort), "-U", "postgres", "-d", "postgres",
    "--schema=public", "--data-only", "--disable-triggers", "-Fc", "-f", dumpPath,
  ], { stdio: "inherit" });
  console.log(`[migrate] dump ok: ${dumpPath}`);

  console.log("[migrate] 2/4 subindo cluster nativo novo (initdb + migrations)...");
  const newServer = spawn("node", [join(scriptDir, "local-db-server.mjs"), "--data-dir", toDataDir, "--port", String(toPort)], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve, reject) => {
    // Esperar a porta abrir NÃO basta — ensureSchema() (migrations) só roda
    // DEPOIS do postgres.exe já estar aceitando conexão, e leva um tempinho.
    // Tem que esperar a linha LOCAL_DB_READY de verdade (mesmo marcador que
    // o lado Rust usa), senão o pg_restore corre risco de chegar antes das
    // tabelas existirem (foi exatamente isso que aconteceu na 1ª tentativa).
    let buf = "";
    newServer.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      buf += chunk.toString();
      if (buf.includes("LOCAL_DB_READY")) resolve();
    });
    newServer.on("exit", (code) => { if (code !== 0) reject(new Error(`local-db-server saiu com codigo ${code}`)); });
    setTimeout(() => reject(new Error("timeout esperando LOCAL_DB_READY do cluster novo")), 60000);
  });
  console.log("[migrate] cluster novo pronto.");

  console.log("[migrate] 3/4 restaurando dump no cluster novo...");
  execFileSync(exe("pg_restore"), [
    "-h", "127.0.0.1", "-p", String(toPort), "-U", "postgres", "-d", "postgres",
    "--data-only", "--disable-triggers", dumpPath,
  ], { stdio: "inherit" });

  console.log("[migrate] 4/4 conferindo contagens (origem x destino)...");
  let allMatch = true;
  for (const table of TABLES_TO_CHECK) {
    const from = countRows("127.0.0.1", fromPort, table);
    const to = countRows("127.0.0.1", toPort, table);
    const ok = from === to;
    if (!ok) allMatch = false;
    console.log(`  ${ok ? "OK " : "!! "}${table}: origem=${from} destino=${to}`);
  }

  console.log("[migrate] encerrando cluster novo (fica pronto pra uso normal depois)...");
  execFileSync(exe("pg_ctl"), ["-D", toDataDir, "stop", "-m", "fast"], { stdio: "inherit" });
  rmSync(tmp, { recursive: true, force: true });

  if (!allMatch) {
    console.error("[migrate] ATENCAO: alguma contagem nao bateu — NAO troque o backend ainda. Dados originais em .local-db-data-fresh continuam intactos.");
    process.exit(1);
  }
  console.log(`[migrate] sucesso — dados migrados pra ${toDataDir}. Original NAO foi apagado, continua em disco intacto.`);
}

main().catch((err) => {
  console.error("[migrate] erro fatal:", err.message);
  process.exit(1);
});
