import { z } from "zod"

export const SERVICE_PROTOCOL = "v1" as const

export const ProtocolVersionSchema = z.literal("v1")
export type ProtocolVersion = z.infer<typeof ProtocolVersionSchema>
export const RequestIdSchema = z.string().regex(/^req_[A-Za-z0-9_-]{16,}$/)
export type RequestId = z.infer<typeof RequestIdSchema>
export const EntityIdSchema = z.string().uuid()
export type EntityId = z.infer<typeof EntityIdSchema>
export const OperationIdSchema = z.string().regex(/^op_[A-Za-z0-9_-]{16,}$/)
export type OperationId = z.infer<typeof OperationIdSchema>
export const CommandIdSchema = z.string().regex(/^cmd_[A-Za-z0-9_-]{16,}$/)
export type CommandId = z.infer<typeof CommandIdSchema>
export const SignalIdSchema = z.string().regex(/^sig_[A-Za-z0-9_-]{16,}$/)
export type SignalId = z.infer<typeof SignalIdSchema>
export const CursorSchema = z.string().regex(/^(0|[1-9][0-9]*)$/)
export type Cursor = z.infer<typeof CursorSchema>
export const RevisionSchema = CursorSchema
export type Revision = z.infer<typeof RevisionSchema>
export const TimestampSchema = z.string().datetime({ offset: true })

const utf8 = new TextEncoder()
export function utf8BoundedString(maximum: number, minimum = 0) {
  return z.string().refine((value) => {
    if (value.length > 0 && !value.toWellFormed) return false
    return value === value.toWellFormed() && utf8.encode(value).byteLength >= minimum && utf8.encode(value).byteLength <= maximum
  }, { message: `String must contain between ${minimum} and ${maximum} UTF-8 bytes` })
}

export const ClientModelStringByteLimitsSchema = z.strictObject({
  workspace_name: z.literal(96), workspace_label: z.literal(64), repository_name: z.literal(96),
  command_id: z.literal(64), command_name: z.literal(96), surface_command_id: z.literal(64),
  surface_title: z.literal(64), surface_cwd: z.literal(128), signal_id: z.literal(64),
  signal_title: z.literal(160), signal_detail: z.literal(500), signal_occurred_at: z.literal(40),
  launch_environment_value: z.literal(4096),
})
export const ClientModelLimitsSchema = z.strictObject({
  workspaces: z.literal(16), labels_per_workspace: z.literal(16), repositories_per_workspace: z.literal(8),
  authoritative_pairs: z.literal(32), live_pair_identities: z.literal(32), reserved_orphan_tombstones: z.literal(32),
  surfaces_per_pair: z.literal(16), commands: z.literal(64), signal_items: z.literal(64),
  string_bytes: ClientModelStringByteLimitsSchema,
})
export const CLIENT_MODEL_LIMITS = Object.freeze(ClientModelLimitsSchema.parse({
  workspaces: 16, labels_per_workspace: 16, repositories_per_workspace: 8, authoritative_pairs: 32,
  live_pair_identities: 32, reserved_orphan_tombstones: 32, surfaces_per_pair: 16, commands: 64, signal_items: 64,
  string_bytes: { workspace_name: 96, workspace_label: 64, repository_name: 96, command_id: 64, command_name: 96,
  surface_command_id: 64, surface_title: 64, surface_cwd: 128, signal_id: 64, signal_title: 160,
    signal_detail: 500, signal_occurred_at: 40, launch_environment_value: 4096 },
}))

export const ErrorCodeSchema = z.enum([
  "invalid_request", "unauthorized", "not_found", "conflict", "rate_limited",
  "capability_unavailable", "replay_gap", "snapshot_busy", "internal_error", "operation_failed", "idempotency_conflict",
  "request_timeout",
  "capacity_exceeded",
])
export type ErrorCode = z.infer<typeof ErrorCodeSchema>
export const ApiErrorSchema = z.strictObject({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean().optional(),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

const EnvelopeBase = { protocol: ProtocolVersionSchema, request_id: RequestIdSchema }
export const ErrorEnvelopeSchema = z.strictObject({ ...EnvelopeBase, ok: z.literal(false), error: ApiErrorSchema })
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>
export const successEnvelope = <T extends z.ZodType>(data: T) => z.strictObject({ ...EnvelopeBase, ok: z.literal(true), data })

export const CapabilityAvailabilitySchema = z.discriminatedUnion("available", [
  z.strictObject({ available: z.literal(true) }),
  z.strictObject({ available: z.literal(false), reason: z.literal("capability_unavailable") }),
])
export type CapabilityAvailability = z.infer<typeof CapabilityAvailabilitySchema>
export const CapabilitiesSchema = z.strictObject({
  workspace_snapshots: CapabilityAvailabilitySchema,
  operations: CapabilityAvailabilitySchema,
  signals: CapabilityAvailabilitySchema,
})
export type Capabilities = z.infer<typeof CapabilitiesSchema>
export const ServiceLimitsSchema = z.strictObject({
  request_body_bytes: z.number().int().positive(),
  subscriber_events: z.number().int().positive(),
  subscriber_bytes: z.number().int().positive(),
  client_model: ClientModelLimitsSchema,
})
export type ServiceLimits = z.infer<typeof ServiceLimitsSchema>
export const DiscoverySchema = z.strictObject({ service_version: z.string().min(1), capabilities: CapabilitiesSchema, limits: ServiceLimitsSchema })
export const DiscoveryResponseSchema = successEnvelope(DiscoverySchema)
export type DiscoveryResponse = z.infer<typeof DiscoveryResponseSchema>

export const WorkspaceCreationTemplateSchema = z.strictObject({
  name: utf8BoundedString(96, 1), description: utf8BoundedString(160).optional(), repository_count: z.number().int().nonnegative(),
  command_count: z.number().int().nonnegative(), labels: z.array(utf8BoundedString(64, 1)).max(16),
})
export const WorkspaceCreationRepositorySchema = z.strictObject({
  name: utf8BoundedString(96, 1), type: utf8BoundedString(64, 1), default_branch: utf8BoundedString(96, 1),
})
export const WorkspaceCreationCatalogSchema = z.strictObject({
  templates: z.array(WorkspaceCreationTemplateSchema), repositories: z.array(WorkspaceCreationRepositorySchema), client_model: ClientModelLimitsSchema,
})
const WorkspaceCreationBase = { name: utf8BoundedString(96, 1), branch: utf8BoundedString(96, 1) }
export const WorkspaceCreationRequestSchema = z.union([
  z.strictObject({ ...WorkspaceCreationBase, source: z.strictObject({ kind: z.literal("template"), template: utf8BoundedString(96, 1) }) }),
  z.strictObject({ ...WorkspaceCreationBase, source: z.strictObject({ kind: z.literal("repositories"), repositories: z.array(utf8BoundedString(96, 1)).min(1).max(8).refine((v) => new Set(v).size === v.length) }) }),
])
export type WorkspaceCreationCatalog = z.infer<typeof WorkspaceCreationCatalogSchema>
export type WorkspaceCreationRequest = z.infer<typeof WorkspaceCreationRequestSchema>

export const RepositorySnapshotSchema = z.strictObject({
  id: EntityIdSchema, name: z.string().min(1), mode: z.enum(["worktree", "trunk", "dir"]), path: z.string().min(1),
})
export type RepositorySnapshot = z.infer<typeof RepositorySnapshotSchema>
export const LaunchStepSchema = z.strictObject({
  bucket: z.enum(["pre", "main", "post"]),
  scope: z.enum(["workspace", "repo"]),
  command: z.string().min(1),
  cwd: z.string().min(1),
  repository_id: EntityIdSchema.optional(),
  repository_name: z.string().min(1).optional(),
  environment: z.record(z.string(), z.string()),
}).refine((step) => step.scope === "repo" ? Boolean(step.repository_id && step.repository_name) : !step.repository_id && !step.repository_name, {
  message: "repository identity is required only for repository-scoped steps",
})
export const NamedLaunchSpecificationSchema = z.strictObject({
  id: CommandIdSchema,
  name: z.string().min(1),
  scope: z.enum(["workspace", "repository"]),
  repository_id: EntityIdSchema.optional(),
  steps: z.array(LaunchStepSchema),
}).refine((command) => command.scope === "repository" ? Boolean(command.repository_id) : command.repository_id === undefined, {
  message: "repository identity is required only for repository-scoped commands",
})
export const LaunchSpecificationSchema = z.strictObject({
  commands: z.array(z.string()),
  environment: z.record(z.string(), z.string()),
  redacted: z.array(z.string()),
  references: z.record(z.string(), z.string()),
  cwd: z.string().min(1).optional(),
  ports: z.record(z.string(), z.number().int()).optional(),
  named: z.array(NamedLaunchSpecificationSchema).optional(),
})
export type LaunchSpecification = z.infer<typeof LaunchSpecificationSchema>
export const WorkspaceSnapshotSchema = z.strictObject({
  id: EntityIdSchema, name: z.string().min(1), branch: z.string(), repositories: z.array(RepositorySnapshotSchema), launch: LaunchSpecificationSchema,
  labels: z.array(z.string().min(1).max(64)).max(16).optional(),
  pinned: z.boolean().optional(),
  priority: z.number().int().min(-2147483648).max(2147483647).optional(),
  commands: z.array(z.string()).optional(),
  status: z.array(z.strictObject({
    repository_id: EntityIdSchema, name: utf8BoundedString(96, 1), exists: z.boolean(), dirty: z.boolean(), branch: utf8BoundedString(96),
    default_branch: utf8BoundedString(96, 1), mode: z.enum(["worktree", "trunk", "dir"]),
    ahead: z.number().int().nonnegative(), behind: z.number().int().nonnegative(), additions: z.number().int().nonnegative(), removals: z.number().int().nonnegative(),
    remote: z.enum(["available", "missing", "not_applicable"]), degraded: z.boolean(), fetch_stale: z.boolean().optional(),
    pull_request: z.strictObject({ number: z.number().int().positive(), state: z.enum(["open", "draft", "merged", "closed"]), checks: z.enum(["pending", "passing", "failing"]).optional() }).optional(),
  })).optional(),
  file_status: z.strictObject({
    total: z.number().int().nonnegative(), ok: z.number().int().nonnegative(), warnings: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(), attention: z.number().int().nonnegative(),
  }).optional(),
})
export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>
export const WorkspaceSnapshotResponseSchema = z.strictObject({
  ...EnvelopeBase, ok: z.literal(true), revision: RevisionSchema, generated_at: TimestampSchema, workspace: WorkspaceSnapshotSchema,
})
export type WorkspaceSnapshotResponse = z.infer<typeof WorkspaceSnapshotResponseSchema>

export const TerminalLaunchResolutionRequestSchema = z.strictObject({
  workspace_id: EntityIdSchema,
  repository_id: EntityIdSchema,
  command_id: CommandIdSchema.optional(),
  expected_revision: RevisionSchema,
})
export type TerminalLaunchResolutionRequest = z.infer<typeof TerminalLaunchResolutionRequestSchema>
export const TerminalLaunchSpecificationSchema = z.strictObject({
  argv: z.array(z.string()).min(1),
  cwd: z.string().min(1),
  environment: z.record(z.string(), z.string()),
  ports: z.record(z.string(), z.number().int()),
  configuration: z.strictObject({ command_id: CommandIdSchema.optional(), shell: z.boolean() }),
  redacted: z.array(z.string()),
})
export const TerminalLaunchResolutionSchema = z.discriminatedUnion("resolved", [
  z.strictObject({ resolved: z.literal(true), revision: RevisionSchema, launch: TerminalLaunchSpecificationSchema }),
  z.strictObject({ resolved: z.literal(false), error: ApiErrorSchema }),
])
export type TerminalLaunchResolution = z.infer<typeof TerminalLaunchResolutionSchema>

export const SignalActivityStateSchema = z.enum(["working", "waiting", "completed", "failed", "idle"])
export const SignalSourceSchema = z.enum(["claude", "copilot", "codex", "opencode", "automation", "acp", "user", "other"])
const SignalCommon = {
  version: z.literal(1), id: SignalIdSchema, source: SignalSourceSchema, workspace_id: EntityIdSchema,
  repository_id: EntityIdSchema.optional(), surface_id: EntityIdSchema.optional(), session_id: z.string().min(1).max(160).optional(),
  title: utf8BoundedString(160, 1).optional(), detail: utf8BoundedString(500).optional(), occurred_at: TimestampSchema,
}
export const ActivitySignalSchema = z.strictObject({
  ...SignalCommon, kind: z.literal("activity"), surface_id: EntityIdSchema, session_id: utf8BoundedString(160, 1),
  state: SignalActivityStateSchema, title: utf8BoundedString(160, 1).optional(),
}).refine((signal) => signal.repository_id !== undefined, { message: "surface-scoped activity requires a repository identity" })
export const NotificationSignalSchema = z.strictObject({
  ...SignalCommon, kind: z.literal("notification"), title: utf8BoundedString(160, 1),
  state: z.never().optional(),
})
export const SignalSchema = z.discriminatedUnion("kind", [ActivitySignalSchema, NotificationSignalSchema])
export type ActivitySignal = z.infer<typeof ActivitySignalSchema>
export type NotificationSignal = z.infer<typeof NotificationSignalSchema>
export type Signal = z.infer<typeof SignalSchema>
export const SignalDismissalSchema = z.strictObject({ kind: z.literal("dismiss_signal"), signal_id: SignalIdSchema })
export type SignalDismissal = z.infer<typeof SignalDismissalSchema>
export const SIGNAL_MODEL_LIMITS = Object.freeze({ signal_items: 64, signal_id: 64, signal_title: 160, signal_detail: 500, signal_occurred_at: 40 })
export const OperationStageSchema = z.enum(["accepted", "preparing", "executing", "rolling_back", "completed"])
export const OperationStateSchema = z.enum(["accepted", "running", "succeeded", "failed", "cancelled"])
export const OperationProgressSchema = z.strictObject({
  stage: OperationStageSchema, message: z.string().optional(), completed: z.number().int().nonnegative().optional(), total: z.number().int().positive().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).refine((v) => (v.completed === undefined) === (v.total === undefined), { message: "completed and total must be provided together" })
export type OperationProgress = z.infer<typeof OperationProgressSchema>
export const OperationResultSchema = z.strictObject({
  operation_id: OperationIdSchema, state: z.literal("succeeded"), accepted_at: TimestampSchema,
  started_at: TimestampSchema, finished_at: TimestampSchema, completed_steps: z.array(z.string()),
  result: z.record(z.string(), z.unknown()).optional(),
})
export const OperationFailureSchema = z.strictObject({
  operation_id: OperationIdSchema, state: z.enum(["failed", "cancelled"]), accepted_at: TimestampSchema,
  started_at: TimestampSchema.optional(), finished_at: TimestampSchema, completed_steps: z.array(z.string()),
  error: ApiErrorSchema, rollback_attempted: z.boolean(), rollback_succeeded: z.boolean(), rollback_errors: z.array(ApiErrorSchema),
})
export const OperationSchema = z.discriminatedUnion("state", [
  z.strictObject({ operation_id: OperationIdSchema, state: z.literal("accepted"), accepted_at: TimestampSchema }),
  z.strictObject({ operation_id: OperationIdSchema, state: z.literal("running"), accepted_at: TimestampSchema, started_at: TimestampSchema, progress: OperationProgressSchema }),
  OperationResultSchema, OperationFailureSchema,
])
export type Operation = z.infer<typeof OperationSchema>

export const ReplayGapSchema = z.strictObject({ requested: CursorSchema, oldest_available: CursorSchema, newest_available: CursorSchema })
export type ReplayGap = z.infer<typeof ReplayGapSchema>
const EventBase = { protocol: ProtocolVersionSchema, sequence: CursorSchema, timestamp: TimestampSchema }
export const ServiceEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...EventBase, type: z.literal("operation"), operation: OperationSchema }),
  z.strictObject({ ...EventBase, type: z.literal("signal"), signal: z.union([SignalSchema, SignalDismissalSchema]) }),
  z.strictObject({ ...EventBase, type: z.literal("control"), control: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("heartbeat") }),
    z.strictObject({ kind: z.literal("replay_gap"), gap: ReplayGapSchema }),
    z.strictObject({ kind: z.literal("snapshot_invalidated"), revision: RevisionSchema }),
  ]) }),
])
export type ServiceEvent = z.infer<typeof ServiceEventSchema>
