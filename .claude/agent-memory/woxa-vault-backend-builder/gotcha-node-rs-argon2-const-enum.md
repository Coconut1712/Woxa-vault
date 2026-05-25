---
name: gotcha-node-rs-argon2-const-enum
description: "@node-rs/argon2 Algorithm is an ambient const enum — isolatedModules forbids member access; use numeric value + satisfies"
metadata:
  type: project
---

`@node-rs/argon2` exports `Algorithm` as an **ambient const enum**. tsconfig has `isolatedModules: true`, so writing `algorithm: Algorithm.Argon2id` fails typecheck with `TS2748: Cannot access ambient const enums when 'isolatedModules' is enabled`.

**How to apply:** import the type only and use the numeric literal with `satisfies`:
```ts
import { hash, verify, type Algorithm } from "@node-rs/argon2";
// Algorithm.Argon2id === 2
const ARGON_OPTS = { memoryCost: 64*1024, timeCost: 3, parallelism: 4, algorithm: 2 satisfies Algorithm } as const;
```
Values: Argon2d=0, Argon2i=1, Argon2id=2. Used in `src/lib/password.ts` and `src/lib/mfa.ts`. Same trap would hit any other const-enum export from this lib (e.g. `Version`). Related: [[round10-2fa-replay-audit]].
