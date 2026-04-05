# Phase 67: Status, Display & Health - Context

**Gathered:** 2026-04-04 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can see dir repos represented correctly in CLI output and TUI — labeled as "dir" with no git metrics. Doctor skips git health checks for dir repos and validates directory existence/accessibility.

</domain>

<decisions>
## Implementation Decisions

### Status/List Display Adaptation
- **D-01:** The `status` and `list` CLI commands need display-layer changes only — `getWorkspaceStatus` and `getWorkspaceListInfo` already handle dir repos at the data layer (returning `mode: "dir"` with no git metrics)
- **D-02:** The `--fetch` code path in the `status` command needs a dir repo filter to avoid calling `fetchOrigin` on non-git directories

### TUI Dashboard Type and Display Gaps
- **D-03:** The TUI dashboard `RepoStatus` type in `tui/dashboard/types.ts` must be extended to include `"dir"` in its mode union (currently only `"trunk" | "worktree"`)
- **D-04:** `WorkspaceRow.tsx` needs to surface dir repo counts — currently only counts worktree and trunk, making dir repos invisible in the workspace list row
- **D-05:** `WorkspaceDetail.tsx` must render a `[dir]` label for dir repos instead of falling through to `[trunk]`

### Doctor Health Check Adaptation
- **D-06:** Doctor needs a new dir-specific check that validates directory existence and that the path is actually a directory (not a file), satisfying HLTH-02
- **D-07:** Doctor's existing git health checks already skip dir repos (`findMissingWorktrees` gates on `mode === "worktree"`) — HLTH-01 is largely satisfied, just needs explicit validation that no check accidentally runs git on dir repos

### Claude's Discretion
- Exact formatting of the `[dir]` label in CLI and TUI (color, styling)
- Whether dir repos show a dash or blank in ahead/behind/dirty columns
- How `WorkspaceRow` displays the dir count (separate badge, combined with trunk, etc.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Status/List display
- `src/commands/workspace.ts` — `status` command (~line 346+), `list` command (~line 286+), display formatting for repo mode labels
- `src/lib/workspace-ops.ts` — `getWorkspaceStatus()` (~line 320+), `getWorkspaceListInfo()` (~line 73+), `RepoStatus` type (~line 309)

### TUI dashboard
- `src/tui/dashboard/types.ts` — Duplicate `RepoStatus` type that needs `"dir"` added to mode union
- `src/tui/dashboard/WorkspaceDetail.tsx` — Repo detail rendering, mode label display (~line 66)
- `src/tui/dashboard/WorkspaceRow.tsx` — Workspace list row, repo count display (~lines 20-21)
- `src/tui/dashboard/hooks/useWorkspaces.ts` — `hasMissing` check (~line 88), only checks worktree mode

### Doctor health checks
- `src/commands/doctor.ts` — `findMissingWorktrees()` (~line 130), `findMissingMainClones()` (~line 148), issue types and fix actions

### Requirements
- `.planning/REQUIREMENTS.md` — DISP-01, DISP-02, DISP-03, HLTH-01, HLTH-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getWorkspaceStatus()` already returns `mode: "dir"` with zeroed git metrics — no data layer changes needed
- `getWorkspaceListInfo()` already populates `dirCount` field and filters dir repos from dirty/ahead-behind aggregation
- `workspace-ops.test.ts:2588-2633` already has tests for dir mode status behavior

### Established Patterns
- Mode-based rendering: `repo.mode === "worktree" ? "[worktree]" : "[trunk]"` — extend to ternary or switch with `"dir"` case
- Doctor issue types use discriminated unions with `action` field for fix suggestions
- TUI uses SolidJS reactive signals; `WorkspaceRow` and `WorkspaceDetail` read from workspace signal accessors

### Integration Points
- CLI `status` command display formatting (~workspace.ts:409) — add `[dir]` label
- CLI `status` `--fetch` filter (~workspace.ts:360-376) — skip dir repos before fetchOrigin
- TUI `types.ts` RepoStatus mode union — add `"dir"`
- TUI `WorkspaceRow` repo counts — include dir repos
- TUI `WorkspaceDetail` mode label — render `[dir]`
- TUI `useWorkspaces.ts` hasMissing — include dir repos in missing check
- Doctor — new `findInvalidDirRepos()` check for HLTH-02

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — analysis stayed within phase scope

</deferred>

---

*Phase: 67-status-display-health*
*Context gathered: 2026-04-04*
