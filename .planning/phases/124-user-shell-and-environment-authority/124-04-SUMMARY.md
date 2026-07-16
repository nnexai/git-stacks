---
phase: 124-user-shell-and-environment-authority
plan: "04"
subsystem: service
tags: [user-shell, terminal, pty, environment, secrets]

requires:
  - phase: 124-01
    provides: validated user-shell discovery, bootstrap, environment composition, and process-group execution
  - phase: 124-03
    provides: atomic volatile PATH and SSH_AUTH_SOCK refresh authority
  - phase: 124-06
    provides: redacted shell diagnostics and launch-context fixtures
provides:
  - Strict bounded protocol contract for interactive launches and ordered command-terminal steps
  - Launch-time secret and volatile-environment resolution without snapshot revision churn
  - One-logical-terminal sequential adapter execution with exact exit, cancellation, and diagnostic behavior
affects: [124-05, service-terminals, web-terminal, agent-terminal]

tech-stack:
  added: []
  patterns: [typed terminal launch union, per-launch authority reads, virtual command PTY]

key-files:
  created: [tests/lib/agent-terminal-session.test.ts]
  modified:
    - packages/protocol/src/service.ts
    - packages/service/src/main.ts
    - packages/service/src/policy/snapshot.ts
    - packages/service/src/web/terminal-manager.ts
    - tests/lib/service/contract.test.ts
    - tests/lib/service/launch-context.test.ts
    - tests/lib/service/snapshot.test.ts
    - tests/service/web-terminal.test.ts

key-decisions:
  - "Model interactive PTY and command-terminal launches as a strict discriminated union so command steps cannot be reparsed as PTY argv."
  - "Resolve secrets, PATH, and SSH_AUTH_SOCK immediately before every launch; retain only stable redacted metadata in snapshots."
  - "Represent a command terminal as a virtual PTY facade whose single abort controller delegates all process-tree ownership to the shared user-shell adapter."

patterns-established:
  - "Ordered command steps remain separate typed adapter calls inside one logical terminal session."
  - "Launch authorities are getters, not cached values, and current workspace/config environment retains precedence over refreshed inherited values."

requirements-completed: [SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-05, SHELL-06, SHELL-07]

coverage:
  - id: D1
    description: "Service launch contracts distinguish validated interactive PTYs from strict bounded ordered command steps."
    requirement: SHELL-01
    verification:
      - kind: integration
        ref: "tests/lib/service/contract.test.ts#PHASE124_RED terminal steps SSH rotation contract"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every command launch resolves current secrets, PATH, and SSH_AUTH_SOCK without changing snapshot content or revision."
    requirement: SHELL-03
    verification:
      - kind: integration
        ref: "tests/lib/service/snapshot.test.ts#resolves secrets and volatile shell inputs for each launch without changing the snapshot"
        status: pass
      - kind: integration
        ref: "tests/lib/service/launch-context.test.ts#PHASE124_RED terminal steps SSH rotation contract"
        status: pass
    human_judgment: false
  - id: D3
    description: "One command-terminal identity runs typed steps separately and stops on the exact failing step and exit code."
    requirement: SHELL-05
    verification:
      - kind: integration
        ref: "tests/service/web-terminal.test.ts#runs typed command steps separately in one logical terminal and stops on the exact failing step"
        status: pass
    human_judgment: false
  - id: D4
    description: "Command-terminal cancellation aborts adapter-owned process-group cleanup and emits safe structured diagnostics."
    requirement: SHELL-07
    verification:
      - kind: integration
        ref: "tests/service/web-terminal.test.ts#cancels the active command-step adapter and reports safe cancellation metadata"
        status: pass
      - kind: integration
        ref: "tests/service/managed-service-process.test.ts"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-07-16
status: complete
---

# Phase 124 Plan 04: Service Shell and Terminal Launch Summary

**Typed service launches now share validated shell and live environment authorities while preserving normal PTYs and separately executing every command step inside one logical terminal.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-16T13:20:10+02:00
- **Completed:** 2026-07-16T13:30:08+02:00
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Removed snapshot command serialization and `/bin/sh -lc` launch generation in favor of strict typed launch steps with bounded commands, working directories, overlays, and step counts.
- Re-read current secrets and volatile PATH/SSH_AUTH_SOCK for each terminal launch without placing those values in stable projections or revisions.
- Added terminal-manager-owned sequential adapter execution with one terminal identity, per-step cwd/environment, exact nonzero short-circuiting, adapter cancellation, and safe diagnostics.
- Preserved ordinary PTY spawn, resize, reconnect, ownership, and presentation behavior while selecting the same validated interactive-login shell family.

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm Wave 0 service launch and typed terminal-step behavior** - `aa41b276` (test)
2. **Task 2: Migrate snapshot and managed non-PTY execution** - `e6369176` (feat)
3. **Task 3: Add typed terminal steps and a terminal-manager sequential runner** - `e1f043c1` (feat)
4. **Task 3 follow-up: Prove launch rotation, diagnostics, and cancellation** - `8553de98` (test)

## Files Created/Modified

- `packages/protocol/src/service.ts` - Defines bounded launch environment and step schemas plus the interactive/command launch union.
- `packages/service/src/main.ts` - Wires live dynamic and shell environment getters into the snapshot builder.
- `packages/service/src/policy/snapshot.ts` - Resolves current secrets and volatile environment into typed launch steps or validated PTY argv.
- `packages/service/src/web/terminal-manager.ts` - Runs command steps sequentially through the shared adapter behind one virtual terminal process.
- `tests/lib/agent-terminal-session.test.ts` - Proves agent wrapper PATH composition uses the effective refreshed launch PATH.
- `tests/lib/service/contract.test.ts` - Covers strict protocol parsing and step bounds.
- `tests/lib/service/launch-context.test.ts` - Covers typed launch context and launch-time secret resolution.
- `tests/lib/service/snapshot.test.ts` - Covers separate steps, projection stability, and A-to-B secret/PATH/SSH rotation.
- `tests/service/web-terminal.test.ts` - Covers ordered step execution, exact failure, cancellation, diagnostics, and unchanged PTY lifecycle.

## Decisions Made

- Interactive terminals remain native PTYs. Command terminals use a small PTY-compatible facade only to preserve the existing terminal ownership, replay, and lifecycle APIs while execution remains adapter-owned.
- The existing agent terminal wrapper required no production rewrite: it already accepts the effective launch environment. The added regression test locks the refreshed-PATH composition boundary.
- Nonzero adapter results emit their metadata-only structured diagnostic before preserving the exact command exit code.

## Deviations from Plan

None - plan executed as specified. The extra Task 3 proof commit strengthens explicit refresh, secret, diagnostic, and cancellation criteria without widening scope.

## Issues Encountered

None.

## Verification

- `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/lib/service/snapshot.test.ts tests/lib/service/contract.test.ts tests/lib/service/launch-context.test.ts tests/service/managed-service-process.test.ts tests/service/web-terminal.test.ts tests/lib/agent-terminal-session.test.ts` - 6 files, 54 tests passed.
- `npm run typecheck` - all workspaces passed.
- `npm run test:deps` - package architecture passed.
- Stub-marker scan across changed production and test files - no matches.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 124-05 can consume the strict service terminal contract and live launch authorities for hosted client shell acceptance. No Plan 124-04 blockers remain.

---
*Phase: 124-user-shell-and-environment-authority*
*Completed: 2026-07-16*
