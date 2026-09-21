import { z } from "zod";

import { answerFor } from "../services/ai.js";
import { notImplemented } from "./not-implemented.js";
import { parse } from "./query.js";

const askBody = z.object({ question: z.string().min(1).max(500) });

export function aiController(sql) {
  return {
    async ask(request, response) {
      const { question } = parse(askBody, request.body);
      response.json(await answerFor(sql, request.principal.workspaceId, question));
    },

    analyze: notImplemented,
    draftReminder: notImplemented,
  };
}
