---
phase: 101
slug: completion-completeness-repair
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-25
---

# Phase 101 - Validation Strategy

Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test runner via repo custom split runner |
| **Config file** | `scripts/test-runner.ts` |
| **Quick run command** | `bun run test -- tests/lib/completion-generator.test.ts` |
| **Full suite command** | `bun run verify` |
| **Estimated runtime** | Quick: under 30 seconds; full verify: repo gate runtime |

---

## Sampling Rate

- **After every task commit:** Run `bun run test -- tests/lib/completion-generator.test.ts`
- **After every plan wave:** Run `bun run test`
- **Before `$gsd-verify-work`:** `bun run verify` must be green
- **Max feedback latency:** under 30 seconds for focused completion feedback

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 101-01-01 | 01 | 1 | COMP-01 | T-101-01 | Completion inventory is derived from live Commander tree metadata, not a hand-maintained list. | unit/integration | `bun run test -- tests/lib/completion-generator.test.ts` | yes | pending |
| 101-01-02 | 01 | 1 | COMP-02 | T-101-02 | Dynamic completion dispatch stays scoped by command path and argument position. | unit | `bun run test -- tests/lib/completion-generator.test.ts` | yes | pending |
| 101-02-01 | 02 | 2 | COMP-01, COMP-03 | T-101-01 | Bash, zsh, and fish generated output is checked against the live inventory. | unit/integration | `bun run test -- tests/lib/completion-generator.test.ts` | yes | pending |
| 101-02-02 | 02 | 2 | COMP-03 | T-101-03 | Release gates fail when completion coverage drifts from the current CLI surface. | script gate | `bun run verify:gates` | yes | pending |
| 101-02-03 | 02 | 2 | COMP-01, COMP-02, COMP-03 | T-101-01 / T-101-02 / T-101-03 | Full repo verification remains green after completion generator and gate changes. | full suite | `bun run verify` | yes | pending |

*Status: pending, green, red, flaky*

---

## Wave 0 Requirements

- [ ] Add explicit inventory-parity assertion that fails when live command additions are missing from generated bash, zsh, or fish completion output.
- [ ] Ensure parity covers `files`, `command`, `notes`, forge/source-adjacent command paths, manager/support surfaces, and existing workspace/template/repo/integration surfaces.
- [ ] Preserve existing regression assertions for parent flag leakage, optional positional handling, fixed enum scoping, and no repeated already-satisfied positional args.

---

## Manual-Only Verifications

All Phase 101 behaviors have automated verification. Manual review may inspect generated completion snippets for readability, but manual approval is not the completion gate.

---

## Validation Sign-Off

- [x] All tasks have automated verify commands or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency under 30 seconds for focused completion feedback
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
