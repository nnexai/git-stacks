# Phase 58: Ahead/Behind Tracking - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Per-repo commit distance from base branch (ahead and behind counts), surfaced in `git-stacks list`, `git-stacks status`, TUI WorkspaceRow, and TUI WorkspaceDetail. Staleness detection flags when local refs are outdated. No network calls in the render path.

</domain>

<decisions>
## Implementation Decisions

### Staleness architecture
- **D-01:** Replace the existing `useStaleness` hook entirely. The new ahead/behind system computes from local refs only — no network calls during list or TUI render.
- **D-02:** Staleness is determined by FETCH_HEAD mtime against a 15-minute threshold, using `git rev-parse --git-common-dir` to resolve the correct path in worktrees (where `.git` is a file, not a directory).
- **D-03:** A separate "Refresh" action or `git-stacks status --fetch` can trigger fetches to update local refs. The `list` command does NOT get a `--fetch` flag.

### Staleness visual treatment
- **D-04:** Stale ahead/behind data renders in dim/gray with a `?` suffix (e.g., `↓3?` means "was 3 behind, data may be outdated"). Minimal visual noise.

### CLI column layout
- **D-05:** Keep current headerless compact format for `git-stacks list`. Add `↑N ↓N` inline after branch name, before repo count. Example: `  my-feature  feature/my-feat  ↑3 ↓0  3 repos  2d`
- **D-06:** `--fetch` flag only on `git-stacks status`, not on `list`. List stays fast and local-only.

### TUI WorkspaceRow placement
- **D-07:** Place `↑N ↓N` indicators after the branch name column, before the counts column (`3wt 1tr`). Visually grouped with branch context.
- **D-08:** Color-coded: `↑N` in green (ahead = ready to push), `↓N` in yellow (behind = needs sync). Matches existing color conventions.

### Zero-count display
- **D-09:** Hide zero counts in both TUI and CLI. Only show non-zero values (`↑3` appears when ahead, nothing when synced). Consistent with dirty indicator behavior (hidden when clean).
- **D-10:** JSON output (`--json` flag) always includes numeric `ahead` and `behind` fields regardless of value (zeros included for machine consumption).

### Aggregation strategy (from FEATURES.md spec)
- **D-11:** Workspace aggregate: sum of `ahead` commits across worktree repos, max `behind` across worktree repos. Trunk repos are skipped.
- **D-12:** Per-repo detail in `status` and WorkspaceDetail shows individual counts per repo.

### Claude's Discretion
- Exact responsive width allocation for the new `↑N ↓N` column in WorkspaceRow
- How to handle the "Refresh" action in TUI (keybinding or action menu item)
- Whether to show a stale indicator timestamp ("last fetched: 2h ago") or just the `?` suffix
- Test structure and mock patterns for the new git primitives

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Feature specification
- `FEATURES.md` §2 "Ahead/Behind Tracking" — Complete design spec: schema changes, git primitives, staleness detection, display formats, and files to touch

### Requirements
- `.planning/REQUIREMENTS.md` §"Ahead/Behind Tracking" — AB-01 through AB-07 acceptance criteria

### Existing code
- `src/lib/git.ts` — `getCommitsBehind` (line 249) is the mirror function pattern for `getCommitsAhead`
- `src/lib/workspace-ops.ts` — `WorkspaceListInfo` type and `getWorkspaceListInfo` function (line 48/77) need extension
- `src/tui/dashboard/hooks/useStaleness.ts` — Current hook to be replaced; understand what it provides to WorkspaceDetail
- `src/tui/dashboard/WorkspaceRow.tsx` — Current layout structure for adding `↑N ↓N`
- `src/tui/dashboard/WorkspaceDetail.tsx` — Current `resolveBadge` function using StaleInfo; needs ahead/behind per-repo
- `src/commands/workspace.ts` — `list` action (line 266) and `status` action (line 310) output formatting

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getCommitsBehind(repoPath, base, head)` in `git.ts:249` — exact pattern to mirror for `getCommitsAhead`
- `mapLimited()` from `lib/concurrency.ts` — bounded parallelism for per-repo computation
- `useStaleness` hook pattern — replace contents but reuse the signal-based cache approach
- `resolveBadge()` in `WorkspaceDetail.tsx:21` — badge rendering pattern to adapt for ahead/behind

### Established Patterns
- `WorkspaceListInfo` type is the data contract between workspace-ops and commands/TUI
- `getWorkspaceStatus()` returns per-repo status; extend with ahead/behind fields
- TUI responsive layout uses `useTerminalDimensions()` + `createMemo` for dynamic column widths
- `$\`git -C ...\`.quiet().nothrow()` pattern for all git operations with exit code checking

### Integration Points
- `getWorkspaceListInfo()` — add `ahead`, `behind`, `aheadBehindStale` fields
- `RepoStatus` type in TUI — add `ahead`, `behind` fields
- `WorkspaceRow` render — insert new `<text>` element between branch and counts
- `WorkspaceDetail` repo table — replace `resolveBadge` usage with new ahead/behind data
- `list` command output — insert `↑N ↓N` into formatted line
- `status` command output — add per-repo ahead/behind columns

</code_context>

<specifics>
## Specific Ideas

- Green for ahead (↑N), yellow for behind (↓N) — matches existing dirty=yellow, clean=green conventions
- Stale data gets dim color + `?` suffix, not a warning icon — keeps it low-noise
- "Hide zeros" rule matches the existing dirty indicator pattern (no `~0` shown for clean repos)
- JSON output always includes full numeric fields for scripting/automation consumers

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 58-ahead-behind-tracking*
*Context gathered: 2026-04-03*
