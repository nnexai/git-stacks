# Requirements: git-stacks

**Defined:** 2026-05-25
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.19.0 RC Follow-up Requirements

These requirements extend the unreleased v0.19.0 Operator Control Center after `0.19.0-rc.1` validation found manager/TUI and CLI ergonomics issues.

### Manager TUI Output Containment

- [ ] **TOUT-01**: Commands launched from `git-stacks manage` that write stdout or stderr do not corrupt, scroll, or displace the OpenTUI screen.
- [ ] **TOUT-02**: TUI-launched command output is captured into a bounded viewer or modal that preserves command ordering, exit status, and enough recent output for diagnosis.
- [ ] **TOUT-03**: When the output viewer closes, the manager UI restores cleanly, including focus, selected tab/list item, footer hints, and alternate-screen state.
- [ ] **TOUT-04**: Long-running, failing, noisy, and no-output commands all produce predictable TUI states without leaking raw process output behind the dashboard.

### Completion Completeness

- [ ] **COMP-01**: Shell completions cover the current command tree, including v0.18/v0.19 command families and nested subcommands.
- [ ] **COMP-02**: Dynamic completions for workspace, template, repo, command, integration, issue/forge surfaces, and option enums remain position-aware and do not repeat already-satisfied positional args.
- [ ] **COMP-03**: Completion generation has focused regression coverage for bash, zsh, and fish so future command additions do not silently ship incomplete completion entries.

### Workspace Root Auto-detection

- [ ] **WDET-01**: Workspace auto-detection works when the current directory is the workspace root directory, not only when inside an individual repo worktree.
- [ ] **WDET-02**: Workspace auto-detection keeps existing deepest-repo matching behavior for nested repo paths, trunk paths, dir repos, and prefix-collision cases.
- [ ] **WDET-03**: Commands that accept optional `[workspace]` arguments share one documented resolution order across explicit arg, cwd detection, and `GS_WORKSPACE_NAME`.

### Final Release Readiness

- [ ] **REL-01**: v0.19.0 final release notes and package metadata include the RC follow-up fixes and do not describe unresolved RC defects as shipped behavior.
- [ ] **REL-02**: Final verification includes focused manager/TUI output smoke coverage, completion generation checks, workspace-root detection tests, and the existing release gate.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Dashboard rollback progress visibility | Still explicitly deferred unless re-promoted separately. |
| New stale-workspace advisory workflow | Related to operator UX but separate from the RC defects reported on 2026-05-25. |
| Broad TUI redesign beyond command-output containment | The current issue is screen corruption during command execution, not another layout reset. |
| New command schema or lifecycle hooks | Manual command behavior already shipped in v0.19.0-rc.1; this follow-up fixes TUI execution/display. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TOUT-01 | Phase 100 | Planned |
| TOUT-02 | Phase 100 | Planned |
| TOUT-03 | Phase 100 | Planned |
| TOUT-04 | Phase 100 | Planned |
| COMP-01 | Phase 101 | Planned |
| COMP-02 | Phase 101 | Planned |
| COMP-03 | Phase 101 | Planned |
| WDET-01 | Phase 102 | Planned |
| WDET-02 | Phase 102 | Planned |
| WDET-03 | Phase 102 | Planned |
| REL-01 | Phase 103 | Planned |
| REL-02 | Phase 103 | Planned |
