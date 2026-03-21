---
phase: 18
slug: artifact-population
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test tests/` |
| **Full suite command** | `bun test tests/ && bun run typecheck` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/`
- **After every plan wave:** Run `bun test tests/ && bun run typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | ART-01 | unit | `bun test tests/lib/integrations/artifacts.test.ts` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 1 | ART-02 | unit | `bun test tests/lib/integrations/artifacts.test.ts` | ❌ W0 | ⬜ pending |
| 18-01-03 | 01 | 1 | ART-03, ART-04 | unit | `bun test tests/lib/integrations/artifacts.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/integrations/artifacts.test.ts` — test stubs for artifact return values (ART-01 through ART-04)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| VSCode window PID matches launched process | ART-03 | Requires running VSCode | Open workspace with VSCode enabled, check artifact bag in debug output |
| IntelliJ window PID matches launched process | ART-04 | Requires running IntelliJ | Open workspace with IntelliJ enabled, check artifact bag in debug output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
