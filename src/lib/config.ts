import { z } from "zod"
import { parse, stringify } from "yaml"
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs"
import { join, dirname } from "path"
import {
  STACKS_DIR,
  WORKSPACES_DIR,
  GLOBAL_CONFIG_FILE,
  DEFAULT_WORKSPACE_ROOT,
  expandHome,
} from "./paths"

// --- Schemas ---

export const RepoTypeSchema = z.enum(["java", "typescript", "other"])
export type RepoType = z.infer<typeof RepoTypeSchema>

const HooksSchema = z.object({
  pre_create: z.array(z.string()).optional(),
  post_create: z.array(z.string()).optional(),
  pre_remove: z.array(z.string()).optional(),
  post_open: z.array(z.string()).optional(),
})

export const StackRepoSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: RepoTypeSchema.default("other"),
  default_mode: z.enum(["trunk", "worktree"]).default("worktree"),
  default_branch: z.string().default("main"),
  sync_strategy: z.enum(["rebase", "merge"]).optional(),
  hooks: HooksSchema.optional(),
  files: z
    .object({
      copy: z.array(z.string()).optional(),
      symlink: z.array(z.string()).optional(),
    })
    .optional(),
})
export type StackRepo = z.infer<typeof StackRepoSchema>

export const StackSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  repos: z.array(StackRepoSchema).default([]),
  integrations: z.record(z.unknown()).optional(),
  hooks: HooksSchema.optional(),
  env: z.record(z.string()).optional(),
  env_file: z.string().optional(),
})
export type Stack = z.infer<typeof StackSchema>

const WorkspaceRepoHooksSchema = z.object({
  pre_open: z.array(z.string()).optional(),
})

export const WorkspaceRepoSchema = z.object({
  name: z.string(),
  stack: z.string(),
  type: RepoTypeSchema,
  mode: z.enum(["trunk", "worktree"]),
  main_path: z.string(),
  task_path: z.string(),
  hooks: WorkspaceRepoHooksSchema.optional(),
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
})

export const WorkspaceSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  branch: z.string(),
  created: z.string(),
  cmux_workspace_id: z.string().optional(),
  hooks: WorkspaceHooksSchema.optional(),
  settings: WorkspaceSettingsSchema.optional(),
  repos: z.array(WorkspaceRepoSchema).default([]),
  env: z.record(z.string()).optional(),
  env_file: z.string().optional(),
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
  return schema.parse(parse(raw))
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

// --- Stacks ---

export function stackPath(name: string): string {
  return join(STACKS_DIR, `${name}.yml`)
}

export function stackExists(name: string): boolean {
  return existsSync(stackPath(name))
}

export function readStack(name: string): Stack {
  return readYaml(stackPath(name), StackSchema)
}

export function writeStack(stack: Stack) {
  ensureDir(STACKS_DIR)
  writeYaml(stackPath(stack.name), stack)
}

export function listStacks(): Stack[] {
  if (!existsSync(STACKS_DIR)) return []
  return readdirSync(STACKS_DIR)
    .filter((f) => f.endsWith(".yml"))
    .map((f) => readStack(f.replace(".yml", "")))
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
  return readdirSync(WORKSPACES_DIR)
    .filter((f) => f.endsWith(".yml"))
    .map((f) => readWorkspace(f.replace(".yml", "")))
}

export { expandHome }
