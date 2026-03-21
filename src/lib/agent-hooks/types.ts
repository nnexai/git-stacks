/** A single hook handler (command to run) */
export interface HookHandler {
  type: "command"
  command: string
}

/** A matcher group — groups handlers under an optional tool/event matcher */
export interface MatcherGroup {
  matcher?: string    // e.g. "AskUserQuestion" — omit to match all
  hooks: HookHandler[]
}

/**
 * Claude Code settings.json hooks object.
 * Keyed by event name, each value is an array of matcher groups.
 */
export type HooksConfig = Record<string, MatcherGroup[]>

/** Describes a hook to generate — used by plugins before converting to HooksConfig */
export interface HookEntry {
  event: string       // "Stop", "PreToolUse", "UserPromptSubmit", "PostToolUse"
  matcher?: string    // e.g. "AskUserQuestion" (omit for events without matchers)
  command: string     // shell command to run
}

export interface AgentHookPlugin {
  id: string
  label: string
  /** Generate the hook entries for a given workspace */
  generateHookEntries(workspaceName: string): HookEntry[]
  /** Install hooks into a repo worktree directory */
  install(repoWorktreePath: string, workspaceName: string): void
  /** Remove this plugin's hooks from a repo worktree directory */
  remove(repoWorktreePath: string): void
}
