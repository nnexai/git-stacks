---
phase: 58-ahead-behind-tracking
verified: 2026-04-03T15:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 58: Ahead/Behind Tracking Verification Report

**Phase Goal:** Users can see how far each workspace's branches are from their base branch, with stale-awareness across CLI and TUI surfaces
**Verified:** 2026-04-03T15:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `src/lib/git.ts` exports `getCommitsAhead()` and `isFetchStale()` for worktree-safe ahead/staleness primitives | VERIFIED | Phase 58-01 summary plus git/workspace tests confirm both primitives exist and are exercised |
| 2 | Workspace-level status aggregates ahead as sum, behind as max, and stale as any-stale across worktree repos | VERIFIED | `getWorkspaceListInfo()` in `src/lib/workspace-ops.ts`; `tests/lib/workspace-ops.test.ts` covers the aggregation cases |
| 3 | `git-stacks list` renders workspace-level `↑N` / `↓N` indicators with `?` suffix when stale and exposes `ahead`, `behind`, `aheadBehindStale` in JSON | VERIFIED | `src/commands/workspace.ts` list action builds `abStr`; CLI spot-check printed `ab-check ... ↑2? ...`; JSON path prints raw `infos` |
| 4 | `git-stacks status` renders per-repo ahead/behind for worktree repos, exposes `ahead`/`behind` in JSON, and supports `--fetch` | VERIFIED | `src/commands/workspace.ts` status action includes `--fetch`, text rendering, and JSON mapping; CLI spot-check printed `repo [feature]  ↑2` |
| 5 | `WorkspaceRow` renders aggregated ahead/behind indicators after the branch, hides zero values, and appends `?` when stale | VERIFIED | `src/tui/dashboard/WorkspaceRow.tsx`; targeted render test asserts `↑3?`, `↓2?`, and absence of `↑0`/`↓0` |
| 6 | `WorkspaceDetail` renders per-repo ahead/behind directly from `RepoStatus` and uses the loaded workspace stale flag | VERIFIED | `src/tui/dashboard/WorkspaceDetail.tsx`; targeted render test asserts `api`, `↑3?`, `↓2?` |
| 7 | The old `useStaleness`-based dashboard path is gone from the main source tree | VERIFIED | `src/tui/dashboard/hooks/useStaleness.ts` does not exist; no `useStaleness`/`StaleInfo` matches under `src/tui/dashboard` |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/git.ts` | Ahead/staleness primitives | VERIFIED | Supplies the phase foundation used by workspace aggregation |
| `src/lib/workspace-ops.ts` | Aggregated workspace and per-repo ahead/behind data | VERIFIED | `WorkspaceListInfo` and `RepoStatus` include ahead/behind fields |
| `src/commands/workspace.ts` | CLI list/status surfaces + `--fetch` | VERIFIED | Text and JSON outputs both include ahead/behind data |
| `src/tui/dashboard/WorkspaceRow.tsx` | Aggregated row indicators | VERIFIED | Renders `↑` / `↓` with stale-aware suffixes |
| `src/tui/dashboard/WorkspaceDetail.tsx` | Per-repo indicators in detail pane | VERIFIED | Reads `RepoStatus.ahead` / `RepoStatus.behind` directly |
| `tests/tui/dashboard/WorkspaceDetail.test.tsx` | Automated per-repo TUI coverage | VERIFIED | Added stale-aware assertion case |
| `tests/tui/dashboard/snapshots/WorkspaceRow.snap.test.tsx` | Automated row indicator coverage | VERIFIED | Added stale-aware assertion case |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `getWorkspaceListInfo()` | CLI `list` output | `WorkspaceListInfo.ahead/behind/aheadBehindStale` | VERIFIED | List action prints these fields directly |
| `getWorkspaceStatus()` | CLI `status` output | `RepoStatus.ahead/behind` | VERIFIED | Status action prints and serializes per-repo values |
| `getWorkspaceStatus()` | `useWorkspaces()` | loaded `WorkspaceStatus` | VERIFIED | Hook propagates `aheadBehindStale` into dashboard state |
| `WorkspaceStatus.aheadBehindStale` | `WorkspaceRow` / `WorkspaceDetail` | stale `?` suffix and dim color | VERIFIED | Both components render stale-aware indicators from loaded status |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| CLI `list` | `info.ahead`, `info.behind`, `info.aheadBehindStale` | `getWorkspaceListInfo(ws)` | Yes — spot-check output showed `↑2?` for a real worktree repo | FLOWING |
| CLI `status` | `repo.ahead`, `repo.behind` | `getWorkspaceStatus(ws)` | Yes — spot-check output showed `repo [feature]  ↑2` | FLOWING |
| `WorkspaceRow` | aggregated row indicators | loaded workspace status | Yes — render test captured `↑3?` and `↓2?` | FLOWING |
| `WorkspaceDetail` | per-repo indicators | loaded workspace status | Yes — render test captured `api`, `↑3?`, `↓2?` | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TUI detail render coverage | `bun test tests/tui/dashboard/WorkspaceDetail.test.tsx` | `12 pass, 0 fail` including stale-aware ahead/behind case | PASS |
| TUI row render coverage | `bun test tests/tui/dashboard/snapshots/WorkspaceRow.snap.test.tsx` | `9 pass, 0 fail` including stale-aware ahead/behind case | PASS |
| CLI workspace list output | temp-config `bun run src/index.ts list --sort name` | Output included `ab-check ... ↑2? ... 1 repos` | PASS |
| CLI workspace status output | temp-config `bun run src/index.ts status ab-check` | Output included `repo [feature]  ↑2` | PASS |
| Typecheck | `bun run typecheck` | Exit 0 | PASS |
| Full suite | `bun run test` | Unit tests: `491 pass, 0 fail`; integration tests: `37/37 passed` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| AB-01 | 58-01 | Add ahead-count primitive | SATISFIED | `getCommitsAhead()` implemented and exercised in git tests |
| AB-07 | 58-01 | Stale fetch detection is worktree-safe | SATISFIED | `isFetchStale()` uses git common dir; stale behavior surfaces in list/TUI |
| AB-02 | 58-02 | Workspace aggregation uses ahead=sum, behind=max | SATISFIED | workspace-ops tests cover aggregation cases |
| AB-04 | 58-02, 58-03 | Status paths expose ahead/behind data | SATISFIED | `RepoStatus` fields + CLI status text/JSON output |
| AB-03 | 58-03 | CLI list/status display ahead/behind | SATISFIED | CLI spot-checks plus `workspace.ts` output logic |
| AB-05 | 58-04 | WorkspaceRow shows ahead/behind indicators | SATISFIED | targeted render test for row indicators |
| AB-06 | 58-04 | WorkspaceDetail shows per-repo ahead/behind | SATISFIED | targeted render test for detail indicators |

No orphaned requirements — all seven AB-* requirements mapped to Phase 58 are satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

No TODO/FIXME placeholders, empty implementations, or dead staleness-hook references remain in the phase artifacts.

### Human Verification Required

None. CLI behaviors were spot-checked against a real temporary workspace, and both TUI surfaces now have render tests asserting the visible ahead/behind output.

### Gaps Summary

No gaps. The git primitives, workspace aggregation layer, CLI output, and TUI output are all present, wired, and exercised. Phase 58 now has complete summaries plus passing verification evidence.

---

_Verified: 2026-04-03T15:00:00Z_
_Verifier: Copilot CLI_
