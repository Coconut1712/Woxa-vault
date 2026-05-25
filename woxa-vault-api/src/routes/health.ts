import { Hono } from "hono";
import { sql as pg } from "@/db/client";

export const healthRoutes = new Hono()
  .get("/", (c) => c.json({ ok: true, service: "woxa-vault-api", ts: new Date().toISOString() }))
  .get("/db", async (c) => {
    try {
      await pg`SELECT 1`;
      return c.json({ ok: true });
    } catch (err) {
      return c.json(
        { ok: false, error: { code: "db_unreachable", message: (err as Error).message } },
        503,
      );
    }
  });
