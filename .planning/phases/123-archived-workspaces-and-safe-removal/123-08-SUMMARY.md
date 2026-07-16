---
phase: 123-archived-workspaces-and-safe-removal
plan: "08"
subsystem: verification
tags: [full-gates, packaged-service, lifecycle-uat, disposable-fixture, release-boundary]

requires:
  - phase: 123-archived-workspaces-and-safe-removal
    provides: Core, protocol, terminal, coordinator, transport, web, and TUI lifecycle implementations from Plans 01-07
provides:
  - Complete focused and repository-wide automated Phase 123 gate evidence
  - Real packaged CLI/service snapshot, ordering, lifecycle, dirty-force, and target-deletion evidence
  - Fail-closed stop-before-delete fixture cleanup evidence
  - Durable non-blocking Phase 127 live browser and OpenTUI verification handoff
affects: [123-phase-verification, 124-shell-authority, 127-milestone-end-live-uat]

tech-stack:
  added: []
  patterns: [guarded disposable fixture, official-client lifecycle probe, stop-before-delete cleanup, manual-approval boundary]

key-files:
  created:
    - .planning/phases/123-archived-workspaces-and-safe-removal/123-08-SUMMARY.md
  modified:
    - packages/service/src/policy/snapshot.ts
    - packages/service/src/policy/core-state.ts
    - tests/lib/service/snapshot.test.ts
    - .planning/phases/123-archived-workspaces-and-safe-removal/123-02-SUMMARY.md

key-decisions:
  - "Executor-operable package, CLI, service, snapshot, and lifecycle checks are Phase 123 evidence; live browser pointer/keyboard and final OpenTUI rendering remain the Phase 127 milestone-end human gate."
  - "A live-discovered date-only created fallback is normalized at the service projection boundary instead of weakening the protocol datetime contract or rewriting authoritative workspace YAML."
  - "Disposable fixture deletion is authorized only after the built CLI reports a successful service stop."

patterns-established:
  - "Live lifecycle validation uses the built official service client and strict stable-ID/revision request schemas; it does not invent transport request shapes."
  - "A failed live probe returns to its owning implementation plan for repair, then restarts from a fresh isolated fixture before closure."

requirements-completed: [ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05, ARCH-06, REMOVE-01, REMOVE-02, REMOVE-03, REMOVE-04, REMOVE-05]

coverage:
  - id: D1
    description: "Focused lifecycle, protocol conformance, rendered TUI, full repository, type, dependency, and architecture gates prove the complete Phase 123 automated contract."
    requirement: ARCH-01
    verification:
      - kind: integration
        ref: "GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run [12 Phase 123 focused files]#202 tests"
        status: pass
      - kind: automated_ui
        ref: "tests/tui/dashboard/integ-workspace-archive-remove.test.tsx#6 tests and 47 assertions"
        status: pass
      - kind: other
        ref: "npm test && npm run typecheck && npm run test:deps && npm run verify:gates"
        status: pass
    human_judgment: false
  - id: D2
    description: "Built package outputs and the real local service accept nine CLI-created workspaces, preserve shared successor ordering, and execute archive, stale rejection, unarchive, clean remove, dirty block, and exact-name force remove through official client contracts."
    requirement: ARCH-02
    verification:
      - kind: integration
        ref: "fresh guarded fixture#official fetchCoreState and fetchWorkspaceCreationCatalog"
        status: pass
      - kind: integration
        ref: "fresh guarded fixture#runWorkspaceLifecycleMutation archive/unarchive/remove/force-remove"
        status: pass
    human_judgment: false
  - id: D3
    description: "The disposable fixture proves target-only removal, preserves an unrelated dirty target, and is deleted only after successful service shutdown."
    requirement: REMOVE-04
    verification:
      - kind: integration
        ref: "fresh guarded fixture#FILESYSTEM_TARGET_SAFETY PASS and SERVICE_STOP_EXIT=0 before GUARDED_FIXTURE_DELETE=PASS"
        status: pass
    human_judgment: false
  - id: D4
    description: "The complete live browser/OpenTUI checklist remains durably assigned to Phase 127 after automated and hosted gates and before release side effects."
    requirement: ARCH-05
    verification:
      - kind: other
        ref: ".planning/STATE.md#Milestone-End Manual Verification"
        status: pass
    human_judgment: false

duration: 22 min
completed: 2026-07-16
status: complete
---

# Phase 123 Plan 08: Full Gates and Packaged Lifecycle Evidence Summary

**Repository-wide gates plus a real packaged service fixture prove revision-bound archive, removal, dirty-force, and fail-closed cleanup while preserving live UI approval for the milestone-end human gate**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-16T07:43:23Z
- **Completed:** 2026-07-16T08:05:24Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Passed the focused Phase 123 contract set, built protocol conformance, dedicated rendered OpenTUI lifecycle suite, complete repository tests, every workspace typecheck, package architecture, and repository inventory/coverage gates.
- Provisioned nine isolated workspaces with the built CLI and proved the real packaged service's official catalog, date-normalized activity, shared successor order, revision changes, stale rejection, typed dirty failure, clean removal, and exact-name Force Remove contracts.
- Verified actual target-only YAML/worktree/directory deletion while preserving an unrelated dirty target, then stopped the service successfully before guarded fixture deletion.
- Preserved the complete live browser pointer/keyboard and final OpenTUI interaction checklist in STATE.md for Phase 127; no automated or render-harness result is represented as human approval.

## Task Commits

Each task was committed atomically:

1. **Task 1: Run focused, cross-client, architecture, and full phase gates** - `8d3ef1d1` (chore)
2. **Task 2: Run autonomous packaged-client, service, CLI, and disposable-fixture validation** - `0245d413` (chore)

Live-discovered owner repair:

- **Normalize date-only catalog activity** - `4479a5e6` (fix, Plan 02 owner)
- **Record the Plan 02 repair evidence** - `afbd173f` (docs, Plan 02 owner)

## Automated Gate Evidence

Task 1 ran the exact plan command:

```text
GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/lib/config.test.ts tests/lib/workspace-archive.test.ts tests/lib/workspace-pins.test.ts tests/lib/workspace-lifecycle.test.ts tests/lib/service/snapshot.test.ts tests/lib/service/operations.test.ts tests/lib/service/workspace-lifecycle-operations.test.ts tests/service/web-terminal.test.ts tests/service/web-projection.test.ts tests/service/web-presentation.test.ts tests/commands/workspace-lifecycle.test.ts tests/commands/workspace-destructive-safety.test.ts && npm run build:packages && GIT_STACKS_KEY_STORE=file node --test tests/conformance/protocol-client.test.mjs && bun test --preload @opentui/solid/preload tests/tui/dashboard/integ-workspace-archive-remove.test.tsx && npm test && npm run typecheck && npm run test:deps && npm run verify:gates
```

Results before the live probe:

- Focused Vitest: 12 files, 202 tests, 0 skipped, exit 0.
- Built protocol/client conformance: 4 tests, exit 0.
- Dedicated rendered TUI lifecycle: 6 tests, 47 assertions, exit 0.
- Full repository: 136 Vitest files / 1,787 tests, 42 Node tests, and the complete OpenTUI matrix, exit 0.
- TypeScript: protocol, client, core, CLI, service, web, and TUI workspaces all exit 0.
- Architecture: `Package architecture: OK`; the real package graph, browser/client/core/CLI/TUI forbidden-import tests, daemonless CLI, and self-contained browser distribution checks pass.
- Repository gate: `verify:gates passed: inventory, mapped tests, and coverage artifacts are aligned.`

After the live-discovered repair, Task 2 reran:

```text
npm run build:packages && npm run web:build && npm run tui:build && GIT_STACKS_KEY_STORE=file node packages/cli/dist/index.js --help >/dev/null && GIT_STACKS_KEY_STORE=file node packages/cli/dist/index.js service --help >/dev/null && npm test && npm run typecheck && npm run test:deps && npm run verify:gates
```

The post-repair result is 136 Vitest files / 1,788 tests, 42 Node tests, the complete OpenTUI matrix, all seven workspace typechecks, `Package architecture: OK`, and a passing `verify:gates`; every command exited 0.

## Packaged Fixture Evidence

The fixture used the complete guarded setup under STATE.md `## Milestone-End Manual Verification`, including the exact supported creation loop:

```text
for name in uat-order-1 uat-order-2 uat-order-3 uat-order-4 uat-order-5 uat-clean-web uat-clean-tui uat-dirty-web uat-dirty-tui; do node packages/cli/dist/index.js new "$name" --from phase123-uat --branch "uat/$name" --non-interactive || exit 1; done
```

- Built CLI `list --json` returned all nine workspaces. `paths` resolved independent managed worktrees for `uat-dirty-web` and `uat-dirty-tui`; each `git status --short` reported only its intentional untracked file, and the CLI reported `dirtyRepos: ["phase123-source"]` for exactly those two targets.
- Exact successor metadata read back successfully. Sorting the live official state with packaged `workspaceSuccessorOrder` returned `uat-order-1`, `uat-order-2`, `uat-order-4`, `uat-order-3`, `uat-order-5`, proving pin, priority, and activity order against real data.
- `node packages/cli/dist/index.js service start` created the real protected local service, and `service status` returned protocol `git-stacks/2`, a live PID, listener epoch, service identity, and loopback WebTransport endpoint.
- Official built-client `fetchCoreState()` returned revision `1`, 9 active, 0 archived, and 9 valid RFC3339 activity timestamps. The four CLI-created workspaces without `last_opened` projected their date-only `created` fallback as `2026-07-16T00:00:00.000Z` after the repair. `fetchWorkspaceCreationCatalog()` returned template `phase123-uat` and repository `phase123-source`.

The built official client then called `runWorkspaceLifecycleMutation` with strict request bodies:

```text
{ kind: "workspace.archive", workspace_id, expected_revision: "1" }
{ kind: "workspace.unarchive", workspace_id, expected_revision: "1" }  # stale probe
{ kind: "workspace.unarchive", workspace_id, expected_revision: "2" }
{ kind: "workspace.remove", workspace_id, expected_revision: "3" }
{ kind: "workspace.remove", workspace_id, expected_revision: "4" }     # dirty probe
{ kind: "workspace.force-remove", workspace_id, expected_revision: "4", confirmation_name: "uat-dirty-web" }
```

Observed authoritative results:

- Archive succeeded at revision `2`, with `terminals_stopped: true`; active state lost the target and the minimal archived collection gained it.
- Reusing revision `1` for unarchive failed with typed `conflict` and `Authoritative workspace revision is stale`; no request replay occurred.
- Fresh unarchive succeeded at revision `3` and restored the same stable-ID workspace to active state.
- Clean removal of `uat-clean-web` succeeded at revision `4` after all five real stages: `stopping_terminals`, `checking_worktrees`, `removing_worktrees`, `deleting_workspace_files`, `reconciling_state`.
- Normal removal of `uat-dirty-web` failed after `stopping_terminals` and `checking_worktrees` with lifecycle `{ kind: "workspace_dirty", blocking_repositories: ["phase123-source"], terminals_stopped: true, force_allowed: true }`.
- A new exact-name Force Remove intent succeeded at revision `5` with all five stages. Final official state contained 7 active, 0 archived workspaces.
- The removed targets' YAML, managed worktree, and workspace directories were absent. `uat-dirty-tui` and its dirty file remained present, proving target-only deletion.

## Cleanup Evidence

Both the initial bug-discovery fixture and the post-repair proof fixture followed the fail-closed sequence. For the successful proof fixture:

```text
node packages/cli/dist/index.js service status >/dev/null
node packages/cli/dist/index.js service stop
test -n "$PHASE123_UAT_ROOT" && test -d "$PHASE123_UAT_ROOT" && test "$PHASE123_UAT_ROOT" != /
case "$(basename "$PHASE123_UAT_ROOT")" in git-stacks-123-*) rm -rf -- "$PHASE123_UAT_ROOT" ;; *) exit 1 ;; esac
test ! -e "$PHASE123_UAT_ROOT"
```

The stop command printed `git-stacks service stopped` and exited 0 before deletion. The guarded deletion passed, and no fixture or service process was retained.

## Files Created/Modified

- `.planning/phases/123-archived-workspaces-and-safe-removal/123-08-SUMMARY.md` - Exact automated, packaged, fixture, cleanup, limitation, and repair evidence.
- `packages/service/src/policy/snapshot.ts` - Plan 02 owner repair normalizes date-only activity fallback to a protocol-valid UTC datetime.
- `packages/service/src/policy/core-state.ts` - Shared trusted-state normalization follows the same canonical activity contract.
- `tests/lib/service/snapshot.test.ts` - Regression coverage for supported CLI-created workspaces with date-only `created` and no `last_opened`.
- `.planning/phases/123-archived-workspaces-and-safe-removal/123-02-SUMMARY.md` - Owner repair evidence and decision record.

## Decisions Made

- Used only the supported built CLI and exported official service-client functions for live probes; no private or invented RPC request shape was accepted as evidence.
- Kept the protocol timestamp strict and normalized the legacy date-only fallback at projection time, preserving authoritative YAML compatibility.
- Treated service stop as a hard cleanup prerequisite even though the CLI reports success when no service is running; no stop error was suppressed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Live Contract Bug] Normalized CLI date-only activity fallback**
- **Found during:** Task 2 official `fetchCoreState()` probe
- **Issue:** Supported CLI-created workspace YAML stores `created: YYYY-MM-DD`. When `last_opened` was absent, Plan 02 copied that date directly into protocol `activity_at`, causing strict CoreState validation to fail with `internal_error` before any lifecycle probe.
- **Fix:** Routed the defect to the Plan 02 owner. The owner normalized date-only values to UTC midnight at the service projection boundary, kept offset-aware timestamps unchanged, shared the normalization with trusted core state, and added a regression test. The failed fixture was stopped and deleted; all live validation restarted from a fresh fixture.
- **Files modified:** `packages/service/src/policy/snapshot.ts`, `packages/service/src/policy/core-state.ts`, `tests/lib/service/snapshot.test.ts`, `123-02-SUMMARY.md`
- **Verification:** Focused snapshot coverage, full 1,788-test Vitest suite, Node 42/42, complete TUI suite, all type/dependency/repository gates, and fresh official live state/lifecycle probes pass.
- **Committed in:** `4479a5e6`, `afbd173f`

---

**Total deviations:** 1 auto-fixed (1 live contract bug). **Impact:** The strict protocol and authoritative YAML remain unchanged; supported CLI-created workspaces now work in the real service without scope expansion.

## Issues Encountered

- The first live fixture correctly failed closed on the date-only activity bug. Its service stop succeeded and guarded deletion completed before the owner repair; no contaminated fixture was reused.
- OpenTUI tests continue to print their existing `Possible EventTarget memory leak detected` diagnostic while exiting 0; no test failed, and this verification-only plan did not broaden into unrelated renderer cleanup.

## Interactive Verification Boundary

Automated browser projection/presentation tests and rendered OpenTUI harnesses prove request shapes, strict failures, successor ordering, minimal archive data, and reconciliation logic. They do **not** prove live pointer/keyboard focus, final browser modal behavior, terminal rendering, or human-visible interaction quality.

The complete reproducible browser and OpenTUI checklist remains in STATE.md under `## Milestone-End Manual Verification`. Phase 127 owns that human pass only after its automated and hosted gates and before any tag, push, publish, or release. Plan 08 did not claim, simulate, or auto-approve it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 123 automated and executor-operable live evidence is complete with no retained service or fixture.
- Phase 124 may begin; the Phase 127 milestone-end manual verification handoff remains intact and non-blocking.
- No tag, push, publish, release, or final milestone verification was performed or implied.

## Self-Check: PASSED

- Task commits `8d3ef1d1` and `0245d413`, plus owner repair commits `4479a5e6` and `afbd173f`, exist in history.
- Every automated, package, service, CLI, lifecycle, cleanup, and repository gate reported above exited 0 after repair.
- The summary exists, every Phase 123 requirement is listed, and no live browser/OpenTUI human approval is claimed.

---
*Phase: 123-archived-workspaces-and-safe-removal*
*Completed: 2026-07-16*
