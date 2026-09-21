/**
 * Thin on purpose: validate, delegate, shape.
 *
 * Cookies are set by the Next.js Server Action that called this, because only
 * it has a browser to set them on. This service is never spoken to by one.
 */
import { z } from "zod";

import { transaction } from "../db/index.js";
import { NotImplemented } from "../middleware/errors.js";
import * as auth from "../services/auth.js";
import { parse } from "./query.js";

// Field for field with app/schemas/auth.py, snake_case included, so the Zod
// schema in src/lib/api/ stays a transcription rather than a translation.
const signupSchema = z.object({
  full_name: z.string().min(2).max(200),
  email: z.email().max(320),
  // Length is the only rule that reliably predicts strength; matches the Zod
  // schema in auth-form.tsx so the two cannot disagree about what is valid.
  password: z.string().min(10).max(200),
});

const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});

const refreshSchema = z.object({ refresh_token: z.string().min(1) });

const switchWorkspaceSchema = z.object({ workspace_id: z.uuid() });

export function authController(sql, config) {
  return {
    async signup(request, response) {
      const body = parse(signupSchema, request.body);
      // The one use case here that is atomic: a half-created workspace with no
      // owner is worse than a failed signup.
      const result = await transaction(sql, (tx) => auth.signup(tx, config, body));
      response.status(201).json(result);
    },

    async login(request, response) {
      const body = parse(loginSchema, request.body);
      response.json(await auth.login(sql, config, body));
    },

    async refresh(request, response) {
      const { refresh_token: token } = parse(refreshSchema, request.body);
      response.json(await auth.refresh(sql, config, token));
    },

    async logout(request, response) {
      const { refresh_token: token } = parse(refreshSchema, request.body);
      await auth.logout(sql, token);
      response.status(204).end();
    },

    async switchWorkspace(request, response) {
      const { workspace_id: workspaceId } = parse(switchWorkspaceSchema, request.body);
      response.json(
        await auth.switchWorkspace(sql, config, request.principal, workspaceId),
      );
    },

    passwordReset() {
      throw new NotImplemented(
        "Not implemented: password reset needs the outbox from plan 4.",
      );
    },
  };
}
