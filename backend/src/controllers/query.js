/**
 * Request validation shared by every controller.
 *
 * `parse` moved here from controllers/auth.js, which had the only copy.
 * `listQuery` is the paging half of every list endpoint's query string; a
 * domain extends it with its own filters and a `sort` enum, which doubles as
 * the injection whitelist orderPage relies on.
 */
import { z } from "zod";

import { ValidationFailed } from "../middleware/errors.js";

/**
 * One fixed detail rather than a field-by-field error list. src/lib/api/
 * reads a string `detail` and falls back to the status text, so the list was
 * never reaching a screen.
 */
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationFailed();
  return result.data;
}

// z.coerce because every value in a query string arrives as a string.
export const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.enum(["asc", "desc"]).default("desc"),
});
