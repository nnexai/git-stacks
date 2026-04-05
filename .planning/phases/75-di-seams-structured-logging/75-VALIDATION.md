---
phase: 75
slug: di-seams-structured-logging
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 75 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` on Bun 1.3.10 |
| **Config file** | `package.json` scripts plus `scripts/test-runner.ts` |
| **Quick run command** | `bun test tests/lib/observability.test.ts` |
| **Full suite command** | `bun run test && bun run typecheck` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/observability.test.ts` plus the single relevant module test file.
- **After every plan wave:** Run `bun run test && bun run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 75-01-01 | 01 | 0 | OBSV-01 | T-75-01 | `workspace-lifecycle.ts` exposes a mutable `_exec.spawn` seam and tests can replace it without real subprocesses. | unit | `bun test tests/lib/workspace-lifecycle.test.ts` | ❌ W0 | ⬜ pending |
| 75-01-02 | 01 | 1 | OBSV-03, OBSV-04, OBSV-05 | T-75-02 / T-75-03 | Observability stays stderr-only, renders single-line structured fields, and honors selector/env precedence deterministically. | unit | `bun test tests/lib/observability.test.ts` | ✅ | ⬜ pending |
| 75-02-01 | 02 | 1 | OBSV-02 | T-75-01 | `workspace-git.ts` exposes the matching `_exec` seam contract without broadening scope into a `git.ts` rewrite. | unit | `bun test tests/lib/workspace-git.test.ts` | ✅ | ⬜ pending |
| 75-02-02 | 02 | 1 | OBSV-03, OBSV-04, OBSV-05 | T-75-02 / T-75-03 | CLI debug smoke coverage proves `GS_DEBUG=1`, `GS_DEBUG=true`, selector filtering, and legacy alias compatibility without corrupting stdout. | command | `bun test tests/commands/debug-output.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/workspace-lifecycle.test.ts` — add seam-focused coverage for `_exec.spawn` replacement and hook call shapes
- [ ] `tests/lib/observability.test.ts` — extend coverage for selector parsing, legacy alias compatibility, and structured field rendering
- [ ] `tests/commands/debug-output.test.ts` or `tests/commands/open-debug-output.test.ts` — add `GS_DEBUG=1`, `GS_DEBUG=true`, token filtering, and alias coverage

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
