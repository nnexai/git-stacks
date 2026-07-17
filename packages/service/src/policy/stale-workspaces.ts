import {
  TimestampSchema,
  WEB_STALE_WORKSPACE_LIMITS,
  WebStaleWorkspaceResponseSchema,
  type WebStaleWorkspaceCandidate,
  type WebStaleWorkspaceCaution,
  type WebStaleWorkspaceConfirmedReason,
  type WebStaleWorkspaceIncomplete,
  type WebStaleWorkspaceResponse,
  type WebStaleWorkspaceUnknownEvidence,
  type WebStaleWorkspaceUnknownEvidenceCode,
} from "@git-stacks/protocol"

import { workspaceActivityAt } from "./snapshot.js"

export const STALE_WORKSPACE_THRESHOLD_DAYS = 30 as const
const STALE_WORKSPACE_THRESHOLD_MS = STALE_WORKSPACE_THRESHOLD_DAYS * 24 * 60 * 60 * 1_000

const CONFIRMED_REASON_ORDER = [
  "merged",
  "closed",
  "remote_branch_deleted",
  "managed_worktree_missing",
  "inactive",
] as const

const UNKNOWN_EVIDENCE_ORDER: readonly WebStaleWorkspaceUnknownEvidenceCode[] = [
  "invalid_provenance",
  "unsupported_provider",
  "unsupported_host",
  "tool_unavailable",
  "authentication_required",
  "rate_limited",
  "request_timeout",
  "request_aborted",
  "provider_unavailable",
  "malformed_response",
  "output_limit_exceeded",
  "remote_check_failed",
  "worktree_inaccessible",
  "activity_unavailable",
  "probe_superseded",
]

const CAUTION_ORDER = [
  "dirty_worktree",
  "ahead_of_remote",
  "workspace_drift",
  "notes_present",
] as const

const PROVIDER_SCOPED_UNKNOWN_CODES = new Set<WebStaleWorkspaceUnknownEvidenceCode>([
  "unsupported_host",
  "tool_unavailable",
  "authentication_required",
  "rate_limited",
  "request_timeout",
  "request_aborted",
  "provider_unavailable",
  "malformed_response",
  "output_limit_exceeded",
])

const UNSCOPED_PROVIDER_UNKNOWN_CODES = new Set<WebStaleWorkspaceUnknownEvidenceCode>([
  "invalid_provenance",
  "unsupported_provider",
])

const KNOWN_UNKNOWN_CODES = new Set<WebStaleWorkspaceUnknownEvidenceCode>(UNKNOWN_EVIDENCE_ORDER)

type StaleProvider = "github" | "gitlab"

export type StaleForgeStatus =
  | { status: "merged"; occurred_at: string }
  | { status: "closed"; occurred_at: string }
  | { status: "open" }
  | { status: "unknown"; reason: string; observed_at?: string }

export type StaleRemoteBranchStatus =
  | { status: "present" }
  | { status: "missing"; observed_at?: string }
  | { status: "unknown"; reason: string; observed_at?: string }

export type StalePolicyRepository = Readonly<{
  id: string
  name: string
  mode: "worktree" | "trunk" | "dir"
  exists: boolean
  degraded: boolean
  dirty: boolean
  ahead: number
  drifted: boolean
}>

export type StalePolicyWorkspace = Readonly<{
  id: string
  name: string
  created: string
  last_opened?: string
  source?: unknown
  notes_count: number
  repositories: readonly StalePolicyRepository[]
}>

export type StaleRemoteBranchObservation = Readonly<{
  repository_id: string
  repository_name: string
  outcome: StaleRemoteBranchStatus
}>

export type StalePolicyWorkspaceInput = Readonly<{
  workspace: StalePolicyWorkspace
  forge_status?: StaleForgeStatus
  remote_branches?: readonly StaleRemoteBranchObservation[]
}>

export type ClassifyStaleWorkspacesInput = Readonly<{
  revision: string
  checked_at: string
  workspaces: readonly StalePolicyWorkspaceInput[]
}>

type ProviderContext = {
  provider: StaleProvider
  repository: StalePolicyRepository
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizeWorkspaceName(name: string): string {
  return name.normalize("NFKC").trim().toLocaleLowerCase("en-US")
}

function repositoryOrder(
  left: { repository_name?: string; repository_id?: string },
  right: { repository_name?: string; repository_id?: string },
): number {
  const leftName = left.repository_name === undefined ? "" : normalizeWorkspaceName(left.repository_name)
  const rightName = right.repository_name === undefined ? "" : normalizeWorkspaceName(right.repository_name)
  return compareText(leftName, rightName)
    || compareText(left.repository_id ?? "", right.repository_id ?? "")
}

function confirmedReasonRank(reason: WebStaleWorkspaceConfirmedReason): number {
  return CONFIRMED_REASON_ORDER.indexOf(reason.code)
}

function sortConfirmedReasons(
  reasons: readonly WebStaleWorkspaceConfirmedReason[],
): WebStaleWorkspaceConfirmedReason[] {
  return [...reasons].sort((left, right) => (
    confirmedReasonRank(left) - confirmedReasonRank(right)
    || repositoryOrder(left, right)
    || compareText(left.occurred_at, right.occurred_at)
  ))
}

function sortUnknownEvidence(
  evidence: readonly WebStaleWorkspaceUnknownEvidence[],
): WebStaleWorkspaceUnknownEvidence[] {
  return [...evidence].sort((left, right) => (
    UNKNOWN_EVIDENCE_ORDER.indexOf(left.code) - UNKNOWN_EVIDENCE_ORDER.indexOf(right.code)
    || repositoryOrder(left, right)
    || compareText(left.observed_at, right.observed_at)
  ))
}

function sortCautions(cautions: readonly WebStaleWorkspaceCaution[]): WebStaleWorkspaceCaution[] {
  return [...cautions].sort((left, right) => (
    CAUTION_ORDER.indexOf(left.code) - CAUTION_ORDER.indexOf(right.code)
    || repositoryOrder(left, right)
    || (left.count ?? 0) - (right.count ?? 0)
  ))
}

function deduplicate<T>(values: readonly T[], key: (value: T) => string): T[] {
  const unique = new Map<string, T>()
  for (const value of values) {
    const identity = key(value)
    if (!unique.has(identity)) unique.set(identity, value)
  }
  return [...unique.values()]
}

function reasonIdentity(reason: WebStaleWorkspaceConfirmedReason): string {
  return `${reason.code}\0${reason.repository_id ?? ""}`
}

function unknownIdentity(evidence: WebStaleWorkspaceUnknownEvidence): string {
  return `${evidence.code}\0${evidence.repository_id ?? ""}`
}

function cautionIdentity(caution: WebStaleWorkspaceCaution): string {
  return `${caution.code}\0${caution.repository_id ?? ""}`
}

function providerContext(workspace: StalePolicyWorkspace): ProviderContext | undefined {
  const source = workspace.source
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined
  const value = source as Record<string, unknown>
  if (value.kind !== "forge") return undefined
  if (value.forge !== "github" && value.forge !== "gitlab") return undefined
  if (typeof value.repo !== "string") return undefined
  const repository = workspace.repositories.find((candidate) => candidate.name === value.repo)
  return repository ? { provider: value.forge, repository } : undefined
}

function validTimestamp(value: string): boolean {
  return TimestampSchema.safeParse(value).success
}

function providerUnknown(
  rawReason: string,
  observedAt: string,
  context: ProviderContext | undefined,
): WebStaleWorkspaceUnknownEvidence {
  const reason = KNOWN_UNKNOWN_CODES.has(rawReason as WebStaleWorkspaceUnknownEvidenceCode)
    ? rawReason as WebStaleWorkspaceUnknownEvidenceCode
    : "provider_unavailable"

  if (UNSCOPED_PROVIDER_UNKNOWN_CODES.has(reason)) {
    return { code: reason as "invalid_provenance" | "unsupported_provider", observed_at: observedAt }
  }
  if (reason === "probe_superseded" && context) {
    return {
      code: "probe_superseded",
      observed_at: observedAt,
      repository_id: context.repository.id,
      repository_name: context.repository.name,
    }
  }
  if (PROVIDER_SCOPED_UNKNOWN_CODES.has(reason) && context) {
    return {
      code: reason as Exclude<WebStaleWorkspaceUnknownEvidenceCode,
        "invalid_provenance" | "unsupported_provider" | "remote_check_failed" |
        "worktree_inaccessible" | "activity_unavailable" | "probe_superseded">,
      observed_at: observedAt,
      repository_id: context.repository.id,
      repository_name: context.repository.name,
      provider: context.provider,
    }
  }
  return { code: "invalid_provenance", observed_at: observedAt }
}

function collectProviderEvidence(
  input: StalePolicyWorkspaceInput,
  checkedAt: string,
  confirmed: WebStaleWorkspaceConfirmedReason[],
  unknown: WebStaleWorkspaceUnknownEvidence[],
): void {
  const status = input.forge_status
  if (!status) return
  const context = providerContext(input.workspace)

  if (status.status === "open") return
  if (status.status === "unknown") {
    unknown.push(providerUnknown(status.reason, status.observed_at ?? checkedAt, context))
    return
  }
  if (!context) {
    unknown.push({ code: "invalid_provenance", observed_at: checkedAt })
    return
  }
  if (!validTimestamp(status.occurred_at)) {
    unknown.push(providerUnknown("malformed_response", checkedAt, context))
    return
  }
  confirmed.push({
    code: status.status,
    occurred_at: status.occurred_at,
    repository_id: context.repository.id,
    repository_name: context.repository.name,
    provider: context.provider,
  })
}

function collectRemoteEvidence(
  input: StalePolicyWorkspaceInput,
  checkedAt: string,
  confirmed: WebStaleWorkspaceConfirmedReason[],
  unknown: WebStaleWorkspaceUnknownEvidence[],
): void {
  for (const observation of input.remote_branches ?? []) {
    const repository = input.workspace.repositories.find((candidate) => (
      candidate.id === observation.repository_id
      && candidate.name === observation.repository_name
    ))
    if (!repository) continue
    if (observation.outcome.status === "missing") {
      confirmed.push({
        code: "remote_branch_deleted",
        occurred_at: observation.outcome.observed_at ?? checkedAt,
        repository_id: repository.id,
        repository_name: repository.name,
      })
    } else if (observation.outcome.status === "unknown") {
      unknown.push({
        code: observation.outcome.reason === "probe_superseded"
          ? "probe_superseded"
          : "remote_check_failed",
        observed_at: observation.outcome.observed_at ?? checkedAt,
        repository_id: repository.id,
        repository_name: repository.name,
      })
    }
  }
}

function collectLocalRepositoryEvidence(
  workspace: StalePolicyWorkspace,
  checkedAt: string,
  confirmed: WebStaleWorkspaceConfirmedReason[],
  unknown: WebStaleWorkspaceUnknownEvidence[],
  cautions: WebStaleWorkspaceCaution[],
): void {
  for (const repository of workspace.repositories) {
    if (repository.mode === "worktree") {
      if (repository.degraded) {
        unknown.push({
          code: "worktree_inaccessible",
          observed_at: checkedAt,
          repository_id: repository.id,
          repository_name: repository.name,
        })
      } else if (!repository.exists) {
        confirmed.push({
          code: "managed_worktree_missing",
          occurred_at: checkedAt,
          repository_id: repository.id,
          repository_name: repository.name,
        })
      }
    }
    if (repository.dirty) {
      cautions.push({
        code: "dirty_worktree",
        repository_id: repository.id,
        repository_name: repository.name,
      })
    }
    if (Number.isSafeInteger(repository.ahead) && repository.ahead > 0) {
      cautions.push({
        code: "ahead_of_remote",
        repository_id: repository.id,
        repository_name: repository.name,
        count: Math.min(repository.ahead, WEB_STALE_WORKSPACE_LIMITS.count),
      })
    }
    if (repository.drifted) {
      cautions.push({
        code: "workspace_drift",
        repository_id: repository.id,
        repository_name: repository.name,
      })
    }
  }
  if (Number.isSafeInteger(workspace.notes_count) && workspace.notes_count > 0) {
    cautions.push({
      code: "notes_present",
      count: Math.min(workspace.notes_count, WEB_STALE_WORKSPACE_LIMITS.count),
    })
  }
}

function activityEvidence(
  workspace: StalePolicyWorkspace,
  checkedAt: string,
  checkedAtEpoch: number,
  confirmed: WebStaleWorkspaceConfirmedReason[],
  unknown: WebStaleWorkspaceUnknownEvidence[],
): string | null {
  const activityAt = workspaceActivityAt(workspace)
  const activityEpoch = Date.parse(activityAt)
  if (!validTimestamp(activityAt) || !Number.isFinite(activityEpoch)) {
    unknown.push({ code: "activity_unavailable", observed_at: checkedAt })
    return null
  }
  if (activityEpoch < checkedAtEpoch - STALE_WORKSPACE_THRESHOLD_MS) {
    confirmed.push({ code: "inactive", occurred_at: activityAt })
  }
  return activityAt
}

function compareActivity(left: string | null, right: string | null): number {
  const leftEpoch = left === null ? Number.NaN : Date.parse(left)
  const rightEpoch = right === null ? Number.NaN : Date.parse(right)
  const leftValid = Number.isFinite(leftEpoch)
  const rightValid = Number.isFinite(rightEpoch)
  if (leftValid !== rightValid) return leftValid ? -1 : 1
  return leftValid && rightValid ? leftEpoch - rightEpoch : 0
}

function strongestReason(candidate: WebStaleWorkspaceCandidate): number {
  return Math.min(...candidate.confirmed_reasons.map(confirmedReasonRank))
}

function inactivityOnly(candidate: WebStaleWorkspaceCandidate): boolean {
  return candidate.confirmed_reasons.every(({ code }) => code === "inactive")
}

export function rankStaleWorkspaceCandidates(
  candidates: readonly WebStaleWorkspaceCandidate[],
): WebStaleWorkspaceCandidate[] {
  return [...candidates].sort((left, right) => (
    right.confirmed_reasons.length - left.confirmed_reasons.length
    || strongestReason(left) - strongestReason(right)
    || Number(inactivityOnly(left)) - Number(inactivityOnly(right))
    || compareActivity(left.activity_at, right.activity_at)
    || compareText(normalizeWorkspaceName(left.workspace_name), normalizeWorkspaceName(right.workspace_name))
    || compareText(left.workspace_id, right.workspace_id)
  ))
}

function rankIncompleteRows(rows: readonly WebStaleWorkspaceIncomplete[]): WebStaleWorkspaceIncomplete[] {
  return [...rows].sort((left, right) => (
    compareActivity(left.activity_at, right.activity_at)
    || compareText(normalizeWorkspaceName(left.workspace_name), normalizeWorkspaceName(right.workspace_name))
    || compareText(left.workspace_id, right.workspace_id)
  ))
}

export function classifyStaleWorkspaces(
  input: ClassifyStaleWorkspacesInput,
): WebStaleWorkspaceResponse {
  const checkedAtEpoch = Date.parse(input.checked_at)
  if (!validTimestamp(input.checked_at) || !Number.isFinite(checkedAtEpoch)) {
    throw new TypeError("checked_at must be a valid timestamp")
  }

  const candidates: WebStaleWorkspaceCandidate[] = []
  const incomplete: WebStaleWorkspaceIncomplete[] = []

  for (const workspaceInput of input.workspaces) {
    const confirmed: WebStaleWorkspaceConfirmedReason[] = []
    const unknown: WebStaleWorkspaceUnknownEvidence[] = []
    const cautions: WebStaleWorkspaceCaution[] = []

    collectProviderEvidence(workspaceInput, input.checked_at, confirmed, unknown)
    collectRemoteEvidence(workspaceInput, input.checked_at, confirmed, unknown)
    collectLocalRepositoryEvidence(workspaceInput.workspace, input.checked_at, confirmed, unknown, cautions)
    const activityAt = activityEvidence(
      workspaceInput.workspace,
      input.checked_at,
      checkedAtEpoch,
      confirmed,
      unknown,
    )

    const confirmedReasons = sortConfirmedReasons(deduplicate(confirmed, reasonIdentity))
    const unknownEvidence = sortUnknownEvidence(deduplicate(unknown, unknownIdentity))
    const normalizedCautions = sortCautions(deduplicate(cautions, cautionIdentity))
    const identity = {
      workspace_id: workspaceInput.workspace.id,
      workspace_name: workspaceInput.workspace.name,
      activity_at: activityAt,
    }

    if (confirmedReasons.length > 0) {
      candidates.push({
        ...identity,
        confirmed_reasons: confirmedReasons,
        unknown_evidence: unknownEvidence,
        cautions: normalizedCautions,
      })
    } else if (unknownEvidence.length > 0) {
      incomplete.push({
        ...identity,
        unknown_evidence: unknownEvidence,
        cautions: normalizedCautions,
      })
    }
  }

  return WebStaleWorkspaceResponseSchema.parse({
    revision: input.revision,
    checked_at: input.checked_at,
    threshold_days: STALE_WORKSPACE_THRESHOLD_DAYS,
    candidates: rankStaleWorkspaceCandidates(candidates),
    incomplete: rankIncompleteRows(incomplete),
  })
}
