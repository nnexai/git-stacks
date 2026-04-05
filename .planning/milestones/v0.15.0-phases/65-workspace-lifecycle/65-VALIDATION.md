---
phase: 65
slug: workspace-lifecycle
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (via custom runner scripts/test-runner.ts) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test tests/lib/config.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun run typecheck`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 65-01-01 | 01 | 1 | LIFE-01 | — | N/A | unit + typecheck | `bun run typecheck` | ✅ | ⬜ pending |
| 65-01-02 | 01 | 1 | LIFE-02 | — | N/A | unit | `bun run test` | ✅ | ⬜ pending |
| 65-01-03 | 01 | 1 | LIFE-03 | — | N/A | unit | `bun run test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. workspace-ops.ts and config.ts tests already exist.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| git-stacks new with dir template | LIFE-01 | CLI integration | Create template with dir repo, run `git-stacks new`, verify workspace YAML |
| git-stacks open with dir repo | LIFE-02 | Env/hook inspection | Open workspace with dir repo, verify hook env vars include dir path |
| git-stacks close/clean/remove with dir | LIFE-03 | CLI integration | Close/clean/remove workspace with dir repo, verify no errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
