---
phase: 50
slug: integration-specific-tools
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | `scripts/test-runner.ts` (isolated runner) |
| **Quick run command** | `bun test tests/lib/integration-commands.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/integration-commands.test.ts`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | config example | unit | `bun test tests/lib/integration-commands.test.ts` | ❌ W0 | ⬜ pending |
| 50-01-02 | 01 | 1 | config show | unit | `bun test tests/lib/integration-commands.test.ts` | ❌ W0 | ⬜ pending |
| 50-01-03 | 01 | 1 | integration list | unit | `bun test tests/lib/integration-commands.test.ts` | ❌ W0 | ⬜ pending |
| 50-02-01 | 02 | 1 | aerospace focus | unit | `bun test tests/lib/integration-commands.test.ts` | ❌ W0 | ⬜ pending |
| 50-02-02 | 02 | 1 | vscode open | unit | `bun test tests/lib/integration-commands.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Extend `tests/lib/integration-commands.test.ts` — stubs for config example, config show, integration list, aerospace focus, vscode open
- [ ] Mock `@/lib/aerospace` exports in test file — needed for aerospace focus command tests

*Existing test infrastructure covers framework and runner requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `aerospace focus` actually switches macOS workspace | aerospace focus | Requires macOS + AeroSpace running | Run `git-stacks integration aerospace focus <ws>`, verify AeroSpace workspace switches |
| `vscode open` launches VS Code | vscode open | Requires VS Code installed | Run `git-stacks integration vscode open <ws>`, verify VS Code opens with workspace file |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
