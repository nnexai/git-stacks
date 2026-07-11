---
phase: 105
slug: shared-native-model-and-terminal-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-11
---

# Phase 105 — Validation Strategy

> Revised after Spike 004 invalidated the full `ghostty_surface_*` Linux host.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun orchestration, Zig 0.15.2 tests, GTK display harnesses, production executable smoke tests |
| **Config file** | `package.json`, `native/build.zig`, `scripts/verify-native.ts` |
| **Quick run command** | `bun run native:test:quick` |
| **Full suite command** | `bun run native:verify` |
| **Estimated runtime** | Unit/focused targets <45 seconds; full native verification <5 minutes |

## Sampling Rate

- **After every task commit:** Run the task's focused command; default to `bun run native:test:quick` after its target exists.
- **After every plan wave:** Run the plan's complete focused gate plus `bun run native:test:quick`.
- **Before `$gsd-verify-work`:** Run `bun run native:verify`, `bun run test`, `bun run typecheck`, `bun run test:deps`, and `bun run verify:gates`.
- **Max feedback latency:** 45 seconds per focused test, 90 seconds per ordinary plan gate, and 5 minutes for stress/full-native verification.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 105-01..04 | 01–04 | 1–4 | CORE-01..05, TERM-02..04 | Existing plan registers | Retained model, ABI, persistence, ownership and guard behavior | regression | `bun run native:test:model && bun run native:test:restore && bun run native:test:lifecycle` | ✅ | ✅ green |
| 105-05-01 | 05 | 5 | TERM-03 | T-105-VT-01 | Exact pinned Zig `ghostty-vt` adapter; no private GTK/full-surface import | unit/build | `bun run native:test:vt` | ❌ producer: 105-05 Task 1 | ⬜ pending |
| 105-05-02 | 05 | 5 | TERM-01, TERM-05 | T-105-ASYNC-01 | Production GTK widget rejects stale callbacks and exposes truthful focus semantics | GTK integration | `bun run native:test:renderer && bun run native:test:widget` | ❌ producers: 105-05 Tasks 1-2 | ⬜ pending |
| 105-05-03 | 05 | 5 | TERM-01 | T-105-ASYNC-01 | Real production executable opens, renders deterministic VT content, and quits cleanly | graphical smoke | `bun run native:build-app && bun run native:smoke-app` | ❌ producer: 105-05 Task 3 | ⬜ pending |
| 105-06-01 | 06 | 6 | TERM-02 | T-105-PGID-01 | Product-owned PTY/PGID registers before live and unwinds every spawn failure | PTY integration | `bun run native:test:pty` | ❌ producer: 105-06 Task 1 | ⬜ pending |
| 105-06-02 | 06 | 6 | CORE-02, CORE-05, TERM-01, TERM-02 | T-105-PGID-01, T-105-ASYNC-01 | PTY bytes drive VT/frame; input reaches child; exit truth reaches reducer | runtime integration | `bun run native:test:runtime` | ❌ producer: 105-06 Task 2 | ⬜ pending |
| 105-06-03 | 06 | 6 | TERM-01, TERM-02 | T-105-PGID-01 | Production GUI performs a deterministic shell command roundtrip and leaves zero owners | graphical smoke | `bun run native:smoke-terminal && bun run native:test:lifecycle` | ❌ producer: 105-06 Task 3 | ⬜ pending |
| 105-07-01 | 07 | 7 | TERM-01 | T-105-OUTPUT-01 | Render frames bound output and preserve Unicode/style/cursor/selection truth | renderer unit | `bun run native:test:renderer` | ❌ expanded by 105-07 Task 1 | ⬜ pending |
| 105-07-02 | 07 | 7 | TERM-01 | T-105-PASTE-01, T-105-ASYNC-01 | Rich keys, mouse, IME, clipboard and paste use bounded production paths | input integration | `bun run native:test:input && bun run native:test:interaction` | ❌ producer: 105-07 Task 2 | ⬜ pending |
| 105-07-03 | 07 | 7 | TERM-01 | T-105-OUTPUT-01 | Real shell smoke retains resize/reflow and alternate-screen interaction | graphical regression | `bun run native:smoke-terminal` | ❌ expanded by 105-07 Task 3 | ⬜ pending |
| 105-08-01 | 08 | 8 | TERM-02, TERM-04 | T-105-PGID-01, T-105-ASYNC-01 | Real widget/VT/PTY cycles leave zero children, PGIDs, FDs and GLib sources | stress | `bun run native:test:stress` | ✅ replace synthetic body | ⬜ pending |
| 105-08-02 | 08 | 8 | TERM-05 | T-105-A11Y-01 | Accessibility tests reject claims absent from the GTK implementation | accessibility | `bun run native:test:accessibility` | ✅ extend existing | ⬜ pending |
| 105-08-03 | 08 | 8 | TERM-01..05 | All | Human evidence begins only after production executable and full native gate pass | full/manual | `bun run native:verify && bun run native:smoke-terminal` | ✅ update existing docs | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [ ] Plans 105-05 through 105-07 create the focused commands and harnesses shown above before their production implementations.
- [ ] `native:smoke-app` launches the production GTK `main`, not a headless struct or synthetic event recorder.
- [ ] `native:smoke-terminal` performs a real product-owned PTY command roundtrip through the production widget/input path.
- [ ] Existing Plan 105-04 ownership/guard tests remain green while the real runtime is attached.
- [ ] Plan 105-08 replaces synthetic lifecycle counters with production widget, VT, PTY, FD, GLib-source and process evidence.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Wayland/X11 keyboard, mouse, Unicode, resize/reflow, alternate screen, clipboard, IME, focus, exit and cleanup | TERM-01, TERM-02 | Headless/display harnesses cannot prove every compositor and input-method path | Launch the documented production `native:run` command and complete `docs/native-terminal-acceptance.md`. |
| Twenty-five real-compositor lifecycle cycles | TERM-04 | Real GPU/compositor resource behavior requires observation | Complete the documented cycle matrix after `native:verify` passes. |
| GTK accessibility and assistive-technology truth | TERM-05 | AT-SPI/Orca behavior and unsupported cell semantics require observation | Complete `docs/native-terminal-accessibility.md`; never infer a pass from template validation. |

## Validation Sign-Off

- [x] Every planned task has a focused automated command or an explicit Wave 0 producer.
- [x] No three consecutive tasks lack automated verification.
- [x] Human approval is ordered after a runnable production terminal and automated gates.
- [x] No watch-mode flags are used; all graphical waits are bounded.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** pending plan-checker verification
