# Phase 31: Workspace CWD Auto-Detection - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the `<workspace>` argument optional on all issue commands (link, unlink, open) across all 4 tracker integrations (GitHub, GitLab, Gitea, Jira) by auto-detecting the current workspace from the working directory. Explicit `<workspace>` still works for backward compatibility.

</domain>

<decisions>
## Implementation Decisions

### Detection Mechanism
- New `detectWorkspaceFromCwd()` function in `workspace-ops.ts` — reads all workspace YAMLs, matches CWD against worktree `task_path` entries
- Match using `cwd.startsWith(resolve(expandHome(task_path)))` — supports both worktree root and subdirectories within it
- If CWD matches multiple workspaces, return the deepest (most specific) match — longest `task_path` wins
- Custom `workspace_root` paths from global config are honored via the resolved `task_path` values already stored in workspace YAML

### CLI Argument Change
- Change `<workspace>` to `[workspace]` (optional positional) on all issue commands across all 4 trackers
- If workspace is omitted, call `detectWorkspaceFromCwd()` as fallback
- Error message when detection fails: "Could not detect workspace from current directory. Run from inside a worktree or specify: git-stacks integration {tracker} issue {action} <workspace> ..."
- For `link` command: `git-stacks integration jira issue link PROJ-123` works (workspace from CWD, issue-id as first positional)
- Passing explicit `[workspace]` overrides CWD detection — backward compatibility preserved

### Claude's Discretion
- How to disambiguate `link [workspace] <issue-id>` vs `link <issue-id>` when only one positional is given — likely check if the single arg matches a workspace name
- Whether to cache workspace list during detection or read fresh each time

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `listWorkspaces()` in `config.ts` — reads all workspace YAML files
- `WorkspaceRepo` type has `task_path` field — the path to match against CWD
- `resolveIssueRef()`, `linkIssue()`, `unlinkIssue()` in `issue-utils.ts` — existing issue operations
- `workspaceExists()` in `config.ts` — validates workspace name

### Current Issue Command Pattern (same across all 4 trackers)
- `issue.command("link <workspace> <issue-id>")` — required positional
- `issue.command("unlink <workspace>")` — required positional
- `issue.command("open <workspace>")` — required positional
- All validate workspace with `workspaceExists(workspaceName)` before proceeding

### Integration Points
- `src/lib/integrations/jira.ts` — Jira issue commands (lines 57-99)
- `src/lib/integrations/github.ts` — GitHub issue commands
- `src/lib/integrations/gitlab.ts` — GitLab issue commands
- `src/lib/integrations/gitea.ts` — Gitea issue commands
- `src/lib/workspace-ops.ts` — where detection function will live
- `src/lib/config.ts` — workspace listing and paths

</code_context>

<specifics>
## Specific Ideas

- STATE.md notes: path normalization using `resolve(expandHome(repo.task_path))` on stored paths; use `startsWith(taskPath + "/")` not `===` for subdirectory matching without false-positive collisions.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
