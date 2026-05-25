# Phase 100: Manager TUI Command Output Containment - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 100 fixes `git-stacks manage` command-output containment. Commands launched while the OpenTUI dashboard remains active must not write raw stdout/stderr behind or through the alternate-screen UI. Their output should be captured, shown inside a bounded dashboard viewer, and the manager should restore the prior UI context cleanly when the command finishes and the viewer closes.

This is not a broad dashboard redesign, a new manual-command feature, or a replacement for interactive editor behavior.

</domain>

<decisions>
## Implementation Decisions

### Captured Command Scope
- **D-01:** Capture all non-editor TUI-launched command output paths in this phase. This includes manual commands, linked issue open, workspace `run`, and other action paths that execute commands while OpenTUI remains active.
- **D-02:** Keep `$EDITOR` style flows on the established renderer suspend/resume path. Do not convert interactive editors into the captured-output viewer unless validation/error messages after resume are leaking raw bytes into the dashboard.

### Output Viewer Behavior
- **D-03:** Reuse the existing progress-modal pattern as the starting point, but upgrade it into a bounded command-output viewer rather than making a minimal append-lines patch.
- **D-04:** The viewer must show the command label, running/exit status, recent output, and clear close/back behavior.

### Long and Noisy Output
- **D-05:** Keep a bounded recent tail of command output. Older output should be dropped from the viewer when the bound is exceeded.
- **D-06:** Preserve stdout/stderr ordering in the displayed tail.
- **D-07:** Visually distinguish stderr lines.
- **D-08:** Show an omitted-lines marker when older output has been dropped.

### Restore and Cancel Semantics
- **D-09:** Running commands cannot be dismissed into the background from the output viewer.
- **D-10:** Finished commands close back to the exact prior dashboard context, preserving selected tab, selected row, footer/action context, and alternate-screen rendering.
- **D-11:** Do not introduce hidden background command state as part of this phase.

### the agent's Discretion
- The exact implementation split between enhancing `ProgressView` and introducing helper state/types is left to the planner, as long as the user-facing behavior above is met.
- The specific line limit for the bounded output tail is left to implementation judgment, but it must be small enough to keep the modal stable and large enough to diagnose failures.

### Folded Todos
- **Improve TUI dashboard experience** (`.planning/todos/pending/2026-05-15-improve-tui-dashboard-experience.md`) — Folded only as parent context for dashboard/control-center polish. Phase 100 remains a narrow defect fix for command-output containment.
- **Add manual workspace commands** (`.planning/todos/pending/2026-05-15-add-manual-workspace-commands.md`) — Folded as background because manual commands are a primary noisy command source exposed through the dashboard.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and Requirements
- `.planning/ROADMAP.md` — Phase 100 goal, dependencies, success criteria, and planned plan split.
- `.planning/REQUIREMENTS.md` — `TOUT-01` through `TOUT-04`, the locked output-containment requirements.
- `.planning/PROJECT.md` — v0.19.0 RC follow-up context and release boundary.

### Folded Todo Context
- `.planning/todos/pending/2026-05-15-improve-tui-dashboard-experience.md` — Parent dashboard-control-center reminder; use only for context, not for broadening this phase.
- `.planning/todos/pending/2026-05-15-add-manual-workspace-commands.md` — Manual command origin/context; Phase 100 fixes dashboard execution/display, not manual command schema.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/tui/dashboard/ProgressView.tsx` — Existing centered modal for running action progress; should be evolved or wrapped for bounded command-output display.
- `src/tui/dashboard/CenteredDialog.tsx` — Existing dashboard modal shell used by progress and dialogs.
- `src/tui/dashboard/issue-actions.ts` — Already captures stdout/stderr from linked issue open into ordered lines for dashboard display.
- `src/lib/lifecycle.ts` / `runHooksCaptured()` patterns — Existing captured hook output path with stream tagging that can inform command-output capture.

### Established Patterns
- `src/tui/dashboard/App.tsx` keeps dashboard view state in the `UIView` union from `src/tui/dashboard/types.ts`; any new output viewer state should fit this pattern.
- Workspace lifecycle actions such as open, close, clean, remove, and merge already use captured progress callbacks instead of raw inherited output.
- Dashboard integration tests use `@opentui/solid` `testRender`, `mockInput`, `renderOnce`, and `captureCharFrame` to prove visible TUI behavior.
- The custom test runner should be used for full tests; do not run `bun test tests/` directly.

### Integration Points
- `src/tui/dashboard/App.tsx` `handleRun()` currently pipes stdout but inherits stderr for `git-stacks run`, which is in scope for containment.
- `src/tui/dashboard/App.tsx` `executeManualCommand()` calls `runManualCommand()`, while `src/lib/workspace-command.ts` currently runs shell sequences through inherited stdio. This is a key corruption path.
- `src/tui/dashboard/App.tsx` `executeIssueOpen()` already routes captured lines into the current progress view, but should still be checked against the unified output viewer behavior.
- Editor launch paths in `launchEditor()`, repo edit, and template edit intentionally use renderer suspend/resume with inherited stdio; keep that class separate unless validation output after resume corrupts the screen.

</code_context>

<specifics>
## Specific Ideas

- The target UX is a bounded modal/viewer with label, status, recent output, stderr distinction, and truncation marker.
- Running commands should block close/back rather than continue silently in the background.
- Closing after completion should restore the same operator context, not drop the user at an unrelated default list state.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- **Add workspace notes** (`.planning/todos/pending/2026-05-15-add-workspace-notes.md`) — Already resolved by Phase 96 and only tangential to output containment.
- **Add workspace stale view** (`.planning/todos/pending/2026-05-15-add-workspace-stale-view.md`) — Future advisory workflow; out of scope for Phase 100.
- **Create workspace from forge source** (`.planning/todos/pending/2026-05-15-create-workspace-from-forge-source.md`) — Already resolved by Phase 92 and out of scope.
- **Improve template composition understanding** (`.planning/todos/pending/2026-05-15-improve-template-composition-understanding.md`) — Future ergonomics/support idea; out of scope.

</deferred>

---

*Phase: 100-Manager TUI Command Output Containment*
*Context gathered: 2026-05-25*
