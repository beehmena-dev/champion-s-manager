// Build estático do app (único build que existe agora — não tem mais versão
// web). Roda `vite build` e depois copia o shell pré-renderizado pra
// index.html, que é o nome que o Tauri espera encontrar em `frontendDist`.
// Ver project_desktop_windows_offline.md na memória do projeto.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Garante que as DLLs do Postgres (dependencia do postgrest.exe) estao em
// src-tauri/binaries/ antes do Tauri empacotar — idempotente, so baixa se
// ainda nao existirem. Ver fetch-postgres-dlls.mjs e project_desktop_windows_offline.md.
const dlls = spawnSync("node", ["scripts/fetch-postgres-dlls.mjs"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

if (dlls.status !== 0) {
  console.error("[build-desktop] falha ao garantir as DLLs do Postgres, abortando build.");
  process.exit(dlls.status ?? 1);
}

// Reempacota local-db-server.mjs + copia supabase/migrations/ pro bundle
// (src-tauri/binaries/server/) TODA VEZ — sem isso o app empacotado roda
// com migrations desatualizadas (achado real ao testar o build: só 37 de 45
// estavam lá, faltando até uma correção de permissão de RLS já commitada).
// Script tao rapido que nao vale a pena tentar pular quando "nada mudou".
const serverSidecar = spawnSync("node", ["scripts/build-server-sidecar.mjs"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

if (serverSidecar.status !== 0) {
  console.error("[build-desktop] falha ao empacotar o server sidecar (local-db-server.mjs + migrations), abortando build.");
  process.exit(serverSidecar.status ?? 1);
}

const result = spawnSync("npx", ["vite", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const shell = resolve(root, "dist/client/_shell.html");
const index = resolve(root, "dist/client/index.html");

if (!existsSync(shell)) {
  console.error(`[build-desktop] esperava ${shell}, mas nao existe. O nome do shell mudou?`);
  process.exit(1);
}

copyFileSync(shell, index);
console.log(`[build-desktop] copiado ${shell} -> ${index}`);
