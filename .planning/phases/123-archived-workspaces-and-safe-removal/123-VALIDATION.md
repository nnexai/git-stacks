---
phase: 123
slug: archived-workspaces-and-safe-removal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-16
---

# Phase 123 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 for core/service/protocol/web; Bun 1.3.14 with OpenTUI preload for TUI |
| **Config file** | `vitest.config.ts`, `packages/tui/bunfig.toml`, `scripts/test-tui.mjs` |
| **Quick run command** | `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/lib/config.test.ts tests/lib/workspace-pins.test.ts tests/lib/workspace-lifecycle.test.ts tests/lib/service/snapshot.test.ts tests/lib/service/operations.test.ts tests/service/web-terminal.test.ts tests/service/web-projection.test.ts` |
| **Full suite command** | `npm test && npm run typecheck && npm run test:deps && npm run verify:gates` |
| **Estimated runtime** | Quick set under 120 seconds; full suite varies by host |

---

## Sampling Rate

- **After every task commit:** Run the focused Vitest or Bun file named by the task plus the affected package typecheck.
- **After every plan wave:** Run the quick Vitest set, the Phase 123 TUI integration test, `npm run typecheck`, and `npm run test:deps`.
- **Before `$gsd-verify-work`:** `npm test && npm run typecheck && npm run test:deps && npm run verify:gates` must be green.
- **Max feedback latency:** 120 seconds for the focused automated sample.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 123-01-01 | 01 | 1 | ARCH-01, ARCH-04 | T-123-01 | Atomic paired archive fields preserve non-terminal state | unit | `vitest run tests/lib/workspace-archive.test.ts tests/lib/config.test.ts` | ❌ W0 / ✅ base | ⬜ pending |
| 123-01-02 | 01 | 1 | ARCH-03, ARCH-06 | T-123-05 | Archived definitions never enter full active/browser projections | unit/integration | `vitest run tests/lib/service/snapshot.test.ts tests/service/web-projection.test.ts tests/lib/workspace-pins.test.ts` | ✅ extend | ⬜ pending |
| 123-02-01 | 02 | 1 | REMOVE-02 | T-123-02, T-123-07 | Workspace admission is quiesced and every PTY exit is confirmed before mutation | service integration | `vitest run tests/service/web-terminal.test.ts tests/lib/service/workspace-lifecycle-operations.test.ts` | ✅ extend / ❌ W0 | ⬜ pending |
| 123-02-02 | 02 | 1 | ARCH-02, REMOVE-03, REMOVE-04 | T-123-01, T-123-03 | Revision-bound typed operations derive authoritative targets and fail closed | core/service integration | `vitest run tests/lib/workspace-lifecycle.test.ts tests/lib/service/workspace-lifecycle-operations.test.ts tests/commands/workspace-destructive-safety.test.ts` | ✅ extend / ❌ W0 | ⬜ pending |
| 123-03-01 | 03 | 2 | ARCH-05, REMOVE-01, REMOVE-05 | T-123-05, T-123-06 | Browser receives bounded summaries/details and must reconfirm destructive retries | contract/static + live UAT | `vitest run tests/service/web-projection.test.ts tests/service/web-presentation.test.ts` | ✅ extend | ⬜ pending |
| 123-04-01 | 04 | 2 | ARCH-05, ARCH-06, REMOVE-01, REMOVE-05 | T-123-03 | TUI uses shared operations, exact-name force confirmation, and authoritative reconciliation | TUI integration | `bun test --preload @opentui/solid/preload tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` | ❌ W0 | ⬜ pending |
| 123-05-01 | 05 | 3 | ARCH-02–06, REMOVE-01–05 | T-123-01–07 | Concurrent/retried operations cannot mutate stale, recreated, unrelated, or unquiesced state | integration/gates | `npm test && npm run typecheck && npm run test:deps && npm run verify:gates` | ✅ suite / ❌ cases | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/workspace-archive.test.ts` — archive schema/transitions, timestamp stability, resource/pin preservation, and filename drift.
- [ ] `tests/lib/service/workspace-lifecycle-operations.test.ts` — service coordinator, stages, revision/idempotency, quiesce, typed failures, and reconciliation revision.
- [ ] `tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` — archive list/empty state, confirmations, force-name input, blockers, and selection.
- [ ] Extend `tests/service/web-terminal.test.ts` with a PTY that ignores TERM/KILL plus workspace-global close/admission cases.
- [ ] Extend snapshot, web-projection, pin, and workspace-lifecycle suites for partitioning, minimal summaries, all-archived revision, pin preservation, and resolved YAML deletion.
- [ ] Add focused web presentation/contract coverage for modal singleton behavior, exact-name enablement, and full-set terminal reconciliation.

No framework installation is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live browser Archive, Undo/Unarchive, normal Remove, dirty failure, and exact-name Force Remove | ARCH-05, REMOVE-01, REMOVE-03, REMOVE-05 | Repository has no browser DOM automation harness | Run the packaged web client against the live service; validate pointer and keyboard paths, progress, refresh/reconfirm, selection, terminal disposal, and active/archived empty states. |
| Live TUI archive/remove workflow | ARCH-05, REMOVE-01, REMOVE-05 | OpenTUI integration tests do not prove final terminal rendering/interaction | Run the TUI against the same fixture and validate archive list, default-cancel confirmation, blocker list, exact-name force input, selection, and progress/error copy. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verification or Wave 0 dependencies.
- [ ] Sampling continuity: no three consecutive tasks without automated verification.
- [ ] Wave 0 covers all missing references.
- [ ] No watch-mode flags.
- [ ] Focused feedback latency is under 120 seconds.
- [ ] `nyquist_compliant: true` set after validation audit.

**Approval:** pending
