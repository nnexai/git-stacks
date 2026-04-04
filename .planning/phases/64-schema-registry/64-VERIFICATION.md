---
phase: 64-schema-registry
verified: 2026-04-04T18:57:58Z
status: passed
score: 7/7 must-haves verified
---

# Phase 64: Schema & Registry Verification Report

**Phase Goal:** Users can declare non-git directories as "dir" repos in registry and template YAML, and add or scan them via CLI
**Verified:** 2026-04-04T18:57:58Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Roadmap Success Criteria

| # | Success Criterion | Status | Evidence |
|---|------------------|--------|---------|
| 1 | User can set `type: dir` on a repo in registry YAML and have it validated by Zod without error | VERIFIED | `RepoRegistryEntrySchema` has `is_dir: z.boolean().default(false)` at line 64 of config.ts; `TemplateRepoSchema.mode` and `WorkspaceRepoSchema.mode` both accept `"dir"` at lines 75 and 120 |
| 2 | Workspace YAML written for a dir repo contains `mode: dir` and `main_path` only — no `task_path`, no branch | VERIFIED | `buildReposFromTemplate` in workspace-wizard.ts lines 96-104: when `regEntry.is_dir`, pushes `{ mode: "dir", main_path: regEntry.local_path }` with no `task_path`, no `base_branch`, and `continue`s past trunk/worktree path |
| 3 | User can run `git-stacks repo add /some/plain/dir` and have the directory registered as type "dir" | VERIFIED | repo.ts line 36: `.git` guard removed, replaced with `const isDir = !existsSync(join(localPath, ".git"))`; line 93: `is_dir: isDir` written to registry entry; git/forge ops skipped when `isDir` is true |
| 4 | User can run `git-stacks repo scan` and see plain directories offered for registration alongside git repos | VERIFIED | repo-wizard.ts line 13: `scanForRepos(dir, { includeDirs: true })`; line 37: hint shows `r.isDir ? "dir" : r.detectedType`; registration loop lines 61-71 handle dir repos with `is_dir: true` |

### Observable Truths (Plan Must-Haves)

**Plan 64-01 truths:**

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | RepoRegistryEntrySchema accepts is_dir: true and defaults to false when absent | VERIFIED | config.ts line 64: `is_dir: z.boolean().default(false)`; config.test.ts lines 803-810: two passing tests confirm both behaviors |
| 2 | TemplateRepoSchema.mode accepts 'dir' alongside 'trunk' and 'worktree' | VERIFIED | config.ts line 75: `z.enum(["trunk", "worktree", "dir"])`; config.test.ts line 813-815 |
| 3 | WorkspaceRepoSchema.mode accepts 'dir' and task_path is optional | VERIFIED | config.ts line 120-122: mode enum includes "dir"; task_path line 122 is `.optional()`; config.test.ts lines 823-829 |
| 4 | Workspace YAML for a dir repo contains mode: dir, main_path, no task_path, no base_branch | VERIFIED | workspace-wizard.ts lines 96-104 produce this exact shape |
| 5 | buildReposFromTemplate creates dir repos with mode 'dir' and no task_path when registry entry is_dir | VERIFIED | workspace-wizard.ts lines 96-105: `if (regEntry.is_dir)` guard, pushes `mode: "dir"`, `main_path` only, then `continue` |
| 6 | All existing schema parse tests continue to pass unchanged | VERIFIED | `bun test tests/lib/config.test.ts`: 79/79 pass (74 pre-existing + 5 new) |

**Plan 64-02 truths:**

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | User can run `git-stacks repo add /some/plain/dir` and it registers as type 'dir' with is_dir: true | VERIFIED | repo.ts lines 36, 48-52, 93: isDir computed from .git absence, git/forge ops skipped, `is_dir: isDir` written |
| 2 | scanForRepos with includeDirs option returns plain directories alongside git repos | VERIFIED | detect.ts lines 5-46: `ScanOptions.includeDirs`, filter logic at lines 36-39, `isDir` field at line 42; detect.test.ts lines 86-129: 6 tests pass |
| 3 | scanForRepos without options still ignores plain directories (backward compat) | VERIFIED | detect.ts line 38: `return !!options.includeDirs` — false when options omitted; detect.test.ts lines 111-117 |
| 4 | repo scan wizard shows plain directories with 'dir' hint and registers them with is_dir: true | VERIFIED | repo-wizard.ts line 13, 37, 61-71 |
| 5 | repo add for a git repo still works exactly as before (backward compat) | VERIFIED | repo.ts lines 48-83: git branch detection and forge logic preserved in `else` branch |
| 6 | repo list shows is_dir repos with 'dir' label | VERIFIED | repo.ts lines 125-128: `const dirLabel = entry.is_dir ? " [dir]" : ""` appended to list output |
| 7 | repo show displays is_dir status for dir repos | VERIFIED | repo.ts lines 147-149: `if (entry.is_dir) { console.log("Dir mode:       yes") }` |

**Score:** 7/7 roadmap success criteria verified (all plan must-haves also verified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/config.ts` | Extended Zod schemas for dir repos, contains `is_dir` | VERIFIED | `is_dir: z.boolean().default(false)` in RepoRegistryEntrySchema; `"dir"` in both TemplateRepoSchema and WorkspaceRepoSchema mode enums; `task_path` is `.optional()` |
| `src/tui/workspace-wizard.ts` | buildReposFromTemplate dir handling, contains `is_dir` | VERIFIED | `if (regEntry.is_dir)` guard at line 96; pushes dir repos with correct shape |
| `tests/lib/config.test.ts` | Schema tests for dir repos, contains `mode: "dir"` | VERIFIED | `describe("dir repo schema support")` at line 802; 6 tests covering all schema paths |
| `src/lib/detect.ts` | Extended scanForRepos with includeDirs option and isDir flag | VERIFIED | `ScanOptions` interface, `isDir: boolean` on DiscoveredRepo, `options: ScanOptions = {}` parameter |
| `src/commands/repo.ts` | repo add accepts non-git dirs; repo list/show display is_dir | VERIFIED | `.git` guard removed; `is_dir: isDir` written; `dirLabel` in list; `Dir mode: yes` in show |
| `src/tui/repo-wizard.ts` | runRepoScan presents dirs alongside git repos, contains `includeDirs` | VERIFIED | `scanForRepos(dir, { includeDirs: true })` at line 13; `is_dir: true` in dir registration block |
| `tests/lib/detect.test.ts` | Tests for scanForRepos includeDirs option | VERIFIED | `describe("scanForRepos includeDirs")` with 6 tests |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/config.ts` | `src/tui/workspace-wizard.ts` | RepoRegistryEntry.is_dir drives mode selection | WIRED | `regEntry.is_dir` at workspace-wizard.ts line 96 triggers `mode: "dir"` path |
| `src/commands/repo.ts` | `src/lib/config.ts` | writes RepoRegistryEntry with is_dir: true | WIRED | `is_dir: isDir` at repo.ts line 93; `isDir = !existsSync(join(localPath, ".git"))` at line 36 |
| `src/tui/repo-wizard.ts` | `src/lib/detect.ts` | calls scanForRepos with includeDirs: true | WIRED | `scanForRepos(dir, { includeDirs: true })` at repo-wizard.ts line 13 |

### Data-Flow Trace (Level 4)

Not applicable — this phase is schema/registry only. No components render dynamic fetched data; all artifacts are Zod schemas, CLI command handlers, and utility functions. Data flows into YAML files via `writeRegistry`/`writeWorkspace` and is validated by Zod on read. The round-trip is exercised by the test suite.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| RepoRegistryEntrySchema defaults is_dir to false | `bun test tests/lib/config.test.ts` | 79/79 pass | PASS |
| scanForRepos includeDirs returns isDir flag | `bun test tests/lib/detect.test.ts` | 18/18 pass | PASS |
| Full test suite passes (no regressions) | `bun run test` | 39/39 integration + all unit pass | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SCHM-01 | 64-01 | User can set repo type to "dir" in registry and template YAML | SATISFIED | `is_dir` boolean on RepoRegistryEntrySchema; `"dir"` mode on TemplateRepoSchema and WorkspaceRepoSchema |
| SCHM-02 | 64-01 | Workspace YAML stores dir repos with mode "dir" and resolves main_path only | SATISFIED | `buildReposFromTemplate` produces `{ mode: "dir", main_path }` with no task_path or base_branch |
| REG-01 | 64-02 | User can add a non-git directory to the repo registry via `repo add` | SATISFIED | `.git` guard removed; `isDir` branch skips git/forge ops; `is_dir: isDir` persisted |
| REG-02 | 64-02 | `repo scan` detects and offers to register plain directories alongside git repos | SATISFIED | `scanForRepos(dir, { includeDirs: true })`; dir hint shown; `is_dir: true` written on registration |

All 4 requirements mapped to Phase 64 are satisfied. No orphaned requirements found.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/tui/repo-wizard.ts` line 110-117 | Git repo registration path does not include explicit `is_dir: false` | INFO | No functional impact — Zod defaults `is_dir` to `false` on read. Field will be absent from YAML for git repos registered via scan wizard, but reads back correctly via schema default. TypeScript does not flag this because `is_dir` is `boolean` (non-optional) in the inferred type, so this object literal satisfies the type if `forge` is typed as `ForgeType | undefined`. |

The info-level omission does not affect goal achievement. No STUB, placeholder, or TODO patterns found. No empty implementations. All `is_dir` guards flow to real behavior.

### Human Verification Required

None — all success criteria are verifiable from code and test output.

## Gaps Summary

No gaps. All 4 roadmap success criteria verified. All 13 plan must-have truths confirmed. All artifacts exist, are substantive, and are wired. Tests pass: 79/79 schema tests, 18/18 detect tests, 39/39 integration tests.

The downstream TypeScript errors in workspace-ops.ts, workspace.ts, files.ts, etc. are expected and explicitly scoped to Phase 65 (lifecycle guards) per both the plan and summary documentation.

---

_Verified: 2026-04-04T18:57:58Z_
_Verifier: Claude (gsd-verifier)_
