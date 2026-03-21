---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in, Jest-compatible) |
| **Config file** | none — uses defaults |
| **Quick run command** | `bun test tests/lib/git.test.ts tests/lib/workspace-ops.test.ts tests/lib/config.test.ts` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/git.test.ts tests/lib/workspace-ops.test.ts tests/lib/config.test.ts`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| makeGitRepo helper | W0 | 0 | TEST-01 | unit | `bun test tests/lib/git.test.ts -t "makeGitRepo"` | ❌ W0 | ⬜ pending |
| createWorktree | W0 | 0 | TEST-02 | integration | `bun test tests/lib/git.test.ts` | ❌ W0 | ⬜ pending |
| removeWorktree | W0 | 0 | TEST-02 | integration | `bun test tests/lib/git.test.ts` | ❌ W0 | ⬜ pending |
| mergeNoFF | W0 | 0 | TEST-02, BUG-04 | integration | `bun test tests/lib/git.test.ts -t "mergeNoFF"` | ❌ W0 | ⬜ pending |
| rebaseBranch | W0 | 0 | TEST-02 | integration | `bun test tests/lib/git.test.ts` | ❌ W0 | ⬜ pending |
| getCommitsBehind | W0 | 0 | TEST-02 | integration | `bun test tests/lib/git.test.ts` | ❌ W0 | ⬜ pending |
| mergeWorkspace partial failure | W0 | 0 | TEST-03, BUG-01 | integration | `bun test tests/lib/workspace-ops.test.ts -t "merge partial failure"` | ❌ W0 | ⬜ pending |
| removeWorkspace atomic | W0 | 0 | TEST-03, BUG-02 | integration | `bun test tests/lib/workspace-ops.test.ts -t "remove atomic"` | ❌ W0 | ⬜ pending |
| renameWorkspace re-register | W0 | 0 | TEST-03, BUG-03 | integration | `bun test tests/lib/workspace-ops.test.ts -t "rename"` | ❌ W0 | ⬜ pending |
| corrupt YAML skipped | 1 | 1 | CONF-01 | unit | `bun test tests/lib/config.test.ts -t "corrupt"` | ✅ | ⬜ pending |
| minimal YAML parse | 1 | 1 | CONF-02 | unit | `bun test tests/lib/config.test.ts -t "minimal"` | ✅ | ⬜ pending |
| schema_version default | 1 | 1 | CONF-03 | unit | `bun test tests/lib/config.test.ts -t "schema_version"` | ✅ | ⬜ pending |
| formatZodError | 1 | 1 | CONF-04 | unit | `bun test tests/lib/config.test.ts -t "formatZodError"` | ✅ | ⬜ pending |
| git prerequisite check | 1 | 1 | PREREQ-01 | manual | `git-stacks doctor` or startup output | N/A | ⬜ pending |
| binary check in integrations | 1 | 1 | PREREQ-02 | unit | `bun test tests/lib/` | N/A | ⬜ pending |
| doctor binary hints | 1 | 1 | PREREQ-03 | manual | `bun run src/index.ts doctor` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/helpers.ts` — add `makeGitRepo()` helper (prerequisite for all git integration tests)
- [ ] `tests/lib/git.test.ts` — stubs for TEST-01, TEST-02, BUG-04
- [ ] `tests/lib/workspace-ops.test.ts` — stubs for TEST-03, BUG-01, BUG-02, BUG-03

*Existing `tests/lib/config.test.ts` covers CONF-01 through CONF-04 with new test cases added — no new file needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Startup exits with message when git missing/old | PREREQ-01 | Startup code, not unit-testable without mocking process | Run `PATH="" bun run src/index.ts` and verify exit with message |
| Doctor lists missing binaries with install hints | PREREQ-03 | CLI command output, terminal rendering | Run `bun run src/index.ts doctor` with/without optional binaries |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
