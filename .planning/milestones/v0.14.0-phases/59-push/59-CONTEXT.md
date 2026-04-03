# Phase 59: Push - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

`git-stacks push [name]` command that pushes workspace branches to remote in parallel across repos, with TUI ActionMenu integration. Supports `--force-with-lease`, `--force`, `--dry-run`, and `--json` flags. Trunk repos are skipped.

</domain>

<decisions>
## Implementation Decisions

### TUI push behavior
- **D-01:** No confirmation dialog for regular push in TUI — act immediately like sync. Push is a normal workflow action, not destructive.
- **D-02:** Force-push (`--force` / `--force-with-lease`) is CLI-only. TUI push is always regular push. Prevents accidental force-push from the dashboard.
- **D-03:** TUI push keybinding: `p` in ActionMenu (available, natural mapping).

### Post-push output
- **D-04:** No forge PR suggestion after push. Just show push results. Keep push output clean and predictable for scripting/agent workflows.

### Error display
- **D-05:** Inline per-repo results as they complete: `pushed api (3 commits)` / `FAILED frontend: non-fast-forward`. Summary line at end: `2 pushed, 1 failed`. Matches sync's existing pattern.
- **D-06:** Exit code non-zero if any repo fails (standard POSIX behavior for partial failure).

### TUI progress
- **D-07:** Mirror the SyncProgressView pattern exactly. Use same ProgressView component with PushRow status transitions (pending → pushing → pushed/failed). Per-repo live updates. Consistent with existing TUI.

### Command structure (from FEATURES.md spec)
- **D-08:** `git-stacks push [name]` — name optional, CWD detection fallback (same as sync/status).
- **D-09:** Flags: `--force-with-lease`, `--force`, `--dry-run`, `--set-upstream`, `--json`.
- **D-10:** Parallel execution across repos via `Promise.all` (no ordering dependency).
- **D-11:** Trunk repos skipped with `skipped <name> (trunk)` in output.

### Return type (from FEATURES.md spec)
- **D-12:** `PushResult` mirrors `SyncResult` shape: `{ ok, pushed[], skipped[], failed[], error? }`.
- **D-13:** `PushRow` for progress callbacks: `{ repo, status: "pending"|"pushing"|"pushed"|"skipped"|"failed", detail }`.

### Claude's Discretion
- Exact error message parsing from `git push` stderr (non-fast-forward, auth failure, no upstream)
- `pushBranch` function signature details beyond what FEATURES.md specifies
- Dry-run output verbosity level
- Whether to auto-set-upstream on first push or require explicit flag
- Test structure and mock patterns

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Feature specification
- `FEATURES.md` §1 "`git-stacks push`" — Complete design spec: behavior, options, return types, git primitive, workspace-ops function, TUI integration, files to touch

### Requirements
- `.planning/REQUIREMENTS.md` §"Push" — PUSH-01 through PUSH-04 acceptance criteria

### Existing patterns to mirror
- `src/lib/workspace-ops.ts` — `SyncResult` type (line 1013) and `syncWorkspace` function (line 1027) — mirror pattern for PushResult/pushWorkspace
- `src/lib/git.ts` — `pullFFOnly` function — error parsing pattern to follow for `pushBranch`
- `src/tui/dashboard/SyncProgressView.tsx` — TUI progress view to mirror for PushProgressView
- `src/tui/dashboard/ActionMenu.tsx` — Action list where `push` will be added (line 14)
- `src/tui/dashboard/types.ts` — `Action` type union (line 24) needs `"push"` added

### Prior phase context
- `.planning/phases/58-ahead-behind-tracking/58-CONTEXT.md` — Ahead/behind data feeds push UX (↑N in green = ready to push)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SyncResult` / `SyncRow` types — direct pattern for `PushResult` / `PushRow`
- `SyncProgressView.tsx` — mirror for `PushProgressView` with status transitions
- `ActionMenu.tsx` — add `{ key: "p", action: "push", label: "Push" }` to actions array
- `pullFFOnly()` in `git.ts` — error parsing pattern (stderr parsing, structured error return)
- CWD workspace detection — already implemented for sync/status, reuse for push

### Established Patterns
- `workspace-ops.ts` functions: read workspace, filter worktree repos, parallel execution, progress callbacks
- `$\`git -C ...\`.quiet().nothrow()` for git operations
- `ProgressView` component for live per-repo status updates in TUI
- `--json` flag outputs structured result object

### Integration Points
- `workspace.ts` command registration — add `push` command next to `sync`
- `Action` type union — add `"push"`
- `App.tsx` action dispatch — handle `"push"` action with progress view
- Shell completion — `push` command auto-discovered by completion-generator

</code_context>

<specifics>
## Specific Ideas

- Keep push output clean — no suggestions, no prompts, just results
- Force-push is dangerous enough to be CLI-only; TUI users can't accidentally force-push
- Mirror sync's UX patterns exactly for consistency — users already know how sync works in TUI

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 59-push*
*Context gathered: 2026-04-03*
