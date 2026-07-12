import { join } from "path"
import {
  NameSchema,
  readGlobalConfig,
  readRegistry,
  listTemplates,
  workspaceExists,
  type RepoRegistryEntry,
  type Template,
  type Workspace,
  type WorkspaceRepo,
} from "./config"
import { composeTemplates } from "./composition"
import { getTasksDir } from "./paths"
import {
  createWorkspace,
  type CreateWorkspaceInputs,
} from "./workspace-lifecycle"
import { NATIVE_MODEL_LIMITS, WorkspaceCreationCatalogSchema, type WorkspaceCreationCatalog } from "./service/contract"

export type WorkspaceCreationSource =
  | { kind: "template"; template: string }
  | { kind: "repositories"; repositories: string[] }

export type WorkspaceCreationRequest = {
  name: string
  branch: string
  source: WorkspaceCreationSource
}

export type WorkspaceCreationErrorCode =
  | "invalid_name"
  | "invalid_branch"
  | "invalid_source"
  | "not_found"
  | "already_exists"
  | "capacity_exceeded"
  | "creation_failed"

export type WorkspaceCreationPlan = {
  request: WorkspaceCreationRequest
  inputs: CreateWorkspaceInputs
}

export type WorkspaceCreationFailure = {
  ok: false
  code: WorkspaceCreationErrorCode
  error: string
  rollbackErrors: string[]
}

export type WorkspaceCreationPlanResult =
  | { ok: true; plan: WorkspaceCreationPlan }
  | WorkspaceCreationFailure

export type WorkspaceCreationResult =
  | { ok: true; workspace: Workspace }
  | WorkspaceCreationFailure

export type WorkspaceCreationDependencies = {
  readRegistry: () => RepoRegistryEntry[]
  composeTemplates: (names: string[]) => Template
  workspaceExists: (name: string) => boolean
  getTasksDir: () => string
  validateBranch: (branch: string) => Promise<boolean>
  createWorkspace: typeof createWorkspace
}

export type ProgressCallback = (message: string) => void

export type WorkspaceCreationCatalogDependencies = {
  listTemplates: () => Template[]
  readRegistry: () => RepoRegistryEntry[]
}

export function getWorkspaceCreationCatalog(
  dependencies: Partial<WorkspaceCreationCatalogDependencies> = {},
): WorkspaceCreationCatalog {
  const deps = { listTemplates, readRegistry, ...dependencies }
  return WorkspaceCreationCatalogSchema.parse({
    templates: deps.listTemplates().map((template) => ({
      name: template.name,
      ...(template.description ? { description: template.description } : {}),
      repository_count: template.repos.length,
      command_count: Object.keys(template.commands ?? {}).length + template.repos.reduce((sum, repo) => sum + Object.keys(repo.commands ?? {}).length, 0),
      labels: [...(template.labels ?? [])],
    })).sort((a, b) => a.name.localeCompare(b.name)),
    repositories: deps.readRegistry().map((repository) => ({
      name: repository.name, type: repository.type, default_branch: repository.default_branch,
    })).sort((a, b) => a.name.localeCompare(b.name)),
    native_model: NATIVE_MODEL_LIMITS,
  })
}

async function validateBranchWithGit(branch: string): Promise<boolean> {
  const proc = Bun.spawn(["git", "check-ref-format", "--branch", branch], {
    stdout: "ignore",
    stderr: "ignore",
  })
  return (await proc.exited) === 0
}

const productionDependencies = (): WorkspaceCreationDependencies => ({
  readRegistry,
  composeTemplates,
  workspaceExists,
  getTasksDir: () => getTasksDir(readGlobalConfig().workspace_root),
  validateBranch: validateBranchWithGit,
  createWorkspace,
})

function failure(code: WorkspaceCreationErrorCode, error: string): WorkspaceCreationFailure {
  return { ok: false, code, error, rollbackErrors: [] }
}

function resolveRepo(entry: RepoRegistryEntry, name: string, tasksDir: string): WorkspaceRepo {
  if (entry.is_dir) {
    return { name: entry.name, repo: entry.name, type: entry.type, mode: "dir", main_path: entry.local_path }
  }
  return {
    name: entry.name,
    repo: entry.name,
    type: entry.type,
    mode: "worktree",
    main_path: entry.local_path,
    task_path: join(tasksDir, name, entry.name),
    base_branch: entry.default_branch,
  }
}

function resolveTemplateRepo(
  entry: RepoRegistryEntry,
  templateRepo: Template["repos"][number],
  name: string,
  tasksDir: string,
): WorkspaceRepo {
  if (entry.is_dir || templateRepo.mode === "dir") {
    return {
      name: entry.name, repo: templateRepo.repo, type: entry.type, mode: "dir", main_path: entry.local_path,
      ...(templateRepo.commands ? { commands: { ...templateRepo.commands } } : {}),
    }
  }
  const mode = templateRepo.mode ?? "worktree"
  return {
    name: entry.name,
    repo: templateRepo.repo,
    type: entry.type,
    mode,
    main_path: entry.local_path,
    ...(mode === "worktree" ? { task_path: join(tasksDir, name, entry.name) } : {}),
    base_branch: templateRepo.base_branch ?? entry.default_branch,
    ...(templateRepo.commands ? { commands: { ...templateRepo.commands } } : {}),
  } as WorkspaceRepo
}

export async function planWorkspaceCreation(
  request: WorkspaceCreationRequest,
  dependencies: Partial<WorkspaceCreationDependencies> = {},
): Promise<WorkspaceCreationPlanResult> {
  const deps = { ...productionDependencies(), ...dependencies }
  const name = request.name?.trim()
  const parsedName = NameSchema.safeParse(name)
  if (!parsedName.success) return failure("invalid_name", parsedName.error.issues[0]?.message ?? "Invalid workspace name")

  const branch = request.branch?.trim()
  if (!branch || !(await deps.validateBranch(branch))) return failure("invalid_branch", "Invalid Git branch name")
  if (deps.workspaceExists(name)) return failure("already_exists", `Workspace '${name}' already exists.`)

  const registry = deps.readRegistry()
  const registryByName = new Map(registry.map((repo) => [repo.name, repo]))
  const tasksDir = deps.getTasksDir()
  let inputs: CreateWorkspaceInputs

  if (request.source?.kind === "template") {
    const templateName = request.source.template?.trim()
    if (!templateName) return failure("invalid_source", "A template is required")
    let template: Template
    try { template = deps.composeTemplates([templateName]) } catch (error) {
      return failure("not_found", error instanceof Error ? error.message : String(error))
    }
    if (template.repos.length === 0) return failure("invalid_source", "Template contains no repositories")
    const missing = template.repos.find((repo) => !registryByName.has(repo.repo))
    if (missing) return failure("not_found", `Repository '${missing.repo}' is not registered`)
    inputs = {
      wsName: name,
      branch,
      templateName,
      templateLabels: template.labels ? [...template.labels] : undefined,
      repos: template.repos.map((repo) => resolveTemplateRepo(registryByName.get(repo.repo)!, repo, name, tasksDir)),
      wsHooks: template.hooks ? structuredClone(template.hooks) : undefined,
      wsCommands: template.commands ? { ...template.commands } : undefined,
      wsEnv: template.env ? { ...template.env } : undefined,
      wsEnvFile: template.env_file,
      wsFiles: template.files ? structuredClone(template.files) : undefined,
      wsIntegrationSettings: template.integrations ? structuredClone(template.integrations) : undefined,
      wsPorts: template.ports ? { ...template.ports } : undefined,
    }
  } else if (request.source?.kind === "repositories") {
    const names = request.source.repositories ?? []
    if (names.length === 0 || names.some((repo) => !repo?.trim())) return failure("invalid_source", "Select at least one repository")
    if (new Set(names).size !== names.length) return failure("invalid_source", "Duplicate repositories are not allowed")
    const missing = names.find((repo) => !registryByName.has(repo))
    if (missing) return failure("not_found", `Repository '${missing}' is not registered`)
    inputs = { wsName: name, branch, repos: names.map((repo) => resolveRepo(registryByName.get(repo)!, name, tasksDir)) }
  } else {
    return failure("invalid_source", "Choose exactly one workspace source")
  }

  return { ok: true, plan: { request: { name, branch, source: request.source }, inputs } }
}

export async function createWorkspaceFromRequest(
  request: WorkspaceCreationRequest,
  onProgress?: ProgressCallback,
  dependencies: Partial<WorkspaceCreationDependencies> = {},
): Promise<WorkspaceCreationResult> {
  const deps = { ...productionDependencies(), ...dependencies }
  const planned = await planWorkspaceCreation(request, deps)
  if (!planned.ok) return planned
  const result = await deps.createWorkspace(planned.plan.inputs, onProgress)
  if (result.ok) return result
  return { ok: false, code: "creation_failed", error: result.error, rollbackErrors: result.rollbackErrors }
}
