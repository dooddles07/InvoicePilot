import { z } from "zod";

import * as collections from "../models/collections.js";
import * as invoices from "../models/invoices.js";
import { notImplemented } from "./not-implemented.js";
import { listQuery, parse } from "./query.js";

const listInvoicesQuery = listQuery.extend({
  sort: z
    .enum(["due_date", "issue_date", "balance_cents", "amount_cents", "number"])
    .default("due_date"),
  status: z.enum(["draft", "sent", "viewed", "partially_paid", "paid", "disputed"]).optional(),
  risk: z.enum(["low", "medium", "high"]).optional(),
  customer_id: z.uuid().optional(),
  overdue: z.stringbool().optional(),
  search: z.string().max(120).optional(),
});

export function invoicesController(sql) {
  return {
    async list(request, response) {
      const query = parse(listInvoicesQuery, request.query);
      response.json(await invoices.listInvoices(sql, request.principal.workspaceId, query));
    },

    async get(request, response) {
      response.json(
        await invoices.findInvoice(sql, request.principal.workspaceId, request.params.invoiceId),
      );
    },

    async events(request, response) {
      const workspaceId = request.principal.workspaceId;
      const { invoiceId } = request.params;
      await invoices.assertInvoiceExists(sql, workspaceId, invoiceId);
      response.json({ data: await collections.listInvoiceEvents(sql, workspaceId, invoiceId) });
    },

    create: notImplemented,
    update: notImplemented,
    send: notImplemented,
  };
}
