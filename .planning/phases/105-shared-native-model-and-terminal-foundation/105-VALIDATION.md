---
phase: 105
slug: shared-native-model-and-terminal-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-11
---

# Phase 105 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test plus Zig 0.15.2 tests and native C/GTK harnesses |
| **Config file** | `package.json`; native build/test configuration is created in Wave 0 |
| **Quick run command** | `bun run native:test:quick` |
| **Full suite command** | `bun run native:verify` |
| **Estimated runtime** | Quick target <30 seconds; full native/stress target <10 minutes |

---

## Sampling Rate

- **After every task commit:** Run the task's focused Bun, Zig, C ABI, or native harness command; default to `bun run native:test:quick` once available.
- **After every plan wave:** Run `bun run native:verify` plus the focused existing Bun tests affected by that wave.
- **Before `$gsd-verify-work`:** `bun run native:verify`, `bun run test`, `bun run typecheck`, `bun run test:deps`, and `bun run verify:gates` must be green.
- **Max feedback latency:** 30 seconds for the per-task quick target.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 105-01-01 | 01 | 1 | CORE-01, CORE-03, CORE-04 | T-105-01 | Strict bounded decode and opaque ABI ownership | unit / golden | `bun run native:test:model` | ❌ W0 | ⬜ pending |
| 105-02-01 | 02 | 2 | CORE-02, CORE-05 | T-105-02 | Restored sessions cannot claim unverified process liveness | unit / integration | `bun run native:test:restore` | ❌ W0 | ⬜ pending |
| 105-03-01 | 03 | 2 | TERM-01, TERM-03 | T-105-03 | Exact source/toolchain pins and adapter-only upstream access | build / smoke | `bun run native:test:terminal-build` | ❌ W0 | ⬜ pending |
| 105-04-01 | 04 | 3 | TERM-02, TERM-04 | T-105-04 | Exclusive PGID ownership, idempotent teardown, late-callback rejection | integration / stress | `bun run native:test:lifecycle` | ❌ W0 | ⬜ pending |
| 105-04-02 | 04 | 3 | TERM-05 | — | Accessibility claims match exposed native semantics | automated contract + manual | `bun run native:test:accessibility` | ❌ W0 | ⬜ pending |

Task and plan identifiers are provisional until the planner writes the executable PLAN.md files; the planner must replace or extend this map to match the final task graph.

---

## Wave 0 Requirements

- [ ] Add repo-controlled Zig 0.15.2 provisioning with checksum verification and the exact peeled Ghostty source pin.
- [ ] Add `bun run native:test:quick` and `bun run native:verify` orchestration without relying on ambient Zig.
- [ ] Add Phase 104 golden-fixture export/consumption harnesses for Zig and the versioned C ABI.
- [ ] Add native restoration fixtures, GTK/libghostty lifecycle harnesses, crash-guard tests, and orphan/leak probes.
- [ ] Add a macOS-compatible C ABI compile/test lane using the same header and fixture corpus.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Linux terminal keyboard, mouse, Unicode, resize/reflow, alternate screen, clipboard, and IME interaction | TERM-01 | Headless harnesses cannot prove compositor, input-method, clipboard, and visual behavior end to end | Launch the pinned native harness on a real Linux session; execute the documented interaction matrix and capture environment/version evidence. |
| Native accessibility contract is honest and usable | TERM-05 | Assistive-technology behavior and absence of overclaimed cell semantics require observation | Inspect the exposed GTK accessibility tree with the documented tool, exercise focus/labels/actions, and record supported and intentionally unsupported semantics. |

---

## Validation Sign-Off

- [x] All provisional capability groups have automated verification or Wave 0 dependencies.
- [x] Sampling continuity target prevents three consecutive tasks without automated verification.
- [x] Wave 0 identifies all currently missing native harnesses and toolchain entrypoints.
- [x] No watch-mode flags are used.
- [x] Quick feedback target is under 30 seconds.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** pending plan-checker verification
