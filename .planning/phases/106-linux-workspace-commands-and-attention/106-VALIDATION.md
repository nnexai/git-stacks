---
phase: 106
slug: linux-workspace-commands-and-attention
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-11
---

# Phase 106 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test runner for TypeScript; Zig `std.testing` through `scripts/verify-native.ts` |
| **Config file** | `scripts/test-runner.ts`, `scripts/verify-native.ts`, `native/build.zig` |
| **Quick run command** | `bun run native:test:quick` plus the focused `bun test <file>` target named by each task |
| **Full suite command** | `bun run native:verify && bun run test && bun run typecheck && bun run test:deps && bun run verify:gates` |
| **Estimated runtime** | Measure during Wave 0 and record before implementation tasks begin |

---

## Sampling Rate

- **After every task commit:** Run the focused Bun or Zig target named by that task; target feedback latency is under 30 seconds.
- **After every plan wave:** Run `bun run native:test:quick` plus affected TypeScript service and hook tests.
- **Before `$gsd-verify-work`:** Run the full suite command and complete documented real-session UAT on the native stack.
- **Max feedback latency:** 30 seconds for task-level sampling; record and split any slower focused target.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 106-W0-01 | TBD | 0 | ACT-01, ACT-02 | — | Resolution failure creates no phantom terminal surface | contract + integration | `bun test tests/lib/service/native-launch.test.ts` | ❌ W0 | ⬜ pending |
| 106-W0-02 | TBD | 0 | ACT-03 | — | Hook input is structured and identity-bound rather than terminal-scraped | unit + integration | `bun test tests/lib/agent-hooks/structured-attention.test.ts tests/lib/service/event-journal.test.ts` | ❌ W0 | ⬜ pending |
| 106-W0-03 | TBD | 0 | LNX-01, LNX-02 | — | Explicit incompatible and failure states remain visible | reducer + GTK harness | `bun run native:test:workspace-ui` | ❌ W0 | ⬜ pending |
| 106-W0-04 | TBD | 0 | LNX-03, LNX-04, ACT-01, ACT-02 | — | Terminal hosts remain pair-bound and navigation-independent | Zig integration + real host | `bun run native:test:tabs` | ❌ W0 | ⬜ pending |
| 106-W0-05 | TBD | 0 | LNX-05 | — | Restore marks dead processes ended and preserves ordering/lineage | Zig persistence | `bun run native:test:restore` | ✅ expand | ⬜ pending |
| 106-W0-06 | TBD | 0 | ACT-04, ACT-05, ACT-06 | — | Receipt never focuses; explicit selection resolves exact or documented fallback target | reducer + effect harness | `bun run native:test:attention` | ❌ W0 | ⬜ pending |
| 106-UAT-01 | TBD | final | LNX-06 | — | Keyboard, IME, focus, and accessibility navigation remain usable | automated semantics + manual UAT | `bun run native:test:accessibility` | ✅ expand | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/service/native-launch.test.ts` — fresh resolved shell/command contract and no-phantom-tab failure fixtures.
- [ ] `tests/lib/agent-hooks/structured-attention.test.ts` and `tests/lib/service/event-journal.test.ts` — structured lifecycle, repository identity, and surface identity coverage.
- [ ] Native fixture export/decoder cases for navigation entities, command identities, tab collections, and attention.
- [ ] `workspace-ui`, `tabs`, and `attention` native build/test targets with Bun script wrappers.
- [ ] Fake terminal-host registry backend for deterministic multi-host navigation, close, and failure tests.
- [ ] Expanded restore and accessibility matrices plus real-session UAT for sidebar/tab/launcher focus, drag-and-drop, IME, badges, and no-focus-theft.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GTK sidebar, tab, launcher, and terminal keyboard/focus traversal | LNX-06 | Toolkit integration and visible focus behavior require a real compositor/session | Execute the Phase 106 real-session acceptance matrix using keyboard-only traversal and record each expected focus transition. |
| IME composition inside terminal while navigation and launcher actions remain available | LNX-06 | Composition behavior depends on the real GTK/terminal host/input-method stack | Enter and commit composed text in a live terminal, cancel a composition, then navigate sidebar and launcher without leaked keystrokes. |
| Native accessibility names, roles, states, and unread announcements | LNX-06, ACT-04 | Assistive-technology output must be observed in the packaged GTK application | Inspect the accessibility tree and run the documented screen-reader path across workspace, repository, tab, and attention controls. |
| Attention selection never steals focus before explicit activation | ACT-05, ACT-06 | Window-manager and compositor focus behavior requires a real desktop session | Generate each lifecycle state while typing elsewhere, verify focus remains, then activate the item and verify exact/fallback routing. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verification or Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verification.
- [ ] Wave 0 covers all MISSING references.
- [ ] No watch-mode flags.
- [ ] Focused feedback latency is below 30 seconds.
- [ ] Full native real-session UAT is documented and completed.
- [ ] `nyquist_compliant: true` is set in frontmatter after the final plan map is populated.

**Approval:** pending
