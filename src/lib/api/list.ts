import { z, type ZodType } from "zod";

/** Every list endpoint answers with this envelope: `total` is the count
 *  before `limit` was applied, so a page header can report it without a
 *  second request. */
export const listOf = <T>(item: ZodType<T>) =>
  z.object({ data: z.array(item), total: z.number().int() });

/** Drops undefined values before building a query string, so an omitted
 *  filter is absent from the request rather than sent as the string
 *  "undefined". */
export function toQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
