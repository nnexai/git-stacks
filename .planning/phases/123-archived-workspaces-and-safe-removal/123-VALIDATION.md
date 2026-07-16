---
phase: 123
slug: archived-workspaces-and-safe-removal
status: draft
nyquist_compliant: true
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
| **Quick run command** | `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/lib/config.test.ts tests/lib/workspace-pins.test.ts tests/lib/workspace-lifecycle.test.ts tests/lib/service/snapshot.test.ts tests/lib/service/operations.test.ts tests/lib/service/workspace-lifecycle-operations.test.ts tests/service/operations.test.ts tests/service/web-terminal.test.ts tests/service/web-projection.test.ts` |
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
| 123-01-01 | 01 | 1 | ARCH-01, ARCH-04, REMOVE-03, REMOVE-04 | T-123-01, T-123-08 | RED sentinel locks paired archive fields, direct typed blockers, zero mutation, force-only dirty bypass, staged core callbacks, and filename drift | core unit/integration | `./node_modules/.bin/vitest run tests/lib/workspace-archive.test.ts tests/lib/workspace-pins.test.ts tests/lib/workspace-lifecycle.test.ts tests/commands/workspace-lifecycle.test.ts tests/commands/workspace-destructive-safety.test.ts` | ❌ W0 / ✅ base | ⬜ pending |
| 123-01-02 | 01 | 1 | ARCH-01, ARCH-04, REMOVE-03, REMOVE-04 | T-123-01, T-123-08 | Core archive and typed inspect/commit removal APIs preserve unrelated state and report actual destructive call boundaries | core unit/integration | `./node_modules/.bin/vitest run tests/lib/workspace-archive.test.ts tests/lib/workspace-pins.test.ts tests/lib/workspace-lifecycle.test.ts tests/commands/workspace-lifecycle.test.ts tests/commands/workspace-destructive-safety.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| 123-02-01 | 02 | 2 | ARCH-02, ARCH-03, ARCH-05, ARCH-06, REMOVE-01, REMOVE-03, REMOVE-05 | T-123-04, T-123-06, T-123-10, T-123-11 | RED sentinel locks active activity end-to-end, strict catalog/lifecycle schemas, and pin/priority/recency/name/ID ordering | contract/integration | `./node_modules/.bin/vitest run tests/lib/service/snapshot.test.ts tests/service/web-presentation.test.ts` | ✅ extend | ⬜ pending |
| 123-02-02 | 02 | 2 | ARCH-02, ARCH-03, ARCH-05, ARCH-06, REMOVE-01, REMOVE-03, REMOVE-05 | T-123-04, T-123-06, T-123-10, T-123-11 | Aggregate active/archive catalog carries activity_at and one shared successor comparator | contract/integration | `./node_modules/.bin/vitest run tests/lib/service/snapshot.test.ts tests/service/web-presentation.test.ts && npm run build:packages && node --test tests/conformance/protocol-client.test.mjs` | ✅ extend | ⬜ pending |
| 123-03-01 | 03 | 3 | ARCH-02, ARCH-04, REMOVE-02 | T-123-02, T-123-07, T-123-12 | RED sentinel locks target admission, shared close promises, TERM/KILL actual exit, never-exit failure, and bounded cross-principal close | service integration | `./node_modules/.bin/vitest run tests/service/web-terminal.test.ts` | ✅ extend | ⬜ pending |
| 123-03-02 | 03 | 3 | ARCH-02, ARCH-04, REMOVE-02 | T-123-02, T-123-07, T-123-12 | Admission-aware creation and internal workspace close confirm real exit without global serialization or metadata exposure | service integration | `./node_modules/.bin/vitest run tests/service/web-terminal.test.ts` | ✅ extend | ⬜ pending |
| 123-04-01 | 04 | 4 | ARCH-02, ARCH-04, REMOVE-02, REMOVE-03, REMOVE-04, REMOVE-05 | T-123-02, T-123-03, T-123-07, T-123-09 | RED sentinel covers execution-time revision, terminal prerequisite, idempotency/recreated targets, dirty-only force, actual stages, and reconciliation | service integration | `./node_modules/.bin/vitest run tests/lib/service/workspace-lifecycle-operations.test.ts` | ❌ W0 | ⬜ pending |
| 123-04-02 | 04 | 4 | ARCH-02, ARCH-04, REMOVE-02, REMOVE-03, REMOVE-04, REMOVE-05 | T-123-02, T-123-03, T-123-07, T-123-09 | Coordinator holds the target lease through confirmed close, current dirty inspection, core callbacks, and authoritative revision | service integration | `./node_modules/.bin/vitest run tests/lib/service/workspace-lifecycle-operations.test.ts tests/service/web-terminal.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| 123-05-01 | 05 | 0 | ARCH-02, ARCH-04, REMOVE-02, REMOVE-03, REMOVE-05 | T-123-03, T-123-06, T-123-09, T-123-12 | RED sentinel locks strict scope/request shape, same-key observation, no destructive replay, and shared composition identity before production wiring | service integration | `./node_modules/.bin/vitest run tests/lib/service/operations.test.ts tests/service/operations.test.ts` | ✅ extend / W0 | ⬜ pending |
| 123-05-02 | 05 | 5 | ARCH-02, ARCH-04, REMOVE-02, REMOVE-03, REMOVE-05 | T-123-03, T-123-06, T-123-09, T-123-12 | Secure adapters transport typed lifecycle intent to one coordinator without duplicating force, terminal, Git, or filesystem policy | service integration | `./node_modules/.bin/vitest run tests/lib/service/workspace-lifecycle-operations.test.ts tests/lib/service/operations.test.ts tests/service/operations.test.ts tests/service/web-terminal.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| 123-06-01 | 06 | 6 | ARCH-03, ARCH-05, ARCH-06, REMOVE-01, REMOVE-03, REMOVE-05 | T-123-05, T-123-06, T-123-09, T-123-10 | RED sentinel locks browser minimality, all successor ties, dirty-only exact-name confirmation, no replay, and full-set reconciliation | contract/static | `./node_modules/.bin/vitest run tests/service/web-projection.test.ts tests/service/web-presentation.test.ts` | ✅ extend | ⬜ pending |
| 123-06-02 | 06 | 6 | ARCH-03, ARCH-05, ARCH-06, REMOVE-03, REMOVE-05 | T-123-05 | Browser projection allowlists lifecycle fields and active-only signals | contract/security | `./node_modules/.bin/vitest run tests/service/web-projection.test.ts` | ✅ extend | ⬜ pending |
| 123-06-03 | 06 | 6 | ARCH-02, ARCH-05, ARCH-06, REMOVE-01, REMOVE-03, REMOVE-05 | T-123-06, T-123-09, T-123-10, T-123-13 | Web uses T-123-10 shared successor ordering plus T-123-09 dirty-only exact-name force and authoritative replacement refresh; human-only browser verification is handed to Phase 127 | static/browser contract | `./node_modules/.bin/vitest run tests/service/web-projection.test.ts tests/service/web-presentation.test.ts` | ✅ extend | ⬜ pending |
| 123-07-01 | 07 | 6 | ARCH-02, ARCH-03, ARCH-05, ARCH-06, REMOVE-01, REMOVE-03, REMOVE-05 | T-123-03, T-123-09, T-123-14 | RED sentinel renders all successor ties, archive/remove/force/stale states, and both empty states | TUI integration | `bun test --preload @opentui/solid/preload tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` | ❌ W0 | ⬜ pending |
| 123-07-02 | 07 | 6 | ARCH-05, ARCH-06, REMOVE-01, REMOVE-03 | T-123-09, T-123-14 | Discriminated views enforce minimal archive and exact-name dirty-force safety | TUI integration | `bun test --preload @opentui/solid/preload tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` | ❌ W0 | ⬜ pending |
| 123-07-03 | 07 | 6 | ARCH-02, ARCH-03, REMOVE-05 | T-123-03, T-123-15 | TUI consumes shared ordering and awaits authoritative reload before state settles | TUI integration | `bun test --preload @opentui/solid/preload tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` | ❌ W0 | ⬜ pending |
| 123-08-01 | 08 | 7 | ARCH-01–06, REMOVE-01–05 | T-123-01–16 | Focused, conformance, full, dependency, type, and architecture gates verify all adversarial predicates; the range audit assigns dirty-only force to T-123-09 and successor ordering only to T-123-10 | full integration/gates | `npm test && npm run typecheck && npm run test:deps && npm run verify:gates` | ✅ suite / ❌ new cases | ⬜ pending |
| 123-08-02 | 08 | 7 | ARCH-02–06, REMOVE-01, REMOVE-03, REMOVE-05 | T-123-17, T-123-18 | Autonomous package/service/CLI/fixture checks capture safe live evidence without human-approval claims; STATE.md preserves the full packaged web/TUI checklist for Phase 127 after automated/hosted gates and before release side effects | automated live evidence + milestone handoff | `npm run build:packages && npm run web:build && npm run tui:build && npm test && npm run typecheck && npm run test:deps && npm run verify:gates` | ✅ automated prerequisite | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/workspace-archive.test.ts` — archive schema/transitions and timestamp/resource preservation with `PHASE123_RED core archive removal contract` sentinel.
- [ ] Extend `tests/lib/workspace-lifecycle.test.ts` — every dirty blocker, zero normal-dirty mutation, force bypass only of dirty protection, and typed inspect/commit callback order.
- [ ] Extend snapshot/conformance/web-presentation tests — active `activity_at` end-to-end and independent pin/priority/recency/name/ID ties with `PHASE123_RED catalog activity ordering contract` sentinel.
- [ ] `tests/lib/service/workspace-lifecycle-operations.test.ts` — service coordinator, actual core phase boundaries, current dirty-only force, revision/idempotency, typed failures, and reconciliation revision with coordinator RED sentinel.
- [ ] Extend `tests/lib/service/operations.test.ts` and `tests/service/operations.test.ts` — lifecycle router/client/composition behavior with `PHASE123_RED lifecycle router client composition contract` sentinel (Task 123-05-01).
- [ ] `tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` — all successor ties, archive list/empty state, confirmations, force-name input, blockers, and selection with TUI RED sentinel.
- [ ] Extend `tests/service/web-terminal.test.ts` with `PHASE123_RED terminal barrier contract`, a PTY that ignores TERM/KILL, shared close promises, and workspace-global close/admission cases.
- [ ] Extend snapshot, web-projection, pin, and workspace-lifecycle suites for partitioning, minimal summaries, all-archived revision, pin preservation, and resolved YAML deletion.
- [ ] Add focused web presentation/contract coverage for modal singleton behavior, all successor ties, exact-name enablement, full-set terminal reconciliation, and the web RED sentinel.

No framework installation is required.

---

## Milestone-End Manual Handoff (Phase 127; Non-Blocking for Phase 123)

These checks do not block Phase 123 or autonomous re-entry. The durable, fully reproducible checklist lives in STATE.md under `## Milestone-End Manual Verification`; Phase 127 runs it only after its automated and hosted gates and before any tag, push, publish, or release.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live browser Archive, Undo/Unarchive, normal Remove, dirty failure, and exact-name Force Remove | ARCH-05, REMOVE-01, REMOVE-03, REMOVE-05 | Repository has no browser DOM automation harness | Phase 127 follows the STATE.md milestone-end checklist against the packaged live service; Phase 123 records only autonomous evidence and limitations. |
| Live TUI archive/remove workflow | ARCH-05, REMOVE-01, REMOVE-05 | OpenTUI integration tests do not prove final terminal rendering/interaction | Phase 127 follows the same STATE.md fixture/checklist and records the human verdict before release side effects. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verification or Wave 0 dependencies.
- [ ] Sampling continuity: no three consecutive tasks without automated verification.
- [ ] Wave 0 covers all missing references.
- [ ] No watch-mode flags.
- [ ] Focused feedback latency is under 120 seconds.
- [ ] `nyquist_compliant: true` set after validation audit.

**Approval:** plan-ready; Phase 123 autonomous execution/evidence pending; live browser/TUI approval handed to Phase 127 milestone end
