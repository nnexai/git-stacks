# Quick Task 260322-m2k: Unify hook env vars — Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Task Boundary

Unify all injected environment variables across every lifecycle function in workspace-ops.ts. Rename from WS_ prefix to GS_ prefix, apply consistent suffix conventions, and ensure all lifecycle functions use buildBaseEnv.

</domain>

<decisions>
## Implementation Decisions

### Prefix
- Use `GS_` (git-stacks) prefix for all env vars, replacing `WS_`

### Naming convention (suffix rules)
- `_NAME` = identifier strings (names)
- `_PATH` = filesystem paths
- `_BRANCH` = branch names

### Variable mapping
| Old | New | Example |
|-----|-----|---------|
| `WS_WORKSPACE` | `GS_WORKSPACE_NAME` | `my-feature` |
| `WS_BRANCH` | `GS_WORKSPACE_BRANCH` | `feature/my-feature` |
| `WS_TASKS_DIR` | `GS_WORKSPACE_PATH` | `/home/user/workspaces/tasks/my-feature` |
| `WS_TRIGGERED_BY` | `GS_TRIGGERED_BY` | `open`/`close`/`clean`/`remove`/`merge` |
| `WS_REPO_NAME` | `GS_REPO_NAME` | `backend-api` |
| `WS_REPO_PATH` | `GS_REPO_PATH` | `/home/user/workspaces/tasks/my-feature/backend-api` |
| `WS_MAIN_PATH` | `GS_REPO_CLONE_PATH` | `/home/user/workspaces/main/backend-api` |
| `WS_MERGED_BRANCH` | `GS_MERGED_BRANCH` | `feature/my-feature` |

### Scope of WS_TRIGGERED_BY → GS_TRIGGERED_BY
- Inject into ALL lifecycle operations: open, close, clean, remove, merge, create
- Values: `open`, `close`, `clean`, `remove`, `merge`, `create`

### WS_MERGED_BRANCH → GS_MERGED_BRANCH scope
- Inject into the FULL merge cascade (all hooks during merge see it), not just post_merge

### Backward compatibility
- Hard cut — new names only, no deprecated aliases
- Zerover, tool not yet in widespread use

### openWorkspace must use buildBaseEnv
- Currently builds its own inline env object; must be refactored to use buildBaseEnv

</decisions>

<specifics>
## Specific Ideas

- buildBaseEnv already exists and handles WS_TRIGGERED_BY — extend it with the new names
- openWorkspace (line ~685) has an inline env construction that must switch to buildBaseEnv
- Per-repo env construction appears in both _executeClean (line ~240) and openWorkspace (line ~700) — extract a buildRepoEnv helper
- Update all tests that reference WS_ vars to use GS_ vars
- Update README.md and CHANGELOG.md hooks documentation

</specifics>
