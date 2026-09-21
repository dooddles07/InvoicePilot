import { z } from "zod";

import * as collections from "../models/collections.js";
import { aiInsightFor, aiNoteFor } from "../services/collections.js";
import { sendInvoiceEmail } from "../services/invoices.js";
import { parse } from "./query.js";

const queueQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

const insightsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(3),
});

const sendReminderBody = z.object({
  invoice_id: z.uuid(),
  tone: z.enum(["friendly", "firm", "final"]).default("friendly"),
  idempotency_key: z.string().min(1).max(64),
  subject: z.string().min(1).max(300).optional(),
  body: z.string().min(1).max(20_000).optional(),
});

export function collectionsController(sql, config) {
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

    async insights(request, response) {
      const workspaceId = request.principal.workspaceId;
      const { limit } = parse(insightsQuery, request.query);
      const [rows, overdueTotalCents] = await Promise.all([
        collections.listQueue(sql, workspaceId, limit),
        collections.getOverdueTotal(sql, workspaceId),
      ]);
      response.json({
        data: rows.map((row, i) => aiInsightFor(row, i + 1, overdueTotalCents, workspaceId)),
      });
    },

    async summary(request, response) {
      response.json(await collections.getInsightsSummary(sql, request.principal.workspaceId));
    },

    async reminders(request, response) {
      const body = parse(sendReminderBody, request.body);
      const { invoice } = await sendInvoiceEmail(
        sql,
        config,
        request.principal.workspaceId,
        request.principal,
        body.invoice_id,
        {
          tone: body.tone,
          idempotencyKey: body.idempotency_key,
          subjectOverride: body.subject,
          bodyOverride: body.body,
        },
      );
      response.json(invoice);
    },
  };
}
