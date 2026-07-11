import { z } from "zod"

export const ProtocolVersionSchema = z.literal("v1")
export type ProtocolVersion = z.infer<typeof ProtocolVersionSchema>
export const RequestIdSchema = z.string().regex(/^req_[A-Za-z0-9_-]{16,}$/)
export type RequestId = z.infer<typeof RequestIdSchema>
export const EntityIdSchema = z.string().uuid()
export type EntityId = z.infer<typeof EntityIdSchema>
export const OperationIdSchema = z.string().regex(/^op_[A-Za-z0-9_-]{16,}$/)
export type OperationId = z.infer<typeof OperationIdSchema>
export const CursorSchema = z.string().regex(/^(0|[1-9][0-9]*)$/)
export type Cursor = z.infer<typeof CursorSchema>
export const RevisionSchema = CursorSchema
export type Revision = z.infer<typeof RevisionSchema>
export const TimestampSchema = z.string().datetime({ offset: true })

export const ErrorCodeSchema = z.enum([
  "invalid_request", "unauthorized", "not_found", "conflict", "rate_limited",
  "capability_unavailable", "replay_gap", "internal_error", "operation_failed",
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
})
export type Capabilities = z.infer<typeof CapabilitiesSchema>
export const ServiceLimitsSchema = z.strictObject({
  request_body_bytes: z.number().int().positive(),
  subscriber_events: z.number().int().positive(),
  subscriber_bytes: z.number().int().positive(),
})
export type ServiceLimits = z.infer<typeof ServiceLimitsSchema>
export const DiscoverySchema = z.strictObject({ service_version: z.string().min(1), capabilities: CapabilitiesSchema, limits: ServiceLimitsSchema })
export const DiscoveryResponseSchema = successEnvelope(DiscoverySchema)
export type DiscoveryResponse = z.infer<typeof DiscoveryResponseSchema>

export const RepositorySnapshotSchema = z.strictObject({
  id: EntityIdSchema, name: z.string().min(1), mode: z.enum(["worktree", "trunk", "dir"]), path: z.string().min(1),
})
export type RepositorySnapshot = z.infer<typeof RepositorySnapshotSchema>
export const LaunchSpecificationSchema = z.strictObject({
  commands: z.array(z.string()),
  environment: z.record(z.string(), z.string()),
  redacted: z.array(z.string()),
  references: z.record(z.string(), z.string()),
})
export type LaunchSpecification = z.infer<typeof LaunchSpecificationSchema>
export const WorkspaceSnapshotSchema = z.strictObject({
  id: EntityIdSchema, name: z.string().min(1), branch: z.string(), repositories: z.array(RepositorySnapshotSchema), launch: LaunchSpecificationSchema,
})
export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>
export const WorkspaceSnapshotResponseSchema = z.strictObject({
  ...EnvelopeBase, ok: z.literal(true), revision: RevisionSchema, generated_at: TimestampSchema, workspace: WorkspaceSnapshotSchema,
})
export type WorkspaceSnapshotResponse = z.infer<typeof WorkspaceSnapshotResponseSchema>

export const OperationStageSchema = z.enum(["accepted", "preparing", "executing", "rolling_back", "completed"])
export const OperationStateSchema = z.enum(["accepted", "running", "succeeded", "failed", "cancelled"])
export const OperationProgressSchema = z.strictObject({
  stage: OperationStageSchema, message: z.string().optional(), completed: z.number().int().nonnegative().optional(), total: z.number().int().positive().optional(),
}).refine((v) => (v.completed === undefined) === (v.total === undefined), { message: "completed and total must be provided together" })
export type OperationProgress = z.infer<typeof OperationProgressSchema>
export const OperationResultSchema = z.strictObject({ operation_id: OperationIdSchema, state: z.literal("succeeded"), completed_steps: z.array(z.string()), result: z.record(z.string(), z.unknown()).optional() })
export const OperationFailureSchema = z.strictObject({ operation_id: OperationIdSchema, state: z.enum(["failed", "cancelled"]), completed_steps: z.array(z.string()), error: ApiErrorSchema, rollback_errors: z.array(ApiErrorSchema) })
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
  z.strictObject({ ...EventBase, type: z.literal("attention"), attention: z.strictObject({ workspace_id: EntityIdSchema, code: z.string().min(1), message: z.string().min(1) }) }),
  z.strictObject({ ...EventBase, type: z.literal("control"), control: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("heartbeat") }),
    z.strictObject({ kind: z.literal("replay_gap"), gap: ReplayGapSchema }),
  ]) }),
])
export type ServiceEvent = z.infer<typeof ServiceEventSchema>
