---
phase: 66
slug: git-operation-guards
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 66 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test + custom runner (scripts/test-runner.ts) |
| **Config file** | scripts/test-runner.ts |
| **Quick run command** | `bun test tests/lib/workspace-ops.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/workspace-ops.test.ts`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 66-01-01 | 01 | 1 | GIT-01 | — | N/A | unit | `bun test tests/lib/workspace-ops.test.ts` | ❌ W0 | ⬜ pending |
| 66-01-02 | 01 | 1 | GIT-02 | — | N/A | unit | `bun test tests/lib/workspace-ops.test.ts` | ❌ W0 | ⬜ pending |
| 66-01-03 | 01 | 1 | GIT-03 | — | N/A | unit | `bun test tests/lib/workspace-ops.test.ts` | ❌ W0 | ⬜ pending |
| 66-01-04 | 01 | 1 | GIT-04 | — | N/A | unit | `bun test tests/lib/workspace-ops.test.ts` | ❌ W0 | ⬜ pending |
| 66-01-05 | 01 | 1 | GIT-05 | — | N/A | unit | `bun test tests/lib/workspace-ops.test.ts` | ❌ W0 | ⬜ pending |
| 66-01-06 | 01 | 1 | GIT-06 | — | N/A | unit | `bun test tests/lib/workspace-ops.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/workspace-ops.test.ts` — add dir repo guard tests for GIT-01 through GIT-06
- [ ] Import `pullWorkspace` in test file if not already imported

*Existing infrastructure covers framework needs.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
