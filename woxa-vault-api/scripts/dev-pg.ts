// Fallback embedded Postgres for developers without Docker installed.
// Starts a local Postgres 18 instance on port 5433 so the same DATABASE_URL
// works whether you ran `docker compose up` or `npm run dev:pg`.
//
// Process lifecycle: keep running until SIGINT/SIGTERM, then stop cleanly so
// the postgres process doesn't leak.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const DATA_DIR = resolve(process.cwd(), ".pgdata");
const PORT = Number(process.env.PGPORT ?? 5433);
const USER = process.env.PGUSER ?? "woxa";
const PASSWORD = process.env.PGPASSWORD ?? "woxa_local_dev";
const DB = process.env.PGDATABASE ?? "woxa_vault";

mkdirSync(DATA_DIR, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
});

async function main() {
  try {
    await pg.initialise();
  } catch (err) {
    // Already initialised — ignore.
    const msg = (err as Error).message;
    if (!/initdb|already exists/i.test(msg)) throw err;
  }

  await pg.start();

  try {
    await pg.createDatabase(DB);
  } catch (err) {
    const msg = (err as Error).message;
    if (!/already exists/i.test(msg)) throw err;
  }

  // eslint-disable-next-line no-console
  console.log(`\n[dev-pg] Postgres ready on port ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[dev-pg] DATABASE_URL=postgres://${USER}:${PASSWORD}@localhost:${PORT}/${DB}\n`);
  // eslint-disable-next-line no-console
  console.log("[dev-pg] Press Ctrl+C to stop.\n");

  const stop = async () => {
    // eslint-disable-next-line no-console
    console.log("\n[dev-pg] stopping…");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[dev-pg] failed:", err);
  process.exit(1);
});
