// Canonical implementation owned by @git-stacks/core.
import { resolve } from "path"
import type { Workspace } from "./config"
import { isWorktreeRepo } from "./config"
import { expandHome } from "./paths"
import { ShellIdentifierSchema } from "./config"

// --- Types ---

export type EnvFormat = "table" | "shell" | "dotenv" | "json"

// --- Internal helpers ---

function needsShellQuoting(value: string): boolean {
  return /[ "'`$#\n\t;()|&<>]/.test(value)
}

function needsDotenvQuoting(value: string): boolean {
  return /[ "'#\n\t]/.test(value)
}

// --- Formatters ---

export function formatEnvTable(env: Record<string, string>): string {
  const keys = Object.keys(env).sort()
  if (keys.length === 0) return ""
  const maxKeyLen = keys.reduce((m, k) => Math.max(m, k.length), 0)
  return keys.map(k => `${k.padEnd(maxKeyLen)}  ${env[k]}`).join("\n")
}

export function formatEnvShell(env: Record<string, string>): string {
  const keys = Object.keys(env).sort()
  return keys.map(k => {
    if (!ShellIdentifierSchema.safeParse(k).success) {
      throw new Error(`Invalid shell environment identifier: ${k}`)
    }
    const v = env[k]
    if (needsShellQuoting(v)) {
      const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`")
      return `export ${k}="${escaped}"`
    }
    return `export ${k}=${v}`
  }).join("\n")
}

export function formatEnvDotenv(env: Record<string, string>): string {
  const keys = Object.keys(env).sort()
  return keys.map(k => {
    const v = env[k]
    if (needsDotenvQuoting(v)) {
      const escaped = v.replace(/"/g, '\\"').replace(/\n/g, "\\n")
      return `${k}="${escaped}"`
    }
    return `${k}=${v}`
  }).join("\n")
}

export function formatEnvJson(env: Record<string, string>): string {
  return JSON.stringify(env, Object.keys(env).sort(), 2)
}

export function formatEnv(env: Record<string, string>, format: EnvFormat): string {
  switch (format) {
    case "table": return formatEnvTable(env)
    case "shell": return formatEnvShell(env)
    case "dotenv": return formatEnvDotenv(env)
    case "json": return formatEnvJson(env)
  }
}

// --- Repo detection ---

/**
 * Given a known workspace and an optional CWD, detect which repo the CWD is inside.
 * Only worktree-mode repos are considered.
 *
 * @param workspace - The workspace to search within
 * @param cwd - Directory to match against (defaults to process.cwd())
 * @returns The matched repo's name or null if no match
 */
export function detectRepoFromCwd(workspace: Workspace, cwd?: string): string | null {
  const currentDir = cwd ?? process.cwd()

  let bestMatch: string | null = null
  let bestPathLen = 0

  for (const repo of workspace.repos) {
    if (!isWorktreeRepo(repo)) continue
    const resolvedTaskPath = resolve(expandHome(repo.task_path))
    if (
      currentDir === resolvedTaskPath ||
      currentDir.startsWith(resolvedTaskPath + "/")
    ) {
      if (resolvedTaskPath.length > bestPathLen) {
        bestMatch = repo.name
        bestPathLen = resolvedTaskPath.length
      }
    }
  }

  return bestMatch
}
