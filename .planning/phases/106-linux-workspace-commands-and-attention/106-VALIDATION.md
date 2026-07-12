---
phase: 106
slug: linux-workspace-commands-and-attention
status: planned
nyquist_compliant: true
wave_0_complete: true
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
| 106-01-01 | 106-01 | 1 | ACT-01, ACT-02, ACT-03 | — | Strict stable-ID schemas negotiate fresh launch and structured attention | contract | `bun test tests/lib/service/contract.test.ts` | 🆕 task | ⬜ pending |
| 106-01-02 | 106-01 | 1 | ACT-01, ACT-02 | — | Resolution failure creates no launch specification or phantom surface | contract + integration | `bun test tests/lib/service/snapshot.test.ts tests/lib/service/native-launch.test.ts` | 🆕 task | ⬜ pending |
| 106-01-03 | 106-01 | 1 | ACT-03, ACT-06 | — | Hook lifecycle is structured and identity-bound rather than terminal-scraped | unit + integration | `bun test tests/lib/agent-hooks/structured-attention.test.ts tests/lib/service/event-journal.test.ts` | 🆕 task | ⬜ pending |
| 106-02-01 | 106-02 | 2 | LNX-01, LNX-02, LNX-03, LNX-05 | — | Normalized pair collections restore presentation as ended and reconcile vanished identities | reducer + persistence | `bun run native:test:restore && bun run native:test:model` | ✅ expand | ⬜ pending |
| 106-02-02 | 106-02 | 2 | ACT-03, ACT-04, ACT-05, ACT-06 | — | Derived aggregates cannot drift; receipt never focuses; explicit selection returns exact/fallback route | reducer + ABI | `bun run native:test:attention && bun run native:test:model` | 🆕 task | ⬜ pending |
| 106-02-03a | 106-02 | 2 | LNX-01, LNX-02, ACT-01, ACT-02, ACT-03 | — | Authenticated discovery, strict snapshot/event decoding, replay-gap recovery, reconnect, and launch outcomes drive explicit reducer state | Zig transport integration | `bun run native:test:service-client` | 🆕 task | ⬜ pending |
| 106-02-03 | 106-02 | 2 | LNX-03, LNX-04, ACT-01, ACT-02 | — | Terminal hosts remain pair-bound, navigation-independent, and absent on launch failure | Zig integration + fake host | `bun run native:test:tabs && bun run native:test:quick` | 🆕 task | ⬜ pending |
| 106-03-01 | 106-03 | 3 | LNX-01, LNX-02, LNX-03, LNX-04, LNX-05, LNX-06 | — | GTK projection exposes explicit states, complete tab select/cycle/reorder/rename/close/relaunch controls, and preserves hidden host identity/lifetime | GTK/model harness | `bun run native:test:workspace-ui && bun run native:test:tabs` | 🆕 task | ⬜ pending |
| 106-03-02 | 106-03 | 3 | LNX-06, ACT-01, ACT-02, ACT-04, ACT-05, ACT-06 | — | One action path preserves IME/accessibility and asynchronous events never focus | effect + accessibility harness | `bun run native:test:workspace-ui && bun run native:test:attention && bun run native:test:accessibility` | ✅ expand | ⬜ pending |
| 106-03-03 | 106-03 | 3 | LNX-01, LNX-02, LNX-03, LNX-04, LNX-05, LNX-06, ACT-01, ACT-02, ACT-03, ACT-04, ACT-05, ACT-06 | — | Complete graphical-session acceptance including no focus theft | full automation + manual UAT | `bun run native:verify && bun run test && bun run typecheck && bun run test:deps && bun run verify:gates` | 🆕 task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Plan 106-01 Task 1 creates contract fixtures before contract implementation.
- [x] Plan 106-01 Tasks 2-3 create fresh-resolution and structured-hook tests before implementation.
- [x] Plan 106-02 Tasks 1-3 create/expand native restore, attention, ABI, and fake-host registry tests before implementation.
- [x] Plan 106-03 Tasks 1-2 create GTK action/projection and accessibility harnesses before implementation.
- [x] Plan 106-03 Task 3 creates and completes the real-session evidence matrix before phase approval.

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

- [x] All tasks have `<automated>` verification and test-first behavior where production code changes.
- [x] Sampling continuity: every task has automated verification.
- [x] Former Wave 0 gaps are assigned to concrete task-first test artifacts.
- [x] No watch-mode flags.
- [ ] Focused feedback latency is below 30 seconds (measure during execution).
- [ ] Full native real-session UAT is documented and completed (Plan 106-03 Task 3 gate).
- [x] `nyquist_compliant: true` is set after the concrete task map is populated.

**Approval:** pending
