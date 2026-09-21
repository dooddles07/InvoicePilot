import { z } from "zod";

import * as audit from "../models/audit.js";
import { listQuery, parse } from "./query.js";

const listAuditQuery = listQuery.extend({
  sort: z.enum(["occurred_at"]).default("occurred_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export function auditController(sql) {
  return {
    async list(request, response) {
      const query = parse(listAuditQuery, request.query);
      response.json(await audit.listAuditLogs(sql, request.principal.workspaceId, query));
    },
  };
}
