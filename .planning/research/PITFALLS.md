# Pitfalls Research

**Domain:** CLI workspace manager — integration polish and workspace UX improvements (v0.8.0)
**Researched:** 2026-03-24
**Confidence:** HIGH (codebase-grounded, direct file inspection) / MEDIUM (glab behavior, verified against glab issue tracker)

---

## Critical Pitfalls

### Pitfall 1: Dashboard Reads Integration Config From Global Config Instead of Workspace Settings

**What goes wrong:**
`WorkspaceDetail.tsx` constructs `configSummary` from `ws().settings?.integrations?.[integration.id]` with a fallback to `globalConfig.integrations[integration.id]`. The `??` short-circuits: if the workspace has NO per-integration settings key at all (the common case — most workspaces don't override integrations), it falls through entirely to `globalConfig.integrations["jira"]`. The global Jira config object contains `{ enabled: true, open_cmd: "jira open $ISSUE_ID" }` — not an `issue` field. But the "linked issue ID" is stored at `workspace.settings.integrations.jira.issue` — it lives in the workspace YAML, not in global config. Since the detail pane only renders `configSummary` from what it finds at `integrations["jira"]`, and the global config wins when the workspace has no override, the displayed config is the global Jira settings (not the linked issue ID).

The linked issue is stored at a completely different path (`ws().settings.integrations.jira.issue`) than the integration enabled/config data (`globalConfig.integrations.jira`). The current display code conflates "integration enabled/config state" with "linked tracker data." These are different concerns stored in different locations.

**Why it happens:**
The integration display block in `WorkspaceDetail.tsx` (lines 127-138) builds `configSummary` by reading the raw integration config object and filtering out the `enabled` key. This works correctly for integration config fields like `open_cmd`, but `issue` is not an integration config field — it is a per-workspace tracker link. The code does not distinguish between "integration config" (`globalConfig.integrations`) and "per-workspace integration data" (`workspace.settings.integrations`).

**How to avoid:**
Separate the two concerns in `WorkspaceDetail.tsx`:

1. For the `configSummary` block, read from `globalConfig.integrations[id]` only — this is configuration (how to run the tool).
2. Add a separate display section for tracker-linked data. For any integration that is a tracker (github, gitlab, gitea, jira), check `ws().settings?.integrations?.[id]?.issue` and display it as "Linked issue: PROJ-123" if present.

The guard should be: if `integrations[id]` object contains an `issue` key, display it as a linked issue. This key path is defined in `issue-utils.ts` — it writes to `integrations[trackerId].issue`.

**Warning signs:**
- Dashboard "Integrations" section shows `open_cmd` for Jira instead of the linked issue ID
- Source annotation says `[global]` for a workspace that has `settings.integrations.jira.issue` set
- `resolveIssueRef()` succeeds for the workspace from CLI, but dashboard shows different data

**Phase to address:**
Dashboard linked issues display fix — first phase, before the other three features.

---

### Pitfall 2: glab mr view --web Silently URL-Encodes Slash-Containing Branch Names

**What goes wrong:**
When a workspace branch is `feature/PROJ-123-my-feature`, the branch name is passed to `glab mr view --web` via `_exec.run(["mr", "view", "--web"], repoPath)` in `gitlab.ts`. The glab CLI uses the current git checkout's HEAD branch to resolve which MR to view. It does NOT receive the branch name as a CLI argument — but `glab mr create` uses `--target-branch baseBranch` and does not pass the source branch at all. The source branch is inferred by glab from the current worktree's HEAD.

The actual bug is in `glab repo view --web` (not `glab mr view --web`). When `glab repo view` opens the GitLab project URL in the browser, it constructs the URL as `https://gitlab.com/org/repo/-/tree/{branch}`. If branch is `feature/PROJ-123`, glab's URL builder may either:
- Leave the slash unencoded, which browsers handle correctly
- URL-encode it as `feature%2FPROJ-123`, which GitLab does NOT accept in its web URLs (GitLab's web router treats `%2F` in path segments as a 404)

A confirmed glab issue (MR !1183, 2023) addressed URL encoding of branch names with special characters for `glab repo view --web`. The fix uses `url.PathEscape` which encodes slashes as `%2F` — but GitLab's web router requires literal slashes in branch path segments. This creates a regression specifically for slash-containing branch names.

**Why it happens:**
GitLab web URLs use literal slashes in branch names as path separators (e.g., `/-/tree/feature/my-branch`). RFC 3986 would require encoding the slash in a path segment, but GitLab's web router expects the literal slash. Tools that apply path escaping at the segment level (Go's `url.PathEscape`) will break GitLab branch navigation for slash-containing names.

**How to avoid:**
Before fixing, determine root cause: is the issue in our code or in glab?

1. Test manually: `glab repo view --web` in a worktree checked out on a `feature/...` branch. If the browser opens a 404 URL with `%2F`, the bug is in glab. If the URL is correct, the issue is elsewhere.
2. If bug is in glab: our code does not pass branch names to glab for `repo view` or `mr view --web` — glab reads HEAD branch itself. We cannot fix glab behavior from our code. The mitigation is to document the known limitation and upgrade glab when a fix ships.
3. If bug is in our code: check if we are constructing any URL or branch string passed to glab. Our `gitlab.ts` `pr create` passes `--target-branch baseBranch` but not the source branch. The source branch name never goes through our code to glab for `mr view`.

The safe approach: investigate before fixing. Do not add URL encoding on our side — this will double-encode if glab also encodes.

**Warning signs:**
- Browser opens `https://gitlab.com/org/repo/-/tree/feature%2FPROJ-123` (404)
- `glab repo view --web` works for `main` but fails for `feature/...` branches
- Any attempt to encode branch names with `encodeURIComponent()` in our code before passing to glab

**Phase to address:**
GitLab branch slash investigation — diagnose root cause first; fix only if it is in our code.

---

### Pitfall 3: CWD-to-Workspace Matching Uses Path Prefix Without Normalizing Trailing Slashes and Symlinks

**What goes wrong:**
Jira workspace auto-detection requires matching the current working directory against workspace task paths to identify which workspace the user is inside. The workspace task path is stored in `WorkspaceRepo.task_path` as an absolute path like `~/workspaces/tasks/my-workspace/my-repo` (with `~` unexpanded). The result of `process.cwd()` is an OS-resolved path — no `~`, fully canonicalized.

Common failure modes:
1. `task_path` contains `~/workspaces/tasks/...` but `process.cwd()` starts with `/home/user/workspaces/tasks/...` — tilde not expanded, prefix check fails
2. `task_path` points to a path containing a symlink component; `process.cwd()` may resolve the symlink or not depending on the shell's `CDPATH`/`-P` flag behavior
3. Trailing slash mismatch: `task_path` is `/home/user/workspaces/tasks/ws/repo` but CWD is `/home/user/workspaces/tasks/ws/repo/src/components` — a prefix check that uses exact match fails for subdirectories

**Why it happens:**
Path comparison without normalization is a common source of subtle bugs. The workspace YAML stores paths as-written at creation time; git-stacks paths use `expandHome` from `src/lib/paths.ts` for expansion, but workspace YAML `task_path` may have been written pre-expansion. The `resolveRepoCwd()` function in `forge-utils.ts` uses `git rev-parse --show-toplevel` which gives the git root, but the Jira detection needs to match against `task_path` which includes the repo directory.

**How to avoid:**
Use `expandHome()` from `src/lib/paths.ts` on all stored paths before comparison. Use `process.cwd().startsWith(expandHome(repo.task_path))` for the check — CWD may be a subdirectory of `task_path`. Use `path.resolve()` on both sides to eliminate symlink and relative-path differences.

Recommended detection function:
```typescript
import { expandHome } from "../paths"
import { listWorkspaces } from "../config"
import { resolve } from "path"

export function detectWorkspaceFromCwd(): string | null {
  const cwd = resolve(process.cwd())
  for (const ws of listWorkspaces()) {
    for (const repo of ws.repos) {
      const taskPath = resolve(expandHome(repo.task_path))
      if (cwd === taskPath || cwd.startsWith(taskPath + "/")) {
        return ws.name
      }
    }
  }
  return null
}
```

The `+ "/"` prevents false positives where one path is a prefix of another (e.g., `/tasks/ws` matching `/tasks/ws-other`).

**Warning signs:**
- Auto-detection fails when run from inside a repo but works when workspace name is specified explicitly
- Path comparison using `===` or `includes()` instead of `startsWith()` with a separator
- `expandHome` not applied to `task_path` before comparison
- Tests written with fully-resolved paths only, not testing the `~/` form

**Phase to address:**
Jira workspace auto-detection — the path normalization logic must be correct before any command wiring.

---

### Pitfall 4: Making Workspace Argument Optional Breaks Commander.js Strict Argument Parsing

**What goes wrong:**
The Jira issue commands are currently defined as `issue link <workspace> <issue-id>` and `issue open <workspace>` with required positional arguments. Making the workspace optional (CWD detection fallback) requires changing these to `issue link [workspace] <issue-id>` and `issue open [workspace]`. Commander.js positional argument parsing is order-dependent: `[workspace] <issue-id>` means the first positional arg is optionally the workspace, and the second is always the issue-id. But if the user provides only one argument to `issue link`, Commander will assign it to `workspace`, leaving `issue-id` undefined — not to `issue-id` as the user intended.

This positional ambiguity is inherent to Commander.js when mixing optional and required positional arguments. The issue: `git-stacks integration jira issue link PROJ-123` — did the user mean workspace=PROJ-123 and issue-id=undefined? Or workspace=auto-detected and issue-id=PROJ-123?

**Why it happens:**
Commander.js resolves positional arguments left-to-right. An optional argument before a required one means the required argument shifts right only when the optional is supplied. If a user provides one argument to a command with `[workspace] <issue-id>`, Commander assigns it to `workspace` (the leftmost slot) — it cannot infer intent.

**How to avoid:**
Use a flag instead of positional disambiguation. For `issue link`, make workspace a flag: `issue link <issue-id> [--workspace <name>]`. This clearly signals intent: if `--workspace` is omitted, auto-detect from CWD. The `issue open` command similarly becomes `issue open [--workspace <name>]`.

Alternatively, if positional must be kept: detect at runtime whether the first argument looks like a workspace name (check `workspaceExists(arg)`) and if not, treat it as the issue-id with CWD-detected workspace. But this heuristic breaks when workspace names resemble issue IDs (e.g., workspace named `PROJ-123`).

**Warning signs:**
- `git-stacks integration jira issue link PROJ-123` silently assigns `PROJ-123` to the workspace argument
- Commander error "missing required argument 'issue-id'" when no workspace specified
- CWD detection logic that is never reached because Commander fails before the action fires

**Phase to address:**
Jira workspace auto-detection — CLI argument design must be decided before implementation. Prefer `--workspace` flag to avoid ambiguity.

---

### Pitfall 5: Upstream Branch Check Fetches Remote But Does Not Set Tracking — `git worktree add` Misses the Opportunity

**What goes wrong:**
The goal is: if the intended branch already exists on `origin`, set up tracking so `git status` shows `ahead/behind` and `git pull/push` works without explicit remote arguments. The current `createWorktree()` in `git.ts` (lines 9-21) checks if the branch exists locally via `git rev-parse --verify <branch>` — it does NOT check if the branch exists on the remote.

If an upstream branch exists (say `origin/feature/PROJ-123`) but the local branch does not yet exist, the correct git command is:
```
git worktree add -b feature/PROJ-123 <path> origin/feature/PROJ-123
```
This creates a new local branch tracking the remote. The current code does:
```
git worktree add -b feature/PROJ-123 <path>
```
which branches from the local HEAD with no tracking. The user sees a branch with 50 commits "ahead" of nothing because the tracking is not set.

**Why it happens:**
`checkBranchExists()` calls `git rev-parse --verify <branch>` — this checks local refs only. Remote refs are `origin/<branch>`, a different namespace. `git rev-parse --verify feature/PROJ-123` returns non-zero even when `origin/feature/PROJ-123` exists. The fix requires querying `origin/feature/PROJ-123` specifically.

**How to avoid:**
Add an `ls-remote` check (already present for `isBranchGoneOnRemote` in `git.ts`) before creating the worktree. The logic:

```typescript
export async function checkRemoteBranchExists(repoPath: string, branch: string): Promise<boolean> {
  const result = await $`git -C ${repoPath} ls-remote --exit-code --heads origin ${branch}`
    .quiet().nothrow()
  return result.exitCode === 0
}
```

Then in `createWorktree()`:

```typescript
const localExists = await checkBranchExists(repoPath, branch)
if (localExists) {
  await $`git -C ${repoPath} worktree add ${worktreePath} ${branch}`.quiet()
} else {
  const remoteExists = await checkRemoteBranchExists(repoPath, branch)
  if (remoteExists) {
    // Branch from remote ref to establish tracking
    await $`git -C ${repoPath} worktree add --track -b ${branch} ${worktreePath} origin/${branch}`.quiet()
  } else {
    // New branch — branch from current HEAD
    await $`git -C ${repoPath} worktree add -b ${branch} ${worktreePath}`.quiet()
  }
}
```

**Warning signs:**
- `git status` inside a worktree for a pre-existing remote branch shows no upstream tracking
- `git push` requires `--set-upstream origin <branch>` on every new workspace for an existing PR
- `checkBranchExists()` is the only check in `createWorktree()` — remote namespace not checked

**Phase to address:**
Upstream branch check — modify `git.ts` `createWorktree()` and add `checkRemoteBranchExists()` helper before workspace creation is wired.

---

### Pitfall 6: ls-remote Requires a Fetch — Adds Latency to Every Worktree Creation

**What goes wrong:**
`git ls-remote` queries the remote server directly. It is a network operation, not a local cache lookup. For every repo in a workspace being created (which may be 3-5 repos), an `ls-remote` call adds 0.5-3 seconds of latency each, totaling 2-15 seconds of network overhead before any local git operations.

This is different from `git fetch` in terms of performance: `ls-remote` is faster (no delta transfer) but still requires a round-trip per call.

**Why it happens:**
`ls-remote` contacts the remote directly. The existing `fetchOrigin()` function in `git.ts` already fetches the remote, which would update `refs/remotes/origin/*` in the local clone. After a fetch, `git rev-parse origin/feature/PROJ-123` works locally without another network call.

**How to avoid:**
Use `fetchOrigin()` first (already called during workspace creation in `workspace-ops.ts`), then check local remote-tracking refs with `git rev-parse origin/<branch>` instead of calling `ls-remote`. This reuses the already-fetched remote state:

```typescript
export async function checkRemoteTrackingBranchExists(repoPath: string, branch: string): Promise<boolean> {
  const result = await $`git -C ${repoPath} rev-parse --verify origin/${branch}`
    .quiet().nothrow()
  return result.exitCode === 0
}
```

If the workspace creation flow does NOT fetch before creating worktrees, add a `fetchOrigin()` call before the loop over repos in `workspace-ops.ts`, and then use local remote-tracking ref checks.

**Warning signs:**
- Multiple `ls-remote` calls in sequence for a multi-repo workspace creation
- No `fetchOrigin()` call before the upstream branch check
- Workspace creation time increases by 2-10 seconds for remote repositories

**Phase to address:**
Upstream branch check — resolve fetch-vs-ls-remote strategy before implementing `createWorktree()` changes.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Check `workspaceExists(arg)` heuristic for jira CLI argument disambiguation | No CLI API change needed | Breaks when workspace names look like issue IDs (e.g., `PROJ-123`) | Never — use `--workspace` flag instead |
| Use `ls-remote` for upstream check instead of local remote-tracking refs | No dependency on prior fetch | Network call per repo; 2-15s added latency on workspace creation | Only acceptable if workspace creation has no prior fetch; document clearly |
| Skip upstream tracking setup and just check existence | Simpler implementation | User still has to set up tracking manually; defeats the purpose | Never — the goal is automatic tracking setup |
| Display issue ID in Jira config summary without a dedicated "Linked issue" section | No new UI code | Dashboard conflates integration config display with tracker data | Never — these are different data types and must be clearly separated |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Jira in WorkspaceDetail.tsx | Read issue ID from `globalConfig.integrations.jira` | Read issue ID from `ws().settings.integrations.jira.issue` — these are different storage locations |
| Jira CLI | Keep `<workspace>` as required positional arg | Make workspace optional via `--workspace` flag; fall back to CWD detection |
| GitLab glab | Encode branch slashes with `encodeURIComponent()` before passing to glab | Do NOT encode — glab reads HEAD branch itself; encoding doubles the problem |
| GitLab glab | Assume `glab repo view --web` handles all special chars | Verify independently with `feature/...` branches; glab has known issues with path-escaped slashes on GitLab web URLs |
| git worktree creation | Check only local branch existence before creating worktree | Check remote-tracking refs too; set up tracking with `--track` when remote branch pre-exists |
| CWD-to-workspace matching | Compare `process.cwd()` to `task_path` with `===` | Use `resolve()` + `expandHome()` on both sides; use `startsWith(taskPath + "/")` not `===` |
| `listWorkspaces()` in CWD detection | Call `listWorkspaces()` on every keystroke or integration call | Call once per command invocation; `listWorkspaces()` reads all YAML from disk |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `ls-remote` per repo in workspace creation | Multi-repo workspace creation takes 10-15s instead of 1-2s | Fetch once with `fetchOrigin()`, then check local `origin/<branch>` refs | Immediately, on first multi-repo workspace with network latency |
| `listWorkspaces()` in CWD detection called per Jira subcommand | Disk reads every command invocation | Acceptable — it is called once per CLI invocation, not in a loop | Not a problem until user has 100+ workspaces |
| `readGlobalConfig()` called inside SolidJS render function | Re-reads global config file on every reactive update cycle in WorkspaceDetail | Call once outside the reactive scope (already done at line 26 in WorkspaceDetail.tsx) | On dashboard with frequent tick updates |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Jira detection fails silently when CWD is not inside a workspace | User gets "workspace required" error with no hint that auto-detection is possible | Check CWD first; if detection fails, show "Run from inside a workspace or use --workspace <name>" |
| Upstream tracking set up for a branch that diverged significantly from remote | Confusing "5 ahead, 200 behind" status | Show a warning if tracking branch differs by more than N commits; let user decide |
| Dashboard "Integrations" section shows nothing about linked issues | User cannot see issue links without using CLI | Add a dedicated "Linked issues" row in WorkspaceDetail for each tracker with a linked issue |
| "Not sure if this is our bug or glab's bug" message in release notes | User confusion about GitLab slash branch behavior | Test and document the finding explicitly; either "fixed" or "known glab limitation, upgrade glab to vX.Y.Z" |

---

## "Looks Done But Isn't" Checklist

- [ ] **Dashboard issue display:** Linked issue shows in detail pane — verify the display reads from `ws().settings.integrations.jira.issue`, NOT from `globalConfig.integrations.jira`
- [ ] **Dashboard source annotation:** Linked issue row shows `[workspace]` source annotation, not `[global]`
- [ ] **GitLab slash branch:** `glab repo view --web` opens a valid URL for `feature/PROJ-123` branches — verify in a real GitLab repo before marking as fixed
- [ ] **Jira CWD detection:** Auto-detection works when CWD is a subdirectory inside the repo (e.g., `~/workspaces/tasks/ws/repo/src/`) not just the root of `task_path`
- [ ] **Jira CWD detection with tilde:** Detection works when `task_path` in YAML was stored with `~/` prefix — verify `expandHome()` is applied
- [ ] **Worktree tracking setup:** After `git-stacks new` for a workspace whose branch exists on remote, `git status` inside the worktree shows `Your branch is up to date with 'origin/...'`
- [ ] **Worktree tracking setup does not break new branches:** Creating a workspace for a brand-new branch (no remote counterpart) still works without errors
- [ ] **Jira CLI argument change is backward compatible:** Existing `git-stacks integration jira issue link my-workspace PROJ-123` still works after making workspace optional

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Dashboard shows wrong issue data after display fix | LOW | Reload dashboard (`q` then `git-stacks manage`); check workspace YAML `settings.integrations.jira.issue` is populated |
| CWD detection matches wrong workspace (path prefix collision) | LOW | Add `+ "/"` separator to `startsWith()` check; the collision is prevented by the separator |
| Tracking setup causes `worktree add` to fail for diverged branches | MEDIUM | Wrap `--track` worktree add in try/catch; fall back to no-tracking creation with a warning message; let user run `git branch -u` manually |
| glab slash encoding is in glab (not our code) | LOW | Document in release notes; no code change required; pin glab version recommendation |
| Commander.js argument ambiguity causes wrong workspace inference | MEDIUM | Rename to `--workspace` flag; update shell completion entries in `src/lib/completion-generator.ts` to match |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Dashboard reads global config instead of workspace issue data | Dashboard linked issues fix | Unit test: create workspace with linked jira issue; verify `WorkspaceDetail` renders issue ID, source is `[workspace]` |
| glab slash branch encoding | GitLab slash investigation | Manual test: `glab repo view --web` on `feature/...` branch; automated: test passes correct args to `_exec.run` (no branch encoding in our code) |
| CWD path normalization for workspace detection | Jira CWD auto-detection | Unit test: CWD = `expandHome(task_path) + "/src/deep/path"` → workspace detected; CWD = sibling path → null returned |
| Commander.js positional arg ambiguity | Jira CWD auto-detection | Manual test: `jira issue link PROJ-123` (no workspace arg) triggers CWD detection, not a Commander parse error |
| `createWorktree()` misses remote tracking setup | Upstream branch check | Unit test: branch exists on remote but not locally → worktree created with tracking; `git branch -vv` shows upstream ref |
| ls-remote latency on workspace creation | Upstream branch check | Use `checkRemoteTrackingBranchExists()` via local refs after fetch, not `ls-remote`; verify with workspace creation timing test |

---

## Sources

- `src/tui/dashboard/WorkspaceDetail.tsx` lines 127-138 — configSummary construction bug (direct codebase read)
- `src/lib/integrations/issue-utils.ts` lines 39-53 — linkIssue writes to `settings.integrations[trackerId].issue` (direct codebase read)
- `src/lib/integrations/jira.ts` — current command structure with required `<workspace>` args (direct codebase read)
- `src/lib/git.ts` lines 4-21 — `checkBranchExists()` checks local refs only; `createWorktree()` current implementation (direct codebase read)
- `src/lib/integrations/forge-utils.ts` lines 138-143 — `resolveRepoCwd()` pattern for CWD detection (direct codebase read)
- `src/lib/paths.ts` (referenced via imports) — `expandHome` helper available for tilde expansion
- glab MR !1183 — URL encoding fix for branch names in `glab repo view --web`: https://gitlab.com/gitlab-org/cli/-/merge_requests/1183
- glab issue: slash in branch name causes `mr checkout` 404: https://gitlab.com/gitlab-org/cli/-/work_items/8020
- lazygit issue: "Opening MR on GitLab with slash in branchname": https://github.com/jesseduffield/lazygit/issues/4321
- git-scm docs: `git worktree add --track`: https://git-scm.com/docs/git-worktree
- git-scm: checking remote branch existence via `ls-remote --exit-code --heads`: https://git-scm.com/docs/git-ls-remote

---
*Pitfalls research for: v0.8.0 — integration polish and workspace UX improvements in git-stacks*
*Researched: 2026-03-24*
