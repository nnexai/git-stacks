---
phase: 51
slug: workspace-port-allocation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 51 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | `scripts/test-runner.ts` (isolated runner) |
| **Quick run command** | `bun test tests/lib/ports.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/ports.test.ts`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 51-01-01 | 01 | 1 | PORT-WRITE-01 | unit | `bun test tests/lib/config.test.ts` | ✅ | ⬜ pending |
| 51-01-02 | 01 | 1 | PORT-SCHEMA-01 | unit | `bun test tests/lib/config.test.ts` | ✅ | ⬜ pending |
| 51-01-03 | 01 | 1 | PORT-SCHEMA-02 | unit | `bun test tests/lib/config.test.ts` | ✅ | ⬜ pending |
| 51-02-01 | 02 | 2 | PORT-ALLOC-01 | unit | `bun test tests/lib/ports.test.ts` | ❌ W0 | ⬜ pending |
| 51-02-02 | 02 | 2 | PORT-ALLOC-02 | unit | `bun test tests/lib/ports.test.ts` | ❌ W0 | ⬜ pending |
| 51-03-01 | 03 | 2 | PORT-INJECT-01 | unit | `bun test tests/lib/ports.test.ts` | ❌ W0 | ⬜ pending |
| 51-03-02 | 03 | 2 | PORT-INJECT-02 | unit | `bun test tests/lib/ports.test.ts` | ❌ W0 | ⬜ pending |
| 51-04-01 | 04 | 3 | PORT-WIZARD-01 | unit | `bun test tests/lib/ports.test.ts` | ❌ W0 | ⬜ pending |
| 51-04-02 | 04 | 3 | PORT-TEMPLATE-01 | unit | `bun test tests/lib/ports.test.ts` | ❌ W0 | ⬜ pending |
| 51-04-03 | 04 | 3 | PORT-FREE-01 | unit | `bun test tests/lib/ports.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/ports.test.ts` — stubs for PORT-ALLOC-01, PORT-ALLOC-02, PORT-INJECT-01, PORT-INJECT-02, PORT-WIZARD-01, PORT-TEMPLATE-01, PORT-FREE-01
- [ ] Extend `tests/lib/config.test.ts` — stubs for PORT-WRITE-01 (atomic write), PORT-SCHEMA-01, PORT-SCHEMA-02

*Existing test infrastructure covers framework needs — no new dependencies.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Concurrent open race safety | PORT-ALLOC-02 | Requires two parallel `git-stacks open` invocations | Open two terminals, run `git-stacks open ws1` and `git-stacks open ws2` simultaneously; verify no overlapping ports |
| Wizard port prompt UX | PORT-WIZARD-01 | Interactive TUI prompt | Run `git-stacks new`, verify port name prompt appears and accepts comma-separated input |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
