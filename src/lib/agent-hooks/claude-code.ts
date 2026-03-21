import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import type { AgentHookPlugin, HookEntry } from "./types"

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
  writeFileSync(settingsPath, JSON.stringify(data, null, 2))
}

export const claudeCodePlugin: AgentHookPlugin = {
  id: "claude-code",
  label: "Claude Code",

  generateHookEntries(workspaceName: string): HookEntry[] {
    return [
      {
        event: "Stop",
        command: `git-stacks message send "Claude has finished and may need your attention" --workspace ${workspaceName} --from claude`,
      },
      {
        event: "PreToolUse",
        matcher: "AskUserQuestion",
        command: `git-stacks message send "Claude is asking a question — input needed" --workspace ${workspaceName} --from claude`,
      },
      {
        event: "UserPromptSubmit",
        command: `git-stacks message clear --workspace ${workspaceName} --from claude`,
      },
      {
        event: "PostToolUse",
        matcher: "AskUserQuestion",
        command: `git-stacks message clear --workspace ${workspaceName} --from claude`,
      },
    ]
  },

  install(repoWorktreePath: string, workspaceName: string): void {
    const settingsPath = getSettingsPath(repoWorktreePath)
    const data = readSettings(settingsPath)

    // Get existing hooks, filtering out any pre-existing git-stacks entries (idempotency)
    const existingHooks = Array.isArray(data.hooks)
      ? (data.hooks as Array<{ command: string }>).filter((h) => !h.command.includes("git-stacks"))
      : []

    const newEntries = this.generateHookEntries(workspaceName)
    data.hooks = [...existingHooks, ...newEntries]

    writeSettings(settingsPath, data)
  },

  remove(repoWorktreePath: string): void {
    const settingsPath = getSettingsPath(repoWorktreePath)
    if (!existsSync(settingsPath)) return

    const data = readSettings(settingsPath)
    if (!Array.isArray(data.hooks)) return

    const remaining = (data.hooks as Array<{ command: string }>).filter(
      (h) => !h.command.includes("git-stacks")
    )

    if (remaining.length === 0) {
      delete data.hooks
    } else {
      data.hooks = remaining
    }

    writeSettings(settingsPath, data)
  },
}
