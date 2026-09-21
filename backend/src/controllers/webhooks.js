import { z } from "zod";

import * as webhooks from "../models/webhooks.js";
import { sendTestEvent } from "../services/webhooks.js";
import { parse } from "./query.js";

const EVENT_TYPES = ["payment.received", "invoice.sent", "reminder.sent"];

const createEndpointBody = z.object({
  url: z.url().max(500),
  events: z.array(z.enum(EVENT_TYPES)).min(1),
});

export function webhooksController(sql) {
  return {
    async list(request, response) {
      response.json({ data: await webhooks.listEndpoints(sql, request.principal.workspaceId) });
    },

    async create(request, response) {
      const body = parse(createEndpointBody, request.body);
      const endpoint = await webhooks.createEndpoint(sql, request.principal.workspaceId, body);
      response.status(201).json(endpoint);
    },

    async remove(request, response) {
      await webhooks.deleteEndpoint(sql, request.principal.workspaceId, request.params.endpointId);
      response.status(204).end();
    },

    async sendTest(request, response) {
      const endpoint = await webhooks.findEndpointForDelivery(
        sql,
        request.principal.workspaceId,
        request.params.endpointId,
      );
      const result = await sendTestEvent(sql, endpoint);
      response.json({ delivered: result.ok, response_status: result.status });
    },
  };
}
