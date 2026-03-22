---
phase: 19-niri-shell-wrappers
verified: 2026-03-22T01:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 19: niri-shell-wrappers Verification Report

**Phase Goal:** All niri msg IPC calls are isolated in src/lib/niri.ts behind a clean interface that automated tests can mock without calling the real niri binary
**Verified:** 2026-03-22
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                          | Status     | Evidence                                                                                      |
|----|-----------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------|
| 1  | isNiriRunning() returns true when NIRI_SOCKET is set, false otherwise                         | VERIFIED   | Lines 82-84 niri.ts; 3 passing tests in niri.test.ts describe("isNiriRunning")               |
| 2  | listNiriWindows() returns Zod-validated NiriWindow[] from niri msg -j windows output          | VERIFIED   | Lines 90-98 niri.ts; 5 passing tests with valid JSON, exitCode error, invalid JSON, Zod fail |
| 3  | listNiriWorkspaces() returns Zod-validated NiriWorkspace[] from niri msg -j workspaces output | VERIFIED   | Lines 104-112 niri.ts; 3 passing tests                                                        |
| 4  | setNiriWorkspaceName() invokes niri msg action set-workspace-name with optional --workspace   | VERIFIED   | Lines 119-128 niri.ts; 3 passing tests (no ref, string ref, numeric ref)                    |
| 5  | moveWindowToWorkspace() invokes niri msg action move-window-to-workspace with --window-id     | VERIFIED   | Lines 134-145 niri.ts; 2 passing tests (string ref, numeric ref)                             |
| 6  | niriSpawn() invokes niri msg action spawn -- with command array                               | VERIFIED   | Lines 152-154 niri.ts; 2 passing tests (multi-arg, single-arg)                               |
| 7  | focusNiriWorkspace() invokes niri msg action focus-workspace with workspace reference         | VERIFIED   | Lines 160-162 niri.ts; 2 passing tests (string ref, numeric ref)                             |
| 8  | snapshotWindowIds() returns new window IDs by diffing before/after with exponential backoff   | VERIFIED   | Lines 177-204 niri.ts; 4 passing tests (new IDs, timeout, sleep injection, backoff)          |
| 9  | snapshotWindowIds() returns empty array on timeout                                            | VERIFIED   | niri.test.ts "returns empty array on timeout when no new windows appear" — passes            |
| 10 | All niri.test.ts tests pass without NIRI_SOCKET in the environment                           | VERIFIED   | bun test tests/lib/niri.test.ts — 26 pass, 0 fail; _exec.run mocked, no real niri call      |
| 11 | The module is fully mockable via mock.module('@/lib/niri', ...) for Phase 20 tests            | VERIFIED   | NiriCommands interface exported (lines 48-57); flat async functions, no class/singleton      |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact                   | Expected                                  | Status     | Details                                                                                      |
|----------------------------|------------------------------------------|------------|----------------------------------------------------------------------------------------------|
| `src/lib/niri.ts`          | All niri msg IPC wrappers                | VERIFIED   | 205 lines; 8 exported async functions, 4 exported types, NiriCommands interface, _exec hook  |
| `tests/lib/niri.test.ts`   | Unit tests — mocked, no real niri calls  | VERIFIED   | 532 lines (>100 min); 26 tests covering all 8 functions; _exec.run mocked before any call   |

**Exports confirmed present in src/lib/niri.ts:**
- Functions: isNiriRunning, listNiriWindows, listNiriWorkspaces, setNiriWorkspaceName, moveWindowToWorkspace, niriSpawn, focusNiriWorkspace, snapshotWindowIds
- Types: NiriWindow, NiriWorkspace, SnapshotOpts, NiriCmdResult
- Interface: NiriCommands
- Test hook: _exec (mutable object for ESM-safe injection)

**Artifact count checks:**
- `grep -c "export async function" src/lib/niri.ts` = 8
- `grep -c "export type|export interface" src/lib/niri.ts` = 5 (NiriWindow, NiriWorkspace, SnapshotOpts, NiriCmdResult, NiriCommands)

### Key Link Verification

| From                      | To                  | Via                                         | Status  | Details                                                                       |
|---------------------------|---------------------|---------------------------------------------|---------|-------------------------------------------------------------------------------|
| `src/lib/niri.ts`         | niri msg CLI        | Bun.$ shell template literals               | WIRED   | `$\`niri msg ${args}\`.quiet().nothrow()` at line 72 inside `_exec.run`      |
| `src/lib/niri.ts`         | zod                 | z.array(schema).parse() for JSON validation | WIRED   | z.array(NiriWindowSchema).parse() at line 94; z.array(NiriWorkspaceSchema).parse() at line 108 |
| `tests/lib/niri.test.ts`  | src/lib/niri.ts     | direct import (cache-busting)               | WIRED   | `import("@/lib/niri?niri-test")` at line 13; type import at line 2           |

All three key links verified. The `_exec.run` indirection means tests intercept all Bun.$ calls without mocking the built-in "bun" module (which cannot be mocked via mock.module per the summary's documented finding).

### Requirements Coverage

| Requirement | Source Plan  | Description                                                                               | Status    | Evidence                                                                    |
|-------------|--------------|------------------------------------------------------------------------------------------|-----------|-----------------------------------------------------------------------------|
| NIRI-06     | 19-01-PLAN   | Window identification uses snapshot-diff of niri msg -j windows (before/after spawn)     | SATISFIED | snapshotWindowIds() at lines 177-204; tests verify before-snapshot, spawn, poll pattern |
| NIRI-07     | 19-01-PLAN   | Window identification uses PID matching from artifact bag for other integrations' windows | SATISFIED | NiriWindow.pid field (Zod schema line 12); function available for Phase 20 PID matching |
| NIRI-10     | 19-01-PLAN   | Niri shell wrappers isolated in src/lib/niri.ts with clean mock boundary                 | SATISFIED | All niri msg calls route through _exec.run; tests replace _exec.run without calling niri |
| TEST-01     | 19-01-PLAN   | Niri shell wrappers have a mockable interface — automated tests never call real niri msg  | SATISFIED | 26 tests pass without NIRI_SOCKET; NiriCommands interface exported for Phase 20 mock.module |

No orphaned requirements detected. REQUIREMENTS.md traceability table maps NIRI-06, NIRI-07, NIRI-10, TEST-01 exactly to Phase 19 with status "Complete" — matching the plan's `requirements` field exactly.

Note on NIRI-07 specifically: the requirement says "PID matching from artifact bag for windows spawned by other integrations." Phase 19's scope is the IPC wrapper layer — the PID field is captured in NiriWindow (enabling Phase 20 to implement the PID-matching logic). The wrapper layer's contribution is satisfied; the consumer-side matching is Phase 20's responsibility.

### Anti-Patterns Found

None detected.

Scan run against `src/lib/niri.ts` and `tests/lib/niri.test.ts`:
- No TODO/FIXME/XXX/HACK/PLACEHOLDER comments
- No `return null` / `return {}` / `return []` stubs (the `return []` values in listNiriWindows/listNiriWorkspaces are guarded by explicit error conditions, not unconditional stubs)
- No hardcoded empty data flowing to user-visible output
- No console.log-only implementations

### Human Verification Required

None. All truths verified programmatically:
- Test execution confirmed (26/26 passing)
- TypeScript type check confirmed (tsc --noEmit exits 0)
- Full regression suite confirmed (425/425 passing)
- Export presence confirmed via grep
- Key links confirmed via source inspection

### Test Run Results

```
bun test tests/lib/niri.test.ts
  26 pass, 0 fail
  86 expect() calls
  170ms

bun test tests/
  425 pass, 0 fail
  23 snapshots, 962 expect() calls

bun run typecheck
  Exit 0 (no errors)
```

### Summary

Phase 19 fully achieves its goal. All 11 must-haves are verified:

- `src/lib/niri.ts` exists with 8 complete, non-stub async functions. Every niri msg IPC call routes through the single `_exec.run` indirection point, making the entire module testable by replacing one object property.
- `tests/lib/niri.test.ts` has 26 unit tests covering all 8 functions. Tests manipulate NIRI_SOCKET only within the `isNiriRunning` describe block with proper before/after cleanup. No test touches the real niri binary.
- The `NiriCommands` interface is exported and structurally verified at runtime in the NiriCommands interface describe block. Phase 20 can use `mock.module("@/lib/niri", ...)` with type-safe mock objects.
- Zod schemas use `.nullable().optional()` on all Rust `Option<T>` fields as required, preventing parse failures when niri serializes None as JSON null.
- All 4 requirement IDs (NIRI-06, NIRI-07, NIRI-10, TEST-01) from the PLAN frontmatter are accounted for in REQUIREMENTS.md and verified as satisfied.

---

_Verified: 2026-03-22_
_Verifier: Claude (gsd-verifier)_
