import { NotFound } from "../middleware/errors.js";
import * as workspaces from "../models/workspaces.js";
import { notImplemented } from "./not-implemented.js";

export function workspacesController(sql) {
  return {
    // :workspaceId is a path param, but the workspace a request can act in
    // comes from the token everywhere else in this app (H5) -- honouring the
    // URL's id here would let a caller read another tenant's team by editing
    // it. Mismatch is 404, the same "cross-tenant is 404, not 403" rule
    // switchWorkspace already tests.
    async members(request, response) {
      if (request.params.workspaceId !== request.principal.workspaceId) {
        throw new NotFound("Workspace not found");
      }
      response.json({ data: await workspaces.listMembers(sql, request.principal.workspaceId) });
    },

    list: notImplemented,
    create: notImplemented,
    get: notImplemented,
    update: notImplemented,
    invite: notImplemented,
  };
}
