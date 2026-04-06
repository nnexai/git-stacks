---
phase: 78-operation-runner-with-rollback
verified: 2026-04-06T18:30:00Z
status: passed
score: 11/11 must-haves verified
---

# Phase 78: Operation Runner with Rollback Verification Report

**Phase Goal:** Wrap workspace creation in a generic LIFO compensation-stack runner so any failure rewinds prior tracked side effects in reverse order, with each undo wrapped in its own try/catch (best-effort). Migrate both call sites to share the new primitive.

**Verified:** 2026-04-06T18:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths derived from ROADMAP §Phase 78 success criteria + the merged `must_haves.truths` from all three plan frontmatters.

| #   | Truth                                                                                                                                              | Status     | Evidence                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SC1: When workspace creation fails mid-way, already-created worktrees are removed and the workspace YAML is not written                            | VERIFIED   | `tests/lib/workspace-lifecycle-create.test.ts:181` "rolls back created worktrees in LIFO order and never writes YAML" — asserts `removeWorktreeMock` called 1x for repo A, `writeWorkspaceMock` called 0x. `workspace-lifecycle.ts:803-810` writeWorkspace gated on `runner.result().ok`. |
| 2   | SC2: Rollback steps emit progress through onProgress with `Rollback: ` prefix (D-14/D-15, no stderr — OpenTUI safety)                              | VERIFIED   | `operation-runner.ts:74` emits `Rollback: ${step.name}`; test "rollback messages flow through onProgress with 'Rollback: ' prefix" passes. Zero `console.error`/`process.stderr` matches in `operation-runner.ts` and `workspace-lifecycle.ts`. |
| 3   | SC3: If a rollback step fails, the error is captured in `rollbackErrors[]` and surfaced via onProgress; remaining rollback steps continue           | VERIFIED   | `operation-runner.ts:75-84` per-undo try/catch pushes to `rollbackErrors` AND emits via `onProgress?.(message)`. Test "continues remaining undos when one undo throws" verifies `removeWorktreeMock` called 2x and `rollbackErrors[]` populated. |
| 4   | A caller can register forward/undo step pairs with forward steps executing immediately                                                              | VERIFIED   | `operation-runner.ts:88-105` `do(name, forward, undo)` awaits forward immediately; tests Test 1 + Test 8 (closures) pass. |
| 5   | When an individual undo throws, the runner continues executing remaining undos (best-effort, ENGN-03)                                               | VERIFIED   | `operation-runner.ts:75-84` while-loop continues regardless of caught undo errors. Tests "single failing undo does not abort remaining undos" + "multiple failing undos all collected" pass (13 unit tests, 46 expect calls). |
| 6   | Original forward error preserved verbatim in returned error field (D-17)                                                                            | VERIFIED   | `operation-runner.ts:96-98` captures `forwardError` BEFORE rollback runs; `result()` returns it untouched (lines 107-116). Test "preserves the forward error verbatim in result.error (D-17)" passes. Plan 02 test asserts `result.error` contains `simulated B failure`. |
| 7   | createWorkspace() executes the D-12 ordering (pre_create → worktrees → upstream → per-repo files → ws files → env files → post_create → write → integration) | VERIFIED   | `workspace-lifecycle.ts` lines 671-824: pre_create (672-676), worktrees (679-693), ensureUpstreamTracking (697-705), per-repo file ops (708-723), workspace file ops (726-745), env files (748-760), post_create (767-771), writeWorkspace (810), runIntegrationGenerate (818). |
| 8   | Hooks run inside try block but are NOT pushed onto compensation stack (D-09); their failure triggers rollback via Approach A synthetic do()         | VERIFIED   | `workspace-lifecycle.ts:672-676,767-771` hooks called outside `runner.do()`; lines 790-799 synthetic do() in catch when `inHookPhase=true`. Test "rolls back all tracked steps when post_create hook throws" passes (removeWorktreeMock called 2x in LIFO b→a). |
| 9   | runIntegrationGenerate runs AFTER writeWorkspace (D-11) and is never rolled back; failures routed through onProgress                                | VERIFIED   | `workspace-lifecycle.ts:810` writeWorkspace then 818 runIntegrationGenerate inside try/catch with `onProgress?.(...)` only. Test "returns ok:true even when runIntegrationGenerate throws" passes — `result.ok===true`, `removeWorktreeMock` not called. |
| 10  | Both wizard and dashboard call sites delegate to shared createWorkspace(); CONCERNS.md:51-55 dashboard duplication is RESOLVED                      | VERIFIED   | `workspace-wizard.ts:26` and `dashboard/App.tsx:38` both import `createWorkspace` from `../lib/workspace-lifecycle`. `App.tsx:900` and `workspace-wizard.ts:464` both call `await createWorkspace(...)`. CONCERNS.md:51 marked `RESOLVED (Phase 78)`. Hand-rolled `createdWorktrees` array gone from App.tsx (zero matches). |
| 11  | workspace-ops.ts public facade unchanged (D-03); createWorkspace NOT re-exported through it                                                          | VERIFIED   | `grep "createWorkspace" src/lib/workspace-ops.ts` returns zero matches. Test "createWorkspace is NOT exported from workspace-ops.ts" passes. |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact                                          | Expected                                                              | Status     | Details                                                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/operation-runner.ts`                     | createRunner factory + Runner type + RunnerResult discriminated union | VERIFIED   | 119 lines; exports `createRunner`, `Runner`, `RunnerResult` (lines 34, 38, 65). Imports `ProgressCallback` from `./workspace-ops` (line 32). Zero stderr writes. |
| `tests/lib/operation-runner.test.ts`              | Unit tests for happy path, rollback, undo failures, message routing   | VERIFIED   | 476 lines, 13 tests, 46 expect calls; runs in 216ms. Zero `mock.module` calls (pure tests).                                                              |
| `src/lib/workspace-lifecycle.ts`                  | createWorkspace(inputs, onProgress?) wired to runner with D-12 order  | VERIFIED   | New function at lines 615-828 (~258 LOC appended); imports `createRunner` from `./operation-runner` (line 33); existing clean/close/merge/remove untouched. |
| `tests/lib/workspace-lifecycle-create.test.ts`    | Integration tests forcing failures via Phase 75 _exec seams           | VERIFIED   | 328 lines, 7 tests, 33 expect calls; runs in 280ms. Uses `mock.module(@/lib/git)` and `_exec.spawn` injection.                                          |
| `src/tui/workspace-wizard.ts`                     | Wizard creation flow delegating to createWorkspace()                  | VERIFIED   | Line 26 imports `createWorkspace` from `../lib/workspace-lifecycle`; line 464 awaits `createWorkspace(...)`. Net -127 LOC vs pre-migration.              |
| `src/tui/dashboard/App.tsx`                       | Dashboard creation flow delegating to createWorkspace()               | VERIFIED   | Line 38 imports `createWorkspace` from `../../lib/workspace-lifecycle`; line 900 awaits `createWorkspace(...)`. Hand-rolled rollback gone. Net -50 LOC. |

### Key Link Verification

| From                                              | To                                                          | Via                                  | Status   | Details                                                                             |
| ------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------ | -------- | ----------------------------------------------------------------------------------- |
| `src/lib/operation-runner.ts`                     | `src/lib/workspace-ops.ts (ProgressCallback)`                | type re-import                       | WIRED    | Line 32: `import type { ProgressCallback } from "./workspace-ops"`                  |
| `src/lib/workspace-lifecycle.ts`                  | `src/lib/operation-runner.ts`                                | createRunner import                  | WIRED    | Line 33: `import { createRunner, type RunnerResult } from "./operation-runner"`. Used at line 660: `const runner = createRunner(onProgress)`. |
| `src/lib/workspace-lifecycle.ts`                  | `src/lib/git.ts (createWorktree, removeWorktree)`            | forward/undo step closures           | WIRED    | Line 17-22 imports; lines 684, 690 use them inside `runner.do()` forward/undo pairs. |
| `src/lib/workspace-lifecycle.ts`                  | `src/lib/config.ts (writeWorkspace)`                         | commit point AFTER runner            | WIRED    | Line 10 import; line 810 single call site, gated on `runner.result().ok`.            |
| `src/tui/workspace-wizard.ts`                     | `src/lib/workspace-lifecycle.ts (createWorkspace)`           | direct import                        | WIRED    | Line 26 import; line 464 invocation with assembled inputs and `(msg) => p.log.info(msg)` callback. |
| `src/tui/dashboard/App.tsx`                       | `src/lib/workspace-lifecycle.ts (createWorkspace)`           | direct import                        | WIRED    | Line 38 import; line 900 invocation with assembled inputs and `handleProgress` regex parser callback. |
| `tests/lib/operation-runner.test.ts`              | `src/lib/operation-runner.ts`                                | createRunner import                  | WIRED    | Line 2: `import { createRunner } from "@/lib/operation-runner"` (test alias).        |
| `tests/lib/workspace-lifecycle-create.test.ts`    | `src/lib/workspace-lifecycle.ts (createWorkspace + _exec)`   | dynamic import after mock setup      | WIRED    | Line 109: `const { createWorkspace, _exec } = await import("@/lib/workspace-lifecycle")`. _exec.spawn replaced for hook injection. |

### Data-Flow Trace (Level 4)

Phase 78 produces a control-flow primitive and a function call refactor; the dashboard's CreateRow render path is the only artifact with dynamic data flow worth tracing.

| Artifact                                | Data Variable             | Source                                           | Produces Real Data | Status   |
| --------------------------------------- | ------------------------- | ------------------------------------------------ | ------------------ | -------- |
| Dashboard `executeCreateWorkspace`      | `createRows` SolidJS signal | `setCreateRows` updates driven by `handleProgress` regex parser at lines 873-898, fed by `onProgress` callback from `createWorkspace` (lines 683, 685 emit per-repo `Creating worktree for X` / `created worktree for X`; runner emits `Rollback: create worktree X` / `Rollback error: ...`) | YES                | FLOWING  |
| Dashboard failure summary               | `createSummary` signal    | Set from `result.error` + `result.rollbackErrors.length` at lines 922-924. `result` comes from real `createWorkspace` call (line 900). | YES                | FLOWING  |
| Wizard log output                       | `p.log.info(msg)` calls   | Direct callback from `createWorkspace` onProgress at line 479. | YES                | FLOWING  |

All wired artifacts trace to a real data source — no hollow props or static fallbacks.

### Behavioral Spot-Checks

| Behavior                                                               | Command                                                  | Result                                          | Status |
| ---------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- | ------ |
| TypeScript compiles cleanly                                            | `bun run typecheck`                                       | exit 0                                           | PASS   |
| operation-runner unit tests pass                                       | `bun test tests/lib/operation-runner.test.ts`             | 13 pass, 0 fail, 46 expect()                    | PASS   |
| createWorkspace integration tests pass                                 | `bun test tests/lib/workspace-lifecycle-create.test.ts`   | 7 pass, 0 fail, 33 expect()                     | PASS   |
| Full project test suite (unit + integration) green                     | `bun run test`                                            | Unit PASS, Integration 49/49 passed             | PASS   |

### Requirements Coverage

| Requirement | Source Plan(s)        | Description                                                                                            | Status     | Evidence                                                                                                                                                                                                                                            |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ENGN-01     | 78-01, 78-02, 78-03   | Multi-step workspace operations use a compensation stack that rolls back completed steps on failure   | SATISFIED  | `operation-runner.ts` createRunner LIFO stack (Plan 01); `workspace-lifecycle.ts:660-801` wires it into createWorkspace with 4 tracked step categories (Plan 02); both wizard and dashboard delegate to it (Plan 03). Verified by truth #1, #4, #7, #10. |
| ENGN-02     | 78-01, 78-02, 78-03   | Rollback progress is visible to user via the existing onProgress callback                             | SATISFIED  | `operation-runner.ts:74,82` emits `Rollback: ` and `Rollback error: ` through `onProgress?.(...)`. Reuses existing `ProgressCallback` type from workspace-ops. Wizard surfaces via `p.log.info`/`p.log.warn`; dashboard parses via regex. Verified by truth #2. |
| ENGN-03     | 78-01, 78-02, 78-03   | Rollback is best-effort — individual undo failures are logged but do not abort remaining undo steps   | SATISFIED  | `operation-runner.ts:75-84` per-undo try/catch with continued while-loop; `rollbackErrors[]` collects failures and is returned in result. Multiple test scenarios prove all undos run even when some throw. Verified by truth #3, #5. |

All 3 phase requirements satisfied. REQUIREMENTS.md status (`Complete` for ENGN-01/02/03) is correct — Plan 01's premature update is now backstopped by the actual implementation across all 3 plans.

### Anti-Patterns Found

Scanned all phase-modified files (`src/lib/operation-runner.ts`, `src/lib/workspace-lifecycle.ts`, `src/tui/workspace-wizard.ts`, `src/tui/dashboard/App.tsx`, both test files):

| File                                       | Line | Pattern                                                                  | Severity | Impact |
| ------------------------------------------ | ---- | ------------------------------------------------------------------------ | -------- | ------ |
| (none)                                     | -    | No `TODO`/`FIXME`/`XXX`/`HACK` markers introduced                        | -        | -      |
| (none)                                     | -    | No `console.error`/`console.warn`/`process.stderr` in runner or lifecycle (D-14 OpenTUI safety) | -        | -      |
| (none)                                     | -    | No `return null` / `return {}` placeholders in changed code              | -        | -      |
| (none)                                     | -    | No empty handlers (`() => {}`) other than the documented Strategy A no-op undos for file ops/env files (D-08) and the unreachable synthetic-do undo at line 796 — both intentional, commented, and verified by tests | -        | -      |
| (none)                                     | -    | No hardcoded empty data flowing to render targets                        | -        | -      |

The Strategy A no-op undos at workspace-lifecycle.ts:719-721 and 755-758 deliberately rely on the worktree undo to remove the parent directory containing the file artifacts. This is documented in plan 78-02 as Strategy A and the no-op rollback path is not hollow data flow — it is a documented best-effort cleanup that delegates to a sibling undo. Not a stub.

### Human Verification Required

None. The phase delivers a control-flow primitive and a function-call refactor — no new visual surfaces, no real-time external integrations, no UX flows beyond what existed pre-migration. Behavior changes (dashboard now adopts strict-abort semantics for hook/file-op failures, dropping the silent half-commit) are documented in 78-03-SUMMARY and exercised by integration tests.

The "running-hooks" UX status during pre_create hooks is no longer set in the dashboard — this is a documented, accepted minor regression (78-03-SUMMARY lines 144-152). It does not block goal achievement because pre_create hooks are rare and quick, and the regression is in a transient progress display, not in correctness.

### Gaps Summary

No gaps. All 11 must-have truths verified, all 3 ROADMAP success criteria met, all 3 requirement IDs (ENGN-01, ENGN-02, ENGN-03) satisfied by combined implementation across plans 01-03, all key links wired, all artifacts substantive, all spot-check commands green, no anti-patterns introduced.

The phase resolves CONCERNS.md:51-55 "Dashboard Duplicates Workspace Creation Logic" as a side effect of D-02. The dashboard's behavior tightening (strict-abort on hook/file-op failures with full LIFO rollback) is a net safety improvement over the pre-migration silent half-commit.

Plan 01's premature update of REQUIREMENTS.md (marking ENGN-01/02/03 as complete after only the runner primitive shipped) is now retroactively justified — the full implementation across all three plans satisfies the requirements as written.

---

_Verified: 2026-04-06T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
