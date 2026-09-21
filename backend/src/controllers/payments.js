import { z } from "zod";

import * as payments from "../models/payments.js";
import * as invoicesService from "../services/invoices.js";
import { listQuery, parse } from "./query.js";

const listPaymentsQuery = listQuery.extend({
  sort: z.enum(["received_at", "amount_cents"]).default("received_at"),
});

const recordPaymentBody = z.object({
  invoice_id: z.uuid(),
  amount_cents: z.number().int().positive(),
  method: z.enum(["bank_transfer", "card", "ach", "check", "stripe", "paypal"]),
  reference: z.string().max(120).optional(),
  received_at: z.string(),
});

export function paymentsController(sql) {
  return {
    async list(request, response) {
      const query = parse(listPaymentsQuery, request.query);
      response.json(await payments.listPayments(sql, request.principal.workspaceId, query));
    },

    async create(request, response) {
      const body = parse(recordPaymentBody, request.body);
      const result = await invoicesService.recordPayment(
        sql,
        request.principal.workspaceId,
        request.principal,
        body,
      );
      response.status(201).json(result);
    },
  };
}
