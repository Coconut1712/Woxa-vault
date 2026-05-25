import { zValidator } from "@hono/zod-validator";
import type { ZodSchema } from "zod";

// Wrap zValidator so failures return the standard error envelope
// `{ error: { code: 'validation_error', message, details: { fieldErrors } } }`
// instead of leaking raw ZodError JSON. Use everywhere a route validates JSON
// body / query / params.
export function jsonValidator<T extends ZodSchema>(schema: T) {
  return zValidator("json", schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: "validation_error",
            message: "Validation failed",
            details: { fieldErrors: result.error.flatten().fieldErrors },
          },
        },
        400,
      );
    }
  });
}

export function queryValidator<T extends ZodSchema>(schema: T) {
  return zValidator("query", schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: "validation_error",
            message: "Validation failed",
            details: { fieldErrors: result.error.flatten().fieldErrors },
          },
        },
        400,
      );
    }
  });
}

export function paramValidator<T extends ZodSchema>(schema: T) {
  return zValidator("param", schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: "validation_error",
            message: "Invalid path parameter",
            details: { fieldErrors: result.error.flatten().fieldErrors },
          },
        },
        400,
      );
    }
  });
}
