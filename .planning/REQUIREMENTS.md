# Requirements: git-stacks

**Defined:** 2026-05-17
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.19.0 Requirements

Requirements for v0.19.0 Operator Control Center. Each maps to roadmap phases.

### Manual Workspace Commands

- [ ] **WCMD-01**: User can define named manual commands in templates and workspaces for repeatable operator actions that are not tied to lifecycle hooks.
- [ ] **WCMD-02**: User can list and inspect resolved manual commands for a workspace before running them.
- [ ] **WCMD-03**: User can run a named manual command with the same workspace environment, cwd/repo targeting, ports, secrets, and safe output handling used by existing hook/run machinery.
- [ ] **WCMD-04**: Template-defined manual commands are snapshotted or resolved into workspaces consistently with existing template inheritance behavior.

### Workspace Notes

- [ ] **NOTE-01**: User can add, list, show, and clear lightweight workspace notes stored outside managed project repositories.
- [ ] **NOTE-02**: Notes are append-only records at first, preserving creation time, workspace name, text, and optional lightweight tags without becoming project planning artifacts.
- [ ] **NOTE-03**: Workspace detail surfaces can show a latest-note or note-count summary without replacing the full notes command surface.

### TUI Control Center

- [ ] **TUI-01**: User sees a denser `git-stacks manage` workspace list/detail layout that preserves the current tabbed list/detail model and avoids dashboard-style unrelated panels.
- [ ] **TUI-02**: User can group or filter workspaces beyond labels when useful, while list rows continue to expose concrete reasons through existing status tokens.
- [ ] **TUI-03**: Workspace detail sections are ordered by operational value, including attention/messages, repos, file config/status, source/issue links, integrations, notes, and workspace config.
- [ ] **TUI-04**: TUI file status display reuses the v0.18.0 files status model so copy, symlink, and sync mappings show configured paths, drift, missing targets, and unsafe states without duplicating sync logic.
- [ ] **TUI-05**: User can edit repo configuration from the Repos tab action menu with behavior consistent with existing workspace/template edit flows.
- [ ] **TUI-06**: User can open a linked workspace issue from the workspace action menu when issue metadata is configured.
- [ ] **TUI-07**: TUI changes include focused terminal snapshot or component coverage for narrow/medium/wide rows, grouped headers, detail section ordering, file status display, note summary, and contextual footers.

### Dashboard Correctness

- [ ] **DASH-01**: Dashboard workspace creation surfaces all rollback progress events emitted by `createWorkspace()`, including file ops, workspace file ops, and env-file writes.

## Future Requirements

### Workspace Operations

- **STAL-01**: User can run `git-stacks stale` to classify accumulated workspaces as active, idle, ready-to-clean, needs-attention, or orphaned.

### Template Ergonomics

- **TMPL-01**: User can preview or explain resolved template composition with source attribution for included templates.

### Install and Bootstrap

- **INST-01**: User can install git-stacks-specific agent skills through an `install --skills` style command.

### Forge and Browser Opening

- **WEB-01**: User can open forge or integration web URLs directly through a dedicated `--web` command surface.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| `git-stacks stale` advisory classification | Removed from v0.19.0 scope by user request; notes and TUI status can prepare for it without shipping stale cleanup recommendations. |
| Automatic cleanup or destructive stale actions | The milestone improves visibility and operator actions, not automated workspace cleanup. |
| Full template composition preview/explain | Useful but separate template ergonomics work; defer unless it becomes necessary for manual-command implementation. |
| Install skills command | Separate bootstrap/install surface, not part of the operator control center slice. |
| Broad forge polish or new forge `--web` command family | Linked issue opening is in scope; broader forge browser-opening work remains separate. |
| Fake service controls in the TUI | Running services may be displayed as status only unless a real command/action exists. |
| Editing notes as one mutable document | Initial notes are append-only records to keep storage and conflict behavior simple. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| WCMD-01 | Phase 95 | Planned |
| WCMD-02 | Phase 95 | Planned |
| WCMD-03 | Phase 95 | Planned |
| WCMD-04 | Phase 95 | Planned |
| NOTE-01 | Phase 96 | Planned |
| NOTE-02 | Phase 96 | Planned |
| NOTE-03 | Phase 98 | Planned |
| TUI-01 | Phase 98 | Planned |
| TUI-02 | Phase 98 | Planned |
| TUI-03 | Phase 98 | Planned |
| TUI-04 | Phase 97 | Planned |
| TUI-05 | Phase 99 | Planned |
| TUI-06 | Phase 99 | Planned |
| TUI-07 | Phase 98 | Planned |
| DASH-01 | Phase 99 | Planned |
