// Baixa o pacote oficial de binarios do PostgreSQL da EnterpriseDB e extrai
// pra src-tauri/binaries/: as DLLs soltas (pro postgrest.exe, que depende de
// libpq e das bibliotecas dela: libssl, libcrypto, libintl, icu, etc) E,
// desde 2026-09-14, o servidor nativo de verdade (postgres.exe/initdb.exe +
// pg_dump.exe/pg_restore.exe, usados só na migracao — ver
// scripts/migrate-pglite-to-native.mjs) com pgsql/lib e pgsql/share, que o
// postgres.exe exige como irmaos de pgsql/bin (testado: falha com erro de
// diretorio faltando sem eles).
//
// Isso existe pra nao depender de uma instalacao local do Postgres na
// maquina de quem builda o instalador — ver project_desktop_windows_offline.md.
//
// Idempotente: se libpq.dll E pgsql/bin/postgres.exe ja existem em
// src-tauri/binaries/, so sai sem baixar nada de novo (rodado
// automaticamente a cada build, ver build-desktop.mjs). Usar --force pra
// baixar de novo mesmo assim.
//
// Uso: node scripts/fetch-postgres-dlls.mjs [--force]
import { mkdtempSync, createWriteStream, readdirSync, copyFileSync, cpSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";

// Link oficial da pagina https://www.enterprisedb.com/download-postgresql-binaries
// (versao 18.6 no momento em que isso foi escrito — atualizar se quebrar).
const PG_BINARIES_URL = "https://sbp.enterprisedb.com/getfile.jsp?fileid=1260488";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(root, "src-tauri", "binaries");
const pgDestDir = join(destDir, "pgsql");
const force = process.argv.includes("--force");

if (!force && existsSync(join(destDir, "libpq.dll")) && existsSync(join(pgDestDir, "bin", "postgres.exe"))) {
  console.log("[fetch-postgres-dlls] ja existe em src-tauri/binaries/ (DLLs + pgsql/), pulando download (--force pra baixar de novo).");
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), "pg-binaries-"));
const zipPath = join(tmp, "pg-binaries.zip");

console.log(`[fetch-postgres-dlls] baixando ${PG_BINARIES_URL} ...`);
const res = await fetch(PG_BINARIES_URL);
if (!res.ok) {
  console.error(`[fetch-postgres-dlls] download falhou: HTTP ${res.status}`);
  process.exit(1);
}
await pipeline(res.body, createWriteStream(zipPath));
console.log(`[fetch-postgres-dlls] baixado em ${zipPath}`);

// unzip com filtro de glob por arquivo NÃO desce em subpastas (testado:
// "pgsql/share/*" não pega "pgsql/share/timezonesets/Africa.txt", e lib/
// share têm até 9 níveis de profundidade) — mais simples e robusto extrair
// o pacote inteiro pra um diretório temporário (apagado no fim) e só copiar
// dali o que interessa.
const extractDir = join(tmp, "extract");
execFileSync("unzip", ["-o", "-q", zipPath, "-d", extractDir]);

// DLLs soltas em src-tauri/binaries/ (postgrest.exe procura ao lado dele).
const binDir = join(extractDir, "pgsql", "bin");
const dlls = readdirSync(binDir).filter((f) => f.endsWith(".dll"));
for (const file of dlls) copyFileSync(join(binDir, file), join(destDir, file));
console.log(`[fetch-postgres-dlls] ${dlls.length} DLLs copiadas pra ${destDir}`);

// pgsql/{bin,lib,share} preservados juntos em src-tauri/binaries/pgsql/ — o
// postgres.exe acha lib/share pelo caminho relativo a partir de onde ele
// mesmo esta, entao NAO da pra achatar isso como as DLLs.
mkdirSync(pgDestDir, { recursive: true });
for (const sub of ["bin", "lib", "share"]) {
  cpSync(join(extractDir, "pgsql", sub), join(pgDestDir, sub), { recursive: true });
}
console.log(`[fetch-postgres-dlls] pgsql/{bin,lib,share} copiados pra ${pgDestDir}`);

rmSync(tmp, { recursive: true, force: true });
console.log("[fetch-postgres-dlls] pronto.");
