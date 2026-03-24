# Phase 29: Upstream Worktree Branch Tracking - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Worktrees for branches that already exist on origin are created with upstream tracking configured, so `git push` and `git pull` work without `--set-upstream`. Applies to workspace creation (`new`, `clone`, TUI create) and workspace open. Does not modify sync, merge, or other operations.

</domain>

<decisions>
## Implementation Decisions

### Detection Strategy
- Check local remote-tracking refs first (`git rev-parse --verify origin/<branch>`) — fast, no network
- Fall back to `git ls-remote origin <branch>` only if local check fails — catches freshly pushed branches
- For multi-repo workspaces, run upstream checks in parallel across repos
- Only check and set tracking during create and open operations, not sync/merge/etc.

### Tracking Mechanism
- Use `git branch --set-upstream-to=origin/<branch>` as the universal approach — covers both new and existing branches in one code path
- Skip repos that already have upstream tracking configured — avoid redundant work on open

### Claude's Discretion
- Implementation details for the "already tracked" check (e.g., `git config branch.<branch>.remote`)
- Error handling for ls-remote failures (network unreachable) — should be non-fatal
- Whether to log/display tracking setup to the user during creation

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `checkBranchExists()` in `git.ts:4-7` — existing local ref check using `git rev-parse --verify`
- `fetchOrigin()` in `git.ts:111-112` — existing fetch helper (used by sync, not creation)
- Bun `$` shell with `.quiet().nothrow()` pattern throughout git.ts

### Established Patterns
- `createWorktree()` in `git.ts:9-21` — current implementation: checks local branch existence, creates with `-b` if new or checks out if existing; no upstream tracking
- All git operations use `git -C ${repoPath}` pattern for repo targeting
- Error handling: `.quiet().nothrow()` then check `.exitCode`

### Integration Points
- `workspace-wizard.ts:347` — `git-stacks new` CLI creation
- `workspace-clone.ts:133` — `git-stacks clone` CLI creation
- `workspace-ops.ts:732,807,879` — open/repair/rename operations
- `dashboard/App.tsx:729` — TUI create wizard
- `openWorkspace()` in `workspace-ops.ts` — where open-time tracking would be added

</code_context>

<specifics>
## Specific Ideas

- STATE.md notes: confirm whether `fetchOrigin()` runs before `createWorktree()` in creation flow — it does NOT (only in sync). This confirms the layered detection approach (local rev-parse first, then ls-remote fallback).
- User preference: separate `ensureUpstreamTracking()` function in git.ts rather than coupling tracking into createWorktree() — keeps concerns separate.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
