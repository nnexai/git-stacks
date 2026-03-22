# Requirements: git-stacks

**Defined:** 2026-03-22
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.7.0 Requirements

### Workspace Close

- [x] **CLOSE-01**: User can run `git-stacks close [name]` to teardown integrations (tmux session, niri workspace) without deleting workspace directory or worktrees
- [x] **CLOSE-02**: Close runs teardown hooks and integration cleanup but preserves all filesystem state
- [x] **CLOSE-03**: Close is available as a dashboard action menu entry
- [x] **CLOSE-04**: Workspace can be re-opened after close with `git-stacks open`

### UI Fix

- [x] **UI-01**: Niri columns configuration displays full column details (app, command, source windows, width) as readable text in TUI details pane instead of `[object Object]`

### Test Quality

- [x] **TEST-01**: All tests that touch config redirect `HOME` to a temp directory — no test writes to real user config
- [x] **TEST-02**: Shared test setup helper exists for config isolation pattern if repeated across files

### Mock Architecture

- [x] **MOCK-01**: `tmux.ts`, `cmux.ts`, and `lifecycle.ts` export mutable `_exec` objects following the proven `niri.ts` pattern — all shell calls funnel through `_exec` methods
- [x] **MOCK-02**: Direct unit tests for tmux.ts, cmux.ts, and lifecycle.ts use `_exec` injection instead of `mock.module()` for shell command interception
- [x] **MOCK-03**: `tui/utils.ts` exports a `prompts` object re-exporting all used `@clack/prompts` functions (text, select, confirm, multiselect, spinner, intro, outro, log, isCancel)
- [x] **MOCK-04**: Production files that import `@clack/prompts` directly switch to importing from `@/tui/utils`

### Lifecycle Cascade

- [ ] **LC-01**: New hook fields (`post_close`, `pre_clean`, `post_clean`, `pre_merge`, `post_remove`) parse in `WorkspaceHooksSchema` and `TemplateSchema` without error
- [ ] **LC-02**: Per-repo `pre_clean` field parses in `WorkspaceRepoHooksSchema` without error
- [ ] **LC-03**: Existing YAML files without new hook fields continue to parse (backward compatible)
- [ ] **LC-04**: `cleanWorkspace` calls `_executeClose` before worktree removal (close-before-clean cascade per D-02)
- [ ] **LC-05**: `cleanWorkspace` fires `pre_clean` hooks before worktree removal and `post_clean` after
- [ ] **LC-06**: Per-repo `pre_clean` hooks fire immediately before each individual worktree removal (interleaved, not batched, per D-08)
- [ ] **LC-07**: Hook failure mid-cascade aborts the entire operation (per D-03)
- [ ] **LC-08**: `closeWorkspace` fires `post_close` hooks after integration cleanup and injects `WS_TRIGGERED_BY` env var (per D-04)
- [ ] **LC-09**: `removeWorkspace` cascades through `_executeClean` then fires `pre_remove` before YAML delete and `post_remove` after (per D-06)
- [ ] **LC-10**: `mergeWorkspace` follows full D-10 lifecycle order: `pre_close` -> integration cleanup -> `post_close` -> `pre_clean` -> per-repo `pre_clean` + worktree removal -> `post_clean` -> `pre_merge` -> git merge + branch delete -> `pre_remove` -> YAML delete -> `post_remove` -> `post_merge`
- [ ] **LC-11**: `post_merge` fires after `post_remove` (per D-11)
- [ ] **LC-12**: `runPreRemoveHooks` function removed — no longer used by any lifecycle function
- [ ] **LC-13**: TUI dashboard passes `captured: true` to `cleanWorkspace`, `removeWorkspace`, and `mergeWorkspace` to prevent OpenTUI screen corruption

## Future Requirements

- **Programmatic API** — export `workspace-ops.ts` as typed package; `Result<T>` return type
- **Power user features** — `clone --pr <N>`, WezTerm/Zellij integrations, per-repo ahead/behind in status
- **Agent-aware** — batch workspace generation (`new --count N`), agent status file protocol
- **TUI completeness** — add/scan repos from TUI, cursor movement tests

## Out of Scope

| Feature | Reason |
|---------|--------|
| Workspace suspend/resume with state serialization | Close is lightweight teardown only — no state snapshot/restore |
| Auto-close on branch merge | Adds complexity; user can run close manually after merge |
| Close all workspaces command | Batch operations deferred; close one at a time for now |
| Full mock.module() elimination sweep | Phase 24 covers direct unit tests only; caller tests stay as-is |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLOSE-01 | Phase 21 | Complete |
| CLOSE-02 | Phase 21 | Complete |
| CLOSE-03 | Phase 21 | Complete |
| CLOSE-04 | Phase 21 | Complete |
| UI-01 | Phase 22 | Complete |
| TEST-01 | Phase 23 | Complete |
| TEST-02 | Phase 23 | Complete |
| MOCK-01 | Phase 24 | Complete |
| MOCK-02 | Phase 24 | Complete |
| MOCK-03 | Phase 24 | Complete |
| MOCK-04 | Phase 24 | Complete |
| LC-01 | Phase 25 | Planned |
| LC-02 | Phase 25 | Planned |
| LC-03 | Phase 25 | Planned |
| LC-04 | Phase 25 | Planned |
| LC-05 | Phase 25 | Planned |
| LC-06 | Phase 25 | Planned |
| LC-07 | Phase 25 | Planned |
| LC-08 | Phase 25 | Planned |
| LC-09 | Phase 25 | Planned |
| LC-10 | Phase 25 | Planned |
| LC-11 | Phase 25 | Planned |
| LC-12 | Phase 25 | Planned |
| LC-13 | Phase 25 | Planned |

**Coverage:**
- v0.7.0 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after Phase 25 requirement definition*
