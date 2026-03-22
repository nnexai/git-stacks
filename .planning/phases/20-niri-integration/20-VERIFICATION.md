---
phase: 20-niri-integration
verified: 2026-03-22T06:30:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 20: niri-integration Verification Report

**Phase Goal:** Users running niri get all workspace windows automatically arranged onto a dedicated named niri workspace when they open a git-stacks workspace; the integration is idempotent on re-open and cleans up on remove
**Verified:** 2026-03-22T06:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## User Decisions Applied

The following intentional deviations from original REQUIREMENTS.md definitions were applied during verification, per CONTEXT.md and user decisions:

- **NIRI-05** (cleanup on remove): Intentionally NOT implemented per user decision. Treated as satisfied-by-decision.
- **NIRI-03** (spawn terminal attached to tmux session): Implemented as `commands: string[]` config array instead of hardcoded terminal+tmux attachment. Per user decision D-config, this supersedes the original spec.
- **NIRI-09** (configurable terminal emulator): Implemented as `commands: string[]` rather than `terminal: "ghostty"` config. Per user decision D-config.

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | niri integration creates a named niri workspace when opening a git-stacks workspace on a niri session | VERIFIED | `setNiriWorkspaceName(workspaceName)` called when `listNiriWorkspaces()` returns no matching name (line 48, niri.ts) |
| 2  | niri integration moves windows from prior integrations (vscode, intellij) onto the named workspace using PID matching | VERIFIED | `niriWindows.find(w => w.pid != null && w.pid === artifact.pid)` + `moveWindowToWorkspace(match.id, workspaceName)` (lines 58-63, niri.ts); test confirms call with correct args |
| 3  | niri integration runs user-configured commands array after workspace setup | VERIFIED | `runHooks(config.commands, ctx.tasksDir, hookEnv, false)` called with WS_WORKSPACE, WS_BRANCH, WS_TASKS_DIR env vars (lines 72-79, niri.ts) |
| 4  | niri integration skips silently (returns null) when NIRI_SOCKET is not set | VERIFIED | `if (!(await isNiriRunning())) return null` before spinner start (line 35, niri.ts); test confirms null return and zero calls to other functions |
| 5  | niri integration is idempotent on re-open — does not duplicate workspace naming, still moves new windows | VERIFIED | `alreadyNamed` check prevents duplicate `setNiriWorkspaceName`; `focusNiriWorkspace` and window moves always run (lines 44-68, niri.ts); two tests confirm both paths |
| 6  | niri integration does NOT clean up on remove (NIRI-05 intentionally unimplemented per user decision) | VERIFIED | No `remove()` method exists in niri.ts (95 lines, Integration interface only implements open and configurePrompt) |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/integrations/niri.ts` | Niri integration plugin implementing Integration interface; exports niriIntegration; min 60 lines | VERIFIED | 95 lines; exports `niriIntegration`; implements `id`, `label`, `hint`, `enabledByDefault`, `order`, `isEnabled`, `open`, `configurePrompt` |
| `src/lib/integrations/index.ts` | Integration registry including niri | VERIFIED | Line 5: `import { niriIntegration } from "./niri"`; line 13: `niriIntegration` appended to integrations array |
| `tests/lib/integrations/niri.test.ts` | Unit tests for niri integration with mocked niri.ts wrappers; min 100 lines | VERIFIED | 232 lines; 13 tests across 4 describe blocks; mock.module pattern used for @/lib/niri, @clack/prompts, @/lib/lifecycle |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/integrations/niri.ts` | `src/lib/niri.ts` | import { isNiriRunning, listNiriWorkspaces, listNiriWindows, setNiriWorkspaceName, moveWindowToWorkspace, focusNiriWorkspace } | WIRED | Lines 9-16 of niri.ts; all six functions imported and used in open() |
| `src/lib/integrations/niri.ts` | `src/lib/lifecycle.ts` | import { runHooks } | WIRED | Line 17 of niri.ts; used at line 78 with commands, cwd, hookEnv, false |
| `src/lib/integrations/niri.ts` | `src/lib/integrations/types.ts` | import { resolveEnabled, Integration, IntegrationContext, ArtifactBag } | WIRED | Lines 3-8 of niri.ts; resolveEnabled used in isEnabled at line 31 |
| `src/lib/integrations/index.ts` | `src/lib/integrations/niri.ts` | import { niriIntegration } | WIRED | Line 5 of index.ts; niriIntegration in integrations array at line 13 |
| `tests/lib/integrations/niri.test.ts` | `src/lib/integrations/niri.ts` | cache-busted dynamic import with mock.module for @/lib/niri | WIRED | Lines 35-38; `@/lib/integrations/niri?niri-integration-test` cache-bust present |

### Requirements Coverage

| Requirement | REQUIREMENTS.md Description | Status | Evidence / Notes |
|-------------|----------------------------|--------|------------------|
| NIRI-01 | Creates/reuses named niri workspace per git-stacks workspace via `set-workspace-name` | SATISFIED | `setNiriWorkspaceName(workspaceName)` called when not already named (niri.ts line 48); skipped when workspace with matching name exists (line 44-46) |
| NIRI-02 | Moves windows from prior integrations to named workspace using artifact bag window info | SATISFIED | PID-based matching in open() lines 55-68; test "moves windows matching by pid" confirms window ID 42 moved to "test-ws" |
| NIRI-03 | Spawns terminal attached to tmux session (original spec) | SATISFIED-BY-DECISION | User decision D-config: implemented as `commands: string[]` config array via runHooks instead of hardcoded terminal spawn. More flexible than original spec. runHooks called with abortOnFailure=false (line 78) |
| NIRI-04 | Idempotent on re-open: checks if named workspace exists before recreating | SATISFIED | `alreadyNamed` query-before-create pattern (lines 43-49); `focusNiriWorkspace` always called; test "focusNiriWorkspace always called when workspace already named" confirms |
| NIRI-05 | Cleans up (unnames workspace) when git-stacks workspace is removed | SATISFIED-BY-DECISION | Intentionally NOT implemented per user decision. No remove/cleanup method added to niri.ts. |
| NIRI-08 | Gated by NIRI_SOCKET env var presence (skips gracefully when niri is not running) | SATISFIED | `if (!(await isNiriRunning())) return null` at line 35, before spinner; test confirms null return and zero downstream calls |
| NIRI-09 | Terminal emulator configurable (e.g., `terminal: "ghostty"`) | SATISFIED-BY-DECISION | User decision D-config: implemented as `commands: string[]` rather than `terminal` field. Niri config schema: `{ enabled?: boolean, commands?: string[] }`. More flexible. |
| TEST-04 | Unit tests with mocked niri shell wrappers covering workspace create, window move, tmux attach, cleanup | SATISFIED | 13 tests; covers: NIRI_SOCKET gate (2), workspace create/idempotency (4), window moves including PID matching/null-pid/failure-tolerance (4), commands execution (2), registration metadata (1). 438 total tests pass. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns found |

Scan results for niri.ts (95 lines):
- No TODO/FIXME/XXX/HACK comments
- No placeholder text
- `return null` at line 35 (NIRI_SOCKET gate — intentional, per design) and line 88 (tier-3 always returns null — intentional)
- No empty handlers or stub implementations
- All branches lead to real operations or guarded early-returns

Scan results for niri.test.ts (232 lines):
- No TODO/FIXME comments
- No placeholder tests
- All 13 tests have real assertions (expect() calls)

### Human Verification Required

None required. All behaviors are verifiable programmatically:
- NIRI_SOCKET gating is tested with mocked isNiriRunning
- Window arrangement uses mocked IPC wrappers
- Commands execution is tested via mocked runHooks
- Idempotency path is covered by two distinct test cases

Visual behavior (niri compositor side) is inherently impossible to test in CI, but the integration logic that drives it is fully tested through mocks.

### Gaps Summary

No gaps. All 6 must-haves are verified, all 8 required requirement IDs are satisfied (3 via user decision, 5 via direct implementation), and the test suite passes with 13/13 tests and 0 failures. The full suite of 438 tests passes with 0 failures. TypeScript compiles cleanly with no errors.

---

## Verification Evidence

**Typecheck:** `bun run typecheck` exits 0 (no TypeScript errors across entire project)

**Niri test suite:** `bun test tests/lib/integrations/niri.test.ts` — 13 pass, 0 fail

**Full test suite:** `bun test tests/` — 438 pass, 0 fail

**Commits verified in git log:**
- `8fe0b17` — feat(20-01): implement niri compositor integration plugin
- `7f0494e` — test(20-01): add niri integration test suite (13 tests)

**File metrics:**
- `src/lib/integrations/niri.ts` — 95 lines (exceeds 60-line minimum)
- `tests/lib/integrations/niri.test.ts` — 232 lines (exceeds 100-line minimum), 13 tests

---

_Verified: 2026-03-22T06:30:00Z_
_Verifier: Claude (gsd-verifier)_
