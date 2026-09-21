import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { AuditLogEntry } from "@/types";
import { apiFetch } from "./client";
import { listOf, toQueryString } from "./list";

const auditLogEntrySchema = z.object({
  id: z.string(),
  workspace_id: z.uuid(),
  actor: z.string(),
  action: z.string(),
  target: z.string(),
  ip: z.string().nullable(),
  occurred_at: z.string(),
}) satisfies z.ZodType<AuditLogEntry>;

const auditLogListSchema = listOf(auditLogEntrySchema);

export type AuditLogQuery = {
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
};

export const getAuditLog = cache(async (query: AuditLogQuery = {}) =>
  apiFetch(`/audit${toQueryString(query)}`, { schema: auditLogListSchema }));
