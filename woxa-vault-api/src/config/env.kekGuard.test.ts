import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// LOCAL_KEK_BASE64 production boot guard (env.ts). The guard runs at module
// load and calls process.exit(1) on a bad/missing KEK in production, so the
// cleanest way to assert it is to actually boot the env module in a subprocess
// with NODE_ENV=production and inspect the exit code. We never let a config
// mistake (no KEK, placeholder, wrong-length) survive to runtime where it would
// surface as a lazy 500 on the first envelope-encryption call (e.g. 2FA
// enroll).

const ENV_MODULE = resolve(__dirname, "env.ts");
const MFA_OK = "a".repeat(64); // valid hex-64
const RESEND_OK = "re_test_key"; // any non-empty value clears the prod RESEND guard

function bootProd(kek: string): { code: number | null; stderr: string } {
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "-e", `import(${JSON.stringify(ENV_MODULE)}).then(()=>process.exit(0)).catch(()=>process.exit(2))`],
    {
      cwd: resolve(__dirname, "../.."),
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: "postgres://x:y@localhost:5433/z",
        RESEND_API_KEY: RESEND_OK,
        MFA_TOKEN_SECRET: MFA_OK,
        LOCAL_KEK_BASE64: kek,
      },
      encoding: "utf8",
    },
  );
  return { code: r.status, stderr: r.stderr ?? "" };
}

describe("env.ts — LOCAL_KEK_BASE64 production boot guard", () => {
  it("refuses to boot in production when KEK is empty", () => {
    const { code, stderr } = bootProd("");
    expect(code).toBe(1);
    expect(stderr).toMatch(/LOCAL_KEK_BASE64 is required in production/);
  });

  it("refuses to boot in production when KEK is the placeholder", () => {
    const { code, stderr } = bootProd("REPLACE_ME_WITH_BASE64_32_BYTES");
    expect(code).toBe(1);
    expect(stderr).toMatch(/LOCAL_KEK_BASE64 must be set to a random value/);
  });

  it("refuses to boot in production when KEK does not decode to 32 bytes", () => {
    const sixteenBytes = Buffer.alloc(16).toString("base64");
    const { code, stderr } = bootProd(sixteenBytes);
    expect(code).toBe(1);
    expect(stderr).toMatch(/must decode to exactly 32 bytes/);
  });

  it("boots in production with a valid 32-byte KEK", () => {
    const validKek = Buffer.alloc(32).toString("base64");
    const { code } = bootProd(validKek);
    expect(code).toBe(0);
  });
});
