# Phase 66: Git Operation Guards - Context

**Gathered:** 2026-04-04 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

All git-aware commands silently skip dir repos so mixed workspaces produce no git errors. Push, pull, sync, merge, ahead/behind tracking, and dirty-file detection all treat dir repos as having no git state.

</domain>

<decisions>
## Implementation Decisions

### Guard Placement
- **D-01:** Guards for dir repos are placed in workspace-ops.ts (orchestration layer), not in git.ts (git primitives). git.ts functions remain pure path-based wrappers with no concept of repo modes.

### Scope of Changes
- **D-02:** `pullWorkspace` is the primary function requiring new dir-mode guards. `pushWorkspace`, `syncWorkspace`, and `mergeWorkspace` already exclude dir repos through existing worktree-only or trunk+worktree filters.
- **D-03:** Verify all six requirement targets (push, pull, sync, merge, ahead/behind, dirty) are covered — most are already guarded, but each must be explicitly confirmed.

### Pull Function Guard Pattern
- **D-04:** Filter dir repos out at the top of `pullWorkspace` before both the fetch dedup loop and the sequential pull loop. Report dir repos as skipped, matching the existing trunk-skip pattern in `pushWorkspace`.

### Test Strategy
- **D-05:** Mock-based tests in `tests/lib/workspace-ops.test.ts` with mixed-mode workspaces (worktree + dir), verifying dir repos appear in skipped results while worktree repos are processed normally. Follow the existing `pushWorkspace` trunk-skip test pattern.

### Claude's Discretion
- Exact skip reason string for dir repos (e.g., `"dir"` vs `"dir repo"`)
- Whether to add explicit skip emissions in push/sync/merge (currently silent omission) or leave the existing implicit exclusion pattern
- Any minor refactoring needed to make the filter patterns consistent across all six operations

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Git operations
- `src/lib/workspace-ops.ts` — `pushWorkspace` (L1194), `pullWorkspace` (L1510), `syncWorkspace` (L1284), `mergeWorkspace` (L691), `getWorkspaceListInfo` (L106/124), `getWorkspaceStatus` (L332), `getDirtyWorktrees` (L322)
- `src/lib/git.ts` — `fetchOrigin`, `pullFFOnly`, `isRepoDirty`, `getAheadBehind` (pure git wrappers, no mode awareness)

### Requirements
- `.planning/REQUIREMENTS.md` — GIT-01 through GIT-06 define the six guard requirements

### Prior phase context
- `.planning/phases/64-schema-registry/64-CONTEXT.md` — Schema decisions (mode: "dir", optional task_path)
- `.planning/phases/65-workspace-lifecycle/65-CONTEXT.md` — Lifecycle guards already applied to open/close/clean/remove

### Tests
- `tests/lib/workspace-ops.test.ts` — Existing push/sync/merge test patterns to follow for dir-mode skip assertions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pushWorkspace` trunk-skip pattern (L1194-1203): filters repos by mode, reports trunk repos as `{ status: "skipped", detail: "trunk" }` — same shape applies for dir repos
- `getWorkspaceListInfo` dir guard (L106, 124): already filters `r.mode !== "dir"` — proves the pattern is established
- `getWorkspaceStatus` dir handling (L332): already handles dir repos in status output

### Established Patterns
- Mode filtering happens at workspace-ops.ts level, not git.ts level
- Repos are filtered via `workspace.repos.filter(r => r.mode === "worktree")` or similar before git operations
- Skipped repos are reported in result arrays with a reason string
- `getDirtyWorktrees` (L322) already only checks worktree repos — safe for dir repos

### Integration Points
- `pullWorkspace` (L1510-1594): unfiltered `workspace.repos` iteration — both fetch dedup loop and sequential pull loop need dir guards
- `pushWorkspace` (L1194): already filters to worktree+trunk — dir repos silently absent
- `syncWorkspace` (L1284): already filters to worktree — dir repos silently absent
- `mergeWorkspace` (L691): already filters to worktree — dir repos silently absent

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches matching existing guard patterns.

</specifics>

<deferred>
## Deferred Ideas

None — analysis stayed within phase scope. TUI dashboard display of dir repos during push/pull operations is Phase 67 (Display & Health).

</deferred>

---

*Phase: 66-git-operation-guards*
*Context gathered: 2026-04-04*
