# Phase 12: workspace-sync — Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a sync action to the workspace action menu in the TUI dashboard. Users trigger sync, see live per-repo progress, and get a summary on completion. Sync always uses rebase strategy. Batch sync (all workspaces) is deferred — this is single-workspace sync from the action menu only.

</domain>

<decisions>
## Implementation Decisions

### Per-repo progress display
- **D-01:** Live status table — one line per repo that updates in-place as status changes (pending → fetching → rebasing → done/skipped)
- **D-02:** Each repo line shows: repo name, current status indicator (spinner while active, checkmark on success, warning on skip/fail), and result detail (commit count or skip reason)
- **D-03:** This requires a new component (or ProgressView enhancement) that supports in-place line updates rather than append-only — future-proofs for parallel sync

### Conflict handling UX
- **D-04:** Always use best-effort mode (`bestEffort: true`) — skip conflicting repos automatically, do not abort the entire sync
- **D-05:** Skipped repos are visually prominent: warning indicator + conflict file list shown beneath the repo line
- **D-06:** No pre-check dialog — conflicts surface during execution and are displayed inline

### Confirmation before sync
- **D-07:** Show a confirm dialog before starting sync (e.g., "Sync workspace-name? (rebase from upstream)")
- **D-08:** Follow the existing confirm → progress pattern used by clean/remove/merge actions

### Sync parameters (locked)
- **D-09:** Strategy is always `rebase` in TUI — no strategy selection UI (per REQUIREMENTS Out of Scope)
- **D-10:** Timeout: unreachable remote must fail within 30 seconds (WS-04) — use git fetch timeout mechanism
- **D-11:** All keybindings blocked during sync progress (no double-dispatch)

### Claude's Discretion
- Exact spinner/indicator characters and colors
- Whether to enhance existing ProgressView or create a new SyncProgressView component
- Git fetch timeout implementation detail (signal abort vs git config)
- Line layout spacing in the status table

</decisions>

<specifics>
## Specific Ideas

- Status table design positions for future parallelization — even though repos sync sequentially now, the in-place update pattern means switching to parallel sync later won't require a UI rewrite
- Conflict file list shown indented beneath the skipped repo line (not just "skipped" — show what conflicted)

</specifics>

<canonical_refs>
## Canonical References

### Sync implementation
- `src/lib/workspace-ops.ts` — `syncWorkspace()` function with `SyncResult` return type, `onProgress` callback, `bestEffort` option
- `src/lib/git.ts` — `fetchOrigin()`, `rebaseBranch()`, `getMergeConflicts()`, `getCommitsBehind()` git operations

### TUI action dispatch pattern
- `src/tui/dashboard/App.tsx` — `runAction()` and `executeConfirmed()` showing confirm → progress → done → reload pattern
- `src/tui/dashboard/ActionMenu.tsx` — action list definition, keyboard handler
- `src/tui/dashboard/types.ts` — `Action` and `UIView` type unions that need extending

### Existing progress display
- `src/tui/dashboard/ProgressView.tsx` — current append-only progress component (may need enhancement or replacement for live status table)

### Prerequisites from Phase 11
- `src/lib/lifecycle.ts` — `runHooksCaptured()` for TUI-safe hook output if sync triggers hooks

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `syncWorkspace()` — already handles fetch, conflict check, rebase loop, and returns structured `SyncResult { ok, synced[], skipped[], error }`
- `ProgressView` — existing component with spinner + lines + "Done. Press any key" pattern; needs enhancement for in-place updates
- `ConfirmDialog` — existing confirm pattern used by clean/remove/merge

### Established Patterns
- Action dispatch: `ActionMenu` → `runAction()` → `setView({ view: "confirm" })` → `executeConfirmed()` → `setView({ view: "progress" })` → done → reload
- Progress callback: `onProgress: (msg: string) => void` feeds `setProgressLines(prev => [...prev, msg])`
- Keyboard isolation: progress view blocks all navigation handlers via view guard

### Integration Points
- `Action` type union in `types.ts` — add `"sync"`
- `UIView` type union — may need a sync-specific view variant if live status table diverges from generic progress
- `ActionMenu.tsx` action list — add sync entry with `s` key
- `App.tsx` `runAction()` and `executeConfirmed()` — add sync case

</code_context>

<deferred>
## Deferred Ideas

- Batch sync (all workspaces from TUI) — explicitly deferred to CLI `--all` (WS-05)
- Parallel per-repo sync execution — current `syncWorkspace()` is sequential; the live status table UI is ready for it but the backend change is out of scope

</deferred>

---

*Phase: 12-workspace-sync*
*Context gathered: 2026-03-21*
