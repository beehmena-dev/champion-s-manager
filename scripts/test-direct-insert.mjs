// Testa um INSERT direto via pg (node-postgres) contra o local-db-server,
// sem passar pelo PostgREST, pra isolar se o problema de escrita é do
// PGlite-socket em si ou é algo específico de como o PostgREST monta a
// transação/protocolo estendido.
import pg from "pg";

const port = Number(process.argv[2] ?? "54329");
const client = new pg.Client({ host: "127.0.0.1", port, user: "postgres", database: "postgres" });

await client.connect();
console.log("[test] conectado");

console.log("[test] tentando INSERT simples (query protocol simples)...");
const r1 = await client.query(`INSERT INTO public.saves (name) VALUES ('Direto simples') RETURNING id, name`);
console.log("[test] OK simples:", r1.rows);

console.log("[test] tentando INSERT parametrizado (protocolo estendido, como o PostgREST faz)...");
const r2 = await client.query(
  `INSERT INTO public.saves (name) VALUES ($1) RETURNING id, name`,
  ["Direto parametrizado"],
);
console.log("[test] OK parametrizado:", r2.rows);

console.log("[test] tentando dentro de uma transacao explicita (BEGIN/COMMIT), como o PostgREST faz...");
await client.query("BEGIN");
const r3 = await client.query(
  `INSERT INTO public.saves (name) VALUES ($1) RETURNING id, name`,
  ["Direto em transacao"],
);
await client.query("COMMIT");
console.log("[test] OK em transacao:", r3.rows);

await client.end();
console.log("[test] tudo certo, conexao encerrada limpa.");
