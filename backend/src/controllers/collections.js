import { z } from "zod";

import * as collections from "../models/collections.js";
import { aiNoteFor } from "../services/collections.js";
import { notImplemented } from "./not-implemented.js";
import { parse } from "./query.js";

const queueQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

export function collectionsController(sql) {
  return {
    async pipeline(request, response) {
      response.json({
        data: await collections.listPipeline(sql, request.principal.workspaceId),
      });
    },

    async queue(request, response) {
      const { limit } = parse(queueQuery, request.query);
      const rows = await collections.listQueue(sql, request.principal.workspaceId, limit);
      response.json({
        data: rows.map((row) => ({
          invoice_id: row.invoice_id,
          invoice_number: row.number,
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          balance_cents: row.balance_cents,
          days_overdue: row.days_overdue,
          risk: row.risk,
          recommended_action: row.next_action ?? "Send payment reminder",
          ai_note: aiNoteFor(row),
        })),
      });
    },

    reminders: notImplemented,
  };
}
