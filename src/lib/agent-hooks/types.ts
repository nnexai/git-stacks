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
