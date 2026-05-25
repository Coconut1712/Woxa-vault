import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/config/env";
import * as schema from "./schema";

// Single pooled connection used by Hono request handlers, migrations, and seed.
// Use a small pool in development to keep `docker compose down` fast; tune for
// production (Phase B).
const pool = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === "production" ? 10 : 5,
  idle_timeout: 20,
  // Disable prepared statements in dev so drizzle-kit migrations run cleanly
  // against a session-pooler like Neon when we move there.
  prepare: false,
});

export const db = drizzle(pool, { schema, casing: "snake_case" });
export const sql = pool;
export type Database = typeof db;
