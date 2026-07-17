import {
  mapLimited as defaultMapLimited,
  type LimiterResult,
} from "@git-stacks/core/concurrency"
import {
  lookupForgeChangeStatus as defaultLookupForgeChangeStatus,
} from "@git-stacks/core/integrations/forge-change-status"
import {
  observeRemoteBranchStatus as defaultObserveRemoteBranchStatus,
} from "@git-stacks/core/integrations/remote-branch-status"
import type { WebStaleWorkspaceResponse } from "@git-stacks/protocol"

import {
  classifyStaleWorkspaces,
  type StaleForgeStatus,
  type StalePolicyRepository,
  type StalePolicyWorkspace,
  type StalePolicyWorkspaceInput,
  type StaleRemoteBranchObservation,
  type StaleRemoteBranchStatus,
} from "./stale-workspaces.js"

export const STALE_NETWORK_CACHE_TTL_MS = 300_000
export const STALE_NETWORK_CONCURRENCY_LIMIT = 4
export const STALE_NETWORK_TIMEOUT_MS = 15_000
export const STALE_NETWORK_MAX_OUTPUT_BYTES = 256 * 1024

const STALE_NETWORK_MAX_TIMEOUT_MS = 60_000
const STALE_NETWORK_MAX_OUTPUT_LIMIT_BYTES = 1024 * 1024

type ForgeProbeInput = {
  source: unknown
  signal?: AbortSignal
  timeout_ms?: number
  max_output_bytes?: number
}

type RemoteProbeInput = {
  main_path: string
  branch: string
  signal?: AbortSignal
  timeout_ms?: number
  max_output_bytes?: number
}

type BoundedMap = <T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number,
) => Promise<LimiterResult<R>[]>

export type StaleEvaluatorRepository = StalePolicyRepository & Readonly<{
  main_path: string
  branch: string
}>

export type StaleEvaluatorWorkspace = Omit<StalePolicyWorkspace, "repositories"> & Readonly<{
  repositories: readonly StaleEvaluatorRepository[]
}>

export type StaleWorkspaceReadModel = Readonly<{
  revision: string
  workspaces: readonly StaleEvaluatorWorkspace[]
}>

export type StaleWorkspaceEvaluationRequest = Readonly<{
  expected_revision: string
  read_model: StaleWorkspaceReadModel
  force_refresh: boolean
  signal?: AbortSignal
}>

export interface StaleWorkspaceEvaluatorOptions {
  now?: () => number
  lookupForgeChangeStatus?: (input: ForgeProbeInput) => Promise<StaleForgeStatus>
  observeRemoteBranchStatus?: (input: RemoteProbeInput) => Promise<StaleRemoteBranchStatus>
  mapLimited?: BoundedMap
  timeout_ms?: number
  max_output_bytes?: number
}

export interface StaleWorkspaceEvaluator {
  evaluate(request: StaleWorkspaceEvaluationRequest): Promise<WebStaleWorkspaceResponse>
}

export class StaleWorkspaceRevisionMismatchError extends Error {
  readonly code = "revision_mismatch" as const

  constructor() {
    super("Authoritative stale workspace revision is stale")
    this.name = "StaleWorkspaceRevisionMismatchError"
  }
}

type CacheProbeResult<T> =
  | { status: "value"; value: T }
  | { status: "aborted" }
  | { status: "superseded" }

type InFlightProbe<T> = {
  generation: number
  promise: Promise<CacheProbeResult<T>>
}

type CacheEntry<T> = {
  generation: number
  value?: T
  expires_at?: number
  in_flight?: InFlightProbe<T>
}

type ForgeTask = {
  kind: "forge"
  workspace_index: number
  cache_key: string
  source: unknown
}

type RemoteTask = {
  kind: "remote"
  workspace_index: number
  cache_key: string
  repository: StaleEvaluatorRepository
}

type ProbeTask = ForgeTask | RemoteTask

type EvaluatedProbe =
  | { kind: "forge"; workspace_index: number; outcome: StaleForgeStatus }
  | {
      kind: "remote"
      workspace_index: number
      observation: StaleRemoteBranchObservation
    }

function boundedOption(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0
    ? Math.min(value, maximum)
    : fallback
}

function stable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) return value.map((entry) => stable(entry, seen))
  if (!value || typeof value !== "object") return value
  if (seen.has(value)) return "[circular]"
  seen.add(value)
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, stable(nested, seen)]))
}

function forgeCacheKey(source: unknown): string {
  return `forge:${JSON.stringify(stable(source)) ?? String(source)}`
}

function remoteCacheKey(repository: StaleEvaluatorRepository): string {
  return [
    "remote",
    repository.id,
    repository.main_path,
    "origin",
    repository.branch,
  ].join("\0")
}

function observedForgeOutcome(value: unknown, observedAt: string): StaleForgeStatus {
  if (!value || typeof value !== "object") {
    return { status: "unknown", reason: "provider_unavailable", observed_at: observedAt }
  }
  const outcome = value as Record<string, unknown>
  if (
    (outcome.status === "merged" || outcome.status === "closed")
    && typeof outcome.occurred_at === "string"
  ) return { status: outcome.status, occurred_at: outcome.occurred_at }
  if (outcome.status === "open") return { status: "open" }
  if (outcome.status === "unknown") {
    return {
      status: "unknown",
      reason: typeof outcome.reason === "string" ? outcome.reason : "provider_unavailable",
      observed_at: observedAt,
    }
  }
  return { status: "unknown", reason: "provider_unavailable", observed_at: observedAt }
}

function observedRemoteOutcome(value: unknown, observedAt: string): StaleRemoteBranchStatus {
  if (!value || typeof value !== "object") {
    return { status: "unknown", reason: "remote_check_failed", observed_at: observedAt }
  }
  const outcome = value as Record<string, unknown>
  if (outcome.status === "present") return { status: "present" }
  if (outcome.status === "missing") return { status: "missing", observed_at: observedAt }
  return { status: "unknown", reason: "remote_check_failed", observed_at: observedAt }
}

function abortedForge(observedAt: string): StaleForgeStatus {
  return { status: "unknown", reason: "request_aborted", observed_at: observedAt }
}

function supersededForge(observedAt: string): StaleForgeStatus {
  return { status: "unknown", reason: "probe_superseded", observed_at: observedAt }
}

function failedForge(observedAt: string): StaleForgeStatus {
  return { status: "unknown", reason: "provider_unavailable", observed_at: observedAt }
}

function failedRemote(observedAt: string): StaleRemoteBranchStatus {
  return { status: "unknown", reason: "remote_check_failed", observed_at: observedAt }
}

function supersededRemote(observedAt: string): StaleRemoteBranchStatus {
  return { status: "unknown", reason: "probe_superseded", observed_at: observedAt }
}

async function cachedNetworkProbe<T>(input: {
  cache: Map<string, CacheEntry<T>>
  key: string
  checked_at_epoch: number
  force: boolean
  signal?: AbortSignal
  probe: () => Promise<T>
  failure: () => T
}): Promise<CacheProbeResult<T>> {
  if (input.signal?.aborted) return { status: "aborted" }

  let entry = input.cache.get(input.key)
  if (!entry) {
    entry = { generation: 0 }
    input.cache.set(input.key, entry)
  }

  if (!input.force && entry.in_flight) {
    const joined = await entry.in_flight.promise
    return input.signal?.aborted ? { status: "aborted" } : joined
  }
  if (
    !input.force
    && entry.value !== undefined
    && entry.expires_at !== undefined
    && input.checked_at_epoch < entry.expires_at
  ) return { status: "value", value: entry.value }

  const generation = entry.generation + 1
  entry.generation = generation
  const promise = (async (): Promise<CacheProbeResult<T>> => {
    let value: T
    try {
      value = await input.probe()
    } catch {
      value = input.failure()
    }
    if (input.signal?.aborted) return { status: "aborted" }
    if (entry!.generation !== generation) return { status: "superseded" }
    entry!.value = value
    entry!.expires_at = input.checked_at_epoch + STALE_NETWORK_CACHE_TTL_MS
    return { status: "value", value }
  })()
  entry.in_flight = { generation, promise }

  try {
    const result = await promise
    return input.signal?.aborted ? { status: "aborted" } : result
  } finally {
    if (entry.in_flight?.generation === generation) delete entry.in_flight
  }
}

function requestScopedNetworkProbe<T>(input: {
  force: boolean
  flights: Map<string, Promise<CacheProbeResult<T>>>
  key: string
  start: () => Promise<CacheProbeResult<T>>
}): Promise<CacheProbeResult<T>> {
  if (!input.force) return input.start()
  const existing = input.flights.get(input.key)
  if (existing) return existing
  const started = input.start()
  input.flights.set(input.key, started)
  return started
}

function resultForge(
  result: CacheProbeResult<StaleForgeStatus>,
  checkedAt: string,
): StaleForgeStatus {
  if (result.status === "value") return result.value
  return result.status === "aborted" ? abortedForge(checkedAt) : supersededForge(checkedAt)
}

function resultRemote(
  result: CacheProbeResult<StaleRemoteBranchStatus>,
  checkedAt: string,
): StaleRemoteBranchStatus {
  if (result.status === "value") return result.value
  return result.status === "superseded" ? supersededRemote(checkedAt) : failedRemote(checkedAt)
}

function rejectedProbe(task: ProbeTask, checkedAt: string): EvaluatedProbe {
  if (task.kind === "forge") {
    return { kind: "forge", workspace_index: task.workspace_index, outcome: failedForge(checkedAt) }
  }
  return {
    kind: "remote",
    workspace_index: task.workspace_index,
    observation: {
      repository_id: task.repository.id,
      repository_name: task.repository.name,
      outcome: failedRemote(checkedAt),
    },
  }
}

export function createStaleWorkspaceEvaluator(
  options: StaleWorkspaceEvaluatorOptions = {},
): StaleWorkspaceEvaluator {
  const now = options.now ?? Date.now
  const lookupForgeChangeStatus = options.lookupForgeChangeStatus ?? defaultLookupForgeChangeStatus
  const observeRemoteBranchStatus = options.observeRemoteBranchStatus ?? defaultObserveRemoteBranchStatus
  const mapLimited = options.mapLimited ?? defaultMapLimited
  const timeoutMs = boundedOption(options.timeout_ms, STALE_NETWORK_TIMEOUT_MS, STALE_NETWORK_MAX_TIMEOUT_MS)
  const maxOutputBytes = boundedOption(
    options.max_output_bytes,
    STALE_NETWORK_MAX_OUTPUT_BYTES,
    STALE_NETWORK_MAX_OUTPUT_LIMIT_BYTES,
  )
  const forgeCache = new Map<string, CacheEntry<StaleForgeStatus>>()
  const remoteCache = new Map<string, CacheEntry<StaleRemoteBranchStatus>>()

  return Object.freeze({
    async evaluate(request: StaleWorkspaceEvaluationRequest): Promise<WebStaleWorkspaceResponse> {
      if (request.expected_revision !== request.read_model.revision) {
        throw new StaleWorkspaceRevisionMismatchError()
      }

      const checkedAtEpoch = now()
      if (!Number.isFinite(checkedAtEpoch)) throw new TypeError("Stale evaluator clock must be finite")
      const checkedAt = new Date(checkedAtEpoch).toISOString()
      const workspaces = request.read_model.workspaces
      const policyInputs: Array<{
        workspace: StaleEvaluatorWorkspace
        forge_status?: StaleForgeStatus
        remote_branches: StaleRemoteBranchObservation[]
      }> = workspaces.map((workspace) => ({ workspace, remote_branches: [] }))
      const tasks: ProbeTask[] = []
      const forcedForgeFlights = new Map<string, Promise<CacheProbeResult<StaleForgeStatus>>>()
      const forcedRemoteFlights = new Map<string, Promise<CacheProbeResult<StaleRemoteBranchStatus>>>()

      for (const [workspaceIndex, workspace] of workspaces.entries()) {
        if (workspace.source !== undefined) {
          tasks.push({
            kind: "forge",
            workspace_index: workspaceIndex,
            cache_key: forgeCacheKey(workspace.source),
            source: workspace.source,
          })
        }
        for (const repository of workspace.repositories) {
          if (repository.mode === "dir") continue
          tasks.push({
            kind: "remote",
            workspace_index: workspaceIndex,
            cache_key: remoteCacheKey(repository),
            repository,
          })
        }
      }

      const settled = await mapLimited(tasks, async (task): Promise<EvaluatedProbe> => {
        if (task.kind === "forge") {
          const cached = await requestScopedNetworkProbe({
            force: request.force_refresh,
            flights: forcedForgeFlights,
            key: task.cache_key,
            start: () => cachedNetworkProbe({
              cache: forgeCache,
              key: task.cache_key,
              checked_at_epoch: checkedAtEpoch,
              force: request.force_refresh,
              signal: request.signal,
              probe: async () => observedForgeOutcome(await lookupForgeChangeStatus({
                source: task.source,
                signal: request.signal,
                timeout_ms: timeoutMs,
                max_output_bytes: maxOutputBytes,
              }), checkedAt),
              failure: () => failedForge(checkedAt),
            }),
          })
          return {
            kind: "forge",
            workspace_index: task.workspace_index,
            outcome: resultForge(cached, checkedAt),
          }
        }

        const cached = await requestScopedNetworkProbe({
          force: request.force_refresh,
          flights: forcedRemoteFlights,
          key: task.cache_key,
          start: () => cachedNetworkProbe({
            cache: remoteCache,
            key: task.cache_key,
            checked_at_epoch: checkedAtEpoch,
            force: request.force_refresh,
            signal: request.signal,
            probe: async () => observedRemoteOutcome(await observeRemoteBranchStatus({
              main_path: task.repository.main_path,
              branch: task.repository.branch,
              signal: request.signal,
              timeout_ms: timeoutMs,
              max_output_bytes: maxOutputBytes,
            }), checkedAt),
            failure: () => failedRemote(checkedAt),
          }),
        })
        return {
          kind: "remote",
          workspace_index: task.workspace_index,
          observation: {
            repository_id: task.repository.id,
            repository_name: task.repository.name,
            outcome: resultRemote(cached, checkedAt),
          },
        }
      }, STALE_NETWORK_CONCURRENCY_LIMIT)

      for (const [index, result] of settled.entries()) {
        const evaluated = result.status === "fulfilled"
          ? result.value
          : rejectedProbe(tasks[index]!, checkedAt)
        const policyInput = policyInputs[evaluated.workspace_index]
        if (!policyInput) continue
        if (evaluated.kind === "forge") policyInput.forge_status = evaluated.outcome
        else policyInput.remote_branches.push(evaluated.observation)
      }

      return classifyStaleWorkspaces({
        revision: request.read_model.revision,
        checked_at: checkedAt,
        workspaces: policyInputs as StalePolicyWorkspaceInput[],
      })
    },
  })
}
