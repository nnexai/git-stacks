import { createHash, randomUUID } from "crypto"
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { join } from "path"
import {
  getRepoPath,
  listWorkspaces,
  readGlobalConfig,
  workspaceFilePath,
  type GlobalConfig,
  type Workspace,
} from "../config"
import { getTasksDir, WS_CONFIG_DIR } from "../paths"
import { listManualCommands, planManualCommand, type ManualCommandStep } from "../workspace-command"
import { buildWorkspaceEnv } from "../workspace-env"
import { getWorkspaceFileStatusView, type WorkspaceFileStatusView } from "../workspace-file-status"
import { getWorkspaceStatus, type RepoStatus } from "../workspace-status"
import { ensureWorkspaceIdentity } from "./identity"
import {
  WorkspaceSnapshotResponseSchema,
  type WorkspaceSnapshotResponse,
} from "./contract"

type IdentityWorkspace = Workspace & { id: string }

export interface SnapshotRevisionStore {
  update(digest: string): Promise<string> | string
}

type RevisionState = { digest: string; revision: string }

function acquireFileLock(path: string): () => void {
  const lockPath = `${path}.lock`
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const fd = openSync(lockPath, "wx", 0o600)
      return () => {
        closeSync(fd)
        if (existsSync(lockPath)) unlinkSync(lockPath)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
    }
  }
  throw new Error(`Timed out acquiring snapshot revision lock: ${lockPath}`)
}

export class FileSnapshotRevisionStore implements SnapshotRevisionStore {
  constructor(private readonly path = join(WS_CONFIG_DIR, "service", "snapshot-revision.json")) {}

  update(digest: string): string {
    mkdirSync(join(this.path, ".."), { recursive: true, mode: 0o700 })
    const release = acquireFileLock(this.path)
    try {
      let current: RevisionState | null = null
      if (existsSync(this.path)) {
        const parsed = JSON.parse(readFileSync(this.path, "utf8")) as unknown
        if (!isRevisionState(parsed)) throw new Error(`Invalid snapshot revision metadata: ${this.path}`)
        current = parsed
      }
      if (current?.digest === digest) return current.revision
      const next = { digest, revision: String(BigInt(current?.revision ?? "0") + 1n) }
      const temporary = `${this.path}.${process.pid}-${randomUUID()}.tmp`
      const fd = openSync(temporary, "wx", 0o600)
      try {
        writeFileSync(fd, `${JSON.stringify(next)}\n`, "utf8")
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      renameSync(temporary, this.path)
      return next.revision
    } finally {
      release()
    }
  }
}

function isRevisionState(value: unknown): value is RevisionState {
  if (!value || typeof value !== "object") return false
  const state = value as Record<string, unknown>
  return typeof state.digest === "string" && typeof state.revision === "string" && /^(0|[1-9][0-9]*)$/.test(state.revision)
}

export class SnapshotBusyError extends Error {
  readonly code = "snapshot_busy" as const
  constructor(readonly attempts: number) {
    super(`Workspace changed during all ${attempts} snapshot attempts`)
    this.name = "SnapshotBusyError"
  }
}

export interface SnapshotDependencies {
  listWorkspaceNames(): string[]
  ensureWorkspaceIdentity(name: string): IdentityWorkspace
  fingerprint(workspace: IdentityWorkspace): Promise<string> | string
  getWorkspaceStatus(workspace: Workspace): Promise<RepoStatus[]>
  getWorkspaceFileStatus(workspace: Workspace, root: string): Pick<WorkspaceFileStatusView, "summary" | "warnings" | "errors">
  listManualCommands(workspace: Workspace): string[]
  planManualCommand(workspace: Workspace, targetName: string, config?: GlobalConfig): ManualCommandStep[]
  buildWorkspaceEnv(workspace: Workspace, options: { triggeredBy: string; config: GlobalConfig; skipSecrets: boolean }): Promise<Record<string, string>>
  config: GlobalConfig
  revisionStore: SnapshotRevisionStore
  clock(): Date
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]))
  }
  return value
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex")
}

function fileStamp(path: string): string {
  try {
    const stat = statSync(path)
    return `${path}:${stat.mtimeMs}:${stat.size}`
  } catch {
    return `${path}:missing`
  }
}

function defaultFingerprint(workspace: IdentityWorkspace): string {
  const inputs = [workspaceFilePath(workspace.name)]
  for (const repo of workspace.repos) {
    const path = getRepoPath(repo)
    inputs.push(path, join(path, ".git"), join(path, ".git", "HEAD"), join(path, ".git", "index"))
  }
  return digest(inputs.map(fileStamp))
}

function defaultDependencies(): SnapshotDependencies {
  const config = readGlobalConfig()
  return {
    listWorkspaceNames: () => listWorkspaces().map((workspace) => workspace.name),
    ensureWorkspaceIdentity,
    fingerprint: defaultFingerprint,
    getWorkspaceStatus,
    getWorkspaceFileStatus: (workspace, root) => getWorkspaceFileStatusView(workspace, root),
    listManualCommands,
    planManualCommand,
    buildWorkspaceEnv,
    config,
    revisionStore: new FileSnapshotRevisionStore(),
    clock: () => new Date(),
  }
}

function repositoryPath(repo: Workspace["repos"][number]): string {
  return getRepoPath(repo)
}

export function createSnapshotBuilder(dependencies: SnapshotDependencies = defaultDependencies()) {
  async function project(workspace: IdentityWorkspace) {
    const status = await dependencies.getWorkspaceStatus(workspace)
    const root = join(getTasksDir(dependencies.config.workspace_root), workspace.name)
    const fileStatus = dependencies.getWorkspaceFileStatus(workspace, root)
    const commands = dependencies.listManualCommands(workspace)
    const environment = await dependencies.buildWorkspaceEnv(workspace, {
      triggeredBy: "service:snapshot",
      config: dependencies.config,
      skipSecrets: true,
    })
    return {
      id: workspace.id,
      name: workspace.name,
      branch: workspace.branch,
      repositories: workspace.repos.map((repo) => ({ id: repo.id!, name: repo.name, mode: repo.mode, path: repositoryPath(repo) })),
      commands,
      status,
      file_status: {
        total: fileStatus.summary.total,
        ok: fileStatus.summary.ok,
        warnings: fileStatus.summary.warnings,
        errors: fileStatus.summary.errors,
        attention: fileStatus.summary.attention,
      },
      launch: { commands, environment, redacted: [] as string[], references: {} as Record<string, string>, cwd: root },
    }
  }

  async function buildWorkspace(name: string, requestId = `req_${randomUUID().replaceAll("-", "")}`): Promise<WorkspaceSnapshotResponse> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const workspace = dependencies.ensureWorkspaceIdentity(name)
      const before = await dependencies.fingerprint(workspace)
      const projection = await project(workspace)
      const after = await dependencies.fingerprint(workspace)
      if (before !== after) continue
      const revision = await dependencies.revisionStore.update(digest(projection))
      return WorkspaceSnapshotResponseSchema.parse({
        protocol: "v1",
        request_id: requestId,
        ok: true,
        revision,
        generated_at: dependencies.clock().toISOString(),
        workspace: projection,
      })
    }
    throw new SnapshotBusyError(3)
  }

  async function buildAll(): Promise<WorkspaceSnapshotResponse[]> {
    const names = dependencies.listWorkspaceNames()
    return Promise.all(names.map((name) => buildWorkspace(name)))
  }

  return { buildWorkspace, buildAll }
}
