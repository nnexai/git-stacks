// Canonical implementation owned by @git-stacks/core.
import { z } from "zod"
import type { ZodError } from "zod"
import { parse, stringify } from "yaml"
import { readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs"
import { join, dirname } from "path"
import {
  WORKSPACES_DIR,
  GLOBAL_CONFIG_FILE,
  DEFAULT_WORKSPACE_ROOT,
  REGISTRY_FILE,
  TEMPLATES_DIR,
  expandHome,
} from "./paths"
import { createHash } from "node:crypto"
import { atomicReplaceSync, acquireMutationLeaseSync, withMutationLeaseSync } from "./persistence"

// --- In-memory index (ENGN-04/05/06) ---

const workspaceIndex = new Map<string, Workspace>()
const templateIndex = new Map<string, Template>()
let workspaceListPopulated = false
let templateListPopulated = false

/** Mutable seam for test isolation — tests call _cache.workspaces.clear() in beforeEach. */
export const _cache = {
  workspaces: workspaceIndex,
  templates: templateIndex,
  resetList() {
    workspaceListPopulated = false
    templateListPopulated = false
  },
}

export function invalidateConfigCache(): void {
  workspaceIndex.clear()
  templateIndex.clear()
  workspaceListPopulated = false
  templateListPopulated = false
}

// --- Error formatting ---

export function formatZodError(err: ZodError): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.join(".")
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join("; ")
}

// --- Schemas ---

export const RepoTypeSchema = z.enum(["java", "typescript", "other"])
export type RepoType = z.infer<typeof RepoTypeSchema>

export const ForgeTypeSchema = z.enum(["github", "gitlab", "gitea"]).optional()
export type ForgeType = z.infer<typeof ForgeTypeSchema>
export const ForgeIntegrationConfigSchema = z.object({
  enabled: z.boolean().optional(),
  base_url: z.string().url().optional(),
})
export type ForgeIntegrationConfig = z.infer<typeof ForgeIntegrationConfigSchema>

export const ForgeRepoMetadataSchema = z.object({
  forge: z.enum(["github", "gitlab", "gitea"]),
  base_url: z.string().url().optional(),
  repo_path: z.string().min(1).optional(),
})
export type ForgeRepoMetadata = z.infer<typeof ForgeRepoMetadataSchema>

export const FileSyncEntrySchema = z.object({
  source: z.string(),
  target: z.string(),
  git_exclude: z.boolean().optional(),
})
export type FileSyncEntry = z.infer<typeof FileSyncEntrySchema>

export const FilesSchema = z
  .object({
    copy: z.array(z.string()).optional(),
    symlink: z.array(z.string()).optional(),
    sync: z.array(FileSyncEntrySchema).optional(),
  })
  .optional()
export type Files = z.infer<typeof FilesSchema>

export const ShellIdentifierSchema = z.string().regex(
  /^[A-Za-z_][A-Za-z0-9_]*$/,
  "Must be a shell identifier (letters, digits, and underscores; cannot start with a digit)"
)
export const PortsSchema = z.record(ShellIdentifierSchema, z.number().nullable()).optional()
export type Ports = z.infer<typeof PortsSchema>

const LabelSchema = z.string().regex(
  /^[A-Za-z0-9._:-]+$/,
  "Label may only contain letters, digits, dots, colons, hyphens, underscores"
)

/** Shared name validation — rejects path separators, traversal, and shell metacharacters. */
export const NameSchema = z.string()
  .min(1, "Name must not be empty")
  .regex(/^[A-Za-z0-9._-]+$/, "Name may only contain letters, digits, dots, hyphens, and underscores")
  .refine((name) => name !== "." && name !== "..", "Name must not be '.' or '..'")

// --- Registry ---

export const RepoRegistryEntrySchema = z.object({
  name: NameSchema,
  schema_version: z.string().default("1"),
  local_path: z.string(),
  default_branch: z.string().default("main"),
  type: RepoTypeSchema.default("other"),
  forge: ForgeTypeSchema,
  forge_metadata: ForgeRepoMetadataSchema.optional(),
  is_dir: z.boolean().default(false),
})
export type RepoRegistryEntry = z.infer<typeof RepoRegistryEntrySchema>

export const RepoRegistrySchema = z.array(RepoRegistryEntrySchema).default([])
export type RepoRegistry = z.infer<typeof RepoRegistrySchema>

// --- Templates ---

export const TemplateRepoSchema = z.object({
  repo: z.string(),                                    // registry name
  mode: z.enum(["trunk", "worktree", "dir"]).default("worktree"),
  base_branch: z.string().optional(),                  // overrides registry default_branch
  branch_pattern: z.string().optional(),               // e.g. "feature/<workspace-name>"
  commands: z.record(z.string(), z.string()).optional(),
})
export type TemplateRepo = z.infer<typeof TemplateRepoSchema>

export const TemplateSchema = z.object({
  name: NameSchema,
  schema_version: z.string().default("1"),
  description: z.string().optional(),
  repos: z.array(TemplateRepoSchema).default([]),
  hooks: z.object({
    pre_create: z.array(z.string()).optional(),
    post_create: z.array(z.string()).optional(),
    pre_open: z.array(z.string()).optional(),
    post_open: z.array(z.string()).optional(),
    pre_remove: z.array(z.string()).optional(),
    post_merge: z.array(z.string()).optional(),
    pre_close: z.array(z.string()).optional(),
    post_close: z.array(z.string()).optional(),
    pre_clean: z.array(z.string()).optional(),
    post_clean: z.array(z.string()).optional(),
    pre_merge: z.array(z.string()).optional(),
    post_remove: z.array(z.string()).optional(),
  }).optional(),
  env: z.record(ShellIdentifierSchema, z.string()).optional(),
  env_file: z.string().optional(),
  files: FilesSchema,
  integrations: z.record(z.string(), z.unknown()).optional(),
  includes: z.array(z.string()).optional(),
  ports: PortsSchema,
  labels: z.array(LabelSchema).optional(),
  commands: z.record(z.string(), z.string()).optional(),
})
export type Template = z.infer<typeof TemplateSchema>


const WorkspaceRepoHooksSchema = z.object({
  pre_open: z.array(z.string()).optional(),
  pre_clean: z.array(z.string()).optional(),
})

const WorkspaceRepoBaseSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string(),
  repo: z.string(),           // registry name — replaces 'stack'
  type: RepoTypeSchema,
  main_path: z.string().transform(expandHome),
  base_branch: z.string().optional(),  // base branch for merge/sync resolution
  hooks: WorkspaceRepoHooksSchema.optional(),
  files: FilesSchema,
  commands: z.record(z.string(), z.string()).optional(),
})
export const WorktreeRepoSchema = WorkspaceRepoBaseSchema.extend({
  mode: z.literal("worktree"),
  task_path: z.string().transform(expandHome),
})
export const TrunkRepoSchema = WorkspaceRepoBaseSchema.extend({
  mode: z.literal("trunk"),
  task_path: z.string().transform(expandHome).optional(),
})
export const DirRepoSchema = WorkspaceRepoBaseSchema.extend({
  mode: z.literal("dir"),
  task_path: z.string().transform(expandHome).optional(),
})
export const WorkspaceRepoSchema = z.discriminatedUnion("mode", [
  WorktreeRepoSchema,
  TrunkRepoSchema,
  DirRepoSchema,
])
export type WorkspaceRepo = z.infer<typeof WorkspaceRepoSchema>
export type WorktreeRepo = z.infer<typeof WorktreeRepoSchema>
export type TrunkRepo = z.infer<typeof TrunkRepoSchema>
export type DirRepo = z.infer<typeof DirRepoSchema>
export type GitWorkspaceRepo = WorktreeRepo | TrunkRepo

export const WorkspaceSettingsSchema = z.object({
  /** Per-integration overrides keyed by integration id, e.g. { cmux: { enabled: false } } */
  integrations: z.record(z.string(), z.unknown()).optional(),
})
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>

export const WorkspaceSourceSchema = z.object({
  kind: z.literal("forge"),
  forge: z.enum(["gitlab", "gitea", "github"]),
  base_url: z.string().url(),
  url: z.string().url(),
  change_type: z.enum(["mr", "pr"]),
  change_number: z.number().int().positive(),
  repo: z.string().min(1),
  repo_path: z.string().min(1),
  source_branch: z.string().min(1),
  source_ref: z.string().min(1),
  target_branch: z.string().min(1),
  web_url: z.string().url(),
  fetched_ref: z.string().min(1),
  title: z.string().optional(),
})
export type WorkspaceSource = z.infer<typeof WorkspaceSourceSchema>

const WorkspaceHooksSchema = z.object({
  pre_create: z.array(z.string()).optional(),
  post_create: z.array(z.string()).optional(),
  pre_open: z.array(z.string()).optional(),
  post_open: z.array(z.string()).optional(),
  post_merge: z.array(z.string()).optional(),
  pre_remove: z.array(z.string()).optional(),
  pre_close: z.array(z.string()).optional(),
  post_close: z.array(z.string()).optional(),
  pre_clean: z.array(z.string()).optional(),
  post_clean: z.array(z.string()).optional(),
  pre_merge: z.array(z.string()).optional(),
  post_remove: z.array(z.string()).optional(),
})

export const WorkspaceSchema = z.object({
  id: z.string().uuid().optional(),
  name: NameSchema,
  // Migration strategy: bump default when schema changes; read-time migration functions keyed by version
  schema_version: z.string().default("1"),
  description: z.string().optional(),
  branch: z.string(),
  created: z.string(),
  last_opened: z.string().optional(),   // ISO timestamp, updated by openWorkspace
  archived: z.literal(true).optional(),
  archived_at: z.string().datetime({ offset: true }).optional(),
  template: z.string().optional(),      // informational: source template name
  cmux_workspace_id: z.string().optional(),
  hooks: WorkspaceHooksSchema.optional(),
  settings: WorkspaceSettingsSchema.optional(),
  source: WorkspaceSourceSchema.optional(),
  repos: z.array(WorkspaceRepoSchema).default([]),
  env: z.record(ShellIdentifierSchema, z.string()).optional(),
  env_file: z.string().optional(),
  files: FilesSchema,
  ports: PortsSchema,
  labels: z.array(LabelSchema).optional(),
  pinned: z.boolean().optional(),
  priority: z.number().int().min(-2147483648).max(2147483647).optional(),
  commands: z.record(z.string(), z.string()).optional(),
}).superRefine((workspace, context) => {
  const archived = workspace.archived === true
  const hasArchivedAt = workspace.archived_at !== undefined
  if (archived === hasArchivedAt) return
  context.addIssue({
    code: "custom",
    path: archived ? ["archived_at"] : ["archived"],
    message: "archived and archived_at must either both be present or both be omitted",
  })
})
export type Workspace = z.infer<typeof WorkspaceSchema>

export type WorkspaceDefinitionGuard = {
  readonly id: string | undefined
  readonly name: string
  readonly path: string
  readonly fingerprint: string
  readonly workspace: Workspace
}

export class WorkspaceDefinitionConflictError extends Error {
  readonly code = "workspace_definition_conflict" as const
  constructor(message: string) {
    super(message)
    this.name = "WorkspaceDefinitionConflictError"
  }
}

export const GlobalConfigSchema = z.object({
  workspace_root: z.string().default(DEFAULT_WORKSPACE_ROOT).transform(expandHome),
  /** Per-integration config keyed by integration id, e.g. { vscode: { enabled: true, cmd: "code" } } */
  integrations: z.record(z.string(), z.unknown()).default({}),
  ports: z.object({
    range_start: z.number().int().default(10000),
    range_end: z.number().int().default(65000),
  }).default(() => ({ range_start: 10000, range_end: 65000 })),
  secrets: z.object({
    resolvers: z.array(z.string()).optional(),
  }).optional(),
})
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>

// --- Helpers ---

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

// Use structural typing to avoid Zod's internal generic complexity
function readYaml<T>(path: string, schema: { parse: (data: unknown) => T }): T {
  const raw = readFileSync(path, "utf-8")
  try {
    return schema.parse(parse(raw))
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      throw new Error(`Invalid config at ${path}: ${formatZodError(err as ZodError)}`)
    }
    throw err
  }
}

function writeYaml(path: string, data: unknown) {
  ensureDir(dirname(path))
  atomicReplaceSync(path, stringify(data), { mode: 0o600 })
}

// --- Scan-based lookup helpers ---

type WorkspaceLookup = { data: Workspace; filePath: string }

function findWorkspaceFile(name: string): WorkspaceLookup | null {
  if (!existsSync(WORKSPACES_DIR)) return null
  const matches: WorkspaceLookup[] = []
  for (const f of readdirSync(WORKSPACES_DIR).filter((f) => f.endsWith(".yml"))) {
    const filePath = join(WORKSPACES_DIR, f)
    try {
      const raw = readFileSync(filePath, "utf-8")
      const parsed = WorkspaceSchema.safeParse(parse(raw))
      if (parsed.success && parsed.data.name === name) {
        matches.push({ data: parsed.data, filePath })
      }
    } catch {
      // skip unreadable files — same policy as listWorkspaces
    }
  }
  if (matches.length > 1) {
    console.error(`[git-stacks] Warning: multiple workspaces with name '${name}' — using first match`)
  }
  return matches[0] ?? null
}

type TemplateLookup = { data: Template; filePath: string }

function findTemplateFile(name: string): TemplateLookup | null {
  if (!existsSync(TEMPLATES_DIR)) return null
  const matches: TemplateLookup[] = []
  for (const f of readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".yml"))) {
    const filePath = join(TEMPLATES_DIR, f)
    try {
      const raw = readFileSync(filePath, "utf-8")
      const parsed = TemplateSchema.safeParse(parse(raw))
      if (parsed.success && parsed.data.name === name) {
        matches.push({ data: parsed.data, filePath })
      }
    } catch {
      // skip unreadable files — same policy as listTemplates
    }
  }
  if (matches.length > 1) {
    console.error(`[git-stacks] Warning: multiple templates with name '${name}' — using first match`)
  }
  return matches[0] ?? null
}

// --- Global Config ---

export function readGlobalConfig(): GlobalConfig {
  if (!existsSync(GLOBAL_CONFIG_FILE)) return GlobalConfigSchema.parse({})
  return readYaml(GLOBAL_CONFIG_FILE, GlobalConfigSchema)
}

export function writeGlobalConfig(config: GlobalConfig) {
  writeYaml(GLOBAL_CONFIG_FILE, config)
}

export function updateGlobalConfig(intent: (current: GlobalConfig) => GlobalConfig): GlobalConfig {
  return withMutationLeaseSync(GLOBAL_CONFIG_FILE, () => {
    const next = GlobalConfigSchema.parse(intent(readGlobalConfig()))
    writeYaml(GLOBAL_CONFIG_FILE, next)
    return next
  })
}

// --- Workspaces ---

export function workspacePath(name: string): string {
  return join(WORKSPACES_DIR, `${name}.yml`)
}

export function workspaceExists(name: string): boolean {
  if (workspaceIndex.has(name)) return true
  return findWorkspaceFile(name) !== null
}

export function readWorkspace(name: string): Workspace {
  const cached = workspaceIndex.get(name)
  if (cached) return cached
  const found = findWorkspaceFile(name)
  if (!found) throw new Error(`Workspace '${name}' not found.`)
  workspaceIndex.set(name, found.data)
  return found.data
}

export function writeWorkspace(workspace: Workspace) {
  const parsed = WorkspaceSchema.safeParse(workspace)
  if (!parsed.success) throw new Error(`Invalid workspace: ${formatZodError(parsed.error)}`)
  ensureDir(WORKSPACES_DIR)
  writeYaml(workspacePath(parsed.data.name), parsed.data)
  workspaceIndex.set(parsed.data.name, parsed.data)
  workspaceListPopulated = false
}

export function updateWorkspace(name: string, intent: (current: Workspace) => Workspace): Workspace {
  const path = workspaceFilePath(name)
  return withMutationLeaseSync(path, () => {
    const current = readYaml(path, WorkspaceSchema)
    const next = WorkspaceSchema.parse(intent(current))
    if (next.name !== name) throw new Error("A workspace field intent cannot rename its target")
    writeYaml(path, next)
    workspaceIndex.set(name, next)
    workspaceListPopulated = false
    return next
  })
}

/** Locate the persisted file backing a name-based workspace lookup. */
export function workspaceFilePath(name: string): string {
  const found = findWorkspaceFile(name)
  if (!found) throw new Error(`Workspace '${name}' not found.`)
  return found.filePath
}

function definitionFingerprint(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

function readGuardedWorkspace(guard: WorkspaceDefinitionGuard): { workspace: Workspace; raw: string } {
  let raw: string
  let workspace: Workspace
  try {
    raw = readFileSync(guard.path, "utf-8")
    workspace = WorkspaceSchema.parse(parse(raw))
  } catch {
    throw new WorkspaceDefinitionConflictError(`Workspace definition changed or disappeared: ${guard.path}`)
  }
  if (
    workspace.name !== guard.name
    || workspace.id !== guard.id
    || definitionFingerprint(raw) !== guard.fingerprint
  ) {
    throw new WorkspaceDefinitionConflictError(`Workspace definition changed since inspection: ${guard.name}`)
  }
  return { workspace, raw }
}

export function inspectWorkspaceDefinition(name: string, expectedId?: string): WorkspaceDefinitionGuard {
  let path: string
  let raw: string
  let workspace: Workspace
  try {
    path = workspaceFilePath(name)
    raw = readFileSync(path, "utf-8")
    workspace = WorkspaceSchema.parse(parse(raw))
  } catch (error) {
    if (expectedId !== undefined) {
      throw new WorkspaceDefinitionConflictError(`Workspace definition changed or disappeared before mutation: ${name}`)
    }
    throw error
  }
  if (workspace.name !== name || (expectedId !== undefined && workspace.id !== expectedId)) {
    throw new WorkspaceDefinitionConflictError(`Workspace identity changed before mutation: ${name}`)
  }
  return { id: workspace.id, name, path, fingerprint: definitionFingerprint(raw), workspace }
}

export type WorkspaceDefinitionLease = {
  readonly workspace: Workspace
  deleteDefinition(): void
  release(): void
}

export function acquireWorkspaceDefinitionGuard(guard: WorkspaceDefinitionGuard): WorkspaceDefinitionLease {
  const lease = acquireMutationLeaseSync(guard.path)
  try {
    const workspace = readGuardedWorkspace(guard).workspace
    let deleted = false
    return {
      workspace,
      deleteDefinition() {
        if (deleted) return
        readGuardedWorkspace(guard)
        unlinkSync(guard.path)
        workspaceIndex.delete(guard.name)
        workspaceListPopulated = false
        deleted = true
      },
      release: () => lease.release(),
    }
  } catch (error) {
    lease.release()
    throw error
  }
}

export function updateWorkspaceGuarded(
  guard: WorkspaceDefinitionGuard,
  intent: (current: Workspace) => Workspace,
): Workspace {
  const lease = acquireWorkspaceDefinitionGuard(guard)
  try {
    const next = WorkspaceSchema.parse(intent(lease.workspace))
    if (next.name !== guard.name || next.id !== guard.id) {
      throw new WorkspaceDefinitionConflictError("A guarded workspace mutation cannot change identity")
    }
    writeYaml(guard.path, next)
    workspaceIndex.set(next.name, next)
    workspaceListPopulated = false
    return next
  } finally {
    lease.release()
  }
}

export function deleteWorkspace(name: string): void {
  const path = workspaceFilePath(name)
  withMutationLeaseSync(path, () => {
    unlinkSync(path)
    workspaceIndex.delete(name)
    workspaceListPopulated = false
  })
}

function scanWorkspaces(): Workspace[] {
  workspaceIndex.clear()
  if (!existsSync(WORKSPACES_DIR)) {
    workspaceListPopulated = true
    return []
  }
  for (const f of readdirSync(WORKSPACES_DIR).filter((f) => f.endsWith(".yml"))) {
    const filePath = join(WORKSPACES_DIR, f)
    try {
      const raw = readFileSync(filePath, "utf-8")
      const parsed = WorkspaceSchema.safeParse(parse(raw))
      if (parsed.success) {
        workspaceIndex.set(parsed.data.name, parsed.data)
      } else {
        console.error(`[git-stacks] Skipping corrupt workspace '${f}': ${formatZodError(parsed.error)}`)
      }
    } catch (err) {
      console.error(`[git-stacks] Skipping unreadable workspace '${f}': ${err}`)
    }
  }
  workspaceListPopulated = true
  return Array.from(workspaceIndex.values())
}

export function listWorkspaces(): Workspace[] {
  if (workspaceListPopulated) return Array.from(workspaceIndex.values())
  return scanWorkspaces()
}

/** Rebuild the workspace index from disk for authoritative service projections. */
export function listWorkspacesUncached(): Workspace[] {
  workspaceListPopulated = false
  return scanWorkspaces()
}

// --- Registry ---

export function readRegistry(): RepoRegistryEntry[] {
  if (!existsSync(REGISTRY_FILE)) return []
  try {
    const raw = readFileSync(REGISTRY_FILE, "utf-8")
    const parsed = RepoRegistrySchema.safeParse(parse(raw))
    if (parsed.success) return parsed.data
    console.error(`[git-stacks] Registry parse error: ${formatZodError(parsed.error)}`)
    return []
  } catch (err) {
    console.error(`[git-stacks] Cannot read registry: ${err}`)
    return []
  }
}

export function writeRegistry(entries: RepoRegistryEntry[]) {
  const parsed = RepoRegistrySchema.safeParse(entries)
  if (!parsed.success) {
    throw new Error(`Invalid registry: ${formatZodError(parsed.error)}`)
  }
  ensureDir(dirname(REGISTRY_FILE))
  writeYaml(REGISTRY_FILE, parsed.data)
}

export function updateRegistry(intent: (current: RepoRegistryEntry[]) => RepoRegistryEntry[]): RepoRegistryEntry[] {
  return withMutationLeaseSync(REGISTRY_FILE, () => {
    const next = RepoRegistrySchema.parse(intent(readRegistry()))
    writeYaml(REGISTRY_FILE, next)
    return next
  })
}

export function listRegistryEntries(): RepoRegistryEntry[] {
  return readRegistry()
}

// --- Templates ---

export function templatePath(name: string): string {
  return join(TEMPLATES_DIR, `${name}.yml`)
}

export function templateExists(name: string): boolean {
  if (templateIndex.has(name)) return true
  return findTemplateFile(name) !== null
}

export function readTemplate(name: string): Template {
  const cached = templateIndex.get(name)
  if (cached) return cached
  const found = findTemplateFile(name)
  if (!found) throw new Error(`Template '${name}' not found.`)
  templateIndex.set(name, found.data)
  return found.data
}

export function writeTemplate(template: Template) {
  ensureDir(TEMPLATES_DIR)
  writeYaml(templatePath(template.name), template)
  templateIndex.set(template.name, template)
  templateListPopulated = false
}

export function updateTemplate(name: string, intent: (current: Template) => Template): Template {
  const path = templatePath(name)
  return withMutationLeaseSync(path, () => {
    const current = readYaml(path, TemplateSchema)
    const next = TemplateSchema.parse(intent(current))
    if (next.name !== name) throw new Error("A template field intent cannot rename its target")
    writeYaml(path, next)
    templateIndex.set(name, next)
    templateListPopulated = false
    return next
  })
}

export function deleteTemplate(name: string): void {
  unlinkSync(templatePath(name))
  templateIndex.delete(name)
  templateListPopulated = false
}

export function listTemplates(): Template[] {
  if (templateListPopulated) return Array.from(templateIndex.values())
  if (!existsSync(TEMPLATES_DIR)) return []
  for (const f of readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".yml"))) {
    const filePath = join(TEMPLATES_DIR, f)
    try {
      const raw = readFileSync(filePath, "utf-8")
      const parsed = TemplateSchema.safeParse(parse(raw))
      if (parsed.success) {
        templateIndex.set(parsed.data.name, parsed.data)
      } else {
        console.error(`[git-stacks] Skipping corrupt template '${f}': ${formatZodError(parsed.error)}`)
      }
    } catch (err) {
      console.error(`[git-stacks] Skipping unreadable template '${f}': ${err}`)
    }
  }
  templateListPopulated = true
  return Array.from(templateIndex.values())
}

/** Rebuild the template index from disk for authoritative service projections. */
export function listTemplatesUncached(): Template[] {
  templateIndex.clear()
  templateListPopulated = false
  return listTemplates()
}

// --- Branch pattern expansion ---

export function expandBranchPattern(pattern: string, workspaceName: string): string {
  return pattern.replace(/<workspace-name>/g, workspaceName)
}

export { expandHome }

// --- Repo-mode helpers ---

/**
 * Returns the active working-directory path for a workspace repo:
 * - worktree: task_path (the checked-out worktree)
 * - trunk / dir: main_path (the shared clone / bare directory)
 *
 * Use this everywhere you need "the path you work in for this repo" without
 * caring whether git operations are involved.
 */
export function getRepoPath(repo: WorkspaceRepo): string {
  return repo.mode === "worktree" ? repo.task_path : repo.main_path
}

/**
 * Type guard: narrows a WorkspaceRepo to one whose task_path is a string.
 * Only worktree-mode repos carry a task_path; trunk and dir repos do not.
 */
export function isWorktreeRepo(repo: WorkspaceRepo): repo is WorktreeRepo {
  return repo.mode === "worktree"
}

export function isGitRepo(repo: WorkspaceRepo): repo is GitWorkspaceRepo {
  return repo.mode !== "dir"
}
