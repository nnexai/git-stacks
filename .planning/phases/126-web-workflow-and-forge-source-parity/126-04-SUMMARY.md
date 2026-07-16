---
phase: 126-web-workflow-and-forge-source-parity
plan: "04"
subsystem: service-security
tags: [web-projection, forge-review, opaque-tokens, toctou, operation-authority, process-lifetime]
requires:
  - phase: 126-web-workflow-and-forge-source-parity
    provides: strict web protocol contracts, SHA-safe private-ref preparation, and canonical service action/operation authority from Plans 01-03
provides:
  - Strict scoped action, note, file-status, operation, and forge-source routes with allowlist-only projections
  - Principal/revision/source/body/idempotency-bound 256-bit expiring review-token authority
  - Submit-time catalog/provider revalidation, full-SHA verification, normal workspace creation, and private-ref cleanup
  - Startup recovery for interrupted reviewed-source refs before the service accepts new work
  - Live-process ownership guard that prevents replacement startup and ref GC when an existing service is temporarily unreachable
affects: [126-05, 126-06, 126-07, 126-08, 127-live-web-tui-uat]
tech-stack:
  added: []
  patterns: [fixed safe DTO projection, in-memory capability token, revalidate-before-admit, durable-before-private-ref, retry-safe cleanup finalizer]
key-files:
  created:
    - packages/service/src/policy/forge-source-review.ts
    - tests/service/forge-source-review.test.ts
    - tests/service/web-safe-detail.test.ts
    - tests/service/web-workflow-authority.test.ts
  modified:
    - packages/service/src/web/projection.ts
    - packages/service/src/secure/router.ts
    - packages/service/src/main.ts
key-decisions:
  - "Browser and TUI workflow routes return strict allowlist DTOs; rich name/path-bearing core routes remain unavailable to browsers."
  - "A review token is an expiring server-side capability bound to one principal, canonical source, catalog revision, canonical draft body, and idempotency key."
  - "Reviewed creation is non-cancellable and private-ref preparation starts only inside the durably registered operation; cleanup remains pending until deletion succeeds."
  - "Only explicitly correctable pre-commit draft failures release the token body binding; accepted/unsafe paths remain one-shot."
  - "An unreachable descriptor is stale only when its recorded process is dead; a live owner fails discovery and startup closed until it is stopped or becomes reachable."
patterns-established:
  - "Provider and system failures cross the client boundary only as fixed typed code, recovery, and message tuples."
  - "Reviewed source authority rechecks current catalog and provider identity, then delegates SHA verification and creation to existing core seams."
  - "Startup GC is restricted to the constant refs/git-stacks/review/ namespace and fails service startup safely if cleanup cannot complete."
requirements-completed: [PARITY-01, PARITY-02, PARITY-03, PARITY-04, SOURCE-01, SOURCE-02, SOURCE-03, SOURCE-04]
coverage:
  - id: D1
    description: Strict service-owned action inventory route with scoped, revision-bound availability
    requirement: PARITY-01
    verification:
      - kind: integration
        ref: tests/service/web-workflow-authority.test.ts#secure web workflow authority
        status: pass
    human_judgment: false
  - id: D2
    description: Bounded authoritative List/Add/Clear notes flow without name or persistence authority in clients
    requirement: PARITY-02
    verification:
      - kind: integration
        ref: tests/service/web-workflow-authority.test.ts#maps note mutations to service-owned names without dropping revisioned intent
        status: pass
    human_judgment: false
  - id: D3
    description: Path-free file detail and fixed-safe operation progress/error projections
    requirement: PARITY-03
    verification:
      - kind: unit
        ref: tests/service/web-safe-detail.test.ts#strict browser-safe workflow projections
        status: pass
      - kind: unit
        ref: tests/service/web-projection.test.ts
        status: pass
    human_judgment: false
  - id: D4
    description: Explicit scope, ownership, cancellation, malformed-body, and rich-route rejection semantics
    requirement: PARITY-04
    verification:
      - kind: integration
        ref: tests/service/web-workflow-authority.test.ts#validates cancellation bodies and ownership before invoking the registry
        status: pass
    human_judgment: false
  - id: D5
    description: Supported forge URL resolve route and reviewed-create submit discriminant under service authority
    requirement: SOURCE-01
    verification:
      - kind: integration
        ref: tests/service/web-workflow-authority.test.ts#binds forge resolution to the authenticated principal and operation scope
        status: pass
    human_judgment: false
  - id: D6
    description: Safe canonical source resolution with opaque 256-bit TTL token and no fetch coordinate disclosure
    requirement: SOURCE-02
    verification:
      - kind: unit
        ref: tests/service/forge-source-review.test.ts#forge source review token authority
        status: pass
    human_judgment: false
  - id: D7
    description: Editable reviewed draft is fully rebound and revalidated before one normal workspace creation operation
    requirement: SOURCE-03
    verification:
      - kind: integration
        ref: tests/service/forge-source-review.test.ts#reviewed forge source creation admission
        status: pass
    human_judgment: false
  - id: D8
    description: Provider movement, fetch mismatch, inaccessible forks, stale configuration, and registration failure reject non-destructively with cleanup
    requirement: SOURCE-04
    verification:
      - kind: integration
        ref: tests/service/forge-source-review.test.ts#reviewed forge source creation admission
        status: pass
      - kind: integration
        ref: tests/service/web-workflow-authority.test.ts#admits reviewed creation for the authenticated principal and cleans up rejected registration
        status: pass
    human_judgment: false
duration: 22min
completed: 2026-07-16
status: complete
---

# Phase 126 Plan 04: Secure Web Workflow and Reviewed Source Authority Summary

**Strict service projections and a bound review-token admission path now close client disclosure, replay, provider movement, and fetched-SHA races before normal workspace creation.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-16T19:59:17+02:00
- **Completed:** 2026-07-16T20:20:46+02:00
- **Tasks:** 3
- **Files modified:** 22 in the independent review repairs, in addition to the original Plan 04 implementation

## Accomplishments

- Replaced browser access to rich name/path-bearing file and notes reads with strict ID/revision routes for action inventory, bounded notes, sanitized file detail, and safe operation/cancellation views.
- Added an in-memory 256-bit opaque review-token authority with bounded TTL, principal/canonical-source/revision/body/idempotency binding, atomic competing-submit rejection, and restart-safe invalidation.
- Revalidated current template/repository membership and provider identity, verified the fetched private ref against the immutable full head SHA, then invoked normal workspace creation with idempotent cleanup on all exits.
- Closed the independent security review by blocking raw browser snapshots, deferring Git refs until durable registration, enforcing HTTPS/validated SSH fetches, preserving strict forge recovery details, and making correctable review retries safe.
- Closed the residual restart window by settling interrupted operations first, then garbage-collecting only reviewed-source private refs across authoritative Git repositories before the service starts accepting work.
- Guarded that restart recovery with process-lifetime ownership: a live but unreachable existing service now blocks discovery and replacement startup before descriptor removal, operation recovery, private-ref GC, listener binding, or publication.

## Task Commits

1. **Task 1: Build strict path/provider-safe projections and scoped routes** - `0b6cc9c2` (RED), `3135673e` (GREEN)
2. **Task 2: Issue principal/revision/source-bound review tokens** - `2e19428e` (RED), `7c231f77` (GREEN)
3. **Task 3: Revalidate reviewed creation and close provider-to-fetch SHA races** - `2d1a3e9f` (RED), `8db479d4` (GREEN)
4. **Independent review: adversarial security/regression coverage** - `fbf7ce44` (RED)
5. **Independent review: authority, transport, operation, and cleanup repairs** - `9d1358a9` (GREEN)
6. **Independent review: authoritative CLI provider fixtures** - `a50f2cb1` (regression repair)
7. **Residual review: restart cleanup and runtime retry coverage** - `97a59f2c` (RED)
8. **Residual review: reviewed-ref recovery and exact runtime binding release** - `aa5eedd7` (GREEN)
9. **Final residual: live unreachable service ownership coverage** - `193c7e84` (RED)
10. **Final residual: fail-closed service process lifetime guard** - `1b6645fc` (GREEN)

## Files Created/Modified

- `packages/service/src/policy/forge-source-review.ts` - Trusted review-token store, safe resolve projection, atomic reservation, provider/catalog recheck, SHA-safe source admission, and cleanup.
- `packages/service/src/web/projection.ts` - Fixed allowlist projections for actions, notes, files, and operation state.
- `packages/service/src/secure/router.ts` - Strict scoped workflow reads/mutations, forge resolve, reviewed create admission, and registration-failure cleanup.
- `packages/service/src/main.ts` - Authoritative notes, file-status, catalog, forge-review runtime composition, and process-lifetime-safe startup discovery.
- `tests/service/forge-source-review.test.ts` - Entropy, expiry, replay, revision, atomic reservation, provider movement, SHA-preparation failure, creation, and cleanup coverage.
- `tests/service/web-safe-detail.test.ts` - POSIX/Windows path, credential, clone/fetch, argv/output, environment, and raw-error canary coverage.
- `tests/service/web-workflow-authority.test.ts` - Route scope, strict-body, ownership, notes/file lookup, cancellation, principal binding, and reviewed registration coverage.
- `tests/service/managed-service-process.test.ts` - Healthy reuse, dead-PID replacement, and live-unreachable fail-closed startup coverage.
- `packages/protocol/src/secure.ts`, `packages/protocol/src/web.ts`, and `packages/service/src/security/session-authority.ts` - Strict union of shortcut and forge transport recovery details, including durable browser operation summaries.
- `packages/core/src/workspace-source.ts` - HTTPS/validated-SSH fetch admission and retry-safe private-ref deletion.
- `packages/core/src/git.ts` - Checked ref deletion and fixed-error ref enumeration for the reserved reviewed-source namespace.
- `packages/service/src/policy/reviewed-source-recovery.ts` - Startup recovery sequencing, authoritative repository deduplication, and fixed-safe cleanup failure handling.
- `packages/service/src/policy/operations.ts` - Allowlisted forge recovery preservation on durable terminal failures.
- `tests/commands/workspace-source*.test.ts` and `tests/helpers.ts` - Injected authoritative GitLab provider metadata for CLI regressions without real hosted calls or synthetic resolver fallback.

## Decisions Made

- Successful duplicate submits may reuse only the same bound request and idempotency key; competing body/key bindings fail closed before admission.
- The reviewed operation advertises `cancellation: none` honestly. Catalog/provider admission remains pre-registration, while private-ref fetch/SHA verification and normal creation execute only after the durable operation exists.
- Normal creation progress is persisted with fixed safe wording rather than forwarding arbitrary core/provider output into durable operations.

## Independent Review Resolution

1. Browser sessions now fail closed on `core.state`, `core.edit-target`, and `snapshot.all`; trusted TUI/internal callers retain the rich methods.
2. Reviewed fetch coordinates accept credential-free HTTPS or a host/path-matched `git@host:path.git` SSH coordinate; plaintext HTTP is rejected before Git or a credential helper runs.
3. Private refs are created only inside the durably registered operation. Every returned cleanup is retried until deletion succeeds, and registration, fetch, SHA, create, and finalization failures share the same cleanup owner.
4. Resolver/catalog/planner/admission throws are caught at fixed router boundaries, while execution failures use fixed safe messages; path, credential, argv, and provider-output canaries do not serialize.
5. `branch_conflict` and `repo_not_matched` pre-commit failures release the exact atomic body binding so an edited draft may retry; source movement, accepted operations, and other unsafe paths remain consumed.
6. Secure responses and durable operation failures preserve only strict allowlisted forge reason/recovery/context schemas; arbitrary details are discarded.
7. `operation.get` now uses the strict operation-ID request schema, rejecting malformed and extra fields before registry lookup.
8. Startup recovery marks interrupted operations failed before enumerating authoritative Git repositories, skips directory-only entries, and deletes only refs under the constant `refs/git-stacks/review/` prefix. Listing or deletion failure prevents runtime startup with a fixed safe error.
9. An execution-time `branch_conflict` keeps its exact token/body/admission binding until private-ref cleanup succeeds. Once cleanup completes, only that matching binding is released so an edited draft can retry; cleanup failure keeps the retry blocked, while `source_changed` and other unsafe paths remain consumed.
10. Durable browser operation summaries retain the same strict typed forge reason/recovery/context detail as direct failures, allowing later clients to offer `change_branch` after an accepted operation fails without exposing arbitrary fields.
11. Descriptor probing now distinguishes a dead stale PID from a live unreachable owner. Dead descriptors retain normal replacement recovery, healthy descriptors are reused, and live unreachable descriptors return the fixed `service_unreachable` stop-and-retry error without exposing the raw probe failure or starting recovery/runtime side effects.

## Deviations from Plan

Independent review moved private-ref preparation from synchronous admission into the durably registered operation step. This is a deliberate safety correction: provider/catalog/planner rejections remain synchronous, while fetch/SHA failures are typed safe terminal operation failures.

## Issues Encountered

- The first reviewed-admission implementation allowed the default planner to consult process-global configuration after current-catalog validation. Focused tests exposed the mismatch; planning is now dependency-bound to the same freshly revalidated catalog.
- Codex stopped during the initial Task 3 patch. The isolated worktree retained every prior atomic commit and the complete working diff, so execution resumed from the focused failing tests without reconstruction.
- The isolated worktree temporarily replaced package links so TypeScript resolved this branch's protocol/core sources rather than the main checkout; no dependency artifacts were staged.
- Three legacy CLI source fixtures initially attempted a real `glab` call after the Plan 02 authoritative-resolver change. They now inject bounded provider JSON and local Git URL rewrites, preserving real resolver/fetch/SHA behavior without restoring synthetic metadata.

## User Setup Required

None - existing provider CLI authentication and configured forge metadata remain the authoritative runtime prerequisites.

## Next Phase Readiness

- Plans 05-08 can consume strict action/note/file/operation/source DTOs and the resolve-review-submit route without implementing client-side authority.
- Phase 127 remains the intended live web/TUI and supported-host human verification gate before tagging.
- No blocker remains in Plan 04.

## Self-Check: PASSED

- Plan 04 plus service startup/source/resolver/operation/protocol/session/router/restart regression matrix passed: 19 files, 184 tests.
- Full Node architecture/conformance/secure-runtime matrix passed: 46 tests.
- Core, protocol, and service typechecks passed; package architecture/dependency cycles passed.
- Full package build and `git diff --check` passed.

---
*Phase: 126-web-workflow-and-forge-source-parity*
*Completed: 2026-07-16*
