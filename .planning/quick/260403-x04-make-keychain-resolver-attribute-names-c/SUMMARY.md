---
status: complete
phase: quick
plan: 260403-x04
subsystem: secrets
tags: [secrets, keychain, refactor, tdd]
dependency_graph:
  requires: []
  provides: [KeychainAttr, parseKeychainPath, buildKeychainCommand]
  affects: [keychainResolver]
tech_stack:
  added: []
  patterns: [exported-testable-helper, platform-dispatch]
key_files:
  created: []
  modified:
    - src/lib/secrets.ts
    - tests/lib/secrets.test.ts
decisions:
  - "Detection heuristic: presence of '=' in path triggers new syntax; absence triggers legacy slash parsing"
  - "buildKeychainCommand extracted as exported helper to enable platform-specific testing without mocking process.platform"
  - "macOS attribute ordering by position, not key name: first attr→-s, second attr→-a"
metrics:
  duration_seconds: 143
  completed_date: "2026-04-03"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick Plan 260403-x04: Make Keychain Resolver Attribute Names Configurable Summary

**One-liner:** Keychain resolver now accepts arbitrary `key=value,key=value` attributes for Linux secret-tool with backward-compatible legacy `service/account` slash syntax and macOS 2-attribute enforcement.

## What Was Built

- `KeychainAttr` interface (`{ key: string; value: string }`) exported from `src/lib/secrets.ts`
- `parseKeychainPath(path: string): KeychainAttr[]` — exported, parses both new and legacy syntax
- `buildKeychainCommand(attrs: KeychainAttr[], platform: NodeJS.Platform): string[]` — exported, builds platform-specific commands
- Updated `keychainResolver` to consume `parseKeychainPath` + `buildKeychainCommand`
- 20 new tests covering all new behavior; existing 16 tests unchanged and passing

## Behavior Added

**New syntax** (`service=myapp,account=db`):
- Detected by presence of `=` in path
- Splits on `,` then first `=` per pair
- Any number of attributes supported on Linux
- Empty key or empty value throws: `Invalid keychain attribute '...' — expected 'key=value'`

**Legacy syntax** (`myapp/db`):
- Detected by absence of `=`
- Splits on first `/`, maps to `[{key:"service",...},{key:"account",...}]`
- Missing slash throws: `Invalid keychain path '...' — expected 'service/account'`

**Platform dispatch** (`buildKeychainCommand`):
- Linux: `secret-tool lookup <key1> <val1> <key2> <val2> ...` (unlimited attrs)
- macOS: `security find-generic-password -s <val1> [-a <val2>] -w` (max 2 attrs, position-mapped)
- macOS overflow: throws `macOS supports at most 2 keychain attributes (-s service, -a account). Got N.`

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Refactor parseKeychainPath (TDD RED+GREEN) | e172877 | src/lib/secrets.ts, tests/lib/secrets.test.ts |
| 2 | Update keychainResolver + buildKeychainCommand | e172877 | src/lib/secrets.ts, tests/lib/secrets.test.ts |

## Deviations from Plan

None — plan executed exactly as written. Both tasks committed together since the TDD RED phase covered all tests for both tasks, and GREEN implemented everything atomically.

## Known Stubs

None.

## Self-Check: PASSED

- `src/lib/secrets.ts` — exists and exports `KeychainAttr`, `parseKeychainPath`, `buildKeychainCommand`
- `tests/lib/secrets.test.ts` — exists with `parseKeychainPath` and `buildKeychainCommand` describe blocks
- Commit `e172877` — verified present in git log
- All 36 tests pass, full test suite clean, typecheck passes
