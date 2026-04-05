---
phase: 70-extract-remaining-domain-modules-and-workspace-ops-facade
plan: "02"
subsystem: workspace-ops-decomposition
tags: [extraction, refactor, domain-modules, workspace-git, workspace-yaml]
dependency_graph:
  requires: [70-01]
  provides: [workspace-git, workspace-yaml]
  affects: [workspace-ops, commands/workspace, commands/template, commands/repo, commands/config, tui/dashboard/App]
tech_stack:
  added: []
  patterns: [_exec-seam, re-export-facade, domain-module-extraction]
key_files:
  created:
    - src/lib/workspace-git.ts
    - src/lib/workspace-yaml.ts
  modified:
    - src/lib/workspace-ops.ts
    - src/commands/workspace.ts
    - src/commands/template.ts
    - src/commands/repo.ts
    - src/commands/config.ts
    - src/tui/dashboard/App.tsx
decisions:
  - "_exec in workspace-git.ts is a minimal stub with no spawn impl; git ops route through git.ts helpers (forward-compatible seam only)"
  - "_exec.spawnEditor in workspace-yaml.ts wraps Bun.spawn in openYamlInEditor for test injection"
  - "workspace-ops.ts re-export shims preserved for test mock compatibility (facade pattern per prior plan)"
metrics:
  duration: 10 min
  completed: "2026-04-05T17:49:56Z"
  tasks_completed: 2
  files_changed: 8
requirements: [EXTR-04, EXTR-06, EXTR-07, EXTR-08]
---

# Phase 70 Plan 02: Extract workspace-git.ts and workspace-yaml.ts Summary

**One-liner:** Extracted sync/push/pull git ops into `workspace-git.ts` and YAML editor functions into `workspace-yaml.ts`, both with injectable `_exec` seams, updating all runtime callers to import directly.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create workspace-git.ts with sync/push/pull and _exec seam | 8be49c47 | src/lib/workspace-git.ts (created), workspace-ops.ts, workspace.ts, App.tsx |
| 2 | Create workspace-yaml.ts with YAML editors and _exec seam | d582f872 | src/lib/workspace-yaml.ts (created), workspace-ops.ts, template.ts, repo.ts, config.ts |

## What Was Built

### workspace-git.ts
New domain module containing:
- Types: `SyncResult`, `SyncRow`, `PushResult`, `PushRow`, `PullRow`, `PullResult`
- Functions: `syncWorkspace`, `pushWorkspace`, `pullWorkspace` (bodies moved verbatim)
- `_exec` seam: forward-compatible stub (git ops route through `git.ts` helpers, no direct spawn needed in this phase)

### workspace-yaml.ts
New domain module containing:
- Functions: `editWorkspaceYaml`, `openYamlInEditor`, `editTemplateYaml`, `editGlobalConfigYaml`, `editRegistryYaml` (bodies moved verbatim)
- `_exec.spawnEditor` seam: wraps `Bun.spawn` in `openYamlInEditor` for test injection

### workspace-ops.ts changes
- Git function bodies removed; replaced with re-export shims from `./workspace-git`
- YAML function bodies removed; replaced with re-export shims from `./workspace-yaml`
- Unused imports removed: `parse`, `readFileSync`, `WorkspaceSchema`, `TemplateSchema`, `GlobalConfigSchema`, `RepoRegistrySchema`, `GLOBAL_CONFIG_FILE`, `REGISTRY_FILE`, and all git.ts imports that were only used by moved functions (`isRepoDirty`, `fetchOrigin`, `pullFFOnly`, `pushBranch`, `rebaseBranch`, `mergeBranchFF`, `getCommitsBehind`, `getCommitsAhead`, `getMergeConflicts`, `stashPush`, `stashPop`, `hasAutoStash`, `isGitRepo`)

### Caller updates
- `src/commands/workspace.ts`: sync/push/pull from `workspace-git`; yaml funcs from `workspace-yaml`
- `src/commands/template.ts`: yaml funcs from `workspace-yaml`; `renameTemplate` stays in `workspace-ops`
- `src/commands/repo.ts`: yaml funcs from `workspace-yaml`; no remaining `workspace-ops` import
- `src/commands/config.ts`: yaml funcs from `workspace-yaml`; no remaining `workspace-ops` import
- `src/tui/dashboard/App.tsx`: sync/push from `workspace-git`; `editWorkspaceYaml` from `workspace-yaml`

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `bun run typecheck`: exits 0 (zero errors)
- `npx madge --circular src/`: zero cycles
- `bun run test`: Unit tests PASS, Integration tests 40/40 passed, 0 failures
- `grep -rn "workspace-ops" src/commands/template.ts`: only `renameTemplate` import remains
- `grep -rn "workspace-ops" src/commands/repo.ts`: no imports
- `grep -rn "workspace-ops" src/commands/config.ts`: no imports

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes beyond what the threat model covers. The `_exec.spawnEditor` seam in workspace-yaml.ts maintains the same trust model as the original `Bun.spawn` call (editor path from user's own config.yml).

## Self-Check

Checking created files and commits exist:

- src/lib/workspace-git.ts: FOUND
- src/lib/workspace-yaml.ts: FOUND
- Commit 8be49c47: FOUND
- Commit d582f872: FOUND

## Self-Check: PASSED
