import { z } from "zod"
import {
  CommandIdSchema,
  CursorSchema,
  EntityIdSchema,
  OperationIdSchema,
  RevisionSchema,
  SignalIdSchema,
  TimestampSchema,
  WorkspaceCreationRequestSchema,
  utf8BoundedString,
} from "../../lib/service/contract"

export const WEB_PROTOCOL = "web-v1" as const
export const WEB_COOKIE = "git_stacks_web"

export const WebPairingExchangeSchema = z.strictObject({ code: z.string().min(32).max(128) })
export const WebTerminalCreateSchema = z.strictObject({
  workspace_id: EntityIdSchema,
  repository_id: EntityIdSchema,
  command_id: CommandIdSchema.optional(),
  expected_revision: RevisionSchema,
  cols: z.number().int().min(2).max(400),
  rows: z.number().int().min(1).max(240),
})
export const WebTerminalRenameSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("manual"), title: utf8BoundedString(64) }),
  z.strictObject({ mode: z.literal("automatic"), title: utf8BoundedString(64, 1) }),
])
export const WebTerminalIdSchema = z.string().regex(/^term_[A-Za-z0-9_-]{16,}$/)
export const WebPinsSchema = z.strictObject({
  workspace_ids: z.array(EntityIdSchema).max(16).refine((ids) => new Set(ids).size === ids.length),
  expected_revision: RevisionSchema,
})
export const WebPrioritiesSchema = z.strictObject({
  priorities: z.array(z.strictObject({
    workspace_id: EntityIdSchema,
    priority: z.number().int().min(-2147483648).max(2147483647),
  })).max(16).refine((entries) => new Set(entries.map(({ workspace_id }) => workspace_id)).size === entries.length),
  expected_revision: RevisionSchema,
})
export const WebWorkspaceMutationSchema = z.strictObject({
  workspace_id: EntityIdSchema,
  expected_revision: RevisionSchema,
})
export const WebOperationMutationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("workspace.create"), request: WorkspaceCreationRequestSchema }),
  z.strictObject({ kind: z.enum(["workspace.open", "workspace.close"]), request: WebWorkspaceMutationSchema }),
])
export const WebSignalDismissSchema = z.strictObject({ signal_id: SignalIdSchema })
export const WebSignalAcknowledgeSchema = z.strictObject({ surface_id: EntityIdSchema })
export const WebTerminalSocketControlSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("input"), data: z.string().max(64 * 1024) }),
  z.strictObject({ type: z.literal("resize"), cols: z.number().int().min(2).max(400), rows: z.number().int().min(1).max(240) }),
  z.strictObject({ type: z.literal("ack"), cursor: CursorSchema }),
  z.strictObject({ type: z.literal("flow"), streaming: z.boolean() }),
  z.strictObject({ type: z.literal("ping") }),
])

export const WebRepositorySchema = z.strictObject({
  id: EntityIdSchema,
  name: utf8BoundedString(96, 1),
  mode: z.enum(["worktree", "trunk", "dir"]),
  exists: z.boolean(),
  dirty: z.boolean(),
  branch: utf8BoundedString(96),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  removals: z.number().int().nonnegative(),
  degraded: z.boolean(),
  remote: z.enum(["available", "missing", "not_applicable"]),
})
export type WebRepository = z.infer<typeof WebRepositorySchema>
export const WebCommandSchema = z.strictObject({
  id: CommandIdSchema,
  name: utf8BoundedString(96, 1),
  scope: z.enum(["workspace", "repository"]),
  repository_id: EntityIdSchema.optional(),
})
export type WebCommand = z.infer<typeof WebCommandSchema>
export const WebWorkspaceSchema = z.strictObject({
  id: EntityIdSchema,
  name: utf8BoundedString(96, 1),
  branch: utf8BoundedString(96),
  priority: z.number().int().min(-2147483648).max(2147483647),
  labels: z.array(utf8BoundedString(64, 1)).max(16),
  repositories: z.array(WebRepositorySchema),
  commands: z.array(WebCommandSchema),
  file_status: z.strictObject({
    total: z.number().int().nonnegative(), ok: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(), errors: z.number().int().nonnegative(), attention: z.number().int().nonnegative(),
  }),
})
export type WebWorkspace = z.infer<typeof WebWorkspaceSchema>
export const WebSnapshotSchema = z.strictObject({
  protocol: z.literal(WEB_PROTOCOL),
  revision: RevisionSchema,
  generated_at: TimestampSchema,
  pinned_workspace_ids: z.array(EntityIdSchema).max(16),
  workspaces: z.array(WebWorkspaceSchema),
})
export type WebSnapshot = z.infer<typeof WebSnapshotSchema>

export const WebTerminalSchema = z.strictObject({
  id: WebTerminalIdSchema,
  workspace_id: EntityIdSchema,
  repository_id: EntityIdSchema,
  command_id: CommandIdSchema.optional(),
  surface_id: EntityIdSchema,
  title: utf8BoundedString(64, 1),
  title_pinned: z.boolean(),
  state: z.enum(["starting", "running", "ended", "closing", "cleanup_failed"]),
  created_at: TimestampSchema,
  exit_code: z.number().int().nullable(),
  cursor: CursorSchema,
  earliest_cursor: CursorSchema,
  history_available: z.boolean(),
})
export type WebTerminal = z.infer<typeof WebTerminalSchema>

export const WebOperationSchema = z.strictObject({
  operation_id: OperationIdSchema,
  state: z.enum(["accepted", "running", "succeeded", "failed", "cancelled"]),
  accepted_at: TimestampSchema,
  started_at: TimestampSchema.optional(),
  finished_at: TimestampSchema.optional(),
  progress: z.strictObject({ message: utf8BoundedString(500).optional(), completed: z.number().int().nonnegative().optional(), total: z.number().int().positive().optional() }).optional(),
  result: z.strictObject({ workspace_name: utf8BoundedString(96, 1).optional(), snapshot_changed: z.boolean().optional() }).optional(),
  error: z.strictObject({ code: z.string().min(1), message: utf8BoundedString(500, 1) }).optional(),
})
export type WebOperation = z.infer<typeof WebOperationSchema>
