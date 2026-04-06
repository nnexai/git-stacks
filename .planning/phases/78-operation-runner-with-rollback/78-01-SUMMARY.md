---
phase: 78-operation-runner-with-rollback
plan: 01
subsystem: infra
tags: [rollback, compensation, lifo, runner, error-handling]

# Dependency graph
requires:
  - phase: 75-debug-mode-and-di-seams
    provides: workspace-git._exec and lifecycle._exec spawn seams that downstream Plan 02 tests will use to inject failures into runner step closures
provides:
  - createRunner factory exposing imperative do/result API for LIFO rollback
  - Reusable Runner type and RunnerResult discriminated union
  - Reuse of existing ProgressCallback type from workspace-ops (no new channel)
  - Pure unit-test coverage that needs no filesystem, git, or seams
affects: [78-02-PLAN.md, 78-03-PLAN.md, workspace-lifecycle.ts, createWorkspace]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "imperative compensation-stack runner (do/result, no declarative step list)"
    - "forward-then-push: undo registered only after forward succeeds"
    - "best-effort LIFO unwind with per-undo try/catch"
    - "discriminated-union RunnerResult collected via result() rather than per-do return values"
    - "rollback progress and rollback errors mirror through a single onProgress callback"

key-files:
  created:
    - src/lib/operation-runner.ts
    - tests/lib/operation-runner.test.ts
  modified: []

key-decisions:
  - "result() is the single source of truth for the discriminated union — do() only manages the stack and rolls back on throw, then re-throws so callers structure work as a normal try/catch"
  - "Internal Step type is { name; undo } — forward closures are not retained after they succeed (no need)"
  - "rollbackErrors entries duplicate the strings sent through onProgress (D-16) so programmatic callers do not have to re-parse stdout"
  - "Empty constructor + zero do() calls returns ok:true (no explicit commit method needed)"

patterns-established:
  - "Compensation primitive: callers register (name, forward, undo) triples imperatively; runner owns LIFO unwind"
  - "Single onProgress channel reused for both runner-emitted rollback messages and caller-emitted forward messages"
  - "No new _exec test seam — runner is pure control flow over caller-supplied closures"

requirements-completed: [ENGN-01, ENGN-02, ENGN-03]

# Metrics
duration: 4min
completed: 2026-04-06
---

# Phase 78 Plan 01: Operation Runner Primitive Summary

**Generic LIFO compensation-stack runner (`createRunner`) replacing the hand-rolled rollback at `App.tsx:883-911` with a reusable primitive — pure module, no filesystem/git, fully unit-tested via inline closures.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-06T17:37:10Z
- **Completed:** 2026-04-06T17:41:11Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- Authored `src/lib/operation-runner.ts` exporting `createRunner`, `Runner`, `RunnerResult`
- 13 pure unit tests covering happy path, LIFO rollback, multi-undo failures, message routing, optional onProgress, empty stack, closure support
- Both `bun run typecheck` and the full `bun run test` suite (unit + 48/48 integration) green after the new file landed

## Public API

```typescript
import type { ProgressCallback } from "./workspace-ops"

export type RunnerResult =
  | { ok: true }
  | { ok: false; error: string; rollbackErrors: string[] }

export type Runner = {
  do(name: string, forward: () => Promise<void>, undo: () => Promise<void>): Promise<void>
  result(): RunnerResult
}

export function createRunner(onProgress?: ProgressCallback): Runner
```

Internal state (Claude's discretion per CONTEXT.md):

```typescript
type Step = { name: string; undo: () => Promise<void> }
const stack: Step[] = []
let forwardError: string | null = null
const rollbackErrors: string[] = []
```

## The Four Properties of the Proto-Rollback (Reproduced Exactly)

1. **Forward-then-push** — `stack.push({ name, undo })` only runs *after* `await forward()` succeeds. A failing forward never registers its own undo, so rollback can never invoke an undo for work that was not actually performed.
2. **LIFO unwind** — `rollback()` pops the stack tail-to-head via `while (stack.length > 0) stack.pop()`, mirroring the order in which forwards succeeded.
3. **Per-undo try/catch** — each `await step.undo()` is wrapped in its own try/catch. A failing undo records a `Rollback error: …` message and continues popping.
4. **No commit on failure** — runner re-throws the original forward error from `do()`, so the caller's outer try/catch fires before any downstream "commit" step (e.g. writing workspace YAML) runs. `result()` then surfaces `{ ok: false, error, rollbackErrors }`.

## Decisions Implemented

| Decision | Where in `operation-runner.ts` |
|----------|-------------------------------|
| **D-04** Imperative `runner.do(name, forward, undo)` API; forward runs immediately, undo pushed after success | `do(...)` body, lines 89-105 |
| **D-05** On forward throw, `rollback()` pops in reverse with per-undo try/catch | `rollback()` helper, lines 70-86 |
| **D-06** Discriminated-union `RunnerResult`; runner never throws for expected failures | `RunnerResult` type (lines 34-36) + `result()` (lines 107-116) |
| **D-07** Reuses existing `ProgressCallback` from `workspace-ops.ts` — no new channel | `import type { ProgressCallback } from "./workspace-ops"` (line 32) |
| **D-14** Rollback messages flow through `onProgress`, not stderr | `onProgress?.(...)` calls in `rollback()`; zero `console.*`/`process.stderr` references |
| **D-15** Message prefixes: `"Rollback: {name}"` and `"Rollback error: {name} failed ({err})"` | Lines 74, 79 |
| **D-16** `rollbackErrors[]` mirrors the streamed undo-failure strings | Lines 80-82 (push to array AND emit through onProgress) |
| **D-17** `result.error` is always the original forward error (never replaced by rollback content) | `forwardError = err.message` captured before `rollback()`; `result()` returns it verbatim |

## Test Coverage Matrix

| Behavior / Decision | Test |
|---------------------|------|
| Happy path, no rollback (Test 1) | `runs forwards in order, never invokes undos, returns ok:true` |
| Closures over earlier-step values (Test 8, justifies D-04 imperative API) | `supports closures over earlier-step values (imperative API per D-04)` |
| LIFO undo order on forward failure (Test 2 → D-05) | `undos run in reverse order when a forward throws` |
| Failing step's own undo never invoked (D-04 forward-then-push) | `never invokes the failing step's own undo (it was never pushed)` |
| Forward error preserved verbatim (Test 5 → D-17) | `preserves the forward error verbatim in result.error (D-17)` |
| Best-effort: single failing undo doesn't abort the rest (Test 3 → ENGN-03) | `a single failing undo does not abort remaining undos` |
| Multiple failing undos all collected (Test 4 → D-06, ENGN-03) | `multiple failing undos are all collected in rollbackErrors` |
| Exact format of `Rollback error: <name> failed (...)` (D-15) | `rollbackErrors strings match the 'Rollback error: <name> failed (...)' format` |
| `Rollback: ` prefix on rollback messages (D-15) | `rollback messages flow through onProgress with 'Rollback: ' prefix` |
| `Rollback error: ` prefix on undo-failure messages (D-15) | `undo failure messages flow through onProgress with 'Rollback error: ' prefix` |
| `rollbackErrors[]` mirrors `onProgress` stream (D-16) | `rollbackErrors array mirrors the streamed undo-failure messages (D-16)` |
| Optional onProgress (Test 6) | `onProgress is optional — runner does not throw when omitted` |
| Empty stack (Test 7) | `constructing a runner and never calling do is harmless and returns ok` |

13 tests, 46 expect() calls, 199ms runtime.

## Task Commits

1. **Task 1: Author `src/lib/operation-runner.ts`** — `0c27fc52` (feat)
2. **Task 2: Author `tests/lib/operation-runner.test.ts`** — `1cd56cb4` (test)

## Files Created/Modified

- `src/lib/operation-runner.ts` — generic LIFO compensation-stack runner (118 lines)
- `tests/lib/operation-runner.test.ts` — 13 pure unit tests (476 lines)

## Decisions Made

- **Single source of truth for discriminated union is `result()`, not `do()`** — `do()` only manages the stack and re-throws on forward failure, so callers can structure orchestration as a normal try/catch and call `result()` once at the end. This avoids forcing every caller to check a per-step return value, which is exactly the verbosity the runner exists to eliminate.
- **Internal `Step` type stores only `{ name, undo }`** — the forward closure is discarded the moment it returns successfully because the runner has no reason to retain it. Keeps memory minimal even on long-running orchestrations.
- **Empty stack is a no-op** — constructing a runner and never calling `do()` returns `{ ok: true }`, and rollback over an empty stack is a no-op while-loop. No explicit "commit" method.

## Deviations from Plan

### Plan-text adjustment

**1. [Rule 3 — Blocking] Reworded doc-comment to satisfy literal `_exec` grep**

- **Found during:** Task 1 (author runner)
- **Issue:** Plan acceptance criterion `grep -n "_exec" src/lib/operation-runner.ts returns ZERO matches` would fail because the doc comment cited `workspace-git._exec` and `lifecycle._exec` as the existing seams the runner *deliberately* does not duplicate. The literal grep makes no exception for documentation references.
- **Fix:** Replaced the cross-references with a paraphrase ("the existing Phase 75 spawn seams in workspace-git and lifecycle") that preserves the architectural intent without including the literal `_exec` token.
- **Files modified:** `src/lib/operation-runner.ts` (doc comment only)
- **Verification:** `grep -n "_exec"` now returns zero matches; `bun run typecheck` still green.
- **Committed in:** `0c27fc52` (folded into Task 1's single commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking acceptance criterion).
**Impact on plan:** None substantive. Documentation wording change only; runner behavior, exports, and test coverage match the plan exactly.

## Issues Encountered

- The project's `bun run test <file>` script (`scripts/test-runner.ts`) ignores file-path arguments and runs the full classified suite — file-path arg is silently dropped because the script only checks `--unit`/`--integ`/`--all`. Worked around for fast iteration by invoking `bun test tests/lib/operation-runner.test.ts` directly (the canonical bun:test single-file invocation, mock-pollution-safe because this file uses zero `mock.module` calls). Final verification was the full `bun run test` run, which the new file passed cleanly.

## Threat Flags

None. Plan 78-01 introduces no new network endpoints, auth paths, file access, or schema changes. The runner is a pure in-process control-flow primitive whose entire surface is covered by the plan's `<threat_model>` register (T-78-01..T-78-05 all in scope).

## User Setup Required

None — pure source addition, no external services.

## Next Phase Readiness

- Plan 78-02 can now `import { createRunner } from "./operation-runner"` inside `workspace-lifecycle.ts` and wrap the per-repo worktree creation loop in a runner orchestration.
- The 13-test contract documents the runner's behavior precisely enough that any future change that deviates from D-04..D-17 will break a named test.
- No follow-up work or blockers remain inside Plan 01's scope.

## Self-Check: PASSED

- `src/lib/operation-runner.ts` — FOUND
- `tests/lib/operation-runner.test.ts` — FOUND
- Commit `0c27fc52` (Task 1) — FOUND
- Commit `1cd56cb4` (Task 2) — FOUND
- `bun run typecheck` — exits 0
- `bun test tests/lib/operation-runner.test.ts` — 13 pass, 0 fail
- `bun run test` (full suite) — Unit PASS, Integration 48/48 PASS

---
*Phase: 78-operation-runner-with-rollback*
*Completed: 2026-04-06*
