import {
  DynamicEnvironmentRefreshSchema,
  OperationCancelRequestSchema,
  WEB_SHORTCUT_OWNER_CONFLICT_ERROR_CODE,
  WEB_SHORTCUT_STALE_REVISION_ERROR_CODE,
  SignalDismissalSchema,
  SignalSchema,
  WebShortcutGetRequestSchema,
  WebShortcutMutationSchema,
  WebShortcutSettingsSchema,
  WebOperationMutationSchema,
  WebFileStatusRequestSchema,
  WebForgeResolveRequestSchema,
  WebNotesListRequestSchema,
  WebPinsSchema,
  WebPrioritiesSchema,
  WebSignalAcknowledgeSchema,
  WebSignalDismissSchema,
  WebTerminalCreateSchema,
  WebTerminalRenameSchema,
  WebWorkspaceMutationSchema,
  WorkspaceCreationRequestSchema,
  WorkspaceLifecycleMutationSchema,
  type Signal,
  type SignalDismissal,
  type WorkspaceCreationCatalog,
  type DynamicEnvironmentRefresh,
  type DynamicEnvironmentRefreshResult,
} from "@git-stacks/protocol"
import type { WorkspaceFileStatusView } from "@git-stacks/core/workspace-file-status"
import type { WorkspaceNotesSnapshot } from "@git-stacks/core/notes"
import {
  WebShortcutConflictError,
  WebShortcutStaleRevisionError,
  WebShortcutValidationError,
  type WebShortcutBinding as CoreWebShortcutBinding,
  type WebShortcutMutationIntent,
  type WebShortcutSettings as CoreWebShortcutSettings,
} from "@git-stacks/core/web-shortcuts"

import type { EventBroker, EventSubscription } from "../policy/event-broker.js"
import { CoreMutationSchemas, EditTargetRequestSchema, type CoreMutationName } from "../policy/core-contract.js"
import type { CoreStateProvider } from "../policy/core-state.js"
import type { CoreMutationAdapter, OperationExecution, OperationRegistry, OperationWebContext, WorkspaceCreateMutation } from "../policy/operations.js"
import type { SnapshotAdapter } from "../snapshot-adapter.js"
import type { TerminalAttachment } from "../terminal-attachment.js"
import type { SecureRequest, SecureScope } from "@git-stacks/protocol"
import type { SecureSessionContext, SecureSessionHandler } from "../security/session-authority.js"
import type { LaunchToken } from "../security/session-authority.js"
import type { PairingBundle, PairedHelper, TargetRecord } from "../security/targets.js"
import { SignalVisibilityTracker } from "../web/signal-visibility.js"
import {
  projectWebActionInventory,
  projectWebCatalog,
  projectWebFileStatus,
  projectWebNotes,
  projectWebOperation,
  projectWebOperationSummary,
  projectWebSignal,
  projectWebSnapshot,
  projectWebTerminalSignals,
} from "../web/projection.js"
import { WebTerminalManager } from "../web/terminal-manager.js"
import type { createWorkspaceLifecycleCoordinator } from "../policy/workspace-lifecycle.js"
import type { WorkspaceLifecycleAdmission } from "../policy/workspace-lifecycle-admission.js"
import type { DynamicEnvironmentStore } from "../policy/dynamic-environment.js"
import { deriveWorkspaceActionInventory } from "../policy/workspace-actions.js"
import type { ForgeSourceReviewAuthority } from "../policy/forge-source-review.js"

type DynamicEnvironmentParseResult =
  | { success: true; data: DynamicEnvironmentRefresh }
  | { success: false }

type Mutation = (request: {
  workspace: string
  options?: Record<string, unknown>
  expected_notes_revision?: string
  text?: string
  new_name?: string
}, signal?: AbortSignal) => OperationExecution

export interface SecureServiceRouterOptions {
  snapshot: SnapshotAdapter
  operations?: OperationRegistry
  broker?: EventBroker
  mutations?: Partial<Record<CoreMutationName, CoreMutationAdapter>> & Record<string, Mutation | CoreMutationAdapter | undefined>
  core?: CoreStateProvider
  workspaceFileStatus?: (workspace: string) => WorkspaceFileStatusView | Promise<WorkspaceFileStatusView>
  workspaceNotes?: (workspace: string, limit: number) => WorkspaceNotesSnapshot | Promise<WorkspaceNotesSnapshot>
  workspaceCreationCatalog?: () => WorkspaceCreationCatalog | Promise<WorkspaceCreationCatalog>
  workspaceCreate?: WorkspaceCreateMutation
  forgeSourceReview?: Pick<ForgeSourceReviewAuthority, "resolve" | "admit">
  publishSignal?: (signal: Signal) => Promise<void>
  dismissSignal?: (dismissal: SignalDismissal) => Promise<void>
  signalProjection?: () => Promise<{ signals: Signal[]; dismissed: string[]; sequence: string }>
  eventCursor?: () => Promise<string>
  setWorkspacePins?: (ids: string[]) => void | Promise<void>
  setWorkspacePriorities?: (priorities: Array<{ workspace_id: string; priority: number }>) => void | Promise<void>
  readWebShortcutSettings?: (platform: "macos" | "linux") => CoreWebShortcutSettings | Promise<CoreWebShortcutSettings>
  updateWebShortcutSettings?: (intent: WebShortcutMutationIntent) => CoreWebShortcutSettings | Promise<CoreWebShortcutSettings>
  onConnectionChange?: (count: number) => void
  onActivity?: () => void
  issueLaunch?: (mode: "browser" | "tui", targetId: string) => LaunchToken
  createPairingBundle?: (input: { name: string; scopes: SecureScope[] }) => PairingBundle
  listPairedHelpers?: () => PairedHelper[]
  revokePairedHelper?: (id: string) => boolean
  listTargets?: () => TargetRecord[]
  removeTarget?: (id: string) => boolean
  recoverLocalWebTransport?: () => Promise<{ endpoint: string; certificate_hash: string }>
  workspaceLifecycleAdmission?: Pick<WorkspaceLifecycleAdmission, "admitTerminal">
  createWorkspaceLifecycle?: (terminals: WebTerminalManager) => Pick<ReturnType<typeof createWorkspaceLifecycleCoordinator>, "submit">
  workspaceLifecycle?: Pick<ReturnType<typeof createWorkspaceLifecycleCoordinator>, "submit">
  localTargetId?: string
  dynamicEnvironment?: Pick<DynamicEnvironmentStore, "replace">
  parseDynamicEnvironmentRefresh?: (value: unknown) => DynamicEnvironmentParseResult
  workspaceOpenState?: (workspaceId: string) => "open" | "closed" | undefined
}

type SessionResources = {
  subscriptions: Set<EventSubscription>
  sockets: Map<number, TerminalAttachment>
}

function coded(message: string, code: string, details?: unknown): Error {
  return Object.assign(new Error(message), { code, ...(details === undefined ? {} : { details }) })
}

const methodScopes: Record<string, SecureScope> = {
  "service.discovery": "snapshot.read",
  "core.state": "snapshot.read",
  "core.workspace.files": "snapshot.read",
  "core.workspace.notes": "snapshot.read",
  "workspace.actions": "snapshot.read",
  "workspace.notes.list": "snapshot.read",
  "workspace.files.inspect": "snapshot.read",
  "forge.source.resolve": "operation.write",
  "core.edit-target": "snapshot.read",
  "snapshot.all": "snapshot.read",
  "web.snapshot": "snapshot.read",
  "workspace-creation.catalog": "snapshot.read",
  "workspace.pins.set": "operation.write",
  "workspace.priorities.set": "operation.write",
  "shortcuts.get": "snapshot.read",
  "shortcuts.set": "operation.write",
  "signals.list": "signal.read",
  "signals.acknowledge": "signal.dismiss",
  "signals.dismiss": "signal.dismiss",
  "signals.publish": "operation.write",
  "events.cursor": "event.read",
  "events.subscribe": "event.read",
  "operation.submit": "operation.write",
  "operation.get": "snapshot.read",
  "operation.cancel": "operation.write",
  "terminal.list": "terminal.read",
  "terminal.create": "terminal.create",
  "terminal.close": "terminal.close",
  "terminal.rename": "terminal.write",
  "launch.browser": "target.select",
  "launch.tui": "target.select",
  "trust.pair.create": "target.select",
  "trust.pair.list": "target.select",
  "trust.pair.revoke": "target.select",
  "targets.list": "target.select",
  "targets.remove": "target.select",
  "service.transport.recover": "target.select",
}

const localAdministration = new Set([
  "launch.browser", "launch.tui", "trust.pair.create", "trust.pair.list", "trust.pair.revoke", "targets.list", "targets.remove", "service.transport.recover",
])

export class SecureServiceRouter implements SecureSessionHandler {
  readonly terminals: WebTerminalManager
  private readonly workspaceLifecycle?: Pick<ReturnType<typeof createWorkspaceLifecycleCoordinator>, "submit">
  private readonly principals = new SignalVisibilityTracker()
  private readonly resources = new Map<string, SessionResources>()

  constructor(private readonly options: SecureServiceRouterOptions) {
    this.terminals = new WebTerminalManager(
      options.snapshot,
      options.publishSignal,
      () => this.notifyConnections(),
      Date.now,
      undefined,
      options.workspaceLifecycleAdmission,
    )
    this.workspaceLifecycle = options.workspaceLifecycle ?? options.createWorkspaceLifecycle?.(this.terminals)
  }

  async request(context: SecureSessionContext, request: SecureRequest): Promise<unknown> {
    this.options.onActivity?.()
    if (request.method === "environment.refresh") return this.refreshDynamicEnvironment(context, request.body)
    const required = methodScopes[request.method]
    if (!required) throw coded("Unknown secure service method", "not_found")
    if (localAdministration.has(request.method) && (context.mode === "helper" || context.mode === "pairing")) {
      throw coded("Secure service administration is local-only", "unauthorized")
    }
    if (request.method === "service.transport.recover" && context.mode !== "tui") {
      throw coded("Local transport recovery requires the trusted machine client", "unauthorized")
    }
    if (!context.scopes.includes(required)) throw coded("Secure service method is not authorized", "unauthorized")
    const body = request.body as Record<string, unknown> | undefined
    switch (request.method) {
      case "service.discovery": return {
        service_version: "2",
        protocol: "git-stacks/2",
        capabilities: { snapshots: true, operations: Boolean(this.options.operations), signals: Boolean(this.options.signalProjection), terminals: Boolean(this.options.snapshot.resolveTerminalLaunch) },
      }
      case "launch.browser": {
        if (!this.options.issueLaunch) throw coded("Browser launch is unavailable", "capability_unavailable")
        const targetId = typeof body?.target_id === "string" ? body.target_id : context.targetId
        return this.options.issueLaunch("browser", targetId)
      }
      case "launch.tui": {
        if (!this.options.issueLaunch || typeof body?.target_id !== "string") throw coded("TUI target launch is unavailable", "capability_unavailable")
        return this.options.issueLaunch("tui", body.target_id)
      }
      case "trust.pair.create": {
        if (!this.options.createPairingBundle || typeof body?.name !== "string" || !Array.isArray(body.scopes)) throw coded("Invalid pairing request", "invalid_request")
        return this.options.createPairingBundle({ name: body.name, scopes: body.scopes as SecureScope[] })
      }
      case "trust.pair.list": return this.options.listPairedHelpers?.() ?? []
      case "trust.pair.revoke": {
        if (!this.options.revokePairedHelper || typeof body?.helper_id !== "string") throw coded("Invalid helper revocation", "invalid_request")
        return { revoked: this.options.revokePairedHelper(body.helper_id) }
      }
      case "targets.list": return this.options.listTargets?.() ?? []
      case "targets.remove": {
        if (!this.options.removeTarget || typeof body?.target_id !== "string") throw coded("Invalid target removal", "invalid_request")
        return { removed: this.options.removeTarget(body.target_id) }
      }
      case "service.transport.recover": {
        if (!this.options.recoverLocalWebTransport) throw coded("Local transport recovery is unavailable", "capability_unavailable")
        return this.options.recoverLocalWebTransport()
      }
      case "core.state": {
        if (context.mode === "browser") throw coded("Rich core state is unavailable to browsers", "unauthorized")
        if (!this.options.core) throw coded("Core state is unavailable", "capability_unavailable")
        return this.options.core.build()
      }
      case "core.workspace.files": {
        if (context.mode === "browser") throw coded("Rich workspace file status is unavailable to browsers", "unauthorized")
        if (!this.options.workspaceFileStatus || typeof body?.workspace !== "string") throw coded("Workspace file status is unavailable", "capability_unavailable")
        return this.options.workspaceFileStatus(body.workspace)
      }
      case "core.workspace.notes": {
        if (context.mode === "browser") throw coded("Name-based workspace notes are unavailable to browsers", "unauthorized")
        if (!this.options.core || typeof body?.workspace !== "string") throw coded("Workspace notes are unavailable", "capability_unavailable")
        return this.options.core.notes(body.workspace, 5)
      }
      case "workspace.actions": return this.workspaceActions(context, body)
      case "workspace.notes.list": return this.workspaceNotes(body)
      case "workspace.files.inspect": return this.workspaceFiles(body)
      case "forge.source.resolve": {
        const parsed = WebForgeResolveRequestSchema.safeParse(body)
        if (!parsed.success) throw coded("Invalid forge source URL", "invalid_request")
        if (!this.options.forgeSourceReview) throw coded("Forge source review is unavailable", "capability_unavailable")
        try {
          return await this.options.forgeSourceReview.resolve({ principalId: context.principalId, url: parsed.data.url })
        } catch {
          throw coded("Forge source could not be resolved", "operation_failed")
        }
      }
      case "core.edit-target": {
        if (context.mode === "browser") throw coded("Rich edit targets are unavailable to browsers", "unauthorized")
        if (!this.options.core) throw coded("Core state is unavailable", "capability_unavailable")
        const parsed = EditTargetRequestSchema.safeParse(body)
        if (!parsed.success) throw coded("Invalid edit target request", "invalid_request")
        return this.options.core.editTarget(parsed.data)
      }
      case "snapshot.all": {
        if (context.mode === "browser") throw coded("Rich snapshots are unavailable to browsers", "unauthorized")
        return this.options.snapshot.buildAll()
      }
      case "web.snapshot": return projectWebSnapshot(this.options.snapshot.buildCatalog
        ? await this.options.snapshot.buildCatalog()
        : await this.options.snapshot.buildAll())
      case "workspace-creation.catalog": {
        if (!this.options.workspaceCreationCatalog) throw coded("Workspace creation is unavailable", "capability_unavailable")
        return context.mode === "browser" ? projectWebCatalog(await this.options.workspaceCreationCatalog()) : this.options.workspaceCreationCatalog()
      }
      case "workspace.pins.set": return this.setPins(body)
      case "workspace.priorities.set": return this.setPriorities(body)
      case "shortcuts.get": return this.getShortcutSettings(body)
      case "shortcuts.set": return this.setShortcutSettings(body)
      case "signals.list": return this.signals(context.principalId)
      case "signals.acknowledge": return this.acknowledgeSignals(context.principalId, body)
      case "signals.dismiss": return this.dismissSignal(body)
      case "signals.publish": return this.publishSignal(body)
      case "events.cursor": return { cursor: await this.cursor() }
      case "events.subscribe": return this.subscribe(context, body)
      case "operation.submit": return this.submitOperation(context, request)
      case "operation.get": return this.getOperation(context, body)
      case "operation.cancel": return this.cancelOperation(context, body)
      case "terminal.list": return this.terminals.list(context.principalId)
      case "terminal.create": {
        const parsed = WebTerminalCreateSchema.safeParse(body)
        if (!parsed.success) throw coded("Invalid terminal request", "invalid_request")
        return this.terminals.create(context.principalId, parsed.data)
      }
      case "terminal.close": {
        if (typeof body?.terminal_id !== "string") throw coded("Invalid terminal id", "invalid_request")
        const terminal = await this.terminals.close(context.principalId, body.terminal_id)
        if (!terminal) throw coded("Terminal not found", "not_found")
        return terminal
      }
      case "terminal.rename": {
        if (typeof body?.terminal_id !== "string") throw coded("Invalid terminal id", "invalid_request")
        const parsed = WebTerminalRenameSchema.safeParse(body)
        if (!parsed.success) throw coded("Invalid terminal title", "invalid_request")
        const terminal = this.terminals.rename(context.principalId, body.terminal_id, parsed.data.title, parsed.data.mode)
        if (!terminal) throw coded("Terminal not found", "not_found")
        return terminal
      }
    }
  }

  private refreshDynamicEnvironment(context: SecureSessionContext, body: unknown): DynamicEnvironmentRefreshResult {
    if (context.origin !== "local" || context.mode !== "tui" || context.helperId !== undefined
      || !this.options.localTargetId || context.targetId !== this.options.localTargetId) {
      throw coded("Dynamic environment refresh requires a same-user local launcher", "unauthorized")
    }
    const parsed = (this.options.parseDynamicEnvironmentRefresh ?? ((value) => DynamicEnvironmentRefreshSchema.safeParse(value)))(body)
    if (!parsed.success) throw coded("Invalid dynamic environment refresh", "invalid_request")
    if (!this.options.dynamicEnvironment) throw coded("Dynamic environment refresh is unavailable", "capability_unavailable")
    return this.options.dynamicEnvironment.replace(parsed.data)
  }

  terminalControl(context: SecureSessionContext, streamId: number, value: unknown): void {
    if (!context.scopes.includes("terminal.read")) throw coded("Terminal access is not authorized", "unauthorized")
    const message = value as { type?: unknown; terminal_id?: unknown; cursor?: unknown; streaming?: unknown }
    const resources = this.session(context.sessionId)
    if (message.type === "attach") {
      if (typeof message.terminal_id !== "string" || resources.sockets.has(streamId)) throw coded("Invalid terminal attachment", "invalid_request")
      if (resources.sockets.size >= 64) throw coded("Terminal stream capacity reached", "capacity_exceeded")
      const socket = this.socket(context, streamId, message.terminal_id, message.streaming === true)
      resources.sockets.set(streamId, socket)
      this.terminals.attach(socket)
      if (typeof message.cursor === "string") this.terminals.message(socket, JSON.stringify({ type: "ack", cursor: message.cursor }))
      return
    }
    const socket = resources.sockets.get(streamId)
    if (!socket) throw coded("Terminal stream is not attached", "not_found")
    if (message.type === "detach") { this.terminals.detached(socket); resources.sockets.delete(streamId); return }
    if (message.type === "input" && !context.scopes.includes("terminal.write")) throw coded("Terminal input is not authorized", "unauthorized")
    this.terminals.message(socket, JSON.stringify(value))
  }

  terminalData(): void { throw coded("Client terminal data is not accepted", "invalid_request") }

  async closed(context: SecureSessionContext): Promise<void> {
    const resources = this.resources.get(context.sessionId)
    if (!resources) return
    for (const subscription of resources.subscriptions) subscription.close()
    for (const socket of resources.sockets.values()) this.terminals.detached(socket)
    this.resources.delete(context.sessionId)
    this.notifyConnections()
  }

  async stop(): Promise<void> {
    for (const resources of this.resources.values()) for (const subscription of resources.subscriptions) subscription.close()
    this.resources.clear()
    await this.terminals.stop()
  }

  private session(id: string): SessionResources {
    const existing = this.resources.get(id)
    if (existing) return existing
    const created = { subscriptions: new Set<EventSubscription>(), sockets: new Map<number, TerminalAttachment>() }
    this.resources.set(id, created)
    this.notifyConnections()
    return created
  }

  private socket(context: SecureSessionContext, streamId: number, terminalId: string, streaming: boolean): TerminalAttachment {
    let closed = false
    return {
      data: { kind: "web-terminal", principalId: context.principalId, sessionId: terminalId, streaming },
      send: (data) => {
        if (closed) return -1
        if (context.channel.bufferedAmount >= 8 * 1024 * 1024) return -1
        const pending = typeof data === "string"
          ? context.sendTerminalControl(streamId, JSON.parse(data))
          : context.sendTerminalData(streamId, data)
        void pending.catch(() => undefined)
        return 1
      },
      close: (_code, reason) => {
        if (closed) return
        closed = true
        void context.sendTerminalControl(streamId, { type: "closed", reason: reason ?? "closed" }).catch(() => undefined)
      },
      getBufferedAmount: () => context.channel.bufferedAmount,
    }
  }

  private async cursor(): Promise<string> { return this.options.eventCursor ? this.options.eventCursor() : "0" }

  private async subscribe(context: SecureSessionContext, body?: Record<string, unknown>): Promise<{ cursor: string }> {
    if (!this.options.broker) throw coded("Events are unavailable", "capability_unavailable")
    const cursor = typeof body?.cursor === "string" ? body.cursor : "0"
    if (!/^(0|[1-9][0-9]*)$/.test(cursor)) throw coded("Invalid event cursor", "invalid_request")
    const resources = this.session(context.sessionId)
    if (resources.subscriptions.size >= 4) throw coded("Event subscription limit reached", "capacity_exceeded")
    let subscription: EventSubscription
    try { subscription = await this.options.broker.subscribe(cursor) } catch (error) {
      const replay = (error as { replay?: { requested: string; earliest_cursor: string; latest_cursor: string } }).replay
      if (!replay) throw error
      await context.sendEvent({
        protocol: "v1", sequence: replay.latest_cursor, timestamp: new Date().toISOString(), type: "control",
        control: { kind: "replay_gap", gap: {
          requested: replay.requested, oldest_available: replay.earliest_cursor, newest_available: replay.latest_cursor,
        } },
      })
      subscription = await this.options.broker.subscribe(replay.latest_cursor)
    }
    resources.subscriptions.add(subscription)
    void (async () => {
      try {
        for await (const event of subscription) {
          if (event.type === "operation" && this.options.operations?.ownerOf(event.operation.operation_id) !== context.principalId) continue
          const projected = context.mode === "browser"
            ? event.type === "operation" ? { ...event, operation: projectWebOperation(event.operation) }
              : event.type === "signal"
                ? (await this.signalIsActive(event.signal) ? { ...event, signal: projectWebSignal(event.signal) } : undefined)
                : event
            : event
          if (projected) await context.sendEvent(projected)
        }
      } finally { resources.subscriptions.delete(subscription); this.notifyConnections() }
    })().catch(() => subscription.close())
    this.notifyConnections()
    return { cursor: await this.cursor() }
  }

  private async signals(principalId: string): Promise<{ signals: Signal[]; dismissed: string[]; sequence: string }> {
    if (!this.options.signalProjection) throw coded("Signals are unavailable", "capability_unavailable")
    const projection = await this.options.signalProjection()
    const dismissed = new Set(projection.dismissed)
    const visible = projection.signals.filter((signal) => !dismissed.has(signal.id))
    return { ...projection, signals: (await this.visibleSignals(principalId, visible)).map((signal) => projectWebSignal(signal) as Signal) }
  }

  private async acknowledgeSignals(principalId: string, body?: Record<string, unknown>): Promise<unknown> {
    const parsed = WebSignalAcknowledgeSchema.safeParse(body)
    if (!parsed.success) throw coded("Invalid signal acknowledgement", "invalid_request")
    if (!this.options.signalProjection) throw coded("Signals are unavailable", "capability_unavailable")
    const projection = await this.options.signalProjection()
    const dismissed = new Set(projection.dismissed)
    const visible = projection.signals.filter((signal) => !dismissed.has(signal.id))
    const activeVisible = await this.visibleSignals(principalId, visible)
    const acknowledged = this.principals.acknowledgeSurface(principalId, parsed.data.surface_id, activeVisible)
    return { ...projection, acknowledged, signals: activeVisible.map((signal) => projectWebSignal(signal)) }
  }

  private async activeWorkspaceIds(): Promise<Set<string>> {
    const snapshots = this.options.snapshot.buildCatalog
      ? (await this.options.snapshot.buildCatalog()).workspaces
      : await this.options.snapshot.buildAll()
    return new Set(snapshots.map(({ workspace }) => workspace.id))
  }

  private async signalIsActive(signal: Signal | SignalDismissal): Promise<boolean> {
    return signal.kind === "dismiss_signal" || (await this.activeWorkspaceIds()).has(signal.workspace_id)
  }

  private async visibleSignals(principalId: string, signals: Signal[]): Promise<Signal[]> {
    return projectWebTerminalSignals(
      this.principals.visibleSignals(principalId, signals),
      this.terminals.surfaceIds(principalId),
      await this.activeWorkspaceIds(),
    )
  }

  private async dismissSignal(body?: Record<string, unknown>): Promise<{ dismissed: true }> {
    if (!this.options.dismissSignal) throw coded("Signals are unavailable", "capability_unavailable")
    const web = WebSignalDismissSchema.safeParse(body)
    const dismissal = web.success ? { kind: "dismiss_signal" as const, signal_id: web.data.signal_id } : SignalDismissalSchema.parse(body)
    await this.options.dismissSignal(dismissal)
    return { dismissed: true }
  }

  private async publishSignal(body?: Record<string, unknown>): Promise<{ published: true }> {
    if (!this.options.publishSignal) throw coded("Signal publication is unavailable", "capability_unavailable")
    await this.options.publishSignal(SignalSchema.parse(body))
    return { published: true }
  }

  private async setPins(body?: Record<string, unknown>): Promise<{ workspace_ids: string[] }> {
    if (!this.options.setWorkspacePins) throw coded("Workspace pinning is unavailable", "capability_unavailable")
    const parsed = WebPinsSchema.safeParse(body)
    if (!parsed.success) throw coded("Invalid pinned workspaces", "invalid_request")
    await this.assertRevisionAndWorkspaces(parsed.data.expected_revision, parsed.data.workspace_ids)
    await this.options.setWorkspacePins(parsed.data.workspace_ids)
    return { workspace_ids: parsed.data.workspace_ids }
  }

  private async setPriorities(body?: Record<string, unknown>): Promise<{ priorities: Array<{ workspace_id: string; priority: number }> }> {
    if (!this.options.setWorkspacePriorities) throw coded("Workspace priorities are unavailable", "capability_unavailable")
    const parsed = WebPrioritiesSchema.safeParse(body)
    if (!parsed.success) throw coded("Invalid workspace priorities", "invalid_request")
    await this.assertRevisionAndWorkspaces(parsed.data.expected_revision, parsed.data.priorities.map((item) => item.workspace_id))
    await this.options.setWorkspacePriorities(parsed.data.priorities)
    return { priorities: parsed.data.priorities }
  }

  private async getShortcutSettings(body?: Record<string, unknown>): Promise<unknown> {
    if (!this.options.readWebShortcutSettings) throw coded("Shortcut settings are unavailable", "capability_unavailable")
    const parsed = WebShortcutGetRequestSchema.safeParse(body)
    if (!parsed.success) throw coded("Invalid shortcut settings request", "invalid_request")
    try {
      return projectShortcutSettings(await this.options.readWebShortcutSettings(parsed.data.platform))
    } catch (error) {
      throw mapShortcutError(error)
    }
  }

  private async setShortcutSettings(body?: Record<string, unknown>): Promise<unknown> {
    if (!this.options.updateWebShortcutSettings) throw coded("Shortcut settings are unavailable", "capability_unavailable")
    const parsed = WebShortcutMutationSchema.safeParse(body)
    if (!parsed.success) throw coded("Invalid shortcut settings mutation", "invalid_request")
    try {
      return projectShortcutSettings(await this.options.updateWebShortcutSettings(toCoreShortcutIntent(parsed.data)))
    } catch (error) {
      throw mapShortcutError(error)
    }
  }

  private async assertRevisionAndWorkspaces(revision: string, ids: string[]): Promise<void> {
    const snapshots = await this.options.snapshot.buildAll()
    if ((snapshots[0]?.revision ?? "0") !== revision) throw coded("Authoritative snapshot revision is stale", "conflict")
    const known = new Set(snapshots.map(({ workspace }) => workspace.id))
    if (ids.some((id) => !known.has(id))) throw coded("Workspace no longer exists", "not_found")
  }

  private async resolveWorkspaceTarget(body: Record<string, unknown> | undefined, schema: typeof WebWorkspaceMutationSchema | typeof WebNotesListRequestSchema | typeof WebFileStatusRequestSchema) {
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw coded("Invalid workspace detail request", "invalid_request")
    const catalog = this.options.snapshot.buildCatalog
      ? await this.options.snapshot.buildCatalog()
      : undefined
    const snapshots = catalog?.workspaces ?? await this.options.snapshot.buildAll()
    const revision = catalog?.revision ?? snapshots[0]?.revision ?? "0"
    if (revision !== parsed.data.expected_revision) throw coded("Authoritative snapshot revision is stale", "conflict")
    const selected = snapshots.find((item) => item.workspace.id === parsed.data.workspace_id)
    if (!selected) throw coded("Workspace not found", "not_found")
    return { parsed: parsed.data, selected, revision, generatedAt: catalog?.generated_at ?? selected.generated_at }
  }

  private async workspaceActions(context: SecureSessionContext, body?: Record<string, unknown>): Promise<unknown> {
    const parsed = WebWorkspaceMutationSchema.safeParse(body)
    if (!parsed.success) throw coded("Invalid workspace action request", "invalid_request")
    if (!this.options.core) throw coded("Workspace actions are unavailable", "capability_unavailable")
    const state = await this.options.core.build()
    if (state.revision !== parsed.data.expected_revision) throw coded("Authoritative snapshot revision is stale", "conflict")
    if (!state.workspaces.some(({ definition, projection }) => definition.id === parsed.data.workspace_id || projection.id === parsed.data.workspace_id)
      && !state.archived_workspaces.some(({ id }) => id === parsed.data.workspace_id)) {
      throw coded("Workspace not found", "not_found")
    }
    const actionState = this.options.operations?.workspaceActionState(parsed.data.workspace_id, context.principalId, state.revision)
    const available = (name: string) => Boolean(this.options.operations && this.options.mutations?.[name])
    const capabilities = {
      "workspace.archive": Boolean(this.workspaceLifecycle),
      "workspace.unarchive": Boolean(this.workspaceLifecycle),
      "workspace.remove": Boolean(this.workspaceLifecycle),
      "workspace.force-remove": Boolean(this.workspaceLifecycle),
      "workspace.rename": available("workspace.rename"),
      "workspace.open": available("workspace.open"),
      "workspace.close": available("workspace.close"),
      "workspace.pin": Boolean(this.options.setWorkspacePins),
      "workspace.unpin": Boolean(this.options.setWorkspacePins),
      "workspace.sync": available("workspace.sync"),
      "workspace.pull": available("workspace.pull"),
      "workspace.push": available("workspace.push"),
      "workspace.merge": available("workspace.merge"),
      "workspace.notes.list": Boolean(this.options.workspaceNotes),
      "workspace.notes.add": available("workspace.notes.add"),
      "workspace.notes.clear": available("workspace.notes.clear"),
      "workspace.files.inspect": Boolean(this.options.workspaceFileStatus),
      "operation.cancel": Boolean(this.options.operations),
    } as const
    return projectWebActionInventory(deriveWorkspaceActionInventory({
      state,
      workspaceId: parsed.data.workspace_id,
      operations: actionState?.operations,
      removal: actionState?.removal,
      openState: actionState?.openState ?? this.options.workspaceOpenState?.(parsed.data.workspace_id),
      capabilities,
    }))
  }

  private async workspaceNotes(body?: Record<string, unknown>): Promise<unknown> {
    const target = await this.resolveWorkspaceTarget(body, WebNotesListRequestSchema)
    if (!this.options.workspaceNotes) throw coded("Workspace notes are unavailable", "capability_unavailable")
    try {
      const notes = await this.options.workspaceNotes(target.selected.workspace.name, 50)
      return projectWebNotes({ workspaceId: target.parsed.workspace_id, revision: target.revision, notes })
    } catch {
      throw coded("Workspace notes could not be read", "operation_failed")
    }
  }

  private async workspaceFiles(body?: Record<string, unknown>): Promise<unknown> {
    const target = await this.resolveWorkspaceTarget(body, WebFileStatusRequestSchema)
    if (!this.options.workspaceFileStatus) throw coded("Workspace file status is unavailable", "capability_unavailable")
    try {
      const status = await this.options.workspaceFileStatus(target.selected.workspace.name)
      return projectWebFileStatus(status, {
        workspaceId: target.parsed.workspace_id,
        revision: target.revision,
        generatedAt: target.generatedAt,
        repositoryIds: new Map(target.selected.workspace.repositories.map(({ name, id }) => [name, id])),
      })
    } catch {
      throw coded("Workspace file status could not be inspected", "operation_failed")
    }
  }

  private async submitOperation(context: SecureSessionContext, request: SecureRequest): Promise<unknown> {
    if (!this.options.operations || !request.idempotency_key) throw coded("Operations or idempotency key unavailable", "capability_unavailable")
    const requestBody = request.body as { mutation?: unknown; request?: unknown } | undefined
    const directLifecycle = WorkspaceLifecycleMutationSchema.safeParse(request.body)
    const namedLifecycle = typeof requestBody?.mutation === "string"
      && requestBody.mutation.startsWith("workspace.")
      ? WorkspaceLifecycleMutationSchema.safeParse(requestBody.request)
      : undefined
    const lifecycle = directLifecycle.success
      ? directLifecycle.data
      : namedLifecycle?.success && namedLifecycle.data.kind === requestBody?.mutation
        ? namedLifecycle.data
        : undefined
    const lifecycleIntent = directLifecycle.success
      || (typeof requestBody?.mutation === "string" && [
        "workspace.archive", "workspace.unarchive", "workspace.remove", "workspace.force-remove",
      ].includes(requestBody.mutation))
    if (lifecycleIntent) {
      if (!lifecycle) throw coded("Invalid workspace lifecycle request", "invalid_request")
      if (!this.workspaceLifecycle) throw coded("Workspace lifecycle is unavailable", "capability_unavailable")
      let webContext: OperationWebContext | undefined
      if (context.mode === "browser") {
        const state = await this.options.core?.build()
        const target = state?.workspaces.find(({ definition, projection }) => definition.id === lifecycle.workspace_id || projection.id === lifecycle.workspace_id)
        const archived = state?.archived_workspaces.find(({ id }) => id === lifecycle.workspace_id)
        const catalog = !target && !archived && this.options.snapshot.buildCatalog ? await this.options.snapshot.buildCatalog() : undefined
        const catalogTarget = catalog?.workspaces.find(({ workspace }) => workspace.id === lifecycle.workspace_id)
        const catalogArchived = catalog?.archived_workspaces.find(({ id }) => id === lifecycle.workspace_id)
        const workspaceName = target?.projection.name ?? target?.definition.name ?? archived?.name ?? catalogTarget?.workspace.name ?? catalogArchived?.name
        if (!workspaceName) throw coded("Workspace not found", "not_found")
        webContext = {
          actionId: lifecycle.kind,
          workspaceId: lifecycle.workspace_id,
          workspaceName,
          expectedRevision: lifecycle.expected_revision,
        }
      }
      const operation = await this.workspaceLifecycle.submit({
        clientId: context.principalId,
        idempotencyKey: request.idempotency_key,
        mutation: lifecycle,
        ...(webContext ? { webContext } : {}),
      })
      return context.mode === "browser"
        ? projectWebOperationSummary(operation, webContext!, this.options.operations?.cancellationView?.(operation.operation_id))
        : operation
    }
    const web = WebOperationMutationSchema.safeParse(request.body)
    let mutation: string
    let parsedRequest: unknown
    let execution: OperationExecution
    let webContext: OperationWebContext | undefined
    let admissionCleanup: (() => Promise<void>) | undefined
    if (web.success) {
      mutation = web.data.kind
      if (web.data.kind === "workspace.create") {
        if (!this.options.workspaceCreate) throw coded("Workspace creation is unavailable", "capability_unavailable")
        parsedRequest = web.data.request
        execution = this.options.workspaceCreate(web.data.request)
        webContext = { actionId: web.data.kind, workspaceName: web.data.request.name }
      } else if (web.data.kind === "workspace.create.reviewed") {
        if (!this.options.forgeSourceReview) throw coded("Reviewed workspace creation is unavailable", "capability_unavailable")
        let admission
        try {
          admission = await this.options.forgeSourceReview.admit({
            principalId: context.principalId,
            token: web.data.request.token,
            expectedRevision: web.data.request.expected_revision,
            draft: web.data.request.draft,
            idempotencyKey: request.idempotency_key,
          })
        } catch {
          throw coded("Reviewed workspace creation could not be prepared", "operation_failed")
        }
        if (!admission.ok) {
          const transportCode = admission.failure.code === "cli_unavailable"
            ? "capability_unavailable"
            : admission.failure.code === "rate_limited"
              ? "rate_limited"
              : admission.failure.code === "malformed_url"
                ? "invalid_request"
                : ["review_expired", "stale_revision", "source_changed", "branch_conflict"].includes(admission.failure.code)
                  ? "conflict"
                  : "operation_failed"
          throw coded(admission.failure.message, transportCode, {
            kind: "forge_failure",
            reason: admission.failure.code,
            recovery: admission.failure.recovery,
            ...(admission.failure.details ? { context: admission.failure.details } : {}),
          })
        }
        parsedRequest = web.data.request
        execution = admission.execution
        webContext = { actionId: web.data.kind, workspaceName: web.data.request.draft.workspace_name, expectedRevision: web.data.request.expected_revision }
        admissionCleanup = admission.cleanup
      } else {
        const mutationRequest = web.data.request
        const snapshots = await this.options.snapshot.buildAll()
        const selected = snapshots.find((item) => item.workspace.id === mutationRequest.workspace_id)
        if (!selected) throw coded("Workspace not found", "not_found")
        if (selected.revision !== mutationRequest.expected_revision) throw coded("Authoritative snapshot revision is stale", "conflict")
        const adapter = this.options.mutations?.[mutation] as Mutation | undefined
        if (!adapter) throw coded("Workspace operation is unavailable", "capability_unavailable")
        parsedRequest = mutationRequest
        webContext = {
          actionId: web.data.kind,
          workspaceId: selected.workspace.id,
          workspaceName: selected.workspace.name,
          expectedRevision: mutationRequest.expected_revision,
        }
        switch (web.data.kind) {
          case "workspace.notes.add":
            execution = adapter({
              workspace: selected.workspace.name,
              expected_notes_revision: web.data.request.expected_notes_revision,
              text: web.data.request.text,
            })
            break
          case "workspace.notes.clear":
            execution = adapter({
              workspace: selected.workspace.name,
              expected_notes_revision: web.data.request.expected_notes_revision,
            })
            break
          case "workspace.rename":
            execution = adapter({
              workspace: selected.workspace.name,
              new_name: web.data.request.new_name,
              options: {},
            })
            break
          default:
            execution = adapter({ workspace: selected.workspace.name })
        }
      }
    } else {
      if (context.mode === "browser") throw coded("Invalid browser operation request", "invalid_request")
      const body = requestBody
      if (typeof body?.mutation !== "string") throw coded("Invalid operation request", "invalid_request")
      mutation = body.mutation
      if (mutation === "workspace.create") {
        const parsed = WorkspaceCreationRequestSchema.safeParse(body.request)
        if (!parsed.success || !this.options.workspaceCreate) throw coded("Invalid workspace creation request", "invalid_request")
        parsedRequest = parsed.data
        execution = this.options.workspaceCreate(parsed.data)
      } else {
        const name = mutation as CoreMutationName
        const parsed = CoreMutationSchemas[name]?.safeParse(body.request)
        const adapter = this.options.mutations?.[name] as CoreMutationAdapter | undefined
        if (!parsed?.success || !adapter) throw coded("Invalid operation request", "invalid_request")
        parsedRequest = parsed.data
        execution = adapter(parsed.data)
      }
    }
    let operation
    try {
      operation = await this.options.operations.submit({ clientId: context.principalId, endpoint: mutation, idempotencyKey: request.idempotency_key, request: parsedRequest, execution, ...(webContext ? { webContext } : {}) })
    } catch (error) {
      await admissionCleanup?.().catch(() => undefined)
      throw error
    }
    return web.success || context.mode === "browser"
      ? webContext
        ? projectWebOperationSummary(operation, webContext, this.options.operations.cancellationView?.(operation.operation_id))
        : projectWebOperation(operation)
      : operation
  }

  private getOperation(context: SecureSessionContext, body?: Record<string, unknown>): unknown {
    const parsed = OperationCancelRequestSchema.safeParse(body)
    if (!parsed.success) throw coded("Invalid operation id", "invalid_request")
    if (!this.options.operations) throw coded("Operation reads are unavailable", "capability_unavailable")
    const operation = this.options.operations.getForClient(parsed.data.operation_id, context.principalId)
    if (!operation) throw coded("Operation not found", "not_found")
    if (context.mode !== "browser") return operation
    const webContext = this.options.operations.webContextForClient(parsed.data.operation_id, context.principalId)
    if (!webContext) throw coded("Operation browser context is unavailable", "not_found")
    return projectWebOperationSummary(operation, webContext, this.options.operations.cancellationView?.(operation.operation_id))
  }

  private async cancelOperation(context: SecureSessionContext, body?: Record<string, unknown>): Promise<unknown> {
    const parsed = OperationCancelRequestSchema.safeParse(body)
    if (!parsed.success) throw coded("Invalid operation id", "invalid_request")
    if (!this.options.operations) throw coded("Operation cancellation is unavailable", "capability_unavailable")
    if (!this.options.operations.getForClient(parsed.data.operation_id, context.principalId)) throw coded("Operation not found", "not_found")
    return this.options.operations.cancel(parsed.data.operation_id)
  }

  private notifyConnections(): void {
    const subscriptions = [...this.resources.values()].reduce((total, item) => total + item.subscriptions.size, 0)
    this.options.onConnectionChange?.(this.resources.size + subscriptions + this.terminals.activeCount)
  }
}

function toCoreShortcutBinding(binding: {
  code: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}): CoreWebShortcutBinding {
  return {
    code: binding.code as `Key${string}`,
    ctrl: binding.ctrl,
    alt: binding.alt,
    shift: binding.shift,
    meta: binding.meta,
  }
}

function toCoreShortcutIntent(parsed: ReturnType<typeof WebShortcutMutationSchema.parse>): WebShortcutMutationIntent {
  const common = {
    platform: parsed.platform,
    action_id: parsed.action_id,
    expected_revision: parsed.expected_revision,
  }
  switch (parsed.intent) {
    case "set-primary": return { ...common, intent: "set-primary", binding: toCoreShortcutBinding(parsed.binding) }
    case "set-aliases": return { ...common, intent: "set-aliases", aliases: parsed.aliases.map(toCoreShortcutBinding) }
    case "unbind": return { ...common, intent: "unbind" }
    case "reset": return { ...common, intent: "reset" }
  }
}

function projectShortcutSettings(settings: CoreWebShortcutSettings): unknown {
  return WebShortcutSettingsSchema.parse({
    platform: settings.platform,
    revision: settings.revision,
    bindings: settings.bindings.map((row) => ({
      action_id: row.action_id,
      primary: row.primary ? toCoreShortcutBinding(row.primary) : null,
      aliases: row.aliases.map(toCoreShortcutBinding),
    })),
  })
}

function mapShortcutError(error: unknown): Error {
  if (error instanceof WebShortcutStaleRevisionError) {
    return coded("Shortcut settings changed since they were loaded", WEB_SHORTCUT_STALE_REVISION_ERROR_CODE, {
      kind: "stale_revision",
    })
  }
  if (error instanceof WebShortcutConflictError) {
    return coded(`Shortcut conflicts with ${error.conflictActionId}`, WEB_SHORTCUT_OWNER_CONFLICT_ERROR_CODE, {
      kind: "binding_owner_conflict",
      owner_action_id: error.conflictActionId,
    })
  }
  if (error instanceof WebShortcutValidationError) {
    return coded("Invalid shortcut settings", "invalid_request")
  }
  return coded("Shortcut settings could not be updated", "internal_error")
}
