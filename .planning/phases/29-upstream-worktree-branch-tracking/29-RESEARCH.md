# Phase 29: Upstream Worktree Branch Tracking - Research

**Researched:** 2026-03-24
**Domain:** Git worktree upstream tracking, Bun shell API
**Confidence:** HIGH

## Summary

This phase adds automatic upstream branch tracking when git-stacks creates or opens worktrees. The codebase has a clean separation: `createWorktree()` in `git.ts` handles worktree creation, and 4 callsites invoke it (workspace-wizard.ts, workspace-clone.ts, workspace-ops.ts, dashboard App.tsx). A new `ensureUpstreamTracking()` function should be added to `git.ts` and called after worktree creation at each callsite, plus during `openWorkspace()` for existing worktrees.

The detection strategy uses a two-layer approach: first check local remote-tracking refs with `git rev-parse --verify origin/<branch>` (fast, no network), then fall back to `git ls-remote origin <branch>` if the local check fails. The tracking is set with `git branch --set-upstream-to=origin/<branch> <branch>`. Both commands work correctly when executed from a worktree path using `-C`.

**Primary recommendation:** Add `ensureUpstreamTracking(repoPath, branch)` and `hasUpstreamTracking(repoPath, branch)` to `git.ts`, then integrate at 5 points: after `createWorktree()` in the 4 creation callsites, and inside `openWorkspace()` for worktrees that already exist.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Check local remote-tracking refs first (`git rev-parse --verify origin/<branch>`) -- fast, no network
- Fall back to `git ls-remote origin <branch>` only if local check fails -- catches freshly pushed branches
- For multi-repo workspaces, run upstream checks in parallel across repos
- Only check and set tracking during create and open operations, not sync/merge/etc.
- Use `git branch --set-upstream-to=origin/<branch>` as the universal approach -- covers both new and existing branches in one code path
- Skip repos that already have upstream tracking configured -- avoid redundant work on open

### Claude's Discretion
- Implementation details for the "already tracked" check (e.g., `git config branch.<branch>.remote`)
- Error handling for ls-remote failures (network unreachable) -- should be non-fatal
- Whether to log/display tracking setup to the user during creation

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WUX-01 | Worktree creation checks for existing upstream branch and sets up tracking automatically | `ensureUpstreamTracking()` function using rev-parse + ls-remote detection, `--set-upstream-to` for tracking setup. All 4 create callsites and `openWorkspace()` identified. |
</phase_requirements>

## Standard Stack

No new dependencies required. This phase uses only git commands executed through Bun's `$` shell, following existing patterns in `src/lib/git.ts`.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun `$` shell | 1.3.10 | Execute git commands | Already used throughout git.ts |
| git | 2.53.0 | Worktree and branch management | Project requirement (2.24+ for worktree support) |

### Git Commands Used
| Command | Purpose | Network? |
|---------|---------|----------|
| `git rev-parse --verify origin/<branch>` | Check if remote-tracking ref exists locally | No |
| `git ls-remote --exit-code --heads origin <branch>` | Check if branch exists on remote | Yes |
| `git config branch.<branch>.remote` | Check if upstream tracking already configured | No |
| `git branch --set-upstream-to=origin/<branch> <branch>` | Set upstream tracking | No |

## Architecture Patterns

### New Functions in git.ts

```
src/lib/git.ts (additions)
  +  checkRemoteTrackingRef(repoPath, branch)   -- fast local check
  +  checkBranchExistsOnRemote(repoPath, branch) -- network fallback
  +  hasUpstreamTracking(repoPath, branch)       -- already-tracked guard
  +  ensureUpstreamTracking(repoPath, branch)    -- orchestrator
```

### Pattern 1: Two-Layer Detection
**What:** Check local remote-tracking refs first, fall back to network only if needed.
**When to use:** Every worktree creation and every workspace open.
**Example:**
```typescript
// Source: git official docs + existing codebase patterns
export async function checkRemoteTrackingRef(
  repoPath: string,
  branch: string
): Promise<boolean> {
  const result = await $`git -C ${repoPath} rev-parse --verify origin/${branch}`
    .quiet()
    .nothrow()
  return result.exitCode === 0
}

export async function checkBranchExistsOnRemote(
  repoPath: string,
  branch: string
): Promise<boolean> {
  const result = await $`git -C ${repoPath} ls-remote --exit-code --heads origin ${branch}`
    .quiet()
    .nothrow()
  return result.exitCode === 0
}
```

### Pattern 2: Already-Tracked Guard
**What:** Skip tracking setup if `branch.<name>.remote` is already configured.
**When to use:** During `openWorkspace()` to avoid redundant work on every open.
**Example:**
```typescript
export async function hasUpstreamTracking(
  repoPath: string,
  branch: string
): Promise<boolean> {
  const result = await $`git -C ${repoPath} config branch.${branch}.remote`
    .quiet()
    .nothrow()
  return result.exitCode === 0 && result.stdout.toString().trim().length > 0
}
```

### Pattern 3: Orchestrator Function
**What:** Combines detection + guard + tracking setup into one call.
**When to use:** Called after `createWorktree()` and during `openWorkspace()`.
**Example:**
```typescript
export async function ensureUpstreamTracking(
  repoPath: string,
  branch: string
): Promise<{ tracked: boolean; source?: "local" | "remote" }> {
  // Skip if already tracked
  if (await hasUpstreamTracking(repoPath, branch)) {
    return { tracked: false }
  }

  // Layer 1: local remote-tracking ref
  let hasRemoteRef = await checkRemoteTrackingRef(repoPath, branch)

  // Layer 2: network fallback
  if (!hasRemoteRef) {
    try {
      hasRemoteRef = await checkBranchExistsOnRemote(repoPath, branch)
    } catch {
      // Network unreachable -- non-fatal, skip tracking
      return { tracked: false }
    }
  }

  if (!hasRemoteRef) {
    return { tracked: false }
  }

  // Set tracking
  await $`git -C ${repoPath} branch --set-upstream-to=origin/${branch} ${branch}`
    .quiet()
    .nothrow()
  return { tracked: true, source: hasRemoteRef ? "local" : "remote" }
}
```

### Pattern 4: Parallel Execution for Multi-Repo
**What:** Run `ensureUpstreamTracking()` in parallel across all worktree repos.
**When to use:** After all worktrees are created in a workspace (all 4 creation callsites) and during `openWorkspace()`.
**Example:**
```typescript
// After worktrees created:
const trackingResults = await Promise.all(
  worktreeRepos.map(repo =>
    ensureUpstreamTracking(repo.main_path, branch)
  )
)
```

### Anti-Patterns to Avoid
- **Coupling tracking into createWorktree():** Violates the CONTEXT.md decision for a separate function. Keep `createWorktree()` unchanged.
- **Using `git worktree add --track`:** Only works when creating with `-b` from a remote-tracking ref as the commit-ish. The current code uses `-b <branch> <path>` (from HEAD) or `<path> <branch>` (existing). Refactoring would change the fundamental creation flow.
- **Running `git fetch` before every creation:** Violates the performance constraint. The detection should use existing local refs, with `ls-remote` as a targeted fallback.
- **Ignoring the `-C` path pattern:** All git operations in this codebase use `git -C ${repoPath}` to target repos. Do not `cd` into repos.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Remote branch detection | Custom ref-file parsing | `git rev-parse --verify origin/<branch>` | Git handles packed refs, alternates, etc. |
| Network branch check | HTTP API to hosting provider | `git ls-remote --exit-code --heads origin <branch>` | Works with any remote (GitHub, GitLab, Gitea, etc.) |
| Tracking config check | Parsing `.git/config` directly | `git config branch.<name>.remote` | Handles worktree-specific config, includes/conditionals |
| Setting upstream | Writing to `.git/config` directly | `git branch --set-upstream-to=origin/<branch>` | Correctly handles branch.<name>.remote and branch.<name>.merge |

**Key insight:** All upstream tracking operations have dedicated git porcelain commands. Never parse git internals directly.

## Common Pitfalls

### Pitfall 1: Branch Names with Slashes
**What goes wrong:** `git config branch.feature/my-branch.remote` -- git config uses dots as section separators, but the branch name itself can contain slashes. Git handles this internally by encoding the full branch name in the config key `[branch "feature/my-branch"]`.
**Why it happens:** Bun's `$` template literal handles this correctly because the branch name is passed as a single argument.
**How to avoid:** Use Bun's `$` shell interpolation, not string concatenation. The `$` shell properly quotes arguments.
**Warning signs:** Tests with simple branch names pass but `feature/x` branches fail.

### Pitfall 2: ls-remote Network Failure
**What goes wrong:** `git ls-remote` hangs or fails when the network is unreachable, blocking workspace creation.
**Why it happens:** The fallback to ls-remote is a network call. If the user is offline, this will timeout.
**How to avoid:** Use `.quiet().nothrow()` on the ls-remote call and treat any failure as "branch not found on remote" -- non-fatal. The function should return `{ tracked: false }`, not throw.
**Warning signs:** Workspace creation takes 30+ seconds (the fetch.timeout value from fetchOrigin).

### Pitfall 3: Worktree Path vs Main Path
**What goes wrong:** Running `git branch --set-upstream-to` from the worktree path fails because the worktree doesn't have its own `.git` directory (it has a `.git` file pointing to the main repo's worktree info).
**Why it happens:** Worktrees share the main repo's `.git` directory. Branch config is stored in the main repo's config.
**How to avoid:** Use the `main_path` (main clone directory) for all git operations, consistent with the existing `createWorktree()` pattern which uses `repoPath` (the main clone). However, `git -C <worktree-path>` also works for branch operations because git resolves the `.git` pointer. The key is consistency: use `main_path` since that's what `createWorktree()` uses.
**Warning signs:** Test passes with main path but fails with worktree path, or vice versa.

### Pitfall 4: Race Between Create and Track
**What goes wrong:** If `ensureUpstreamTracking()` is called before the worktree is fully created, the branch might not exist yet.
**Why it happens:** `createWorktree()` is awaited, but tracking must happen after.
**How to avoid:** Always `await createWorktree()` first, then call `ensureUpstreamTracking()`. The CONTEXT.md decision to keep them separate makes this clear.
**Warning signs:** "fatal: no such branch" errors during tracking setup.

### Pitfall 5: Stale Remote-Tracking Refs
**What goes wrong:** A branch was pushed to origin but the local remote-tracking ref hasn't been updated (no recent fetch), so `rev-parse --verify origin/<branch>` returns false.
**Why it happens:** The user's local clone hasn't fetched recently.
**How to avoid:** This is exactly why the two-layer detection exists. The `ls-remote` fallback catches this case. The CONTEXT.md decision explicitly accounts for this.
**Warning signs:** Branch exists on remote but tracking isn't set up.

## Code Examples

### Integration Point 1: workspace-wizard.ts (lines 344-353)
```typescript
// Current code creates worktrees sequentially:
for (const repo of worktreeRepos) {
  spinner.message(`${repo.name}...`)
  await createWorktree(repo.main_path, repo.task_path, branch)
}

// After creation, add parallel tracking:
const trackingResults = await Promise.all(
  worktreeRepos.map(async (repo) => {
    const result = await ensureUpstreamTracking(repo.main_path, branch)
    return { repo: repo.name, ...result }
  })
)
const tracked = trackingResults.filter(r => r.tracked)
if (tracked.length > 0) {
  spinner.message(`upstream tracking set for ${tracked.map(r => r.repo).join(", ")}`)
}
```

### Integration Point 2: workspace-clone.ts (lines 130-140)
```typescript
// Same pattern as workspace-wizard.ts
// After the worktree creation loop, add parallel tracking
```

### Integration Point 3: workspace-ops.ts openWorkspace() (lines 725-735)
```typescript
// Current code recreates missing worktrees:
if (missing.length > 0) {
  for (const repo of missing) {
    await createWorktree(repo.main_path, repo.task_path, workspace.branch)
  }
}

// After missing worktree recreation AND for existing worktrees:
const worktreeRepos = workspace.repos.filter(r => r.mode === "worktree" && existsSync(r.task_path))
await Promise.all(
  worktreeRepos.map(repo =>
    ensureUpstreamTracking(repo.main_path, workspace.branch)
  )
)
```

### Integration Point 4: dashboard App.tsx (line 729)
```typescript
// After the worktree creation loop (line 748), before file ops (line 750):
const trackingResults = await Promise.all(
  createdWorktrees.map(({ main_path }) =>
    ensureUpstreamTracking(main_path, branch)
  )
)
```

### Integration Point 5: workspace-ops.ts renameWorkspace() (line 879)
```typescript
// After createWorktree in rename, tracking should also be set.
// renameWorkspace already calls createWorktree -- ensureUpstreamTracking
// should be called after for completeness, but this is a stretch goal
// since the branch was already tracked before the rename.
```

### Already-Tracked Check Implementation
```typescript
// git config returns exitCode 1 if the key doesn't exist
export async function hasUpstreamTracking(
  repoPath: string,
  branch: string
): Promise<boolean> {
  const result = await $`git -C ${repoPath} config branch.${branch}.remote`
    .quiet()
    .nothrow()
  return result.exitCode === 0 && result.stdout.toString().trim().length > 0
}
```

## Existing Code Analysis

### createWorktree() Flow (git.ts:9-21)
1. Calls `checkBranchExists(repoPath, branch)` -- checks if local branch ref exists
2. If exists: `git worktree add <path> <branch>` -- checks out existing branch
3. If not: `git worktree add -b <branch> <path>` -- creates new branch from HEAD

**Key insight:** `checkBranchExists()` checks LOCAL branch refs only (no `origin/` prefix). This means it returns true for branches that exist locally regardless of remote tracking state. The tracking setup is a separate concern.

### openWorkspace() Flow (workspace-ops.ts:695-834)
1. Read workspace config
2. Recreate missing worktrees (lines 726-735)
3. Run pre_open hooks
4. Apply file ops
5. Write env files
6. Handle trunk repo branch checks
7. Run integrations
8. Run post_open hooks
9. Update last_opened timestamp

**Where to add tracking:** After step 2 (recreating missing worktrees) and before step 3 (hooks). This ensures tracking is set before any hooks run that might try to push/pull. Should check ALL worktree repos, not just missing ones, since an open of an existing workspace should also ensure tracking.

### All createWorktree Callsites
| File | Line | Context |
|------|------|---------|
| `src/tui/workspace-wizard.ts` | 347 | `git-stacks new` CLI creation -- sequential loop |
| `src/tui/workspace-clone.ts` | 133 | `git-stacks clone` CLI creation -- sequential loop |
| `src/tui/dashboard/App.tsx` | 729 | TUI create wizard -- sequential loop with progress UI |
| `src/lib/workspace-ops.ts` | 732 | `openWorkspace()` -- recreates missing worktrees |
| `src/lib/workspace-ops.ts` | 807 | `openWorkspace()` -- trunk repo worktree fallback |
| `src/lib/workspace-ops.ts` | 879 | `renameWorkspace()` -- re-registers worktrees |

### isBranchGoneOnRemote() (git.ts:42-47)
Already uses `git ls-remote --exit-code --heads origin <branch>` with `.quiet().nothrow()`. This is the exact same pattern needed for `checkBranchExistsOnRemote()`, but with inverted semantics (gone = exit != 0, exists = exit === 0).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `git worktree add --track -b <branch> <path> origin/<branch>` | Still works, but requires knowing the remote ref upfront | N/A | We use post-creation `--set-upstream-to` instead for flexibility |
| `git branch -u` (shorthand) | `git branch --set-upstream-to=` (long form) | Same thing | Long form is clearer in code |

**git 2.53.0 note:** The `--guess-remote` option for `git worktree add` automatically sets up tracking when a matching remote branch exists. However, it only works when the branch name exactly matches the remote ref basename and is used without `-b`. Since `createWorktree()` uses `-b` for new branches, `--guess-remote` doesn't apply to that code path. The post-creation `--set-upstream-to` approach from CONTEXT.md is correct.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | `bunfig.toml` (preload for OpenTUI) |
| Quick run command | `bun test tests/lib/git.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WUX-01a | `ensureUpstreamTracking()` sets tracking when remote-tracking ref exists locally | unit | `bun test tests/lib/git.test.ts` | Exists, needs new tests |
| WUX-01b | `ensureUpstreamTracking()` falls back to ls-remote when local ref missing | unit | `bun test tests/lib/git.test.ts` | Exists, needs new tests |
| WUX-01c | `hasUpstreamTracking()` returns true when already tracked | unit | `bun test tests/lib/git.test.ts` | Exists, needs new tests |
| WUX-01d | `ensureUpstreamTracking()` is non-fatal when remote unreachable | unit | `bun test tests/lib/git.test.ts` | Exists, needs new tests |
| WUX-01e | New branch (no remote) -- no tracking attempted | unit | `bun test tests/lib/git.test.ts` | Exists, needs new tests |
| WUX-01f | `openWorkspace()` sets tracking on existing worktrees | integration | `bun test tests/lib/workspace-ops.test.ts` | Exists, needs new tests |

### Test Setup Requirements
Testing requires a local "bare" remote repo to simulate `origin`. The existing test pattern in `tests/lib/git.test.ts` already demonstrates this:
- `makeGitRepo()` creates a local repo
- `execSync("git remote add origin <path>")` adds a local bare repo as "remote"
- Push branches to the local bare repo to simulate existing upstream branches

For the ls-remote fallback test, a local bare remote with a pushed branch is sufficient -- no actual network is needed.

### Sampling Rate
- **Per task commit:** `bun test tests/lib/git.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None -- existing test infrastructure in `tests/lib/git.test.ts` covers the test patterns needed. New test cases will be added to the existing file.

## Open Questions

1. **Progress feedback during tracking setup**
   - What we know: The CONTEXT.md leaves display/logging to Claude's discretion
   - What's unclear: Whether to show "upstream tracking set for <repo>" messages during creation
   - Recommendation: Show a brief message when tracking is set (e.g., in the spinner message for CLI, in the progress row for TUI). Skip logging when tracking is not set (brand-new branches are the common case -- no noise).

2. **ls-remote timeout**
   - What we know: `fetchOrigin()` uses `-c fetch.timeout=30`. `isBranchGoneOnRemote()` does not set a timeout.
   - What's unclear: Whether ls-remote should also have a timeout
   - Recommendation: Add `-c fetch.timeout=10` to the ls-remote call (shorter than fetch since it's a lighter operation). This prevents blocking workspace creation when offline.

## Sources

### Primary (HIGH confidence)
- `src/lib/git.ts` -- full source reviewed, all functions mapped
- `src/lib/workspace-ops.ts` -- full source reviewed, `openWorkspace()` and `renameWorkspace()` flows mapped
- `src/tui/workspace-wizard.ts` -- full source reviewed, createWorktree callsite at line 347
- `src/tui/workspace-clone.ts` -- full source reviewed, createWorktree callsite at line 133
- `src/tui/dashboard/App.tsx` -- createWorktree callsite at line 729, cleanup pattern mapped
- `tests/lib/git.test.ts` -- test patterns and helpers reviewed
- `tests/helpers.ts` -- `makeGitRepo()` helper reviewed
- [Git worktree documentation](https://git-scm.com/docs/git-worktree) -- `--track` flag behavior, `--guess-remote` option
- [Git branch documentation](https://git-scm.com/docs/git-branch) -- `--set-upstream-to` semantics

### Secondary (MEDIUM confidence)
- Web search results confirming `git branch --set-upstream-to` works from worktree context the same as main repo context

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, uses existing git.ts patterns
- Architecture: HIGH -- all callsites identified, existing patterns are clear
- Pitfalls: HIGH -- branch slash handling, network failures, worktree path vs main path all documented from direct code analysis

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain -- git worktree API is mature)
