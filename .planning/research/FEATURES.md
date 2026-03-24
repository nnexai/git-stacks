# Feature Research — v0.8.0 Integration Polish & Workspace UX

**Domain:** CLI workspace manager — integration bug fixes and workspace UX improvements
**Researched:** 2026-03-24
**Confidence:** HIGH (codebase analysis + git/glab official docs) / MEDIUM (glab branch escaping — known upstream issue, fix direction confirmed)

---

## Feature Overview

This milestone contains 4 features: 2 bug fixes and 2 UX enhancements. All 4 are additive or corrective — no architecture changes, no schema migrations. Each feature is scoped to one or two files in the integration layer.

---

## Feature 1: Fix Dashboard Linked Issues Display

### What Is Broken

The `WorkspaceDetail` component in `src/tui/dashboard/WorkspaceDetail.tsx` (lines 128-137) builds its "config summary" for enabled integrations by reading:

```
ws().settings?.integrations?.[integration.id] ?? globalConfig.integrations[integration.id] ?? {}
```

This fallback to `globalConfig` is correct for integration _settings_ (enabled flags, open_cmd templates) but incorrect for _linked issue IDs_. The `issue` field inside `settings.integrations.jira` is per-workspace — it is written there by `linkIssue()` in `issue-utils.ts`. The dashboard is displaying `issue: <first-linked-issue>` using global Jira config as the data source when the workspace has no linked issue, or showing the wrong workspace's issue data.

The `open` command works correctly because it reads `workspace.settings.integrations.jira.issue` directly via `resolveIssueRef()`. The display bug is entirely in `WorkspaceDetail.tsx`.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-workspace linked issue shown in detail pane | Users link issues to specific workspaces; the detail pane must show only that workspace's issue, not a global fallback or neighbor's data | LOW | Config summary in WorkspaceDetail reads issue IDs from workspace settings only. Filter out `issue` from the global config fallback path. Two options: (a) show linked issues as a separate section below integrations, or (b) ensure the configSummary only falls back to global for non-issue fields. Option (b) requires least UI change. |
| No issue displayed when none is linked | Empty state must be correct — "no issue linked" not a stale issue from a previous selection | LOW | When `settings.integrations.<trackerId>.issue` is absent, omit that field from configSummary entirely. |
| Source annotation "[global]" only for config, not issue IDs | The `[global]` annotation is correct for `enabled` and `open_cmd` settings, but issue IDs are always per-workspace (written by `linkIssue()`) — showing `[global]` for an issue ID is misleading | LOW | Issue IDs should only be displayed if present in workspace settings. Fallback to global must not source `issue` fields. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Separate "Linked Issues" section in detail pane | Cleaner separation of concerns | Adds UI rows, requires more layout work in OpenTUI | Fix the configSummary extraction logic to filter issue fields; a sub-section can come later if demanded |
| Cross-workspace issue aggregation view | See all linked issues in one view | Out of scope for this fix; a dashboard-wide issues view is a v0.9+ feature | Fix per-workspace display first |

### Dependencies

- Depends on: existing `settings.integrations` schema in WorkspaceSchema (already present)
- Depends on: `resolveIssueRef` in `issue-utils.ts` (pattern to follow for correct field access)
- No downstream dependencies

---

## Feature 2: Fix Branch Name '/' Escaping for GitLab Open

### What Is Known

Branch names with `/` in them (e.g., `feature/PROJ-42`) are standard naming convention in git workflows. When `glab mr view` or `glab repo view --web` is called with a worktree whose branch contains a `/`, the branch name is passed as part of the URL path in GitLab's web interface.

**glab upstream finding (MEDIUM confidence):** A merge request was merged into `gitlab-org/cli` that adds `url.PathEscape` to branch names in web URLs (MR !1183). This fix applies to `--web` flag path construction. However, glab does _not_ take a branch name as a CLI argument in `mr view` — it infers the current branch from the git repo's HEAD. The `/` issue in CLI-to-forge workflow likely manifests differently.

**Our code path:** `git-stacks gitlab pr open <workspace> [repo]` calls `glab mr view --web` in the context of `repo.task_path`. The worktree at `task_path` has `HEAD` on the workspace branch (e.g., `feature/my-task`). `glab mr view` reads the current branch from git and constructs the MR URL. If glab's branch URL encoding is fixed in recent versions, the bug may be in glab's version the user has installed. If it manifests in our code, it would be in how we construct or pass arguments.

**Our code does NOT pass the branch name as an argument** to `glab mr view` — glab reads it from git HEAD. So if there is an escaping bug, it is either:
1. A glab version issue (fixed in recent glab, user needs to update), or
2. Something in how we pass the worktree path as `cwd` to glab

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Branch names with `/` work transparently for glab operations | `feature/my-task` is the most common branch naming pattern; any escaping that breaks URL construction must be fixed | LOW | Investigate: verify glab version, test with a `/` branch in worktree. If it is a glab version issue, document the minimum required version. If it is our code, add a test case. |
| Investigation documented in code/comments | Future maintainers must understand what was checked | LOW | Add a comment in gitlab.ts near the `mr view --web` call if any workaround is needed |
| Doctor check for minimum glab version | If the fix requires glab >= X.Y, the doctor command should verify this | MEDIUM | `glab --version` parses semver; add to doctor integration check. Optional depending on investigation result. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Show the branch being used in verbose output | Print `Opening MR for branch: feature/my-task` before calling glab | LOW | Helps users debug issues; shows what branch glab will see |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| URL-encode branch names before passing to glab | Our code doesn't pass branch names to glab — glab reads HEAD | Would mask the actual issue and break glab's own encoding if it also encodes | Verify the bug location first; don't patch symptoms |

### Dependencies

- Depends on: `_exec.run()` in `src/lib/integrations/gitlab.ts`
- Depends on: worktree path resolution in `forge-utils.ts` (provides the CWD)
- No schema changes needed

---

## Feature 3: Jira Integration Auto-Detect Workspace from CWD

### What Is Expected

When a user is working inside a worktree (e.g., `~/workspaces/tasks/my-task/api-repo/`), they should not need to type the workspace name to run issue commands. Parallel tools like `gh`, `glab`, and `tea` all auto-detect the repo context from the current directory. Users expect the same ergonomics from git-stacks issue commands.

Current commands require explicit workspace name:
```
git-stacks jira issue open my-task     # current, requires workspace name
git-stacks jira issue open             # desired, auto-detects from CWD
```

### Auto-Detection Pattern

Workspace worktrees live at: `{workspace_root}/tasks/{workspace_name}/{repo_name}/`

Auto-detection algorithm:
1. Get `process.cwd()`
2. Read `workspace_root` from global config
3. Check if CWD starts with `{workspace_root}/tasks/`
4. If yes, extract the workspace name segment: `cwd.split('/tasks/')[1]?.split('/')[0]`
5. Verify the extracted name is a valid workspace (check YAML exists)
6. If valid, use it; if not, fall back to requiring the argument

This is a path-matching approach — pure string operations, no filesystem traversal beyond checking the workspace YAML exists. Fast and reliable for standard workspace layouts.

**Edge case: custom workspace_root.** The global config `workspace_root` may be `~/workspaces` (default) or a custom path. The detection must read from config, not hardcode.

**Edge case: trunk-mode repos.** Trunk repos use `main_path` (the main clone), not a tasks sub-path. CWD auto-detection only works from within a worktree path. Trunk repo paths cannot be auto-detected this way because they are not under `tasks/`.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `<workspace>` argument optional when CWD is inside a worktree | Standard ergonomic pattern in all forge CLIs; reduces friction for the most common use case | LOW | Make `<workspace>` optional in Commander.js command definition (`[workspace]` not `<workspace>`). Add detection function `detectWorkspaceFromCwd()` in `issue-utils.ts` or a new `cwd-utils.ts`. |
| Clear error when workspace cannot be determined and no argument given | When not inside a worktree, and no argument, the error must tell the user to specify a workspace | LOW | If detection returns null and no arg provided: `"Cannot determine workspace from current directory. Run from a worktree or provide workspace name: git-stacks jira issue open <workspace>"` |
| Detection uses workspace_root from config, not hardcoded path | Users with custom workspace_root must get the same experience | LOW | Call `readGlobalConfig()` to get `workspace_root`. Expand `~` via `expandHome()` from `paths.ts`. |
| Applies to all three Jira issue subcommands | `issue link`, `issue unlink`, `issue open` all take a workspace argument | LOW | Extract detection into a shared helper called by all three. link/unlink both need a workspace name; open also needs it. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Auto-detection extended to GitHub/GitLab/Gitea issue commands | The same pattern would benefit all four tracker integrations | LOW | After implementing for Jira, apply the same helper to GitHub, GitLab, Gitea issue commands. Separate issue or same phase — coordination needed. |
| Print detected workspace name when auto-detecting | `Detected workspace: my-task` gives users confirmation, prevents silent wrong-workspace operations | LOW | Print to stderr (not stdout) so it doesn't interfere with pipe-able output. Can be suppressed with `--quiet`. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Walk parent directories looking for git-stacks markers | More robust detection for unusual directory layouts | Creates O(depth) filesystem stat calls; slower and fragile if `tasks/` path convention is not followed | Path-prefix matching against `workspace_root/tasks/` is fast, reliable, and convention-based |
| Fuzzy match workspace name from branch name | Infer workspace from current branch name | Branch names are not required to match workspace names (they often do, but not always — templates use `branch_pattern`) | Use path-based detection; it is deterministic |

### Dependencies

- Depends on: `readGlobalConfig()` in `config.ts` for `workspace_root`
- Depends on: `expandHome()` in `paths.ts`
- Depends on: `workspaceExists()` and `readWorkspace()` in `config.ts` for validation
- Enhances: all four `issue link/unlink/open` subcommands in `jira.ts`
- Can follow same pattern for: `github.ts`, `gitlab.ts`, `gitea.ts` issue commands

---

## Feature 4: Worktree Creation Checks for Existing Upstream Branch

### What Is Expected

When `git-stacks new` creates a workspace, it calls `createWorktree()` in `src/lib/git.ts`. The current logic:

```typescript
const exists = await checkBranchExists(repoPath, branch)
if (exists) {
  // branch exists locally → check it out
  await $`git -C ${repoPath} worktree add ${worktreePath} ${branch}`
} else {
  // branch does not exist → create new from HEAD
  await $`git -C ${repoPath} worktree add -b ${branch} ${worktreePath}`
}
```

This only checks for local branch existence. If the branch exists on `origin` but not locally (common when another developer pushed it, or when switching machines), the new worktree gets a fresh branch from HEAD instead of tracking the existing remote branch. The user then has no tracking link and `git push` fails with "set-upstream" error.

**Expected behavior (matches git defaults):** If `origin/<branch>` exists and no local branch exists, create the worktree tracking `origin/<branch>`. This is what `git worktree add <path> <branch>` does automatically when the branch name matches a unique remote-tracking branch — git calls this "DWIM" (Do What I Mean).

**git worktree DWIM behavior (HIGH confidence — official docs):** If `<commit-ish>` is a branch name not found locally, and exactly one remote has a tracking branch with that name, git automatically creates a local branch tracking it, equivalent to:
```
git worktree add --track -b <branch> <path> <remote>/<branch>
```

**The current code bypasses DWIM** by checking `checkBranchExists()` first and explicitly using `-b` (create new) when the branch doesn't exist locally. This skips the remote check and prevents the auto-tracking behavior.

### Fix Strategy

Change `createWorktree()` to:
1. Check local branch existence (current behavior).
2. If not found locally, check remote: `git ls-remote --exit-code --heads origin <branch>`.
3. If found on remote: use `git worktree add --track -b <branch> <path> origin/<branch>` — this creates the local branch and sets upstream tracking.
4. If not found on remote: use current behavior (`worktree add -b <branch> <path>` — new branch from HEAD).

This restores the DWIM behavior that the current `checkBranchExists` optimization was unintentionally suppressing.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Worktree creation links to existing upstream branch | When `origin/<branch>` exists, the new worktree should track it automatically — `git push` and `git pull` work without `--set-upstream` | LOW | Add `checkRemoteBranchExists()` to `git.ts` using `git ls-remote --exit-code --heads origin <branch>`. Already have `isBranchGoneOnRemote()` as a reference — it uses the same command. Reuse or generalize. |
| New branch (no remote) still creates fresh from HEAD | If neither local nor remote branch exists, behavior is unchanged | LOW | Three-way check: local → remote → new. No regression for the common new-workspace case. |
| Existing local branch behavior unchanged | If local branch already exists, `worktree add <path> <branch>` without `-b` — already correct | LOW | The existing local branch code path is correct; only the "not found locally" path changes. |
| `--track` flag used explicitly when tracking remote | Makes the tracking relationship explicit rather than relying on git's inference | LOW | `git worktree add --track -b <branch> <path> origin/<branch>` is the canonical form. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Progress message indicates remote tracking setup | `Tracking remote branch origin/<branch>` during workspace creation gives users confidence the link was established | LOW | `onProgress` callback in `workspace-ops.ts` calls `createWorktree`; add a return value or callback to convey tracking status. Or simply log in `createWorktree` itself. |
| Doctor warns on worktrees missing upstream tracking | `git-stacks doctor` could check each worktree for missing upstream tracking and suggest `git branch --set-upstream-to` | MEDIUM | Useful for existing workspaces created before this fix. Post-MVP addition. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Fetch before checking remote branch | Ensures remote branch list is up-to-date | Adds network latency to every workspace creation; most users just created the branch and pushed it | `git ls-remote` queries the remote directly without requiring a local fetch; it reflects current remote state |
| Automatically push new branches to remote | Completes the round-trip | Too opinionated; some workflows push only after work begins; hooks handle this case if needed | Let the user push via hooks or manually; only set tracking when branch exists on remote |

### Dependencies

- Depends on: `checkBranchExists()` in `git.ts` (existing — only adds remote check)
- Depends on: `isBranchGoneOnRemote()` in `git.ts` (same `ls-remote` pattern, can generalize)
- Called from: `createWorktree()` in `git.ts`, which is called from `workspace-ops.ts` line 732
- No schema changes needed; no config changes needed

---

## Feature Dependencies

```
Feature 1: Dashboard Linked Issues Display Fix
    └──reads──> workspace.settings.integrations (existing schema, no change)
    └──independent──> Features 2, 3, 4

Feature 2: GitLab Branch '/' Escaping Fix
    └──reads──> gitlab.ts _exec.run() and forge-utils.ts
    └──independent──> Features 1, 3, 4

Feature 3: Jira Workspace Auto-Detection
    └──reads──> globalConfig.workspace_root
    └──reads──> workspace task_path convention (tasks/<name>/<repo>)
    └──enhances──> Feature 1 (less friction to get to issue open commands)
    └──can-extend-to──> GitHub/GitLab/Gitea issue commands (same pattern)
    └──independent──> Features 2, 4

Feature 4: Upstream Branch Tracking
    └──modifies──> createWorktree() in git.ts
    └──called-from──> workspace-ops.ts createWorkspace flow
    └──independent──> Features 1, 2, 3
```

### Dependency Notes

- **All four features are independent.** They do not share code paths or data structures. Phases can be parallelized or sequenced in any order.
- **Feature 3 can extend to other trackers** after Jira is implemented, but extending is optional for v0.8.0.
- **Feature 4 change is backward-safe.** Existing workspaces are unaffected. The fix changes only the branch-not-found-locally code path in `createWorktree()`. Any workspace that already has a local branch sees no difference.
- **Feature 2 may be a glab version issue.** Investigation is required before coding. If the fix is "update glab," the deliverable is a doctor version check, not a code change.

---

## MVP Definition for v0.8.0

### Must Ship

- [ ] Dashboard linked issues display fix — shows per-workspace issue only, no global fallback for `issue` field (Feature 1)
- [ ] Jira workspace auto-detection from CWD — `[workspace]` becomes optional when inside a task worktree (Feature 3)
- [ ] Upstream branch tracking in worktree creation — checks `origin/<branch>` and uses `--track` when found (Feature 4)
- [ ] GitLab branch escaping investigation — identify root cause (glab version or our code) and fix or document (Feature 2)

### Add After Validation (v0.8.x)

- [ ] Extend workspace auto-detection to GitHub/GitLab/Gitea issue commands — same pattern as Jira
- [ ] Doctor warning for existing worktrees missing upstream tracking
- [ ] Verbose output showing detected workspace name during auto-detection

### Future Consideration (v0.9.0+)

- [ ] Separate "Linked Issues" section in dashboard detail pane (visual improvement beyond the fix)
- [ ] Minimum glab version enforcement in doctor (if version gate found for branch escaping fix)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Fix dashboard linked issues display | HIGH — active bug, misleads users | LOW — logic change in one component | P1 |
| Jira workspace auto-detection | HIGH — ergonomic, reduces friction | LOW — path-matching + optional arg | P1 |
| Upstream branch tracking | HIGH — prevents "no tracking" push errors | LOW — add one ls-remote check | P1 |
| GitLab branch '/' investigation + fix | MEDIUM — niche (affects `/` branch names) | LOW (code) or ZERO (glab version) — investigate first | P1 |
| Extend auto-detection to GitHub/GitLab/Gitea | MEDIUM — consistency | LOW — same pattern repeated | P2 |
| Doctor upstream tracking warning | LOW — existing workspaces only | MEDIUM — doctor expansion | P3 |

---

## Sources

- glab MR !1183 (URL-encode branch names in `--web`): https://gitlab.com/gitlab-org/cli/-/merge_requests/1183
- glab issue #619 (MR create from pushed branch): https://github.com/profclems/glab/issues/619
- git worktree documentation (--track, --guess-remote, DWIM behavior): https://git-scm.com/docs/git-worktree
- git branch --set-upstream-to: https://git-scm.com/docs/git-branch
- git ls-remote --exit-code for remote branch detection: multiple sources; used already in `isBranchGoneOnRemote()` in `src/lib/git.ts`
- Codebase: `src/lib/integrations/jira.ts`, `src/lib/integrations/gitlab.ts`, `src/lib/integrations/issue-utils.ts`, `src/lib/integrations/forge-utils.ts`, `src/lib/git.ts`, `src/tui/dashboard/WorkspaceDetail.tsx`

---
*Feature research for: v0.8.0 Integration Polish & Workspace UX*
*Researched: 2026-03-24*
