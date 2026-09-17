// Testa que da pra conectar no local-db-server.mjs usando um client Postgres
// de verdade (pg / node-postgres) por TCP, exatamente como o PostgREST vai
// fazer. Se isso funcionar, confirma que o socket fala o protocolo Postgres
// direito e o PostgREST vai conseguir se conectar tambem.
import pg from "pg";

const port = Number(process.argv[2] ?? "54329");

const client = new pg.Client({
  host: "127.0.0.1",
  port,
  user: "postgres",
  database: "postgres",
});

await client.connect();
console.log("[test] conectado via protocolo Postgres real, OK");

const tables = await client.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
);
console.log(`[test] ${tables.rows.length} tabelas: ${tables.rows.map((r) => r.table_name).join(", ")}`);

const saves = await client.query(`SELECT count(*)::int AS n FROM public.saves`);
console.log(`[test] saves existentes: ${saves.rows[0].n}`);

await client.end();
console.log("[test] OK, conexao encerrada limpa.");
