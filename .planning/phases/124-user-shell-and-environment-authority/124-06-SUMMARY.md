---
phase: 124-user-shell-and-environment-authority
plan: "06"
subsystem: testing
tags: [vitest, bun-test, node-test, user-shell, ssh-agent, pty, security]

requires:
  - phase: 123-workspace-archive-remove-lifecycle
    provides: Browser projection and managed terminal lifecycle contracts extended by these RED fixtures
provides:
  - Exact secure refresh authorization and TUI-ordering RED sentinel
  - Real Bash/fish profile and two-agent SSH rotation host fixtures with fail-closed hosted mode
  - Exact typed terminal-step and PTY launch-integrity RED sentinel
affects: [phase-124-implementation, user-shell-adapter, dynamic-environment, web-terminal, hosted-shell-matrix]

tech-stack:
  added: []
  patterns: [exact RED sentinel verification, optional-local-required-host shell capability gating, real ssh-agent cleanup]

key-files:
  created:
    - tests/commands/user-shell-host-fixture.test.ts
    - tests/fixtures/user-shell/bash-init.sh
    - tests/fixtures/user-shell/zsh-init.zsh
    - tests/fixtures/user-shell/fish-init.fish
  modified:
    - tests/lib/service/contract.test.ts
    - tests/service-node/secure-contract-runtime.test.mjs
    - tests/service/web-projection.test.ts
    - tests/tui/dashboard/managed-service-bootstrap.test.ts
    - tests/lib/service/launch-context.test.ts
    - tests/service/managed-service-process.test.ts
    - tests/service/web-terminal.test.ts

key-decisions:
  - "Keep Phase 124-06 production-neutral: all missing behavior is represented by executable tests and exact sentinels."
  - "Permit a precise local zsh capability skip while requiring hosted mode to fail if any supported shell is unavailable."
  - "Use two live ssh-agent instances and ephemeral keys so rotation evidence includes a real ssh-add lookup and immutable process-A environment."

patterns-established:
  - "RED command contract: the outer verifier passes only when the inner suite fails on its exact planned sentinel and has no load/import/syntax failure."
  - "Host fixture cleanup: agents and temporary homes/keys are removed in afterEach even after assertion failures."

requirements-completed: []

coverage:
  - id: D1
    description: Secure local refresh schema, authorization, non-disclosure, and TUI pre-handoff ordering are locked behind one exact RED contract.
    verification:
      - kind: integration
        ref: "Plan 124-06 Task 1 exact refresh/TUI RED command"
        status: pass
    human_judgment: false
  - id: D2
    description: Typed terminal steps, real shell profile behavior, PTY launch integrity, and two-agent SSH rotation are locked behind one exact RED contract.
    verification:
      - kind: integration
        ref: "Plan 124-06 Task 2 exact terminal/SSH RED command"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-07-16
status: complete
---

# Phase 124 Plan 06: User Shell and Environment Authority RED Contracts Summary

**Executable RED contracts now pin secure refresh authority, TUI ordering, typed terminal steps, real profile startup, PTY integrity, and live SSH-agent rotation without changing production code.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-16T10:57:01Z
- **Completed:** 2026-07-16T11:04:30Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Added one exact secure refresh/TUI RED sentinel with strict allowlist and byte-bound expectations, runtime leakage canaries, browser denial coverage, and an awaited handoff barrier.
- Added isolated Bash/zsh/fish startup fixtures plus a host test that proves profile aliases, functions, nvm-style PATH, quoting, and actual shell identity when each shell is available.
- Added two live `ssh-agent` instances with ephemeral keys, real `ssh-add -l`, process-A snapshot retention, future process-B rotation, and unconditional agent/key/home cleanup.
- Replaced the combined terminal command expectation with the exact typed-step RED contract and added PTY spawn capture for argv, cwd, environment, and refreshed SSH socket integrity.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock secure refresh, projection non-disclosure, and TUI ordering** - `2206049d` (test)
2. **Task 2: Lock typed terminal steps, real profiles, SSH rotation, and cleanup** - `3c3ba930` (test)

## Files Created/Modified

- `tests/commands/user-shell-host-fixture.test.ts` - Isolated real-profile and two-agent SSH rotation fixture with cleanup and required-host gating.
- `tests/fixtures/user-shell/bash-init.sh` - Bash profile alias, function, shell identity, and profile-installed PATH marker.
- `tests/fixtures/user-shell/zsh-init.zsh` - zsh profile alias, function, shell identity, and profile-installed PATH marker.
- `tests/fixtures/user-shell/fish-init.fish` - fish profile alias, function, shell identity, and profile-installed PATH marker.
- `tests/lib/service/contract.test.ts` - Strict refresh allowlist, omission, byte-bound, unknown-key, and control-byte RED expectations.
- `tests/service-node/secure-contract-runtime.test.mjs` - Built-service refresh non-disclosure canaries and browser denial assertion.
- `tests/service/web-projection.test.ts` - Refresh PATH/socket/shell canaries added to browser projection negative coverage.
- `tests/tui/dashboard/managed-service-bootstrap.test.ts` - Refresh acceptance/denial barrier model before the first TUI request.
- `tests/lib/service/launch-context.test.ts` - Typed independent pre/main/repository/post terminal-step RED sentinel.
- `tests/service/managed-service-process.test.ts` - PATH/socket preservation and workspace-authority sanitization at daemon bootstrap.
- `tests/service/web-terminal.test.ts` - PTY spawn capture proving launch argv/cwd/environment pass through unchanged.

## Decisions Made

- Kept all production packages untouched so later Phase 124 plans must satisfy the contracts rather than inheriting partial implementation.
- Used `GIT_STACKS_REQUIRE_HOST_SHELLS=1` as the fail-closed local seam in this fixture; ordinary local runs report unavailable zsh as a skip, while required runs execute the test and fail.
- Used real OpenSSH processes and keys rather than socket-text-only assertions, while keeping service-through-PTY/non-PTY rotation intentionally RED for later implementation plans.

## Deviations from Plan

None - plan executed within its test-only RED boundary.

## Issues Encountered

- The isolated worktree initially lacked dependencies and built package artifacts. Installed from the lockfile, built packages, and supplied the existing local optional HTTP/3 native binary in ignored `node_modules`; no tracked dependency or production file changed.
- zsh is unavailable on the local Fedora host. Its case reports one precise optional skip and neither satisfies nor causes the RED sentinel; hosted required-shell execution remains a later milestone gate.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 124 implementation plans can now turn the refresh/TUI and terminal/SSH sentinels green incrementally.
- SHELL-01 through SHELL-07 remain incomplete by design; this plan delivers Wave 0 RED evidence only.
- Hosted Linux/macOS zero-skip shell receipts and full service-through-PTY/non-PTY SSH rotation remain Phase 127 pre-tag blockers.

---
*Phase: 124-user-shell-and-environment-authority*
*Completed: 2026-07-16*
