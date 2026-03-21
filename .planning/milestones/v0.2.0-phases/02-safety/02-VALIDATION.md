---
phase: 2
slug: safety
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none — bun test discovers `tests/**/*.test.ts` automatically |
| **Quick run command** | `bun test tests/lib/workspace-ops.test.ts tests/lib/files.test.ts` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/workspace-ops.test.ts tests/lib/files.test.ts`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01 | 01 | 1 | SAFE-01 | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ extend | ⬜ pending |
| 2-02 | 01 | 1 | SAFE-01 | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ extend | ⬜ pending |
| 2-03 | 01 | 1 | SAFE-01 | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ extend | ⬜ pending |
| 2-04 | 01 | 1 | SAFE-01 | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ extend | ⬜ pending |
| 2-05 | 01 | 1 | FILES-16 | unit | `bun test tests/lib/files.test.ts` | ✅ extend | ⬜ pending |
| 2-06 | 01 | 1 | FILES-17 | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ extend | ⬜ pending |
| 2-07 | 02 | 2 | SAFE-03 | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ extend | ⬜ pending |
| 2-08 | 02 | 2 | SAFE-02 | manual | N/A | N/A | ⬜ pending |
| 2-09 | 02 | 2 | SAFE-02 | manual | N/A | N/A | ⬜ pending |
| 2-10 | 02 | 2 | SAFE-03 | manual | N/A | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `workspace-ops.test.ts` and `files.test.ts` both exist and follow the established `makeTmpDir`/`makeGitRepo` pattern. New tests are additions to existing files, not new files.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `remove` without `--force` shows confirmation prompt | SAFE-02 | `@clack/prompts` is interactive; TTY required | Run `bun run dev remove <ws>` without `--force`; verify prompt appears |
| `clean` without `--force` shows confirmation prompt | SAFE-02 | `@clack/prompts` is interactive; TTY required | Run `bun run dev clean <ws>` without `--force`; verify prompt appears |
| `rename --force` skips confirmation prompt | SAFE-03 | `@clack/prompts` is interactive; TTY required | Run `bun run dev rename <old> <new> --force`; verify no prompt appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
