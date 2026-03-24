# Stack Research

**Domain:** Bun CLI tool — v0.8.0 Integration Polish & Workspace UX
**Researched:** 2026-03-24
**Confidence:** HIGH (all git CLI flags verified against official docs; glab behavior traced to confirmed upstream behavior; implementation patterns derived from reading installed source)

---

## Scope

This document covers **only what is needed for v0.8.0**. The existing stack (Bun, TypeScript, Commander.js, SolidJS + OpenTUI, Zod + YAML, `@clack/prompts`) is unchanged and not re-researched.

Four questions answered:

1. Why does the dashboard show global Jira config instead of per-workspace issues, and how is it fixed?
2. Does glab handle branch names with '/' correctly, or does our code need to work around it?
3. How can the Jira integration detect the current workspace from the working directory path?
4. What git CLI flags set up upstream tracking when a remote branch already exists?

---

## Finding 1: Dashboard Linked Issues Bug — Read Source, Not Read Config

**Root cause identified by reading `WorkspaceDetail.tsx` lines 127–138.**

The "config summary" block that shows integration settings for enabled integrations reads:

```typescript
const rawConfig = (ws().settings?.integrations?.[integration.id]
  ?? globalConfig.integrations[integration.id]  // <-- fallback to global
  ?? {}) as Record<string, unknown>
```

This is correct for rendering integration settings (e.g., `open_cmd`). However, this same code path renders `issue: PROJ-123` — the per-workspace issue ID stored in `ws().settings.integrations.jira.issue` — as if it were a config summary entry.

**The rendering issue is separate from the data source bug.** The data is stored correctly per-workspace (confirmed in `issue-utils.ts`: `linkIssue` writes to `workspace.settings.integrations[trackerId].issue`). The display problem is that the config summary block shows "issue: PROJ-123" alongside integration settings like "open_cmd: ..." using the same rendering path, and the `??` fallback to `globalConfig` means that when a workspace has no issue linked, it falls through to any global Jira config that happens to contain an `issue` key.

**Fix:** Add a dedicated "Linked issues" section in `WorkspaceDetail.tsx` that reads issue IDs from `ws().settings?.integrations?.[id]?.issue` directly. Do not render `issue` keys through the config summary path. The config summary filter should explicitly exclude the `issue` key.

**No new dependencies.** The data is already in the workspace YAML — it just needs a separate display section.

**Confidence:** HIGH (traced through installed source; data model confirmed in `issue-utils.ts` + `config.ts`).

---

## Finding 2: glab Branch Names with '/' — glab Handles It; Investigate Before Patching

**Research finding:** The `glab mr view --web` command, when given no arguments, runs in the git repo directory and resolves the MR by the current branch name by querying the GitLab API. The branch name is **not passed as a URL path component by our code** — we call `_exec.run(["mr", "view", "--web"], repoPath)` and glab does the branch detection internally.

The MR `!1183` in `gitlab-org/cli` confirmed that glab did add `url.PathEscape` for branch names in web URLs. This was released before 2024.

**What we actually call:**
```typescript
// From gitlab.ts — no branch name passed at all
const result = await _exec.run(["mr", "view", "--web"], repoPath)
```

Our code does not pass the branch name to glab. Glab detects the current branch from the git repo CWD and queries the GitLab API. The slash issue would be **inside glab**, not in our code.

**The likely cause of the user-reported issue:** `glab mr view` (without `--web`) prints MR info, but with `--web` it opens the MR URL in a browser. If glab constructs a URL like `https://gitlab.com/org/repo/-/merge_requests?source_branch=feature%2Fname`, some browsers or OS `xdg-open` handlers may double-encode the `%2F` to `%252F`. This is a known pattern (confirmed by lazygit issue #4321 analysis above).

**Fix strategy:** Investigate first by testing `glab mr view --web` on a branch with a slash. If it fails, the fix is on glab's side (file a bug). If glab works but our integration wrapper doesn't invoke it correctly, the fix is in `gitlab.ts`. No code change is warranted until the investigation confirms the failure is ours.

**Confidence:** MEDIUM — glab's internal branch resolution is confirmed. The double-encoding pattern is confirmed from lazygit. Whether glab itself suffers from this in the current version requires live testing.

---

## Finding 3: Jira Workspace Auto-Detection from CWD — Path-Based Detection via WORKSPACES_DIR

**How worktree paths are structured (from `paths.ts` + `config.ts`):**

```
{workspace_root}/tasks/{workspace_name}/{repo_name}/
```

Default `workspace_root` is `~/workspaces`, so a typical worktree path is:

```
~/workspaces/tasks/my-feature/api/
```

A user running `jira issue open` (no workspace arg) inside `~/workspaces/tasks/my-feature/api/` can be identified by checking whether their CWD starts with `{tasksDir}/`. The workspace name is the first path component after `{tasksDir}/`.

**Detection algorithm:**

```typescript
import { readGlobalConfig } from "../config"
import { getTasksDir } from "../paths"

export function detectWorkspaceFromCwd(): string | null {
  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)
  const cwd = process.cwd()
  if (!cwd.startsWith(tasksDir + "/")) return null
  const relative = cwd.slice(tasksDir.length + 1)
  const wsName = relative.split("/")[0]
  return wsName || null
}
```

This is pure path arithmetic — no filesystem reads beyond `readGlobalConfig()` (which is already called in the existing Jira `open` action).

**Workspace arg change:** The `<workspace>` positional arg in `issue link`, `issue unlink`, `issue open` commands should become `[workspace]` (optional). When omitted, call `detectWorkspaceFromCwd()`. If no workspace is detected and no arg provided, emit a clear error: "Not inside a workspace directory. Specify a workspace name."

This same pattern should apply to `github.ts` and `gitlab.ts` `issue` subcommands for consistency — the Jira change is the immediate ask but the pattern is reusable.

**No new dependencies.** Uses `process.cwd()` (built-in Node/Bun) + existing path utilities.

**Confidence:** HIGH (derived directly from `paths.ts` path layout; `getTasksDir` confirmed in source; `process.cwd()` is standard).

---

## Finding 4: Upstream Branch Tracking During Worktree Creation

**Current behavior in `git.ts` `createWorktree()`:**

```typescript
if (exists) {
  // branch exists locally — check it out into the worktree
  await $`git -C ${repoPath} worktree add ${worktreePath} ${branch}`.quiet()
} else {
  // branch does not exist locally — create new branch from HEAD
  await $`git -C ${repoPath} worktree add -b ${branch} ${worktreePath}`.quiet()
}
```

**The gap:** `checkBranchExists()` checks local refs (`git rev-parse --verify <branch>`). It does not check `origin/<branch>`. When a branch exists on the remote but not locally (e.g., a collaborator pushed it, or the user pushed from another machine), the current code creates a **new disconnected local branch** instead of tracking the remote.

**The fix — two git operations:**

**Step 1:** After the existing `checkBranchExists` local check fails, run a remote check:
```bash
git -C {repoPath} ls-remote --exit-code --heads origin {branch}
```
Exit code 0 = branch exists on remote. Exit code 2 = branch does not exist on remote.

This command is already used in `isBranchGoneOnRemote()` in `git.ts`. The new function uses the same pattern.

**Step 2:** If remote branch exists, fetch and set up tracking:
```bash
git -C {repoPath} fetch origin {branch}:{branch}
git -C {repoPath} worktree add {worktreePath} {branch}
git -C {repoPath} branch --set-upstream-to=origin/{branch} {branch}
```

Or more concisely using `--track`:
```bash
git -C {repoPath} fetch origin {branch}
git -C {repoPath} worktree add --track -b {branch} {worktreePath} origin/{branch}
```

The `--track` flag on `git worktree add` marks the remote-tracking branch as upstream. Verified in official git docs: "When creating a new branch, if `<commit-ish>` is a branch, `--track` marks it as upstream from the new branch. This is the default if `<commit-ish>` is a remote-tracking branch."

**Recommended implementation in `git.ts`:**

```typescript
export async function checkRemoteBranchExists(repoPath: string, branch: string): Promise<boolean> {
  const result = await $`git -C ${repoPath} ls-remote --exit-code --heads origin ${branch}`
    .quiet().nothrow()
  return result.exitCode === 0
}

export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string
): Promise<void> {
  const localExists = await checkBranchExists(repoPath, branch)
  if (localExists) {
    await $`git -C ${repoPath} worktree add ${worktreePath} ${branch}`.quiet()
  } else {
    const remoteExists = await checkRemoteBranchExists(repoPath, branch)
    if (remoteExists) {
      // Fetch the remote branch and create local tracking worktree
      await $`git -C ${repoPath} fetch origin ${branch}`.quiet()
      await $`git -C ${repoPath} worktree add --track -b ${branch} ${worktreePath} origin/${branch}`.quiet()
    } else {
      // New branch — create from current HEAD (existing behavior)
      await $`git -C ${repoPath} worktree add -b ${branch} ${worktreePath}`.quiet()
    }
  }
}
```

**`git ls-remote --exit-code --heads origin {branch}`** returns exit code 2 (not 1) when the pattern is not found. This is the same command already used in `isBranchGoneOnRemote()` — consistent with existing codebase patterns.

**`git fetch origin {branch}` (without a local ref spec)** fetches the remote branch into `FETCH_HEAD` and updates `origin/{branch}` in the remote-tracking refs. The subsequent `worktree add --track` correctly links the local branch to `origin/{branch}`.

**No new dependencies.** Uses standard git CLI via existing `Bun.$` pattern.

**Confidence:** HIGH (git docs + existing codebase pattern for `ls-remote --exit-code`; `--track` flag verified in official git-worktree docs).

---

## Recommended Stack Additions

### No New npm Dependencies Required

All 4 features are pure logic fixes / new git CLI invocations:

| Feature | What's Needed | Why No Library |
|---------|--------------|---------------|
| Dashboard issues display | Read `ws().settings.integrations[id].issue` in JSX | Data already in workspace YAML |
| glab branch slash | Investigation first; likely a glab-side behavior | If it's ours: URL-encode via built-in `encodeURIComponent` |
| Jira CWD detection | `process.cwd()` + path split | Built-in; no library adds value |
| Upstream tracking | `git ls-remote` + `git fetch` + `--track` flag | Existing Bun `$` shell pattern |

### New Functions

| Function | File | Purpose |
|----------|------|---------|
| `checkRemoteBranchExists(repoPath, branch)` | `src/lib/git.ts` | Check `origin/<branch>` via `ls-remote --exit-code` |
| `detectWorkspaceFromCwd()` | `src/lib/workspace-ops.ts` or new `src/lib/workspace-detect.ts` | Derive workspace name from `process.cwd()` vs `tasksDir` |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/git.ts` | Add `checkRemoteBranchExists()`; update `createWorktree()` to check remote and use `--track` |
| `src/tui/dashboard/WorkspaceDetail.tsx` | Add "Linked Issues" section; exclude `issue` key from config summary |
| `src/lib/integrations/jira.ts` | Make `<workspace>` optional; call `detectWorkspaceFromCwd()` when omitted |
| `src/lib/integrations/gitlab.ts` | (Phase 2 optional) Apply same CWD detection for issue subcommands |
| `src/lib/integrations/github.ts` | (Phase 2 optional) Apply same CWD detection for issue subcommands |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| New npm dependency for path detection | `process.cwd()` + string operations on the known `tasks/{name}/` structure is 5 lines | Built-in `process.cwd()` + `paths.ts` |
| `git worktree.guessRemote` config | This git config is user-global and would affect all their git repos; we must not set it | Explicit `--track` flag per worktree creation |
| Fetching all branches (`git fetch origin`) during worktree create | Slow; fetches everything. We only need the one branch | `git fetch origin {branch}` (single-branch fetch) |
| URL-encoding branch names before passing to glab | We don't pass branch names to glab — glab detects them from CWD; encoding our own args would double-encode | Investigate glab behavior first; only fix if confirmed ours |
| Jira API client (e.g., `jira-client` npm package) | The open_cmd design is intentionally tool-agnostic; any specific client ties to one Jira variant | Keep the `sh -c "$open_cmd"` with `$ISSUE_ID` env pattern |

---

## Git CLI Flags Reference (v0.8.0 additions)

| Flag / Command | Behavior | Confidence |
|----------------|----------|------------|
| `git ls-remote --exit-code --heads origin <branch>` | Exit 0 if branch found on remote, exit 2 if not found | HIGH — same as `isBranchGoneOnRemote()` in `git.ts` |
| `git fetch origin <branch>` | Fetches single branch, updates `origin/<branch>` remote-tracking ref | HIGH — standard git; no side effects on other branches |
| `git worktree add --track -b <branch> <path> origin/<branch>` | Creates worktree at `<path>` with new branch `<branch>` tracking `origin/<branch>` | HIGH — verified in git-worktree official docs |
| `git branch --set-upstream-to=origin/<branch> <branch>` | Alternative to `--track`; sets upstream on existing local branch | HIGH — standard git; use `--track` during worktree add instead |

---

## Version Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| Bun | current (project runtime) | `Bun.$` shell, `.quiet().nothrow()` pattern; unchanged |
| git | 2.24+ (project requirement) | `git worktree add --track` available since git 2.5; `ls-remote --exit-code` since ancient — no version concern |
| glab | current user installation | `glab mr view --web` resolves branch from CWD; slash behavior requires live testing to confirm |
| SolidJS | 1.9.11 (project) | `createMemo`, `For`, `Show` — dashboard changes use existing primitives only |

---

## Sources

- `src/tui/dashboard/WorkspaceDetail.tsx` (installed source) — config summary fallback bug identified at lines 127–138, HIGH confidence
- `src/lib/integrations/issue-utils.ts` (installed source) — `linkIssue` confirmed writes to `workspace.settings.integrations[id].issue`, HIGH confidence
- `src/lib/git.ts` (installed source) — `isBranchGoneOnRemote` uses `ls-remote --exit-code`; same pattern reused, HIGH confidence
- `src/lib/paths.ts` (installed source) — `getTasksDir()` layout `{workspace_root}/tasks/` confirmed, HIGH confidence
- https://git-scm.com/docs/git-worktree — `--track` flag for `worktree add` verified, HIGH confidence
- https://gitlab.com/gitlab-org/cli/-/merge_requests/1183 — glab added `url.PathEscape` for branch names in web URLs (fix already shipped); slash issue is not a current glab regression, MEDIUM confidence
- https://github.com/jesseduffield/lazygit/issues/4321 — double-encoding pattern from `%2F` → `%252F` confirmed in browser URL handling, MEDIUM confidence
- WebSearch: `git ls-remote --exit-code` exit code 2 behavior, MEDIUM confidence (consistent with project source usage)

---

*Stack research for: git-stacks v0.8.0 — Integration Polish & Workspace UX*
*Researched: 2026-03-24*
