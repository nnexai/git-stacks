import { existsSync } from "fs"
import { join } from "path"
import { isDeepStrictEqual } from "util"
import {
  type RepoRegistryEntry,
  type Template,
  type Workspace,
  type WorkspaceRepo,
  isWorktreeRepo,
  writeWorkspace,
} from "./config"
import { createWorktree, isRepoDirty, removeWorktree } from "./git"

export type RecreateWorktreeOperation =
  | { kind: "remove"; repo: WorkspaceRepo & { mode: "worktree"; task_path: string } }
  | { kind: "create"; repo: WorkspaceRepo & { mode: "worktree"; task_path: string } }

export type WorkspaceRecreatePlan = {
  desired: Workspace
  changes: string[]
  worktreeOperations: RecreateWorktreeOperation[]
}

/** Materializes template and registry state while intentionally retaining workspace identity/runtime fields. */
export function planWorkspaceRecreate(
  workspace: Workspace,
  template: Template,
  registry: RepoRegistryEntry[],
  tasksDir: string,
): WorkspaceRecreatePlan {
  const registryByName = new Map(registry.map((entry) => [entry.name, entry]))
  const missing = template.repos.filter((repo) => !registryByName.has(repo.repo)).map((repo) => repo.repo)
  if (missing.length > 0) throw new Error(`Template references missing registry repos: ${missing.join(", ")}`)

  const oldByRepo = new Map(workspace.repos.map((repo) => [repo.repo, repo]))
  const desiredRepos = template.repos.map((templateRepo) => {
    const entry = registryByName.get(templateRepo.repo)!
    const old = oldByRepo.get(templateRepo.repo)
    const mode = templateRepo.mode ?? "worktree"
    const base = {
      name: entry.name,
      repo: templateRepo.repo,
      type: entry.type,
      mode,
      main_path: entry.local_path,
      base_branch: templateRepo.base_branch ?? entry.default_branch,
      ...(templateRepo.commands ? { commands: structuredClone(templateRepo.commands) } : {}),
      // Repo-local hooks/files are not template fields, so retain them when the repo remains.
      ...(old?.hooks ? { hooks: structuredClone(old.hooks) } : {}),
      ...(old?.files ? { files: structuredClone(old.files) } : {}),
    }
    return mode === "worktree"
      ? { ...base, mode: "worktree" as const, task_path: join(tasksDir, workspace.name, entry.name) }
      : { ...base, mode: mode as "trunk" | "dir", task_path: entry.local_path }
  }) as WorkspaceRepo[]

  const desired: Workspace = {
    name: workspace.name,
    schema_version: workspace.schema_version,
    branch: workspace.branch,
    created: workspace.created,
    ...(workspace.description ? { description: workspace.description } : {}),
    ...(workspace.template ? { template: workspace.template } : {}),
    ...(workspace.last_opened ? { last_opened: workspace.last_opened } : {}),
    ...(workspace.cmux_workspace_id ? { cmux_workspace_id: workspace.cmux_workspace_id } : {}),
    ...(workspace.source ? { source: structuredClone(workspace.source) } : {}),
    ...(workspace.labels ? { labels: structuredClone(workspace.labels) } : {}),
    ...(workspace.pinned === true ? { pinned: true } : {}),
    ...(workspace.priority !== undefined ? { priority: workspace.priority } : {}),
    repos: desiredRepos,
    ...(template.hooks ? { hooks: structuredClone(template.hooks) } : {}),
    ...(template.commands ? { commands: structuredClone(template.commands) } : {}),
    ...(template.env ? { env: structuredClone(template.env) } : {}),
    ...(template.env_file ? { env_file: template.env_file } : {}),
    ...(template.files ? { files: structuredClone(template.files) } : {}),
    ...(template.integrations ? { settings: { integrations: structuredClone(template.integrations) } } : {}),
    ...(template.ports ? { ports: structuredClone(template.ports) } : {}),
  }

  const desiredByRepo = new Map(desiredRepos.map((repo) => [repo.repo, repo]))
  const removed = workspace.repos.filter((old) => {
    const next = desiredByRepo.get(old.repo)
    return !next || old.mode !== next.mode || old.main_path !== next.main_path ||
      (isWorktreeRepo(old) && (!isWorktreeRepo(next) || old.task_path !== next.task_path))
  }).filter(isWorktreeRepo)
  const added = desiredRepos.filter((next) => {
    const old = oldByRepo.get(next.repo)
    return isWorktreeRepo(next) && (!old || old.mode !== next.mode || old.main_path !== next.main_path || !isWorktreeRepo(old) || old.task_path !== next.task_path)
  }).filter(isWorktreeRepo)
  const changes: string[] = []
  if (!isDeepStrictEqual(workspace.repos, desired.repos)) changes.push("repositories")
  for (const field of ["hooks", "commands", "env", "env_file", "files", "settings", "ports"] as const) {
    if (!isDeepStrictEqual(workspace[field], desired[field])) changes.push(field)
  }
  return {
    desired,
    changes,
    worktreeOperations: [
      ...removed.map((repo) => ({ kind: "remove" as const, repo })),
      ...added.map((repo) => ({ kind: "create" as const, repo })),
    ],
  }
}

export async function applyWorkspaceRecreate(plan: WorkspaceRecreatePlan): Promise<{ ok: true } | { ok: false; error: string }> {
  const removed: RecreateWorktreeOperation[] = []
  const created: RecreateWorktreeOperation[] = []
  try {
    for (const operation of plan.worktreeOperations) {
      if (operation.kind === "remove" && existsSync(operation.repo.task_path) && await isRepoDirty(operation.repo.task_path)) {
        throw new Error(`Worktree '${operation.repo.name}' is dirty; recreate aborted before mutation`)
      }
      if (operation.kind === "create" && existsSync(operation.repo.task_path)) {
        throw new Error(`Destination worktree path already exists: ${operation.repo.task_path}`)
      }
    }
    for (const operation of plan.worktreeOperations.filter((op) => op.kind === "remove")) {
      await removeWorktree(operation.repo.main_path, operation.repo.task_path)
      removed.push(operation)
    }
    for (const operation of plan.worktreeOperations.filter((op) => op.kind === "create")) {
      await createWorktree(operation.repo.main_path, operation.repo.task_path, plan.desired.branch)
      created.push(operation)
    }
    writeWorkspace(plan.desired)
    return { ok: true }
  } catch (error) {
    const rollbackErrors: string[] = []
    for (const operation of created.reverse()) {
      try { await removeWorktree(operation.repo.main_path, operation.repo.task_path) } catch (err) { rollbackErrors.push(String(err)) }
    }
    for (const operation of removed.reverse()) {
      try { await createWorktree(operation.repo.main_path, operation.repo.task_path, plan.desired.branch) } catch (err) { rollbackErrors.push(String(err)) }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: rollbackErrors.length ? `${message}; rollback errors: ${rollbackErrors.join("; ")}` : message }
  }
}
