/**
 * The multi-tenancy guarantee every model in this directory depends on.
 *
 * Express spec section 5 promised a shared scoping layer; a composable query
 * builder never materialized because postgres.js tagged templates do not
 * compose that way. This is the guarantee instead: the one clause that must
 * never be missing, written once so that a grep for it over this directory is
 * the audit.
 */
import { NotFound } from "../middleware/errors.js";

/**
 * `alias` is required wherever two scoped relations are joined: an
 * unqualified workspace_id is ambiguous there, which is an error, and a
 * qualified one on only one side is a leak.
 */
export function inWorkspace(sql, workspaceId, alias = null) {
  return alias === null
    ? sql`WHERE workspace_id = ${workspaceId}`
    : sql`WHERE ${sql(alias)}.workspace_id = ${workspaceId}`;
}

/**
 * A scoped lookup returning nothing cannot tell "no such id" from "that id
 * belongs to another tenant", and must not try: a 403 on the second case would
 * confirm the record exists, turning a list of guessed ids into a census of
 * another tenant's data. Both are 404.
 */
export function firstOr404(rows, label) {
  if (rows.length === 0) throw new NotFound(`${label} not found`);
  return rows[0];
}

/**
 * ORDER BY / LIMIT / OFFSET for a list query.
 *
 * `sort` must come from a per-domain z.enum, so the column is already a closed
 * set before it reaches here; sql() escapes the identifier anyway, because the
 * cost is nothing and the failure mode of skipping it is the whole table.
 * `id` breaks ties -- without it, two rows sharing a sort value can appear on
 * two pages or on neither as the underlying data changes between requests.
 */
export function orderPage(sql, { sort, order, limit, offset }) {
  return sql`
    ORDER BY ${sql(sort)} ${order === "asc" ? sql`ASC` : sql`DESC`}, id
    LIMIT ${limit} OFFSET ${offset}
  `;
}
