# Phase 38: Multi-Repo Pull - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

New `git-stacks pull [workspace]` command that pulls latest commits for all repos in a workspace. Uses `--ff-only` for safety, skips dirty repos with warnings, deduplicates fetch per `main_path`, and autodetects workspace from CWD.

</domain>

<decisions>
## Implementation Decisions

### Progress display
- **D-01:** Per-repo line updates as each completes (e.g., `pulled  api  (3 commits)` / `skipped  web  (dirty)` / `failed  auth  (diverged)`)
- **D-02:** Follow the existing `SyncRow` + `onProgress` callback pattern from `syncWorkspace`

### Parallelism strategy
- **D-03:** Parallel fetch, sequential pull — fetch all remotes concurrently (deduped by `main_path` per PULL-04), then pull each repo one at a time for clean output
- **D-04:** Fetch deduplication groups repos sharing the same `main_path` so each remote is fetched once

### Output format
- **D-05:** Per-line status only, no summary table or count at end — keep output minimal
- **D-06:** Dirty repos show `skipped  {name}  (dirty)` on stderr
- **D-07:** Diverged branches show `failed  {name}  (diverged: {branch})` on stderr

### Pull mechanics (from requirements + STATE.md)
- **D-08:** `--ff-only` always — no rebase, no merge commits (decided in STATE.md)
- **D-09:** Worktree repos pull their workspace branch; trunk repos pull their default branch
- **D-10:** Dirty repos skipped with warning; command exits non-zero if any repo skipped or failed

### CWD autodetection (from requirements)
- **D-11:** `git-stacks pull` without arguments autodetects workspace from CWD using `resolveWorkspaceArg()`

### Claude's Discretion
- Exact SyncRow-like type definition for pull results
- Whether to reuse `SyncRow` directly or create a `PullRow` variant
- Fetch timeout value (syncWorkspace uses 30s)
- Stderr vs stdout for warning/error lines

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Command patterns
- `src/commands/workspace.ts` -- Existing command registration; `sync` command at line 681+ is the closest pattern
- `src/lib/workspace-ops.ts` -- `syncWorkspace()` at line 991+ demonstrates parallel fetch, `SyncRow` type, `onProgress` callback, `resolveWorkspaceArg()`

### Git operations
- `src/lib/git.ts` -- `fetchOrigin()`, git shell operations via Bun `$`

### Config and schemas
- `src/lib/config.ts` -- `readWorkspace()`, workspace repo schema with `main_path`, `task_path`, `base_branch`
- `src/lib/paths.ts` -- Path constants

### Requirements
- `.planning/REQUIREMENTS.md` -- PULL-01 through PULL-06 acceptance criteria

### Prior phase context
- `.planning/phases/37-agent-path-discovery/37-CONTEXT.md` -- CWD autodetection pattern (D-08), `resolveWorkspaceArg()` usage

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `syncWorkspace()` in `src/lib/workspace-ops.ts` -- near-identical structure: parallel fetch, per-repo progress, skip/fail handling; primary reference for pull implementation
- `SyncRow` type -- `{ repo, status, detail, conflicts }` can be adapted for pull results
- `fetchOrigin()` in `src/lib/git.ts` -- existing fetch with timeout support
- `resolveWorkspaceArg()` -- CWD autodetection shared helper
- `formatSyncRow()` in `src/commands/workspace.ts` -- output formatting function to follow

### Established Patterns
- Commander.js `.command().option().action()` registration in workspace.ts
- `onProgress` callback for streaming per-repo updates
- `Promise.all()` for parallel fetch with failure tracking via `Map`
- `process.exit(1)` when any repo fails or is skipped
- `formatError()` from `src/lib/errors.ts` for user-facing error messages

### Integration Points
- Register `pull` as subcommand in `registerWorkspaceCommands()` in `src/commands/workspace.ts`
- New `pullWorkspace()` function in `src/lib/workspace-ops.ts` following `syncWorkspace()` pattern
- Reuse `fetchOrigin()` for the parallel fetch phase
- Shell completion auto-generated from Commander tree

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches following the established sync pattern

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 38-multi-repo-pull*
*Context gathered: 2026-03-26*
