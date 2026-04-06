---
phase: 76
slug: integration-plugin-capability-contracts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 76 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test + custom runner (scripts/test-runner.ts) |
| **Config file** | scripts/test-runner.ts |
| **Quick run command** | `bun run typecheck` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun run typecheck`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 76-01-01 | 01 | 1 | ENGN-07 | — | N/A | typecheck | `bun run typecheck` | ✅ | ⬜ pending |
| 76-01-02 | 01 | 1 | ENGN-07 | — | N/A | typecheck | `bun run typecheck` | ✅ | ⬜ pending |
| 76-02-01 | 02 | 1 | ENGN-08 | — | N/A | unit | `bun run test` | ❌ W0 | ⬜ pending |
| 76-02-02 | 02 | 1 | ENGN-09 | — | N/A | unit | `bun run test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `integration list` capabilities column renders correctly | ENGN-09 | Visual output formatting | Run `git-stacks integration list` and verify capabilities column appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
