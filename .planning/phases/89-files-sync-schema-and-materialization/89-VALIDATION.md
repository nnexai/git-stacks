---
phase: 89
slug: files-sync-schema-and-materialization
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-16
---

# Phase 89 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test |
| **Config file** | `bunfig.toml`, `tsconfig.json` |
| **Quick run command** | `bun test tests/lib/config.test.ts tests/lib/composition.test.ts tests/lib/files.test.ts` |
| **Full suite command** | `bun run typecheck && bun run verify:gates` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the plan-specific focused `bun test ...` command.
- **After every plan wave:** Run `bun test tests/lib/config.test.ts tests/lib/composition.test.ts tests/lib/files.test.ts tests/lib/lifecycle-files-env-config-real-fixture.test.ts`.
- **Before `$gsd-verify-work`:** `bun run typecheck && bun run verify:gates` must be green.
- **Max feedback latency:** 180 seconds for focused checks.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 89-01-01 | 01 | 1 | FSYNC-01 | T-89-01 | Reject malformed sync config before materialization | unit | `bun test tests/lib/config.test.ts` | yes | pending |
| 89-01-02 | 01 | 1 | FSYNC-01 | T-89-01 | Preserve additive include-order template composition | unit | `bun test tests/lib/composition.test.ts` | yes | pending |
| 89-02-01 | 02 | 2 | FSYNC-02 | T-89-02 | Copy sync sources as real files/directories, not symlinks | unit | `bun test tests/lib/files.test.ts` | yes | pending |
| 89-02-02 | 02 | 2 | FSYNC-02 | T-89-02 | Refuse unsafe and existing targets | unit | `bun test tests/lib/files.test.ts` | yes | pending |
| 89-02-03 | 02 | 2 | FSYNC-02 | T-89-03 | Refuse tracked target collisions | real git fixture | `bun test tests/lib/lifecycle-files-env-config-real-fixture.test.ts` | yes | pending |
| 89-03-01 | 03 | 3 | FSYNC-03 | T-89-04 | Write excludes only to local git info/exclude | real git fixture | `bun test tests/lib/lifecycle-files-env-config-real-fixture.test.ts` | yes | pending |
| 89-03-02 | 03 | 3 | FSYNC-03 | T-89-04 | Use common git dir for linked worktrees | real git fixture | `bun test tests/lib/lifecycle-files-env-config-real-fixture.test.ts` | yes | pending |
| 89-03-03 | 03 | 3 | FSYNC-01, FSYNC-02, FSYNC-03 | T-89-05 | Create/open flows keep existing file-op behavior and include sync | integration | `bun test tests/lib/workspace-lifecycle-create.test.ts tests/lib/workspace-ops.test.ts` | yes | pending |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:

- `tests/lib/config.test.ts`
- `tests/lib/composition.test.ts`
- `tests/lib/files.test.ts`
- `tests/lib/lifecycle-files-env-config-real-fixture.test.ts`
- `tests/helpers.ts`

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have automated verify commands.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency target is under 180 seconds for focused checks.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending execution

