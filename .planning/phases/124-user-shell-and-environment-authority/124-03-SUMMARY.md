---
phase: 124-user-shell-and-environment-authority
plan: "03"
subsystem: security
tags: [zod, secure-rpc, environment, path, ssh-agent, volatile-state]

requires:
  - phase: 124-user-shell-and-environment-authority
    provides: Plan 124-06 secure refresh RED contracts and disclosure canaries
provides:
  - Strict bounded PATH and SSH_AUTH_SOCK refresh protocol with metadata-only results
  - Listener-origin and local-target authorization before parsing or mutation
  - Atomic in-memory replace-and-clear store with immutable launch snapshots
  - Authenticated service client helper and managed-service composition
affects: [124-04, 124-05, user-shell-launch, terminal-launch, managed-service]

tech-stack:
  added: []
  patterns: [authorize-before-parse, replace-all volatile authority, immutable per-launch snapshot, metadata-only acknowledgement]

key-files:
  created:
    - packages/service/src/policy/dynamic-environment.ts
  modified:
    - packages/protocol/src/service.ts
    - packages/protocol/src/secure.ts
    - packages/service/src/main.ts
    - packages/service/src/policy/client.ts
    - packages/service/src/secure/router.ts
    - packages/service/src/secure/runtime.ts
    - packages/service/src/security/session-authority.ts
    - tests/lib/service/contract.test.ts
    - tests/lib/service/launch-context.test.ts
    - tests/service-node/secure-contract-runtime.test.mjs

key-decisions:
  - "Treat CLI refresh as the authenticated local TUI-mode service client path; browser, helper, pairing, remote-listener, and relayed-target contexts are denied before parsing."
  - "Represent listener origin explicitly on secure session context so transport locality is server-authored rather than inferred from client fields."
  - "Return only updated and cleared key names; raw PATH and SSH_AUTH_SOCK values never enter descriptors, snapshots, events, revisions, or projections."

patterns-established:
  - "Dynamic environment replacement parses a complete strict allowlist before one immutable pointer swap; omission clears stale keys."
  - "Every launch consumer receives a frozen copy, so an already-started child cannot observe later refreshes."

requirements-completed: []

coverage:
  - id: D1
    description: Bounded refresh protocol accepts only PATH and SSH_AUTH_SOCK and returns metadata without submitted values.
    verification:
      - kind: unit
        ref: "tests/lib/service/contract.test.ts#PHASE124_RED refresh authorization TUI ordering contract"
        status: pass
    human_judgment: false
  - id: D2
    description: Local same-target TUI requests reach parser and store exactly once while every untrusted origin reaches neither.
    verification:
      - kind: integration
        ref: "tests/lib/service/contract.test.ts#rejects every non-local refresh origin before parsing or storage"
        status: pass
      - kind: integration
        ref: "tests/service-node/secure-contract-runtime.test.mjs#secure routing preserves catalog idempotent operations ownership events and signals"
        status: pass
    human_judgment: false
  - id: D3
    description: Atomic replace, invalid-input preservation, omission clearing, and old-versus-future launch snapshots are proven in memory.
    verification:
      - kind: unit
        ref: "tests/lib/service/launch-context.test.ts#atomically replaces volatile launch values while prior child snapshots remain immutable"
        status: pass
    human_judgment: false
  - id: D4
    description: Refresh canaries remain absent from the service descriptor, browser snapshot, creation catalog, events, and web projection.
    verification:
      - kind: integration
        ref: "tests/service-node/secure-contract-runtime.test.mjs#refresh disclosure transcript"
        status: pass
      - kind: unit
        ref: "tests/service/web-projection.test.ts#omits paths commands environment secret references ports and launch details"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-07-16
status: complete
---

# Phase 124 Plan 03: Local Volatile Environment Refresh Authority Summary

**Strict local-only PATH and SSH-agent refresh with authorize-before-parse routing, atomic replace-and-clear state, immutable launch snapshots, and metadata-only acknowledgements.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-16T11:08:39Z
- **Completed:** 2026-07-16T11:13:32Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added strict UTF-8 byte bounds and control-character rejection for the two-key refresh allowlist, plus a strict result schema containing key names only.
- Added authenticated origin and target checks before parser/store invocation, with browser, helper, pairing, remote-listener, and relayed-target denial coverage.
- Added an atomic in-memory replacement authority where omission clears stale state, invalid input preserves the prior snapshot, and previously captured child snapshots remain immutable.
- Wired the authority through managed-service composition and added a local authenticated client helper without adding refresh values to any browser or durable surface.

## Task Commits

1. **Task 1: Confirm Wave 0 refresh authorization and non-disclosure contracts** - `274ffa24` (test)
2. **Task 2: Implement bounded protocol and local-only authorization** - `a7757c82` (feat)
3. **Task 3: Compose atomic volatile replacement into service launch context** - `317095dc` (test)

## Files Created/Modified

- `packages/service/src/policy/dynamic-environment.ts` - Frozen replace-all volatile authority and snapshot getter.
- `packages/protocol/src/service.ts` - Refresh key, request, result, and byte-limit contracts.
- `packages/protocol/src/secure.ts` - Server-authored local/remote connection-origin contract.
- `packages/service/src/security/session-authority.ts` - Attaches listener origin to authenticated contexts.
- `packages/service/src/secure/runtime.ts` - Marks listener origins and injects the local service identity into routing policy.
- `packages/service/src/secure/router.ts` - Denies untrusted origins before parse/store and handles authorized refresh.
- `packages/service/src/policy/client.ts` - Constructs the two-key local refresh request and parses metadata-only acknowledgement.
- `packages/service/src/main.ts` - Owns the volatile store for the service lifetime and injects it into secure runtime.
- `tests/lib/service/contract.test.ts` - Schema bounds and complete direct router origin matrix.
- `tests/lib/service/launch-context.test.ts` - Atomic replacement, clearing, invalid preservation, and temporal snapshot proof.
- `tests/service-node/secure-contract-runtime.test.mjs` - Built runtime parser/store counts, replacement, clearing, and disclosure scan.

## Decisions Made

- Used explicit listener origin plus local target identity instead of trusting client-supplied mode alone.
- Kept refresh outside secure scopes because the method is admitted only by the stronger local-origin/TUI/local-target predicate; remote helper scope grants cannot make it reachable.
- Initialized the store from the daemon's inherited PATH/socket, while every later accepted request replaces the whole allowlist.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added server-authored listener origin to session context**
- **Found during:** Task 2
- **Issue:** Router mode and target fields alone could not prove whether authentication arrived through the local or remotely exposed listener.
- **Fix:** Added a typed local/remote origin assigned by each `SecureSessionServer`, then required local origin before refresh parsing.
- **Files modified:** `packages/protocol/src/secure.ts`, `packages/service/src/security/session-authority.ts`, `packages/service/src/secure/runtime.ts`
- **Verification:** Direct origin matrix and built runtime tests pass; typecheck passes.
- **Committed in:** `a7757c82`

**2. [Rule 3 - Blocking] Composed the store during Task 2**
- **Found during:** Task 2 verification
- **Issue:** The built runtime authorization test could not reach a real replacement authority until managed-service composition existed.
- **Fix:** Implemented and injected the volatile store in the same feature commit; Task 3 then added its temporal and disclosure proofs.
- **Files modified:** `packages/service/src/policy/dynamic-environment.ts`, `packages/service/src/main.ts`
- **Verification:** Built Node runtime and atomic store tests pass.
- **Committed in:** `a7757c82`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both changes were required to prove the planned trust boundary and runtime behavior; no external or durable surface was added.

## Issues Encountered

- The isolated worktree required lockfile-based dependency bootstrap, package builds, and the existing optional HTTP/3 native binary in ignored `node_modules`; no tracked dependency files changed.
- The plan's unfiltered Task 3 Vitest command includes `PHASE124_RED terminal steps SSH rotation contract`, which belongs to dependent Plan 124-04 and remains intentionally RED. All Plan 124-03 tests pass when that single future-plan test is filtered; the full command fails only on that exact unrelated sentinel.

## User Setup Required

None - no external configuration required.

## Next Phase Readiness

- Plan 124-04 can consume `DynamicEnvironmentStore.snapshot()` at each PTY and non-PTY launch without caching it in projections or revisions.
- Plan 124-05 can call `refreshDynamicEnvironment()` before local CLI/TUI handoff and treat omitted values as explicit clears.
- SHELL-04 through SHELL-07 remain milestone-level incomplete until launch consumption, real hosted shells, and live PTY/non-PTY rotation plans finish.

## Self-Check: PASSED

- All created and modified source/test files exist.
- Task commits `274ffa24`, `a7757c82`, and `317095dc` exist.
- No tracked production or test file is uncommitted.

---
*Phase: 124-user-shell-and-environment-authority*
*Completed: 2026-07-16*
