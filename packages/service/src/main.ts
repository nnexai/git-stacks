import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, fsyncSync, chmodSync } from "node:fs"

import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn as spawnChild } from "node:child_process"
import { z } from "zod"
import { WS_CONFIG_DIR } from "@git-stacks/core/paths"
import { createSnapshotBuilder } from "./policy/snapshot"
import { EventJournal, publishOperationEvent } from "./policy/event-journal"
import { EventBroker } from "./policy/event-broker"
import { createWorkspaceMutationAdapters, OperationRegistry, type WorkspaceCreateMutation } from "./policy/operations"
import { createCoreStateProvider } from "./policy/core-state"
import { createWorkspaceChangeMonitor } from "./policy/workspace-change-monitor"
import { CLIENT_MODEL_LIMITS, type Operation, type Signal, type SignalDismissal, type WorkspaceCreationCatalog } from "@git-stacks/protocol"
import { getWorkspaceCreationCatalog } from "@git-stacks/core/workspace-creation"
import { setWorkspacePins } from "@git-stacks/core/workspace-pins"
import { setWorkspacePriorities } from "@git-stacks/core/workspace-priorities"
import { readWebShortcutSettings, updateWebShortcutSettings } from "@git-stacks/core/web-shortcuts"
import { listTemplatesUncached, listWorkspacesUncached, readGlobalConfig, readRegistry, readWorkspace } from "@git-stacks/core/config"
import { getTasksDir } from "@git-stacks/core/paths"
import { getWorkspaceFileStatusView } from "@git-stacks/core/workspace-file-status"
import { getWorkspaceNotesSnapshot } from "@git-stacks/core/notes"
import { connectLocalTls } from "./transport/local-tls.js"
import { readRemoteExposure } from "./security/exposure.js"
import { readProtectedFile } from "./security/protected-store.js"
import { createWorkspaceLifecycleAdmission, type WorkspaceLifecycleAdmission } from "./policy/workspace-lifecycle-admission"
import { createWorkspaceLifecycleCoordinator } from "./policy/workspace-lifecycle"
import type { SnapshotAdapter } from "./snapshot-adapter"
import type { WebTerminalManager } from "./web/terminal-manager"
import { createDynamicEnvironmentStore, type DynamicEnvironmentStore } from "./policy/dynamic-environment"
import type { SecureServiceRouterOptions } from "./secure/router"
import { ForgeSourceReviewAuthority } from "./policy/forge-source-review"
import { initializeOperationRecovery, recoverReviewedSourceRefs } from "./policy/reviewed-source-recovery"

export const SERVICE_IDLE_MS = 5 * 60 * 1_000
export const DEFAULT_OFFICIAL_CLIENT_ID = "official-client"
const STARTUP_LOCK_RETRY_MS = 5
const STARTUP_LOCK_WAIT_MS = 2_000
const STARTUP_LOCK_INCOMPLETE_GRACE_MS = 100
const DescriptorSchema = z.strictObject({
  protocol: z.literal("git-stacks/2"),
  pid: z.number().int().positive(),
  instance_id: z.string().uuid(),
  service_id: z.string().uuid(),
  listener_epoch: z.string().uuid(),
  webtransport: z.strictObject({ endpoint: z.string().url(), certificate_hash: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
  local_tls: z.strictObject({ hostname: z.literal("127.0.0.1"), port: z.number().int().positive(), servername: z.literal("localhost"), certificate: z.string().min(1) }),
  browser_launch: z.strictObject({ token: z.string().min(43), expires_at: z.string().datetime({ offset: true }) }),
  tui_launch: z.strictObject({ token: z.string().min(43), expires_at: z.string().datetime({ offset: true }) }),
  started_at: z.string().datetime(),
})
const StartupLockSchema = z.strictObject({
  pid: z.number().int().positive(),
  nonce: z.string().uuid(),
  created_at: z.string().datetime(),
})
export type ServiceDescriptor = z.infer<typeof DescriptorSchema>
type StartupLock = z.infer<typeof StartupLockSchema> & { fd: number }

export function serviceDescriptorPath(serviceRoot = join(WS_CONFIG_DIR, "service")): string { return join(serviceRoot, "descriptor.json") }

export interface IdleLifecycleOptions {
  idleMs?: number
  onIdle: () => void | Promise<void>
  setTimer?: (callback: () => void, delay: number) => unknown
  clearTimer?: (timer: unknown) => void
}

export function createIdleLifecycle(options: IdleLifecycleOptions) {
  const idleMs = options.idleMs ?? SERVICE_IDLE_MS
  const setTimer = options.setTimer ?? ((callback: () => void, delay: number) => setTimeout(callback, delay))
  const clearTimer = options.clearTimer ?? ((value: unknown) => clearTimeout(value as ReturnType<typeof setTimeout>))
  let timer: unknown
  let connectedClients = 0
  let activeOperations = 0
  let disposed = false
  const schedule = () => {
    if (timer) clearTimer(timer)
    timer = undefined
    if (disposed || connectedClients !== 0 || activeOperations !== 0) return
    timer = setTimer(() => {
      timer = undefined
      if (!disposed && connectedClients === 0 && activeOperations === 0) void options.onIdle()
    }, idleMs)
  }
  schedule()
  return {
    get connectedClients() { return connectedClients },
    get activeOperations() { return activeOperations },
    setConnectedClients(count: number) { connectedClients = Math.max(0, count); schedule() },
    setActiveOperations(count: number) { activeOperations = Math.max(0, count); schedule() },
    touch() { schedule() },
    dispose() { disposed = true; if (timer) clearTimer(timer); timer = undefined },
  }
}

function assertRoot(root: string): void {
  if (!existsSync(root)) mkdirSync(root, { recursive: true, mode: 0o700 })
  const stat = lstatSync(root)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unsafe service directory")
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error("Unsafe service directory ownership")
  chmodSync(root, 0o700)
}

function atomicDescriptor(path: string, descriptor: ServiceDescriptor): void {
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
  const fd = openSync(temporary, "wx", 0o600)
  try { writeFileSync(fd, `${JSON.stringify(descriptor)}\n`, "utf8"); fsyncSync(fd) } finally { closeSync(fd) }
  renameSync(temporary, path)
  chmodSync(path, 0o600)
}

export function readServiceDescriptor(serviceRoot = join(WS_CONFIG_DIR, "service")): ServiceDescriptor | null {
  if (!existsSync(serviceRoot)) return null
  const path = serviceDescriptorPath(serviceRoot)
  const value = readProtectedFile(path)
  return value === null ? null : DescriptorSchema.parse(JSON.parse(value))
}

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM" }
}

function readStartupLock(path: string): z.infer<typeof StartupLockSchema> | null {
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) throw new Error("Unsafe service startup lock")
  try { return StartupLockSchema.parse(JSON.parse(readFileSync(path, "utf8"))) } catch { return null }
}

function removeStartupLock(path: string): void {
  try { unlinkSync(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

function startupLockIsStale(path: string): boolean {
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true
    throw error
  }
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) throw new Error("Unsafe service startup lock")
  const owner = readStartupLock(path)
  if (owner) return !processAlive(owner.pid)
  return Date.now() - stat.mtimeMs >= STARTUP_LOCK_INCOMPLETE_GRACE_MS
}

async function acquireStartupLock(path: string): Promise<StartupLock> {
  const owner = { pid: process.pid, nonce: crypto.randomUUID(), created_at: new Date().toISOString() }
  const deadline = Date.now() + STARTUP_LOCK_WAIT_MS
  while (Date.now() < deadline) {
    try {
      const fd = openSync(path, "wx", 0o600)
      try {
        writeFileSync(fd, `${JSON.stringify(owner)}\n`, "utf8")
        fsyncSync(fd)
      } catch (error) {
        closeSync(fd)
        removeStartupLock(path)
        throw error
      }
      return { ...owner, fd }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      if (startupLockIsStale(path)) { removeStartupLock(path); continue }
      await new Promise<void>((resolve) => setTimeout(resolve, STARTUP_LOCK_RETRY_MS))
    }
  }
  throw new Error("Timed out waiting for service startup")
}

function releaseStartupLock(path: string, lock: StartupLock): void {
  closeSync(lock.fd)
  if (readStartupLock(path)?.nonce === lock.nonce) removeStartupLock(path)
}

export interface ManagedServiceOptions {
  serviceRoot?: string
  clientId?: string
  idleMs?: number
  snapshot?: import("./snapshot-adapter").SnapshotAdapter & { currentRevision(): Promise<string> }
  workspaceCreationCatalog?: () => WorkspaceCreationCatalog | Promise<WorkspaceCreationCatalog>
  workspaceCreate?: WorkspaceCreateMutation
  dynamicEnvironment?: DynamicEnvironmentStore
  parseDynamicEnvironmentRefresh?: SecureServiceRouterOptions["parseDynamicEnvironmentRefresh"]
}

export function createWebShortcutRuntimeComposition() {
  return { readWebShortcutSettings, updateWebShortcutSettings }
}

export function createWorkspaceLifecycleRuntimeComposition(input: {
  snapshot: SnapshotAdapter & { buildCatalog: NonNullable<SnapshotAdapter["buildCatalog"]> }
  operations: OperationRegistry
  createAdmission?: () => WorkspaceLifecycleAdmission
}) {
  const admission = input.createAdmission?.() ?? createWorkspaceLifecycleAdmission()
  const createCoordinator = (terminals: WebTerminalManager) => createWorkspaceLifecycleCoordinator({
    admission,
    terminals,
    snapshot: input.snapshot,
    operations: input.operations,
  })
  return {
    admission,
    createCoordinator,
    snapshot: input.snapshot,
    terminalAdmission: admission,
    coordinatorAdmission: admission,
    coordinatorSnapshot: input.snapshot,
  }
}

export interface ManagedService {
  descriptor: ServiceDescriptor
  server?: { stop(): Promise<void>; readonly connectedClients: number }
  existing: boolean
  stop(): Promise<void>
}

async function descriptorUsable(descriptor: ServiceDescriptor, serviceRoot: string): Promise<boolean> {
  if (!processAlive(descriptor.pid)) return false
  let timeout: NodeJS.Timeout | undefined
  try {
    const carrier = await Promise.race([
      connectLocalTls({ ...descriptor.local_tls }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Service probe timed out")), 1_000)
        timeout.unref()
      }),
    ])
    await carrier.close("discovery probe")
    return true
  } catch { return false }
  finally {
    if (timeout) clearTimeout(timeout)
    void serviceRoot
  }
}

export async function readUsableServiceDescriptor(
  serviceRoot = join(WS_CONFIG_DIR, "service"),
): Promise<ServiceDescriptor | null> {
  const descriptor = readServiceDescriptor(serviceRoot)
  return descriptor && await descriptorUsable(descriptor, serviceRoot) ? descriptor : null
}

type DetachedServiceProcess = {
  exited: Promise<number>
  unref(): void
}

export interface EnsureManagedServiceProcessOptions {
  serviceRoot?: string
  timeoutMs?: number
  pollMs?: number
  executable?: string
  entrypoint?: string
  readUsable?: () => Promise<ServiceDescriptor | null>
  spawn?: (command: string[], options: {
    cwd: string
    env: Record<string, string | undefined>
    detached: true
    stdin: "ignore"
    stdout: "ignore"
    stderr: "ignore"
  }) => DetachedServiceProcess
}

const SERVICE_BOOTSTRAP_ENV = "GIT_STACKS_SERVICE_BOOTSTRAP"

function managedServiceEntrypoint(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url))
  const distDirectory = basename(moduleDirectory) === "src"
    ? join(dirname(moduleDirectory), "dist")
    : moduleDirectory
  return join(distDirectory, "daemon.js")
}

function runningUnderBun(): boolean {
  return Boolean((process.versions as NodeJS.ProcessVersions & { bun?: string }).bun)
}

function managedServiceCommand(options: EnsureManagedServiceProcessOptions): string[] {
  // The TUI is intentionally the only Bun process in the architecture. Use
  // the separately installed Node CLI to host the service so Bun's package
  // tree never becomes the machine-side runtime authority.
  if (runningUnderBun() && !options.executable && !options.entrypoint) {
    return [process.env.GIT_STACKS_CLI ?? "git-stacks", "service", "start"]
  }

  const executable = options.executable ?? process.env.GIT_STACKS_NODE ?? process.execPath
  const entrypoint = options.entrypoint ?? managedServiceEntrypoint()
  if (!existsSync(entrypoint)) {
    throw new Error(`The git-stacks service daemon is missing at ${entrypoint}; reinstall @git-stacks/service`)
  }
  return [executable, entrypoint]
}

/**
 * Discover the shared service or launch it in an independent process.
 *
 * Interactive clients must not host the service themselves: doing so ties the
 * service, browser terminals, and the client's own process lifetime together.
 */
export async function ensureManagedServiceProcess(
  options: EnsureManagedServiceProcessOptions = {},
): Promise<ServiceDescriptor> {
  const serviceRoot = options.serviceRoot ?? join(WS_CONFIG_DIR, "service")
  const readUsable = options.readUsable ?? (() => readUsableServiceDescriptor(serviceRoot))
  const existing = await readUsable()
  if (existing) return existing

  if (process.env[SERVICE_BOOTSTRAP_ENV] === "1") {
    throw new Error("Refusing to recursively bootstrap the git-stacks service")
  }

  const command = managedServiceCommand(options)
  const spawn = options.spawn ?? ((command, spawnOptions) => {
    const child = spawnChild(command[0]!, command.slice(1), {
      cwd: spawnOptions.cwd,
      env: spawnOptions.env as NodeJS.ProcessEnv,
      detached: true,
      stdio: "ignore",
    })
    return {
      exited: new Promise<number>((resolve) => child.once("exit", (code) => resolve(code ?? 1))),
      unref: () => child.unref(),
    }
  })
  const environment: Record<string, string | undefined> = {
    ...process.env,
    [SERVICE_BOOTSTRAP_ENV]: "1",
  }
  for (const key of [
    "GS_WORKSPACE_NAME", "GS_WORKSPACE_BRANCH", "GS_WORKSPACE_PATH",
    "GS_REPO_NAME", "GS_REPO_PATH", "GS_REPO_CLONE_PATH",
    "GIT_STACKS_SIGNAL_TOKEN", "GIT_STACKS_SURFACE_ID",
    "GIT_STACKS_AGENT_SESSION_ID", "GIT_STACKS_SESSION_ID",
  ]) delete environment[key]
  const child = spawn(command, {
    cwd: process.cwd(),
    env: environment,
    detached: true,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  })
  let exitCode: number | undefined
  void child.exited.then((code) => { exitCode = code })
  child.unref()

  // Cold startup includes protected-store access, operation recovery, and the
  // secure listeners. Larger workspace registries can legitimately take more
  // than five seconds before the descriptor is safe to publish.
  const deadline = Date.now() + (options.timeoutMs ?? 30_000)
  while (Date.now() < deadline) {
    const descriptor = await readUsable()
    if (descriptor) return descriptor
    // A concurrent launcher may win the startup lock. In that case this child
    // discovers the healthy service and exits 0; keep polling for its freshly
    // published descriptor. Only a failed child is terminal here.
    if (exitCode !== undefined && exitCode !== 0) {
      throw new Error(`git-stacks service startup exited with code ${exitCode}`)
    }
    await new Promise<void>((resolve) => setTimeout(resolve, options.pollMs ?? 10))
  }
  throw new Error("Timed out waiting for the detached git-stacks service")
}

export async function startManagedService(options: ManagedServiceOptions = {}): Promise<ManagedService> {
  // The bootstrap marker is only a circuit breaker for an incorrectly
  // launched child. Do not leak it into service-owned terminals.
  delete process.env[SERVICE_BOOTSTRAP_ENV]
  const serviceRoot = options.serviceRoot ?? join(WS_CONFIG_DIR, "service")
  void options.clientId
  assertRoot(serviceRoot)
  const lockPath = join(serviceRoot, "startup.lock")
  const lock = await acquireStartupLock(lockPath)
  try {
    const existing = readServiceDescriptor(serviceRoot)
    if (existing && await descriptorUsable(existing, serviceRoot)) return { descriptor: existing, existing: true, async stop() {} }
    if (existing) unlinkSync(serviceDescriptorPath(serviceRoot))

    const dynamicEnvironment = options.dynamicEnvironment ?? createDynamicEnvironmentStore({
      ...(process.env.PATH !== undefined ? { PATH: process.env.PATH } : {}),
      ...(process.env.SSH_AUTH_SOCK !== undefined ? { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK } : {}),
    })
    const snapshot = options.snapshot ?? createSnapshotBuilder(undefined, {
      dynamicEnvironment: dynamicEnvironment.snapshot,
      shellEnvironment: () => process.env,
    })
    const journal = new EventJournal({ root: serviceRoot, snapshotRevision: () => snapshot.currentRevision() })
    const broker = new EventBroker(journal)
    const active = new Set<string>()
    const monitor = createWorkspaceChangeMonitor({
      configRoot: dirname(serviceRoot),
      workspaceDir: join(dirname(serviceRoot), "workspaces"),
      rebuild: () => snapshot.currentRevision(),
      onInvalidated: async (revision) => {
        const event = await journal.appendSnapshotInvalidated(revision)
        broker.publish(event)
      },
    })
    let lifecycle: ReturnType<typeof createIdleLifecycle>
    const operations = new OperationRegistry({
      root: serviceRoot,
      publishOperationEvent: (operation) => publishOperationEvent(journal, operation, (event) => broker.publish(event)),
      onOperation: async (operation: Operation) => {
        if (operation.state === "accepted" || operation.state === "running") active.add(operation.operation_id)
        else active.delete(operation.operation_id)
        lifecycle?.setActiveOperations(active.size)
        if (operation.state === "succeeded" && operation.result?.snapshot_changed === true) await monitor.invalidate()
      },
    })
    await initializeOperationRecovery({
      initializeOperations: () => operations.initialize(),
      recoverReviewedSources: () => recoverReviewedSourceRefs({ repositories: readRegistry() }),
    })
    const { startSecureServiceRuntime } = await import("./secure/runtime.js")
    let running: Awaited<ReturnType<typeof startSecureServiceRuntime>>
    let stopManaged: () => Promise<void> = async () => { await running.stop() }
    lifecycle = createIdleLifecycle({ idleMs: options.idleMs, onIdle: () => stopManaged() })
    const mutationAdapters = createWorkspaceMutationAdapters()
    const core = createCoreStateProvider(snapshot)
    const workspaceFileStatus = (workspaceName: string) => {
      const workspace = readWorkspace(workspaceName)
      return getWorkspaceFileStatusView(workspace, join(getTasksDir(readGlobalConfig().workspace_root), workspace.name), { verbose: true })
    }
    const publishSignal = async (signal: Signal) => {
      const event = await journal.appendSignal(signal)
      broker.publish(event)
    }
    const dismissSignal = async (dismissal: SignalDismissal) => {
      const event = await journal.appendSignalDismissal(dismissal)
      broker.publish(event)
    }
    const workspaceLifecycle = snapshot.buildCatalog
      ? createWorkspaceLifecycleRuntimeComposition({
          snapshot: snapshot as SnapshotAdapter & { buildCatalog: NonNullable<SnapshotAdapter["buildCatalog"]> },
          operations,
        })
      : undefined
    const workspaceCreationCatalog = options.workspaceCreationCatalog ?? (() => ({ ...getWorkspaceCreationCatalog(), client_model: CLIENT_MODEL_LIMITS }))
    const forgeSourceReview = new ForgeSourceReviewAuthority({
      catalog: async () => ({
        revision: snapshot.buildCatalog
          ? (await snapshot.buildCatalog()).revision
          : await snapshot.currentRevision(),
        registry: readRegistry(),
        templates: listTemplatesUncached(),
        config: readGlobalConfig(),
        existing_workspace_names: listWorkspacesUncached().map(({ name }) => name),
      }),
    })
    let descriptor: ServiceDescriptor | undefined
    const writeRotatedLaunch = (mode: "browser" | "tui", launch: import("./security/session-authority.js").LaunchToken) => {
      if (!descriptor) return
      descriptor = {
        ...descriptor,
        [mode === "browser" ? "browser_launch" : "tui_launch"]: { token: launch.token, expires_at: launch.expiresAt },
      }
      atomicDescriptor(serviceDescriptorPath(serviceRoot), descriptor)
    }
    const writeRotatedTransport = (transport: {
      certificatePem: string
      webTransport: { endpoint: string; certificateHash: string }
      localTls: { hostname: "127.0.0.1"; port: number; servername: "localhost" }
    }) => {
      if (!descriptor) return
      descriptor = {
        ...descriptor,
        webtransport: { endpoint: transport.webTransport.endpoint, certificate_hash: transport.webTransport.certificateHash },
        local_tls: { ...transport.localTls, certificate: transport.certificatePem },
      }
      atomicDescriptor(serviceDescriptorPath(serviceRoot), descriptor)
    }
    const exposure = readRemoteExposure(serviceRoot)
    running = await startSecureServiceRuntime({
      serviceRoot, snapshot, operations, broker,
      dynamicEnvironment,
      ...(options.parseDynamicEnvironmentRefresh ? { parseDynamicEnvironmentRefresh: options.parseDynamicEnvironmentRefresh } : {}),
      ...(exposure?.enabled ? { remoteExposure: { bindHost: exposure.bind_host, advertiseHost: exposure.advertise_host, port: exposure.port } } : {}),
      mutations: mutationAdapters,
      core,
      workspaceFileStatus,
      workspaceNotes: (workspaceName, limit) => getWorkspaceNotesSnapshot(workspaceName, { limit }),
      workspaceCreate: options.workspaceCreate ?? mutationAdapters["workspace.create"],
      forgeSourceReview,
      workspaceCreationCatalog,
      publishSignal,
      ...(workspaceLifecycle ? {
        workspaceLifecycleAdmission: workspaceLifecycle.admission,
        createWorkspaceLifecycle: workspaceLifecycle.createCoordinator,
      } : {}),
      dismissSignal,
      signalProjection: () => journal.signalProjection(),
      eventCursor: () => journal.highWaterCursor(),
      setWorkspacePins,
      setWorkspacePriorities,
      ...createWebShortcutRuntimeComposition(),
      onLaunchRotated: writeRotatedLaunch,
      onLocalTransportRotated: writeRotatedTransport,
      onConnectionChange: (count) => lifecycle.setConnectedClients(count),
      onActivity: () => lifecycle.touch(),
    })
    monitor.start()
    const instanceId = crypto.randomUUID()
    const publishedDescriptor: ServiceDescriptor = descriptor = {
      protocol: "git-stacks/2", pid: process.pid,
      instance_id: instanceId, service_id: running.identity.id, listener_epoch: running.listenerEpoch,
      webtransport: { endpoint: running.webTransport.endpoint, certificate_hash: running.webTransport.certificateHash },
      local_tls: { ...running.localTls, certificate: running.certificatePem },
      browser_launch: { token: running.initialBrowserLaunch.token, expires_at: running.initialBrowserLaunch.expiresAt },
      tui_launch: { token: running.initialTuiLaunch.token, expires_at: running.initialTuiLaunch.expiresAt },
      started_at: new Date().toISOString(),
    }
    atomicDescriptor(serviceDescriptorPath(serviceRoot), publishedDescriptor)
    let stopped = false
    const stop = async () => {
      if (stopped) return
      stopped = true
      lifecycle.dispose()
      // Withdraw discovery before potentially slow socket/PTY teardown. An
      // async SIGINT handler can be interrupted by the runtime while force-
      // closing browser transports; a dead endpoint must never remain
      // advertised even if later cleanup is cut short.
      const current = readServiceDescriptor(serviceRoot)
      if (current?.instance_id === instanceId) unlinkSync(serviceDescriptorPath(serviceRoot))
      // Stop filesystem/Git monitoring before closing transports. Otherwise
      // SIGINT can interrupt an in-flight Git status command and reject the
      // monitor callback while browser transports are still closing.
      await monitor.dispose()
      await running.stop()
    }
    stopManaged = stop
    return { descriptor: publishedDescriptor, server: running, existing: false, stop }
  } finally {
    releaseStartupLock(lockPath, lock)
  }
}
