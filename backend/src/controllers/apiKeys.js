import { z } from "zod";

import * as apiKeys from "../models/apiKeys.js";
import { parse } from "./query.js";

const createApiKeyBody = z.object({
  name: z.string().min(1).max(200),
  scopes: z.array(z.enum(["read", "write"])).min(1),
});

export function apiKeysController(sql) {
  return {
    async list(request, response) {
      response.json({ data: await apiKeys.listApiKeys(sql, request.principal.workspaceId) });
    },

    async create(request, response) {
      const body = parse(createApiKeyBody, request.body);
      const key = await apiKeys.createApiKey(sql, request.principal.workspaceId, body);
      response.status(201).json(key);
    },

    async revoke(request, response) {
      await apiKeys.revokeApiKey(sql, request.principal.workspaceId, request.params.keyId);
      response.status(204).end();
    },
  };
}
