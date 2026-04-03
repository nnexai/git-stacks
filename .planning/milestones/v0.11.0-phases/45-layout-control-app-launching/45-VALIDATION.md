---
phase: 45
slug: layout-control-app-launching
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test tests/lib/integrations/aerospace.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/integrations/aerospace.test.ts`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 45-01-01 | 01 | 1 | LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-04, LAUNCH-01, LAUNCH-02 | unit | `bun test tests/lib/integrations/aerospace.test.ts` | ✅ Phase 44 | ⬜ pending |
| 45-01-02 | 01 | 1 | LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-04, LAUNCH-01, LAUNCH-02 | unit | `bun test tests/lib/integrations/aerospace.test.ts` | ✅ Phase 44 | ⬜ pending |
| 45-02-01 | 02 | 1 | LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-04, LAUNCH-01, LAUNCH-02 | unit | `bun test tests/lib/integrations/aerospace.test.ts` | ✅ Phase 44 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Phase 44 creates `tests/lib/integrations/aerospace.test.ts` with mock setup for aerospace shell wrappers. Phase 45 extends this file with new test blocks.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AeroSpace auto-tiles launched windows | LAUNCH-02 | Requires running AeroSpace on macOS | Launch git-stacks open with commands config, verify windows appear in target workspace |
| Layout visually correct | LAYOUT-01 | Visual layout verification | Run open with layout: h_tiles, confirm workspace layout matches |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
