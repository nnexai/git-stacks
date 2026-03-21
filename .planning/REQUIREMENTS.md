# Requirements: git-stacks v0.4.0

**Defined:** 2026-03-21
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — without manual steps.

## v1 Requirements

### Testing (T-)

- [x] **T-01**: Developer can run component-level tests for TUI dashboard components in CI without a real terminal, using `testRender` from `@opentui/solid`
- [x] **T-02**: Tests can simulate keyboard input (`typeText`, `pressKey`, `pressEnter`, `pressEscape`, `pressArrow`) and assert on rendered output via `captureCharFrame()`
- [ ] **T-03**: `InlineInput` component has tests covering: typing, cursor movement (left/right), backspace, escape cancel, enter confirm *(partial — typing/backspace/escape/enter tested in Phase 10; cursor movement deferred to Phase 11 P-01)*
- [x] **T-04**: `ActionMenu` component has tests covering: arrow key navigation, option selection on enter, dismiss on escape
- [ ] **T-05**: App-level integration tests cover: tab switching, action menu dispatch, wizard entry/exit, sync progress flow
- [x] **T-06**: Config directory location can be overridden via environment variable (`GIT_STACKS_CONFIG_DIR`) so tests run in an isolated directory instead of `~/.config/git-stacks/`

### Prerequisites (P-)

- [x] **P-01**: `InlineInput` supports left/right cursor movement and character insertion at cursor position (prerequisite for all wizard text fields)
- [x] **P-02**: `lifecycle.ts` provides `runHooksCaptured()` variant that streams hook stdout/stderr via callback instead of `stdio: "inherit"` (prerequisite for all TUI create operations that trigger hooks)

### Workspace Actions (WS-)

- [ ] **WS-01**: User can trigger workspace sync from the Workspaces tab action menu without leaving the TUI
- [ ] **WS-02**: Sync shows per-repo progress in ProgressView while running (repo name + status line per repo)
- [ ] **WS-03**: Sync completes with a result summary (N synced, N skipped/failed)
- [ ] **WS-04**: Sync on an unreachable remote fails with a clear error message within 30 seconds (no indefinite hang)

### Create Flows (C-)

- [ ] **C-01**: User can create a new workspace from the Workspaces tab (`n` key) without exiting to CLI — wizard: select template → enter name → enter branch
- [ ] **C-02**: Wizard supports back-navigation (escape goes to previous step) and full cancel (escape from first step returns to list)
- [ ] **C-03**: After workspace creation, the list refreshes and cursor positions on the newly created workspace
- [ ] **C-04**: User can create a new template from the Templates tab (`n` key) without exiting to CLI

### Repo Management (R-)

- [ ] **R-01**: User can open an action menu from the Repos tab (Enter on a repo row opens actions)
- [ ] **R-02**: User can add a repo to the registry from within the TUI (path entry via InlineInput with path validation indicator)
- [ ] **R-03**: User can trigger a repo directory scan from within the TUI (uses suspend+resume to the existing CLI scan wizard — the one sanctioned escape hatch)
- [ ] **R-04**: User can remove a repo from the registry from within the TUI (ConfirmDialog showing which workspaces reference it)

### Screen Improvements (UI-)

- [ ] **UI-01**: Help bar content fits within 80 terminal columns without truncation
- [ ] **UI-02**: Workspace list rows show relative age (`3d`, `2h`, `5m`) instead of ISO date string
- [ ] **UI-03**: Column widths respond to terminal width (no hard-coded character widths)

## v2 Requirements

### Testing

- **T-07**: Snapshot baseline for full App rendering at 80×24 (full-frame snapshot tests — deferred due to maintenance cost vs. targeted assertions)

### Create Flows

- **C-05**: User can create a workspace from an ad-hoc list of repos (no template required) via a `MultiSelectList` picker in the TUI — deferred; ad-hoc mode remains CLI-only for v0.4.0

### Workspace Actions

- **WS-05**: User can batch-sync all workspaces from the TUI — deferred; CLI `--all` flag is sufficient

## Out of Scope

| Feature | Reason |
|---------|--------|
| PTY-based e2e subprocess tests | `testRender` headless API is sufficient; PTY tests are brittle and slow |
| `@clack/prompts` wizards called from TUI | Stdio ownership conflict with OpenTUI — all create flows must be native TUI components |
| Adjustable split pane ratio | No user demand; complexity not justified |
| Strategy selection UI for workspace sync | Always default to rebase in TUI; CLI exposes `--strategy` for advanced use |
| Batch workspace generation (`new --count N`) | Agent orchestration use case; deferred to v0.5.0 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| T-01 | Phase 10 | Complete |
| T-02 | Phase 10 | Complete |
| T-03 | Phase 10+11 | Partial (cursor movement → Phase 11) |
| T-04 | Phase 10 | Complete |
| T-06 | Phase 10 | Complete (10-01) |
| P-01 | Phase 11 | Complete |
| P-02 | Phase 11 | Complete |
| WS-01 | Phase 12 | Pending |
| WS-02 | Phase 12 | Pending |
| WS-03 | Phase 12 | Pending |
| WS-04 | Phase 12 | Pending |
| C-01 | Phase 13 | Pending |
| C-02 | Phase 13 | Pending |
| C-03 | Phase 13 | Pending |
| C-04 | Phase 14 | Pending |
| R-01 | Phase 14 | Pending |
| R-02 | Phase 14 | Pending |
| R-03 | Phase 14 | Pending |
| R-04 | Phase 14 | Pending |
| T-05 | Phase 15 | Pending |
| UI-01 | Phase 15 | Pending |
| UI-02 | Phase 15 | Pending |
| UI-03 | Phase 15 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 — traceability filled by roadmapper*
