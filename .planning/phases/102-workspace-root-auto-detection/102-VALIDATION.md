---
phase: 102
slug: workspace-root-auto-detection
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-25
---

# Phase 102 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test runner |
| **Config file** | `scripts/test-runner.ts`, `package.json` |
| **Quick run command** | `bun test tests/lib/detect-workspace-cwd.test.ts tests/commands/workspace-wrapper-edges.test.ts tests/commands/files.test.ts tests/commands/command.test.ts tests/commands/notes.test.ts` |
| **Full suite command** | `bun run verify` |
| **Estimated runtime** | ~120 seconds for focused command tests; full suite runtime varies by machine |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/detect-workspace-cwd.test.ts tests/commands/workspace-wrapper-edges.test.ts tests/commands/files.test.ts tests/commands/command.test.ts tests/commands/notes.test.ts`
- **After every plan wave:** Run `bun run test`
- **Before `$gsd-verify-work`:** Full suite must be green via `bun run verify`
- **Max feedback latency:** 120 seconds for focused checks before broader verification

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 102-01-01 | 01 | 1 | WDET-01 | T-102-01 | Workspace-root matching must not select a prefix-collision workspace | unit | `bun test tests/lib/detect-workspace-cwd.test.ts` | ✅ | ⬜ pending |
| 102-01-02 | 01 | 1 | WDET-02 | T-102-02 | Existing deepest repo match, trunk skip, dir repo, and missing worktree behavior remains intact | unit | `bun test tests/lib/detect-workspace-cwd.test.ts` | ✅ | ⬜ pending |
| 102-01-03 | 01 | 1 | WDET-03 | T-102-03 | Shared optional workspace resolution order is explicit arg, cwd detection, then env fallback only where already supported | unit/source | `bun test tests/lib/detect-workspace-cwd.test.ts tests/commands/notes.test.ts` | ✅ | ⬜ pending |
| 102-02-01 | 02 | 2 | WDET-01 | T-102-01 | Representative workspace-only command resolves workspace from workspace root cwd | subprocess | `bun test tests/commands/workspace-wrapper-edges.test.ts` | ✅ | ⬜ pending |
| 102-02-02 | 02 | 2 | WDET-03 | T-102-03 | Representative env-fallback command keeps cwd detection ahead of `GS_WORKSPACE_NAME` | subprocess | `bun test tests/commands/notes.test.ts` | ✅ | ⬜ pending |
| 102-02-03 | 02 | 2 | WDET-02 | T-102-02 | Representative repo-aware command preserves repo-specific behavior from repo cwd while accepting workspace-root cwd for workspace identity | subprocess | `bun test tests/commands/files.test.ts tests/commands/command.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/detect-workspace-cwd.test.ts` - add workspace-root exact path, workspace-root subdirectory, overlapping workspace-root prefix, dir repo, trunk path, and missing worktree assertions.
- [ ] `tests/commands/workspace-wrapper-edges.test.ts` - add a workspace-root cwd subprocess assertion for a workspace-only optional-workspace command.
- [ ] `tests/commands/notes.test.ts` - add a workspace-root cwd assertion proving cwd detection wins before `GS_WORKSPACE_NAME`.
- [ ] `tests/commands/files.test.ts` or `tests/commands/command.test.ts` - add a representative repo-aware command assertion that separates workspace identity from repo identity.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s for focused checks
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
