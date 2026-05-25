import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./client";
import { logger } from "@/lib/logger";

async function main() {
  logger.info("running migrations…");

  // Make sure pgcrypto exists before drizzle migrations execute (Docker init
  // script handles this in compose, but local installs may not).
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

  await migrate(db, { migrationsFolder: "./drizzle" });
  logger.info("migrations complete");
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  logger.error({ err }, "migration failed");
  process.exit(1);
});
