# Quick Task 260404-atz: Fix dirty/ahead-behind checks to include trunk repos - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Task Boundary

Fix dirty/ahead-behind checks to include trunk repos in list and status commands. Currently both `getWorkspaceListInfo` and `getWorkspaceStatus` completely skip trunk repos for dirty checks and ahead/behind computation. Trunk repos are filtered out with `.filter((r) => r.mode === "worktree")`.

Three functions need fixing:
- `getWorkspaceListInfo` in `src/lib/workspace-ops.ts` — list command aggregation
- `getWorkspaceStatus` in `src/lib/workspace-ops.ts` — status command per-repo detail
- Status command `--fetch` handler in `src/commands/workspace.ts` — only fetches worktree repos
- Status command display in `src/commands/workspace.ts` — explicitly suppresses ahead/behind for trunk

</domain>

<decisions>
## Implementation Decisions

### Ahead/behind base reference for trunk repos
- Compare HEAD vs `origin/<current_branch>` (the tracking branch) — shows if trunk is out of sync with its remote, same semantics as `git status`
- This differs from worktree repos which compare against `origin/<base_branch>` — appropriate because trunk repos aren't on a feature branch

### Display format
- Trunk repos show dirty mark + up/down counts — unified display with worktree repos, no special-casing
- Remove the `if (repo.mode === "worktree")` guard in the status command display that currently suppresses ahead/behind for trunk and shows "—" instead

### Fetch behavior
- `--fetch` fetches all repos in workspace including trunk repos — gives accurate counts for everything
- Remove the `r.mode === "worktree"` filter in the fetch dedup logic

### Claude's Discretion
- Path to check for trunk repos: use `main_path` (the clone path), not `task_path` (which for trunk repos equals `main_path` anyway per workspace creation logic, but `main_path` is semantically correct)

</decisions>

<specifics>
## Specific Ideas

- For trunk ahead/behind: use `getCurrentBranch()` to get the current branch, then compare `HEAD` vs `origin/<currentBranch>`
- For trunk dirty: use `isRepoDirty(main_path)` — same function, just different path
- The `getWorkspaceListInfo` aggregation should include trunk repos in its totals (ahead sum, behind max, stale check)

</specifics>
