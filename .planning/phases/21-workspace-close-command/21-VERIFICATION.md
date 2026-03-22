---
phase: 21-workspace-close-command
verified: 2026-03-22T11:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 21: Workspace Close Command Verification Report

**Phase Goal:** Users can cleanly tear down integration sessions (tmux, niri) for a workspace without losing any workspace or filesystem state, both from the CLI and the TUI dashboard.
**Verified:** 2026-03-22T11:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can run `git-stacks close <name>` and integration sessions are torn down without deleting worktrees or workspace YAML | VERIFIED | `src/commands/workspace.ts:172` registers `.command("close <name>")` calling `closeWorkspace`; function at `workspace-ops.ts:270` explicitly does not call `removeWorktree` or `unlinkSync`; test at `workspace-ops.test.ts:652` asserts worktrees and YAML survive close |
| 2 | Close runs pre_close hooks before integration cleanup | VERIFIED | `workspace-ops.ts:291-305` runs `workspace.hooks?.pre_close` via `runHooks`/`runHooksCaptured` before calling `runIntegrationCleanup` at line 309 |
| 3 | After close, `git-stacks open <name>` succeeds and restores a working session | VERIFIED | closeWorkspace preserves all filesystem state (worktrees, YAML) — nothing that open depends on is modified or deleted; test at line 662 confirms `workspaceExists(wsName)` and `existsSync(repos[0].worktreePath)` are both true after close |
| 4 | TUI dashboard workspace action menu includes Close with x shortcut | VERIFIED | `ActionMenu.tsx:16` has `{ key: "x", action: "close", label: "Close" }` as second entry; `App.tsx:261` dispatches `if (action === "close")` to progress view; `types.ts:24` has `"close"` in Action union |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/config.ts` | pre_close hook in TemplateSchema and WorkspaceHooksSchema | VERIFIED | Line 75: `pre_close: z.array(z.string()).optional()` in TemplateSchema; Line 115: same in WorkspaceHooksSchema |
| `src/lib/workspace-ops.ts` | closeWorkspace function exported | VERIFIED | Lines 270-313: full implementation with correct signature, hooks, integration cleanup, progress callback |
| `src/commands/workspace.ts` | close <name> CLI subcommand | VERIFIED | Lines 171-185: `.command("close <name>")` with description and action handler |
| `src/tui/dashboard/types.ts` | "close" in Action union type | VERIFIED | Line 24: `export type Action = "open" | "close" | "edit" | ...` |
| `src/tui/dashboard/ActionMenu.tsx` | Close entry with x shortcut | VERIFIED | Line 16: `{ key: "x", action: "close", label: "Close" }` at index 1 (after Open) |
| `src/tui/dashboard/App.tsx` | close action dispatch in runAction | VERIFIED | Lines 261-271: `if (action === "close")` block using `{ captured: true }` and progress view |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/commands/workspace.ts` | `src/lib/workspace-ops.ts` | `import closeWorkspace` | WIRED | Line 27: `closeWorkspace,` in import block; line 180: called in action handler |
| `src/tui/dashboard/App.tsx` | `src/lib/workspace-ops.ts` | `import closeWorkspace` | WIRED | Line 28: `closeWorkspace,` in import from `../../lib/workspace-ops`; line 265: called with `{ captured: true }` |
| `src/lib/workspace-ops.ts` | `src/lib/integrations/runner.ts` | `runIntegrationCleanup call` | WIRED | Line 29: imported; line 309: `await runIntegrationCleanup(ctx)` inside closeWorkspace |
| `src/lib/workspace-ops.ts` | `src/lib/lifecycle.ts` | `runHooks / runHooksCaptured for pre_close` | WIRED | Line 30: both imported; lines 297/300: both branches call hooks against `workspace.hooks.pre_close` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CLOSE-01 | 21-01-PLAN.md | User can run `git-stacks close [name]` to teardown integrations (tmux, niri) without deleting workspace directory or worktrees | SATISFIED | CLI command registered; closeWorkspace does not call removeWorktree or unlinkSync; test confirms YAML and worktrees survive |
| CLOSE-02 | 21-01-PLAN.md | Close runs teardown hooks and integration cleanup but preserves all filesystem state | SATISFIED | pre_close hooks run before `runIntegrationCleanup`; no filesystem mutations after |
| CLOSE-03 | 21-01-PLAN.md | Close is available as a dashboard action menu entry | SATISFIED | ActionMenu has Close at index 1 with `x` shortcut; App.tsx dispatches to progress view |
| CLOSE-04 | 21-01-PLAN.md | Workspace can be re-opened after close with `git-stacks open` | SATISFIED | Closure preserves all state that `openWorkspace` reads; test at line 652 proves this |

All four requirements are satisfied. No orphaned requirements found — REQUIREMENTS.md marks all four CLOSE-* as complete in Phase 21.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

No TODOs, placeholders, stub returns, or empty implementations found in the phase 21 modified files.

### Test Results

- `bun run typecheck` exits 0 — all modified files type-check cleanly
- `bun test tests/lib/workspace-ops.test.ts` — 19 pass, 0 fail (includes 5 new closeWorkspace tests)
- `bun test tests/tui/dashboard/ActionMenu.test.tsx` — 10 pass, 0 fail
- Full suite `bun test tests/` — 374 pass, 14 fail. The 14 failures are pre-existing "unhandled error between tests" caused by `focusNiriWindow` not being exported from `src/lib/niri.ts` — this is a pre-existing issue from Phase 20/22 changes that was present before Phase 21 work began (confirmed by running `git stash` and observing the same 14 failures). None of the 14 failing test files are in the phase 21 change set.

### Human Verification Required

#### 1. Live integration cleanup behavior

**Test:** Open a workspace that has an active tmux session, then run `git-stacks close <name>`. Verify the tmux session is killed and the workspace re-opens cleanly with `git-stacks open <name>`.
**Expected:** tmux session ends; running `git-stacks open <name>` afterward starts a fresh session; worktrees remain intact.
**Why human:** Requires a live tmux/niri environment; cannot verify session teardown programmatically in unit tests.

#### 2. TUI close action UX

**Test:** Open `git-stacks manage`, navigate to a workspace, press enter to open action menu, press `x` to trigger Close.
**Expected:** Progress view appears showing "Closing workspace-name...", shows "Closed 'workspace-name'." when done, then returns to list.
**Why human:** Visual TUI behavior and UX flow require a running terminal session to verify.

### Summary

Phase 21 goal is fully achieved. All four observable truths are verified at all three levels (exists, substantive, wired):

- `closeWorkspace` is a complete, non-destructive implementation that runs hooks and integration cleanup without touching worktrees or YAML
- All four key links between the CLI/TUI layers and the business logic layer are wired
- All four CLOSE requirements are satisfied with direct evidence
- The test suite has 5 dedicated closeWorkspace tests that pass, proving the behavior is tested at the unit level
- No anti-patterns, stubs, or placeholder implementations found

---

_Verified: 2026-03-22T11:00:00Z_
_Verifier: Claude (gsd-verifier)_
