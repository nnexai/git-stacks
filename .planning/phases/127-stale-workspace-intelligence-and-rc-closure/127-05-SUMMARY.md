---
phase: 127-stale-workspace-intelligence-and-rc-closure
plan: "05"
subsystem: service-secure-stale-route
status: complete
tags: [stale-workspaces, secure-rpc, revision-gate, projection, volatile-cache, abort-signal]

requires:
  - phase: 127-03
    provides: strict browser stale request and response schemas with bounded evidence fields
  - phase: 127-04
    provides: revision-first stale evaluator, suggestion-only evidence policy, bounded observers, and five-minute volatile network cache
provides:
  - revision-first workspace.stale.evaluate secure method under snapshot.read
  - explicit schema-validated stale browser allowlist projection
  - strict abortable trusted service-client fetch seam
  - one cache-owning stale evaluator per managed service lifetime
  - frozen stale read-model capture with repository identity validation and note-count cautions

affects: [127-06, 127-09, stale-workspace-clients, secure-service-runtime, capability-verification]

tech-stack:
  added: []
  patterns:
    - parse then authoritative build then revision equality before any evidence access
    - explicit nested browser allowlist with final strict response parse
    - service-lifetime dependency composition with deterministic evaluator injection
    - fail-closed repository identity joins over one captured core state

key-files:
  created:
    - tests/service/stale-workspace-route.test.ts
  modified:
    - packages/service/src/web/projection.ts
    - packages/service/src/policy/client.ts
    - packages/service/src/secure/router.ts
    - packages/service/src/main.ts
    - packages/service/src/policy/core-state.ts

key-decisions:
  - "The stale route parses first, builds core state exactly once, rejects revision conflict before note counts or evaluator/cache/probe access, and only then freezes the evaluator read model."
  - "Repository definitions, projections, and statuses must agree on identity and mode; inconsistency fails with a sanitized operation outcome rather than fabricating missing-worktree evidence."
  - "Notes contribute only a validated count from the trusted core provider; note text and paths never enter the evaluator response or browser projection."
  - "Managed-service startup constructs one evaluator/cache object and passes only its read-only evaluate method to the router; restart naturally drops all volatile evidence."
  - "The trusted client and browser projection both parse the strict protocol contract, while the projection maps every nested field explicitly and drops internal disclosure canaries."

requirements-completed: [STALE-01, STALE-02, STALE-03, STALE-05]

coverage:
  - id: D1
    description: "The secure stale route is lazy, snapshot.read-only, and rejects malformed or stale requests before evaluator and evidence access."
    requirement: STALE-01
    verification:
      - kind: integration
        ref: "tests/service/stale-workspace-route.test.ts — invalid, conflict, scope, captured-model, and projection route contracts; 4/4 pass"
        status: pass
      - kind: other
        ref: "real @git-stacks/service/client request over the managed TLS secure service — revision 1 returned an empty strict response and revision 0 returned conflict"
        status: pass
    human_judgment: false
  - id: D2
    description: "One managed service shares an exact five-minute volatile evaluator cache while a new service composition starts cold and base snapshots remain probe-free."
    requirement: STALE-02
    verification:
      - kind: integration
        ref: "tests/service/stale-workspace-route.test.ts — lazy base snapshot, same-composition cache hit, and new-composition cold-cache contract"
        status: pass
      - kind: unit
        ref: "tests/lib/service/stale-workspaces.test.ts — generation, abort-safe commit, TTL, forced refresh, and bounded fan-out suite; 49/49 pass"
        status: pass
    human_judgment: false
  - id: D3
    description: "The route and client expose observation only, with no durable operation, lifecycle, terminal, worktree-discard, YAML, provider-mutation, or polling authority."
    requirement: STALE-03
    verification:
      - kind: integration
        ref: "npm run test:architecture — Package architecture: OK"
        status: pass
      - kind: unit
        ref: "tests/service/stale-workspace-route.test.ts — snapshot.read authorization and no-operation route construction"
        status: pass
    human_judgment: false
  - id: D4
    description: "Operational evidence remains bounded and the browser response omits machine paths, raw errors/output, credentials, environment, bearer material, and argv."
    requirement: STALE-05
    verification:
      - kind: unit
        ref: "tests/service/web-stale-workspaces-schema.test.ts — strict stale wire contract; 16/16 pass"
        status: pass
      - kind: unit
        ref: "tests/service/stale-workspace-route.test.ts — nested path, raw-error, environment, and bearer disclosure canaries are absent"
        status: pass
    human_judgment: false

duration: 27min 29sec
completed: 2026-07-17
---

# Phase 127 Plan 05: Stale Workspace Secure Route and Service Composition Summary

**A revision-gated `snapshot.read` RPC now drives one service-lifetime stale evaluator through a frozen authoritative read model, strict trusted-client parsing, and an explicit path-free browser allowlist.**

## Performance

- **Duration:** 27 min 29 sec
- **Started:** 2026-07-17T10:45:27Z
- **Completed:** 2026-07-17T11:12:56Z
- **Tasks:** 2
- **Production files modified:** 5
- **Test files created:** 1

## Accomplishments

- Added `workspace.stale.evaluate` under the existing `snapshot.read` scope with strict request parsing, one authoritative `core.build()`, and revision rejection before note reads, evaluator calls, cache access, clock access, forge calls, remote calls, or worktree evidence.
- Converted the accepted core state into a deeply frozen stale read model containing only evaluator-required trusted facts. Repository identity or mode disagreement fails closed rather than becoming false missing-worktree proof.
- Added a narrow core note-count seam so `notes_present` cautions remain truthful without reading note text into the evaluator or exposing note paths/content across the secure boundary.
- Added one managed-service composition seam that constructs exactly one evaluator/cache per new service instance, supports deterministic injected observers/clocks in tests, and leaves base snapshots, watchers, lifecycle, polling, and shutdown persistence untouched.
- Added a field-by-field stale response projection with a final `WebStaleWorkspaceResponseSchema.parse`, plus a trusted client fetcher that strict-parses both request and response under the exact method and scope.
- Exercised the built package over the real managed TLS secure-service boundary: the official client received a strict revision-1 response and a valid revision-0 probe returned sanitized `conflict`.

## Task Commits

Each task was committed atomically with normal Git hooks:

1. **Task 1: Add the strict stale projection and trusted service client** — `986390e2` (`feat`)
2. **Task 2: Register the revision-first route and service-lifetime evaluator** — `e4ca8c71` (`feat`)

**Plan metadata:** committed separately with this summary and shared tracking updates.

## TDD Gate Compliance

- Task 1 consumed the committed Phase 127 browser/trusted-client RED contracts (`dad5cb30`, `f69e6b16`) and implemented only the Plan 127-05 service projection/client boundary; broader Plan 127-06 presentation contracts intentionally remain RED.
- Task 2 consumed the committed revision/evaluator RED contract (`69eae6eb`) and added focused route/composition coverage for malformed input, zero-evidence conflict, exact frozen model transfer, scope, disclosure, same-service cache reuse, cold restart, and base-snapshot laziness.
- The plan frontmatter is `type: execute`, so no plan-level RED/GREEN commit-sequence warning applies. No test assertion or future client/UI module was weakened to obtain a green result.

## Files Created/Modified

- `packages/service/src/web/projection.ts` — Explicit nested stale candidate, incomplete-row, reason, unknown-evidence, and caution allowlist with final strict schema validation.
- `packages/service/src/policy/client.ts` — Strict `fetchStaleWorkspaceEvaluation(request, signal?)` adapter using `workspace.stale.evaluate` and `snapshot.read`.
- `packages/service/src/secure/router.ts` — Revision-first lazy secure route, frozen captured read-model conversion, identity consistency checks, abort forwarding, sanitized failures, and strict projection link.
- `packages/service/src/main.ts` — One stale evaluator/cache composition per managed service, with deterministic test injection and no background invocation.
- `packages/service/src/policy/core-state.ts` — Validated note-count access used only after stale-route revision equality to preserve non-qualifying note cautions.
- `tests/service/stale-workspace-route.test.ts` — Route ordering, scope, model freezing, disclosure, service-lifetime cache, restart, and base-snapshot regression coverage.
- `.planning/phases/127-stale-workspace-intelligence-and-rc-closure/deferred-items.md` — Records the still-intentional Plan 127-06 client/UI architecture RED boundary.

## Decisions Made

- The route owns the outer revision gate even though the evaluator independently checks read-model revision. This prevents any evaluator/cache/clock access on a stale secure request and preserves defense in depth.
- Note counts are fetched only after revision equality and before evaluator execution through a narrow provider method. A stale request performs zero note reads, and neither note text nor file location enters the read model.
- Repository joins require matching name, stable ID, and mode across definition and projection. A missing status remains degraded/unknown; inconsistent identity fails the whole request with static copy rather than manufacturing confirmed absence.
- The internal read model legitimately contains `main_path` for the bounded remote observer, but the browser boundary maps every response field explicitly and final-parses the path-free protocol schema.
- The managed-service evaluator is created once after the core provider and injected into the router. No timer, watcher, base snapshot, operation registry, lifecycle coordinator, or stop hook holds stale evaluation authority.
- Client-side abort continues through the existing secure request option, and the router forwards any request signal it receives into the evaluator; evaluator generation tests remain the authority for preventing aborted cache commits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Preserved authoritative note cautions without exposing note content**
- **Found during:** Task 2 read-model composition
- **Issue:** The evaluator requires `notes_count`, but the existing core state did not expose a count and substituting a hardcoded zero would silently omit a required caution.
- **Fix:** Added `CoreStateProvider.noteCount()` using the core note-summary count, invoked only after revision equality. The route passes the count into the frozen model and never reads or projects note text.
- **Files modified:** `packages/service/src/policy/core-state.ts`, `packages/service/src/secure/router.ts`
- **Commit:** `e4ca8c71`

**2. [Rule 2 - Threat Mitigation Coverage] Added focused route and service-lifetime contracts**
- **Found during:** Task 2 verification
- **Issue:** The planned broad test-name selectors also select presentation contracts assigned to Plan 127-06 and did not isolate the high-severity Plan 127-05 revision/projection/lifetime threats.
- **Fix:** Added a dedicated route suite proving invalid-before-build, conflict-before-evidence, one evaluator/projection, frozen exact model transfer, path/secret canary removal, snapshot scope, same-service cache reuse, cold restart, and base-snapshot laziness.
- **Files created:** `tests/service/stale-workspace-route.test.ts`
- **Commit:** `e4ca8c71`

**3. [Rule 1 - False Verdict Prevention] Failed closed on repository identity drift**
- **Found during:** Task 2 security review
- **Issue:** Joining status only by a potentially stale definition ID could turn an identity mismatch into `exists: false` and risk false managed-worktree-missing evidence.
- **Fix:** Require definition/projection ID and mode agreement, validate status name/mode when present, and return sanitized `operation_failed` on inconsistency.
- **Files modified:** `packages/service/src/secure/router.ts`
- **Commit:** `e4ca8c71`

**4. [Rule 1 - State Tracking] Corrected malformed SDK decision labels and stale activity metadata**
- **Found during:** Plan closeout state updates
- **Issue:** `state.add-decision` inserted the four Plan 127-05 decisions as `[Phase ?]`, and `state.advance-plan` retained the Plan 127-04 activity description.
- **Fix:** Relabeled all four entries to Phase 127, updated both activity fields to the Plan 127-05 result, and normalized the metric duration while preserving Plan 6 position and 33/42 progress.
- **Files modified:** `.planning/STATE.md`
- **Commit:** Final plan metadata commit

**Total deviations:** 4 auto-fixed correctness/security/state-tracking gaps.
**Impact on plan:** The changes preserve the requested route and lifecycle scope while making notes and repository evidence fail closed, directly verifiable, and accurately tracked.

## Authentication Gates

None. The runtime check used an isolated local file-backed key store and did not require credentials or live provider access.

## Issues Encountered

- The plan's Task 1 selector (`projection|client|disclosure`) also selects browser presentation tests whose `packages/web/src/stale-workspaces.ts` module belongs to Plan 127-06. Those expected RED failures were not bypassed or implemented early; service-boundary verification used the focused route/schema suites and the real secure client surface.
- Directly running `tests/architecture/phase127-stale-authority.test.mjs` produced 42 passing checks and two expected Plan 127-06 RED checks for the missing shared/web/TUI presentation modules and scoped refresh registry. These are recorded in `deferred-items.md`; the repository's current `npm run test:architecture` package gate passes.
- The first runtime negative probe used an intentionally malformed non-numeric revision and was correctly rejected by the trusted client's strict request parser before send. Repeating with valid stale revision `0` reached the service and returned `{ code: "conflict" }` with static copy.
- Runtime verification used an isolated `/tmp/git-stacks-stale-route.RrMubG` configuration root. The detached verification service was stopped and confirmed not alive after the check; no project or external repository data was mutated.
- No dependency install, authentication gate, package publication, tag, push, release creation, release workflow, or outward-facing action occurred.

## Verification

- `GIT_STACKS_KEY_STORE=file npx vitest run tests/service/stale-workspace-route.test.ts tests/service/web-stale-workspaces-schema.test.ts tests/service/web-workflow-authority.test.ts` — 3 files, 32/32 tests pass.
- `GIT_STACKS_KEY_STORE=file npx vitest run tests/lib/service/stale-workspaces.test.ts` — 1 file, 49/49 tests pass.
- `npm run typecheck --workspace @git-stacks/service` — pass.
- `npm run build --workspace @git-stacks/service` — pass.
- `npm run test:architecture` — `Package architecture: OK`.
- `git diff --check` — pass.
- Real public package path: `fetchCoreState()` followed by `fetchStaleWorkspaceEvaluation({ expected_revision: "1", force_refresh: false })` returned a schema-valid empty response; a valid stale revision `0` returned `conflict` over the managed local TLS secure service.
- The isolated verification service was sent `SIGTERM` and a subsequent process probe reported `service_process_alive: false`.
- Both task commits used normal hooks, no tracked file was deleted, and no release or external mutation action was performed.

## Known Stubs

None. Empty arrays in projection/router code are bounded accumulators or legitimate all-clear responses; default option objects are composition defaults. No TODO, FIXME, placeholder copy, hardcoded UI data, mock production data source, or unwired component was introduced.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: local-note-count-access | `packages/service/src/policy/core-state.ts` | Stale evaluation adds a validated workspace note-count read after revision equality. Only the integer count enters the internal frozen model; note text, filesystem paths, and errors are not projected, and stale conflicts perform zero reads. |

## User Setup Required

None. The route is available through the existing managed service and official secure client; no new configuration, credentials, daemon lifecycle command, or provider setup is required.

## Next Phase Readiness

- Plan 127-06 can now consume one strict abortable trusted fetch seam and the path-free stale response without importing service/core authority into browser or TUI presentation modules.
- Plan 127-09 retains the explicit hostile mutation, capability-graph, and future shared/web/TUI architecture verification boundary.
- The two future presentation checks remain intentionally deferred, while all Plan 127-05 route, revision, projection, cache-lifetime, and secure-client requirements are green.

## Self-Check: PASSED

- All five modified production files, the focused route test, the deferred-item record, and this summary exist at their required paths.
- Task commits `986390e2` and `e4ca8c71` exist in Git history.
- The plan commit range contains no tracked file deletion.
- Verification completed before state advancement and metadata commit.

---
*Phase: 127-stale-workspace-intelligence-and-rc-closure*
*Completed: 2026-07-17*
