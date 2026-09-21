import { z } from "zod";

import * as payments from "../models/payments.js";
import { notImplemented } from "./not-implemented.js";
import { listQuery, parse } from "./query.js";

const listPaymentsQuery = listQuery.extend({
  sort: z.enum(["received_at", "amount_cents"]).default("received_at"),
});

export function paymentsController(sql) {
  return {
    async list(request, response) {
      const query = parse(listPaymentsQuery, request.query);
      response.json(await payments.listPayments(sql, request.principal.workspaceId, query));
    },

    create: notImplemented,
  };
}
