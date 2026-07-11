---
phase: 104-workspace-service-and-event-contract
plan: "03"
subsystem: service-security
tags: [credentials, authentication, filesystem-security, tdd]
requires: []
provides:
  - Protected automatic per-client credential provisioning and revocation
  - Constant-time credential verification with secret-free client contexts
  - Authenticate-before-route admission semantics with one generic rejection
affects: [104-06, phase-105, phase-107]
tech-stack:
  added: []
  patterns: [exclusive owner-only secret creation, atomic non-secret metadata replacement, authenticate-before-route admission]
key-files:
  created:
    - src/lib/service/credentials.ts
    - tests/lib/service/credentials.test.ts
    - tests/service/security.test.ts
  modified: []
key-decisions:
  - "Official client IDs are path-safe stable identifiers, while each client receives an independently revocable 256-bit credential."
  - "Transport admission accepts only the exact Bearer form and returns one constant rejection before any route, body, capability, or rate evaluation."
requirements-completed: [SVC-05]
coverage:
  - id: D1
    description: Automatic stable per-client provisioning, isolated revocation, and explicit replacement
    requirement: SVC-05
    verification:
      - kind: unit
        ref: tests/lib/service/credentials.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Owner-only credential storage rejects corrupt, permissive, and symlinked entries
    requirement: SVC-05
    verification:
      - kind: unit
        ref: tests/lib/service/credentials.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: All unauthenticated bearer states receive the same authenticate-first rejection
    requirement: SVC-05
    verification:
      - kind: integration
        ref: tests/service/security.test.ts
        status: pass
    human_judgment: false
duration: 8min
completed: 2026-07-11
status: complete
---

# Phase 104 Plan 03: Protected Client Credentials Summary

**Owner-only per-client credentials with isolated revocation, constant-time verification, and generic authenticate-before-route admission**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-11T11:32:55Z
- **Completed:** 2026-07-11T11:40:55Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added automatic stable provisioning of independent 256-bit official-client credentials with explicit revoked-credential replacement.
- Protected credential directories and records with owner/mode/symlink validation, exclusive secret creation, and atomic secret-free registry metadata.
- Added strict Bearer admission that authenticates before all downstream request work and exposes only a stable client/capability context.

## Task Commits

1. **Task 1 RED: credential boundary tests** - `ada8fb4`
2. **Task 1 GREEN: protected per-client credentials** - `5d7abd7`
3. **Task 2 RED: authentication admission tests** - `229d6d4`
4. **Task 2 GREEN: generic authenticate-first admission** - `2859902`

## Files Created/Modified

- `src/lib/service/credentials.ts` - Provisioning, protected persistence, revocation, constant-time verification, and admission API.
- `tests/lib/service/credentials.test.ts` - Credential lifecycle and unsafe-filesystem boundary coverage.
- `tests/service/security.test.ts` - Authentication oracle and admission-order coverage.

## Decisions Made

- Restricted official client IDs to a path-safe identifier grammar so untrusted identifiers cannot escape the credential directory.
- Persisted secret-bearing records only in mode-0600 files and kept aggregate registry metadata secret-free.
- Returned one frozen status/body shape for every unauthenticated condition.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - official clients provision automatically.

## Verification

- `bun test tests/lib/service/credentials.test.ts tests/service/security.test.ts` — 7 passed, 0 failed.
- `bun run typecheck` — passed.
- `bun run test:deps` — passed with no circular dependencies.

## Next Phase Readiness

- Plan 104-06 can wire `authenticateAdmission` directly ahead of Bun route dispatch.
- Native clients can receive isolated credentials without an interactive pairing flow.
- No blockers.

## Self-Check: PASSED

- All three key files exist.
- All four RED/GREEN task commits exist in order.
- Plan-level tests, typecheck, and dependency graph checks pass.

---
*Phase: 104-workspace-service-and-event-contract*
*Completed: 2026-07-11*
