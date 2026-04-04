---
phase: quick
plan: 260404-atz
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/workspace-ops.ts
  - src/commands/workspace.ts
  - tests/lib/workspace-ops.test.ts
autonomous: true
requirements: [QUICK-260404-ATZ]
must_haves:
  truths:
    - "Trunk repos are included in dirty checks for list command aggregation"
    - "Trunk repos report ahead/behind vs their tracking branch (origin/<currentBranch>) in status"
    - "Trunk repos show dirty mark and up/down counts in status display (no '---' suppression)"
    - "--fetch fetches all repos including trunk repos"
    - "List command aggregates trunk repo dirty/ahead/behind into totals"
  artifacts:
    - path: "src/lib/workspace-ops.ts"
      provides: "getWorkspaceListInfo and getWorkspaceStatus include trunk repos"
      contains: "isRepoDirty(repo.main_path)"
    - path: "src/commands/workspace.ts"
      provides: "Status display and fetch include trunk repos"
    - path: "tests/lib/workspace-ops.test.ts"
      provides: "Tests verifying trunk repos included in dirty and ahead/behind"
  key_links:
    - from: "getWorkspaceListInfo"
      to: "isRepoDirty / getCommitsAhead / getCommitsBehind"
      via: "trunk repos use main_path and origin/<currentBranch>"
      pattern: "getCurrentBranch.*main_path"
    - from: "getWorkspaceStatus"
      to: "isRepoDirty / getCurrentBranch / getCommitsAhead / getCommitsBehind"
      via: "trunk repos use main_path and origin/<currentBranch>"
      pattern: "getCurrentBranch.*main_path"
---

<objective>
Fix dirty/ahead-behind checks to include trunk repos in list and status commands.

Purpose: Currently both `getWorkspaceListInfo` and `getWorkspaceStatus` filter to worktree repos only, and the status command's `--fetch` and display logic also excludes trunk repos. Trunk repos should participate in dirty checks, ahead/behind computation, fetching, and display — using `main_path` and `origin/<currentBranch>` as the comparison reference.

Output: Updated `workspace-ops.ts` functions, updated `workspace.ts` command handlers, updated tests.
</objective>

<execution_context>
@/home/nnex/.claude/get-shit-done/workflows/execute-plan.md
@/home/nnex/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260404-atz-fix-dirty-ahead-behind-checks-to-include/260404-atz-CONTEXT.md

<interfaces>
<!-- Key functions the executor needs -->

From src/lib/git.ts:
```typescript
export async function isRepoDirty(repoPath: string): Promise<boolean>
export async function getCurrentBranch(repoPath: string): Promise<string>
export async function getCommitsAhead(repoPath: string, baseRef: string, headRef: string): Promise<number>
export async function getCommitsBehind(repoPath: string, baseRef: string, headRef: string): Promise<number>
export async function isFetchStale(repoPath: string): Promise<boolean>
export async function fetchOrigin(repoPath: string): Promise<{ ok: true } | { ok: false; error: string }>
```

From src/lib/workspace-ops.ts (types):
```typescript
export type WorkspaceListInfo = {
  name: string; branch: string; description: string; created: string;
  age: string; lastOpened: string; dirty: boolean | null; dirtyRepos: string[];
  worktreeCount: number; trunkCount: number; repoCount: number;
  ahead: number; behind: number; aheadBehindStale: boolean;
}

export type RepoStatus = {
  name: string; exists: boolean; dirty: boolean; branch: string;
  mode: "trunk" | "worktree"; ahead: number; behind: number;
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Update getWorkspaceListInfo and getWorkspaceStatus to include trunk repos</name>
  <files>src/lib/workspace-ops.ts, tests/lib/workspace-ops.test.ts</files>
  <behavior>
    - Test: trunk repo with uncommitted changes is included in dirtyRepos and dirty=true in getWorkspaceListInfo
    - Test: trunk repo ahead/behind computed against origin/<currentBranch> (not origin/<baseBranch>) in getWorkspaceListInfo — e.g. trunk repo with 1 local commit ahead reports ahead=1
    - Test: trunk repo ahead/behind aggregated into totals (sum ahead, max behind) alongside worktree repos
    - Test: getWorkspaceStatus returns dirty=true and branch=<currentBranch> for trunk repos (not dirty=false and branch="---")
    - Test: getWorkspaceStatus returns ahead/behind for trunk repos against origin/<currentBranch>
  </behavior>
  <action>
**In `getWorkspaceListInfo` (src/lib/workspace-ops.ts around line 94):**

1. Dirty check block (lines 102-107): Change from iterating `worktreeRepos` to iterating ALL `workspace.repos`. For path resolution, use `repo.mode === "worktree" ? repo.task_path : repo.main_path`. Filter to repos where the resolved path `existsSync`.

2. Ahead/behind block (lines 115-128): Change from iterating `worktreeRepos` to iterating ALL `workspace.repos`. For each repo:
   - Resolve path: `repo.mode === "worktree" ? repo.task_path : repo.main_path`
   - For worktree repos: keep existing logic using `origin/${baseBranch}` as baseRef
   - For trunk repos: call `getCurrentBranch(repoPath)` to get the current branch, then use `origin/${currentBranch}` as baseRef
   - All repos get `isFetchStale` check

**In `getWorkspaceStatus` (src/lib/workspace-ops.ts around line 309):**

1. Remove the `repo.mode === "worktree"` guard on dirty/branch checks (line 314). Instead, resolve path as `repo.mode === "worktree" ? repo.task_path : repo.main_path`, then check `exists && existsSync(resolvedPath)` to run `isRepoDirty(resolvedPath)` and `getCurrentBranch(resolvedPath)` for ALL modes.

2. Remove the `repo.mode === "worktree"` guard on ahead/behind (line 321). For worktree repos keep `origin/${baseBranch}`. For trunk repos use `origin/${currentBranch}` (from the getCurrentBranch call above).

3. Use the resolved path (not `repo.task_path`) for `existsSync` check on line 312.

**Update existing test** "trunk repos are excluded from ahead/behind" (tests/lib/workspace-ops.test.ts around line 2157) — rename to "trunk repos included in ahead/behind via tracking branch" and assert that trunk repos with local commits report non-zero ahead (push a commit to clone without pushing to remote, then check info.ahead > 0). Also add a dirty trunk test.

**Add new tests** in the same describe block for getWorkspaceStatus with trunk repos verifying dirty, branch, and ahead/behind are populated.
  </action>
  <verify>
    <automated>bun run test -- tests/lib/workspace-ops.test.ts</automated>
  </verify>
  <done>getWorkspaceListInfo includes trunk repos in dirty checks and ahead/behind aggregation using main_path and origin/currentBranch. getWorkspaceStatus returns real dirty/branch/ahead/behind for trunk repos. All existing tests still pass, new trunk-inclusion tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Update status command fetch handler and display to include trunk repos</name>
  <files>src/commands/workspace.ts</files>
  <action>
**Fetch handler (src/commands/workspace.ts around line 362):**

Remove the `.filter(r => r.mode === "worktree" && existsSync(r.task_path))` filter. Replace with:
```typescript
ws.repos.filter(r => existsSync(r.mode === "worktree" ? r.task_path : r.main_path))
```
This includes trunk repos in fetching. The dedup-by-main_path logic on lines 366-371 stays as-is (it already handles dedup correctly for trunk repos whose main_path is the clone).

**Status display (src/commands/workspace.ts around line 411):**

Remove the `if (repo.mode === "worktree")` guard that pushes ahead/behind only for worktree repos and shows "---" for trunk. Replace with unified logic for all modes:
```typescript
if (repo.ahead > 0) abParts.push(`\u2191${repo.ahead}`)
if (repo.behind > 0) abParts.push(`\u2193${repo.behind}`)
```
No else branch needed — if ahead and behind are both 0, abParts stays empty and no counts display, which is correct. Remove the `abParts.push("---")` trunk fallback entirely.
  </action>
  <verify>
    <automated>bun run typecheck</automated>
  </verify>
  <done>Status --fetch fetches all repos (trunk + worktree). Status display shows dirty mark and up/down counts for trunk repos without "---" suppression. Type-check passes.</done>
</task>

</tasks>

<verification>
1. `bun run typecheck` passes — no type errors
2. `bun run test -- tests/lib/workspace-ops.test.ts` passes — all workspace-ops tests including new trunk tests
3. Manual spot check: `bun run src/index.ts status --help` shows --fetch option (sanity)
</verification>

<success_criteria>
- Trunk repos participate in dirty checks, ahead/behind computation, fetching, and display
- Trunk ahead/behind compares HEAD vs origin/<currentBranch> (tracking branch semantics)
- Worktree repos unchanged — still compare against origin/<baseBranch>
- No "---" suppression for trunk repos in status display
- All tests pass including new trunk-inclusion tests
</success_criteria>

<output>
After completion, create `.planning/quick/260404-atz-fix-dirty-ahead-behind-checks-to-include/260404-atz-SUMMARY.md`
</output>
