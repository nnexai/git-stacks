---
phase: 51-workspace-port-allocation
plan: "02"
subsystem: ports
tags: [ports, allocation, lock, contiguous-block, conflict-detection, merge, tdd]
dependency_graph:
  requires: [PortsSchema, PORTS_LOCK_FILE, src/lib/config.ts, src/lib/paths.ts]
  provides: [acquireLock, buildTakenSet, findContiguousBlock, checkConflicts, allocatePorts, mergePorts]
  affects: [src/lib/ports.ts, tests/lib/ports.test.ts]
tech_stack:
  added: []
  patterns: [O_EXCL atomic lock, first-fit contiguous range allocation, sorted PortRange merge, TDD red-green]
key_files:
  created:
    - src/lib/ports.ts
    - tests/lib/ports.test.ts
  modified: []
decisions:
  - "buildTakenSet merges adjacent ports (10000+10001+10002 -> single range {start:10000,end:10002}); test adjusted to match merged range semantics rather than individual port points"
  - "allocatePorts does not call writeWorkspace — caller (openWorkspace in Plan 03) handles persistence; keeps function pure-ish with only lock file side effect"
  - "process.on('exit', release) registered as backup cleanup inside acquireLock for lock file safety"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-01"
  tasks_completed: 1
  files_modified: 2
---

# Phase 51 Plan 02: Port Allocator Module Summary

Port allocator module with O_EXCL filesystem lock, sorted PortRange merge, first-fit contiguous block search, env/env_file collision detection, template port merge with workspace-wins precedence, and 34 passing unit tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create port allocator module src/lib/ports.ts with TDD | f013b89 | src/lib/ports.ts, tests/lib/ports.test.ts |

## What Was Built

- **acquireLock**: Uses `openSync` with `O_WRONLY | O_CREAT | O_EXCL` for atomic exclusive lock file creation. Retries every 50ms up to 5s timeout. Returns a release function that calls `unlinkSync`. Registers `process.on("exit", release)` as backup cleanup.

- **findContiguousBlock**: First-fit scan across sorted, merged `PortRange[]`. For each gap between taken ranges, checks if `count` ports fit. Returns start port or null if no block fits in `[rangeStart, rangeEnd]`.

- **buildTakenSet**: Collects all resolved (non-null) port values from all workspaces except `excludeName`. Converts to single-point PortRanges, sorts by start, and merges adjacent/overlapping ranges. Returns the consolidated `PortRange[]`.

- **checkConflicts**: Checks port names against `workspace.env` keys (direct collision) and `workspace.env_file` KEY=VALUE lines at each repo's `task_path`. Returns `{ ok: false, error }` with descriptive message on first collision.

- **mergePorts**: Template+workspace merge with workspace-wins precedence via spread `{ ...templatePorts, ...workspacePorts }`. Returns `undefined` when both inputs are undefined.

- **allocatePorts**: Full allocation orchestration — env collision check (fail-fast), lock acquisition, `listWorkspaces()`, `buildTakenSet`, resolved port validation (range + cross-workspace conflict), `reallocate` support for moving conflicting ports to null pool, `findContiguousBlock` for null ports, result comparison for `changed` detection. Does NOT call `writeWorkspace` — pure-ish with only lock side effect.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test assertion for merged PortRange semantics**
- **Found during:** Task 1 GREEN phase (test run)
- **Issue:** Test asserted `.toContain(10001)` on `taken.map(r => r.start)`, but ports 10000, 10001, 10002 are adjacent and merged into single range `{start:10000,end:10002}` — only `.start=10000` appears in the start-map
- **Fix:** Changed assertion to verify merged range: `expect(taken.length).toBe(1)`, `expect(taken[0].start).toBe(10000)`, `expect(taken[0].end).toBe(10002)` — this correctly verifies the merge contract
- **Files modified:** tests/lib/ports.test.ts
- **Commit:** f013b89

**2. [Rule 1 - Bug] Removed unused imports from test file**
- **Found during:** Task 1 typecheck
- **Issue:** `beforeEach`, `mock`, `mkdirSync`, `write` imported but not used — TypeScript strict mode reports TS6133
- **Fix:** Removed unused named imports from bun:test and helpers imports
- **Files modified:** tests/lib/ports.test.ts
- **Commit:** f013b89

## Verification

- `bun test tests/lib/ports.test.ts`: 34/34 pass
- `bun run typecheck`: PASS (no errors)
- `bun run test`: 404 unit + 37 integration files = all pass

## Known Stubs

None — allocatePorts is fully implemented. Plan 03 will wire it into openWorkspace.

## Self-Check: PASSED
