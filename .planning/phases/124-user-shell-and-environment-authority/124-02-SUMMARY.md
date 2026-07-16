---
phase: 124-user-shell-and-environment-authority
plan: "02"
subsystem: core-cli
tags: [shell, lifecycle, workspace-command, cli, process-groups]

requires:
  - phase: 124-user-shell-and-environment-authority
    plan: "01"
    provides: Validated Bash/zsh/fish discovery, exact-command bootstrap, post-init overlays, and owned process groups
provides:
  - Adapter-backed injectable lifecycle execution shared by global and workspace lifecycle hooks
  - Independent pre/main/post and repository command execution with cancellation propagation
  - Daemonless CLI run, all-repos, parallel, JSON, and interactive shell routing through shared shell authority
  - Actionable non-disclosing discovery and initialization diagnostics in CLI output
affects: [124-04, lifecycle-hooks, manual-commands, cli-run, service-launch-resolution]

tech-stack:
  added: []
  patterns: [adapter-backed executor seam, one-command-per-spawn, safe diagnostic rendering, concurrent captured settlement]

key-files:
  created: []
  modified:
    - packages/core/src/lifecycle.ts
    - packages/core/src/workspace-lifecycle.ts
    - packages/core/src/workspace-command.ts
    - packages/cli/src/commands/workspace.ts
    - tests/lib/lifecycle.test.ts
    - tests/lib/workspace-lifecycle.test.ts
    - tests/commands/run-parallel.test.ts

key-decisions:
  - "Retain the mutable lifecycle spawn seam but change its authority from shell argv construction to one exact command delegated to executeUserShellCommand."
  - "Share executor-parameterized hook runners with workspace lifecycle instead of keeping a duplicated shell implementation."
  - "Return structured CLI capture records for parallel modes and render only shell, mode, stage, message, and recovery on adapter failure."

patterns-established:
  - "Lifecycle isolation: every hook or command is an independent adapter call with its own cwd, overlay, result, and cancellation signal."
  - "Captured execution settlement: stdout, stderr, and exit/rejection are awaited together so adapter failures cannot leave an unobserved rejection."

requirements-completed:
  - SHELL-01
  - SHELL-02
  - SHELL-03
  - SHELL-04
  - SHELL-06
  - SHELL-07

coverage:
  - id: D1
    description: "Global and workspace lifecycle hooks delegate exact independent commands through the shared adapter-backed executor while retaining capture and first-failure behavior."
    requirement: SHELL-01
    verification:
      - kind: unit
        ref: "tests/lib/lifecycle.test.ts and tests/lib/workspace-lifecycle.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Workspace pre, main, post, and repository commands preserve planning order, cwd/environment isolation, output tagging, and first nonzero exit."
    requirement: SHELL-03
    verification:
      - kind: unit
        ref: "tests/lib/workspace-command.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "CLI run and parallel modes use initialized user-shell execution while preserving per-repository output and exit aggregation."
    requirement: SHELL-02
    verification:
      - kind: integration
        ref: "tests/commands/run-parallel.test.ts and tests/commands/workspace-execution-context.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Invalid shell selection executes no command and returns actionable metadata without environment disclosure."
    requirement: SHELL-07
    verification:
      - kind: integration
        ref: "tests/commands/run-parallel.test.ts#invalid SHELL reports actionable non-disclosing diagnostics and executes no command"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-07-16
status: complete
---

# Phase 124 Plan 02: Core and CLI Shell Consumer Migration Summary

**Lifecycle hooks, configured workspace commands, and daemonless CLI run paths now share one validated user-shell authority without legacy `sh` execution branches.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-16T11:18:12Z
- **Completed:** 2026-07-16T11:25:04Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Replaced lifecycle shell argv construction with an adapter-backed injectable executor that preserves inherited output modes while keeping initialization diagnostics separate.
- Removed workspace lifecycle's duplicated hook runner and reused executor-parameterized global lifecycle behavior for every workspace/repository hook.
- Preserved independent ordered pre/main/post and repository command calls, exact nonzero status, output step tagging, and optional cancellation propagation.
- Migrated CLI run, all-repos, parallel JSON/human, and interactive shell modes to shared discovery/bootstrap/execution contracts with workspace/repository authority overlays.
- Added executable invalid-shell coverage proving no command runs and diagnostics expose recovery metadata without environment values.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock consumer migration with the exact RED sentinel** - `b708a22f` (test)
2. **Task 2: Migrate lifecycle and workspace command authorities** - `7be161fd` (feat)
3. **Task 3: Migrate CLI run and parallel execution** - `c39bb397` (feat)
4. **Task 3 follow-up: Settle captured output and adapter exit together** - `1df348af` (fix)

**Plan metadata:** committed separately with this summary.

## Verification

- Initial RED meta-gate: 52 tests passed, two legacy consumer assertions failed with exact `PHASE124_RED migrated shell consumers` text.
- `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/lib/lifecycle.test.ts tests/lib/workspace-lifecycle.test.ts tests/lib/workspace-command.test.ts tests/commands/run-parallel.test.ts tests/commands/workspace-execution-context.test.ts` — 5 files, 55 tests passed.
- `npm run typecheck` — protocol, client, core, CLI, service, web, and TUI workspace typechecks passed.
- Static touched-consumer scan found no direct `sh -c`, `/bin/sh -c`, or `process.env.SHELL || sh` branch.

## Decisions Made

- Preserved `_exec.spawn` as the mutation seam relied on by lifecycle tests, but narrowed its request to a single command string; the production implementation alone owns adapter selection and process lifecycle.
- Used the existing workspace environment builders as post-initialization overlays, adding repository authority independently for each repo invocation.
- Kept interactive CLI shells on the adapter's PTY launch plan while one-shot commands use the readiness-bounded execution API.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added exact RED sentinel text to integrated Wave 0 assertions**
- **Found during:** Task 1
- **Issue:** Existing tests correctly failed on both legacy authorities but did not emit the plan-required exact sentinel.
- **Fix:** Added the exact sentinel to lifecycle and CLI assertion messages before implementation.
- **Files modified:** `tests/lib/lifecycle.test.ts`, `tests/commands/run-parallel.test.ts`
- **Verification:** The strict RED meta-gate passed with only the two intended legacy failures.
- **Committed in:** `b708a22f`

**2. [Rule 1 - Bug] Await captured streams and adapter exit as one settlement**
- **Found during:** Overall verification
- **Issue:** An initialization rejection could reject stream readers before the separate exit promise was observed.
- **Fix:** Await stdout, stderr, and exit/rejection concurrently in captured hook and command execution.
- **Files modified:** `packages/core/src/lifecycle.ts`
- **Verification:** All 55 focused tests and all workspace typechecks passed.
- **Committed in:** `1df348af`

**3. [Rule 3 - Blocking] Built and resolved workspace packages locally for isolated CLI verification**
- **Found during:** Task 3 verification
- **Issue:** The isolated worktree lacked installed artifacts, and a root `node_modules` symlink resolved workspace package links back to the main checkout.
- **Fix:** Created a verification-only dependency overlay whose `@git-stacks/*` links target this worktree, built local ignored distributions, then removed the overlay before commits.
- **Files modified:** None tracked.
- **Verification:** Built CLI integration suites passed against this worktree's core and CLI distributions.
- **Committed in:** No repository change required.

---

**Total deviations:** 3 auto-fixed (1 missing critical contract, 1 execution bug, 1 blocking verification setup).
**Impact on plan:** Changes strengthened failure handling and enabled isolated verification without expanding production scope or committing artifacts.

## Issues Encountered

None remaining.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 can reuse the same adapter diagnostics and environment overlays for service-owned non-PTY commands and PTYs.
- Real hosted Bash/zsh/fish and service-through-SSH-agent coverage remains later Phase 124/127 work; this plan proves the core and daemonless CLI consumer boundary.
- No release metadata, tag, push, publish, or release action was touched.

## Self-Check: PASSED

- All touched consumer sources are free of direct legacy shell selection.
- Focused lifecycle/workspace-command/CLI suites and all workspace typechecks pass.
- Worktree contains only the committed plan changes and summary.

---
*Phase: 124-user-shell-and-environment-authority*
*Completed: 2026-07-16*
