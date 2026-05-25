import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, sql } from "./client";
import { organizations, orgMembers, users } from "./schema";
import { hashPassword } from "@/lib/password";
import { logger } from "@/lib/logger";

// Default seed credentials. Override via env to avoid committing real creds.
const SEED_EMAIL = process.env.SEED_EMAIL ?? "dev@iux24.com";
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "WoxaVault!Dev2026";
const SEED_DISPLAY_NAME = process.env.SEED_DISPLAY_NAME ?? "Woxa Vault (Dev)";
const SEED_ORG_NAME = process.env.SEED_ORG_NAME ?? "Woxa Corp";
const SEED_ORG_SLUG = process.env.SEED_ORG_SLUG ?? "woxa";

async function main() {
  logger.info({ email: SEED_EMAIL }, "seeding dev data…");

  // 1) Org
  let org = await db.query.organizations.findFirst({ where: eq(organizations.slug, SEED_ORG_SLUG) });
  if (!org) {
    const [created] = await db
      .insert(organizations)
      .values({ name: SEED_ORG_NAME, slug: SEED_ORG_SLUG })
      .returning();
    org = created;
    logger.info({ orgId: org!.id }, "created org");
  } else {
    logger.info({ orgId: org.id }, "org already exists");
  }

  // 2) User
  const existing = await db.query.users.findFirst({ where: eq(users.email, SEED_EMAIL) });
  const passwordHash = await hashPassword(SEED_PASSWORD);

  let userId: string;
  if (existing) {
    await db.update(users).set({ passwordHash, status: "active" }).where(eq(users.id, existing.id));
    userId = existing.id;
    logger.info({ userId }, "updated seed user password");
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email: SEED_EMAIL,
        displayName: SEED_DISPLAY_NAME,
        name: SEED_DISPLAY_NAME,
        passwordHash,
        status: "active",
        emailVerifiedAt: new Date(),
      })
      .returning();
    userId = created!.id;
    logger.info({ userId }, "created seed user");
  }

  // 3) Org membership
  const member = await db.query.orgMembers.findFirst({
    where: (m, { and, eq }) => and(eq(m.orgId, org!.id), eq(m.userId, userId)),
  });
  if (!member) {
    await db.insert(orgMembers).values({ orgId: org!.id, userId, role: "owner" });
    logger.info({ userId, orgId: org!.id }, "added owner membership");
  }

  // eslint-disable-next-line no-console
  console.log("\n=== Seed complete ===");
  // eslint-disable-next-line no-console
  console.log(`Email:    ${SEED_EMAIL}`);
  // eslint-disable-next-line no-console
  console.log(`Password: ${SEED_PASSWORD}`);
  // eslint-disable-next-line no-console
  console.log(`Org:      ${org!.name} (${org!.slug})`);
  // eslint-disable-next-line no-console
  console.log("=====================\n");

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  logger.error({ err }, "seed failed");
  process.exit(1);
});
