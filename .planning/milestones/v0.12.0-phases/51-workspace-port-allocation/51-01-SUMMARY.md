---
phase: 51-workspace-port-allocation
plan: "01"
subsystem: config
tags: [ports, schema, fsync, writeYaml, paths]
dependency_graph:
  requires: []
  provides: [PortsSchema, PORTS_LOCK_FILE, hardened-writeYaml, ports-schema-fields]
  affects: [src/lib/config.ts, src/lib/paths.ts, tests/helpers.ts, tests/lib/config.test.ts]
tech_stack:
  added: []
  patterns: [fsync-before-rename atomic write, Zod optional record schema]
key_files:
  created: []
  modified:
    - src/lib/config.ts
    - src/lib/paths.ts
    - src/commands/config.ts
    - tests/helpers.ts
    - tests/lib/config.test.ts
decisions:
  - "Use .default(() => ({ range_start: 10000, range_end: 65000 })) factory form for Zod nested default to satisfy strict TypeScript"
  - "Spread existing config in writeGlobalConfig call in commands/config.ts to preserve new ports field across wizard saves"
metrics:
  duration: "~6 minutes"
  completed: "2026-04-01"
  tasks_completed: 2
  files_modified: 5
---

# Phase 51 Plan 01: Schema Foundation + Write Hardening Summary

Atomic fsync-before-rename writeYaml, PortsSchema in WorkspaceSchema/TemplateSchema/GlobalConfigSchema, PORTS_LOCK_FILE path constant, test helpers updated with ports defaults.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Harden writeYaml with fsync, add PortsSchema + schema fields, tests | 0b03091 | src/lib/config.ts, src/commands/config.ts, tests/lib/config.test.ts |
| 2 | Add PORTS_LOCK_FILE constant and update test helpers | 30cecce | src/lib/paths.ts, tests/helpers.ts |

## What Was Built

- **Hardened writeYaml**: Replaced `writeFileSync` with `openSync` + `writeSync` + `fsyncSync` + `closeSync` so data is flushed to disk before the atomic rename. Satisfies PORT-WRITE-01.
- **PortsSchema**: `z.record(z.string(), z.number().nullable()).optional()` — maps port names to allocated numbers or null (unallocated). Exported with `Ports` type alias.
- **WorkspaceSchema.ports**: Optional ports field added after `files`; existing YAMLs without ports parse without error.
- **TemplateSchema.ports**: Same optional ports field added after `includes`.
- **GlobalConfigSchema.ports**: Sub-object with `range_start` (default 10000) and `range_end` (default 65000). Satisfies PORT-SCHEMA-02.
- **PORTS_LOCK_FILE**: `join(WS_CONFIG_DIR, ".ports.lock")` — path constant for future lock-file-based port allocation.
- **Test helpers updated**: `useIsolatedConfig`, `makePathsMock` include `PORTS_LOCK_FILE`; `makeConfigMock.readGlobalConfig` returns ports config defaults.
- **Tests**: 12 new tests covering PORT-WRITE-01 (fsync atomic write), PORT-SCHEMA-01 (workspace/template ports field), PORT-SCHEMA-02 (global config defaults).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed GlobalConfigSchema .default({}) TypeScript error**
- **Found during:** Task 1 typecheck
- **Issue:** `.default({})` fails strict TypeScript because `{}` is not assignable to `{ range_start: number; range_end: number }` — the sub-fields have defaults but TypeScript requires the full shape
- **Fix:** Changed to `.default(() => ({ range_start: 10000, range_end: 65000 }))` factory form
- **Files modified:** src/lib/config.ts
- **Commit:** 0b03091

**2. [Rule 2 - Missing functionality] Preserved ports in config wizard write**
- **Found during:** Task 1 typecheck
- **Issue:** `src/commands/config.ts` line 55 constructed a `writeGlobalConfig` call without the `ports` field — would silently drop ports config on any config wizard save
- **Fix:** Spread `...config` into the object literal so all fields (including ports) are preserved when the wizard writes
- **Files modified:** src/commands/config.ts
- **Commit:** 0b03091

## Verification

- `bun run typecheck`: PASS
- `bun test tests/lib/config.test.ts`: 63/63 pass
- `bun run test`: 370 unit + 37 integration files = all pass

## Known Stubs

None — PortsSchema and PORTS_LOCK_FILE are foundational schema/path additions; no port allocation logic yet (that's Plans 02-04).

## Self-Check: PASSED
