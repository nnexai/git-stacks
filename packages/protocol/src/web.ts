import { z } from "zod"
import {
  ArchivedWorkspaceSummarySchema,
  CommandIdSchema,
  CursorSchema,
  EntityIdSchema,
  OperationIdSchema,
  RevisionSchema,
  SignalIdSchema,
  TimestampSchema,
  WorkspaceCreationRequestSchema,
  WorkspaceLifecycleFailureDetailsSchema,
  WorkspaceLifecyclePhaseSchema,
  utf8BoundedString,
} from "./service.js"

export const WEB_PROTOCOL = "web-v1" as const
export const WEB_COOKIE = "git_stacks_web"

export const WEB_SHORTCUT_ACTION_IDS = [
  "workspace.switch",
  "commands.open",
  "workspace.new",
  "terminal.new",
  "terminal.close",
  "terminal.previous",
  "terminal.next",
  "attention.next",
] as const
export const WEB_SHORTCUT_MAX_ALIASES = 4

export const WebShortcutPlatformSchema = z.enum(["macos", "linux"])
export type WebShortcutPlatform = z.infer<typeof WebShortcutPlatformSchema>
export const WebShortcutActionIdSchema = z.enum(WEB_SHORTCUT_ACTION_IDS)
export type WebShortcutActionId = z.infer<typeof WebShortcutActionIdSchema>
export const WebShortcutBindingSchema = z.strictObject({
  code: z.string().regex(/^Key[A-Z]$/),
  ctrl: z.boolean(),
  alt: z.boolean(),
  shift: z.boolean(),
  meta: z.boolean(),
})
export type WebShortcutBinding = z.infer<typeof WebShortcutBindingSchema>

const webShortcutBindingKey = (binding: WebShortcutBinding) =>
  `${binding.code}:${Number(binding.ctrl)}${Number(binding.alt)}${Number(binding.shift)}${Number(binding.meta)}`
const WebShortcutAliasesSchema = z.array(WebShortcutBindingSchema)
  .max(WEB_SHORTCUT_MAX_ALIASES)
  .refine((aliases) => new Set(aliases.map(webShortcutBindingKey)).size === aliases.length, {
    message: "Shortcut aliases must be unique",
  })

export const WebShortcutEffectiveBindingSchema = z.strictObject({
  action_id: WebShortcutActionIdSchema,
  primary: WebShortcutBindingSchema.nullable(),
  aliases: WebShortcutAliasesSchema,
}).superRefine(({ primary, aliases }, context) => {
  if (primary && aliases.some((alias) => webShortcutBindingKey(alias) === webShortcutBindingKey(primary))) {
    context.addIssue({ code: "custom", path: ["aliases"], message: "Primary binding cannot also be an alias" })
  }
})
export type WebShortcutEffectiveBinding = z.infer<typeof WebShortcutEffectiveBindingSchema>

export const WebShortcutSettingsSchema = z.strictObject({
  platform: WebShortcutPlatformSchema,
  revision: RevisionSchema,
  bindings: z.array(WebShortcutEffectiveBindingSchema).length(WEB_SHORTCUT_ACTION_IDS.length),
}).superRefine(({ bindings }, context) => {
  const seen = new Set<WebShortcutActionId>()
  for (const [index, binding] of bindings.entries()) {
    if (seen.has(binding.action_id)) {
      context.addIssue({ code: "custom", path: ["bindings", index, "action_id"], message: "Shortcut actions must be unique" })
    }
    seen.add(binding.action_id)
  }
})
export type WebShortcutSettings = z.infer<typeof WebShortcutSettingsSchema>

export const WebShortcutGetRequestSchema = z.strictObject({ platform: WebShortcutPlatformSchema })
export type WebShortcutGetRequest = z.infer<typeof WebShortcutGetRequestSchema>

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
  activity_at: TimestampSchema,
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
  archived_workspaces: z.array(ArchivedWorkspaceSummarySchema).max(16),
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
  progress: z.strictObject({
    message: utf8BoundedString(500).optional(),
    completed: z.number().int().nonnegative().optional(),
    total: z.number().int().positive().optional(),
    lifecycle_phase: WorkspaceLifecyclePhaseSchema.optional(),
  }).optional(),
  result: z.strictObject({
    workspace_name: utf8BoundedString(96, 1).optional(),
    snapshot_changed: z.boolean().optional(),
    revision: RevisionSchema.optional(),
    terminals_stopped: z.boolean().optional(),
  }).optional(),
  error: z.strictObject({
    code: utf8BoundedString(96, 1),
    message: utf8BoundedString(500, 1),
    lifecycle: WorkspaceLifecycleFailureDetailsSchema.optional(),
  }).optional(),
})
export type WebOperation = z.infer<typeof WebOperationSchema>
