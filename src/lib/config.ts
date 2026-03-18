import { z } from "zod"
import type { ZodError } from "zod"
import { parse, stringify } from "yaml"
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs"
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

export const FilesSchema = z
  .object({
    copy: z.array(z.string()).optional(),
    symlink: z.array(z.string()).optional(),
  })
  .optional()
export type Files = z.infer<typeof FilesSchema>

// --- Registry ---

export const RepoRegistryEntrySchema = z.object({
  name: z.string(),
  schema_version: z.string().default("1"),
  local_path: z.string(),
  default_branch: z.string().default("main"),
  type: RepoTypeSchema.default("other"),
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
  name: z.string(),
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
  }).optional(),
  env: z.record(z.string()).optional(),
  env_file: z.string().optional(),
  files: FilesSchema,
  integrations: z.record(z.unknown()).optional(),
})
export type Template = z.infer<typeof TemplateSchema>


const WorkspaceRepoHooksSchema = z.object({
  pre_open: z.array(z.string()).optional(),
})

export const WorkspaceRepoSchema = z.object({
  name: z.string(),
  repo: z.string(),           // registry name — replaces 'stack'
  type: RepoTypeSchema,
  mode: z.enum(["trunk", "worktree"]),
  main_path: z.string(),
  task_path: z.string(),
  base_branch: z.string().optional(),  // base branch for merge/sync resolution
  hooks: WorkspaceRepoHooksSchema.optional(),
  files: FilesSchema,
})
export type WorkspaceRepo = z.infer<typeof WorkspaceRepoSchema>

export const WorkspaceSettingsSchema = z.object({
  /** Per-integration overrides keyed by integration id, e.g. { cmux: { enabled: false } } */
  integrations: z.record(z.unknown()).optional(),
})
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>

const WorkspaceHooksSchema = z.object({
  pre_open: z.array(z.string()).optional(),
  post_open: z.array(z.string()).optional(),
  post_merge: z.array(z.string()).optional(),
  pre_remove: z.array(z.string()).optional(),
})

export const WorkspaceSchema = z.object({
  name: z.string(),
  // Migration strategy: bump default when schema changes; read-time migration functions keyed by version
  schema_version: z.string().default("1"),
  description: z.string().optional(),
  branch: z.string(),
  created: z.string(),
  template: z.string().optional(),      // informational: source template name
  cmux_workspace_id: z.string().optional(),
  hooks: WorkspaceHooksSchema.optional(),
  settings: WorkspaceSettingsSchema.optional(),
  repos: z.array(WorkspaceRepoSchema).default([]),
  env: z.record(z.string()).optional(),
  env_file: z.string().optional(),
  files: FilesSchema,
})
export type Workspace = z.infer<typeof WorkspaceSchema>

export const GlobalConfigSchema = z.object({
  workspace_root: z.string().default(DEFAULT_WORKSPACE_ROOT),
  /** Per-integration config keyed by integration id, e.g. { vscode: { enabled: true, cmd: "code" } } */
  integrations: z.record(z.unknown()).default({}),
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
  writeFileSync(path, stringify(data), "utf-8")
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
  return existsSync(workspacePath(name))
}

export function readWorkspace(name: string): Workspace {
  return readYaml(workspacePath(name), WorkspaceSchema)
}

export function writeWorkspace(workspace: Workspace) {
  ensureDir(WORKSPACES_DIR)
  writeYaml(workspacePath(workspace.name), workspace)
}

export function listWorkspaces(): Workspace[] {
  if (!existsSync(WORKSPACES_DIR)) return []
  const results: Workspace[] = []
  for (const f of readdirSync(WORKSPACES_DIR).filter((f) => f.endsWith(".yml"))) {
    const name = f.replace(".yml", "")
    try {
      const raw = readFileSync(workspacePath(name), "utf-8")
      const parsed = WorkspaceSchema.safeParse(parse(raw))
      if (parsed.success) {
        results.push(parsed.data)
      } else {
        console.error(`[git-stacks] Skipping corrupt workspace '${name}': ${formatZodError(parsed.error)}`)
      }
    } catch (err) {
      console.error(`[git-stacks] Skipping unreadable workspace '${name}': ${err}`)
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
  return existsSync(templatePath(name))
}

export function readTemplate(name: string): Template {
  return readYaml(templatePath(name), TemplateSchema)
}

export function writeTemplate(template: Template) {
  ensureDir(TEMPLATES_DIR)
  writeYaml(templatePath(template.name), template)
}

export function listTemplates(): Template[] {
  if (!existsSync(TEMPLATES_DIR)) return []
  const results: Template[] = []
  for (const f of readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".yml"))) {
    const name = f.replace(".yml", "")
    try {
      const raw = readFileSync(templatePath(name), "utf-8")
      const parsed = TemplateSchema.safeParse(parse(raw))
      if (parsed.success) {
        results.push(parsed.data)
      } else {
        console.error(`[git-stacks] Skipping corrupt template '${name}': ${formatZodError(parsed.error)}`)
      }
    } catch (err) {
      console.error(`[git-stacks] Skipping unreadable template '${name}': ${err}`)
    }
  }
  return results
}

// --- Branch pattern expansion ---

export function expandBranchPattern(pattern: string, workspaceName: string): string {
  return pattern.replace(/<workspace-name>/g, workspaceName)
}

export { expandHome }
