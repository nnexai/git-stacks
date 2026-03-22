# Requirements: git-stacks

**Defined:** 2026-03-22
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.7.0 Requirements

### Workspace Close

- [ ] **CLOSE-01**: User can run `git-stacks close [name]` to teardown integrations (tmux session, niri workspace) without deleting workspace directory or worktrees
- [ ] **CLOSE-02**: Close runs teardown hooks and integration cleanup but preserves all filesystem state
- [ ] **CLOSE-03**: Close is available as a dashboard action menu entry
- [ ] **CLOSE-04**: Workspace can be re-opened after close with `git-stacks open`

### UI Fix

- [ ] **UI-01**: Niri columns configuration displays full column details (app, command, source windows, width) as readable text in TUI details pane instead of `[object Object]`

### Test Quality

- [ ] **TEST-01**: All tests that touch config redirect `HOME` to a temp directory — no test writes to real user config
- [ ] **TEST-02**: Shared test setup helper exists for config isolation pattern if repeated across files

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

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLOSE-01 | Phase 21 | Pending |
| CLOSE-02 | Phase 21 | Pending |
| CLOSE-03 | Phase 21 | Pending |
| CLOSE-04 | Phase 21 | Pending |
| UI-01 | Phase 22 | Pending |
| TEST-01 | Phase 23 | Pending |
| TEST-02 | Phase 23 | Pending |

**Coverage:**
- v0.7.0 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after roadmap creation (Phases 21-23)*
