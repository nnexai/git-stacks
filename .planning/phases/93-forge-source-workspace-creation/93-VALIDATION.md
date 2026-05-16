---
phase: 93
slug: forge-source-workspace-creation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-16
---

# Phase 93 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test |
| **Config file** | `package.json` |
| **Quick run command** | `bun test tests/lib/workspace-source.test.ts tests/commands/workspace-source.test.ts` |
| **Full suite command** | `bun test tests/lib/integrations/forge-source.test.ts tests/lib/workspace-source.test.ts tests/commands/workspace-source.test.ts tests/commands/workspace-source-git.test.ts tests/lib/config.test.ts && bun run typecheck` |
| **Estimated runtime** | ~60 seconds focused |

## Sampling Rate

- **After every task commit:** Run the plan task's focused `bun test ...` command.
- **After every plan wave:** Run the full focused suite listed above.
- **Before `$gsd-verify-work`:** `bun run typecheck` and every Phase 93 focused test must be green.
- **Max feedback latency:** 90 seconds for focused checks.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 93-01-01 | 01 | 1 | FSRC-01, FSRC-04 | T-93-01 | Reject invalid source/template combinations before side effects | subprocess | `bun test tests/commands/workspace-source.test.ts` | present | passing |
| 93-01-02 | 01 | 1 | FSRC-04 | T-93-02 | Typed resolver failures include explicit guidance | unit | `bun test tests/lib/workspace-source.test.ts` | present | passing |
| 93-02-01 | 02 | 2 | FSRC-05 | T-93-03 | Fetch exact source ref without provider checkout | local Git fixture | `bun test tests/lib/workspace-source.test.ts tests/commands/workspace-source-git.test.ts` | present | passing |
| 93-02-02 | 02 | 2 | FSRC-05 | T-93-04 | Existing branch conflicts do not reset or overwrite local refs | local Git fixture | `bun test tests/commands/workspace-source-git.test.ts` | present | passing |
| 93-03-01 | 03 | 2 | FSRC-06 | T-93-05 | Source provenance validates as dedicated YAML block | unit/subprocess | `bun test tests/lib/config.test.ts tests/commands/workspace-source.test.ts` | present | passing |
| 93-03-02 | 03 | 2 | FSRC-07 | T-93-06 | No implicit source labels are added despite source metadata | subprocess | `bun test tests/commands/workspace-source.test.ts` | present | passing |
| 93-04-01 | 04 | 3 | FSRC-01, FSRC-04, FSRC-05, FSRC-06 | T-93-07 | End-to-end local source creation creates only intended workspace artifacts | subprocess/local Git | `bun test tests/commands/workspace-source-git.test.ts` | missing | pending |
| 93-04-02 | 04 | 3 | FSRC-01, FSRC-04, FSRC-05, FSRC-06, FSRC-07 | T-93-08 | Live validation limits and label deferral remain documented | source assertion | `rg -n "live forge|not auto-label|Provider checkout commands are not internal checkout implementation" docs .planning/phases/93-forge-source-workspace-creation` | partial | pending |

## Wave 0 Requirements

- [ ] `tests/lib/workspace-source.test.ts` - unit/injected source orchestration tests.
- [ ] `tests/commands/workspace-source.test.ts` - subprocess CLI tests for options, dry-run, failures, and YAML.
- [ ] `tests/commands/workspace-source-git.test.ts` - local bare-remote source fetch/worktree tests.
- [ ] Existing `tests/helpers.ts` local Git fixtures are reused; extend only if a small helper removes duplication.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live authenticated GitLab/GitHub source metadata | FSRC-01, FSRC-05 | `glab` and `gh` are not installed/authenticated locally | Optional follow-up only: run against a private test MR/PR after installing/authenticating provider CLI. Do not make this a release gate. |

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers missing source-workspace test files.
- [x] No watch-mode flags.
- [x] Feedback latency target < 90s for focused checks.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
