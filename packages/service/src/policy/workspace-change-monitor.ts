import { existsSync, readdirSync, statSync, watch as watchFs } from "node:fs"

import type { FSWatcher } from "node:fs"
import { WORKSPACES_DIR, WS_CONFIG_DIR } from "@git-stacks/core/paths"
import { invalidateConfigCache } from "@git-stacks/core/config"
import { createSnapshotBuilder } from "./snapshot"

export const DEFAULT_WORKSPACE_DEBOUNCE_MS = 100
export const DEFAULT_WORKSPACE_FINGERPRINT_MS = 5_000

export interface WorkspaceChangeMonitorOptions {
  configRoot?: string
  workspaceDir?: string
  debounceMs?: number
  fingerprintMs?: number
  directoryExists?: (path: string) => boolean
  watch?: (path: string, callback: () => void) => Pick<FSWatcher, "close">
  setTimeout?: (callback: () => void, delay: number) => unknown
  clearTimeout?: (handle: unknown) => void
  setInterval?: (callback: () => void, delay: number) => unknown
  clearInterval?: (handle: unknown) => void
  readFingerprint?: (path: string) => Promise<string> | string
  invalidateConfigCache?: () => void
  rebuild?: () => Promise<string> | string
  onInvalidated: (revision: string) => Promise<void> | void
}

export interface WorkspaceChangeMonitor {
  start(): void
  invalidate(): Promise<void>
  dispose(): Promise<void>
}

function directoryFingerprint(path: string): string {
  if (!existsSync(path)) return "missing"
  return readdirSync(path, { withFileTypes: true })
    .map((entry) => {
      const kind = entry.isDirectory() ? "d" : entry.isFile() ? "f" : entry.isSymbolicLink() ? "l" : "o"
      try {
        const stat = statSync(`${path}/${entry.name}`)
        return `${entry.name}\0${kind}\0${stat.size}\0${stat.mtimeMs}`
      } catch {
        return `${entry.name}\0missing`
      }
    })
    .sort((left, right) => left.localeCompare(right))
    .join("\n")
}

export function createWorkspaceChangeMonitor(options: WorkspaceChangeMonitorOptions): WorkspaceChangeMonitor {
  const configRoot = options.configRoot ?? WS_CONFIG_DIR
  const workspaceDir = options.workspaceDir ?? WORKSPACES_DIR
  const directoryExists = options.directoryExists ?? existsSync
  const watch = options.watch ?? ((path, callback) => watchFs(path, callback))
  const setTimer = options.setTimeout ?? ((callback, delay) => setTimeout(callback, delay))
  const clearTimer = options.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  const setPeriodic = options.setInterval ?? ((callback, delay) => setInterval(callback, delay))
  const clearPeriodic = options.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>))
  const readFingerprint = options.readFingerprint ?? directoryFingerprint
  const clearCache = options.invalidateConfigCache ?? invalidateConfigCache
  const snapshot = options.rebuild ? undefined : createSnapshotBuilder()
  const rebuild = options.rebuild ?? (() => snapshot!.currentRevision())
  let rootWatcher: Pick<FSWatcher, "close"> | undefined
  let workspaceWatcher: Pick<FSWatcher, "close"> | undefined
  let debounceTimer: unknown
  let fingerprintTimer: unknown
  let lastFingerprint: string | undefined
  let lastRevision: string | undefined
  let pending = false
  let running: Promise<void> | undefined
  let started = false
  let disposed = false

  const bindWorkspaceWatcher = () => {
    workspaceWatcher?.close()
    workspaceWatcher = undefined
    if (!disposed && directoryExists(workspaceDir)) workspaceWatcher = watch(workspaceDir, schedule)
  }

  const schedule = () => {
    if (disposed) return
    if (debounceTimer !== undefined) clearTimer(debounceTimer)
    debounceTimer = setTimer(() => {
      debounceTimer = undefined
      bindWorkspaceWatcher()
      void invalidate().catch(() => {})
    }, options.debounceMs ?? DEFAULT_WORKSPACE_DEBOUNCE_MS)
  }

  const invalidate = (): Promise<void> => {
    if (disposed) return Promise.resolve()
    pending = true
    if (!running) {
      running = (async () => {
        while (pending && !disposed) {
          pending = false
          clearCache()
          const revision = await rebuild()
          if (!disposed && revision !== lastRevision) {
            try {
              await options.onInvalidated(revision)
              lastRevision = revision
            } catch {
              // Keep the previous baseline so a later filesystem signal retries.
              break
            }
          }
        }
      })().finally(() => { running = undefined })
    }
    return running
  }

  return {
    start() {
      if (started || disposed) return
      started = true
      rootWatcher = watch(configRoot, schedule)
      bindWorkspaceWatcher()
      void Promise.resolve(readFingerprint(workspaceDir)).then((value) => { if (!disposed) lastFingerprint = value })
      fingerprintTimer = setPeriodic(() => {
        void Promise.resolve(readFingerprint(workspaceDir)).then((value) => {
          if (disposed) return
          if (lastFingerprint === undefined) { lastFingerprint = value; return }
          if (value !== lastFingerprint) { lastFingerprint = value; bindWorkspaceWatcher(); void invalidate().catch(() => {}) }
        })
      }, options.fingerprintMs ?? DEFAULT_WORKSPACE_FINGERPRINT_MS)
    },
    invalidate,
    async dispose() {
      if (disposed) return
      disposed = true
      pending = false
      rootWatcher?.close()
      workspaceWatcher?.close()
      rootWatcher = undefined
      workspaceWatcher = undefined
      if (debounceTimer !== undefined) clearTimer(debounceTimer)
      if (fingerprintTimer !== undefined) clearPeriodic(fingerprintTimer)
      debounceTimer = undefined
      fingerprintTimer = undefined
      // A snapshot rebuild may be waiting on an external Git observation.
      // Once disposed, the loop cannot publish or schedule another pass, so
      // shutdown must not wait indefinitely for that best-effort observation.
      if (running) void running.catch(() => {})
    },
  }
}
