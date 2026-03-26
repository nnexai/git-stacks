---
phase: 39
slug: tui-upstream-staleness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test tests/lib/` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | STALE-01, STALE-02, STALE-04, STALE-05 | manual | Dashboard visual inspection | N/A | pending |
| 39-01-02 | 01 | 1 | STALE-01 | manual | Dashboard repo badge rendering | N/A | pending |
| 39-01-03 | 01 | 1 | STALE-03 | manual | Press `r` in dashboard | N/A | pending |

*Status: pending*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or stubs needed.

The staleness feature is a TUI-only feature (SolidJS dashboard). TUI components cannot be unit-tested with bun:test due to OpenTUI rendering requirements. Validation is manual (visual inspection in dashboard).

Pure utility functions (TTL check, badge resolution) can be unit-tested if extracted to a separate module, but the core behavior is TUI rendering + async git operations.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "N behind" badge appears per repo | STALE-01 | TUI rendering requires interactive terminal | 1. Run `git-stacks manage` 2. Navigate to workspace with repos that have upstream commits 3. Verify yellow "N behind" badge appears |
| Fetch triggers on workspace focus | STALE-02 | Requires cursor movement in TUI | 1. Open dashboard 2. Move cursor between workspaces 3. Verify fetch triggers (dim `...` appears briefly) |
| TTL cache prevents re-fetch | STALE-02 | Timing-dependent behavior | 1. Focus workspace (triggers fetch) 2. Move away and back within 5 min 3. Verify no re-fetch (no `...` loading) |
| `r` bypasses TTL | STALE-03 | Interactive keybinding | 1. Focus workspace (wait for fetch) 2. Press `r` immediately 3. Verify badges refresh (dim `...` appears) |
| No-tracking repos show no badge | STALE-04 | Requires repo without upstream | 1. Create workspace with new branch (no upstream) 2. Verify no badge or dash shown |
| Network failure shows `?` | STALE-05 | Requires network failure simulation | 1. Disconnect network or point remote to invalid URL 2. Focus workspace 3. Verify red `?` badge |

---

## Validation Sign-Off

- [ ] All tasks have manual verification steps documented
- [ ] Sampling continuity: manual verification after each plan
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s (for pure unit tests)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
