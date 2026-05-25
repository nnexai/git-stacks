---
phase: 103
slug: v0-19-0-final-release-validation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-25
---

# Phase 103 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test plus repo-local verification scripts |
| **Config file** | `package.json` |
| **Quick run command** | `bun test tests/commands/release-rc.test.ts` |
| **Full suite command** | `bun run scripts/release-rc-check.ts --skip-tag` |
| **Estimated runtime** | Focused checks first; full release gate uses repo gate runtime |

## Sampling Rate

- **After every task commit:** Run the focused command listed for the task.
- **After every plan wave:** Run `bun run scripts/release-rc-check.ts --skip-tag`.
- **Before `$gsd-verify-work`:** The full release gate must be green, or failures must be documented as unrelated with exact evidence and a release decision.
- **Max feedback latency:** Focused checks before full gate.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 103-01-01 | 01 | 1 | REL-01 | T-103-01 | RC.2 package metadata and release notes cannot be confused with final `0.19.0` | docs/package smoke | `bun test tests/commands/release-rc.test.ts` | yes | pending |
| 103-01-02 | 01 | 1 | REL-02 | T-103-02 | Release smoke names and checks Phase 100-102 follow-up surfaces | release smoke | `bun test tests/commands/release-rc.test.ts` | yes | pending |
| 103-01-03 | 01 | 1 | REL-02 | T-103-03 | Canonical RC gate blocks on verify or publish dry-run failure before tag handoff | release gate | `bun run scripts/release-rc-check.ts --skip-tag` | yes | pending |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real annotated tag creation and npm publish | REL-01, REL-02 | The planning/execution gate should not mutate release tags or publish packages until the operator chooses to ship. | After the executor records a green `bun run scripts/release-rc-check.ts --skip-tag`, run `bun run scripts/release-rc-check.ts` to create/check `v0.19.0-rc.2`, then run `bun publish` if the package is ready. |

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency is bounded by focused checks before the full gate
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
