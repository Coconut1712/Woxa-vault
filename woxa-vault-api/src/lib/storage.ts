import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { env } from "@/config/env";

// ---------------------------------------------------------------------------
// Storage abstraction for attachment bodies (DESIGN.md §8.5).
//
// Phase A ships a local-filesystem driver. The interface is narrowed to the
// three operations the attachment route needs (put / get / delete) so a
// future R2 / S3 / MinIO adapter can drop in without route changes.
//
// Security notes:
//   * Callers MUST encrypt the buffer with the per-attachment DEK BEFORE
//     calling `put` — this layer is a dumb byte store and does not protect
//     content at rest by itself.
//   * `storageKey` is generated server-side as `<itemIdPrefix>/<uuid>.bin`
//     and validated against path traversal here as defense in depth.
//   * The local driver creates a sandbox root from STORAGE_LOCAL_DIR and
//     refuses any resolved path that escapes that root (`..`, absolute keys).
// ---------------------------------------------------------------------------

export interface StorageDriver {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

function assertSafeKey(key: string): void {
  // Reject empty, absolute, traversal, or backslash-laden keys upfront. We
  // build keys server-side so anything else is a bug or attack.
  if (!key || key.startsWith("/") || key.startsWith("\\")) {
    throw new Error("invalid storage key");
  }
  if (key.includes("..") || key.includes("\0")) {
    throw new Error("invalid storage key");
  }
  // Normalize and assert we did not pick up a parent traversal after
  // normalization (rare on POSIX, defensive on Windows-style sep).
  const normalized = normalize(key);
  if (normalized.startsWith("..") || normalized.includes(`${sep}..${sep}`)) {
    throw new Error("invalid storage key");
  }
}

function createLocalDriver(rootDir: string): StorageDriver {
  const root = resolve(rootDir);

  function pathFor(key: string): string {
    assertSafeKey(key);
    const full = resolve(root, key);
    // Final guard: the resolved path MUST stay inside the sandbox root.
    if (full !== root && !full.startsWith(root + sep)) {
      throw new Error("invalid storage key");
    }
    return full;
  }

  return {
    async put(key, body) {
      const full = pathFor(key);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, body, { mode: 0o600 });
    },
    async get(key) {
      const full = pathFor(key);
      return readFile(full);
    },
    async delete(key) {
      const full = pathFor(key);
      try {
        await unlink(full);
      } catch (err) {
        // Idempotent delete — missing file is fine.
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    },
  };
}

let cached: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (cached) return cached;
  if (env.STORAGE_DRIVER === "local") {
    cached = createLocalDriver(env.STORAGE_LOCAL_DIR);
    return cached;
  }
  // Exhaustiveness — the zod enum currently only allows "local". A future
  // driver lands here.
  throw new Error(`unsupported STORAGE_DRIVER: ${String(env.STORAGE_DRIVER)}`);
}

// Build a sharded key for an attachment. Sharding by the first two bytes of
// the attachment id keeps any one directory from ballooning to millions of
// entries. Keys are content-addressable in the sense that they only depend
// on the id, but they are NOT a hash of the body — the body is encrypted.
export function buildAttachmentKey(itemId: string, attachmentId: string): string {
  // Strip dashes so the shard always picks alphanumerics. UUID dashes are
  // never at index 0 or 1 (those are always hex digits) but normalizing keeps
  // the function future-proof for non-UUID id formats.
  const cleaned = attachmentId.replace(/-/g, "");
  const shard = cleaned.slice(0, 2);
  return join(itemId, shard, `${attachmentId}.bin`);
}
