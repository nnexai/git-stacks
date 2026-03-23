---
phase: quick
plan: 260323-cd3
subsystem: module-resolution
tags: [bug-fix, imports, npm-publishing, path-alias]
dependency_graph:
  requires: []
  provides: [working-npm-package]
  affects: [src/commands, src/lib/integrations]
tech_stack:
  added: []
  patterns: [relative-imports-over-path-alias]
key_files:
  created: []
  modified:
    - src/commands/doctor.ts
    - src/commands/install.ts
    - src/commands/repo.ts
    - src/commands/template.ts
    - src/commands/workspace.ts
    - src/lib/integrations/cmux.ts
    - src/lib/integrations/tmux.ts
    - src/lib/integrations/niri.ts
    - package.json
    - CHANGELOG.md
    - CLAUDE.md
decisions:
  - "@/* path alias restricted to test files only; all src/ production code uses relative imports"
  - "Version bumped to 0.7.1 as a patch release for the import fix"
metrics:
  duration: ~10 minutes
  completed: 2026-03-23
  tasks_completed: 3
  tasks_total: 3
  files_changed: 11
---

# Quick Task 260323-cd3: Fix "Cannot find module @/tui/utils" in Published npm Package

**One-liner:** Replaced 8 `@/tui/utils` path alias imports in src/ with relative paths so the published npm package resolves modules correctly at runtime.

## What Was Done

The `git-stacks` CLI crashed on any machine that installed it via npm with:

```
Cannot find module @/tui/utils
```

Root cause: Bun resolves tsconfig path aliases by looking for `tsconfig.json` walking upward from the project root. Inside `node_modules/git-stacks/`, there is no `tsconfig.json`, so the `@/*` alias cannot be resolved. This affected all 8 files that imported from `@/tui/utils`.

## Tasks Completed

### Task 1: Replace @/tui/utils imports (commit fe90fc2)

Replaced `@/tui/utils` with relative paths in all 8 affected files:
- `src/commands/` (5 files): `../tui/utils`
- `src/lib/integrations/` (3 files): `../../tui/utils`

Verification: zero `@/` imports remain in src/ (excluding test files and comments), typecheck passes, 727/727 tests pass.

### Task 2: Version bump + changelog + CLAUDE.md (commit 9312ef2)

- `package.json`: `0.7.0` -> `0.7.1`
- `CHANGELOG.md`: Added v0.7.1 fix entry explaining the root cause
- `CLAUDE.md`: Marked `@/*` as test-only in two locations to prevent recurrence

### Task 3: Verify via npm link (no commit — verification only)

Ran `npm link` and confirmed:
- `git-stacks --version` outputs `0.7.1`
- `git-stacks --help` runs without any "Cannot find module" errors
- All functionality accessible

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

1. `bun run typecheck` — PASS (0 errors)
2. `bun test tests/` — PASS (727/727 tests, 0 failures)
3. No active `@/` imports in src/ — PASS (grep returns zero results)
4. `git-stacks --version` outputs `0.7.1` — PASS
5. `git-stacks --help` runs without module resolution errors — PASS

## Known Stubs

None.

## Self-Check: PASSED

Files modified exist and contain correct relative imports:
- `src/commands/doctor.ts` contains `../tui/utils`
- `src/lib/integrations/cmux.ts` contains `../../tui/utils`
- `package.json` contains `"0.7.1"`
- `CHANGELOG.md` contains `[0.7.1]`
- `CLAUDE.md` contains `test-only` in two locations

Commits exist:
- `fe90fc2` — fix(260323-cd3): replace @/tui/utils path alias with relative imports
- `9312ef2` — chore(260323-cd3): bump version to 0.7.1, update CHANGELOG and CLAUDE.md convention
