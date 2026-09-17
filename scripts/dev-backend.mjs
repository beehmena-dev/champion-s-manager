// Sobe o banco local (PGlite + socket) e o PostgREST juntos, pra usar
// durante `npm run dev` (navegador) — o app 100% desktop não usa mais
// nenhum backend na nuvem, então o dev precisa do mesmo par de processos
// que o Tauri sobe sozinho quando o app empacotado abre.
//
// Uso: node scripts/dev-backend.mjs
// Deixa rodando num terminal separado enquanto usa `npm run dev` normal.
// Ctrl+C mata os dois. Ver project_desktop_windows_offline.md na memória.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { platform } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DB_PORT = "54329";
const API_PORT = "3111";

const postgrestBin =
  platform() === "win32"
    ? join(root, "src-tauri", "binaries", "postgrest-x86_64-pc-windows-msvc.exe")
    : join(root, "src-tauri", "binaries", "postgrest");

const children = [];

function spawnChild(name, command, args, opts = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    ...opts,
  });
  child.on("exit", (code) => {
    console.log(`[dev-backend] ${name} saiu (codigo ${code})`);
  });
  children.push(child);
  return child;
}

console.log("[dev-backend] subindo banco local (node local-db-server.mjs)...");
spawnChild("local-db", "node", [
  join(root, "scripts", "local-db-server.mjs"),
  "--port",
  DB_PORT,
]);

// Da um tempo pro socket do banco subir antes do postgrest tentar conectar.
await new Promise((r) => setTimeout(r, 2000));

console.log("[dev-backend] subindo postgrest...");
spawnChild("postgrest", postgrestBin, [], {
  env: {
    ...process.env,
    PGRST_DB_URI: `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`,
    PGRST_DB_SCHEMAS: "public",
    PGRST_DB_ANON_ROLE: "authenticated",
    PGRST_DB_PREPARED_STATEMENTS: "false",
    PGRST_SERVER_HOST: "127.0.0.1",
    PGRST_SERVER_PORT: API_PORT,
  },
});

console.log(`[dev-backend] pronto. API em http://127.0.0.1:${API_PORT} — deixa esse terminal aberto.`);

function shutdown() {
  console.log("\n[dev-backend] encerrando...");
  for (const child of children) child.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
