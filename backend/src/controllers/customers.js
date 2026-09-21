import { z } from "zod";

import * as collections from "../models/collections.js";
import * as customers from "../models/customers.js";
import { notImplemented } from "./not-implemented.js";
import { listQuery, parse } from "./query.js";

const listCustomersQuery = listQuery.extend({
  sort: z
    .enum(["name", "outstanding_cents", "avg_days_to_pay", "on_time_rate"])
    .default("name"),
  risk: z.enum(["low", "medium", "high"]).optional(),
  search: z.string().max(120).optional(),
});

export function customersController(sql) {
  return {
    async list(request, response) {
      const query = parse(listCustomersQuery, request.query);
      response.json(await customers.listCustomers(sql, request.principal.workspaceId, query));
    },

    async get(request, response) {
      response.json(
        await customers.findCustomer(sql, request.principal.workspaceId, request.params.customerId),
      );
    },

    async behaviour(request, response) {
      response.json({
        data: await customers.getCustomerBehaviour(
          sql,
          request.principal.workspaceId,
          request.params.customerId,
        ),
      });
    },

    async events(request, response) {
      const workspaceId = request.principal.workspaceId;
      const { customerId } = request.params;
      await customers.assertCustomerExists(sql, workspaceId, customerId);
      response.json({ data: await collections.listCustomerEvents(sql, workspaceId, customerId) });
    },

    create: notImplemented,
    update: notImplemented,
  };
}
