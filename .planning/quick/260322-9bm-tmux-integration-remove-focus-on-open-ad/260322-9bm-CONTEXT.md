# Quick Task 260322-9bm: tmux integration — remove focus on open, add cleanup - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Task Boundary

tmux integration: remove focusTmuxSession from open (prepare session only, don't take over terminal), add cleanup method to kill tmux session on workspace clean/remove. niri integration: keep focus call as-is — no changes.

Additionally: introduce an integration command registration system so integrations can expose helper commands under `git-stacks integration <integration-name> <action>`. tmux would register `attach`, niri would register `focus-workspace`.

</domain>

<decisions>
## Implementation Decisions

### Session kill behavior
- Kill tmux session only if its name matches the workspace name. If someone manually renamed the session, leave it alone.

### Open return value
- Keep returning `TmuxArtifact` with `sessionName` from `open()`. Other integrations (like niri commands config) may need to know the session exists.

### User feedback on open
- Spinner/log message after tmux open: `"tmux session ready: {name}"` — clear that it's prepared but not attached, user sees the session name.

### Integration helper commands
- Integrations register their own commands, namespaced under `git-stacks integration <integration-name> <action>`.
- tmux would register: `git-stacks integration tmux attach [workspace]`
- niri would register: `git-stacks integration niri focus-workspace [workspace]`
- The Integration interface gets a new optional `commands` property for registering subcommands.

### Niri integration — no changes to focus behavior
- Keep `focusNiriWorkspace()` and `focusNiriWorkspaceDown()` calls in niri's `open()` — user explicitly wants niri to switch focus when opening.

</decisions>

<specifics>
## Specific Ideas

- `killTmuxSession(name)` helper in `src/lib/tmux.ts` — wraps `tmux kill-session -t {name}`
- `tmuxSessionExists` already exists and can gate the cleanup
- Integration `commands` property could return commander.js `Command` objects that get mounted under `git-stacks integration <id>`
- `src/commands/integration.ts` — new command file that registers `git-stacks integration` and iterates integrations to mount their subcommands

</specifics>
