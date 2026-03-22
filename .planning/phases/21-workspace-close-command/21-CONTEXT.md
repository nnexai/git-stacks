# Phase 21: Workspace Close Command - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a `git-stacks close` command and TUI action that tears down integration sessions (tmux, niri) and runs teardown hooks, without touching worktrees or workspace YAML. The workspace remains fully re-openable via `git-stacks open`.

</domain>

<decisions>
## Implementation Decisions

### Hook & Integration Teardown Semantics
- Add `pre_close` hook to template and workspace hook schemas — close is a lighter operation than remove, warranting its own hook
- Niri close unnames the niri workspace (same as current `cleanup()`) — windows remain but workspace loses its name, ready for re-open to re-claim
- Tmux close kills the tmux session (same as current `cleanup()`) — sessions are cheap to recreate on re-open
- Close invokes `runIntegrationCleanup()` for all enabled integrations — consistent with clean/remove pattern

### CLI Command Design
- No confirmation prompt — close is non-destructive (preserves worktrees + YAML), quick to undo with `open`
- No `--dry-run` flag — close doesn't modify the filesystem (no worktrees removed), so dry-run has little value
- Short progress lines per integration cleaned (matching open's output style), ending with "Closed '{name}'."

### TUI Dashboard Integration
- "Close" appears after "Open" in the workspace action menu — close is the inverse of open, so adjacent placement
- Shortcut key `x` — `c` is taken by Clean, `x` evokes "exit session"
- TUI close uses `runHooksCaptured` + progress callback with spinner, same pattern as TUI open/sync

### Claude's Discretion
- No items deferred to Claude's discretion — all questions resolved

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `runIntegrationCleanup()` in `src/lib/integrations/runner.ts` — loops enabled integrations and calls `cleanup()`; already used by clean/remove/merge
- `runHooks()` / `runHooksCaptured()` in `src/lib/lifecycle.ts` — hook execution with inherited or captured stdio
- `runPreRemoveHooks()` in `src/lib/workspace-ops.ts` — pattern for hook execution with env injection (model for `runPreCloseHooks`)
- Existing `cleanup()` methods on niri (unname workspace) and tmux (kill session) integrations

### Established Patterns
- Workspace ops follow: read config → read workspace → execute hooks → execute integration ops → progress callback → return `{ ok, error? }`
- CLI commands in `src/commands/workspace.ts` are thin wrappers: validate → confirm (if needed) → call workspace-ops → format output
- TUI action menu: `ActionMenu.tsx` has static action array with `{ key, action, label }` entries; `App.tsx` dispatches action strings

### Integration Points
- `src/lib/workspace-ops.ts` — new `closeWorkspace()` function alongside clean/remove/merge/open
- `src/commands/workspace.ts` — new `close <name>` subcommand registration
- `src/lib/config.ts` — add `pre_close` to template and workspace hook schemas
- `src/tui/dashboard/ActionMenu.tsx` — add close entry with `x` shortcut
- `src/tui/dashboard/types.ts` — add `"close"` to `Action` union
- `src/tui/dashboard/App.tsx` — dispatch close action to `closeWorkspace` with captured hooks

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follows established patterns from open/clean/remove.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
