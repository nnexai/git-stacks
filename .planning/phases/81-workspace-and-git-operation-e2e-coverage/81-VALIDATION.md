---
phase: 81
slug: workspace-and-git-operation-e2e-coverage
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-10
---

# Phase 81 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` + custom runner (`scripts/test-runner.ts`) |
| **Config file** | `bunfig.toml` + `scripts/test-runner.ts` |
| **Quick run command** | `bun run test:integ` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun run test:integ`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 81-01-01 | 01 | 1 | E2E-08, E2E-14 | — | Shared CLI helpers and fixture builders keep all workspace/git E2E scenarios isolated from real config homes and shell `cd` state. | integration | `bun run test:integ` | ❌ W0 | ⬜ pending |
| 81-01-02 | 01 | 1 | E2E-08, E2E-14 | — | Create/clone scenarios prove branch start points, generated YAML, task/main path persistence, and worktree layout using pre-built fixtures. | integration | `bun test tests/commands/workspace-create-clone.test.ts -x` | ❌ W0 | ⬜ pending |
| 81-02-01 | 02 | 1 | E2E-08, E2E-14 | — | Hooks, env files, `run`, `open --no-ide`, `paths`, and related execution flows prove injected env, hook cwd, and explicit cwd/path handling. | integration | `bun test tests/commands/workspace-execution-context.test.ts -x` | ❌ W0 | ⬜ pending |
| 81-02-02 | 02 | 1 | E2E-08 | — | Text/JSON contracts for `list`, `status`, `env`, `run`, and `paths` stay stable when exercised through real CLI subprocesses. | integration | `bun test tests/commands/workspace-json-contracts.test.ts -x` | ❌ W0 | ⬜ pending |
| 81-03-01 | 03 | 2 | E2E-08, E2E-14 | — | `close`, `clean`, `remove`, and `rename` prove correct filesystem/YAML side effects plus missing/dirty repo failure behavior without external integration launch. | integration | `bun test tests/commands/workspace-lifecycle.test.ts -x` | ❌ W0 | ⬜ pending |
| 81-03-02 | 03 | 2 | E2E-08 | — | Guard-focused scenarios prove dirty repo, missing path, dir repo, missing remote, and missing upstream protections with actionable stderr. | integration | `bun test tests/commands/workspace-guards.test.ts -x` | ❌ W0 | ⬜ pending |
| 81-04-01 | 04 | 2 | E2E-08 | — | `merge`, `pull`, `sync`, `push`, and `status --fetch` run against disposable bare remotes and real worktrees, proving upstream/remote assumptions and ahead/behind refresh behavior. | integration | `bun test tests/commands/workspace-git-ops.test.ts -x && bun test tests/commands/workspace-status-fetch.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/helpers.ts` — add shared CLI subprocess wrapper plus bare-remote/workspace fixture/probe-hook helpers needed by all Phase 81 files
- [ ] `tests/commands/workspace-create-clone.test.ts` — create/clone fixture-driven side-effect coverage
- [ ] `tests/commands/workspace-execution-context.test.ts` — env injection, hook cwd, command cwd/path proof
- [ ] `tests/commands/workspace-json-contracts.test.ts` — JSON/text contract coverage for workspace command outputs
- [ ] `tests/commands/workspace-lifecycle.test.ts` — close/clean/remove/rename side-effect and failure coverage
- [ ] `tests/commands/workspace-guards.test.ts` — dirty repo, missing path, dir repo, missing remote/upstream guards
- [ ] `tests/commands/workspace-git-ops.test.ts` — merge/pull/sync/push coverage against disposable remotes
- [ ] `tests/commands/workspace-status-fetch.test.ts` — `status --fetch` remote refresh coverage

*Existing infrastructure already covers framework installation and isolated per-file execution.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | — | — |

*All phase behaviors should have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
