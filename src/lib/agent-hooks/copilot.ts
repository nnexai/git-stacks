import { existsSync, readdirSync, rmSync, mkdirSync, writeFileSync, rmdirSync } from "fs"
import { join } from "path"
import type { AgentHookPlugin, HookEntry } from "./types"

// --- Internal Copilot JSON types ---

interface CopilotHookEntry {
  type: "command"
  bash: string
  env?: Record<string, string>
  timeoutSec?: number
  comment?: string
}

interface CopilotHooksFile {
  version: 1
  hooks: Record<string, CopilotHookEntry[]>
}

// --- Helpers ---

function getHooksPath(repoWorktreePath: string): string {
  return join(repoWorktreePath, ".github", "hooks", "git-stacks.json")
}

/** Map from Claude-style event names to Copilot event names */
const EVENT_MAP: Record<string, string> = {
  Stop: "sessionEnd",
  PreToolUse: "preToolUse",
  PostToolUse: "postToolUse",
  UserPromptSubmit: "userPromptSubmitted",
}

/**
 * Wrap a bash command with stdin toolName filtering.
 * Used for preToolUse/postToolUse entries that should only fire when
 * Copilot is asking a question (matcher: AskUserQuestion equivalent).
 */
function wrapWithToolNameFilter(command: string, toolName: string): string {
  return `input=$(cat); toolName=$(echo "$input" | grep -o '"toolName":"[^"]*"' | head -1 | cut -d'"' -f4); if [ "$toolName" = "${toolName}" ]; then ${command}; fi`
}

function entriesToCopilotConfig(entries: HookEntry[], workspaceName: string): CopilotHooksFile {
  const config: CopilotHooksFile = { version: 1, hooks: {} }

  for (const entry of entries) {
    const copilotEvent = EVENT_MAP[entry.event]
    if (!copilotEvent) continue

    let bash = entry.command

    // For preToolUse/postToolUse entries with a matcher, wrap with stdin toolName filtering
    if ((entry.event === "PreToolUse" || entry.event === "PostToolUse") && entry.matcher) {
      bash = wrapWithToolNameFilter(entry.command, entry.matcher)
    }

    const copilotEntry: CopilotHookEntry = {
      type: "command",
      bash,
      env: {
        GS_WORKSPACE_NAME: workspaceName,
        GS_FROM: "copilot",
      },
      timeoutSec: 10,
      comment: `git-stacks: ${entry.event}${entry.matcher ? ` (${entry.matcher})` : ""} notification`,
    }

    if (!config.hooks[copilotEvent]) config.hooks[copilotEvent] = []
    config.hooks[copilotEvent].push(copilotEntry)
  }

  return config
}

// --- Plugin export ---

export const copilotPlugin: AgentHookPlugin = {
  id: "copilot",
  label: "GitHub Copilot",

  generateHookEntries(workspaceName: string): HookEntry[] {
    return [
      {
        event: "Stop",
        command: `git-stacks message send "Copilot has finished and may need your attention" --workspace ${workspaceName} --from copilot`,
      },
      {
        event: "PreToolUse",
        matcher: "AskUserQuestion",
        command: `git-stacks message send "Copilot is asking a question — input needed" --workspace ${workspaceName} --from copilot`,
      },
      {
        event: "UserPromptSubmit",
        command: `git-stacks message clear --workspace ${workspaceName} --from copilot`,
      },
      {
        event: "PostToolUse",
        matcher: "AskUserQuestion",
        command: `git-stacks message clear --workspace ${workspaceName} --from copilot`,
      },
    ]
  },

  install(repoWorktreePath: string, workspaceName: string): void {
    const hooksPath = getHooksPath(repoWorktreePath)
    const entries = this.generateHookEntries(workspaceName)
    const config = entriesToCopilotConfig(entries, workspaceName)

    mkdirSync(join(repoWorktreePath, ".github", "hooks"), { recursive: true })
    writeFileSync(hooksPath, JSON.stringify(config, null, 2) + "\n")
  },

  remove(repoWorktreePath: string): void {
    const hooksPath = getHooksPath(repoWorktreePath)
    if (!existsSync(hooksPath)) return

    rmSync(hooksPath, { force: true })

    // Remove .github/hooks/ directory if empty after deletion
    const hooksDir = join(repoWorktreePath, ".github", "hooks")
    try {
      const remaining = readdirSync(hooksDir)
      if (remaining.length === 0) {
        rmdirSync(hooksDir)
      }
    } catch {
      // Directory may already be gone or inaccessible — no-op
    }
  },
}
