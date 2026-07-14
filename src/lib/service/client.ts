import { join } from "node:path"
import type { z } from "zod"
import { WS_CONFIG_DIR } from "../paths"
import { readOfficialClientCredential } from "./credentials"
import {
  CoreMutationSchemas,
  CoreStateSchema,
  EditTargetSchema,
  type CoreMutationName,
  type CoreMutationRequest,
  type CoreState,
  type EditTarget,
  type EditTargetRequest,
} from "./core-contract"
import {
  OperationSchema,
  SignalSchema,
  WorkspaceCreationCatalogSchema,
  WorkspaceCreationRequestSchema,
  type Operation,
  type Signal,
  type WorkspaceCreationCatalog,
  type WorkspaceCreationRequest,
  ServiceEventSchema,
  type ServiceEvent,
} from "./contract"
import { ensureManagedServiceProcess } from "../../service/main"
import type { WorkspaceFileStatusView } from "../workspace-file-status"
import type { WorkspaceNoteRecord } from "../notes"

export interface SignalProjectionResponse {
  signals: Signal[]
  dismissed: string[]
  sequence: string
}

export type OperationObserver = (operation: Operation) => void
export type ServiceEventObserver = (event: ServiceEvent) => void

type ServiceAccess = {
  endpoint: string
  headers: Record<string, string>
}

let cachedAccess: ServiceAccess | undefined
let accessRequest: Promise<ServiceAccess> | undefined

async function authenticatedService(): Promise<ServiceAccess> {
  if (cachedAccess) return cachedAccess
  if (!accessRequest) {
    accessRequest = (async () => {
      const descriptor = await ensureManagedServiceProcess()
      const serviceRoot = join(WS_CONFIG_DIR, "service")
      const credential = readOfficialClientCredential(descriptor.credential_lookup, { serviceRoot })
      if (!credential) throw new Error("git-stacks service credential is unavailable")
      return {
        endpoint: descriptor.endpoint,
        headers: { authorization: `Bearer ${credential.token}`, "content-type": "application/json" },
      }
    })().then((access) => {
      cachedAccess = access
      return access
    }).finally(() => { accessRequest = undefined })
  }
  return accessRequest
}

function serviceError(payload: unknown, status: number): Error {
  const envelope = payload as { error?: { code?: string; message?: string } }
  const message = envelope.error?.message ?? `git-stacks service request failed (${status})`
  const error = new Error(message) as Error & { code?: string; status?: number }
  error.code = envelope.error?.code
  error.status = status
  return error
}

async function requestData(path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response | undefined
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const access = await authenticatedService()
    try {
      response = await fetch(new URL(path, access.endpoint), {
        ...init,
        headers: { ...access.headers, ...init.headers },
      })
      break
    } catch (error) {
      cachedAccess = undefined
      if (attempt === 1 || init.signal?.aborted) throw error
    }
  }
  if (!response) throw new Error("git-stacks service request did not produce a response")
  const payload = await response.json() as { ok?: boolean; data?: unknown }
  if (!response.ok || payload.ok !== true) throw serviceError(payload, response.status)
  return payload.data
}

export async function fetchCoreState(signal?: AbortSignal): Promise<CoreState> {
  return CoreStateSchema.parse(await requestData("/v1/core", { signal }))
}

export async function fetchWorkspaceFileStatus(workspace: string, signal?: AbortSignal): Promise<WorkspaceFileStatusView> {
  return await requestData(`/v1/core/workspaces/${encodeURIComponent(workspace)}/files`, { signal }) as WorkspaceFileStatusView
}

export async function fetchWorkspaceNotes(workspace: string, signal?: AbortSignal): Promise<WorkspaceNoteRecord[]> {
  return await requestData(`/v1/core/workspaces/${encodeURIComponent(workspace)}/notes`, { signal }) as WorkspaceNoteRecord[]
}

export async function fetchEditTarget(request: EditTargetRequest, signal?: AbortSignal): Promise<EditTarget> {
  return EditTargetSchema.parse(await requestData("/v1/core/edit-target", {
    method: "POST",
    signal,
    body: JSON.stringify(request),
  }))
}

export async function fetchWorkspaceCreationCatalog(signal?: AbortSignal): Promise<WorkspaceCreationCatalog> {
  return WorkspaceCreationCatalogSchema.parse(await requestData("/v1/workspace-creation/catalog", { signal }))
}

export async function fetchSignalProjection(signal?: AbortSignal): Promise<SignalProjectionResponse> {
  const value = await requestData("/v1/signals", { signal }) as SignalProjectionResponse
  return {
    signals: value.signals.map((item) => SignalSchema.parse(item)),
    dismissed: [...value.dismissed],
    sequence: value.sequence,
  }
}

export async function dismissSignal(signalId: string, signal?: AbortSignal): Promise<void> {
  await requestData("/v1/signals/dismiss", {
    method: "POST",
    signal,
    body: JSON.stringify({ kind: "dismiss_signal", signal_id: signalId }),
  })
}

export async function subscribeServiceEvents(
  cursor: string,
  observer: ServiceEventObserver,
  signal?: AbortSignal,
  onReady?: () => void,
): Promise<string> {
  const access = await authenticatedService()
  let response: Response
  try {
    response = await fetch(new URL(`/v1/events?cursor=${encodeURIComponent(cursor)}`, access.endpoint), { headers: access.headers, signal })
  } catch (error) {
    cachedAccess = undefined
    throw error
  }
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}))
    throw serviceError(payload, response.status)
  }
  onReady?.()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let latest = cursor
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n")
    const frames = buffer.split("\n\n")
    buffer = frames.pop() ?? ""
    for (const frame of frames) {
      const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")
      if (!data) continue
      let decoded: unknown
      try { decoded = JSON.parse(data) } catch { continue }
      const parsed = ServiceEventSchema.safeParse(decoded)
      if (!parsed.success) continue
      latest = parsed.data.sequence
      observer(parsed.data)
    }
  }
  return latest
}

export async function fetchEventCursor(signal?: AbortSignal): Promise<string> {
  const value = await requestData("/v1/events/cursor", { signal }) as { cursor?: unknown }
  if (typeof value.cursor !== "string" || !/^(0|[1-9][0-9]*)$/.test(value.cursor)) throw new Error("Invalid service event cursor")
  return value.cursor
}

async function submit(path: string, request: unknown, signal?: AbortSignal): Promise<Operation> {
  const key = `official-${crypto.randomUUID()}`
  return OperationSchema.parse(await requestData(path, {
    method: "POST",
    signal,
    headers: { "idempotency-key": key },
    body: JSON.stringify(request),
  }))
}

export async function waitForOperation(
  operation: Operation,
  options: { signal?: AbortSignal; onOperation?: OperationObserver; pollMs?: number } = {},
): Promise<Operation> {
  let current = operation
  let fingerprint = ""
  while (true) {
    options.signal?.throwIfAborted()
    const nextFingerprint = JSON.stringify(current)
    if (nextFingerprint !== fingerprint) {
      fingerprint = nextFingerprint
      options.onOperation?.(current)
    }
    if (current.state !== "accepted" && current.state !== "running") return current
    await Bun.sleep(options.pollMs ?? 1_000)
    options.signal?.throwIfAborted()
    current = OperationSchema.parse(await requestData(`/v1/operations/${current.operation_id}`, { signal: options.signal }))
  }
}

async function submitAndStreamOperation(
  submitOperation: (signal?: AbortSignal) => Promise<Operation>,
  options: { signal?: AbortSignal; onOperation?: OperationObserver; pollMs?: number } = {},
): Promise<Operation> {
  const cursor = await fetchEventCursor(options.signal)
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener("abort", abort, { once: true })
  let ready!: () => void
  let rejectReady!: (error: unknown) => void
  const readyPromise = new Promise<void>((resolve, reject) => { ready = resolve; rejectReady = reject })
  let streamReady = false
  let operationId: string | undefined
  const buffered = new Map<string, Operation[]>()
  let latestOperation: Operation | undefined
  let observedFingerprint = ""
  let finish!: (operation: Operation) => void
  const terminal = new Promise<Operation>((resolve) => { finish = resolve })
  const observe = (operation: Operation) => {
    latestOperation = operation
    const fingerprint = JSON.stringify(operation)
    if (fingerprint !== observedFingerprint) {
      observedFingerprint = fingerprint
      options.onOperation?.(operation)
    }
    if (operation.state !== "accepted" && operation.state !== "running") finish(operation)
  }
  const stream = subscribeServiceEvents(cursor, (event) => {
    if (event.type !== "operation") return
    if (event.operation.operation_id === operationId) observe(event.operation)
    else buffered.set(event.operation.operation_id, [...(buffered.get(event.operation.operation_id) ?? []), event.operation])
  }, controller.signal, () => {
    streamReady = true
    ready()
  }).catch((error) => {
    if (!streamReady) rejectReady(error)
    return cursor
  })
  try {
    await readyPromise
    options.signal?.throwIfAborted()
    const accepted = await submitOperation(options.signal)
    operationId = accepted.operation_id
    observe(accepted)
    for (const operation of buffered.get(operationId) ?? []) observe(operation)
    // SSE is the fast path. If the connection closes or is interrupted, resume
    // through the durable operation endpoint instead of leaving the client
    // waiting forever for an event that can no longer arrive.
    const result = await Promise.race([
      terminal,
      stream.then(() => waitForOperation(latestOperation ?? accepted, {
        signal: options.signal,
        onOperation: observe,
        pollMs: options.pollMs,
      })),
    ])
    controller.abort()
    await stream
    return result
  } finally {
    controller.abort()
    options.signal?.removeEventListener("abort", abort)
  }
}

function assertSucceeded(operation: Operation): Operation & { state: "succeeded" } {
  if (operation.state === "succeeded") return operation
  if (operation.state === "failed" || operation.state === "cancelled") throw serviceError({ error: operation.error }, 409)
  throw new Error("Operation did not reach a terminal state")
}

export async function runCoreMutation<Name extends CoreMutationName>(
  name: Name,
  request: CoreMutationRequest<Name>,
  options: { signal?: AbortSignal; onOperation?: OperationObserver; pollMs?: number } = {},
): Promise<Operation & { state: "succeeded" }> {
  const parsed = CoreMutationSchemas[name].parse(request) as z.infer<(typeof CoreMutationSchemas)[Name]>
  return assertSucceeded(await submitAndStreamOperation(
    (signal) => submit(`/v1/operations/${encodeURIComponent(name)}`, parsed, signal),
    options,
  ))
}

export async function createWorkspaceThroughService(
  request: WorkspaceCreationRequest,
  options: { signal?: AbortSignal; onOperation?: OperationObserver; pollMs?: number } = {},
): Promise<Operation & { state: "succeeded" }> {
  const parsed = WorkspaceCreationRequestSchema.parse(request)
  return assertSucceeded(await submitAndStreamOperation(
    (signal) => submit("/v1/operations/workspace.create", parsed, signal),
    options,
  ))
}
