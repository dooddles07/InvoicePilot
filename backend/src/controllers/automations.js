import { z } from "zod";

import * as automationsModel from "../models/automations.js";
import { createAutomation as createAutomationService } from "../services/automations.js";
import { parse } from "./query.js";

// The node graph is the visual builder's own opaque state -- see the schema
// comment on automations.nodes. Not validated field by field: whatever
// shape the frontend already writes (id/type/title/detail/branches) is
// exactly what round-trips back to it.
const nodeSchema = z.record(z.string(), z.unknown());

const createAutomationBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  trigger_label: z.string().min(1).max(200),
  trigger_days: z.number().int().min(0).max(365),
  tone: z.enum(["friendly", "firm", "final"]).optional(),
  nodes: z.array(nodeSchema).optional(),
});

const updateAutomationBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    enabled: z.boolean().optional(),
    nodes: z.array(nodeSchema).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field is required");

export function automationsController(sql) {
  return {
    async list(request, response) {
      response.json({
        data: await automationsModel.listAutomations(sql, request.principal.workspaceId),
      });
    },

    async create(request, response) {
      const body = parse(createAutomationBody, request.body);
      const automation = await createAutomationService(sql, request.principal.workspaceId, body);
      response.status(201).json(automation);
    },

    async get(request, response) {
      response.json(
        await automationsModel.findAutomation(sql, request.principal.workspaceId, request.params.automationId),
      );
    },

    async update(request, response) {
      const body = parse(updateAutomationBody, request.body);
      const fields = {};
      if (body.name !== undefined) fields.name = body.name;
      if (body.description !== undefined) fields.description = body.description;
      if (body.enabled !== undefined) fields.enabled = body.enabled;
      if (body.nodes !== undefined) fields.nodes = body.nodes;

      response.json(
        await automationsModel.updateAutomation(
          sql,
          request.principal.workspaceId,
          request.params.automationId,
          fields,
        ),
      );
    },

    async runs(request, response) {
      response.json({
        data: await automationsModel.listRuns(sql, request.principal.workspaceId, request.params.automationId),
      });
    },
  };
}
