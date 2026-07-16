import { createHash, randomUUID } from "crypto"

import { spawnSync } from "node:child_process"
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
} from "@git-stacks/core/config"
import { getTasksDir, WS_CONFIG_DIR } from "@git-stacks/core/paths"
import { parseSecretRef } from "@git-stacks/core/secrets"
import { listManualCommands, planManualCommand, type ManualCommandStep } from "@git-stacks/core/workspace-command"
import { buildWorkspaceEnv } from "@git-stacks/core/workspace-env"
import { getWorkspaceFileStatusView, type WorkspaceFileStatusView } from "@git-stacks/core/workspace-file-status"
import { getWorkspaceStatus, type RepoStatus } from "@git-stacks/core/workspace-status"
import { ensureWorkspaceIdentity } from "./identity"
import { prepareTerminalAgentEnvironment } from "@git-stacks/core/agent-hooks/terminal-session"
import {
  TerminalLaunchResolutionSchema,
  type TerminalLaunchResolution,
  type TerminalLaunchResolutionRequest,
  WorkspaceSnapshotResponseSchema,
  WorkspaceCatalogSchema,
  type ArchivedWorkspaceSummary,
  type WorkspaceCatalog,
  type WorkspaceSnapshotResponse,
} from "@git-stacks/protocol"

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
  prepareAgentSignals?(repoPath: string, workspaceName: string, environment: Record<string, string>): Record<string, string>
  /** @deprecated test/embedding compatibility; production uses prepareAgentSignals. */
  ensureAgentSignals?(repoPath: string, workspaceName: string): void
  config: GlobalConfig | (() => GlobalConfig)
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
      const status = spawnSync("git", ["status", "--porcelain=v2", "--branch", "--untracked-files=all"], {
        cwd: path,
        encoding: "utf8",
      })
      inputs.push(`git:${status.status ?? 1}:${status.stdout}:${status.stderr}`)
    }
    // The porcelain payload already captures index/worktree changes. Index and
    // `.git` mtimes are deliberately excluded because ordinary read-only Git
    // commands may refresh them without changing contract-visible state.
    inputs.push(fileStamp(path), fileStamp(join(path, ".git", "HEAD")))
  }
  return digest(inputs)
}

function defaultDependencies(): SnapshotDependencies {
  return {
    listWorkspaceNames: () => listWorkspacesUncached().map((workspace) => workspace.name).sort((a, b) => a.localeCompare(b)),
    ensureWorkspaceIdentity,
    fingerprint: defaultFingerprint,
    getWorkspaceStatus,
    getWorkspaceFileStatus: (workspace, root) => getWorkspaceFileStatusView(workspace, root),
    listManualCommands,
    planManualCommand,
    buildWorkspaceEnv,
    prepareAgentSignals: (repoPath, workspaceName, environment) => prepareTerminalAgentEnvironment(
      repoPath,
      workspaceName,
      environment.PATH ?? process.env.PATH ?? "",
      join(WS_CONFIG_DIR, "terminal-agent-bin"),
    ),
    config: readGlobalConfig,
    revisionStore: new FileSnapshotRevisionStore(),
    clock: () => new Date(),
  }
}

function repositoryPath(repo: Workspace["repos"][number]): string {
  return getRepoPath(repo)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`
}

function commandSequence(steps: Array<{ command: string; cwd: string; environment: Record<string, string> }>): string {
  return ["set -e", ...steps.map((step) => {
    const environment = Object.entries(step.environment).map(([key, value]) => `${key}=${shellQuote(value)}`).join(" ")
    return `(cd ${shellQuote(step.cwd)} && env ${environment} /bin/sh -lc ${shellQuote(step.command)})`
  })].join("\n")
}

function workspaceDefinitionExists(name: string): boolean {
  try { return existsSync(workspaceFilePath(name)) } catch { return false }
}

export function createSnapshotBuilder(dependencies: SnapshotDependencies = defaultDependencies()) {
  let aggregateRevision = "0"
  let latestAggregate: WorkspaceSnapshotResponse[] | undefined
  let latestCatalog: WorkspaceCatalog | undefined
  const loadConfig = (): GlobalConfig => typeof dependencies.config === "function" ? dependencies.config() : dependencies.config
  async function project(workspace: IdentityWorkspace, config: GlobalConfig) {
    const status = await dependencies.getWorkspaceStatus(workspace)
    const root = join(getTasksDir(config.workspace_root), workspace.name)
    const fileStatus = dependencies.getWorkspaceFileStatus(workspace, root)
    const commands = dependencies.listManualCommands(workspace)
    const resolvedEnvironment = await dependencies.buildWorkspaceEnv(workspace, {
      triggeredBy: "service:snapshot",
      config,
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
      const steps = dependencies.planManualCommand(workspace, name, config)
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
      activity_at: workspace.last_opened ?? workspace.created,
      branch: workspace.branch,
      labels: workspace.labels ?? [],
      ...(workspace.pinned === true ? { pinned: true } : {}),
      ...(workspace.priority !== undefined ? { priority: workspace.priority } : {}),
      repositories: workspace.repos.map((repo) => ({ id: repo.id!, name: repo.name, mode: repo.mode, path: repositoryPath(repo) })),
      commands,
      status: status.map((entry) => {
        const repo = repoByName.get(entry.name)
        if (!repo?.id) throw new Error(`Status references unknown repository '${entry.name}'`)
        return { ...entry, repository_id: repo.id, default_branch: repo.base_branch ?? "main", remote: repo.mode === "dir" ? "not_applicable" as const : entry.exists ? "available" as const : "missing" as const }
      }),
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

  async function projectStable(name: string, config: GlobalConfig): Promise<Awaited<ReturnType<typeof project>> | null> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const workspace = dependencies.ensureWorkspaceIdentity(name)
        if (workspace.archived === true) return null
        const before = await dependencies.fingerprint(workspace)
        const projection = await project(workspace, config)
        const after = await dependencies.fingerprint(workspace)
        if (before !== after) continue
        return projection
      } catch (error) {
        // External removal can race any projection stage. Once the authoritative
        // YAML is gone, omission is the correct snapshot rather than an error.
        if (!workspaceDefinitionExists(name)) return null
        throw error
      }
    }
    throw new SnapshotBusyError(3)
  }

  async function buildWorkspace(name: string, requestId = `req_${randomUUID().replaceAll("-", "")}`): Promise<WorkspaceSnapshotResponse> {
    const projection = await projectStable(name, loadConfig())
    if (!projection) throw new Error(`Workspace '${name}' not found.`)
    const revision = await dependencies.revisionStore.update(digest(projection))
    return WorkspaceSnapshotResponseSchema.parse({ protocol: "v1", request_id: requestId, ok: true, revision, generated_at: dependencies.clock().toISOString(), workspace: projection })
  }

  async function buildAll(): Promise<WorkspaceSnapshotResponse[]> {
    return (await buildCatalog()).workspaces
  }

  function archivedActivity(workspace: IdentityWorkspace): string {
    const persisted = workspace.last_opened ?? workspace.created
    const archivedAt = workspace.archived_at!
    return Date.parse(archivedAt) >= Date.parse(persisted) ? archivedAt : persisted
  }

  async function buildCatalog(): Promise<WorkspaceCatalog> {
    const names = [...dependencies.listWorkspaceNames()].sort((a, b) => a.localeCompare(b))
    const config = loadConfig()
    // One aggregate generation owns one revision. Per-workspace concurrent
    // writes to a shared revision store made revision depend on build order.
    const projections = []
    const archived: ArchivedWorkspaceSummary[] = []
    for (const name of names) {
      let definition: IdentityWorkspace
      try {
        definition = dependencies.ensureWorkspaceIdentity(name)
      } catch (error) {
        if (!workspaceDefinitionExists(name)) continue
        throw error
      }
      if (definition.archived === true) {
        archived.push({ id: definition.id, name: definition.name, activity_at: archivedActivity(definition) })
        continue
      }
      const projection = await projectStable(name, config)
      if (projection) {
        projections.push(projection)
        continue
      }
      try {
        const current = dependencies.ensureWorkspaceIdentity(name)
        if (current.archived === true) {
          archived.push({ id: current.id, name: current.name, activity_at: archivedActivity(current) })
        }
      } catch (error) {
        if (workspaceDefinitionExists(name)) throw error
      }
    }
    archived.sort((left, right) => Date.parse(right.activity_at) - Date.parse(left.activity_at)
      || left.name.localeCompare(right.name)
      || left.id.localeCompare(right.id))
    const revision = await dependencies.revisionStore.update(digest({ workspaces: projections, archived_workspaces: archived }))
    aggregateRevision = revision
    const generated_at = dependencies.clock().toISOString()
    latestAggregate = projections.map((workspace) => WorkspaceSnapshotResponseSchema.parse({
      protocol: "v1", request_id: `req_${randomUUID().replaceAll("-", "")}`, ok: true, revision, generated_at, workspace,
    }))
    latestCatalog = WorkspaceCatalogSchema.parse({ revision, generated_at, workspaces: latestAggregate, archived_workspaces: archived })
    return latestCatalog
  }

  async function currentRevision(): Promise<string> {
    await buildCatalog()
    return aggregateRevision
  }

  async function resolveTerminalLaunch(request: TerminalLaunchResolutionRequest): Promise<TerminalLaunchResolution> {
    // The client can only request a terminal from a snapshot it already
    // received. Reuse that exact aggregate instead of running Git status for
    // every workspace again on the latency-sensitive shell creation path.
    // A missing or mismatched generation still forces an authoritative rebuild.
    const snapshots = latestAggregate !== undefined && aggregateRevision === request.expected_revision
      ? latestAggregate
      : await buildAll()
    const snapshot = snapshots.find((entry) => entry.workspace.id === request.workspace_id)
    const fail = (code: "not_found" | "conflict" | "operation_failed", message: string): TerminalLaunchResolution =>
      TerminalLaunchResolutionSchema.parse({ resolved: false, error: { code, message } })
    if (!snapshot) return fail("not_found", "Workspace not found")
    if (snapshot.revision !== request.expected_revision) return fail("conflict", "Authoritative snapshot revision is stale")
    const repository = snapshot.workspace.repositories.find((entry) => entry.id === request.repository_id)
    if (!repository) return fail("not_found", "Repository not found in workspace")
    const base = snapshot.workspace.launch
    let agentEnvironment: Record<string, string> = {}
    try {
      dependencies.ensureAgentSignals?.(repository.path, snapshot.workspace.name)
      agentEnvironment = dependencies.prepareAgentSignals?.(repository.path, snapshot.workspace.name, base.environment) ?? {}
    } catch (error) {
      // Agent integrations are optional launch enrichment. A malformed,
      // unowned, or unwritable user-level provider config must never make the
      // authoritative repository shell unavailable.
      agentEnvironment = {
        GIT_STACKS_AGENT_SIGNALS: "degraded",
        GIT_STACKS_AGENT_INTEGRATION_HEALTH: "setup-failed",
        GIT_STACKS_AGENT_INTEGRATION_ERROR: error instanceof Error ? error.message : String(error),
      }
    }
    const shellEnvironment = { ...base.environment, ...agentEnvironment }
    if (!request.command_id) {
      const shell = process.env.SHELL || "/bin/sh"
      return TerminalLaunchResolutionSchema.parse({ resolved: true, revision: snapshot.revision, launch: {
        argv: [shell], cwd: repository.path, environment: shellEnvironment, ports: base.ports ?? {},
        configuration: { shell: true }, redacted: base.redacted,
      } })
    }
    const command = base.named?.find((entry) => entry.id === request.command_id)
    if (!command || (command.scope === "repository" && command.repository_id !== repository.id)) return fail("not_found", "Command not found in repository scope")
    if (command.steps.length === 0) return fail("operation_failed", "Configured command has no executable steps")
    const step = command.steps[0]!
    const multiple = command.steps.length > 1
    return TerminalLaunchResolutionSchema.parse({ resolved: true, revision: snapshot.revision, launch: {
      // Configured commands use the same POSIX-shell contract as the existing
      // CLI/TUI command runner. They must not be reparsed by the user's login
      // shell (Fish, Nushell, etc.).
      argv: ["/bin/sh", "-lc", multiple ? commandSequence(command.steps) : step.command], cwd: step.cwd,
      environment: multiple ? shellEnvironment : { ...step.environment, ...agentEnvironment }, ports: base.ports ?? {}, configuration: { command_id: command.id, shell: false }, redacted: base.redacted,
    } })
  }

  return { buildWorkspace, buildAll, buildCatalog, currentRevision, resolveTerminalLaunch }
}
