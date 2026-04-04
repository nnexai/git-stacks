---
gsd_state_version: 1.0
milestone: v0.15.0
milestone_name: Dir Mode & Polish
status: active
stopped_at: ""
last_updated: "2026-04-04T00:00:00.000Z"
last_activity: 2026-04-04
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.
**Current focus:** v0.15.0 Dir Mode & Polish

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-04 — Milestone v0.15.0 started

```
Progress: [░░░░░░░░░░] 0%
```

## Accumulated Context

### Decisions

- Phase numbering continues from 57 (v0.13.0 ended at Phase 57); v0.14.0 starts at Phase 58
- Granularity is coarse: 6 phases for 33 requirements (5 feature phases + 1 release prep)
- Phase 58 (ahead/behind) must use `git rev-parse --git-common-dir` for FETCH_HEAD path in worktrees — `.git` is a file not a dir
- Phase 59 (push) depends on Phase 58 — ahead count feeds dry-run messaging
- Phase 59 (push) first-push dry-run falls back to `0` commits when `origin/<branch>` does not exist yet; actual push behavior is still verified
- Phase 60 (labels) dashboard grouping uses yellow section headers without bold because current OpenTUI `TextProps` do not accept a `bold` prop
- Phase 61 (secrets) resolved values are runtime-only but intentionally flow into env-file writes and lifecycle hook env after successful resolution
- Phase 61 (secrets) constraint: `resolveSecrets` signature is `(rawEnv: Record<string, string>, resolvers) => Record<string, string>` — never accepts workspace object; prevents plaintext write to YAML
- Phase 61 (secrets) `cmd:` resolver requires explicit opt-in in config.yml; not enabled by default
- Phase 62 (stash) double-stash guard: if `git-stacks auto-stash` entry already in `git stash list`, refuse to stash again
- Phase 62 (stash) restoration runs even when sync exits early after stashing, so user changes are not stranded in the stash stack
- Phase 62 (stash) stash-pop failures surface as `stashPopFailures` in JSON and as copy-paste recovery commands in human output
- Phase 63 (release prep) v0.14.0 release notes document only shipped behavior — `--skip-secrets` is documented on `open`, not on unsupported flows
- Post-audit fix: `git-stacks env` now resolves secret refs through the same runtime pipeline as `open`, so previews match hook/env-file behavior
- Post-audit fix: README now documents ahead/behind list/status/dashboard behavior and the env preview secret-resolution semantics
- LBL-01 label filter must use shared `matchesLabels(workspace, terms[])` utility before implementing CLI or TUI surfaces
- [Phase 58-ahead-behind-tracking]: Use git rev-parse --git-common-dir (not hardcoded .git) so isFetchStale works in worktrees where .git is a file
- [Phase 58-ahead-behind-tracking]: isFetchStale defaults to 15-minute threshold, returns true (stale) on any error — safe default
- [58-02]: ahead aggregation is SUM across repos; behind is MAX; staleness is OR (any stale FETCH_HEAD taints workspace)
- [quick-260404-atz]: trunk repos now report dirty/ahead/behind using main_path and origin/<currentBranch> as tracking ref (overrides previous 58-02 decision)
- [quick-260404-atz]: trunk repos show unified ↑/↓ display same as worktree repos (no more "—" suppression)
- [Phase 58-ahead-behind-tracking]: fetch deduplication keyed on main_path prevents double-fetching when multiple worktrees share the same underlying clone

### Pending Todos

(none)

### Blockers/Concerns

(none)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260403-x04 | Make keychain resolver attribute names configurable instead of hardcoded service/account | 2026-04-03 | 3809b52 | [260403-x04-make-keychain-resolver-attribute-names-c](./quick/260403-x04-make-keychain-resolver-attribute-names-c/) |
| 260404-atz | Fix dirty/ahead-behind checks to include trunk repos in list and status commands | 2026-04-04 | 50e3424 | [260404-atz-fix-dirty-ahead-behind-checks-to-include](./quick/260404-atz-fix-dirty-ahead-behind-checks-to-include/) |

## Session Continuity

Last session: 2026-04-04T00:00:00.000Z
Stopped at: Completed quick/260404-atz fix dirty/ahead-behind trunk repo inclusion
Next action: Define requirements and create roadmap for v0.15.0
