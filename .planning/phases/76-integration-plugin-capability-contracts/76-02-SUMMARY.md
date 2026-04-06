---
phase: 76-integration-plugin-capability-contracts
plan: 02
subsystem: integrations
tags: [typescript, capability-contracts, integration-plugins, cli-output, table-formatting]

# Dependency graph
requires:
  - phase: 76-01
    provides: "Capability union type and capabilities: ReadonlySet<Capability> required field on all 10 plugins"
provides:
  - "integration list table output includes Capabilities column with abbreviated tags (gen, clean, cmd, cfg, win, apl)"
  - "integration list --json includes capabilities array with full capability names per plugin"
  - "TAG_MAP constant in integration.ts maps Capability names to abbreviated display tags"
affects:
  - Any future work adding new Capability members (TAG_MAP must be updated)
  - Users relying on integration list output format (column width changed)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TAG_MAP pattern: Record<string, string> constant at module top maps Capability names to abbreviated display tags"
    - "JSON-first branching: JSON output branch runs before table rendering, uses separate loop for clean separation"
    - "Sorted abbreviated tags: [...i.capabilities].map(c => TAG_MAP[c] ?? c).sort().join(' ') — alphabetical for stable output"

key-files:
  created: []
  modified:
    - src/commands/integration.ts
    - tests/lib/integration-commands.test.ts

key-decisions:
  - "TAG_MAP placed at module top (above integrationCommand) per D-06 — keeps abbreviations close to their use and avoids closure capture issues"
  - "JSON branch moved above table rendering so rows variable (with caps field) is only computed for table output — avoids computing caps for JSON callers"
  - "Tags sorted alphabetically in table output — ensures stable, predictable display regardless of Set insertion order"

patterns-established:
  - "TAG_MAP pattern: module-level Record<string, string> for display abbreviations — any new Capability member gets an entry here"

requirements-completed:
  - ENGN-09

# Metrics
duration: 2min
completed: 2026-04-06
---

# Phase 76 Plan 02: Integration Plugin Capability Contracts (CLI Output) Summary

**Capabilities column added to `integration list` table output with abbreviated tags (gen/clean/cmd/cfg/win/apl) and full capability names in --json output, completing ENGN-09**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-06T03:39:20Z
- **Completed:** 2026-04-06T03:41:31Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added `TAG_MAP` constant mapping all 6 Capability names to abbreviated display tags
- Updated `integration list` table to include "Capabilities" column (14+18+9+12+20 char layout) with sorted abbreviated tags
- Updated `integration list --json` to include `capabilities: [...i.capabilities]` array with full capability names per plugin
- Reorganized list action: JSON branch executes first (separate loop), table rendering follows — clean separation
- Added 3 new tests covering: Set instance check on all integrations, TAG_MAP/Capabilities column presence, JSON capabilities array presence

## Task Commits

Each task was committed atomically:

1. **Task 1: Add capabilities column to integration list table and JSON output** - `265215a9` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `src/commands/integration.ts` — Added TAG_MAP constant, updated list action with Capabilities column (table) and capabilities array (JSON)
- `tests/lib/integration-commands.test.ts` — Added 3 new tests for capabilities field, TAG_MAP presence, and JSON output

## Decisions Made

- TAG_MAP placed at module top above `integrationCommand` — consistent with D-06 from research, avoids closure capture issues
- JSON branch moved above table rendering (uses own loop) so `caps` computation is skipped entirely for JSON callers
- Tags sorted alphabetically — stable output regardless of Set insertion order

## Deviations from Plan

None - plan executed exactly as written. The file-content-based test approach (reading integration.ts source with `require("fs")`) was chosen over mocking the command action — this tests the actual source artifact exists and is correct, matching the plan's acceptance criteria wording.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 76 complete: capability contracts (76-01) and CLI surface (76-02) both done
- ENGN-07, ENGN-08, ENGN-09 all fulfilled
- Any new integration author sees capabilities in `integration list` immediately — no extra work needed

## Known Stubs

None.

## Threat Flags

None — capabilities are non-sensitive metadata. No new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

Files present:
- src/commands/integration.ts — FOUND
- tests/lib/integration-commands.test.ts — FOUND
- .planning/phases/76-integration-plugin-capability-contracts/76-02-SUMMARY.md — (this file)

Commits present:
- 265215a9 — feat(76-02): add capabilities column to integration list table and JSON output

---
*Phase: 76-integration-plugin-capability-contracts*
*Completed: 2026-04-06*
