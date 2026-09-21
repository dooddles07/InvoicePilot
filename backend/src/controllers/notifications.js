import * as notifications from "../models/notifications.js";
import { notImplemented } from "./not-implemented.js";

export function notificationsController(sql) {
  return {
    async templates(request, response) {
      response.json({
        data: await notifications.listEmailTemplates(sql, request.principal.workspaceId),
      });
    },

    list: notImplemented,
    markRead: notImplemented,
    preferences: notImplemented,
    replacePreferences: notImplemented,
  };
}
