import { z } from "zod";

import * as collections from "../models/collections.js";
import * as invoices from "../models/invoices.js";
import * as invoicesService from "../services/invoices.js";
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

const invoiceItemBody = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().int().positive(),
  unit_price_cents: z.number().int().positive(),
});

const createInvoiceBody = z.object({
  customer_id: z.uuid(),
  issue_date: z.string(),
  due_date: z.string(),
  po_number: z.string().max(80).optional(),
  notes: z.string().optional(),
  items: z.array(invoiceItemBody).min(1),
});

const updateInvoiceBody = z
  .object({
    status: z.enum(["sent", "disputed"]).optional(),
    po_number: z.string().max(80).nullable().optional(),
    notes: z.string().nullable().optional(),
    due_date: z.string().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field is required");

const sendInvoiceBody = z.object({
  tone: z.enum(["friendly", "firm", "final"]).default("friendly"),
  idempotency_key: z.string().min(1).max(64),
  subject: z.string().min(1).max(300).optional(),
  body: z.string().min(1).max(20_000).optional(),
});

export function invoicesController(sql, config) {
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

    async create(request, response) {
      const body = parse(createInvoiceBody, request.body);
      const invoice = await invoicesService.createInvoice(
        sql,
        request.principal.workspaceId,
        request.principal,
        body,
      );
      response.status(201).json(invoice);
    },

    async update(request, response) {
      const body = parse(updateInvoiceBody, request.body);
      response.json(
        await invoicesService.updateInvoice(
          sql,
          request.principal.workspaceId,
          request.principal,
          request.params.invoiceId,
          body,
        ),
      );
    },

    async send(request, response) {
      const body = parse(sendInvoiceBody, request.body);
      const { invoice } = await invoicesService.sendInvoiceEmail(
        sql,
        config,
        request.principal.workspaceId,
        request.principal,
        request.params.invoiceId,
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
