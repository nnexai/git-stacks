---
gsd_state_version: 1.0
milestone: v0.4.0
milestone_name: TUI Hardening & Polish
status: unknown
stopped_at: Completed 14-03-PLAN.md
last_updated: "2026-03-21T10:56:55.592Z"
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 12
  completed_plans: 12
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-20)

**Core value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.
**Current focus:** Phase 14 — template-and-repo-management

## Current Position

Phase: 15
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

### Pending Todos

None — Phase 11 complete.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-21T10:53:06.979Z
Stopped at: Completed 14-03-PLAN.md
Resume file: None
Next action: Phase 11 complete. Execute next phase.
