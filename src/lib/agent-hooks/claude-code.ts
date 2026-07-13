import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { signalPublishCommand, type AgentHookPlugin, type HookEntry, type HooksConfig, type MatcherGroup } from "./types"

const GIT_STACKS_MARKER = "git-stacks"

function getSettingsPath(repoWorktreePath: string): string {
  return join(repoWorktreePath, ".claude", "settings.json")
}

function readSettings(settingsPath: string): Record<string, unknown> {
  if (!existsSync(settingsPath)) return {}
  try {
    const raw = readFileSync(settingsPath, "utf-8").trim()
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeSettings(settingsPath: string, data: Record<string, unknown>): void {
  const dir = join(settingsPath, "..")
  mkdirSync(dir, { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(data, null, 2) + "\n")
}

/** Check if a matcher group contains a git-stacks command */
function isGitStacksGroup(group: MatcherGroup): boolean {
  return group.hooks.some((h) => h.command.includes(GIT_STACKS_MARKER))
}

/** Convert flat HookEntry[] into the nested HooksConfig format */
function entriesToConfig(entries: HookEntry[]): HooksConfig {
  const config: HooksConfig = {}
  for (const entry of entries) {
    const group: MatcherGroup = {
      ...(entry.matcher ? { matcher: entry.matcher } : {}),
      hooks: [{ type: "command", command: entry.command }],
    }
    if (!config[entry.event]) config[entry.event] = []
    config[entry.event].push(group)
  }
  return config
}

export const claudeCodePlugin: AgentHookPlugin = {
  id: "claude-code",
  label: "Claude Code",

  generateHookEntries(workspaceName: string): HookEntry[] {
    return [
      {
        event: "Stop",
        command: signalPublishCommand("claude", "completed", workspaceName),
      },
      {
        event: "PostToolUseFailure",
        command: signalPublishCommand("claude", "failed", workspaceName),
      },
      {
        event: "PreToolUse",
        matcher: "AskUserQuestion",
        command: signalPublishCommand("claude", "waiting", workspaceName),
      },
      {
        event: "UserPromptSubmit",
        command: signalPublishCommand("claude", "working", workspaceName),
      },
      {
        event: "PostToolUse",
        matcher: "AskUserQuestion",
        command: signalPublishCommand("claude", "idle", workspaceName),
      },
    ]
  },

  install(repoWorktreePath: string, workspaceName: string): void {
    const settingsPath = getSettingsPath(repoWorktreePath)
    const data = readSettings(settingsPath)

    const existingHooks = (data.hooks ?? {}) as HooksConfig

    // Strip old git-stacks entries from each event (idempotency)
    const cleaned: HooksConfig = {}
    for (const [event, groups] of Object.entries(existingHooks)) {
      const kept = groups.filter((g) => !isGitStacksGroup(g))
      if (kept.length > 0) cleaned[event] = kept
    }

    // Merge in fresh git-stacks entries
    const fresh = entriesToConfig(this.generateHookEntries(workspaceName))
    for (const [event, groups] of Object.entries(fresh)) {
      if (!cleaned[event]) cleaned[event] = []
      cleaned[event].push(...groups)
    }

    data.hooks = cleaned
    writeSettings(settingsPath, data)
  },

  remove(repoWorktreePath: string): void {
    const settingsPath = getSettingsPath(repoWorktreePath)
    if (!existsSync(settingsPath)) return

    const data = readSettings(settingsPath)
    if (!data.hooks || typeof data.hooks !== "object") return

    const hooks = data.hooks as HooksConfig
    const cleaned: HooksConfig = {}
    for (const [event, groups] of Object.entries(hooks)) {
      const kept = groups.filter((g) => !isGitStacksGroup(g))
      if (kept.length > 0) cleaned[event] = kept
    }

    if (Object.keys(cleaned).length === 0) {
      delete data.hooks
    } else {
      data.hooks = cleaned
    }

    writeSettings(settingsPath, data)
  },
}
