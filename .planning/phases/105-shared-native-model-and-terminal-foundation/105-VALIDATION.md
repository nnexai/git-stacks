---
phase: 105
slug: shared-native-model-and-terminal-foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-11
---

# Phase 105 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test plus Zig 0.15.2 tests and native C/GTK harnesses |
| **Config file** | `package.json` and `native/build.zig`, created by Plan 105-01 before downstream consumers |
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
| 105-01-01 | 01 | 1 | TERM-03 | T-105-01, T-105-SC | Exact Zig/Ghostty tag+commit pins and API feasibility | build / smoke | `bun run native:test:terminal-build` | ✅ task creates command/build harness | ⬜ pending |
| 105-02-01 | 02 | 2 | CORE-01, CORE-03 | T-105-02, T-105-03 | Strict bounded decode and opaque ABI ownership | unit / C harness | `bun run native:test:model` | ✅ task creates ABI harness | ⬜ pending |
| 105-02-02 | 02 | 2 | CORE-01, CORE-04 | T-105-01 | Linux golden parity and platform-neutral ABI portability; actual macOS execution deferred to Phase 107 by user decision | golden / portability | `bun run native:test:model && bun run native:test:quick` | ✅ consumes 105-02-01 harness; task creates fixture workflow | ⬜ pending |
| 105-03-01 | 03 | 3 | CORE-01, CORE-02, CORE-04 | T-105-04, T-105-07 | Deterministic reducer and inert unknown optionals | unit / golden | `bun run native:test:model` | ✅ consumes ABI harness; task creates reducer tests | ⬜ pending |
| 105-03-02 | 03 | 3 | CORE-05 | T-105-05, T-105-06 | Restored sessions cannot claim unverified liveness | unit / integration | `bun run native:test:restore` | ✅ task creates persistence harness | ⬜ pending |
| 105-03-03 | 03 | 3 | CORE-03, CORE-05 | T-105-06, T-105-07 | Relaunch lineage and ABI/direct-core parity | golden / integration | `bun run native:test:restore && bun run native:test:model && bun run native:test:quick` | ✅ consumes 105-02-01/105-03-02 harnesses | ⬜ pending |
| 105-04-01 | 04 | 4 | CORE-02, CORE-05, TERM-02, TERM-04 | T-105-08, T-105-09, T-105-10 | Exclusive PGID ownership and crash-guard proof | integration | `bun run native:test:lifecycle` | ✅ task creates ownership harness | ⬜ pending |
| 105-05-01 | 05 | 5 | CORE-02, CORE-05, TERM-01, TERM-02, TERM-03, TERM-04 | T-105-08, T-105-09, T-105-10, T-105-11, T-105-12 | Fail-closed adapter-only source audit; hosted registration-before-live; ownership-mediated close/exit/quit/crash; absence-before-unregister; input seams and late-callback rejection | source audit / integration / headless GTK | `bun run native:test:terminal-build && bun run native:test:terminal-host` | ✅ build/ownership harnesses from 105-01/105-04; task extends verifier and creates integrated host harness | ⬜ pending |
| 105-05-02 | 05 | 5 | TERM-04, TERM-05 | T-105-09, T-105-11, T-105-12 | Bounded lifecycle trends and honest accessibility | stress / contract + manual | `bun run native:verify && bun run native:test:accessibility` | ✅ task creates stress/accessibility harness before checkpoint | ⬜ pending |

---

## Wave 0 Requirements

- [x] Plan 105-01 Task 1 creates exact toolchain/source provisioning and native commands before all consumers.
- [x] Plan 105-02 Task 1 creates the ABI harness before fixture and reducer consumers.
- [x] Plan 105-02 Task 2 creates Linux golden execution and strict header portability checks; actual macOS runtime parity is deferred to Phase 107 by explicit user decision.
- [x] Plan 105-03 Tasks 1-2 create reducer and persistence harnesses before ABI lineage composition.
- [x] Plan 105-04 Task 1 creates ownership/guard tests before terminal hosting and stress.
- [x] Plan 105-05 Task 1 extends the native verifier with the adapter-boundary audit and creates an integrated host/ownership lifecycle harness before its gate; Task 2 creates stress and accessibility harnesses before theirs.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Linux terminal keyboard, mouse, Unicode, resize/reflow, alternate screen, clipboard, and IME interaction | TERM-01 | Headless harnesses cannot prove compositor, input-method, clipboard, and visual behavior end to end | Launch the pinned native harness on a real Linux session; execute the documented interaction matrix and capture environment/version evidence. |
| Native accessibility contract is honest and usable | TERM-05 | Assistive-technology behavior and absence of overclaimed cell semantics require observation | Inspect the exposed GTK accessibility tree with the documented tool, exercise focus/labels/actions, and record supported and intentionally unsupported semantics. |

---

## Validation Sign-Off

- [x] Every final task in Plans 105-01 through 105-05 has an automated command and named harness producer.
- [x] Sampling continuity target prevents three consecutive tasks without automated verification.
- [x] Wave 0 ownership is assigned to the earliest task that creates each missing harness or entrypoint.
- [x] No watch-mode flags are used.
- [x] Quick feedback target is under 30 seconds.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** pending plan-checker verification
