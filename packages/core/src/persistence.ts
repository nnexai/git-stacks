// Canonical implementation owned by @git-stacks/core.
import {
  closeSync,
  constants,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"
import { sleepSync } from "./node-runtime"

export interface AtomicReplaceOptions {
  mode?: number
  syncDirectory?: boolean
}

function syncParentDirectory(path: string): void {
  let descriptor: number | undefined
  try {
    descriptor = openSync(dirname(path), constants.O_RDONLY)
    fsyncSync(descriptor)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EISDIR" && code !== "EPERM") throw error
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

export function atomicReplaceSync(path: string, bytes: string | Uint8Array, options: AtomicReplaceOptions = {}): void {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  const existingMode = (() => {
    try { return statSync(path).mode & 0o777 } catch { return undefined }
  })()
  const mode = options.mode ?? existingMode ?? 0o600
  let descriptor: number | undefined
  try {
    descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode)
    const data = typeof bytes === "string" ? Buffer.from(bytes) : bytes
    let offset = 0
    while (offset < data.byteLength) offset += writeSync(descriptor, data, offset, data.byteLength - offset)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporary, path)
    if (options.syncDirectory !== false) syncParentDirectory(path)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    try { unlinkSync(temporary) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
}

interface LeaseRecord {
  pid: number
  nonce: string
  createdAt: number
  target: string
}

export interface MutationLeaseOptions {
  timeoutMs?: number
  retryMs?: number
  staleMs?: number
  now?: () => number
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH"
  }
}

function readLease(path: string): LeaseRecord | undefined {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<LeaseRecord>
    if (typeof value.pid !== "number" || typeof value.nonce !== "string" || typeof value.createdAt !== "number" || typeof value.target !== "string") return undefined
    return value as LeaseRecord
  } catch { return undefined }
}

function recoverStaleLease(path: string, now: number, staleMs: number): boolean {
  let age = 0
  try { age = now - statSync(path).mtimeMs } catch { return true }
  const record = readLease(path)
  if (record && processIsAlive(record.pid)) return false
  if (record ? now - record.createdAt < staleMs : age < staleMs) return false
  const quarantine = `${path}.stale.${randomUUID()}`
  try {
    renameSync(path, quarantine)
    unlinkSync(quarantine)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true
    return false
  }
}

export function withMutationLeaseSync<T>(target: string, run: () => T, options: MutationLeaseOptions = {}): T {
  const lockPath = `${target}.lock`
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? 5_000
  const retryMs = options.retryMs ?? 10
  const staleMs = options.staleMs ?? 30_000
  const deadline = now() + timeoutMs
  const record: LeaseRecord = { pid: process.pid, nonce: randomUUID(), createdAt: now(), target }
  let acquired = false

  while (now() <= deadline) {
    try {
      const descriptor = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
      try {
        const bytes = Buffer.from(`${JSON.stringify(record)}\n`)
        writeSync(descriptor, bytes)
        fsyncSync(descriptor)
      } finally { closeSync(descriptor) }
      acquired = true
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      if (!recoverStaleLease(lockPath, now(), staleMs)) sleepSync(retryMs)
    }
  }

  if (!acquired) {
    const owner = readLease(lockPath)
    throw new Error(`Timed out waiting for mutation lease on ${target}${owner ? ` (owner pid ${owner.pid})` : ""}`)
  }

  try { return run() } finally {
    const current = readLease(lockPath)
    if (current?.nonce === record.nonce) {
      try { unlinkSync(lockPath) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
    }
  }
}

export function replaceJsonSync(path: string, value: unknown, options: AtomicReplaceOptions = {}): void {
  atomicReplaceSync(path, `${JSON.stringify(value, null, 2)}\n`, options)
}
