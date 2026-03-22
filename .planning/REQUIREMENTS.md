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
| MOCK-01 | Phase 24 | Planned |
| MOCK-02 | Phase 24 | Planned |
| MOCK-03 | Phase 24 | Planned |
| MOCK-04 | Phase 24 | Planned |

**Coverage:**
- v0.7.0 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after Phase 24 requirement definition*
