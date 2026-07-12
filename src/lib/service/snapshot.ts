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
  listWorkspacesUncached,
  readGlobalConfig,
  workspaceFilePath,
  type GlobalConfig,
  type Workspace,
} from "../config"
import { getTasksDir, WS_CONFIG_DIR } from "../paths"
import { parseSecretRef } from "../secrets"
import { listManualCommands, planManualCommand, type ManualCommandStep } from "../workspace-command"
import { buildWorkspaceEnv } from "../workspace-env"
import { getWorkspaceFileStatusView, type WorkspaceFileStatusView } from "../workspace-file-status"
import { getWorkspaceStatus, type RepoStatus } from "../workspace-status"
import { ensureWorkspaceIdentity } from "./identity"
import {
  NativeLaunchResolutionSchema,
  type NativeLaunchResolution,
  type NativeLaunchResolutionRequest,
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

function commandId(workspaceId: string, name: string, repositoryId?: string): string {
  return `cmd_${createHash("sha256").update(`${workspaceId}\0${repositoryId ?? "workspace"}\0${name}`).digest("base64url").slice(0, 22)}`
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
  const configPath = workspaceFilePath(workspace.name)
  const inputs = [`${configPath}:${readFileSync(configPath, "utf8")}`]
  for (const repo of workspace.repos) {
    const path = getRepoPath(repo)
    if (existsSync(path) && repo.mode !== "dir") {
      // `git status` may refresh the index metadata. Run it before collecting
      // file stamps so the snapshot does not invalidate its own fingerprint.
      const status = Bun.spawnSync(["git", "status", "--porcelain=v2", "--branch", "--untracked-files=all"], {
        cwd: path,
        stdout: "pipe",
        stderr: "pipe",
      })
      inputs.push(`git:${status.exitCode}:${status.stdout.toString()}:${status.stderr.toString()}`)
    }
    // The porcelain payload already captures index/worktree changes. Index and
    // `.git` mtimes are deliberately excluded because ordinary read-only Git
    // commands may refresh them without changing contract-visible state.
    inputs.push(fileStamp(path), fileStamp(join(path, ".git", "HEAD")))
  }
  return digest(inputs)
}

function defaultDependencies(): SnapshotDependencies {
  const config = readGlobalConfig()
  return {
    listWorkspaceNames: () => listWorkspacesUncached().map((workspace) => workspace.name).sort((a, b) => a.localeCompare(b)),
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
  let aggregateRevision = "0"
  async function project(workspace: IdentityWorkspace) {
    const status = await dependencies.getWorkspaceStatus(workspace)
    const root = join(getTasksDir(dependencies.config.workspace_root), workspace.name)
    const fileStatus = dependencies.getWorkspaceFileStatus(workspace, root)
    const commands = dependencies.listManualCommands(workspace)
    const resolvedEnvironment = await dependencies.buildWorkspaceEnv(workspace, {
      triggeredBy: "service:snapshot",
      config: dependencies.config,
      skipSecrets: true,
    })
    const redacted: string[] = []
    const references: Record<string, string> = {}
    for (const [key, value] of Object.entries(workspace.env ?? {})) {
      const reference = parseSecretRef(value)
      if (!reference) continue
      redacted.push(key)
      references[key] = `${reference.id}:${reference.path}`
    }
    redacted.sort()
    const environment = Object.fromEntries(Object.entries(resolvedEnvironment).filter(([key]) => !redacted.includes(key)))
    const repoByName = new Map(workspace.repos.map((repo) => [repo.name, repo]))
    const named = commands.map((name) => {
      const steps = dependencies.planManualCommand(workspace, name, dependencies.config)
      const repositoryIds = [...new Set(steps.flatMap((step) => {
        const repo = step.repo ?? (step.repoName ? repoByName.get(step.repoName) : undefined)
        return step.scope === "repo" && repo?.id ? [repo.id] : []
      }))]
      const repositoryId = repositoryIds.length === 1 && steps.every((step) => step.scope === "repo") ? repositoryIds[0] : undefined
      return {
      id: commandId(workspace.id, name, repositoryId),
      name,
      scope: repositoryId ? "repository" as const : "workspace" as const,
      ...(repositoryId ? { repository_id: repositoryId } : {}),
      steps: steps.map((step) => {
        const repo = step.repo ?? (step.repoName ? repoByName.get(step.repoName) : undefined)
        const stepEnvironment = step.scope === "repo" && repo ? {
          ...environment,
          GS_REPO_NAME: repo.name,
          GS_REPO_PATH: getRepoPath(repo),
          GS_REPO_CLONE_PATH: repo.main_path,
        } : environment
        return {
          bucket: step.bucket,
          scope: step.scope,
          command: step.shell,
          cwd: step.cwd,
          ...(step.scope === "repo" && repo ? { repository_id: repo.id, repository_name: repo.name } : {}),
          environment: stepEnvironment,
        }
      }),
    }})
    const ports = Object.fromEntries(Object.entries(workspace.ports ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === "number"))
    return {
      id: workspace.id,
      name: workspace.name,
      branch: workspace.branch,
      labels: workspace.labels ?? [],
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
      launch: { commands, environment, redacted, references, cwd: root, ports, named },
    }
  }

  async function projectStable(name: string): Promise<Awaited<ReturnType<typeof project>>> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const workspace = dependencies.ensureWorkspaceIdentity(name)
      const before = await dependencies.fingerprint(workspace)
      const projection = await project(workspace)
      const after = await dependencies.fingerprint(workspace)
      if (before !== after) continue
      return projection
    }
    throw new SnapshotBusyError(3)
  }

  async function buildWorkspace(name: string, requestId = `req_${randomUUID().replaceAll("-", "")}`): Promise<WorkspaceSnapshotResponse> {
    const projection = await projectStable(name)
    const revision = await dependencies.revisionStore.update(digest(projection))
    return WorkspaceSnapshotResponseSchema.parse({ protocol: "v1", request_id: requestId, ok: true, revision, generated_at: dependencies.clock().toISOString(), workspace: projection })
  }

  async function buildAll(): Promise<WorkspaceSnapshotResponse[]> {
    const names = [...dependencies.listWorkspaceNames()].sort((a, b) => a.localeCompare(b))
    // One aggregate generation owns one revision. Per-workspace concurrent
    // writes to a shared revision store made revision depend on build order.
    const projections = []
    for (const name of names) projections.push(await projectStable(name))
    const revision = await dependencies.revisionStore.update(digest(projections))
    aggregateRevision = revision
    if (projections.length === 0) return []
    const generated_at = dependencies.clock().toISOString()
    return projections.map((workspace) => WorkspaceSnapshotResponseSchema.parse({
      protocol: "v1", request_id: `req_${randomUUID().replaceAll("-", "")}`, ok: true, revision, generated_at, workspace,
    }))
  }

  async function currentRevision(): Promise<string> {
    await buildAll()
    return aggregateRevision
  }

  async function resolveNativeLaunch(request: NativeLaunchResolutionRequest): Promise<NativeLaunchResolution> {
    const snapshots = await buildAll()
    const snapshot = snapshots.find((entry) => entry.workspace.id === request.workspace_id)
    const fail = (code: "not_found" | "conflict" | "operation_failed", message: string): NativeLaunchResolution =>
      NativeLaunchResolutionSchema.parse({ resolved: false, error: { code, message } })
    if (!snapshot) return fail("not_found", "Workspace not found")
    if (snapshot.revision !== request.expected_revision) return fail("conflict", "Authoritative snapshot revision is stale")
    const repository = snapshot.workspace.repositories.find((entry) => entry.id === request.repository_id)
    if (!repository) return fail("not_found", "Repository not found in workspace")
    const base = snapshot.workspace.launch
    if (!request.command_id) {
      const shell = process.env.SHELL || "/bin/sh"
      return NativeLaunchResolutionSchema.parse({ resolved: true, revision: snapshot.revision, launch: {
        argv: [shell], cwd: repository.path, environment: base.environment, ports: base.ports ?? {},
        configuration: { shell: true }, redacted: base.redacted,
      } })
    }
    const command = base.named?.find((entry) => entry.id === request.command_id)
    if (!command || (command.scope === "repository" && command.repository_id !== repository.id)) return fail("not_found", "Command not found in repository scope")
    if (command.steps.length !== 1) return fail("operation_failed", "Native launch requires exactly one configured command step")
    const step = command.steps[0]!
    return NativeLaunchResolutionSchema.parse({ resolved: true, revision: snapshot.revision, launch: {
      // Configured commands use the same POSIX-shell contract as the existing
      // CLI/TUI command runner. They must not be reparsed by the user's login
      // shell (Fish, Nushell, etc.).
      argv: ["/bin/sh", "-lc", step.command], cwd: step.cwd,
      environment: step.environment, ports: base.ports ?? {}, configuration: { command_id: command.id, shell: false }, redacted: base.redacted,
    } })
  }

  return { buildWorkspace, buildAll, currentRevision, resolveNativeLaunch }
}
