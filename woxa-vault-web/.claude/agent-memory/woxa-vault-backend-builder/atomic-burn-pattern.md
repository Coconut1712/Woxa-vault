---
name: atomic-burn-pattern
description: How one-time sends increment views and burn atomically without read-modify-write races
metadata:
  type: project
---

`POST /s/:token/reveal` uses a single Drizzle UPDATE with guards in the WHERE clause:

```ts
const burnNow = sql`CASE WHEN ${oneTimeSends.viewCount} + 1 >= ${oneTimeSends.maxViews} THEN now() ELSE NULL END`;
await db.update(oneTimeSends)
  .set({ viewCount: sql`${oneTimeSends.viewCount} + 1`, burnedAt: burnNow })
  .where(and(
    eq(oneTimeSends.tokenHash, tokenHash),
    isNull(oneTimeSends.burnedAt),
    sql`${oneTimeSends.viewCount} < ${oneTimeSends.maxViews}`,
    sql`${oneTimeSends.expiresAt} > now()`,
  ))
  .returning();
```

**Why:** two reveal requests hitting the row at the same time would otherwise read the same `view_count`, both pass an in-memory check, and both return the secret. The combined increment + burn predicate in one statement lets Postgres serialize the conflict — the loser gets zero rows back and the route returns 410 `send_burned`.

**How to apply:** any "view N times then expire" feature (e.g. invite tokens, one-shot links) should follow the same pattern. Do NOT do a SELECT then UPDATE — even inside a transaction the read can be stale relative to a concurrent writer unless you use SERIALIZABLE isolation, which is heavier than needed here.

File: `src/routes/sends.ts:reveal handler`.
