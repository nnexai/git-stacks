import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs"
import { randomUUID as cryptoRandomUUID } from "crypto"
import { parse, stringify } from "yaml"
import { WorkspaceSchema, formatZodError, invalidateConfigCache, readWorkspace, workspaceFilePath, type Workspace } from "../config"

export interface IdentityMigrationOptions {
  randomUUID?: () => string
}

function validatedWorkspace(path: string): Workspace {
  const parsed = WorkspaceSchema.safeParse(parse(readFileSync(path, "utf8")))
  if (!parsed.success) throw new Error(`Invalid workspace at ${path}: ${formatZodError(parsed.error)}`)
  return parsed.data
}

function acquireLock(path: string): () => void {
  const lock = `${path}.identity.lock`
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const fd = openSync(lock, "wx", 0o600)
      return () => { closeSync(fd); if (existsSync(lock)) unlinkSync(lock) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
    }
  }
  throw new Error(`Timed out acquiring identity migration lock for ${path}`)
}

export function ensureWorkspaceIdentity(name: string, options: IdentityMigrationOptions = {}): Workspace & { id: string } {
  invalidateConfigCache()
  readWorkspace(name)
  const path = workspaceFilePath(name)
  if (lstatSync(path).isSymbolicLink()) throw new Error(`Refusing identity migration through symlink: ${path}`)
  const release = acquireLock(path)
  try {
    const current = validatedWorkspace(path)
    if (current.id && current.repos.every((repo) => repo.id)) return current as Workspace & { id: string }
    const randomUUID = options.randomUUID ?? cryptoRandomUUID
    const migrated = WorkspaceSchema.safeParse({
      ...current,
      id: current.id ?? randomUUID(),
      repos: current.repos.map((repo) => ({ ...repo, id: repo.id ?? randomUUID() })),
    })
    if (!migrated.success) throw new Error(`Invalid migrated workspace: ${formatZodError(migrated.error)}`)
    const tmp = `${path}.identity-${process.pid}-${cryptoRandomUUID()}.tmp`
    const fd = openSync(tmp, "wx", 0o600)
    try {
      writeFileSync(fd, stringify(migrated.data), "utf8")
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, path)
    invalidateConfigCache()
    return validatedWorkspace(path) as Workspace & { id: string }
  } finally {
    release()
  }
}
