import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";

const app = createApp();

const server = serve(
  { fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" },
  (info) => {
    logger.info(
      { port: info.port, env: env.NODE_ENV, cors: env.CORS_ORIGINS },
      "woxa-vault-api ready",
    );
  },
);

const shutdown = (signal: string) => {
  logger.info({ signal }, "shutting down");
  server.close((err) => {
    if (err) {
      logger.error({ err }, "shutdown failed");
      process.exit(1);
    }
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
