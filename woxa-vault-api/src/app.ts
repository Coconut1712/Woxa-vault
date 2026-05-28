import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { ApiError, errors } from "@/lib/errors";
import { sessionMiddleware, type AuthVariables } from "@/middleware/auth";
import { originCheck } from "@/middleware/originCheck";
import { attachmentRoutes, itemAttachmentRoutes } from "@/routes/attachments";
import { auditRoutes } from "@/routes/audit";
import { authRoutes } from "@/routes/auth";
import { folderMemberRoutes } from "@/routes/folderMembers";
import { folderRoutes, vaultFolderRoutes } from "@/routes/folders";
import { itemMemberRoutes } from "@/routes/itemMembers";
import { healthRoutes } from "@/routes/health";
import { importRoutes } from "@/routes/imports";
import { invitationRoutes } from "@/routes/invitations";
import { itemActivityRoutes } from "@/routes/itemActivity";
import { itemRoutes, vaultItemRoutes } from "@/routes/items";
import { meRoutes } from "@/routes/me";
import { memberRoutes } from "@/routes/members";
import { teamRoutes } from "@/routes/teams";
import { notificationRoutes } from "@/routes/notifications";
import { accessRequestRoutes } from "@/routes/accessRequests";
import { publicSendRoutes, sendRoutes } from "@/routes/sends";
import { ssoRoutes } from "@/routes/sso";
import { trashRoutes } from "@/routes/trash";
import { twoFactorRoutes } from "@/routes/twoFactor";
import { vaultMemberRoutes } from "@/routes/vaultMembers";
import { vaultRoutes } from "@/routes/vaults";
import { workspaceRoutes } from "@/routes/workspace";

export function createApp() {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", honoLogger((msg) => logger.debug(msg)));
  // WARN-3: tighten secure-headers defaults.
  //   * `Strict-Transport-Security` upgraded to a 2-year max-age with
  //     `preload` so the API hostname is eligible for the HSTS preload list
  //     once the WAF terminates TLS. `includeSubDomains` covers api.iux24.com
  //     siblings such as future status/admin subdomains.
  //   * `Permissions-Policy` denies camera/microphone/geolocation/payment for
  //     the API origin. The API never legitimately uses these; explicit
  //     denial reduces blast radius if an injected page is ever served from
  //     this origin (a defense-in-depth measure — CSP is the primary control).
  app.use(
    "*",
    secureHeaders({
      strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
      },
    }),
  );
  app.use(
    "*",
    cors({
      origin: (origin) => (env.CORS_ORIGINS.includes(origin) ? origin : null),
      credentials: true,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }),
  );
  // WARN-4: Origin-header CSRF defense. Runs BEFORE session resolution so a
  // forged cross-origin request never even touches the cookie-bearing
  // handler. Public preview routes (GET /invite/:token, GET /s/:token) are
  // read-only and unaffected.
  app.use("*", originCheck);
  app.use("*", sessionMiddleware);

  app.route("/health", healthRoutes);
  app.route("/imports", importRoutes);
  app.route("/auth", authRoutes);
  app.route("/auth/sso", ssoRoutes);
  // 2FA endpoints live under /auth/2fa. /verify-login is intentionally public
  // (consumes the mfaToken); the enroll/disable/regenerate handlers each
  // attach `requireAuth` inside the router.
  app.route("/auth/2fa", twoFactorRoutes);
  app.route("/me", meRoutes);
  app.route("/workspace", workspaceRoutes);
  app.route("/members", memberRoutes);
  app.route("/teams", teamRoutes);
  app.route("/access-requests", accessRequestRoutes);
  // Vault sub-routers (items, folders, members) all attach to /vaults/:id/...
  // and MUST mount before the generic vaultRoutes so the parameterized child
  // paths take priority over `/:id` handlers on the same prefix.
  app.route("/vaults", vaultItemRoutes);
  app.route("/vaults", vaultFolderRoutes);
  app.route("/vaults", vaultMemberRoutes);
  app.route("/vaults", vaultRoutes);
  // Attachment + member sub-routers live under /items so list+upload+share
  // share the path prefix with item discovery. They MUST mount BEFORE
  // `itemRoutes` so the child paths `/:id/attachments` and `/:id/members`
  // aren't intercepted by the generic `/:id` handlers.
  app.route("/items", itemAttachmentRoutes);
  app.route("/items", itemMemberRoutes);
  // Per-item activity widget (/items/:id/activity). MUST mount before the
  // generic itemRoutes so the `/:id/activity` child path isn't intercepted by
  // the `/:id` reveal handler.
  app.route("/items", itemActivityRoutes);
  app.route("/items", itemRoutes);
  app.route("/attachments", attachmentRoutes);
  // Trash (soft-delete recycle bin). Admin+ only; the router self-gates on the
  // active-org role inside every handler.
  app.route("/trash", trashRoutes);
  // Folder member sub-router (/folders/:id/members) MUST mount before the
  // generic folderRoutes (/folders/:id) for the same child-before-generic
  // reason.
  app.route("/folders", folderMemberRoutes);
  app.route("/folders", folderRoutes);
  app.route("/audit", auditRoutes);
  // In-app notifications inbox (the caller's own event-driven notifications).
  // Internal route ordering (unread-count / read-all before /:id/read) lives in
  // the router itself.
  app.route("/notifications", notificationRoutes);
  app.route("/sends", sendRoutes);
  // Public reveal flow lives at /s/:token; no `requireAuth` middleware on
  // this subtree (publicSendRoutes intentionally omits requireAuth).
  app.route("/s", publicSendRoutes);
  // Invite acceptance — GET /invite/:token is public preview, POST .../accept
  // requires auth. The router applies auth selectively per-handler.
  app.route("/invite", invitationRoutes);

  app.notFound((c) =>
    c.json({ error: { code: "not_found", message: "Route not found" } }, 404),
  );

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(err.toBody(), err.status);
    }
    if (err instanceof ZodError) {
      const apiErr = errors.validation("Validation failed", err.flatten().fieldErrors);
      return c.json(apiErr.toBody(), apiErr.status);
    }
    logger.error({ err }, "unhandled error");
    return c.json(errors.internal().toBody(), 500);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
