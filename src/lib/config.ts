import { z } from "zod"
import type { ZodError } from "zod"
import { parse, stringify } from "yaml"
import { readFileSync, existsSync, mkdirSync, readdirSync, renameSync, openSync, writeSync, fsyncSync, closeSync } from "fs"
import { join, dirname } from "path"
import {
  WORKSPACES_DIR,
  GLOBAL_CONFIG_FILE,
  DEFAULT_WORKSPACE_ROOT,
  REGISTRY_FILE,
  TEMPLATES_DIR,
  expandHome,
} from "./paths"

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

export const FilesSchema = z
  .object({
    copy: z.array(z.string()).optional(),
    symlink: z.array(z.string()).optional(),
  })
  .optional()
export type Files = z.infer<typeof FilesSchema>

export const PortsSchema = z.record(z.string(), z.number().nullable()).optional()
export type Ports = z.infer<typeof PortsSchema>

/** Shared name validation — rejects path separators, traversal, and shell metacharacters. */
export const NameSchema = z.string()
  .min(1, "Name must not be empty")
  .regex(/^[A-Za-z0-9._-]+$/, "Name may only contain letters, digits, dots, hyphens, and underscores")

// --- Registry ---

export const RepoRegistryEntrySchema = z.object({
  name: NameSchema,
  schema_version: z.string().default("1"),
  local_path: z.string(),
  default_branch: z.string().default("main"),
  type: RepoTypeSchema.default("other"),
  forge: ForgeTypeSchema,
})
export type RepoRegistryEntry = z.infer<typeof RepoRegistryEntrySchema>

export const RepoRegistrySchema = z.array(RepoRegistryEntrySchema).default([])
export type RepoRegistry = z.infer<typeof RepoRegistrySchema>

// --- Templates ---

export const TemplateRepoSchema = z.object({
  repo: z.string(),                                    // registry name
  mode: z.enum(["trunk", "worktree"]).default("worktree"),
  base_branch: z.string().optional(),                  // overrides registry default_branch
  branch_pattern: z.string().optional(),               // e.g. "feature/<workspace-name>"
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
  env: z.record(z.string(), z.string()).optional(),
  env_file: z.string().optional(),
  files: FilesSchema,
  integrations: z.record(z.string(), z.unknown()).optional(),
  includes: z.array(z.string()).optional(),
  ports: PortsSchema,
})
export type Template = z.infer<typeof TemplateSchema>


const WorkspaceRepoHooksSchema = z.object({
  pre_open: z.array(z.string()).optional(),
  pre_clean: z.array(z.string()).optional(),
})

export const WorkspaceRepoSchema = z.object({
  name: z.string(),
  repo: z.string(),           // registry name — replaces 'stack'
  type: RepoTypeSchema,
  mode: z.enum(["trunk", "worktree"]),
  main_path: z.string().transform(expandHome),
  task_path: z.string().transform(expandHome),
  base_branch: z.string().optional(),  // base branch for merge/sync resolution
  hooks: WorkspaceRepoHooksSchema.optional(),
  files: FilesSchema,
})
export type WorkspaceRepo = z.infer<typeof WorkspaceRepoSchema>

export const WorkspaceSettingsSchema = z.object({
  /** Per-integration overrides keyed by integration id, e.g. { cmux: { enabled: false } } */
  integrations: z.record(z.string(), z.unknown()).optional(),
})
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>

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
  name: NameSchema,
  // Migration strategy: bump default when schema changes; read-time migration functions keyed by version
  schema_version: z.string().default("1"),
  description: z.string().optional(),
  branch: z.string(),
  created: z.string(),
  last_opened: z.string().optional(),   // ISO timestamp, updated by openWorkspace
  template: z.string().optional(),      // informational: source template name
  cmux_workspace_id: z.string().optional(),
  hooks: WorkspaceHooksSchema.optional(),
  settings: WorkspaceSettingsSchema.optional(),
  repos: z.array(WorkspaceRepoSchema).default([]),
  env: z.record(z.string(), z.string()).optional(),
  env_file: z.string().optional(),
  files: FilesSchema,
  ports: PortsSchema,
})
export type Workspace = z.infer<typeof WorkspaceSchema>

export const GlobalConfigSchema = z.object({
  workspace_root: z.string().default(DEFAULT_WORKSPACE_ROOT).transform(expandHome),
  /** Per-integration config keyed by integration id, e.g. { vscode: { enabled: true, cmd: "code" } } */
  integrations: z.record(z.string(), z.unknown()).default({}),
  ports: z.object({
    range_start: z.number().int().default(10000),
    range_end: z.number().int().default(65000),
  }).default(() => ({ range_start: 10000, range_end: 65000 })),
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
  const tmpPath = `${path}.tmp`
  const content = stringify(data)
  const fd = openSync(tmpPath, "w")
  try {
    writeSync(fd, content, 0, "utf-8")
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmpPath, path)
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

// --- Workspaces ---

export function workspacePath(name: string): string {
  return join(WORKSPACES_DIR, `${name}.yml`)
}

export function workspaceExists(name: string): boolean {
  return findWorkspaceFile(name) !== null
}

export function readWorkspace(name: string): Workspace {
  const found = findWorkspaceFile(name)
  if (!found) throw new Error(`Workspace '${name}' not found.`)
  return found.data
}

export function writeWorkspace(workspace: Workspace) {
  ensureDir(WORKSPACES_DIR)
  writeYaml(workspacePath(workspace.name), workspace)
}

export function listWorkspaces(): Workspace[] {
  if (!existsSync(WORKSPACES_DIR)) return []
  const results: Workspace[] = []
  for (const f of readdirSync(WORKSPACES_DIR).filter((f) => f.endsWith(".yml"))) {
    const filePath = join(WORKSPACES_DIR, f)
    try {
      const raw = readFileSync(filePath, "utf-8")
      const parsed = WorkspaceSchema.safeParse(parse(raw))
      if (parsed.success) {
        results.push(parsed.data)
      } else {
        console.error(`[git-stacks] Skipping corrupt workspace '${f}': ${formatZodError(parsed.error)}`)
      }
    } catch (err) {
      console.error(`[git-stacks] Skipping unreadable workspace '${f}': ${err}`)
    }
  }
  return results
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
  ensureDir(dirname(REGISTRY_FILE))
  writeYaml(REGISTRY_FILE, entries)
}

export function listRegistryEntries(): RepoRegistryEntry[] {
  return readRegistry()
}

// --- Templates ---

export function templatePath(name: string): string {
  return join(TEMPLATES_DIR, `${name}.yml`)
}

export function templateExists(name: string): boolean {
  return findTemplateFile(name) !== null
}

export function readTemplate(name: string): Template {
  const found = findTemplateFile(name)
  if (!found) throw new Error(`Template '${name}' not found.`)
  return found.data
}

export function writeTemplate(template: Template) {
  ensureDir(TEMPLATES_DIR)
  writeYaml(templatePath(template.name), template)
}

export function listTemplates(): Template[] {
  if (!existsSync(TEMPLATES_DIR)) return []
  const results: Template[] = []
  for (const f of readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".yml"))) {
    const filePath = join(TEMPLATES_DIR, f)
    try {
      const raw = readFileSync(filePath, "utf-8")
      const parsed = TemplateSchema.safeParse(parse(raw))
      if (parsed.success) {
        results.push(parsed.data)
      } else {
        console.error(`[git-stacks] Skipping corrupt template '${f}': ${formatZodError(parsed.error)}`)
      }
    } catch (err) {
      console.error(`[git-stacks] Skipping unreadable template '${f}': ${err}`)
    }
  }
  return results
}

// --- Branch pattern expansion ---

export function expandBranchPattern(pattern: string, workspaceName: string): string {
  return pattern.replace(/<workspace-name>/g, workspaceName)
}

export { expandHome }
