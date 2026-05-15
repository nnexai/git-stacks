# Phase 85 Pattern Map

**Phase:** 85-core-real-fixture-functional-hardening  
**Date:** 2026-05-15  
**Status:** Complete

## Existing Patterns To Follow

### Real Fixtures

- Use `makeTmpDir()` and `cleanup()` from `tests/helpers.ts` for disposable filesystem roots.
- Use `makeBareRemote()` and `makeRepoWithRemote()` for local bare remote plus clone/worktree setups.
- Use `makeWorkspaceFixture()` for direct workspace YAML setup instead of driving interactive wizards.
- Use `makeProbeHook()` and `writeProbeScript()` for hook env/cwd/output probes that write durable artifacts.
- Use `useIsolatedConfig()` when tests need config reads/writes through `src/lib/config.ts` after path mocking.

### Test Runner Hygiene

- Use `bun test <focused-file>` for direct focused files when no `mock.module()` pollution is involved.
- Use `bun run test`, `bun run test:unit`, or `bun run test:integ` for suite-level verification.
- Do not use `bun test tests/` for full-suite verification.
- If a new test file uses `mock.module()`, expect `scripts/test-runner.ts` to classify it into isolated execution.

### Source Coverage Integrity

- Import and call real `src/lib/**` exports where possible.
- Prefer existing public test seams such as `_exec` in `src/lib/lifecycle.ts` when the seam is part of the source contract.
- Avoid duplicating implementation logic inside test mocks. Mocks should provide external conditions or injected process results, not reimplement the function under test.

### Local Gate Contract

- Keep verification local and script-driven.
- Use `bun run coverage` as the canonical report generator.
- Use `.coverage/coverage-final.json` for machine-readable hit inspection.
- Preserve Phase 84's no-CI and no-numeric-threshold boundary.

## Plan File Ownership

| Plan | Primary Files |
|------|---------------|
| 85-01 | `tests/helpers.ts`, `tests/lib/workspace-ops-real-fixture.test.ts` |
| 85-02 | `tests/lib/git-real-remote.test.ts` |
| 85-03 | `tests/lib/lifecycle-files-env-config-real-fixture.test.ts` |
| 85-04 | `.planning/phases/85-core-real-fixture-functional-hardening/85-COVERAGE-REVIEW.md`, `tests/lib/core-source-coverage-gaps.test.ts` |

Same-wave plans do not overlap on `files_modified`. Plan 85-04 depends on the first three because it reviews coverage after their tests exist.

## Interfaces For Executors

From `tests/helpers.ts`:

- `makeTmpDir(prefix?: string): string`
- `cleanup(dir: string): void`
- `runCli(argv: string[], opts: RunCliOptions): RunCliResult`
- `makeBareRemote(baseDir: string, name?: string): string`
- `makeRepoWithRemote(baseDir: string, repoName: string, wsBranch: string): { originDir; mainPath; worktreePath; taskPath; branch }`
- `makeWorkspaceFixture(configDir: string, wsName: string, repos: unknown[], opts?: unknown): unknown`
- `makeProbeHook(artifactPath: string, envVars: string[]): string`
- `writeProbeScript(baseDir: string, relPath: string, artifactPath: string, envVars: string[]): string`
- captured real exports include `realWriteWorkspace`, `realReadWorkspace`, `realCleanWorkspace`, `realRemoveWorkspace`, `realMergeWorkspace`, `realRenameWorkspace`, `realCloseWorkspace`, `realCreateWorktree`, and `lifecycleRealExec`.

From `src/lib/workspace-ops.ts`:

- `openWorkspace()`
- `renameWorkspace()`
- `renameTemplate()`
- real captured exports for `mergeWorkspace`, `removeWorkspace`, `cleanWorkspace`, `closeWorkspace`, and `buildWorkspaceEnv` are available through `tests/helpers.ts`.

From `src/lib/git.ts`:

- `createWorktree()`, `removeWorktree()`, `isWorktreeRegistered()`, `isRepoDirty()`
- `fetchOrigin()`, `pullFFOnly()`, `pushBranch()`, `ensureUpstreamTracking()`
- `rebaseBranch()`, `mergeBranchFF()`, `getCommitsBehind()`, `getCommitsAhead()`, `isFetchStale()`

From `src/lib/lifecycle.ts`:

- `_exec.spawn` mutable process seam
- `runHooks(commands, cwd, env?, abortOnFailure?)`
- `runHooksCaptured(commands, cwd, env?, onOutput?, abortOnFailure?)`

From `src/lib/files.ts`, `src/lib/env.ts`, `src/lib/secrets.ts`, `src/lib/ports.ts`, and `src/lib/config.ts`:

- File operation exports: `processFileList`, `applyFileOpsForRepo`, `applyFileOpsForWorkspace`, `warnExternalFiles`
- Env exports: `formatEnv`, `detectRepoFromCwd`
- Secret exports: `parseSecretRef`, `resolveSecrets`, `buildResolvers`, built-in resolver objects
- Port exports: `allocatePorts`, `checkConflicts`, `mergePorts`
- Config exports: schemas plus `readWorkspace`, `writeWorkspace`, `writeGlobalConfig`, `readGlobalConfig`, `writeTemplate`, `readTemplate`, and atomic YAML-backed write/read functions

