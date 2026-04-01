---
phase: 51-workspace-port-allocation
plan: "03"
subsystem: workspace-ops, commands
tags: [port-allocation, workspace-lifecycle, env-injection, cli-flags]
dependency_graph:
  requires: ["51-01", "51-02"]
  provides: ["PORT-INJECT-01", "PORT-FREE-01"]
  affects: ["src/lib/workspace-ops.ts", "src/commands/workspace.ts"]
tech_stack:
  added: []
  patterns: ["allocatePorts called before buildBaseEnv in openWorkspace", "mergeEnv injects resolved ports as string env vars"]
key_files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - src/commands/workspace.ts
    - tests/lib/workspace-ops.test.ts
decisions:
  - "removeWorkspace implicitly frees ports via YAML deletion — no separate cleanup needed (PORT-FREE-01)"
  - "wsWithPorts variable used downstream in openWorkspace to propagate port-resolved workspace state"
  - "openWorkspace passes reallocate option through from CLI to allocatePorts"
metrics:
  duration: "11min"
  completed: "2026-04-01"
  tasks_completed: 2
  files_modified: 3
---

# Phase 51 Plan 03: Wire Port Allocator into Workspace Lifecycle Summary

Port allocation wired into openWorkspace lifecycle — allocatePorts called before buildBaseEnv; resolved ports injected as env vars via mergeEnv; --reallocate flag added to open command.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Wire allocatePorts into openWorkspace, update mergeEnv, add tests | 8695db9 | src/lib/workspace-ops.ts, tests/lib/workspace-ops.test.ts |
| 2 | Add --reallocate flag to open command | 866485b | src/commands/workspace.ts |

## What Was Built

**openWorkspace changes:**
- `reallocate?: boolean` added to opts type
- `allocatePorts(workspace, config, { reallocate: opts.reallocate ?? false })` called immediately after reading workspace and config, before any downstream processing
- If `portResult.changed`, writes back with `writeWorkspace(wsWithPorts)` and logs progress
- All subsequent workspace references use `wsWithPorts` (the port-resolved workspace)
- The `readWorkspace(name)` near the end for `last_opened` update is intentionally kept — re-reads from disk after port write

**mergeEnv changes:**
- Iterates `workspace.ports` and adds resolved (non-null) values as `merged[key] = String(value)`
- Null (unresolved) ports are skipped
- Port values appear in hook env, integration context env, and written to env_file

**open command changes:**
- `.option("--reallocate", "Reallocate conflicting ports")` added
- opts type includes `reallocate?: boolean`
- `openWorkspace` call passes `reallocate: opts.reallocate`

**removeWorkspace (PORT-FREE-01):**
- No code changes needed — deleting the workspace YAML removes the resolved port values; `buildTakenSet` will not see those ports on next scan

## Test Coverage

Added 4 tests in `describe("mergeEnv port injection (PORT-INJECT-01)")`:
1. Resolved ports injected as string env vars
2. Null (unresolved) ports skipped
3. No ports field — returns only env
4. Merges env and ports (ports after env)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/lib/workspace-ops.ts` — exists, contains `allocatePorts`, `wsWithPorts`, `workspace.ports` injection
- `src/commands/workspace.ts` — exists, contains `--reallocate`
- `tests/lib/workspace-ops.test.ts` — exists, contains `PORT-INJECT-01`
- Commits 8695db9 and 866485b verified in git log
