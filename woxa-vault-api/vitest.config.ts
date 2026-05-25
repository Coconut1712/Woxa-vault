import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Vitest config — mirrors the `@/*` alias from tsconfig.json so test files
// can import application modules with the same paths the runtime uses.
// Without this, `import "@/lib/foo"` fails to resolve when vitest transforms
// .test.ts files (it does not consult tsconfig's `paths` by default).
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Most unit tests don't talk to Postgres; keep the default vitest pool
    // (threads) — DB-bound tests would need their own setup file later.
  },
});
