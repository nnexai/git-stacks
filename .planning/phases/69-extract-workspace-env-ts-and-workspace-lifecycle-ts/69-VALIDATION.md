---
phase: 69
slug: extract-workspace-env-ts-and-workspace-lifecycle-ts
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-05
---

# Phase 69 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test + custom runner (scripts/test-runner.ts) |
| **Config file** | scripts/test-runner.ts |
| **Quick run command** | `bun test tests/lib/workspace-ops.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/workspace-ops.test.ts`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 69-01-01 | 01 | 1 | EXTR-02 | — | N/A | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ✅ green |
| 69-01-02 | 01 | 1 | EXTR-03 | — | N/A | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ✅ green |
| 69-01-03 | 01 | 1 | EXTR-09 | — | N/A | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Coverage Details

- **EXTR-02 (workspace-env.ts extraction):** `mergeEnv`, `buildWorkspaceEnv`, `writeEnvFiles` tested in `tests/lib/workspace-ops.test.ts` — env merging, port injection, secret resolution, path boundary checks all covered
- **EXTR-03 (workspace-lifecycle.ts extraction):** `closeWorkspace`, `cleanWorkspace`, `removeWorkspace`, `mergeWorkspace` tested with cascade ordering, `GS_TRIGGERED_BY` propagation, hook ordering, dry-run, and error cases
- **EXTR-09 (facade re-exports):** All tests import via `workspace-ops.ts` facade — passing tests confirm re-exports work

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have automated verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 8s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-05

---

## Validation Audit 2026-04-05

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
