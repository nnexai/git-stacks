---
phase: 76-integration-plugin-capability-contracts
plan: 01
subsystem: integrations
tags: [typescript, capability-contracts, integration-plugins, runner, type-safety]

# Dependency graph
requires: []
provides:
  - Capability union type exported from types.ts with 6 members (generate, cleanup, commands, configExample, windowDetection, applies)
  - Integration interface required field capabilities: ReadonlySet<Capability>
  - All 10 plugins declare capabilities via new Set<Capability>([...]) with correct members
  - runner.ts uses capabilities.has() for all 6 duck-typing sites (generate, cleanup, applies, windowDetection)
affects:
  - 76-02 (any future runner work that adds new gating patterns)
  - Any future third-party integration authors who implement the Integration interface

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capability-declared contracts: plugins declare what they provide via ReadonlySet<Capability>, runner gates calls via .has() instead of optional chaining"
    - "TDD: typecheck RED (interface change breaks all plugins) -> GREEN (all plugins add capabilities)"

key-files:
  created: []
  modified:
    - src/lib/integrations/types.ts
    - src/lib/integrations/vscode.ts
    - src/lib/integrations/intellij.ts
    - src/lib/integrations/cmux.ts
    - src/lib/integrations/tmux.ts
    - src/lib/integrations/niri.ts
    - src/lib/integrations/aerospace.ts
    - src/lib/integrations/github.ts
    - src/lib/integrations/gitlab.ts
    - src/lib/integrations/gitea.ts
    - src/lib/integrations/jira.ts
    - src/lib/integrations/runner.ts
    - tests/lib/integrations/runner.test.ts
    - tests/lib/integrations/window-detector.test.ts
    - tests/tui/workspace-wizard.test.ts

key-decisions:
  - "Capability field is required (not optional) on Integration interface — enforces all plugins declare capabilities at compile time"
  - "aerospace includes 'cleanup' in its capabilities even though cleanup is a no-op, since capabilities describe method presence not behavior"
  - "Runner uses non-null assertion (!) after .has() gate rather than optional chaining — makes gating explicit and eliminates accidental fallthrough"

patterns-established:
  - "capabilities: new Set<Capability>([...]) pattern: place capabilities field after order in each plugin object literal"
  - "Runner gate pattern: capabilities.has('x') && integration.x!(ctx) — capability check then non-null call"

requirements-completed:
  - ENGN-07
  - ENGN-08

# Metrics
duration: 14min
completed: 2026-04-06
---

# Phase 76 Plan 01: Integration Plugin Capability Contracts Summary

**Typed capability declarations on all 10 integration plugins replace duck-typed optional chaining in runner.ts, making plugin contracts explicit and compiler-enforced via ReadonlySet<Capability>**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-06T03:21:42Z
- **Completed:** 2026-04-06T03:35:42Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Added `Capability` union type to `types.ts` and made `capabilities: ReadonlySet<Capability>` a required field on `Integration` interface
- Declared capability sets on all 10 plugin files (vscode, intellij, cmux, tmux, niri, aerospace, github, gitlab, gitea, jira) with correct members per plan spec
- Replaced all 6 duck-typing sites in `runner.ts` (optional chaining on generate/cleanup, property-existence checks on applies/windowDetector) with `capabilities.has()` calls
- Updated test fakes in runner.test.ts, window-detector.test.ts, and workspace-wizard.test.ts to add the required capabilities field

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Capability type to Integration interface and declare capabilities on all 10 plugins** - `0cefee93` (feat)
2. **Task 2: Replace optional chaining in runner.ts with capability-gated calls and update test fakes** - `fa3ab7bc` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `src/lib/integrations/types.ts` - Added `Capability` type export and `capabilities: ReadonlySet<Capability>` required field on `Integration`
- `src/lib/integrations/vscode.ts` - `capabilities: new Set<Capability>(['generate', 'commands', 'configExample'])`
- `src/lib/integrations/intellij.ts` - `capabilities: new Set<Capability>(['generate', 'applies'])`
- `src/lib/integrations/cmux.ts` - `capabilities: new Set<Capability>([])`
- `src/lib/integrations/tmux.ts` - `capabilities: new Set<Capability>(['cleanup', 'commands', 'configExample'])`
- `src/lib/integrations/niri.ts` - `capabilities: new Set<Capability>(['cleanup', 'commands', 'configExample', 'windowDetection'])`
- `src/lib/integrations/aerospace.ts` - `capabilities: new Set<Capability>(['cleanup', 'commands', 'configExample', 'windowDetection'])`
- `src/lib/integrations/github.ts` - `capabilities: new Set<Capability>(['commands'])`
- `src/lib/integrations/gitlab.ts` - `capabilities: new Set<Capability>(['commands'])`
- `src/lib/integrations/gitea.ts` - `capabilities: new Set<Capability>(['commands'])`
- `src/lib/integrations/jira.ts` - `capabilities: new Set<Capability>(['commands'])`
- `src/lib/integrations/runner.ts` - All 6 duck-typing sites replaced with capabilities.has() gates
- `tests/lib/integrations/runner.test.ts` - Fakes updated with capabilities field, runIntegrationCleanup tests added
- `tests/lib/integrations/window-detector.test.ts` - Fakes updated with capabilities field
- `tests/tui/workspace-wizard.test.ts` - Fakes updated with capabilities and order fields

## Decisions Made

- `capabilities` is a required field (not optional) — this ensures TypeScript enforces the contract at compile time. Any new integration that doesn't declare capabilities will be caught immediately by `bun run typecheck`.
- `aerospace` includes `'cleanup'` even though its `cleanup()` is a no-op. Capability describes method presence, not meaningful behavior.
- Non-null assertion (`!`) is used after `.has()` gates rather than optional chaining — makes the gating contract explicit and eliminates silent fallthrough.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed window-detector.test.ts fakes missing capabilities field**
- **Found during:** Task 2 (runner.ts update)
- **Issue:** `window-detector.test.ts` fake integrations had no `capabilities` field; runner's new `.has()` call threw `TypeError: undefined is not an object`
- **Fix:** Added `capabilities: new Set(["windowDetection"])` to `windowIntegration`, `new Set([])` to `nonWindowIntegration` and `consumerIntegration`
- **Files modified:** `tests/lib/integrations/window-detector.test.ts`
- **Verification:** `bun test tests/lib/integrations/window-detector.test.ts` — 12 pass, 0 fail
- **Committed in:** `fa3ab7bc` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed workspace-wizard.test.ts fakes missing capabilities field**
- **Found during:** Task 2 (full suite run)
- **Issue:** `workspace-wizard.test.ts` fake integrations had no `capabilities` field; runner's `.has()` call threw `TypeError`
- **Fix:** Added `capabilities: new Set(["generate"])` and `order` to both `vscode` and `tmux` fakes
- **Files modified:** `tests/tui/workspace-wizard.test.ts`
- **Verification:** `bun test tests/tui/workspace-wizard.test.ts` — 7 pass, 0 fail
- **Committed in:** `fa3ab7bc` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in test fakes caused by required capabilities field)
**Impact on plan:** Both fixes necessary for correctness. No scope creep — only test fakes that needed to satisfy the new required interface field.

## Issues Encountered

None — plan executed as specified. TDD RED/GREEN flow worked well: adding `capabilities` as required to the interface immediately broke all 10 plugins in typecheck (RED), then adding the field to each plugin brought it back to GREEN.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes. The `Capability` type is non-sensitive metadata about optional method presence.

## Next Phase Readiness

- Phase 76-02 (if exists) can rely on `capabilities.has()` as the established gating pattern
- Capability contracts are now the authoritative source for runner gating decisions
- TypeScript enforces capability declarations on all future integration additions

## Self-Check: PASSED

All files present: types.ts, runner.ts, SUMMARY.md
All commits present: 0cefee93, fa3ab7bc

---
*Phase: 76-integration-plugin-capability-contracts*
*Completed: 2026-04-06*
