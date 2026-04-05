# Phase 65: Workspace Lifecycle - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Creating, opening, and destroying workspaces that include dir repos works without git errors. Dir repos are included in workspace YAML with `mode: "dir"` and `main_path` only — no worktree creation, no branch operations. Hooks and env context include dir repo paths.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key areas:
- How `workspace-ops.ts` handles dir repos in openWorkspace (skip git checkout, include in env/hooks)
- How close/clean/remove skip worktree deletion for dir repos (guard on mode !== "dir")
- How `workspace-wizard.ts` buildReposFromTemplate constructs the workspace YAML entry (already partially done in Phase 64)
- Whether `task_path` undefined propagation requires null guards in workspace-ops.ts functions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/config.ts` — WorkspaceRepoSchema now has optional task_path and mode: "dir"
- `src/lib/workspace-ops.ts` — openWorkspace, closeWorkspace, cleanWorkspace, removeWorkspace
- `src/tui/workspace-wizard.ts` — buildReposFromTemplate already handles dir repos (Phase 64)
- `src/lib/lifecycle.ts` — runHooks() with env injection

### Established Patterns
- Workspace repos have `mode` field — existing code checks `mode === "worktree"` vs `mode === "trunk"`
- Git operations use `$.cwd(repo.task_path || repo.main_path)` pattern
- Hooks receive `GS_REPO_NAME`, `GS_REPO_PATH` env vars per repo

### Integration Points
- `openWorkspace()` — must skip git checkout/branch for dir repos, still include in hook env
- `closeWorkspace()` — must skip worktree removal for dir repos
- `cleanWorkspace()` — must skip worktree cleanup for dir repos
- `removeWorkspace()` — cascades through clean/close, should work if those handle dir correctly
- `task_path` is now optional — all consumers in workspace-ops.ts need null guards

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
