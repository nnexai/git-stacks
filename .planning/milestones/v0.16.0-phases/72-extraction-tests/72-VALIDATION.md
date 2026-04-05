---
phase: 72
slug: extraction-tests
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 72 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` with repo-local isolation via `scripts/test-runner.ts` |
| **Config file** | `bunfig.toml`, `scripts/test-runner.ts` |
| **Quick run command** | `bun test <touched-file>` |
| **Full suite command** | `bun run test && bun run typecheck && bunx madge --circular --extensions ts src/` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test <touched-file>`, plus `bunx madge --circular --extensions ts src/` after any cycle-related change
- **After every plan wave:** Run `bun run test && bun run typecheck && bunx madge --circular --extensions ts src/`
- **Before `/gsd-verify-work`:** Full suite must be green and Madge must report zero cycles
- **Max feedback latency:** 30 seconds for per-task checks; slower full-suite cadence is accepted at wave boundaries

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 72-01-01 | 01 | 1 | TEST-01 | T-72-01 | Pure env-helper tests do not touch host secrets, git repos, or real workspace roots | unit | `bun test tests/lib/workspace-env.test.ts` | ❌ W0 | ⬜ pending |
| 72-01-02 | 01 | 1 | TEST-02, TEST-03 | T-72-02 | Mocked git/config seams stay isolated per file and cover current exported helper calls | isolated module test | `bun test tests/lib/workspace-status.test.ts && bun test tests/lib/workspace-git.test.ts` | ❌ W0 | ⬜ pending |
| 72-02-01 | 02 | 2 | TEST-04 | T-72-03 | Circular-dependency gate is executable and repo-native once `madge` is declared | dependency gate | `bunx madge --circular --extensions ts src/` | ❌ W0 | ⬜ pending |
| 72-02-02 | 02 | 2 | TEST-04 | T-72-03 | Dashboard dependency cleanup removes the currently failing cycles without changing CLI/TUI behavior | regression + dependency gate | `bun run test && bun run typecheck && bunx madge --circular --extensions ts src/` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/workspace-env.test.ts` — required `TEST-01` coverage for `mergeEnv`, `buildBaseEnv`, `buildRepoEnv`
- [ ] `tests/lib/workspace-status.test.ts` — required isolated mock-based coverage for `TEST-02`
- [ ] `tests/lib/workspace-git.test.ts` — required isolated mock-based coverage for `TEST-03`
- [ ] `tests/helpers.ts` — extend `makeGitMock()` with defaults for `pushBranch`, `getCommitsAhead`, `stashPush`, `stashPop`, `hasAutoStash`, and `isFetchStale`
- [ ] `package.json` and `bun.lock` — add `madge` as a devDependency so the cycle gate is repo-native

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Focused module tests stay aligned with the extracted seams rather than the old facade | TEST-01, TEST-02, TEST-03 | Requires human review of import targets and mock seams | Inspect the new test files and confirm they import `workspace-env.ts`, `workspace-status.ts`, and `workspace-git.ts` directly, with `mock.module("@/lib/git", ...)` used for status/git tests |
| Madge cycle cleanup does not silently reshape dashboard behavior | TEST-04 | Static cycle checks do not prove runtime UI behavior | Review the dashboard refactor diff, then run the normal test suite and confirm no existing dashboard tests regress |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s for per-task checks
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
