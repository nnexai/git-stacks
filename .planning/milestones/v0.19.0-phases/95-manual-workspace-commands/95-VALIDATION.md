---
phase: 95
slug: manual-workspace-commands
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-17
---

# Phase 95 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test + repo custom isolated runner |
| **Config file** | `bunfig.toml` |
| **Quick run command** | `bun test tests/lib/config.test.ts tests/lib/composition.test.ts tests/lib/workspace-lifecycle-create.test.ts tests/lib/lifecycle.test.ts tests/lib/workspace-command.test.ts tests/commands/template-consumption.test.ts tests/commands/command.test.ts` |
| **Full suite command** | `bun run test && bun run typecheck && bun run verify:gates` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the smallest task-focused `bun test ...` command named in that task’s `<verify>`
- **After every plan wave:** Run the combined phase-focused suite plus `bun run typecheck`
- **Before `$gsd-verify-work`:** `bun run test && bun run typecheck && bun run verify:gates`
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 95-01-01 | 01 | 1 | WCMD-01, WCMD-04 | T-95-01 / T-95-02 | Only string-valued command maps parse; copied command schema stays narrow | unit | `bun test tests/lib/config.test.ts tests/lib/composition.test.ts tests/lib/workspace-lifecycle-create.test.ts` | ✅ | ⬜ pending |
| 95-02-01 | 02 | 2 | WCMD-01, WCMD-04 | T-95-03 | Template-backed create and clone persist copied commands into workspace YAML | CLI subprocess | `bun test tests/commands/template-consumption.test.ts` | ✅ | ⬜ pending |
| 95-03-01 | 03 | 2 | WCMD-02, WCMD-03 | T-95-04 / T-95-05 | Resolution order, dry-run visibility, env reuse, and first-failure exit status are enforced in library code | unit | `bun test tests/lib/lifecycle.test.ts tests/lib/workspace-command.test.ts` | ✅ | ⬜ pending |
| 95-04-01 | 04 | 3 | WCMD-02, WCMD-03 | T-95-06 / T-95-07 | CLI list/run behavior, cwd detection, and coverage inventory stay aligned | CLI subprocess + local gate | `bun test tests/commands/command.test.ts && bun run typecheck && bun run verify:gates` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

- All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
