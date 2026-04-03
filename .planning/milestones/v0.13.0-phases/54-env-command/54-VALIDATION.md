---
phase: 54
slug: env-command
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 54 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | `bunfig.toml` |
| **Quick run command** | `bun test tests/lib/env.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~5 seconds (single file), ~30 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/env.test.ts`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 54-01-01 | 01 | 1 | CMD-01 | unit | `bun test tests/lib/env.test.ts` | ❌ W0 | ⬜ pending |
| 54-01-02 | 01 | 1 | CMD-02 | unit | `bun test tests/lib/env.test.ts` | ❌ W0 | ⬜ pending |
| 54-02-01 | 02 | 1 | CMD-01 | integration | `bun test tests/lib/env.test.ts` | ❌ W0 | ⬜ pending |
| 54-02-02 | 02 | 1 | CMD-02 | integration | `bun test tests/lib/env.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/env.test.ts` — test stubs for env formatting and command output
- Existing infrastructure covers framework installation

*Existing bun:test framework and helpers.ts cover test infrastructure needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Table alignment looks correct | CMD-01 | Visual formatting | Run `git-stacks env <workspace>` and verify columns align |

*All other behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
