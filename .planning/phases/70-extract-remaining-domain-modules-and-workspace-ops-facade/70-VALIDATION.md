---
phase: 70
slug: extract-remaining-domain-modules-and-workspace-ops-facade
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 70 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test + custom runner (scripts/test-runner.ts) |
| **Config file** | scripts/test-runner.ts |
| **Quick run command** | `bun run typecheck` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun run typecheck`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 70-01-01 | 01 | 1 | EXTR-04 | — | N/A | integration | `bun run test` | ✅ | ⬜ pending |
| 70-01-02 | 01 | 1 | EXTR-04 | — | N/A | unit | `bun run typecheck` | ✅ | ⬜ pending |
| 70-02-01 | 02 | 1 | EXTR-05 | — | N/A | integration | `bun run test` | ✅ | ⬜ pending |
| 70-02-02 | 02 | 1 | EXTR-05 | — | N/A | unit | `bun run typecheck` | ✅ | ⬜ pending |
| 70-03-01 | 03 | 1 | EXTR-06 | — | N/A | integration | `bun run test` | ✅ | ⬜ pending |
| 70-03-02 | 03 | 1 | EXTR-06 | — | N/A | unit | `bun run typecheck` | ✅ | ⬜ pending |
| 70-04-01 | 04 | 2 | EXTR-01, EXTR-07, EXTR-08 | — | N/A | integration | `bun run test` | ✅ | ⬜ pending |
| 70-04-02 | 04 | 2 | EXTR-08 | — | N/A | structural | `madge --circular src/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npx madge` — install madge if not available for circular dependency detection

*Existing test infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No dangling re-export shims in workspace-ops.ts | EXTR-08 | Requires human review of final file | Inspect workspace-ops.ts exports — should only have lifecycle functions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
