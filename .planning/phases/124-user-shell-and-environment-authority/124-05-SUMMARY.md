---
phase: 124-user-shell-and-environment-authority
plan: "05"
subsystem: runtime-integration
tags: [user-shell, dynamic-environment, ssh-agent, pty, tui, github-actions]

requires:
  - phase: 124-user-shell-and-environment-authority
    provides: Shell adapter, dynamic environment store, terminal launch context, process cleanup, and executable RED contracts from Plans 00, 02, 03, 04, and 06
provides:
  - Awaited same-user PATH and SSH_AUTH_SOCK refresh before local web and TUI launch
  - Real Bash/fish profile, SSH-agent rotation, and process-tree cleanup acceptance coverage with explicit local zsh capability reporting
  - Fail-on-skip Ubuntu 24.04 and macOS 15 workflow jobs with validated machine-readable receipt artifacts
affects: [phase-124-verification, phase-127-rc-closure, local-launchers, hosted-shell-matrix]

tech-stack:
  added: []
  patterns: [trusted local refresh barrier, future-launch environment replacement, required-host capability receipts]

key-files:
  created:
    - tests/architecture/shell-hosted-matrix.test.mjs
  modified:
    - packages/service/src/policy/client.ts
    - packages/cli/src/commands/service.ts
    - packages/cli/src/commands/web.ts
    - packages/cli/src/lib/cli-program.ts
    - packages/tui/src/run.tsx
    - tests/commands/user-shell-host-fixture.test.ts
    - tests/tui/dashboard/managed-service-bootstrap.test.ts
    - .github/workflows/node-runtime-matrix.yml

key-decisions:
  - "Refresh PATH and SSH_AUTH_SOCK only through authenticated local client code, await acceptance before UI/process launch, and represent omission as an explicit clear."
  - "Keep browser, helper, pairing, and remote surfaces capability-free and value-free; failures expose metadata-only recovery guidance."
  - "Allow a precise missing-shell skip locally, but make every missing capability or skip fail hosted Ubuntu/macOS jobs and their receipt validation."
  - "Carry actual green Ubuntu 24.04 and macOS 15 receipts as Phase 127 pre-tag blockers rather than claiming hosted execution locally."

patterns-established:
  - "Local launcher barrier: authenticate, submit the complete allowlisted replacement, await acceptance, then create the browser or TUI process."
  - "Host receipt gate: required shell and OpenSSH capabilities execute with zero skips and upload a schema-validated JSON receipt even when the job fails."

requirements-completed:
  - SHELL-01
  - SHELL-02
  - SHELL-03
  - SHELL-04
  - SHELL-05
  - SHELL-06
  - SHELL-07

coverage:
  - id: D1
    description: Authenticated local CLI and TUI launchers await a complete PATH and SSH_AUTH_SOCK refresh before their first dependent launch while browser projections remain value-free.
    requirement: SHELL-04
    verification:
      - kind: integration
        ref: "tests/tui/dashboard/managed-service-bootstrap.test.ts#local launchers await refresh before launch"
        status: pass
      - kind: integration
        ref: "tests/service/web-projection.test.ts#environment non-disclosure"
        status: pass
    human_judgment: false
  - id: D2
    description: Real host fixtures preserve Bash and fish profile behavior, rotate future launches across two live SSH agents, clear an omitted socket, and remove canceled descendants.
    requirement: SHELL-06
    verification:
      - kind: integration
        ref: "tests/commands/user-shell-host-fixture.test.ts#host user-shell fixtures"
        status: pass
    human_judgment: false
  - id: D3
    description: Ubuntu 24.04 and macOS 15 jobs require Bash, zsh, fish, ssh-agent, and ssh-add with zero skips and always validate and upload the complete JSON receipt contract.
    requirement: SHELL-07
    verification:
      - kind: other
        ref: "tests/architecture/shell-hosted-matrix.test.mjs"
        status: pass
    human_judgment: false
  - id: D4
    description: Actual green Ubuntu 24.04 and macOS 15 receipt artifacts for the integrated commit are available before release tagging.
    requirement: SHELL-07
    verification: []
    human_judgment: true
    rationale: "The local executor can validate the workflow and receipt contract but cannot claim hosted jobs ran; both receipts are durable Phase 127 pre-tag blockers."

duration: 1h 15m
completed: 2026-07-16
status: complete
---

# Phase 124 Plan 05: Host and Launcher Closure Summary

**Trusted local launchers now await dynamic environment refresh, while real-shell/SSH fixtures and fail-on-skip Linux/macOS receipt jobs close the integrated shell contract short of hosted execution and release side effects.**

## Performance

- **Duration:** 1h 15m
- **Started:** 2026-07-16T11:34:18Z
- **Completed:** 2026-07-16T12:49:16Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Added an authenticated local refresh handoff for web and TUI management that replaces PATH/SSH_AUTH_SOCK, awaits acceptance before launch, and exposes no raw values to browser or remote surfaces.
- Proved real Bash and fish interactive-login behavior, aliases/functions, PATH initialization, quoting, exit propagation, two-agent SSH socket rotation, omission clearing, and cancellation cleanup; local zsh absence is reported explicitly.
- Added required Ubuntu 24.04 and macOS 15 workflow cells that fail on missing capabilities or skips and always validate/upload machine-readable shell, SSH, and process-tree receipts.
- Closed the local repository gates with the TUI build, focused launcher/host/architecture suites, the full Vitest/Node/OpenTUI suites, all workspace typechecks, dependency architecture, canonical coverage, and `verify:gates`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add authenticated CLI/TUI refresh handoff before first launch** - `b84cf72b` (test), `da3210d5` (feat), `4abd4c38` (fix)
2. **Task 2: Build real shell and SSH rotation acceptance fixtures** - `1db377db` (test), `8186e6e8` (test)
3. **Task 3: Enforce hosted receipt-producing jobs and run local closure gates** - `fbede37d` (ci), `e6c34fa3` (test)
4. **Full-gate regression repair** - `41b41f8a` (fix)

## Files Created/Modified

- `packages/service/src/policy/client.ts` - Authenticated local refresh request and awaited preparation seam.
- `packages/cli/src/commands/service.ts` - Managed-dashboard preparation kept inside the service-owning launcher boundary.
- `packages/cli/src/commands/web.ts` - Refresh barrier before browser launch.
- `packages/cli/src/lib/cli-program.ts` - Refresh barrier before managed TUI spawn.
- `packages/tui/src/run.tsx` - Refresh acceptance before rendering and first service request.
- `tests/commands/user-shell-host-fixture.test.ts` - Real-shell, live SSH-agent rotation, omission, receipt, and descendant-cleanup acceptance suite.
- `tests/fixtures/user-shell/{bash-init.sh,zsh-init.zsh,fish-init.fish}` - Real interactive-login profile fixtures.
- `.github/workflows/node-runtime-matrix.yml` - Required Ubuntu/macOS receipt-producing shell cells.
- `tests/architecture/shell-hosted-matrix.test.mjs` - Parsed workflow and receipt-schema enforcement.
- `tests/tui/dashboard/managed-service-bootstrap.test.ts` - Ordered local-launcher refresh barrier contract.
- `packages/core/src/workspace-lifecycle.ts` - Restored captured hook failure propagation exposed by the full gate.

## Decisions Made

- Kept refresh construction inside authenticated same-user launcher code and submitted a complete replacement so omitted PATH/socket values cannot retain stale authority.
- Kept the manage-side refresh behind a service command seam instead of importing service-client machinery into the generic CLI program boundary.
- Made hosted receipt validation structural and fail-closed while preserving an honest local capability skip for unavailable zsh.
- Preserved the milestone boundary: no tag, push, publish, release, or release-metadata mutation was performed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Guaranteed host-fixture cleanup after intermediate failure**
- **Found during:** Task 2 real SSH-agent rotation verification.
- **Issue:** An assertion failure could leave the long-running process-A command waiting on its release file, delaying or defeating fixture teardown.
- **Fix:** Added a `finally` release, bounded settlement wait, abort fallback, and descendant-exit polling.
- **Files modified:** `tests/commands/user-shell-host-fixture.test.ts`
- **Verification:** Real two-agent rotation and child/grandchild cancellation cases pass.
- **Committed in:** `8186e6e8`

**2. [Rule 3 - Blocking] Kept managed TUI refresh inside the service launcher boundary**
- **Found during:** Task 1 dependency architecture verification.
- **Issue:** Importing the service client directly from the generic CLI-program module violated the existing package boundary.
- **Fix:** Exported a managed-dashboard preparation seam from the service command and awaited it before TUI spawn.
- **Files modified:** `packages/cli/src/commands/service.ts`, `packages/cli/src/lib/cli-program.ts`, `tests/tui/dashboard/managed-service-bootstrap.test.ts`
- **Verification:** `npm run test:deps`, launcher tests, typecheck, and full suites pass.
- **Committed in:** `4abd4c38`

**3. [Rule 1 - Bug] Preserved captured hook failure semantics after shell-adapter migration**
- **Found during:** Task 3 full regression gate.
- **Issue:** The captured hook executor returned failed results but the workspace lifecycle caller no longer threw when `abortOnFailure` was enabled.
- **Fix:** Detected the first failed captured result and restored the existing command/exit failure exception.
- **Files modified:** `packages/core/src/workspace-lifecycle.ts`
- **Verification:** Full Vitest, Node, OpenTUI, typecheck, dependency, coverage, and readiness gates pass.
- **Committed in:** `41b41f8a`

---

**Total deviations:** 3 auto-fixed (1 missing critical, 1 blocking, 1 bug).
**Impact on plan:** All fixes preserve cleanup, package boundaries, and prior hook semantics; no feature scope was added.

## Issues Encountered

- The first `verify:gates` run correctly rejected missing ignored `.coverage` artifacts in the clean worktree. `npm run coverage` regenerated the canonical reports, after which the gate passed without source changes.
- zsh is not installed on this local host. The fixture emitted `CAPABILITY_SKIP shell=zsh reason=executable-unavailable`; Bash, fish, two real SSH agents, and process-tree cleanup all ran and passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 124 is locally integrated and ready for independent verification after this branch is merged.
- Actual green Ubuntu 24.04 and macOS 15 JSON receipts remain durable Phase 127 pre-tag blockers.
- No release side effect has occurred; manual browser/OpenTUI verification remains at the milestone-end handoff requested by the user.

## Self-Check: PASSED

- Host fixture: 4 passed, 1 explicit local zsh capability skip; Bash, fish, two-agent SSH rotation, and canceled descendant cleanup passed.
- Focused launcher/service/architecture suites: 15 tests passed.
- Full Vitest: 139 files, 1840 passed, 1 explicit local zsh skip.
- Full Node architecture/conformance suite and full OpenTUI suite passed.
- `npm run tui:build`, all seven workspace typechecks, `npm run test:deps`, `npm run coverage`, and `npm run verify:gates` passed.
- Hosted receipts were not claimed locally and remain Phase 127 blockers.

---
*Phase: 124-user-shell-and-environment-authority*
*Completed: 2026-07-16*
