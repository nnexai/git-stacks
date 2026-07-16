import { z } from "zod"
import {
  ArchivedWorkspaceSummarySchema,
  CommandIdSchema,
  CursorSchema,
  EntityIdSchema,
  ForgeReviewTokenSchema,
  ForgeSourceIdentitySchema,
  OperationIdSchema,
  OperationCancellationViewSchema,
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

export const WEB_WORKSPACE_ACTION_IDS = [
  "workspace.archive",
  "workspace.unarchive",
  "workspace.remove",
  "workspace.force-remove",
  "workspace.rename",
  "workspace.open",
  "workspace.close",
  "workspace.pin",
  "workspace.unpin",
  "workspace.sync",
  "workspace.pull",
  "workspace.push",
  "workspace.merge",
  "workspace.notes.list",
  "workspace.notes.add",
  "workspace.notes.clear",
  "workspace.files.inspect",
  "operation.cancel",
] as const
export const WebWorkspaceActionIdSchema = z.enum(WEB_WORKSPACE_ACTION_IDS)
export type WebWorkspaceActionId = z.infer<typeof WebWorkspaceActionIdSchema>
export const WebWorkspaceActionDisabledReasonSchema = z.enum([
  "workspace_unavailable",
  "workspace_archived",
  "workspace_active",
  "workspace_closed",
  "operation_in_progress",
  "dirty_worktree",
  "remote_unavailable",
  "nothing_to_pull",
  "nothing_to_push",
  "merge_unavailable",
  "stale_revision",
  "capability_unavailable",
  "not_cancellable",
  "operation_finished",
])
export type WebWorkspaceActionDisabledReason = z.infer<typeof WebWorkspaceActionDisabledReasonSchema>

function containsHostPath(value: string): boolean {
  return /(?:^|[\s"'])(?:\/(?:home|Users|tmp|var|etc|opt|private)\/|[A-Za-z]:\\|file:\/\/)|\\(?:Users|home|tmp)\\/u.test(value)
}

const SafeBrowserMessageSchema = utf8BoundedString(500, 1).refine((value) => !containsHostPath(value), {
  message: "Browser messages must not contain host paths",
})
export const WebWorkspaceActionAvailabilitySchema = z.discriminatedUnion("available", [
  z.strictObject({ available: z.literal(true) }),
  z.strictObject({
    available: z.literal(false),
    reason: WebWorkspaceActionDisabledReasonSchema,
    message: SafeBrowserMessageSchema,
  }),
])
export type WebWorkspaceActionAvailability = z.infer<typeof WebWorkspaceActionAvailabilitySchema>
export const WebWorkspaceActionSubjectSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("workspace"),
    workspace_id: EntityIdSchema,
    repository_id: EntityIdSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("operation"),
    operation_id: OperationIdSchema,
    workspace_id: EntityIdSchema,
  }),
])
export type WebWorkspaceActionSubject = z.infer<typeof WebWorkspaceActionSubjectSchema>
export const WebWorkspaceActionConfirmationSchema = z.enum(["none", "confirm", "exact-name"])
export type WebWorkspaceActionConfirmation = z.infer<typeof WebWorkspaceActionConfirmationSchema>
export const WebWorkspaceActionSchema = z.strictObject({
  action_id: WebWorkspaceActionIdSchema,
  subject: WebWorkspaceActionSubjectSchema,
  availability: WebWorkspaceActionAvailabilitySchema,
  confirmation: WebWorkspaceActionConfirmationSchema,
  pending_operation_id: OperationIdSchema.optional(),
}).superRefine(({ action_id, subject, confirmation }, context) => {
  if ((action_id === "operation.cancel") !== (subject.kind === "operation")) {
    context.addIssue({ code: "custom", path: ["subject"], message: "Only operation.cancel uses an operation subject" })
  }
  const requiredConfirmation = action_id === "workspace.force-remove"
    ? "exact-name"
    : action_id === "workspace.remove" || action_id === "workspace.merge" || action_id === "workspace.notes.clear"
      ? "confirm"
      : "none"
  if (confirmation !== requiredConfirmation) {
    context.addIssue({ code: "custom", path: ["confirmation"], message: `Expected ${requiredConfirmation} confirmation` })
  }
})
export type WebWorkspaceAction = z.infer<typeof WebWorkspaceActionSchema>
export const WebWorkspaceActionInventorySchema = z.array(WebWorkspaceActionSchema)
  .length(WEB_WORKSPACE_ACTION_IDS.length)
  .superRefine((rows, context) => {
    const ids = new Set(rows.map(({ action_id }) => action_id))
    for (const actionId of WEB_WORKSPACE_ACTION_IDS) {
      if (!ids.has(actionId)) context.addIssue({ code: "custom", message: `Missing workspace action ${actionId}` })
    }
    if (ids.size !== rows.length) context.addIssue({ code: "custom", message: "Workspace actions must be unique" })
  })
export type WebWorkspaceActionInventory = z.infer<typeof WebWorkspaceActionInventorySchema>

export const WebShortcutPlatformSchema = z.enum(["macos", "linux"])
export type WebShortcutPlatform = z.infer<typeof WebShortcutPlatformSchema>
export const WebShortcutActionIdSchema = z.enum(WEB_SHORTCUT_ACTION_IDS)
export type WebShortcutActionId = z.infer<typeof WebShortcutActionIdSchema>
export const WEB_SHORTCUT_STALE_REVISION_ERROR_CODE = "shortcut_revision_conflict" as const
export const WEB_SHORTCUT_OWNER_CONFLICT_ERROR_CODE = "shortcut_binding_conflict" as const
export const WebShortcutErrorDetailsSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("stale_revision") }),
  z.strictObject({
    kind: z.literal("binding_owner_conflict"),
    owner_action_id: WebShortcutActionIdSchema,
  }),
])
export type WebShortcutErrorDetails = z.infer<typeof WebShortcutErrorDetailsSchema>
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

const WebShortcutMutationBase = {
  platform: WebShortcutPlatformSchema,
  action_id: WebShortcutActionIdSchema,
  expected_revision: RevisionSchema,
}
export const WebShortcutMutationSchema = z.discriminatedUnion("intent", [
  z.strictObject({ ...WebShortcutMutationBase, intent: z.literal("set-primary"), binding: WebShortcutBindingSchema }),
  z.strictObject({ ...WebShortcutMutationBase, intent: z.literal("set-aliases"), aliases: WebShortcutAliasesSchema }),
  z.strictObject({ ...WebShortcutMutationBase, intent: z.literal("unbind") }),
  z.strictObject({ ...WebShortcutMutationBase, intent: z.literal("reset") }),
])
export type WebShortcutMutation = z.infer<typeof WebShortcutMutationSchema>

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

export const WebOperationSummarySchema = z.strictObject({
  operation_id: OperationIdSchema,
  action_id: WebWorkspaceActionIdSchema.exclude(["operation.cancel"]),
  workspace_id: EntityIdSchema,
  workspace_name: utf8BoundedString(96, 1),
  state: z.enum(["accepted", "running", "succeeded", "failed", "cancelled"]),
  accepted_at: TimestampSchema,
  started_at: TimestampSchema.optional(),
  finished_at: TimestampSchema.optional(),
  progress: z.strictObject({
    stage: z.enum(["accepted", "preparing", "executing", "rolling_back", "completed"]),
    message: SafeBrowserMessageSchema.optional(),
    completed: z.number().int().nonnegative().optional(),
    total: z.number().int().positive().optional(),
  }).refine((progress) => (progress.completed === undefined) === (progress.total === undefined), {
    message: "completed and total must be provided together",
  }).optional(),
  cancellation: OperationCancellationViewSchema.optional(),
  result: z.strictObject({
    workspace_name: utf8BoundedString(96, 1).optional(),
    revision: RevisionSchema.optional(),
    snapshot_changed: z.boolean().optional(),
    terminals_stopped: z.boolean().optional(),
  }).optional(),
  error: z.strictObject({
    code: utf8BoundedString(96, 1),
    message: SafeBrowserMessageSchema,
    retryable: z.boolean(),
  }).optional(),
}).superRefine(({ action_id, state, started_at, finished_at, progress, cancellation, result, error }, context) => {
  const terminal = state === "succeeded" || state === "failed" || state === "cancelled"
  if (state === "running" && (!started_at || !progress || !cancellation)) {
    context.addIssue({ code: "custom", message: "Running operations require start, progress, and cancellation state" })
  }
  if (terminal && !finished_at) context.addIssue({ code: "custom", path: ["finished_at"], message: "Terminal operations require finished_at" })
  if (!terminal && finished_at) context.addIssue({ code: "custom", path: ["finished_at"], message: "Non-terminal operations cannot be finished" })
  if (terminal && cancellation && (cancellation.state !== "unavailable" || cancellation.reason !== "finished")) {
    context.addIssue({ code: "custom", path: ["cancellation"], message: "Terminal operations may only report finished cancellation" })
  }
  if (state === "succeeded" && !result) context.addIssue({ code: "custom", path: ["result"], message: "Successful operations require a bounded result" })
  if ((state === "failed" || state === "cancelled") && !error) context.addIssue({ code: "custom", path: ["error"], message: "Failed operations require a bounded error" })
  if ((action_id === "workspace.notes.list" || action_id === "workspace.files.inspect") && cancellation?.state === "available") {
    context.addIssue({ code: "custom", path: ["cancellation"], message: "Read actions cannot expose durable-operation cancellation" })
  }
})
export type WebOperationSummary = z.infer<typeof WebOperationSummarySchema>

export const WEB_NOTE_LIMITS = Object.freeze({ records: 50, text_bytes: 4096 })
const WebNoteTextSchema = utf8BoundedString(WEB_NOTE_LIMITS.text_bytes, 1).refine((text) => text.trim().length > 0, {
  message: "Workspace notes cannot be blank",
})
const WebNotesTargetSchema = {
  workspace_id: EntityIdSchema,
  expected_revision: RevisionSchema,
}
export const WebNotesListRequestSchema = z.strictObject(WebNotesTargetSchema)
export type WebNotesListRequest = z.infer<typeof WebNotesListRequestSchema>
export const WebNotesAddRequestSchema = z.strictObject({
  ...WebNotesTargetSchema,
  expected_notes_revision: RevisionSchema,
  text: WebNoteTextSchema,
})
export type WebNotesAddRequest = z.infer<typeof WebNotesAddRequestSchema>
export const WebNotesClearRequestSchema = z.strictObject({
  ...WebNotesTargetSchema,
  expected_notes_revision: RevisionSchema,
})
export type WebNotesClearRequest = z.infer<typeof WebNotesClearRequestSchema>
export const WebNoteRecordSchema = z.strictObject({
  text: WebNoteTextSchema,
  created_at: TimestampSchema,
})
export type WebNoteRecord = z.infer<typeof WebNoteRecordSchema>
export const WebNotesResponseSchema = z.strictObject({
  workspace_id: EntityIdSchema,
  revision: RevisionSchema,
  notes_revision: RevisionSchema,
  count: z.number().int().nonnegative(),
  records: z.array(WebNoteRecordSchema).max(WEB_NOTE_LIMITS.records),
}).superRefine(({ count, records }, context) => {
  if (count < records.length) context.addIssue({ code: "custom", path: ["count"], message: "Note count cannot be smaller than returned records" })
  for (let index = 1; index < records.length; index += 1) {
    if (Date.parse(records[index - 1]!.created_at) < Date.parse(records[index]!.created_at)) {
      context.addIssue({ code: "custom", path: ["records", index], message: "Workspace notes must be newest first" })
    }
  }
})
export type WebNotesResponse = z.infer<typeof WebNotesResponseSchema>

export const WebFileStatusRequestSchema = z.strictObject(WebNotesTargetSchema)
export type WebFileStatusRequest = z.infer<typeof WebFileStatusRequestSchema>
export const WebFileEntryIdSchema = z.string().regex(/^file_[A-Za-z0-9_-]{16,}$/)
export const WebFileStateSchema = z.enum(["materialized", "ok", "missing", "pullable", "pushable", "diverged", "error"])
export const WebFileSeveritySchema = z.enum(["ok", "warning", "error"])
export const WebFileReasonSchema = z.enum([
  "none",
  "target_missing",
  "source_missing",
  "content_differs",
  "diverged",
  "comparison_failed",
  "repo_root_missing",
])
const WebLogicalTargetSchema = utf8BoundedString(256, 1).refine((target) => {
  if (target.startsWith("/") || target.includes("\\") || /^[A-Za-z]:/u.test(target)) return false
  return target.split("/").every((part) => part !== ".." && part.length > 0)
}, { message: "File target must be a safe relative configured target" })
export const WebFileCountsSchema = z.strictObject({
  equal: z.number().int().nonnegative(),
  source_only: z.number().int().nonnegative(),
  target_only: z.number().int().nonnegative(),
  differing: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
})
export const WebFileEntrySchema = z.strictObject({
  id: WebFileEntryIdSchema,
  target: WebLogicalTargetSchema,
  type: z.enum(["copy", "symlink", "sync"]),
  state: WebFileStateSchema,
  severity: WebFileSeveritySchema,
  needs_attention: z.boolean(),
  reason: WebFileReasonSchema,
  message: SafeBrowserMessageSchema,
  counts: WebFileCountsSchema.optional(),
}).superRefine(({ type, state, severity, needs_attention, reason, counts }, context) => {
  if ((type === "sync") !== (counts !== undefined)) context.addIssue({ code: "custom", path: ["counts"], message: "Only sync entries carry aggregate counts" })
  const healthy = state === "materialized" || state === "ok"
  if (healthy !== (severity === "ok" && !needs_attention && reason === "none")) {
    context.addIssue({ code: "custom", message: "File health, severity, attention, and reason must agree" })
  }
  if ((state === "missing" || state === "pullable" || state === "pushable") && severity !== "warning") {
    context.addIssue({ code: "custom", path: ["severity"], message: "Missing and one-way file changes are warnings" })
  }
  if ((state === "diverged" || state === "error") && severity !== "error") {
    context.addIssue({ code: "custom", path: ["severity"], message: "Diverged and failed file checks are errors" })
  }
})
export type WebFileEntry = z.infer<typeof WebFileEntrySchema>
export const WebFileSummarySchema = z.strictObject({
  total: z.number().int().nonnegative(),
  ok: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  attention: z.number().int().nonnegative(),
}).refine((summary) => summary.total === summary.ok + summary.warnings + summary.errors && summary.attention <= summary.total, {
  message: "File summary counts must be consistent",
})
const WebFileGroupCommon = {
  name: utf8BoundedString(96, 1),
  summary: WebFileSummarySchema,
  entries: z.array(WebFileEntrySchema).max(128),
}
export const WebFileGroupSchema = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("workspace"), ...WebFileGroupCommon }),
  z.strictObject({ scope: z.literal("repository"), repository_id: EntityIdSchema, ...WebFileGroupCommon }),
])
export type WebFileGroup = z.infer<typeof WebFileGroupSchema>
export const WebFileStatusResponseSchema = z.strictObject({
  workspace_id: EntityIdSchema,
  revision: RevisionSchema,
  generated_at: TimestampSchema,
  summary: WebFileSummarySchema,
  groups: z.array(WebFileGroupSchema).max(9),
}).superRefine(({ summary, groups }, context) => {
  const repositories = new Set<string>()
  let workspaceGroups = 0
  const aggregate = { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0 }
  for (const [index, group] of groups.entries()) {
    if (group.scope === "workspace") workspaceGroups += 1
    else if (repositories.has(group.repository_id)) context.addIssue({ code: "custom", path: ["groups", index], message: "Repository file groups must be unique" })
    else repositories.add(group.repository_id)
    for (const key of Object.keys(aggregate) as Array<keyof typeof aggregate>) aggregate[key] += group.summary[key]
  }
  if (workspaceGroups > 1) context.addIssue({ code: "custom", message: "At most one workspace file group is allowed" })
  if (Object.keys(aggregate).some((key) => aggregate[key as keyof typeof aggregate] !== summary[key as keyof typeof aggregate])) {
    context.addIssue({ code: "custom", path: ["summary"], message: "File response summary must equal group summaries" })
  }
})
export type WebFileStatusResponse = z.infer<typeof WebFileStatusResponseSchema>

export const WebWorkspaceDataFailureSchema = z.strictObject({
  code: z.enum(["not_found", "stale_revision", "malformed_store", "comparison_failed", "capability_unavailable"]),
  message: SafeBrowserMessageSchema,
  retryable: z.boolean(),
})
export type WebWorkspaceDataFailure = z.infer<typeof WebWorkspaceDataFailureSchema>

const ForgeUrlSchema = utf8BoundedString(2048, 1).superRefine((raw, context) => {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    context.addIssue({ code: "custom", message: "Forge URL must be absolute" })
    return
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    context.addIssue({ code: "custom", message: "Forge URL must be credential-free HTTPS" })
  }
})
export const WebForgeResolveRequestSchema = z.strictObject({ url: ForgeUrlSchema })
export type WebForgeResolveRequest = z.infer<typeof WebForgeResolveRequestSchema>
export const WebForgeResolveIntentSchema = z.strictObject({
  kind: z.literal("workspace.source.resolve"),
  request: WebForgeResolveRequestSchema,
})
export type WebForgeResolveIntent = z.infer<typeof WebForgeResolveIntentSchema>
export const WebReviewedRepositorySchema = z.strictObject({
  repository_id: EntityIdSchema,
  included: z.boolean(),
  branch: z.strictObject({
    base_branch: utf8BoundedString(256, 1),
    workspace_branch: utf8BoundedString(256, 1),
  }),
})
export const WebReviewedWorkspaceDraftSchema = z.strictObject({
  workspace_name: utf8BoundedString(96, 1),
  template_name: utf8BoundedString(96, 1),
  matched_source_repository_id: EntityIdSchema,
  repositories: z.array(WebReviewedRepositorySchema).min(1).max(8),
}).superRefine(({ matched_source_repository_id, repositories }, context) => {
  if (new Set(repositories.map(({ repository_id }) => repository_id)).size !== repositories.length) {
    context.addIssue({ code: "custom", path: ["repositories"], message: "Reviewed repositories must be unique" })
  }
  if (!repositories.some(({ repository_id, included }) => repository_id === matched_source_repository_id && included)) {
    context.addIssue({ code: "custom", path: ["matched_source_repository_id"], message: "Matched source repository must be included" })
  }
})
export type WebReviewedWorkspaceDraft = z.infer<typeof WebReviewedWorkspaceDraftSchema>
export const WebForgeRepositoryCandidateSchema = z.strictObject({
  repository_id: EntityIdSchema,
  name: utf8BoundedString(96, 1),
  mode: z.literal("worktree"),
  matched_source: z.boolean(),
})
export const WebForgeTemplateCandidateSchema = z.strictObject({
  name: utf8BoundedString(96, 1),
  repositories: z.array(WebForgeRepositoryCandidateSchema).min(1).max(8),
})
export const WebForgeCandidatesSchema = z.strictObject({
  templates: z.array(WebForgeTemplateCandidateSchema).min(1).max(32),
  source_repositories: z.array(WebForgeRepositoryCandidateSchema).min(1).max(32),
})
export type WebForgeCandidates = z.infer<typeof WebForgeCandidatesSchema>
export const WebForgeTerminologySchema = z.discriminatedUnion("provider", [
  z.strictObject({
    provider: z.literal("github"),
    change: z.literal("Pull request"),
    source_branch: z.literal("Head branch"),
    target_branch: z.literal("Base branch"),
  }),
  z.strictObject({
    provider: z.literal("gitlab"),
    change: z.literal("Merge request"),
    source_branch: z.literal("Source branch"),
    target_branch: z.literal("Target branch"),
  }),
])
export type WebForgeTerminology = z.infer<typeof WebForgeTerminologySchema>
export const WebReviewedWorkspaceCreateRequestSchema = z.strictObject({
  token: ForgeReviewTokenSchema,
  expected_revision: RevisionSchema,
  draft: WebReviewedWorkspaceDraftSchema,
})
export type WebReviewedWorkspaceCreateRequest = z.infer<typeof WebReviewedWorkspaceCreateRequestSchema>
export const WebForgeFailureCodeSchema = z.enum([
  "malformed_url",
  "unsupported_provider",
  "unsupported_host",
  "cli_unavailable",
  "auth_required",
  "change_not_found",
  "change_closed",
  "rate_limited",
  "provider_unavailable",
  "provider_response_invalid",
  "repo_not_matched",
  "ambiguous_repo",
  "template_repo_missing",
  "not_worktree_mode",
  "review_expired",
  "stale_revision",
  "source_changed",
  "fork_unreachable",
  "branch_conflict",
  "cancelled",
  "request_timeout",
])
export const WebForgeRecoverySchema = z.enum([
  "paste_url",
  "configure_host",
  "install_cli",
  "authenticate",
  "retry",
  "change_source",
  "select_repository",
  "update_configuration",
  "resolve_again",
  "change_branch",
])
export const WebForgeFailureDetailsSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("provider"), provider: z.enum(["github", "gitlab"]) }),
  z.strictObject({ kind: z.literal("host"), host: utf8BoundedString(253, 1).regex(/^[A-Za-z0-9.-]+$/) }),
  z.strictObject({ kind: z.literal("repositories"), candidates: z.array(WebForgeRepositoryCandidateSchema).max(32) }),
  z.strictObject({ kind: z.literal("retry"), retry_after_seconds: z.number().int().positive().max(86_400) }),
])
export const WebForgeFailureSchema = z.strictObject({
  code: WebForgeFailureCodeSchema,
  recovery: WebForgeRecoverySchema,
  message: SafeBrowserMessageSchema,
  details: WebForgeFailureDetailsSchema.optional(),
})
export type WebForgeFailure = z.infer<typeof WebForgeFailureSchema>
const WebForgeResolvedResponseSchema = z.strictObject({
    resolved: z.literal(true),
    token: ForgeReviewTokenSchema,
    expires_at: TimestampSchema,
    revision: RevisionSchema,
    source: ForgeSourceIdentitySchema,
    terminology: WebForgeTerminologySchema,
    candidates: WebForgeCandidatesSchema,
    draft: WebReviewedWorkspaceDraftSchema,
  }).superRefine(({ source, terminology }, context) => {
    if (source.provider !== terminology.provider) {
      context.addIssue({ code: "custom", path: ["terminology"], message: "Provider terminology must match source identity" })
    }
  })
export const WebForgeResolveResponseSchema = z.union([
  WebForgeResolvedResponseSchema,
  z.strictObject({ resolved: z.literal(false), failure: WebForgeFailureSchema }),
])
export type WebForgeResolveResponse = z.infer<typeof WebForgeResolveResponseSchema>

export const WebOperationMutationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("workspace.create"), request: WorkspaceCreationRequestSchema }),
  z.strictObject({ kind: z.literal("workspace.create.reviewed"), request: WebReviewedWorkspaceCreateRequestSchema }),
  z.strictObject({ kind: z.enum(["workspace.open", "workspace.close", "workspace.sync", "workspace.pull", "workspace.push", "workspace.merge"]), request: WebWorkspaceMutationSchema }),
  z.strictObject({ kind: z.literal("workspace.notes.add"), request: WebNotesAddRequestSchema }),
  z.strictObject({ kind: z.literal("workspace.notes.clear"), request: WebNotesClearRequestSchema }),
])
export type WebOperationMutation = z.infer<typeof WebOperationMutationSchema>
