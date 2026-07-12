import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, fsyncSync, chmodSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { WS_CONFIG_DIR } from "../lib/paths"
import { configureAttentionPublication } from "../lib/messages"
import { provisionOfficialClient, readOfficialClientCredential } from "../lib/service/credentials"
import { createSnapshotBuilder } from "../lib/service/snapshot"
import { EventJournal, publishOperationEvent } from "../lib/service/event-journal"
import { EventBroker } from "../lib/service/event-broker"
import { createWorkspaceMutationAdapters, OperationRegistry } from "../lib/service/operations"
import { createWorkspaceChangeMonitor } from "../lib/service/workspace-change-monitor"
import type { Operation } from "../lib/service/contract"
import { getWorkspaceCreationCatalog } from "../lib/workspace-creation"
import { startServiceServer, type RunningServiceServer } from "./server"

export const SERVICE_IDLE_MS = 5 * 60 * 1_000
export const DEFAULT_OFFICIAL_CLIENT_ID = "official-client"

const DescriptorSchema = z.strictObject({
  protocol: z.literal("v1"),
  endpoint: z.string().url(),
  pid: z.number().int().positive(),
  instance_id: z.string().uuid(),
  server_id: z.string().uuid(),
  credential_lookup: z.string().min(1),
  started_at: z.string().datetime(),
})
export type ServiceDescriptor = z.infer<typeof DescriptorSchema>

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
  const path = serviceDescriptorPath(serviceRoot)
  if (!existsSync(path)) return null
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) throw new Error("Unsafe service descriptor")
  return DescriptorSchema.parse(JSON.parse(readFileSync(path, "utf8")))
}

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM" }
}

export interface ManagedServiceOptions {
  serviceRoot?: string
  clientId?: string
  idleMs?: number
  snapshot?: import("./server").SnapshotAdapter & { currentRevision(): Promise<string> }
}

export interface ManagedService {
  descriptor: ServiceDescriptor
  server?: RunningServiceServer
  existing: boolean
  stop(): Promise<void>
}

async function descriptorUsable(descriptor: ServiceDescriptor, serviceRoot: string): Promise<boolean> {
  if (!processAlive(descriptor.pid)) return false
  const credential = readOfficialClientCredential(descriptor.credential_lookup, { serviceRoot })
  if (!credential) return false
  try {
    const response = await fetch(new URL("/v1", descriptor.endpoint), {
      headers: { authorization: `Bearer ${credential.token}` },
      signal: AbortSignal.timeout(1_000),
    })
    return response.ok
  } catch { return false }
}

export async function startManagedService(options: ManagedServiceOptions = {}): Promise<ManagedService> {
  const serviceRoot = options.serviceRoot ?? join(WS_CONFIG_DIR, "service")
  const clientId = options.clientId ?? DEFAULT_OFFICIAL_CLIENT_ID
  assertRoot(serviceRoot)
  const lockPath = join(serviceRoot, "startup.lock")
  let lock: number | undefined
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { lock = openSync(lockPath, "wx", 0o600); break } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      await Bun.sleep(5)
    }
  }
  if (lock === undefined) throw new Error("Timed out waiting for service startup")
  try {
    const existing = readServiceDescriptor(serviceRoot)
    if (existing && await descriptorUsable(existing, serviceRoot)) return { descriptor: existing, existing: true, async stop() {} }
    if (existing) unlinkSync(serviceDescriptorPath(serviceRoot))

    provisionOfficialClient(clientId, { serviceRoot })
    const snapshot = options.snapshot ?? createSnapshotBuilder()
    const journal = new EventJournal({ root: serviceRoot, snapshotRevision: () => snapshot.currentRevision() })
    const broker = new EventBroker(journal)
    const disposeAttentionPublication = configureAttentionPublication({
      workspaceId: async (workspace) => (await snapshot.buildWorkspace(workspace)).workspace.id,
      publish: async (attention) => {
        const event = await journal.appendAttention(attention)
        broker.publish(event)
      },
    })
    const active = new Set<string>()
    const monitor = createWorkspaceChangeMonitor({
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
    await operations.initialize()
    let running: RunningServiceServer
    let stopManaged: () => Promise<void> = async () => { await running.stop() }
    lifecycle = createIdleLifecycle({ idleMs: options.idleMs, onIdle: () => stopManaged() })
    const mutationAdapters = createWorkspaceMutationAdapters()
    running = startServiceServer({
      serviceRoot, snapshot, operations, broker,
      mutations: { "workspace.open": mutationAdapters["workspace.open"], "workspace.close": mutationAdapters["workspace.close"] },
      workspaceCreate: mutationAdapters["workspace.create"], workspaceCreationCatalog: getWorkspaceCreationCatalog,
      publishAttention: async (attention) => {
        const event = await journal.appendAttention(attention)
        broker.publish(event)
      },
      onConnectionChange: (count) => lifecycle.setConnectedClients(count),
      onActivity: () => lifecycle.touch(),
    })
    monitor.start()
    const instanceId = crypto.randomUUID()
    const descriptor: ServiceDescriptor = {
      protocol: "v1", endpoint: running.url.toString(), pid: process.pid,
      instance_id: instanceId, server_id: crypto.randomUUID(), credential_lookup: clientId,
      started_at: new Date().toISOString(),
    }
    atomicDescriptor(serviceDescriptorPath(serviceRoot), descriptor)
    let stopped = false
    const stop = async () => {
      if (stopped) return
      stopped = true
      lifecycle.dispose()
      await monitor.dispose()
      disposeAttentionPublication()
      try {
        await running.stop()
      } finally {
        const current = readServiceDescriptor(serviceRoot)
        if (current?.instance_id === instanceId) unlinkSync(serviceDescriptorPath(serviceRoot))
      }
    }
    stopManaged = stop
    return { descriptor, server: running, existing: false, stop }
  } finally {
    closeSync(lock)
    if (existsSync(lockPath)) unlinkSync(lockPath)
  }
}
