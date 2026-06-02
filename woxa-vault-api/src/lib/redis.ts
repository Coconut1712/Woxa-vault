// ---------------------------------------------------------------------------
// Shared ioredis connection for cross-instance state (rate limiting, etc).
//
// Resilience contract (DESIGN.md §10 / NFR-012):
//   * REDIS_URL unset  → export `null`. Callers MUST treat null as "Redis not
//     configured" and fall back to their in-process implementation. This keeps
//     dev/test/CI green without a Redis dependency.
//   * REDIS_URL set but Redis is down/unreachable → we DO NOT crash the
//     process. ioredis is configured to keep retrying in the background while
//     individual commands fail fast (so a request never hangs waiting on a
//     dead Redis). Callers wrap every command in try/catch and fall back to
//     in-memory on error. A connection error is logged once, not per-command.
//
// We reuse a single connection for the whole process — never open a socket per
// request.
// ---------------------------------------------------------------------------
import Redis from "ioredis";

import { env } from "@/config/env";
import { logger } from "@/lib/logger";

function createClient(): Redis | null {
  if (!env.REDIS_URL) return null;

  const client = new Redis(env.REDIS_URL, {
    // Fail a command fast rather than queueing it forever when Redis is down;
    // the caller's catch then falls back to in-memory within the same request.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    // Keep trying to reconnect in the background with a capped backoff so the
    // process recovers automatically once Redis returns.
    retryStrategy: (times) => Math.min(times * 200, 5000),
    lazyConnect: false,
  });

  // Log connection errors at most once per "down" episode to avoid log spam
  // (ioredis emits 'error' on every reconnect attempt).
  let loggedError = false;
  client.on("error", (err) => {
    if (!loggedError) {
      loggedError = true;
      logger.warn({ err: err.message }, "redis connection error — rate limiting falls back to in-memory");
    }
  });
  client.on("ready", () => {
    if (loggedError) {
      loggedError = false;
      logger.info("redis connection restored");
    }
  });

  return client;
}

// Singleton — evaluated once at module load.
export const redis: Redis | null = createClient();
