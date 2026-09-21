/**
 * Rebuild the demo workspace, and the once-a-day work that has nowhere else
 * to run.
 *
 * The workspace id comes from configuration and nowhere else. A request body
 * naming another workspace is ignored, not rejected: there is no code path
 * here by which a real tenant's rows can be deleted.
 */
import { transaction } from "../db/index.js";
import { seedDemoWorkspace } from "../db/seed.js";
import { NotFound } from "../middleware/errors.js";
import { evaluateAllAutomations } from "../services/automations.js";
import { retryFailedDeliveries } from "../services/webhooks.js";
import { deleteWorkspaceData, findFirstMember } from "../models/workspaces.js";

export function adminController(sql, config) {
  return {
    async reseed(request, response) {
      const workspaceId = config.demoWorkspaceId;

      const counts = await transaction(sql, async (tx) => {
        const member = await findFirstMember(tx, workspaceId);
        if (!member) {
          // Nothing to rebuild, and nobody to own the rebuild. `npm run seed`
          // creates the workspace once; this endpoint only replaces it.
          throw new NotFound(`No seeded workspace ${workspaceId}`);
        }

        await deleteWorkspaceData(tx, workspaceId);
        return seedDemoWorkspace(tx, {
          workspaceId,
          ownerUserId: member.user_id,
          role: member.role,
        });
      });

      response.json({ workspace_id: workspaceId, ...counts });
    },

    /**
     * Vercel Hobby allows crons no more often than daily, and the reseed
     * already holds that one slot -- so the frontend cron handler calls this
     * right after a reseed instead of asking for a second one. Every
     * enabled automation across every workspace evaluates once, then every
     * webhook delivery still inside its 24-hour retry window gets another
     * attempt.
     */
    async runDaily(request, response) {
      const automationRuns = await evaluateAllAutomations(sql, config);
      const webhooksRetried = await retryFailedDeliveries(sql);
      response.json({ automation_runs: automationRuns, webhooks_retried: webhooksRetried });
    },
  };
}
