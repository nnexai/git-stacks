---
phase: 124-user-shell-and-environment-authority
plan: "01"
subsystem: core
tags: [shell, environment, process-groups, bash, zsh, fish]

requires:
  - phase: 124-user-shell-and-environment-authority
    plan: "00"
    provides: Executable RED contracts for shell discovery, command integrity, environment precedence, and cleanup
provides:
  - One validated Bash/zsh/fish discovery and launch-planning authority with no shell substitution
  - Initialization-only 10-second readiness handshake with separate startup diagnostics
  - Non-PTY process-group ownership and TERM/grace/KILL cleanup
  - Deterministic launch-environment composition with reserved GS_* values last
affects: [124-02, 124-03, 124-04, lifecycle, workspace-command, service-terminal]

tech-stack:
  added: []
  patterns: [fixed positional bootstrap, private file handshake, typed shell diagnostics, explicit environment layers]

key-files:
  created:
    - packages/core/src/user-shell.ts
  modified:
    - packages/core/src/node-runtime.ts
    - packages/core/src/workspace-env.ts
    - tests/lib/user-shell-adapter.test.ts
    - tests/lib/workspace-env.test.ts

key-decisions:
  - "Use a fixed adapter bootstrap and carry the unchanged command in exactly one positional argument."
  - "Apply post-initialization overlays through a mode-0600 private asset and gate command start on a readiness/acknowledgement handshake."
  - "Keep process-group isolation independent from generic runtime timeouts so the 10-second limit ends at initialization readiness."

patterns-established:
  - "Shell failure contract: discovery, validation, initialization, execution, cancellation, and cleanup diagnostics retain shell, mode, stage, and recovery context."
  - "Environment authority: inherited then initialized then global/workspace/repository/ports/secrets, with spoofed GS_* discarded and authoritative reserved values applied last."

requirements-completed:
  - SHELL-01
  - SHELL-03
  - SHELL-04
  - SHELL-07

coverage:
  - id: D1
    description: "Only executable absolute Bash, zsh, and fish identities are accepted; absent, relative, missing, non-executable, and unsupported values fail explicitly."
    requirement: SHELL-01
    verification:
      - kind: unit
        ref: "tests/lib/user-shell-adapter.test.ts#discovers only executable absolute Bash, zsh, and fish paths"
        status: pass
    human_judgment: false
  - id: D2
    description: "The fixed bootstrap receives hostile multiline command bytes in one unchanged argv slot and exposes a private 10-second initialization handshake."
    requirement: SHELL-03
    verification:
      - kind: unit
        ref: "tests/lib/user-shell-adapter.test.ts#plans a fixed interactive-login bootstrap with the unchanged command in one argv slot"
        status: pass
    human_judgment: false
  - id: D3
    description: "Initialization timeout terminates the owned group while a ready command receives no runtime timeout."
    requirement: SHELL-07
    verification:
      - kind: unit
        ref: "tests/lib/user-shell-adapter.test.ts initialization-only timeout cases"
        status: pass
    human_judgment: false
  - id: D4
    description: "Launch environment layers have deterministic precedence and reserved workspace/repository identity cannot be spoofed."
    requirement: SHELL-04
    verification:
      - kind: unit
        ref: "tests/lib/workspace-env.test.ts authority-order and reserved-identity cases"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-07-16
status: complete
---

# Phase 124 Plan 01: Shared User Shell Adapter Summary

**Core now owns validated Bash/zsh/fish discovery, exact-command bootstrap planning, initialization-bounded execution, process-tree cleanup, and deterministic environment authority.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-16T11:08:31Z
- **Completed:** 2026-07-16T11:16:26Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Implemented explicit absolute executable discovery for Bash, zsh, and fish with typed, recovery-oriented failures and no alternate shell path.
- Preserved command bytes as one positional argument to fixed Bash/zsh/fish bootstraps; command text and raw environment values never enter generated bootstrap source.
- Added a private readiness/acknowledgement handshake that separates initialization diagnostics, ends the 10-second timer before command execution, and applies mode-0600 environment overlays after profile startup.
- Extended the Node runtime with explicit process-group isolation/signaling and used TERM, a bounded grace interval, then KILL with exit confirmation for non-PTY cleanup.
- Added reusable environment composition in the locked authority order and corrected workspace/repository reserved identity precedence.

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm and refine the integrated RED shell contract** - `c8627b33` (test)
2. **Task 2: Implement shell discovery, bootstrap planning, execution, and process groups** - `28532c48` (feat)
3. **Task 3: Enforce deterministic environment authority and reserved identity** - `d0ef072e` (feat)

**Plan metadata:** committed separately with this summary.

## Verification

- `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/lib/user-shell-adapter.test.ts tests/lib/workspace-env.test.ts tests/lib/node-runtime.test.ts` — 3 files, 18 tests passed.
- `npm run typecheck` — all protocol, client, core, CLI, service, web, and TUI workspace typechecks passed.
- Initial RED run — exact adapter sentinel and reserved workspace identity assertions failed with 14 passing tests and no load/import/syntax errors.

## Decisions Made

- Used a private temporary environment asset rather than command or environment interpolation. The bootstrap receives only private paths and the unchanged command argument.
- Added an acknowledgement barrier after readiness so fast command output cannot be misclassified as initialization diagnostics.
- Kept PTY planning to the validated shell's native interactive-login argv; later PTY integration consumes the same validated plan without inheriting the one-shot bootstrap.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Strengthened Wave 0 adapter coverage before implementation**
- **Found during:** Task 1
- **Issue:** The integrated adapter test pinned exports and source markers but did not directly exercise discovery categories, argv identity, PTY flags, or initialization-only timeout behavior.
- **Fix:** Added deterministic behavioral assertions using fake executable paths, fake time, and injected process handles before creating production source.
- **Files modified:** `tests/lib/user-shell-adapter.test.ts`
- **Verification:** The exact Wave 0 sentinel remained the only adapter failure until implementation, then all nine adapter tests passed.
- **Committed in:** `c8627b33`

**2. [Rule 3 - Blocking] Reused installed dependencies only for isolated-worktree verification**
- **Found during:** Task 1 verification
- **Issue:** The isolated worktree did not contain untracked `node_modules`.
- **Fix:** Temporarily linked the main checkout's installed dependencies, removed the link before every commit, and committed no dependency artifact.
- **Files modified:** None.
- **Verification:** Final focused tests and all workspace typechecks passed from the isolated worktree.
- **Committed in:** No repository change required.

---

**Total deviations:** 2 auto-fixed (1 missing critical coverage, 1 blocking environment issue).
**Impact on plan:** Both changes strengthened or enabled the planned verification without expanding production scope.

## Issues Encountered

- Full Phase 124 consumer suites were not used as Plan 01 gates because Wave 0 deliberately activates legacy lifecycle and CLI delegation failures when `user-shell.ts` appears; Plan 02 owns those migrations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can replace lifecycle, workspace-command, and CLI user-authored shell paths with `executeUserShellCommand` while preserving their existing injected seams and result shapes.
- Later service PTY work can consume `discoverUserShell` and `buildUserShellBootstrap` in `pty` mode without reconstructing flags.
- Hosted Bash/zsh/fish profile evidence, live PTY integration, and service refresh remain later Phase 124/127 gates; this plan does not claim them.

## Self-Check: PASSED

- All five planned source/test files exist and are committed in the three task commits.
- Focused adapter, environment, and Node runtime tests pass; all workspace typechecks pass.
- No release metadata, tag, push, publish, or release action was touched.

---
*Phase: 124-user-shell-and-environment-authority*
*Completed: 2026-07-16*
