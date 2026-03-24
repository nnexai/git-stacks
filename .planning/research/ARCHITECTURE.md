# Architecture Research

**Domain:** CLI workspace manager — integration polish and workspace UX improvements (v0.8.0)
**Researched:** 2026-03-24
**Confidence:** HIGH (all source code read directly from repository)

## Feature Integration Map

This milestone touches four distinct areas of the codebase. Each maps cleanly to existing seams without architectural changes.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         TUI Dashboard Layer                           │
│  src/tui/dashboard/WorkspaceDetail.tsx                               │
│  Feature 1: Add linked issues section (read ws().settings only)      │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ reads workspace data already in props
┌─────────────────────────────▼────────────────────────────────────────┐
│                      Integration Plugins Layer                        │
│  src/lib/integrations/                                               │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐   │
│  │   jira.ts       │  │   gitlab.ts      │  │  issue-utils.ts   │   │
│  │ Feature 3:      │  │ Feature 2:       │  │ Feature 3:        │   │
│  │ make workspace  │  │ investigate      │  │ new              │   │
│  │ arg optional,   │  │ --branch flag    │  │ resolveWorkspace  │   │
│  │ use CWD detect  │  │ for mr view      │  │ FromCwd()        │   │
│  └─────────────────┘  └──────────────────┘  └───────────────────┘   │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ Feature 4 sits here
┌─────────────────────────────▼────────────────────────────────────────┐
│                        Core Library Layer                             │
│  src/lib/git.ts                                                      │
│  createWorktree() — Feature 4: add remote branch check before        │
│  creating new local branch                                           │
│  + new checkRemoteBranchExists()                                     │
└──────────────────────────────────────────────────────────────────────┘
```

## Feature 1: Dashboard Linked Issues Display Bug

### Root Cause

`WorkspaceDetail.tsx` renders an "Integrations" section that shows enabled/disabled state and a `configSummary`. The config summary falls back to global config when the workspace has no explicit per-key override:

```typescript
// WorkspaceDetail.tsx lines 130-133
const rawConfig = (ws().settings?.integrations?.[integration.id]
  ?? globalConfig.integrations[integration.id]  // BUG: falls back to global
  ?? {}) as Record<string, unknown>
```

When a workspace has a Jira `issue` field stored (via `linkIssue()`) but no explicit `enabled`/`open_cmd` override, the `??` fallback reaches `globalConfig.integrations["jira"]`, showing the global `open_cmd` setting. Additionally, there is no dedicated "Linked Issues" section anywhere in `WorkspaceDetail.tsx` — the `issue` key stored under `settings.integrations.jira.issue` is never rendered.

### Data Shape (already in YAML)

```
workspace.settings.integrations.jira.issue = "PROJ-123"
workspace.settings.integrations.github.issue = "456"
```

Written by `linkIssue()` in `src/lib/integrations/issue-utils.ts`. The workspace object is already passed to the component as `entry().workspace` — no new data loading needed.

### Component to Modify

**File:** `src/tui/dashboard/WorkspaceDetail.tsx`

Two changes:

1. Add a "Linked Issues" section. After the Messages section, before the Integrations section, iterate through all integrations and check if `ws().settings?.integrations?.[integration.id]?.issue` is set. For those that have an issue, render the tracker ID and issue key.

2. Fix the configSummary source: use workspace-level config for display without falling back to global config. If there is no workspace-level override, show nothing in the configSummary rather than showing global config values that belong to a different scope.

No new functions. No schema changes. Pure display logic fix.

### Component Boundaries

| Component | Change | Scope |
|-----------|--------|-------|
| `WorkspaceDetail.tsx` | Add linked issues section; fix configSummary source | Modified |
| `issue-utils.ts` | No changes | Unchanged |
| `jira.ts` | No changes | Unchanged |
| `WorkspaceSchema` in `config.ts` | No changes — issue field already stored | Unchanged |

## Feature 2: Branch Name '/' Escaping for GitLab

### Investigation Result

The `gitlab.ts` `pr open` command passes `["mr", "view", "--web"]` to `glab` via `Bun.spawn`. There is no branch name argument passed — `glab` infers the branch from the git CWD. The `glab mr create` command does pass `--target-branch baseBranch`, but this is the base branch (e.g. `main`), not the feature branch with `/` in it.

Since `Bun.spawn` receives arguments as an array (not a shell string), there is no shell escaping involved. Slashes in branch names pass through as-is to glab.

The actual issue is likely that `glab mr view --web` constructs a URL containing the branch name as a path segment. GitLab encodes `/` as `%2F` in MR URLs (e.g. `/-/merge_requests?source_branch=feature%2Fmy-ticket`). Whether glab does this encoding correctly is on glab's side. However, if glab fails to find the MR when the branch contains `/`, an explicit `--branch` flag may provide a workaround.

### Targeted Investigation

**File:** `src/lib/integrations/gitlab.ts`

The `pr open` and `pr create` commands. The `resolution.workspace.branch` field contains the full branch name including `/`. The workspace object is available from `resolveForgeRepo()` return value.

**Potential workaround if glab fails on `/` branches:**

```typescript
// pr open action — current:
const result = await _exec.run(["mr", "view", "--web"], repoPath)

// Potential fix — pass branch explicitly:
const { repoPath, workspace } = resolution
const result = await _exec.run(["mr", "view", "--web", "--source-branch", workspace.branch], repoPath)
```

Needs verification against a GitLab project with a `/`-containing branch. The fix is a one-liner addition if needed.

### Component Boundaries

| Component | Change | Scope |
|-----------|--------|-------|
| `gitlab.ts` | Add explicit `--source-branch` to `glab mr view` if needed | Possibly modified |
| `forge-utils.ts` | `ForgeRepoResolution` already includes `workspace` object | Unchanged |
| `git.ts` | No changes | Unchanged |

## Feature 3: Jira Workspace Auto-Detection from CWD

### Data Flow

Workspace task paths follow a deterministic pattern written at creation time:

```
{workspace_root}/tasks/{workspace_name}/{repo_name}/
```

A developer working inside a worktree has `process.cwd()` somewhere under `{workspace_root}/tasks/{workspace_name}/{repo_name}/`. The workspace detection algorithm:

```
process.cwd()
    ↓ normalize path
scan listWorkspaces() → [{name, repos: [{task_path}]}]
    ↓ for each workspace, for each repo
check: normalize(cwd).startsWith(normalize(task_path) + sep)
    ↓ first match
return workspace.name
```

This is synchronous and reads only from already-loaded YAML config. No git commands required.

### New Function

**File:** `src/lib/integrations/issue-utils.ts`

```typescript
/** Detect which workspace the current working directory belongs to, if any. */
export function resolveWorkspaceFromCwd(cwd?: string): string | null {
  const { normalize, sep } = require("path")
  const dir = normalize(cwd ?? process.cwd())
  const workspaces = listWorkspaces()
  for (const ws of workspaces) {
    for (const repo of ws.repos) {
      const taskPath = normalize(repo.task_path)
      if (dir === taskPath || dir.startsWith(taskPath + sep)) {
        return ws.name
      }
    }
  }
  return null
}
```

Imports: `normalize`, `sep` from `"path"` (already available in Bun); `listWorkspaces` from `"../config"` (already imported in `issue-utils.ts`).

### Component to Modify

**File:** `src/lib/integrations/jira.ts`

The three issue subcommands (`link`, `unlink`, `open`) each have `<workspace>` as a required positional argument. Change to `[workspace]` with CWD fallback:

```typescript
issue.command("link [workspace] <issue-id>")
  .action(async (workspaceArg: string | undefined, issueId: string) => {
    const workspaceName = workspaceArg ?? resolveWorkspaceFromCwd()
    if (!workspaceName) {
      console.error("No workspace specified and not inside a workspace directory.")
      console.error("Usage: git-stacks integration jira issue link <workspace> <issue-id>")
      process.exit(1)
    }
    // rest unchanged
  })
```

Commander.js positional argument ordering consideration for `link [workspace] <issue-id>`: when a single positional arg is provided, Commander assigns it to `workspace` (the first declared), leaving `issue-id` undefined. This is incorrect behavior for the CWD-detection path where only the issue ID is provided.

**Correct approach for `link`:** Keep `issue-id` as the only required positional, make `workspace` optional and placed after:

```
issue.command("link <issue-id> [workspace]")
```

Or use an `--workspace` option to avoid positional ordering ambiguity:

```
issue.command("link <issue-id>")
  .option("-w, --workspace <name>", "Workspace name (default: detected from CWD)")
```

The option approach is cleaner and avoids positional ambiguity. For `unlink` and `open`, no second positional exists, so making `<workspace>` into `[workspace]` works cleanly.

### Component Boundaries

| Component | Change | Scope |
|-----------|--------|-------|
| `jira.ts` | Make workspace argument optional in link/unlink/open, add CWD fallback | Modified |
| `issue-utils.ts` | Add `resolveWorkspaceFromCwd()` | New function |
| `forge-utils.ts` | `resolveRepoCwd()` already exists for git root detection — not reused here | Unchanged |
| `config.ts` | `listWorkspaces()` already exported, no changes | Unchanged |
| `paths.ts` | No changes | Unchanged |

### Why resolveRepoCwd() Is Not Reused

`resolveRepoCwd()` in `forge-utils.ts` runs `git rev-parse --show-toplevel` and returns the git repository root. This is a git-level operation — it returns the repo root directory (e.g. `/home/user/workspaces/tasks/my-feature/api`). It does not know which git-stacks workspace that repo belongs to. `resolveWorkspaceFromCwd()` is a config-level operation that matches against stored `task_path` values in workspace YAMLs. They solve different problems.

## Feature 4: Upstream Branch Checking During Worktree Creation

### Current createWorktree Logic

`src/lib/git.ts`:

```typescript
export async function createWorktree(repoPath, worktreePath, branch) {
  const exists = await checkBranchExists(repoPath, branch)  // local refs only
  if (exists) {
    await $`git -C ${repoPath} worktree add ${worktreePath} ${branch}`
  } else {
    // Creates new branch from current HEAD — ignores remote
    await $`git -C ${repoPath} worktree add -b ${branch} ${worktreePath}`
  }
}
```

`checkBranchExists()` uses `git rev-parse --verify <branch>` which checks local refs only. When a branch already exists on the remote (pushed by a colleague for review), the current code creates a new local branch from HEAD rather than checking out the existing remote branch. This breaks the reviews use case.

### Modified Logic

**New function in `src/lib/git.ts`:**

```typescript
/** Check if a branch exists on the remote (origin). Makes a network call via ls-remote. */
export async function checkRemoteBranchExists(
  repoPath: string,
  branch: string
): Promise<boolean> {
  const result = await $`git -C ${repoPath} ls-remote --exit-code --heads origin ${branch}`
    .quiet()
    .nothrow()
  return result.exitCode === 0
}
```

**Modified `createWorktree()`:**

```typescript
export async function createWorktree(repoPath, worktreePath, branch) {
  const existsLocally = await checkBranchExists(repoPath, branch)
  if (existsLocally) {
    // Branch exists locally — attach to it (existing behavior)
    await $`git -C ${repoPath} worktree add ${worktreePath} ${branch}`
  } else {
    const existsRemotely = await checkRemoteBranchExists(repoPath, branch)
    if (existsRemotely) {
      // Branch exists on remote but not locally — checkout with tracking
      await $`git -C ${repoPath} worktree add --track -b ${branch} ${worktreePath} origin/${branch}`
    } else {
      // Branch is new — create from current HEAD (existing behavior)
      await $`git -C ${repoPath} worktree add -b ${branch} ${worktreePath}`
    }
  }
}
```

`git worktree add --track -b <branch> <path> origin/<branch>` creates a local branch tracking the remote tracking branch. This is the correct git idiom for checking out a remote branch that does not yet exist locally.

### Call Sites (all benefit automatically)

| Location | Call | Context |
|----------|------|---------|
| `src/tui/workspace-wizard.ts` line 347 | `createWorktree(repo.main_path, repo.task_path, branch)` | `git-stacks new` |
| `src/tui/workspace-clone.ts` line 133 | `createWorktree(repo.main_path, repo.task_path, newBranch)` | `git-stacks clone` |
| `src/tui/dashboard/App.tsx` line 729 | `createWorktree(repo.main_path, repo.task_path, branch)` | TUI create flow |
| `src/lib/workspace-ops.ts` line 732 | `createWorktree(repo.main_path, repo.task_path, workspace.branch)` | `open` missing worktree recreation |
| `src/lib/workspace-ops.ts` line 807 | `createWorktree(repo.main_path, worktreePath, expectedBranch)` | trunk mode fallback |
| `src/lib/workspace-ops.ts` line 879 | `createWorktree(repo.main_path, newWorktreePath, workspace.branch)` | `rename` command |

One change in `git.ts` propagates to all six call sites.

### Performance Note

`ls-remote` is a network call (100ms–2s depending on remote latency). It is only triggered on the new-branch code path — when a branch does not exist locally. In the common case (creating a brand-new workspace), the branch does not exist remotely either, so `ls-remote` runs once per repo and returns quickly. The existing `isBranchGoneOnRemote()` function in `git.ts` already uses `ls-remote` for cleanup operations, establishing this as an accepted pattern.

### Component Boundaries

| Component | Change | Scope |
|-----------|--------|-------|
| `git.ts` | Add `checkRemoteBranchExists()`; modify `createWorktree()` with remote check | Modified |
| `workspace-wizard.ts` | No changes | Unchanged |
| `workspace-clone.ts` | No changes | Unchanged |
| `App.tsx` | No changes | Unchanged |
| `workspace-ops.ts` | No changes | Unchanged |

## Build Order

Dependencies between the four features:

```
Feature 4 (git.ts only)            — no dependencies, smallest blast radius
Feature 1 (TUI display fix)        — no dependencies, reads existing data
Feature 3 (Jira CWD detection)     — new function in issue-utils.ts, changes jira.ts signatures
Feature 2 (GitLab branch escaping) — investigation + targeted fix, uncertain scope
```

**Recommended sequence:**

1. **Feature 4** — touches only `git.ts`, single-function change with clear correct behavior, immediately beneficial for all worktree creation paths
2. **Feature 1** — dashboard display fix, TUI-only, clear root cause identified, no new functions
3. **Feature 3** — adds `resolveWorkspaceFromCwd()` to `issue-utils.ts`, changes Jira command signatures; test carefully for Commander.js positional arg behavior
4. **Feature 2** — investigate first with a real GitLab project containing a `/`-branch; fix only if confirmed to be on our side

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using resolveRepoCwd() for Workspace Detection

`resolveRepoCwd()` in `forge-utils.ts` runs `git rev-parse --show-toplevel`. Do not use this for workspace detection. It returns the git repository root, not the workspace name. Use `resolveWorkspaceFromCwd()` (path prefix matching against stored `task_path` values) instead.

### Anti-Pattern 2: Falling Back Across Config Scopes in Display Logic

The existing `configSummary` bug falls back from workspace config to global config for rendering. This produces misleading output. When displaying workspace-level data, only read from workspace-level config. If there is no workspace override, show nothing or a `[global]` indicator — do not inherit global values as if they were workspace values.

### Anti-Pattern 3: Positional Arg Ambiguity in Commander.js

For `jira issue link`, if both `workspace` and `issue-id` are positional args, Commander assigns them left-to-right. Making `workspace` optional before a required `issue-id` creates ambiguity. Use an `--workspace` option or reorder as `link <issue-id> [workspace]` to keep the required arg first.

### Anti-Pattern 4: Calling listWorkspaces() in a Hot Path

`resolveWorkspaceFromCwd()` calls `listWorkspaces()`, which reads all workspace YAMLs from disk. Acceptable for a one-shot CLI invocation. Not acceptable in a TUI tick loop. The Jira issue commands are CLI-only, so this is not currently a problem.

### Anti-Pattern 5: ls-remote Without .nothrow()

`checkRemoteBranchExists()` must use `.nothrow()` to prevent throwing on non-zero exit code (which means the branch does not exist). The pattern is established in the existing `isBranchGoneOnRemote()` function in the same file.

## Integration Points Summary

| Feature | Files Modified | Files Added | New Functions |
|---------|---------------|-------------|---------------|
| Dashboard linked issues display | `WorkspaceDetail.tsx` | none | none |
| GitLab branch escaping | `gitlab.ts` (conditional) | none | none |
| Jira CWD detection | `jira.ts`, `issue-utils.ts` | none | `resolveWorkspaceFromCwd()` |
| Upstream branch check | `git.ts` | none | `checkRemoteBranchExists()` |

All four features are additive changes to existing files. No new modules, no schema changes, no YAML migration needed. No existing function signatures change externally (only `createWorktree` internal behavior changes, all call sites remain the same).

## Sources

- Source code read directly: `src/lib/git.ts`, `src/lib/integrations/jira.ts`, `src/lib/integrations/gitlab.ts`, `src/lib/integrations/forge-utils.ts`, `src/lib/integrations/issue-utils.ts`, `src/lib/integrations/types.ts`, `src/lib/integrations/index.ts`, `src/tui/dashboard/WorkspaceDetail.tsx`, `src/lib/config.ts`, `src/lib/paths.ts`, `src/lib/workspace-ops.ts`
- Planning notes: `.planning/notes/2026-03-23-linked-issues-not-correctly.md`, `-branch-name-slash-gitlab.md`, `-jira-integration-auto-detect-workspace.md`, `-worktrees-check-upstream-branch.md`
- Todo files: `.planning/todos/pending/005` through `008`
- `.planning/PROJECT.md` for milestone context and existing architectural decisions

---
*Architecture research for: git-stacks v0.8.0 Integration Polish and Workspace UX*
*Researched: 2026-03-24*
