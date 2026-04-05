# Phase 66: Git Operation Guards - Research

**Researched:** 2026-04-04
**Domain:** workspace-ops.ts dir-mode filtering for git commands (push, pull, sync, merge, ahead/behind, dirty)
**Confidence:** HIGH

## Summary

Phase 65 (workspace lifecycle) has already been coded but not committed. Reading the working tree reveals that most of the six GIT-0x requirements are already guarded. The only gap is in `pullWorkspace`'s Phase 1 fetch-dedup loop: dir repos are included in `fetchGroups` and trigger a `fetchOrigin(mainPath)` call on a plain directory, which fails. The catch block registers them in `fetchFailures`, but because the Phase 2 pull loop guards `repo.mode === "dir"` before consulting `fetchFailures`, the end-user result is correct (the repo is skipped, not failed). However the wasted `fetchOrigin` call and the spurious "fetching" progress event are noise — and CONTEXT.md decision D-04 explicitly requires the fetch dedup loop to be filtered too.

The other five requirements (GIT-01 push, GIT-03 sync, GIT-04 merge, GIT-05 ahead/behind, GIT-06 dirty) are already correctly guarded by Phase 65 changes in the working tree. Phase 66 work is therefore primarily: (a) add the dir filter to `pullWorkspace`'s fetch dedup loop, and (b) write tests for the six GIT-0x requirements, since no tests covering git-operation guards for dir repos exist in the current test suite.

**Primary recommendation:** Add a one-line dir filter in `pullWorkspace`'s fetch dedup loop, then write six targeted tests in the existing `describe("dir repo lifecycle")` block. Reuse `setupMixedDirFixture` and `setupDirOnlyFixture` from Phase 65.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Guards for dir repos are placed in workspace-ops.ts (orchestration layer), not in git.ts (git primitives). git.ts functions remain pure path-based wrappers with no concept of repo modes.
- **D-02:** `pullWorkspace` is the primary function requiring new dir-mode guards. `pushWorkspace`, `syncWorkspace`, and `mergeWorkspace` already exclude dir repos through existing worktree-only or trunk+worktree filters.
- **D-03:** Verify all six requirement targets (push, pull, sync, merge, ahead/behind, dirty) are covered — most are already guarded, but each must be explicitly confirmed.
- **D-04:** Filter dir repos out at the top of `pullWorkspace` before both the fetch dedup loop and the sequential pull loop. Report dir repos as skipped, matching the existing trunk-skip pattern in `pushWorkspace`.
- **D-05:** Mock-based tests in `tests/lib/workspace-ops.test.ts` with mixed-mode workspaces (worktree + dir), verifying dir repos appear in skipped results while worktree repos are processed normally. Follow the existing `pushWorkspace` trunk-skip test pattern.

### Claude's Discretion

- Exact skip reason string for dir repos (e.g., `"dir"` vs `"dir repo"`)
- Whether to add explicit skip emissions in push/sync/merge (currently silent omission) or leave the existing implicit exclusion pattern
- Any minor refactoring needed to make the filter patterns consistent across all six operations

### Deferred Ideas (OUT OF SCOPE)

None — analysis stayed within phase scope. TUI dashboard display of dir repos during push/pull operations is Phase 67 (Display & Health).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GIT-01 | `git-stacks push` skips dir repos entirely | `pushWorkspace` already filters to worktree+trunk repos via `workspace.repos.filter(r => r.mode === "worktree")` at L1197 — dir repos are implicitly excluded. Need test to verify. |
| GIT-02 | `git-stacks pull` skips dir repos entirely | Phase 2 pull loop has dir guard (L1549-1553 working tree). Phase 1 fetch loop does NOT filter dir repos yet — fix needed. |
| GIT-03 | `git-stacks sync` skips dir repos entirely | `syncWorkspace` already filters to `r.mode === "worktree"` at L1284 — dir repos implicitly excluded. Need test to verify. |
| GIT-04 | `git-stacks merge` skips dir repos (no branch to merge) | `mergeWorkspace` already filters to `worktreeRepos` at L691 — dir repos implicitly excluded. Need test to verify. |
| GIT-05 | Ahead/behind tracking skips dir repos | `getWorkspaceListInfo` filters `repo.mode !== "dir"` at both ahead/behind and dirty loops (L106, 124 working tree). Need test to verify. |
| GIT-06 | Dirty file detection skips dir repos | `getDirtyWorktrees` only checks `r.mode === "worktree"`. `getWorkspaceListInfo` filters `repo.mode !== "dir"`. Both safe. Need test to verify. |
</phase_requirements>

## Standard Stack

This phase touches only existing code — no new libraries required.

| File | Current State | Phase 66 Change |
|------|--------------|-----------------|
| `src/lib/workspace-ops.ts` | Modified by Phase 65 (not committed) | One fetch-loop filter addition |
| `tests/lib/workspace-ops.test.ts` | Modified by Phase 65 (not committed) | Six new tests in `describe("dir repo lifecycle")` |

**No npm install required.**

## Architecture Patterns

### Current Guard Pattern (verified by codebase read)

Six functions need dir-mode awareness. Current state after Phase 65 changes in working tree:

| Function | Guard Type | Status | Line |
|----------|-----------|--------|------|
| `pushWorkspace` | Implicit — filters to `mode === "worktree"` only | ALREADY GUARDED | L1197 |
| `pullWorkspace` Phase 1 (fetch) | No filter — dir repos enter fetchGroups | NEEDS FIX | L1517-1521 |
| `pullWorkspace` Phase 2 (pull) | Explicit — `if (repo.mode === "dir") skip` | ALREADY GUARDED | L1549 |
| `syncWorkspace` | Implicit — filters to `mode === "worktree"` | ALREADY GUARDED | L1284 |
| `mergeWorkspace` | Implicit — `worktreeRepos` filter | ALREADY GUARDED | L691 |
| `getWorkspaceListInfo` (ahead/behind) | Explicit — `.filter(repo => repo.mode !== "dir")` | ALREADY GUARDED | L122 |
| `getWorkspaceListInfo` (dirty) | Explicit — `.filter(repo => repo.mode !== "dir")` | ALREADY GUARDED | L106 |
| `getDirtyWorktrees` | Implicit — `.filter(r => r.mode === "worktree")` | ALREADY GUARDED | L320 |
| `getWorkspaceStatus` | Explicit — early return for `mode === "dir"` | ALREADY GUARDED | L332 |

[VERIFIED: codebase read of working tree src/lib/workspace-ops.ts]

### Fix Required: `pullWorkspace` Fetch Dedup Loop

The fetch dedup loop iterates ALL repos and calls `fetchOrigin(mainPath)` for each unique `main_path`. Dir repos are plain directories with no `.git`, so `fetchOrigin` will fail. The catch block sets `fetchFailures.set(r.name, detail)` for each repo in the group. In Phase 2, `if (repo.mode === "dir")` runs BEFORE `if (fetchFailures.has(repo.name))`, so the user-visible result is still correct (skipped, not failed). BUT:
1. An unnecessary `fetchOrigin` call is made against a non-git directory
2. A spurious `{ repo: r.name, status: "fetching" }` progress event fires for dir repos
3. D-04 explicitly requires filtering before BOTH loops

**Fix:** Add `.filter(r => r.mode !== "dir")` to the `repos` iteration before building `fetchGroups`, per D-04:

```typescript
// VERIFIED pattern from CONTEXT.md D-04
// Before:
const fetchGroups = new Map<string, typeof repos>()
for (const repo of repos) {

// After (add one filter before Phase 1):
const gitRepos = repos.filter(r => r.mode !== "dir")
const fetchGroups = new Map<string, typeof gitRepos>()
for (const repo of gitRepos) {
```

[VERIFIED: working tree read — src/lib/workspace-ops.ts L1516-1521]

### Implicit vs Explicit Skip — Claude's Discretion Call

For `pushWorkspace`, `syncWorkspace`, and `mergeWorkspace`, dir repos are excluded implicitly — they are never included in the `worktreeRepos` filter. This means:
- No `skipped` entry is produced for dir repos in push/sync/merge results
- No progress event fires for dir repos in push/sync/merge

The context marks this choice as Claude's discretion. The implicit pattern is consistent with how trunk repos behave in `syncWorkspace` (also silently excluded, no skip entry). The `pushWorkspace` function does explicitly skip trunk repos with a `{ status: "skipped", detail: "trunk" }` entry — but sync and merge do not.

**Recommendation:** Keep implicit exclusion for push/sync/merge (matching existing trunk-exclusion behavior in sync/merge). The `pullWorkspace` skip is explicit (and required by D-04) because the fetch dedup loop touches the raw `repos` array and needs the guard to prevent false `fetchFailures`. For push/sync/merge, the worktree filter happens before any loop body, so no guard is needed.

### Test Pattern to Follow

The Phase 65 `describe("dir repo lifecycle")` block in `tests/lib/workspace-ops.test.ts` provides:
- `setupMixedDirFixture(wsName)` — creates one worktree repo + one plain dir, returns `{ wsRoot, tasksDir, gitRepoPath, worktreePath, dirPath, branch }`
- `setupDirOnlyFixture(wsName)` — creates one plain dir, returns `{ wsRoot, dirPath }`
- Both write workspace YAML with the correct mixed/dir-only shape

The existing push trunk-skip test (`test("skips trunk repos")` at L362) is the gold standard for the skip assertion pattern:

```typescript
// Source: tests/lib/workspace-ops.test.ts L409-412
const result = await pushWorkspace(wsName, { setUpstream: true })
expect(result.ok).toBe(true)
expect(result.skipped).toContainEqual({ repo: "trunk-repo", reason: "trunk" })
expect(result.pushed.some(repo => repo.repo === "worktree-repo")).toBe(true)
```

[VERIFIED: tests/lib/workspace-ops.test.ts L362-413]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Dir guard utility function | A shared `isGitRepo(mode)` helper | Inline `r.mode !== "dir"` filter — used identically in three places already |
| New test fixture | Custom mixed workspace builder | `setupMixedDirFixture` and `setupDirOnlyFixture` already exist in Phase 65 work |

**Key insight:** All six requirements are either already satisfied or require a one-line filter. There is no architectural work to do — only the fetch-loop fix and test coverage.

## Common Pitfalls

### Pitfall 1: Assuming pullWorkspace fetch loop is already safe

**What goes wrong:** The Phase 2 pull loop has the dir guard, so `result.skipped` is correct. A reviewer may conclude pull is fully fixed without checking Phase 1.

**Why it happens:** The two-phase structure means looking at only the pull loop gives a false sense of correctness.

**How to avoid:** Always check BOTH loops when reviewing `pullWorkspace`. D-04 is explicit.

**Warning signs:** `fetchOrigin` being called on a path without a `.git` directory; `"fetching"` progress events emitted for dir repos.

### Pitfall 2: Forgetting pullWorkspace is importable as `nameOrWorkspace: string | Workspace`

**What goes wrong:** Tests that call `pullWorkspace(wsName, ...)` pass a string. But `pullWorkspace` accepts either. Use the string form in tests (consistent with push/sync/merge test patterns).

**How to avoid:** Pass `wsName` string, not the workspace object.

### Pitfall 3: Test isolation — `pullWorkspace` is not yet exported in the test file

**What goes wrong:** `tests/lib/workspace-ops.test.ts` imports specific functions from workspace-ops. `pullWorkspace` is NOT currently imported there (grep confirms no match). Tests will need a new import.

**How to avoid:** Add `pullWorkspace` to the import block at the top of the test file.

[VERIFIED: grep for "pullWorkspace" in tests/lib/workspace-ops.test.ts — no matches]

### Pitfall 4: Mixed-workspace fixture needs a remote for push tests

**What goes wrong:** The existing `setupMixedDirFixture` creates worktree repos but does NOT set up a remote. `pushWorkspace` needs a remote to verify the worktree repo actually pushes.

**How to avoid:** For the push dir-skip test, set up a bare remote the same way the trunk-skip test does (L374-377 in the test file: `git init --bare remotePath`, `git remote add origin remotePath`, `git push -u origin main`).

[VERIFIED: tests/lib/workspace-ops.test.ts L374-380]

### Pitfall 5: `ok` field semantics for skipped results

**What goes wrong:** `pullWorkspace` returns `ok: skipped.length === 0 && failed.length === 0`. If a dir repo appears in `skipped`, `ok` will be `false` in a dir-only workspace test.

**Why it matters for tests:** A test asserting `result.ok === true` on a dir-only workspace will fail. A mixed workspace with at least one successful pull and one dir-skip will also be `ok: false`.

**How to avoid:** Either assert on the individual arrays (`result.skipped`, `result.pulled`) rather than `result.ok`, or note that `ok: false` with `skipped` entries is the expected behavior per the current return logic. The planner may choose to change this semantic (it is within Claude's discretion), or simply write tests that assert on the detailed arrays.

[VERIFIED: workspace-ops.ts L1593 — `ok: skipped.length === 0 && failed.length === 0`]

## Code Examples

### Fix: pullWorkspace fetch dedup loop

```typescript
// Source: src/lib/workspace-ops.ts (Phase 66 change)
// Add filter at Phase 1 start so dir repos never enter fetchGroups

// Phase 1: Parallel fetch, deduplicated by main_path
// Dir repos are not git repos — exclude before building fetch groups
const gitRepos = repos.filter(r => r.mode !== "dir")
const fetchGroups = new Map<string, typeof gitRepos>()
for (const repo of gitRepos) {
  const key = repo.main_path
  if (!fetchGroups.has(key)) fetchGroups.set(key, [])
  fetchGroups.get(key)!.push(repo)
}
```

### Test: pull skips dir repos (model test structure)

```typescript
// Source: tests/lib/workspace-ops.test.ts — new test in "dir repo lifecycle" describe block
test("pullWorkspace skips dir repos in mixed workspace", async () => {
  const wsName = uniqueWsName("pull-dir-skip")
  const { gitRepoPath, worktreePath } = await setupMixedDirFixture(wsName)

  // Set up remote so the worktree repo can be fetched/pulled
  const remotePath = join(tmp, "pull-remote.git")
  execSync(`git init --bare ${remotePath}`, { stdio: "pipe" })
  execSync(`git -C ${gitRepoPath} remote add origin ${remotePath}`, { stdio: "pipe" })
  execSync(`git -C ${gitRepoPath} push -u origin main`, { stdio: "pipe" })
  // push worktree branch to remote too
  execSync(`git -C ${worktreePath} push -u origin feature/dir-test`, { stdio: "pipe" })

  const result = await pullWorkspace(wsName)
  expect(result.skipped).toContainEqual({ repo: "shared-configs", reason: "dir" })
  expect(result.failed).toHaveLength(0)
})
```

### Existing guard pattern (confirmed safe)

```typescript
// Source: src/lib/workspace-ops.ts L1197 — pushWorkspace
const worktreeRepos = workspace.repos.filter(r => r.mode === "worktree")
const trunkRepos = workspace.repos.filter(r => r.mode === "trunk")
// dir repos are absent from both — implicitly excluded from all push operations
```

```typescript
// Source: src/lib/workspace-ops.ts L1284 — syncWorkspace
const worktreeRepos = workspace.repos.filter(r => r.mode === "worktree")
// dir repos never enter the sync loop
```

```typescript
// Source: src/lib/workspace-ops.ts L691 — mergeWorkspace
const worktreeRepos = workspace.repos.filter((r) => r.mode === "worktree")
// dir repos never enter the merge/branch-delete operations
```

## State of the Art

This phase is a pure codebase fix — no ecosystem patterns to track. All patterns are internal to git-stacks.

| Requirement | Status in Working Tree | Test Coverage |
|-------------|----------------------|---------------|
| GIT-01 push | ALREADY GUARDED (implicit filter) | NOT TESTED |
| GIT-02 pull (fetch) | NEEDS FIX (fetch dedup loop) | NOT TESTED |
| GIT-02 pull (pull) | ALREADY GUARDED (explicit skip) | NOT TESTED |
| GIT-03 sync | ALREADY GUARDED (implicit filter) | NOT TESTED |
| GIT-04 merge | ALREADY GUARDED (implicit filter) | NOT TESTED |
| GIT-05 ahead/behind | ALREADY GUARDED (explicit filter) | NOT TESTED |
| GIT-06 dirty | ALREADY GUARDED (both explicit + implicit) | NOT TESTED |

[VERIFIED: codebase read of src/lib/workspace-ops.ts working tree]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 65 changes to workspace-ops.ts and workspace-ops.test.ts are in the working tree but not committed — Phase 66 builds on them directly | Architecture Patterns | If Phase 65 rolls back, Phase 66 would need to re-implement the Phase 2 pull guard and Phase 65 test fixtures |

**Only one assumed item:** Everything else was verified by reading the working tree source files and tests directly.

## Open Questions

1. **`ok` return value when only dir repos are skipped**
   - What we know: `ok: skipped.length === 0 && failed.length === 0` means a dir-only workspace pull returns `ok: false`
   - What's unclear: Is this the intended behavior? A dir-only workspace can never "successfully pull" in the traditional sense, but it should not be an error.
   - Recommendation: Leave as-is for Phase 66 (it is within existing semantics for skipped repos); Phase 67 display work may address messaging. Tests should assert on `result.skipped` arrays rather than `result.ok` to avoid fragility.

## Environment Availability

Step 2.6: SKIPPED — phase is purely code changes in TypeScript source files with no external tool dependencies beyond the already-confirmed `git >= 2.24` and `bun` runtime.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (Bun v1.3.10) |
| Config file | scripts/test-runner.ts (isolation runner) |
| Quick run command | `bun test tests/lib/workspace-ops.test.ts` |
| Full suite command | `bun run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| GIT-01 | push skips dir repos | integration | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 |
| GIT-02 | pull skips dir repos (fetch + pull phases) | integration | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 |
| GIT-03 | sync skips dir repos | integration | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 |
| GIT-04 | merge skips dir repos | integration | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 |
| GIT-05 | ahead/behind counts exclude dir repos | integration | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 |
| GIT-06 | dirty detection excludes dir repos | integration | `bun test tests/lib/workspace-ops.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `bun test tests/lib/workspace-ops.test.ts`
- **Per wave merge:** `bun run test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Six new tests in `tests/lib/workspace-ops.test.ts` within `describe("dir repo lifecycle")` block — covers GIT-01 through GIT-06
- [ ] `pullWorkspace` must be added to import list in test file

*(All test infrastructure exists — only test cases and one import are missing)*

## Security Domain

This phase modifies only internal workspace filtering logic — no new data inputs, authentication, cryptography, or external-facing surfaces. ASVS categories do not apply to filter-placement refactoring.

## Sources

### Primary (HIGH confidence)

- Working tree: `src/lib/workspace-ops.ts` — read directly; all guard placements verified by line number
- Working tree: `tests/lib/workspace-ops.test.ts` — read directly; confirmed `pullWorkspace` not imported, `setupMixedDirFixture` and `setupDirOnlyFixture` available
- `.planning/phases/66-git-operation-guards/66-CONTEXT.md` — decisions D-01 through D-05 locked

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` — GIT-01 through GIT-06 definitions
- `bun test tests/lib/workspace-ops.test.ts` — 102 tests pass; confirms Phase 65 working tree is self-consistent

## Metadata

**Confidence breakdown:**

- What needs changing: HIGH — read working tree directly, fetch loop gap confirmed
- Test pattern: HIGH — trunk-skip test pattern read and transcribed
- Guard completeness: HIGH — all six functions read and categorized
- Side-effects / ok-semantics: MEDIUM — `ok` field semantics flagged as open question but non-blocking

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable codebase — no fast-moving dependencies)
