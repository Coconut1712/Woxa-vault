// Postgres error helpers for the `postgres-js` driver.
//
// The driver throws `PostgresError` objects that carry the SQLSTATE `code`
// (e.g. "23505" for unique_violation) and, for constraint errors, a
// `constraint_name`. We detect these structurally (duck-typing) rather than
// `instanceof PostgresError` so the check survives the error being re-thrown,
// wrapped by Drizzle, or serialized across a transaction boundary.

const PG_UNIQUE_VIOLATION = "23505";

interface PgErrorShape {
  code?: unknown;
  constraint_name?: unknown;
}

function asPgError(err: unknown): PgErrorShape | null {
  if (err && typeof err === "object" && "code" in err) {
    return err as PgErrorShape;
  }
  return null;
}

// True when `err` is a Postgres unique_violation (SQLSTATE 23505). When
// `constraint` is given, ALSO require the violated constraint/index to match —
// so a caller can tell "the index I care about fired" apart from some other
// unique constraint on the same table.
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const pg = asPgError(err);
  if (!pg || pg.code !== PG_UNIQUE_VIOLATION) return false;
  if (constraint && pg.constraint_name !== constraint) return false;
  return true;
}
