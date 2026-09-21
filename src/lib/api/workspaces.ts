import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { User, WorkspaceMember, WorkspaceRole } from "@/types";
import { apiFetch } from "./client";

const roleSchema = z.enum(["owner", "admin", "member", "viewer"]) satisfies z.ZodType<WorkspaceRole>;

const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  full_name: z.string(),
  avatar_url: z.string().nullable(),
}) satisfies z.ZodType<User>;

const memberSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  user: userSchema,
  role: roleSchema,
  status: z.enum(["active", "invited"]),
  last_active_at: z.string().nullable(),
}) satisfies z.ZodType<WorkspaceMember>;

// Not listOf(): a workspace's member list is complete and small, never paged.
const memberListSchema = z.object({ data: z.array(memberSchema) });

export const getMembers = cache(async (workspaceId: string) =>
  apiFetch(`/workspaces/${workspaceId}/members`, { schema: memberListSchema }));
