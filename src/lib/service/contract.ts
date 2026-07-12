import { z } from "zod"

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
export const AttentionIdSchema = z.string().regex(/^att_[A-Za-z0-9_-]{16,}$/)
export type AttentionId = z.infer<typeof AttentionIdSchema>
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

export const NativeModelStringByteLimitsSchema = z.strictObject({
  workspace_name: z.literal(96), workspace_label: z.literal(64), repository_name: z.literal(96),
  command_id: z.literal(64), command_name: z.literal(96), surface_command_id: z.literal(64),
  surface_title: z.literal(64), surface_cwd: z.literal(128), attention_id: z.literal(64),
  attention_title: z.literal(160), attention_detail: z.literal(500), attention_occurred_at: z.literal(40),
})
export const NativeModelLimitsSchema = z.strictObject({
  workspaces: z.literal(16), labels_per_workspace: z.literal(16), repositories_per_workspace: z.literal(8),
  authoritative_pairs: z.literal(32), live_pair_identities: z.literal(32), reserved_orphan_tombstones: z.literal(32),
  surfaces_per_pair: z.literal(16), commands: z.literal(64), attention_items: z.literal(64),
  string_bytes: NativeModelStringByteLimitsSchema,
})
export const NATIVE_MODEL_LIMITS = Object.freeze(NativeModelLimitsSchema.parse({
  workspaces: 16, labels_per_workspace: 16, repositories_per_workspace: 8, authoritative_pairs: 32,
  live_pair_identities: 32, reserved_orphan_tombstones: 32, surfaces_per_pair: 16, commands: 64, attention_items: 64,
  string_bytes: { workspace_name: 96, workspace_label: 64, repository_name: 96, command_id: 64, command_name: 96,
    surface_command_id: 64, surface_title: 64, surface_cwd: 128, attention_id: 64, attention_title: 160,
    attention_detail: 500, attention_occurred_at: 40 },
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
  attention_events: CapabilityAvailabilitySchema,
  native_launch_resolution: CapabilityAvailabilitySchema,
  structured_attention: CapabilityAvailabilitySchema,
})
export type Capabilities = z.infer<typeof CapabilitiesSchema>
export const ServiceLimitsSchema = z.strictObject({
  request_body_bytes: z.number().int().positive(),
  subscriber_events: z.number().int().positive(),
  subscriber_bytes: z.number().int().positive(),
  native_model: NativeModelLimitsSchema,
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
  templates: z.array(WorkspaceCreationTemplateSchema), repositories: z.array(WorkspaceCreationRepositorySchema), native_model: NativeModelLimitsSchema,
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
  commands: z.array(z.string()).optional(),
  status: z.array(z.strictObject({
    name: z.string().min(1), exists: z.boolean(), dirty: z.boolean(), branch: z.string(),
    mode: z.enum(["worktree", "trunk", "dir"]), ahead: z.number().int().nonnegative(), behind: z.number().int().nonnegative(),
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

export const NativeLaunchResolutionRequestSchema = z.strictObject({
  workspace_id: EntityIdSchema,
  repository_id: EntityIdSchema,
  command_id: CommandIdSchema.optional(),
  expected_revision: RevisionSchema,
})
export type NativeLaunchResolutionRequest = z.infer<typeof NativeLaunchResolutionRequestSchema>
export const NativeLaunchSpecificationSchema = z.strictObject({
  argv: z.array(z.string()).min(1),
  cwd: z.string().min(1),
  environment: z.record(z.string(), z.string()),
  ports: z.record(z.string(), z.number().int()),
  configuration: z.strictObject({ command_id: CommandIdSchema.optional(), shell: z.boolean() }),
  redacted: z.array(z.string()),
})
export const NativeLaunchResolutionSchema = z.discriminatedUnion("resolved", [
  z.strictObject({ resolved: z.literal(true), revision: RevisionSchema, launch: NativeLaunchSpecificationSchema }),
  z.strictObject({ resolved: z.literal(false), error: ApiErrorSchema }),
])
export type NativeLaunchResolution = z.infer<typeof NativeLaunchResolutionSchema>

export const AttentionStateSchema = z.enum(["working", "waiting", "completed", "failed", "idle"])
export const StructuredAttentionEventSchema = z.strictObject({
  id: AttentionIdSchema,
  state: AttentionStateSchema,
  workspace_id: EntityIdSchema,
  repository_id: EntityIdSchema.optional(),
  surface_id: EntityIdSchema.optional(),
  source: z.enum(["claude", "copilot", "codex", "other"]),
  title: z.string().min(1).max(160),
  detail: z.string().max(500).optional(),
  occurred_at: TimestampSchema,
  journal_sequence: CursorSchema,
}).refine((attention) => attention.surface_id === undefined || attention.repository_id !== undefined, {
  message: "surface-scoped attention requires a repository identity",
})
export type StructuredAttentionEvent = z.infer<typeof StructuredAttentionEventSchema>

export const OperationStageSchema = z.enum(["accepted", "preparing", "executing", "rolling_back", "completed"])
export const OperationStateSchema = z.enum(["accepted", "running", "succeeded", "failed", "cancelled"])
export const OperationProgressSchema = z.strictObject({
  stage: OperationStageSchema, message: z.string().optional(), completed: z.number().int().nonnegative().optional(), total: z.number().int().positive().optional(),
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
  z.strictObject({ ...EventBase, type: z.literal("attention"), attention: z.union([
    z.strictObject({ workspace_id: EntityIdSchema, code: z.string().min(1), message: z.string().min(1) }),
    StructuredAttentionEventSchema,
  ]) }),
  z.strictObject({ ...EventBase, type: z.literal("control"), control: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("heartbeat") }),
    z.strictObject({ kind: z.literal("replay_gap"), gap: ReplayGapSchema }),
    z.strictObject({ kind: z.literal("snapshot_invalidated"), revision: RevisionSchema }),
  ]) }),
])
export type ServiceEvent = z.infer<typeof ServiceEventSchema>
