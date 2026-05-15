---
phase: 88
slug: functional-coverage-readiness-gate
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-15
---

# Phase 88 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test through Bun and the existing custom runner |
| **Config file** | `bunfig.toml`, `package.json`, `tsconfig.json` |
| **Quick run command** | `bun test tests/lib/functional-coverage-readiness.test.ts tests/lib/verify-gates.test.ts` |
| **Full suite command** | `bun run verify` |
| **Estimated runtime** | Quick checks under 60 seconds; full verify depends on coverage and suite runtime |

## Sampling Rate

- **After every task commit:** Run the task's focused `bun test ...` command or source assertion.
- **After every plan wave:** Run `bun run coverage` and `bun run verify:gates`.
- **Before `$gsd-verify-work`:** `bun run verify` must be green.
- **Max feedback latency:** Use focused unit tests before full coverage; do not run watch-mode commands.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 88-01-01 | 01 | 1 | GATE-04, COVR-05 | T-88-01 | Generated coverage JSON is parsed as untrusted local input and malformed reports become actionable findings | unit | `bun test tests/lib/functional-coverage-readiness.test.ts` | ✅ | pending |
| 88-01-02 | 01 | 1 | GATE-04, COVR-05 | T-88-02 | Readiness evidence clearly separates accepted/deferred/must-fix classifications and excludes milestone finalization | source/docs | `test -f .planning/v0.17.1-FUNCTIONAL-COVERAGE-READINESS.md && grep -q "must-fix-before-release" .planning/v0.17.1-FUNCTIONAL-COVERAGE-READINESS.md` | ✅ | pending |
| 88-02-01 | 02 | 2 | GATE-04 | T-88-03 | Local gates reject must-fix functional readiness gaps while aggregating all findings | unit/gate | `bun test tests/lib/verify-gates.test.ts && bun run verify:gates` | ✅ | pending |
| 88-02-02 | 02 | 2 | GATE-04, COVR-05 | T-88-04 | Final local verification proves the canonical coverage report and readiness gate compose without CI or finalization | full gate | `bun run verify` | ✅ | pending |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

## Manual-Only Verifications

All phase behaviors have automated verification. Human review may read `.planning/v0.17.1-FUNCTIONAL-COVERAGE-READINESS.md`, but it is not a required execution gate.

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands or source assertions.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency uses focused tests before full verification.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-05-15 for Phase 88 planning
