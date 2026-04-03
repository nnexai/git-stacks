# Phase 62: Stash on Sync - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

`--stash` flag on `git-stacks sync` that auto-stashes dirty worktree repos before sync, runs the sync, then pops stashes in reverse order. Includes double-stash guard and conflict recovery UX. Scope is sync only — `--stash` on merge deferred to v0.15+.

</domain>

<decisions>
## Implementation Decisions

### TUI stash support
- **D-01:** TUI sync auto-stashes dirty repos without prompting. Equivalent to always passing `--stash` when dirty repos are detected. TUI users expect things to work; requiring CLI for stash defeats the dashboard's purpose.

### Double-stash guard
- **D-02:** Before stashing, check `git stash list` for existing `git-stacks auto-stash` entries per repo. If found, abort the entire sync with recovery hint: "Repo <name> already has a git-stacks auto-stash entry. Resolve it first: git -C <path> stash pop".
- **D-03:** Detection: grep `git stash list` output for the marker string `git-stacks auto-stash`. This is reliable because the marker is set by our `stashPush` call.

### Pop failure recovery
- **D-04:** Any stash pop failure sets `SyncResult.ok = false` (per STH-04). Non-zero exit code from CLI. The sync itself succeeded but workspace is in an inconsistent state.
- **D-05:** Pop continues for remaining repos — one conflict doesn't block others from being restored.
- **D-06:** Each pop failure reports: `⚠ stash pop conflict in <name> — stash preserved. Run: git -C <path> stash pop` with the full path so user can copy-paste.

### Stash behavior (from FEATURES.md spec)
- **D-07:** `git stash push --include-untracked -m "git-stacks auto-stash (sync)"` — includes untracked files, marker message for detection.
- **D-08:** Pop in reverse order of stash (last stashed = first popped).
- **D-09:** `--stash` incompatible with `--dry-run`. `--stash` + `--force` is redundant (`--force` skips dirty check) but harmless.

### Scope
- **D-10:** `--stash` on sync only. `--stash` on merge deferred to v0.15+ (STH-F1).

### Claude's Discretion
- `stashPush` return value details (stashRef format)
- `stashPop` conflict detection heuristic (exit code + stderr parsing)
- Whether TUI progress view shows stash/pop steps alongside sync progress or as separate phases
- Test approach for stash primitives (mock git commands)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Feature specification
- `FEATURES.md` §5 "`--stash` on Sync (maybe)" — Design spec: behavior, failure handling, git primitives, integration point, options interaction

### Requirements
- `.planning/REQUIREMENTS.md` §"Stash" — STH-01 through STH-04 acceptance criteria
- `.planning/REQUIREMENTS.md` §"Out of Scope" — STH-F1 (`--stash` on merge) explicitly deferred

### Existing code
- `src/lib/git.ts` — `isRepoDirty()` used in dirty checks; `stashPush`/`stashPop` to be added here
- `src/lib/workspace-ops.ts` — `syncWorkspace()` (line 1027) is the integration point; `SyncResult` type (line 1013)
- `src/commands/workspace.ts` — `sync` command where `--stash` flag will be registered

### Prior decisions (STATE.md)
- Double-stash guard: refuse to stash if `git-stacks auto-stash` entry exists in stash list

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `isRepoDirty()` in git.ts — already checks dirty state; used to determine which repos need stashing
- `SyncResult` type — extend with stash-related failure info
- `SyncRow` / `SyncProgressView` — extend to show stash/pop steps

### Established Patterns
- `$\`git -C ...\`.quiet().nothrow()` for git operations with exit code checking
- `syncWorkspace` already iterates worktree repos, has `onProgress` callback
- Error return pattern: `{ ok: false, error: "..." }`

### Integration Points
- `syncWorkspace()` — insert stash phase before dirty check, pop phase after sync
- `workspace.ts` sync command — add `--stash` option
- TUI sync action in `App.tsx` — pass `stash: true` when dirty repos detected

</code_context>

<specifics>
## Specific Ideas

- Marker message `"git-stacks auto-stash (sync)"` is both human-readable and machine-detectable
- Recovery commands include full repo path for copy-paste convenience
- TUI auto-stash is a UX improvement — dashboard users shouldn't need to drop to CLI for common workflows

</specifics>

<deferred>
## Deferred Ideas

- `--stash` on `git-stacks merge` — STH-F1, v0.15+

</deferred>

---

*Phase: 62-stash-on-sync*
*Context gathered: 2026-04-03*
