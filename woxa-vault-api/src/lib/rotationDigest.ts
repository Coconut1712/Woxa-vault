import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, orgMembers, users, vaults, items } from "@/db/schema";
import { readOrgPolicy } from "@/lib/orgPolicy";
import { computeRotationStatus, type RotationStatus } from "@/lib/rotation";
import { sendRotationDigestEmail, type RotationDigestItem } from "@/lib/mailer/resend";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Weekly rotation digest (US-060 / AC-060.4).
//
// For each live org, computes the set of `due`/`overdue` secrets under the
// effective policy (item override ?? org default) and emails a summary to the
// org's owner + admins (the people who own the compliance posture). The mail
// carries NO secret material (see sendRotationDigestEmail); for v2 ZK items the
// server holds no plaintext name, so they are listed as "(encrypted item)".
//
// SCOPING / SECURITY:
//   * Org-scoped queries only (no client input) — no cross-tenant leakage.
//   * Recipients are limited to owner/admin org roles, who can already see every
//     item name in their own dashboard, so the digest reveals nothing new.
//   * Best-effort per org/recipient: one failure never aborts the whole run.
//
// NOT YET WIRED TO A SCHEDULER. This function is the unit of work; a weekly
// trigger (BullMQ repeatable job or an external cron hitting an admin endpoint)
// is a follow-up — see the TODO at the bottom. `startExpirationSweeper`
// (lib/expirationSweeper.ts) is the in-process-interval pattern to mirror if we
// choose that route, but a weekly cadence is better served by BullMQ/cron than
// a 60s setInterval. Until wired, call `runRotationDigest()` manually / from a
// test / from an ops script.
// ---------------------------------------------------------------------------

// Cap how many items we enumerate in a single digest email so a huge backlog
// can't produce a multi-megabyte message. Counts in the summary line still
// reflect the TRUE totals; the table is the worst-offenders sample.
const MAX_ITEMS_PER_EMAIL = 50;

const DUE_STATUSES: RotationStatus[] = ["due", "overdue"];

export interface RotationDigestRunResult {
  orgsScanned: number;
  emailsSent: number;
  emailsFailed: number;
}

export async function runRotationDigest(now: Date = new Date()): Promise<RotationDigestRunResult> {
  const result: RotationDigestRunResult = { orgsScanned: 0, emailsSent: 0, emailsFailed: 0 };

  const orgs = await db
    .select({ id: organizations.id, name: organizations.name, settings: organizations.settings })
    .from(organizations)
    .where(isNull(organizations.deletedAt));

  for (const org of orgs) {
    result.orgsScanned++;
    try {
      const sent = await digestForOrg(org.id, org.name, org.settings, now);
      if (sent === "sent") result.emailsSent++;
      else if (sent === "failed") result.emailsFailed++;
      // "skipped" (nothing due) does not count either way.
    } catch (err) {
      logger.error({ err, orgId: org.id }, "rotation digest failed for org");
    }
  }

  logger.info(result, "rotation digest run complete");
  return result;
}

async function digestForOrg(
  orgId: string,
  orgName: string,
  settings: unknown,
  now: Date,
): Promise<"sent" | "failed" | "skipped"> {
  const orgDefault = readOrgPolicy(settings).rotationDefaultDays;
  const hasOrgDefault = orgDefault !== null && orgDefault > 0;

  // Candidate items: passworded, in live vaults, with SOME applicable policy.
  // When no org default, only items with their own positive policy qualify.
  const rows = await db
    .select({ item: items, vaultName: vaults.name })
    .from(items)
    .innerJoin(vaults, eq(vaults.id, items.vaultId))
    .where(
      and(
        eq(vaults.orgId, orgId),
        isNull(items.deletedAt),
        isNull(vaults.deletedAt),
        isNotNull(items.passwordChangedAt),
      ),
    );

  const digestItems: RotationDigestItem[] = [];
  let overdueCount = 0;
  let dueCount = 0;
  for (const r of rows) {
    // Skip items with neither an own policy nor an org default.
    const hasOwn = typeof r.item.rotationPolicyDays === "number" && r.item.rotationPolicyDays > 0;
    if (!hasOwn && !hasOrgDefault) continue;
    const rot = computeRotationStatus(r.item.passwordChangedAt, r.item.rotationPolicyDays, orgDefault, now);
    if (!DUE_STATUSES.includes(rot.status)) continue;
    if (rot.status === "overdue") overdueCount++;
    else dueCount++;
    if (digestItems.length < MAX_ITEMS_PER_EMAIL) {
      digestItems.push({
        // v2 ZK items hold name="" — never decrypt; show a neutral placeholder.
        name: r.item.name && r.item.name.length > 0 ? r.item.name : "(encrypted item)",
        vaultName: r.vaultName,
        status: rot.status as "due" | "overdue",
        dueAt: new Date(rot.dueAt!),
      });
    }
  }

  if (overdueCount + dueCount === 0) return "skipped";

  // Recipients: owner + admins of the org (the compliance owners).
  const recipients = await db
    .select({ email: users.email })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(
      and(
        eq(orgMembers.orgId, orgId),
        inArray(orgMembers.role, ["owner", "admin"]),
        isNull(users.deletedAt),
      ),
    );
  if (recipients.length === 0) return "skipped";

  // Sort overdue-first then soonest due for the worst-offenders table.
  digestItems.sort((a, b) => {
    if (a.status !== b.status) return a.status === "overdue" ? -1 : 1;
    return a.dueAt.getTime() - b.dueAt.getTime();
  });

  const dashboardUrl = `${env.WEB_BASE_URL}/app`;
  let anySent = false;
  let anyFailed = false;
  for (const rcpt of recipients) {
    const res = await sendRotationDigestEmail({
      to: rcpt.email,
      orgName,
      overdueCount,
      dueCount,
      items: digestItems,
      dashboardUrl,
    });
    if (res.sent) anySent = true;
    else anyFailed = true;
  }
  return anySent ? "sent" : anyFailed ? "failed" : "skipped";
}

// TODO(wave-3+, AC-060.4): wire `runRotationDigest` to a WEEKLY trigger. Options:
//   (a) BullMQ repeatable job (preferred — survives multi-instance, dedupes via
//       jobId, runs off the request path). Add to the existing queue wiring.
//   (b) external cron → authenticated admin endpoint POST /admin/rotation-digest.
// Do NOT use a 60s setInterval (the sweeper pattern) — the cadence is weekly and
// must run exactly once per week cluster-wide, which setInterval can't guarantee
// across instances.
