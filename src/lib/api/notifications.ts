import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { EmailTemplate } from "@/types";
import { apiFetch } from "./client";

const emailTemplateSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  name: z.string(),
  tone: z.enum(["friendly", "firm", "final"]),
  subject: z.string(),
  body: z.string(),
  updated_at: z.string(),
}) satisfies z.ZodType<EmailTemplate>;

// Not listOf(): every workspace has exactly the three seeded tones, a fixed
// size list nobody pages through.
const emailTemplateListSchema = z.object({ data: z.array(emailTemplateSchema) });

export const getEmailTemplates = cache(async () =>
  apiFetch("/notifications/templates", { schema: emailTemplateListSchema }));
