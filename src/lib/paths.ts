import { homedir } from "os"
import { join } from "path"

export const HOME = homedir()

export const DEFAULT_WORKSPACE_ROOT = join(HOME, "workspaces")

// All config and metadata lives in ~/.config/git-stacks/
export const WS_CONFIG_DIR = join(HOME, ".config", "git-stacks")
export const WORKSPACES_DIR = join(WS_CONFIG_DIR, "workspaces")
export const GLOBAL_CONFIG_FILE = join(WS_CONFIG_DIR, "config.yml")
export const REGISTRY_FILE = join(WS_CONFIG_DIR, "registry.yml")
export const TEMPLATES_DIR = join(WS_CONFIG_DIR, "templates")
export const MESSAGES_DIR = join(WS_CONFIG_DIR, "messages")

export function getMainDir(wsRoot: string): string {
  return join(wsRoot, "main")
}

export function getTasksDir(wsRoot: string): string {
  return join(wsRoot, "tasks")
}

export function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(HOME, p.slice(2))
  return p
}
