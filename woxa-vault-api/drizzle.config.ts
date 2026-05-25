import "dotenv/config";
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://woxa:woxa_local_dev@localhost:5433/woxa_vault",
  },
  casing: "snake_case",
  strict: true,
  verbose: true,
} satisfies Config;
