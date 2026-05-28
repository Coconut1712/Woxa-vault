import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  importItems,
  importJobs,
  items,
  users,
  type ImportJob,
} from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { jsonValidator, paramValidator } from "@/lib/validator";
import {
  requireAuth,
  requireTwoFactorEnrolled,
  activeOrgForContext,
  type AuthVariables,
} from "@/middleware/auth";
import { generateWrappedDek, encryptField, zeroize } from "@/lib/itemCrypto";

const jobIdParam = z.object({ id: z.string().uuid() });

const startSchema = z.object({
  source: z.enum(["1password", "bitwarden", "lastpass", "generic_csv"]),
  // For Phase A, we might just accept the raw data in the body if it's small,
  // or handle multipart for real files.
});

const confirmSchema = z.object({
  targetVaultId: z.string().uuid(),
  targetFolderId: z.string().uuid().nullable().optional(),
  conflictPolicy: z.enum(["skip", "overwrite", "append"]).default("skip"),
});

export const importRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)

  // GET /imports - List recent jobs
  .get("/", async (c) => {
    const user = c.get("user")!;
    const jobs = await db.query.importJobs.findMany({
      where: eq(importJobs.userId, user.id),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit: 10,
    });
    return c.json({ jobs });
  })

  // GET /imports/:id - Job status
  .get("/:id", paramValidator(jobIdParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const job = await db.query.importJobs.findFirst({
      where: and(eq(importJobs.id, id), eq(importJobs.userId, user.id)),
    });
    if (!job) throw errors.notFound("Import job not found");
    return c.json({ job });
  })

  // GET /imports/:id/items - Preview items
  .get("/:id/items", paramValidator(jobIdParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const job = await db.query.importJobs.findFirst({
      where: and(eq(importJobs.id, id), eq(importJobs.userId, user.id)),
    });
    if (!job) throw errors.notFound("Import job not found");

    const items = await db.query.importItems.findMany({
      where: eq(importItems.jobId, id),
      limit: 100, // Limit preview
    });
    return c.json({ items });
  })

  // POST /imports - Start a new import job (Upload & Parse)
  .post("/", async (c) => {
    const user = c.get("user")!;
    const body = await c.req.parseBody();
    const source = body.source as string;
    const file = body.file as File;

    if (!file || !source) {
      throw errors.validation("Missing file or source");
    }

    const currentOrg = await activeOrgForContext(c);
    if (!currentOrg) throw errors.notFound("Workspace not found");

    // 1. Create Job
    const [job] = await db.insert(importJobs).values({
      orgId: currentOrg.orgId,
      userId: user.id,
      source,
      status: "pending",
    }).returning();

    if (!job) throw errors.internal("Failed to create import job");

    // 2. Parse (In-process for Phase A, should be worker for B)
    // For now, let's implement a very basic CSV parser if it's CSV.
    try {
      const content = await file.text();
      let parsedItems: any[] = [];

      if (source === "generic_csv" || source === "lastpass") {
        parsedItems = parseCSV(content, source);
      } else if (source === "bitwarden") {
        const data = JSON.parse(content);
        if (data.items && Array.isArray(data.items)) {
          parsedItems = data.items.map((it: any) => ({
            type: it.type === 1 ? "login" : "note",
            name: it.name || "Untitled",
            username: it.login?.username || null,
            password: it.login?.password || null,
            url: it.login?.uris?.[0]?.uri || null,
            notes: it.notes || null,
          }));
        }
      } else {
        throw errors.validation("Source not yet supported in Phase A");
      }

      // 3. Store for review
      if (parsedItems.length > 0) {
        await db.insert(importItems).values(
          parsedItems.map(it => ({
            jobId: job.id,
            data: it,
          }))
        );
      }

      await db.update(importJobs).set({
        status: "pending", // Waiting for confirmation
        stats: { total: parsedItems.length, created: 0, skipped: 0, failed: 0 },
      }).where(eq(importJobs.id, job.id));

      return c.json({ job }, 201);
    } catch (err: any) {
      await db.update(importJobs).set({
        status: "failed",
        errorLog: [{ message: err.message, timestamp: new Date().toISOString() }],
      }).where(eq(importJobs.id, job.id));
      throw err;
    }
  })

  // POST /imports/:id/confirm - Execute the import
  .post("/:id/confirm", paramValidator(jobIdParam), jsonValidator(confirmSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const { targetVaultId, targetFolderId, conflictPolicy } = c.req.valid("json");

    const job = await db.query.importJobs.findFirst({
      where: and(eq(importJobs.id, id), eq(importJobs.userId, user.id)),
    });
    if (!job) throw errors.notFound("Import job not found");
    if (job.status !== "pending") throw errors.validation("Job is not in pending state");

    // Update job status
    await db.update(importJobs).set({
      status: "processing",
      config: { targetVaultId, targetFolderId, conflictPolicy },
    }).where(eq(importJobs.id, id));

    // Execute (In-process for Phase A)
    // We'll run this as an async task without awaiting it to return quickly?
    // Actually Hono doesn't have easy "fire and forget" that survives request end 
    // without a worker, but for dev it works if the process stays alive.
    
    // We'll do it in chunks to avoid blocking too long.
    processImport(id, user.id, targetVaultId, targetFolderId ?? null).catch(err => {
      console.error("Import execution failed", err);
    });

    return c.json({ ok: true, message: "Import started" });
  });

// Improved CSV parser for Phase A
function parseCSV(text: string, source: string): any[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2 || !lines[0]) return [];

  const parseLine = (line: string) => {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Hande escaped quotes ""
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase());
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const values = parseLine(line);
    const entry: any = {};
    headers.forEach((h, idx) => {
      entry[h] = values[idx] || "";
    });

    if (source === "lastpass") {
      results.push({
        type: "login",
        name: entry.name || entry.url || "Untitled",
        username: entry.username || null,
        password: entry.password || null,
        url: entry.url || null,
        notes: entry.extra || entry.note || null,
      });
    } else {
      // Generic
      results.push({
        type: "login",
        name: entry.name || entry.title || "Untitled",
        username: entry.username || entry.login || null,
        password: entry.password || entry.pass || null,
        url: entry.url || entry.link || null,
        notes: entry.notes || entry.comment || null,
      });
    }
  }
  return results;
}

async function processImport(jobId: string, userId: string, vaultId: string, folderId: string | null) {
  const job = await db.query.importJobs.findFirst({ where: eq(importJobs.id, jobId) });
  if (!job) return;

  const importItemsList = await db.query.importItems.findMany({
    where: eq(importItems.jobId, jobId),
  });

  let created = 0;
  let failed = 0;
  const errorLog: any[] = [];

  for (const importItem of importItemsList) {
    try {
      const data = importItem.data as any;
      const { dek, wrapped } = generateWrappedDek();
      
      try {
        let pwCipher: Buffer | null = null;
        let pwIv: Buffer | null = null;
        let notesCipher: Buffer | null = null;
        let notesIv: Buffer | null = null;

        if (data.password) {
          const e = encryptField(dek, data.password);
          pwCipher = e.ciphertext;
          pwIv = e.iv;
        }
        if (data.notes) {
          const e = encryptField(dek, data.notes);
          notesCipher = e.ciphertext;
          notesIv = e.iv;
        }

        await db.insert(items).values({
          vaultId,
          folderId,
          type: data.type || "login",
          name: data.name,
          username: data.username,
          url: data.url,
          passwordCiphertext: pwCipher,
          passwordIv: pwIv,
          notesCiphertext: notesCipher,
          notesIv: notesIv,
          dekCiphertext: wrapped.dekCiphertext,
          dekIv: wrapped.dekIv,
          createdBy: userId,
        });
        
        await db.update(importItems).set({ status: "imported" }).where(eq(importItems.id, importItem.id));
        created++;
      } finally {
        zeroize(dek);
      }
    } catch (err: any) {
      failed++;
      errorLog.push({ itemId: importItem.id, message: err.message });
      await db.update(importItems).set({ status: "failed", error: err.message }).where(eq(importItems.id, importItem.id));
    }

    // Update stats every 10 items or so?
    if ((created + failed) % 10 === 0) {
      await db.update(importJobs).set({
        stats: { total: importItemsList.length, created, skipped: 0, failed },
      }).where(eq(importJobs.id, jobId));
    }
  }

  await db.update(importJobs).set({
    status: "completed",
    stats: { total: importItemsList.length, created, skipped: 0, failed },
    errorLog,
    updatedAt: new Date(),
  }).where(eq(importJobs.id, jobId));

  // Audit log
  const actor = await db.query.users.findFirst({ where: eq(users.id, userId) });

  await db.insert(auditEvents).values({
    orgId: job.orgId,
    actorUserId: userId,
    actorEmail: actor?.email ?? "",
    action: "import.complete",
    targetType: "organization",
    targetId: job.orgId,
    success: true,
    metadata: { jobId, source: job.source, created, failed },
  });
}
