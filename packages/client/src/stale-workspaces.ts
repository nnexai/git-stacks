import {
  WebStaleWorkspaceResponseSchema,
  type WebStaleWorkspaceCaution,
  type WebStaleWorkspaceCautionCode,
  type WebStaleWorkspaceConfirmedReason,
  type WebStaleWorkspaceConfirmedReasonCode,
  type WebStaleWorkspaceResponse,
  type WebStaleWorkspaceUnknownEvidence,
  type WebStaleWorkspaceUnknownEvidenceCode,
} from "@git-stacks/protocol"

import { relativeTime } from "./presentation.js"
import { createWorkspaceActionRegistry } from "./workspace-actions.js"

export type StaleWorkspacePresentedTime = Readonly<{
  iso: string
  exactUtc: string
  relative: string
}>

export type StaleWorkspacePresentedEvidence = Readonly<{
  code: string
  label: string
  time?: StaleWorkspacePresentedTime
  repositoryName?: string
}>

export type PresentedStaleWorkspaceRow = Readonly<{
  workspaceId: string
  workspaceName: string
  activity?: StaleWorkspacePresentedTime
  confirmedReasons: readonly StaleWorkspacePresentedEvidence[]
  unknownEvidence: readonly StaleWorkspacePresentedEvidence[]
  cautions: readonly StaleWorkspacePresentedEvidence[]
}>

export type StaleWorkspacePresentation = Readonly<{
  revision: string
  checkedAt: StaleWorkspacePresentedTime
  candidateCount: number
  candidateCountLabel: string
  incompleteCount: number
  incompleteCountLabel: string
  candidates: readonly PresentedStaleWorkspaceRow[]
  incomplete: readonly PresentedStaleWorkspaceRow[]
}>

export const STALE_WORKSPACE_INCOMPLETE_ACTIONS_EXPLANATION =
  "Cleanup actions require at least one confirmed stale reason."

const confirmedReasonOrder: Record<WebStaleWorkspaceConfirmedReasonCode, number> = {
  merged: 0,
  closed: 1,
  remote_branch_deleted: 2,
  managed_worktree_missing: 3,
  inactive: 4,
}

const confirmedReasonLabels: Record<
  WebStaleWorkspaceConfirmedReasonCode,
  (reason: WebStaleWorkspaceConfirmedReason, thresholdDays: number) => string
> = {
  merged: (reason) => `${reason.provider === "github" ? "Pull request" : "Merge request"} merged`,
  closed: (reason) => `${reason.provider === "github" ? "Pull request" : "Merge request"} closed`,
  remote_branch_deleted: (reason) => `Remote branch missing in ${reason.repository_name}`,
  managed_worktree_missing: (reason) => `Managed worktree missing in ${reason.repository_name}`,
  inactive: (_reason, thresholdDays) => `Inactive for ${thresholdDays} days`,
}

const unknownEvidenceLabels: Record<
  WebStaleWorkspaceUnknownEvidenceCode,
  (evidence: WebStaleWorkspaceUnknownEvidence) => string
> = {
  invalid_provenance: () => "Change status unknown — source metadata is invalid.",
  unsupported_provider: () => "Change status unknown — provider is unsupported.",
  unsupported_host: () => "Change status unknown — host is unsupported.",
  tool_unavailable: () => "Change status unknown — provider tool unavailable.",
  authentication_required: () => "Change status unknown — authentication required.",
  rate_limited: () => "Change status unknown — provider rate limit reached.",
  request_timeout: () => "Change status unknown — request timed out.",
  request_aborted: () => "Change status unknown — request was cancelled.",
  provider_unavailable: () => "Change status unknown — provider unavailable.",
  malformed_response: () => "Change status unknown — provider response was invalid.",
  output_limit_exceeded: () => "Change status unknown — provider response exceeded the allowed size.",
  remote_check_failed: (evidence) =>
    `Remote branch status unknown for ${evidence.repository_name} — service unavailable.`,
  worktree_inaccessible: (evidence) =>
    `Managed worktree status unknown for ${evidence.repository_name} — service unavailable.`,
  activity_unavailable: () => "Last activity is unavailable.",
  probe_superseded: (evidence) =>
    `Evidence status unknown for ${evidence.repository_name} — a newer refresh superseded this check.`,
}

export const STALE_WORKSPACE_CAUTION_LABELS: Readonly<Record<WebStaleWorkspaceCautionCode, string>> =
  Object.freeze({
    dirty_worktree: "Uncommitted work is present.",
    ahead_of_remote: "Local commits are ahead of the tracked branch.",
    workspace_drift: "Workspace file drift needs attention.",
    notes_present: "Workspace notes are present.",
  })

export function formatStaleWorkspaceTime(timestamp: string, now = Date.now()): StaleWorkspacePresentedTime {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.valueOf())) throw new TypeError("Stale workspace timestamp must be valid")
  const iso = date.toISOString()
  return Object.freeze({
    iso,
    exactUtc: iso.replace("T", " ").replace(/\.\d{3}Z$/u, " UTC"),
    relative: relativeTime(iso, now),
  })
}

export function staleWorkspaceCandidateCountLabel(count: number): string {
  return `${count} cleanup ${count === 1 ? "candidate" : "candidates"}`
}

export function staleWorkspaceIncompleteCountLabel(count: number): string {
  return `${count} incomplete ${count === 1 ? "evaluation" : "evaluations"}`
}

export function staleWorkspaceIncompleteActionsExplanation(): string {
  return STALE_WORKSPACE_INCOMPLETE_ACTIONS_EXPLANATION
}

function presentedConfirmedReason(
  reason: WebStaleWorkspaceConfirmedReason,
  thresholdDays: number,
  now: number,
): StaleWorkspacePresentedEvidence {
  return Object.freeze({
    code: reason.code,
    label: confirmedReasonLabels[reason.code](reason, thresholdDays),
    time: formatStaleWorkspaceTime(reason.occurred_at, now),
    ...(reason.repository_name === undefined ? {} : { repositoryName: reason.repository_name }),
  })
}

function presentedUnknownEvidence(
  evidence: WebStaleWorkspaceUnknownEvidence,
  now: number,
): StaleWorkspacePresentedEvidence {
  return Object.freeze({
    code: evidence.code,
    label: unknownEvidenceLabels[evidence.code](evidence),
    time: formatStaleWorkspaceTime(evidence.observed_at, now),
    ...(evidence.repository_name === undefined ? {} : { repositoryName: evidence.repository_name }),
  })
}

function presentedCaution(caution: WebStaleWorkspaceCaution): StaleWorkspacePresentedEvidence {
  return Object.freeze({
    code: caution.code,
    label: STALE_WORKSPACE_CAUTION_LABELS[caution.code],
    ...(caution.repository_name === undefined ? {} : { repositoryName: caution.repository_name }),
  })
}

function presentCandidateRow(
  row: WebStaleWorkspaceResponse["candidates"][number],
  thresholdDays: number,
  now: number,
): PresentedStaleWorkspaceRow {
  const confirmedReasons = row.confirmed_reasons
    .map((reason, index) => ({ reason, index }))
    .sort((left, right) => confirmedReasonOrder[left.reason.code] - confirmedReasonOrder[right.reason.code]
      || left.index - right.index)
    .map(({ reason }) => presentedConfirmedReason(reason, thresholdDays, now))

  return Object.freeze({
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    ...(row.activity_at === null ? {} : { activity: formatStaleWorkspaceTime(row.activity_at, now) }),
    confirmedReasons: Object.freeze(confirmedReasons),
    unknownEvidence: Object.freeze(row.unknown_evidence.map((evidence) => presentedUnknownEvidence(evidence, now))),
    cautions: Object.freeze(row.cautions.map(presentedCaution)),
  })
}

function presentIncompleteRow(
  row: WebStaleWorkspaceResponse["incomplete"][number],
  now: number,
): PresentedStaleWorkspaceRow {
  return Object.freeze({
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    ...(row.activity_at === null ? {} : { activity: formatStaleWorkspaceTime(row.activity_at, now) }),
    confirmedReasons: Object.freeze([]),
    unknownEvidence: Object.freeze(row.unknown_evidence.map((evidence) => presentedUnknownEvidence(evidence, now))),
    cautions: Object.freeze(row.cautions.map(presentedCaution)),
  })
}

/**
 * Converts one strict service response into renderer-neutral display data. The
 * candidate and incomplete arrays retain service order; only reasons within a
 * row receive the locked terminal-before-inactivity presentation order.
 */
export function presentStaleWorkspaceResponse(
  response: WebStaleWorkspaceResponse,
  options: { now?: number } = {},
): StaleWorkspacePresentation {
  const parsed = WebStaleWorkspaceResponseSchema.parse(response)
  const now = options.now ?? Date.now()
  const candidates = parsed.candidates.map((row) => presentCandidateRow(row, parsed.threshold_days, now))
  const incomplete = parsed.incomplete.map((row) => presentIncompleteRow(row, now))

  return Object.freeze({
    revision: parsed.revision,
    checkedAt: formatStaleWorkspaceTime(parsed.checked_at, now),
    candidateCount: candidates.length,
    candidateCountLabel: staleWorkspaceCandidateCountLabel(candidates.length),
    incompleteCount: incomplete.length,
    incompleteCountLabel: staleWorkspaceIncompleteCountLabel(incomplete.length),
    candidates: Object.freeze(candidates),
    incomplete: Object.freeze(incomplete),
  })
}

export type StaleWorkspaceResponseToken = Readonly<{
  generation: number
  expectedRevision: string
}>

export type StaleWorkspaceResponseGate = Readonly<{
  begin(expectedRevision: string): StaleWorkspaceResponseToken
  isCurrent(token: StaleWorkspaceResponseToken): boolean
  accepts(token: StaleWorkspaceResponseToken, response: Pick<WebStaleWorkspaceResponse, "revision">): boolean
  invalidate(): void
}>

export function createStaleWorkspaceResponseGate(): StaleWorkspaceResponseGate {
  let generation = 0

  const isCurrent = (token: StaleWorkspaceResponseToken) => token.generation === generation

  return Object.freeze({
    begin(expectedRevision: string) {
      generation += 1
      return Object.freeze({ generation, expectedRevision })
    },
    isCurrent,
    accepts(token, response) {
      return isCurrent(token) && token.expectedRevision === response.revision
    },
    invalidate() {
      generation += 1
    },
  })
}

export type StaleWorkspaceLoadRequest = Readonly<{
  expectedRevision: string
  forceRefresh: boolean
  signal?: AbortSignal
}>

export type StaleWorkspaceLoadResult =
  | Readonly<{ status: "accepted"; response: WebStaleWorkspaceResponse }>
  | Readonly<{ status: "ignored"; reason: "superseded" | "revision-mismatch" }>
  | Readonly<{ status: "failed"; error: unknown }>

export type StaleWorkspaceFetch = (request: {
  expected_revision: string
  force_refresh: boolean
  signal?: AbortSignal
}) => Promise<WebStaleWorkspaceResponse>

export type StaleWorkspaceLoadCoordinator = Readonly<{
  load(request: StaleWorkspaceLoadRequest): Promise<StaleWorkspaceLoadResult>
  invalidate(): void
}>

export function isStaleWorkspaceRevisionConflict(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "conflict"
}

function fetchRequest(request: StaleWorkspaceLoadRequest, expectedRevision: string) {
  return request.signal === undefined
    ? { expected_revision: expectedRevision, force_refresh: request.forceRefresh }
    : { expected_revision: expectedRevision, force_refresh: request.forceRefresh, signal: request.signal }
}

export function createStaleWorkspaceLoadCoordinator(options: {
  fetch: StaleWorkspaceFetch
  reloadAuthoritative(): Promise<string>
}): StaleWorkspaceLoadCoordinator {
  const gate = createStaleWorkspaceResponseGate()

  const ignoredResult = (
    token: StaleWorkspaceResponseToken,
    response?: Pick<WebStaleWorkspaceResponse, "revision">,
  ): StaleWorkspaceLoadResult => ({
    status: "ignored",
    reason: !gate.isCurrent(token) || response === undefined ? "superseded" : "revision-mismatch",
  })

  const load = async (request: StaleWorkspaceLoadRequest): Promise<StaleWorkspaceLoadResult> => {
    const initialToken = gate.begin(request.expectedRevision)
    try {
      const response = await options.fetch(fetchRequest(request, request.expectedRevision))
      return gate.accepts(initialToken, response)
        ? { status: "accepted", response }
        : ignoredResult(initialToken, response)
    } catch (error) {
      if (!gate.isCurrent(initialToken)) return ignoredResult(initialToken)
      if (!isStaleWorkspaceRevisionConflict(error)) return { status: "failed", error }
    }

    let authoritativeRevision: string
    try {
      authoritativeRevision = await options.reloadAuthoritative()
    } catch (error) {
      return gate.isCurrent(initialToken)
        ? { status: "failed", error }
        : ignoredResult(initialToken)
    }
    if (!gate.isCurrent(initialToken)) return ignoredResult(initialToken)

    const retryToken = gate.begin(authoritativeRevision)
    try {
      const response = await options.fetch(fetchRequest(request, authoritativeRevision))
      return gate.accepts(retryToken, response)
        ? { status: "accepted", response }
        : ignoredResult(retryToken, response)
    } catch (error) {
      return gate.isCurrent(retryToken)
        ? { status: "failed", error }
        : ignoredResult(retryToken)
    }
  }

  return Object.freeze({
    load,
    invalidate: () => gate.invalidate(),
  })
}

/**
 * Stale renderers receive authoritative descriptors and delegate invocation to
 * the existing synchronous-latch registry; this wrapper adds no descriptors,
 * labels, confirmations, or retry policy of its own.
 */
export function createStaleWorkspaceActionRegistry(
  ...args: Parameters<typeof createWorkspaceActionRegistry>
): ReturnType<typeof createWorkspaceActionRegistry> {
  return createWorkspaceActionRegistry(...args)
}
