---
gsd_state_version: 1.0
milestone: v0.4.0
milestone_name: TUI Hardening & Polish
status: unknown
stopped_at: Completed 15.2-02-PLAN.md
last_updated: "2026-03-21T19:02:06.240Z"
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 21
  completed_plans: 21
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-20)

**Core value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.
**Current focus:** Phase 15.2 — integration-overrides-per-template-and-workspace

## Current Position

Phase: 15.2
Plan: Not started

## Accumulated Context

### Decisions

All prior milestone decisions recorded in PROJECT.md Key Decisions table.

**v0.4.0-specific decisions (from research and execution):**

- `testRender` from `@opentui/solid@0.1.87` confirmed available — component tests import from `@opentui/solid` by design
- All create wizard flows must be native TUI components (`WizardView.tsx`) — `@clack/prompts` has unresolvable stdio ownership conflict with OpenTUI
- `renderer.suspend()` is reserved for: (a) $EDITOR launch, (b) `repo scan` as the one sanctioned escape hatch
- T-06 (`GIT_STACKS_CONFIG_DIR` env override) belongs in Phase 10 — tests cannot be isolated without it
- `fetchOrigin()` must get a 30-second timeout before sync ships (Phase 12)
- `useWorkspaces.reload()` must return `Promise<void>` before wizard cursor placement works (Phase 13)
- WizardView step/data state lives inside `WizardView.tsx` as local signals — NOT in UIView union variants
- Coarse granularity requested; 6 phases retained because research dependency chain requires it
- Subprocess spawning (`spawnSync bun --eval`) required for paths env override tests — Bun shares module cache across test files in same run, so top-level dynamic import returns cached values when config.test.ts already imported paths.ts statically
- ActionMenu `fullActions` array computed inside component (not module scope) so conditional Run entry depends on reactive `props.onRun` at render time
- bunfig.toml `[test]` preload section (not top-level) required for `bun test` to apply the Babel solid transform to tsx imports — top-level preload only applies to `bun run`
- `pressEscape()` requires a 50ms setTimeout before asserting callback — the OpenTUI escape-sequence parser waits for more bytes after `\x1B` before emitting the event
- [Phase 11]: InlineInput test 1 uses onConfirm assertion instead of captureCharFrame — built-in input cursor obscures chars in frame
- [Phase 11]: onSubmit typed as (v as string) cast — TypeScript intersection of InputProps.onSubmit(string) and TextareaOptions.onSubmit(SubmitEvent)
- [Phase 12]: SyncRow type exported from SyncProgressView.tsx as canonical location — Plan 03 (App.tsx) imports from here
- [Phase 12]: Fragment wrapper in For: use <>...</> to wrap row + conflict sub-rows when a For entry has variable sub-rows
- [Phase 12-workspace-sync]: Use git -c fetch.timeout=30 (socket-level) not AbortSignal — git handles subprocess cleanup, aligned with WS-04
- [Phase 12-workspace-sync]: onSyncProgress added as 4th optional parameter to syncWorkspace — preserves all existing callers without change
- [Phase 12-workspace-sync]: buildSummary: non-conflict skips counted as failures for accurate color coding
- [Phase 12-workspace-sync]: Sync routes through confirm dialog for D-07/D-08 compliance; onConfirm branches on action === 'sync'
- [Phase 13-wizard-create-workspace]: WizardView step/data state lives as local signals inside WizardView.tsx, not in UIView union variants (per D-22)
- [Phase 13-wizard-create-workspace]: InlineInput.focused optional prop (default true) required for WizardView deferred focus pattern; all existing callers unaffected
- [Phase 13-wizard-create-workspace]: Test deferred focus: await new Promise(r => setTimeout(r, 0)) required between step transitions — renderOnce() does not process macrotask queues
- [Phase 13-wizard-create-workspace]: executeCreateWorkspace handles both template-based and ad-hoc flows; ad-hoc path stubbed for Plan 03 wiring
- [Phase 13]: buildAdhocWizardSteps has no branch prefill (D-08: ad-hoc starts blank)
- [Phase 13]: All ad-hoc repos default to worktree mode (D-09)
- [Phase 14-template-and-repo-management]: prefix() function placed inside For callback (not component scope) — closes over reactive isSelected() and focused() memos without extra signal passing
- [Phase 14-template-and-repo-management]: TemplateList selected prop optional so existing App.tsx callers compile without change until Plan 03 wires the signal
- [Phase 14]: RepoActionMenu uses reactive arrow functions for label text; RemoveBlockedView accepts lightweight { name: string }[] refs
- [Phase 14]: repoRemoveTarget signal is the dedicated path for repo remove confirmation; no confirmContext extension
- [Phase 14]: n key removed from Repos tab; workspace create moved into RepoActionMenu [w] action per D-03
- [Phase 14]: executeCreateTemplate: reloads templates then uses findIndex to place cursor on new entry via Promise.then()
- [Phase 15-01]: msgShortcut (m Messages) gated on tab() === workspaces so other tabs stay tighter
- [Phase 15-01]: messagePreview fixedWidth made reactive: nameWidth() + branchWidth() + 23 instead of hardcoded 80
- [Phase 15-01]: nameWidth inside For callback (not component scope) so it captures dims() reactively without extra signals
- [Phase 15-01]: leftTruncate uses unicode ellipsis character (\u2026) consistent with name truncation in all three list components
- [Phase 15]: integ-sync-progress mocks ../../../src/lib/config wholesale to provide inline workspace fixture — GIT_STACKS_CONFIG_DIR alone is insufficient when paths.ts is already cached from an earlier test file in same Bun run (Pitfall 1 from RESEARCH.md)
- [Phase 15]: workspace-ops mock must include all exports (getWorkspaceStatus, editWorkspaceYaml, mergeEnv, writeEnvFiles, etc.) or Bun throws 'Export not found' on first use in integration tests
- [Phase 15]: Config module must be mocked (not just env var) for cross-file integration test isolation
- [Phase 15]: renderer.destroy() in afterEach prevents keyboard event leakage between testRender instances
- [Phase 15.1-01]: CenteredDialog widths typed as Record<Size, `${number}%`> for TypeScript template literal compatibility with OpenTUI width prop
- [Phase 15.1-01]: Action menu Show blocks promoted to App root level; split pane Show condition excludes action-menu/repo-action-menu states so dialogs get full terminal height
- [Phase 15.1-02]: confirmTitle() memo computes contextual ConfirmDialog title from repoRemoveTarget, confirmContext, or entry name
- [Phase 15.1-02]: Split-pane Show condition extended to exclude confirm/inline-input/repo-remove-blocked following the action-menu exclusion pattern from Plan 01
- [Phase 15.1-03]: WizardView/SyncProgressView/CreateProgressView accept optional title props; App.tsx passes contextual titles to promoted components
- [Phase 15.1-03]: HelpOverlay and MessageOverlay self-managed borders fully removed; CenteredDialog exclusively owns border and title (Pitfall 6 pattern)
- [Phase 15.1-03]: Detail pane now list-only; all wizard/progress/overlay views promoted to App root level ordered by z-priority
- [Phase 15.2-01]: promptIntegrationOverrides uses confirm-guard pattern: undefined returned when user declines, no integrations key stored in template YAML (D-04)
- [Phase 15.2-01]: Helper accepts initialEnabledIds and currentConfigs to support global-config pre-population for new and template-override pre-population for edit
- [Phase 15.2]: readGlobalConfig() called once at render time — config is stable during TUI session (no reactive signal needed)
- [Phase 15.2]: readTemplate() wrapped in try/catch in WorkspaceDetail — resilient to template file deletion while workspace still references it
- [Phase 15.2-02]: Both test files mock @clack/prompts comprehensively (spinner, multiselect, confirm) to avoid Bun module cache issue when run together
- [Phase 15.2-02]: runWorkspaceEdit co-located in workspace-wizard.ts (not a separate file) since it shares all imports

### Pending Todos

None — Phase 11 complete.

### Roadmap Evolution

- Phase 15.1 inserted after Phase 15: Action menu cursor unification and centered dialog (URGENT) — merged from two notes: cursor unification + centered dialog overlay
- Phase 15.2 inserted after Phase 15: Integration overrides per template and workspace (URGENT)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-21T18:32:51.697Z
Stopped at: Completed 15.2-02-PLAN.md
Resume file: None
Next action: Phase 11 complete. Execute next phase.
