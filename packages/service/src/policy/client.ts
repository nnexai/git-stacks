import type { z } from "zod"
import { authenticateSecureCarrier, ensureSharedEventSubscription, type SecureRpcClient } from "@git-stacks/client"
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
  DynamicEnvironmentRefreshResultSchema,
  SignalSchema,
  WorkspaceCreationCatalogSchema,
  WorkspaceCreationRequestSchema,
  WorkspaceLifecycleMutationSchema,
  type Operation,
  type Signal,
  type WorkspaceCreationCatalog,
  type WorkspaceCreationRequest,
  type WorkspaceLifecycleMutation,
  type DynamicEnvironmentRefreshResult,
  ServiceEventSchema,
  type ServiceEvent,
  OperationCancelResultSchema,
  WebFileStatusResponseSchema,
  WebForgeResolveRequestSchema,
  WebForgeResolveResponseSchema,
  WebNotesResponseSchema,
  WebOperationMutationSchema,
  WebOperationSchema,
  WebStaleWorkspaceRequestSchema,
  WebStaleWorkspaceResponseSchema,
  WebWorkspaceActionInventorySchema,
  WebWorkspaceMutationSchema,
  type OperationCancelResult,
  type WebFileStatusRequest,
  type WebFileStatusResponse,
  type WebForgeResolveRequest,
  type WebForgeResolveResponse,
  type WebNotesListRequest,
  type WebNotesResponse,
  type WebOperation,
  type WebOperationMutation,
  type WebStaleWorkspaceRequest,
  type WebStaleWorkspaceResponse,
  type WebWorkspaceActionInventory,
} from "@git-stacks/protocol"
import { ensureManagedServiceProcess } from "../main"
import { connectLocalTls } from "../transport/local-tls"
import type { WorkspaceFileStatusView } from "@git-stacks/core/workspace-file-status"
import type { WorkspaceNoteRecord } from "@git-stacks/core/notes"
import type { PairingBundle, PairedHelper, TargetRecord } from "../security/targets"
import type { SecureScope } from "@git-stacks/protocol"
import { projectWebOperation } from "../web/projection"

export interface SignalProjectionResponse {
  signals: Signal[]
  dismissed: string[]
  sequence: string
}

export type OperationObserver = (operation: Operation) => void
export type ServiceEventObserver = (event: ServiceEvent) => void

let cachedAccess: SecureRpcClient | undefined
let accessRequest: Promise<SecureRpcClient> | undefined
let accessGeneration = 0

const OFFICIAL_SCOPES = [
  "snapshot.read", "operation.write", "event.read", "signal.read", "signal.dismiss",
  "terminal.read", "terminal.write", "terminal.create", "terminal.close", "target.select",
] as const

async function authenticateLocalService() {
  const descriptor = await ensureManagedServiceProcess()
  const authenticated = await authenticateSecureCarrier(await connectLocalTls(descriptor.local_tls), {
    mode: "tui",
    targetId: descriptor.service_id,
    listenerEpoch: descriptor.listener_epoch,
    launchToken: descriptor.tui_launch.token,
    requestedScopes: [...OFFICIAL_SCOPES],
    build: "git-stacks-tui/0.21",
  })
  return { rpc: authenticated.rpc, descriptor }
}

async function authenticatedService(): Promise<SecureRpcClient> {
  if (cachedAccess) return cachedAccess
  if (!accessRequest) {
    const requestGeneration = accessGeneration
    const request = (async () => {
      const local = await authenticateLocalService()
      const descriptor = local.descriptor
      const authenticate = async (launchToken: string, targetId: string) => authenticateSecureCarrier(await connectLocalTls(descriptor.local_tls), {
        mode: "tui",
        targetId,
        listenerEpoch: descriptor.listener_epoch,
        launchToken,
        requestedScopes: [...OFFICIAL_SCOPES],
        build: "git-stacks-tui/0.21",
      })
      let authenticated: { rpc: SecureRpcClient } = local
      const requestedTarget = process.env.GIT_STACKS_TARGET_ID
      if (requestedTarget && requestedTarget !== descriptor.service_id) {
        const launch = await authenticated.rpc.request<{ token: string }>("launch.tui", { target_id: requestedTarget }, { scope: "target.select" })
        await authenticated.rpc.close("switching to paired target")
        authenticated = await authenticate(launch.token, requestedTarget)
      }
      void authenticated.rpc.closed.then(() => { if (cachedAccess === authenticated.rpc) cachedAccess = undefined })
      return authenticated.rpc
    })().then(async (access) => {
      if (requestGeneration !== accessGeneration) {
        await access.close("service client closed during authentication")
        throw new Error("Service client authentication was superseded by shutdown")
      }
      cachedAccess = access
      return access
    }).finally(() => {
      if (accessRequest === request) accessRequest = undefined
    })
    accessRequest = request
  }
  return accessRequest
}

async function secureRequest<T>(
  method: string,
  body?: unknown,
  options: { signal?: AbortSignal; scope?: SecureScope; idempotencyKey?: string; retry?: boolean } = {},
): Promise<T> {
  const { retry = true, ...requestOptions } = options
  const requestGeneration = accessGeneration
  const attempts = retry ? 2 : 1
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const rpc = await authenticatedService()
      return await rpc.request<T>(method, body, requestOptions)
    } catch (error) {
      cachedAccess = undefined
      if (requestGeneration !== accessGeneration || attempt === attempts - 1 || options.signal?.aborted) throw error
    }
  }
  throw new Error("git-stacks secure service request did not produce a response")
}

export async function fetchCoreState(signal?: AbortSignal): Promise<CoreState> {
  return CoreStateSchema.parse(await secureRequest("core.state", undefined, { signal, scope: "snapshot.read" }))
}

export async function fetchWorkspaceFileStatus(workspace: string, signal?: AbortSignal): Promise<WorkspaceFileStatusView> {
  return secureRequest("core.workspace.files", { workspace }, { signal, scope: "snapshot.read" })
}

export async function fetchWorkspaceNotes(workspace: string, signal?: AbortSignal): Promise<WorkspaceNoteRecord[]> {
  return secureRequest("core.workspace.notes", { workspace }, { signal, scope: "snapshot.read" })
}

/** Thin-client workspace projection adapters. These routes return the same
 * bounded, path-free DTOs to OpenTUI and browser clients. */
export async function fetchWorkspaceActionInventory(
  request: z.infer<typeof WebWorkspaceMutationSchema>,
  signal?: AbortSignal,
): Promise<WebWorkspaceActionInventory> {
  const parsed = WebWorkspaceMutationSchema.parse(request)
  return WebWorkspaceActionInventorySchema.parse(await secureRequest("workspace.actions", parsed, {
    signal,
    scope: "snapshot.read",
  }))
}

export async function fetchStaleWorkspaceEvaluation(
  request: WebStaleWorkspaceRequest,
  signal?: AbortSignal,
): Promise<WebStaleWorkspaceResponse> {
  const parsed = WebStaleWorkspaceRequestSchema.parse(request)
  return WebStaleWorkspaceResponseSchema.parse(await secureRequest("workspace.stale.evaluate", parsed, {
    signal,
    scope: "snapshot.read",
    retry: false,
  }))
}

export async function fetchWorkspaceNotesProjection(
  request: WebNotesListRequest,
  signal?: AbortSignal,
): Promise<WebNotesResponse> {
  return WebNotesResponseSchema.parse(await secureRequest("workspace.notes.list", request, {
    signal,
    scope: "snapshot.read",
  }))
}

export async function fetchWorkspaceFileStatusProjection(
  request: WebFileStatusRequest,
  signal?: AbortSignal,
): Promise<WebFileStatusResponse> {
  return WebFileStatusResponseSchema.parse(await secureRequest("workspace.files.inspect", request, {
    signal,
    scope: "snapshot.read",
  }))
}

export async function resolveForgeSourceReview(
  request: WebForgeResolveRequest,
  signal?: AbortSignal,
): Promise<WebForgeResolveResponse> {
  const parsed = WebForgeResolveRequestSchema.parse(request)
  return WebForgeResolveResponseSchema.parse(await secureRequest("forge.source.resolve", parsed, {
    signal,
    scope: "operation.write",
    retry: false,
  }))
}

export async function submitWebOperation(
  mutation: WebOperationMutation,
  signal?: AbortSignal,
): Promise<WebOperation> {
  const parsed = WebOperationMutationSchema.parse(mutation)
  return WebOperationSchema.parse(await secureRequest("operation.submit", parsed, {
    signal,
    scope: "operation.write",
    idempotencyKey: `official-${crypto.randomUUID()}`,
    retry: false,
  }))
}

export async function fetchWebOperation(operationId: string, signal?: AbortSignal): Promise<WebOperation> {
  const value = await secureRequest("operation.get", { operation_id: operationId }, {
    signal,
    scope: "snapshot.read",
  })
  const web = WebOperationSchema.safeParse(value)
  return web.success ? web.data : projectWebOperation(OperationSchema.parse(value))
}

export async function cancelWebOperation(operationId: string, signal?: AbortSignal): Promise<OperationCancelResult> {
  return OperationCancelResultSchema.parse(await secureRequest("operation.cancel", { operation_id: operationId }, {
    signal,
    scope: "operation.write",
    retry: false,
  }))
}

export async function setWorkspacePins(
  workspaceIds: readonly string[],
  expectedRevision: string,
  signal?: AbortSignal,
): Promise<{ workspace_ids: string[]; revision: string }> {
  return secureRequest("workspace.pins.set", { workspace_ids: [...workspaceIds], expected_revision: expectedRevision }, {
    signal,
    scope: "operation.write",
    retry: false,
  })
}

export async function fetchEditTarget(request: EditTargetRequest, signal?: AbortSignal): Promise<EditTarget> {
  return EditTargetSchema.parse(await secureRequest("core.edit-target", request, { signal, scope: "snapshot.read" }))
}

export async function fetchWorkspaceCreationCatalog(signal?: AbortSignal): Promise<WorkspaceCreationCatalog> {
  return WorkspaceCreationCatalogSchema.parse(await secureRequest("workspace-creation.catalog", undefined, { signal, scope: "snapshot.read" }))
}

export async function fetchSignalProjection(signal?: AbortSignal): Promise<SignalProjectionResponse> {
  const value = await secureRequest<SignalProjectionResponse>("signals.list", undefined, { signal, scope: "signal.read" })
  return {
    signals: value.signals.map((item) => SignalSchema.parse(item)),
    dismissed: [...value.dismissed],
    sequence: value.sequence,
  }
}

export async function publishSignalToService(value: Signal, signal?: AbortSignal): Promise<void> {
  await secureRequest("signals.publish", SignalSchema.parse(value), { signal, scope: "operation.write" })
}

export async function createBrowserLaunch(targetId?: string, signal?: AbortSignal): Promise<{ token: string; expiresAt: string; listenerEpoch: string; grant: { targetId: string } }> {
  const rpc = await authenticatedService()
  return rpc.request("launch.browser", targetId ? { target_id: targetId } : {}, { signal, scope: "target.select" })
}

export async function recoverLocalWebTransport(signal?: AbortSignal): Promise<{ endpoint: string; certificate_hash: string }> {
  return secureRequest("service.transport.recover", undefined, { signal, scope: "target.select" })
}

export async function closeServiceClient(reason = "one-shot client complete"): Promise<void> {
  accessGeneration += 1
  const rpc = cachedAccess
  const pending = accessRequest
  cachedAccess = undefined
  accessRequest = undefined
  const [closeResult] = await Promise.allSettled([
    rpc?.close(reason),
    pending?.then(() => undefined, () => undefined),
  ])
  if (closeResult.status === "rejected") throw closeResult.reason
}

export async function refreshDynamicEnvironment(
  environment: Partial<Record<"PATH" | "SSH_AUTH_SOCK", string | undefined>> = process.env as Partial<Record<"PATH" | "SSH_AUTH_SOCK", string | undefined>>,
  signal?: AbortSignal,
): Promise<DynamicEnvironmentRefreshResult> {
  const request = {
    ...(environment.PATH !== undefined ? { PATH: environment.PATH } : {}),
    ...(environment.SSH_AUTH_SOCK !== undefined ? { SSH_AUTH_SOCK: environment.SSH_AUTH_SOCK } : {}),
  }
  const local = await authenticateLocalService()
  try {
    return DynamicEnvironmentRefreshResultSchema.parse(await local.rpc.request("environment.refresh", request, { signal }))
  } finally {
    await local.rpc.close("local environment refresh complete")
  }
}

export class LocalEnvironmentPreparationError extends Error {
  readonly code = "environment_refresh_failed" as const
  readonly stage = "local-launch-preparation" as const
  readonly recovery = "Retry from the same local user after confirming the managed service is available."

  constructor() {
    super("The local service environment could not be prepared; no dependent launch was started.")
    this.name = "LocalEnvironmentPreparationError"
  }
}

export async function prepareLocalServiceEnvironment(
  environment: Partial<Record<"PATH" | "SSH_AUTH_SOCK", string | undefined>> = process.env as Partial<Record<"PATH" | "SSH_AUTH_SOCK", string | undefined>>,
  signal?: AbortSignal,
): Promise<DynamicEnvironmentRefreshResult> {
  try {
    return await refreshDynamicEnvironment(environment, signal)
  } catch {
    // Do not include PATH, socket, transport, or authentication details in a
    // launcher-facing error. The recovery metadata is intentionally static.
    throw new LocalEnvironmentPreparationError()
  }
}

export async function createRemotePairing(name: string, scopes: SecureScope[], signal?: AbortSignal): Promise<PairingBundle> {
  const rpc = await authenticatedService()
  return rpc.request("trust.pair.create", { name, scopes }, { signal, scope: "target.select" })
}

export async function listPairedHelpers(signal?: AbortSignal): Promise<PairedHelper[]> {
  const rpc = await authenticatedService()
  return rpc.request("trust.pair.list", undefined, { signal, scope: "target.select" })
}

export async function revokePairedHelper(helperId: string, signal?: AbortSignal): Promise<boolean> {
  const rpc = await authenticatedService()
  const result = await rpc.request<{ revoked: boolean }>("trust.pair.revoke", { helper_id: helperId }, { signal, scope: "target.select" })
  return result.revoked
}

export async function listRemoteTargets(signal?: AbortSignal): Promise<TargetRecord[]> {
  const rpc = await authenticatedService()
  return rpc.request("targets.list", undefined, { signal, scope: "target.select" })
}

export async function removeRemoteTarget(targetId: string, signal?: AbortSignal): Promise<boolean> {
  const rpc = await authenticatedService()
  const result = await rpc.request<{ removed: boolean }>("targets.remove", { target_id: targetId }, { signal, scope: "target.select" })
  return result.removed
}

export async function dismissSignal(signalId: string, signal?: AbortSignal): Promise<void> {
  await secureRequest("signals.dismiss", { kind: "dismiss_signal", signal_id: signalId }, { signal, scope: "signal.dismiss" })
}

export async function subscribeServiceEvents(
  cursor: string,
  observer: ServiceEventObserver,
  signal?: AbortSignal,
  onReady?: () => void,
): Promise<string> {
  const rpc = await authenticatedService()
  let latest = cursor
  const remove = rpc.observeEvents((value) => {
    const parsed = ServiceEventSchema.safeParse(value)
    if (!parsed.success) return
    latest = parsed.data.sequence
    observer(parsed.data)
  })
  try {
    signal?.throwIfAborted()
    await ensureSharedEventSubscription(rpc, cursor)
    onReady?.()
    if (signal?.aborted) return latest
    await Promise.race([
      rpc.closed,
      new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true })),
    ])
    return latest
  } finally { remove() }
}

export async function fetchEventCursor(signal?: AbortSignal): Promise<string> {
  const value = await secureRequest<{ cursor?: unknown }>("events.cursor", undefined, { signal, scope: "event.read" })
  if (typeof value.cursor !== "string" || !/^(0|[1-9][0-9]*)$/.test(value.cursor)) throw new Error("Invalid service event cursor")
  return value.cursor
}

async function submit(mutation: string, request: unknown, signal?: AbortSignal): Promise<Operation> {
  const key = `official-${crypto.randomUUID()}`
  return OperationSchema.parse(await secureRequest("operation.submit", { mutation, request }, {
    signal, scope: "operation.write", idempotencyKey: key, retry: false,
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
    await new Promise<void>((resolve) => setTimeout(resolve, options.pollMs ?? 1_000))
    options.signal?.throwIfAborted()
    current = OperationSchema.parse(await secureRequest("operation.get", { operation_id: current.operation_id }, {
      signal: options.signal, scope: "snapshot.read",
    }))
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
    // The encrypted event stream is the fast path. If the connection closes or is interrupted, resume
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
  if (operation.state === "failed" || operation.state === "cancelled") {
    throw Object.assign(new Error(operation.error.message), {
      code: operation.error.code,
      status: 409,
      ...(operation.lifecycle ? { lifecycle: operation.lifecycle } : {}),
    })
  }
  throw new Error("Operation did not reach a terminal state")
}

export async function runCoreMutation<Name extends CoreMutationName>(
  name: Name,
  request: CoreMutationRequest<Name>,
  options: { signal?: AbortSignal; onOperation?: OperationObserver; pollMs?: number } = {},
): Promise<Operation & { state: "succeeded" }> {
  const parsed = CoreMutationSchemas[name].parse(request) as z.infer<(typeof CoreMutationSchemas)[Name]>
  return assertSucceeded(await submitAndStreamOperation(
    (signal) => submit(name, parsed, signal),
    options,
  ))
}

export async function createWorkspaceThroughService(
  request: WorkspaceCreationRequest,
  options: { signal?: AbortSignal; onOperation?: OperationObserver; pollMs?: number } = {},
): Promise<Operation & { state: "succeeded" }> {
  const parsed = WorkspaceCreationRequestSchema.parse(request)
  return assertSucceeded(await submitAndStreamOperation(
    (signal) => submit("workspace.create", parsed, signal),
    options,
  ))
}

export async function runWorkspaceLifecycleMutation(
  request: WorkspaceLifecycleMutation,
  options: { signal?: AbortSignal; onOperation?: OperationObserver; pollMs?: number } = {},
): Promise<Operation & { state: "succeeded" }> {
  const parsed = WorkspaceLifecycleMutationSchema.parse(request)
  return assertSucceeded(await submitAndStreamOperation(
    (signal) => submit(parsed.kind, parsed, signal),
    options,
  ))
}
