# Phase 58: Ahead/Behind Tracking - Research

**Researched:** 2026-04-03
**Status:** Complete

## Research Question

What do we need to know to plan ahead/behind tracking for workspaces — new git primitives, type extensions, CLI/TUI integration points, staleness detection, and test strategy?

## Findings

### 1. Git Primitives (AB-01)

**Existing asset:** `getCommitsBehind(repoPath, base, head)` at `src/lib/git.ts:249` uses `git rev-list --count ${head}..${base}` — returns number of commits `base` has that `head` doesn't.

**New function needed:** `getCommitsAhead(repoPath, base, head)` — mirror using `${base}..${head}` (commits `head` has that `base` doesn't). Identical pattern, just swap the range direction.

**Both called with:** `base = "origin/${defaultBranch}"`, `head = "HEAD"` from the worktree task_path (or main_path for trunk).

**Key insight:** These primitives operate on local refs only. `origin/main` reflects the last `git fetch`, not live remote state. This is by design (D-01: no network calls during render).

### 2. Staleness Detection (AB-07)

**FETCH_HEAD mtime approach:** Check `FETCH_HEAD` file modification time against a 15-minute threshold.

**Worktree complication (D-02):** In a git worktree, `.git` is a file (not a directory) containing `gitdir: /path/to/main/.git/worktrees/<name>`. The actual FETCH_HEAD lives in the main repo's `.git/` directory, not the worktree's.

**Resolution:** Use `git -C ${repoPath} rev-parse --git-common-dir` which returns the shared `.git` directory path (works for both regular repos and worktrees). Then check `${gitCommonDir}/FETCH_HEAD` mtime.

**Edge cases:**
- FETCH_HEAD may not exist (repo never fetched) — treat as stale
- FETCH_HEAD mtime older than 15 minutes — treat as stale
- For trunk repos, use `main_path` directly (no worktree indirection needed)

**New utility needed:** `isFetchStale(repoPath: string, thresholdMs?: number): Promise<boolean>` in `git.ts`.

### 3. WorkspaceListInfo Extension (AB-02)

**Current type** at `src/lib/workspace-ops.ts:48`:
```ts
export type WorkspaceListInfo = {
  name, branch, description, created, age, lastOpened,
  dirty, dirtyRepos, worktreeCount, trunkCount, repoCount
}
```

**New fields:** `ahead: number`, `behind: number`, `aheadBehindStale: boolean`

**Aggregation (D-11):**
- `ahead` = sum of ahead counts across worktree repos (trunk repos skipped)
- `behind` = max of behind counts across worktree repos
- `aheadBehindStale` = true if ANY worktree repo has stale FETCH_HEAD

**Implementation in `getWorkspaceListInfo`:** After the existing dirty check loop, add a parallel ahead/behind computation loop for worktree repos. Each repo computes `getCommitsAhead` and `getCommitsBehind` against `origin/${workspace.default_branch ?? "main"}`.

**Default branch resolution:** The workspace YAML doesn't store a `default_branch` per repo. The registry entry has a `default_branch` field. Need to read registry to resolve each repo's default branch for the `origin/${default_branch}` base ref. Alternatively, use each repo's `default_branch` from the registry. The `Workspace.repos` entries have `repo` (registry name) — can look up the registry.

**Simpler alternative:** The workspace has repos with `main_path`. We can compute `origin/${defaultBranch}` where `defaultBranch` comes from the repo registry entry. However, to avoid registry reads in the hot path, we could store the default_branch on the WorkspaceRepo during creation. The existing `WorkspaceRepo` schema has no `default_branch` field. Two options:
1. Read registry at computation time (simple, small overhead)
2. The templates use `branch` field which is the workspace branch, not the default branch. The default branch is what we compare against.

**Resolution:** Read the registry once in `getWorkspaceListInfo` and look up each repo's default_branch. The registry is a single YAML file read — cheap.

### 4. getWorkspaceStatus Extension (AB-04)

**Current function** at `src/lib/workspace-ops.ts:224` returns `RepoStatus[]` with `{ name, exists, dirty, branch, mode }`.

**New fields needed in return type:** `ahead: number`, `behind: number`

**But note:** `RepoStatus` is defined in `src/tui/dashboard/types.ts` (TUI-specific) AND used by `getWorkspaceStatus` in workspace-ops. The workspace-ops function returns this type. Need to either:
1. Extend the TUI `RepoStatus` type (it's already the shared contract)
2. Create a separate return type for workspace-ops

Since `getWorkspaceStatus` already returns the TUI `RepoStatus` type, extending that type is the right move. Add `ahead: number` and `behind: number`.

### 5. CLI Display (AB-03, AB-04)

**`git-stacks list`** (line 263 in workspace.ts):
- Current format: `  ~ name  branch  N repos  age`
- New format per D-05: `  ~ name  branch  ↑N ↓N  N repos  age`
- Hide zero counts (D-09): only show non-zero `↑N` or `↓N`
- Stale indicator (D-04): dim/gray with `?` suffix (e.g., `↑3?`)
- JSON output (D-10): always include numeric `ahead` and `behind` fields

**`git-stacks status`** (line 310):
- Current format: `  icon  repoName  [branch]/[trunk]`
- New format per D-12: `  icon  repoName  [branch]  ↑N ↓N` for worktree repos
- Add `--fetch` flag (D-06): triggers `fetchOrigin` before computing

### 6. TUI WorkspaceRow (AB-05)

**Current layout** in `WorkspaceRow.tsx`:
- `prefix | StatusIndicator | name | branch | counts | messagePreview | age`

**New column (D-07):** Insert `↑N ↓N` between branch and counts columns.
- Color: green for `↑N`, yellow for `↓N` (D-08)
- Hide zeros (D-09): only show non-zero values
- Stale: dim color + `?` suffix

**Data source:** The `WorkspaceEntry.status` currently has `RepoStatus[]`. The ahead/behind data needs to come from either:
1. Extended `WorkspaceStatus` to include aggregate ahead/behind
2. A separate signal (like current `useStaleness`)

**Recommendation:** Add `ahead`, `behind`, `aheadBehindStale` to the `WorkspaceStatus` loaded state (compute during `fetchStatuses` in `useWorkspaces.ts`). This avoids the separate staleness hook for ahead/behind data and keeps the data flow simple.

### 7. TUI WorkspaceDetail (AB-06)

**Current `resolveBadge`** at `WorkspaceDetail.tsx:21` uses `StaleInfo` from `useStaleness` hook — shows "N behind" text.

**Replacement:** Since we're computing ahead/behind per-repo in `getWorkspaceStatus`, the data is already in `RepoStatus`. The `resolveBadge` function can be replaced with direct rendering from `repo.ahead` and `repo.behind`.

**useStaleness hook (D-01):** Replace entirely. The current hook does network fetches per-repo. The new system computes from local refs only (no fetches in the render path). The staleness concept changes from "fetch to check behind count" to "are local refs outdated?" (FETCH_HEAD mtime check).

### 8. useStaleness Replacement Strategy

**Current behavior:** `useStaleness` fetches origin, then counts commits behind. It's used in `App.tsx` and `WorkspaceDetail.tsx`.

**New behavior:** Ahead/behind data is computed locally (no fetch) as part of `getWorkspaceStatus`. Staleness is an `aheadBehindStale` boolean computed from FETCH_HEAD mtime. No separate hook needed.

**Migration path:**
1. Extend `RepoStatus` with `ahead`, `behind` fields
2. Extend `WorkspaceStatus` loaded state with `aheadBehindStale`
3. Compute in `getWorkspaceStatus` and `useWorkspaces.ts`
4. Remove `useStaleness` hook entirely
5. Update `WorkspaceDetail` to use `repo.ahead`/`repo.behind` from status
6. Remove `StaleInfo` type and `resolveBadge` function

### 9. --fetch Flag on Status (D-03, D-06)

Add `--fetch` option to `git-stacks status` only (not `list`). When set:
1. Fetch origin for each worktree repo before computing ahead/behind
2. Use `mapLimited` for bounded concurrency (3 concurrent fetches)

### 10. Test Strategy

**git.ts tests:** Add `getCommitsAhead` and `isFetchStale` tests in `tests/lib/git.test.ts`. Use `makeGitRepo` helper + manual commits to create diverged branches.

**workspace-ops tests:** Add ahead/behind to `getWorkspaceListInfo` tests in `tests/lib/workspace-ops.test.ts`. Need a fixture with commits ahead of origin — this requires a bare remote repo setup (push, then make local commits).

**No TUI tests needed** — TUI ahead/behind is presentation-only from the same data.

### 11. Registry Access Pattern

The repo registry (`~/.config/git-stacks/registry.yml`) contains `default_branch` per repo. Currently imported from config.ts. The `getWorkspaceListInfo` function doesn't read the registry today. Need to add a registry read for default_branch lookup.

**Function:** Use `readRegistry()` from config.ts (returns the parsed registry). Look up each repo by name to get `default_branch`. Fall back to `"main"` if not found.

### 12. Workspace Config Schema

**No schema changes needed.** The ahead/behind data is computed at runtime, not stored in workspace YAML. The `WorkspaceListInfo` and `RepoStatus` types are runtime-only.

## RESEARCH COMPLETE

All technical questions resolved. Ready for planning.

---

*Phase: 58-ahead-behind-tracking*
*Researched: 2026-04-03*
