---
phase: 74
slug: template-label-cli-propagation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 74 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` plus the repo-local isolated runner in `scripts/test-runner.ts` |
| **Config file** | `bunfig.toml` |
| **Quick run command** | `bun test tests/lib/composition.test.ts tests/tui/workspace-wizard.test.ts tests/commands/template-label.test.ts tests/commands/template-list.test.ts tests/tui/workspace-clone.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~15 seconds (targeted), ~30 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/composition.test.ts tests/tui/workspace-wizard.test.ts tests/commands/template-label.test.ts tests/commands/template-list.test.ts tests/tui/workspace-clone.test.ts`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 74-01-01 | 01 | 1 | TLBL-01, TLBL-02, TLBL-03, TLBL-04 | integration | `bun test tests/commands/template-label.test.ts` | ❌ W0 | ⬜ pending |
| 74-01-02 | 01 | 1 | TLBL-05 | integration | `bun test tests/commands/template-list.test.ts` | ❌ W0 | ⬜ pending |
| 74-02-01 | 02 | 1 | TLBL-06 | unit + integration | `bun test tests/lib/composition.test.ts tests/tui/workspace-wizard.test.ts` | ✅ | ⬜ pending |
| 74-02-02 | 02 | 1 | TLBL-07 | integration | `bun test tests/tui/workspace-clone.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠ flaky*

---

## Wave 0 Requirements

- [ ] `tests/commands/template-label.test.ts` — cover template label add/remove/list/clear behavior and invalid-label rejection
- [ ] `tests/commands/template-list.test.ts` — cover `template list --label` exact-match AND filtering and no-match output
- [ ] `tests/tui/workspace-clone.test.ts` — lock in source-label preservation on clone
- [ ] Extend `tests/lib/composition.test.ts` — add merged-label coverage for includes and multi-template composition
- [ ] Extend `tests/tui/workspace-wizard.test.ts` — cover composed/included template label union into created workspace YAML

*Existing infrastructure covers framework installation; this phase needs only test-file creation and extension.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Template list output remains readable when filtered by label | TLBL-05 | Output formatting is user-facing and easier to inspect directly than snapshot here | Run `bun run src/index.ts template list --label <label>` against labeled fixtures and verify the filtered rows remain readable |

*All other phase behaviors should have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
