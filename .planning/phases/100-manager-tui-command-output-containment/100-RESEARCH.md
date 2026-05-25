# Phase 100: Manager TUI Command Output Containment - Research

**Researched:** 2026-05-25
**Status:** Ready for planning

## Research Question

What needs to be known to plan Phase 100 well: preventing commands launched from `git-stacks manage` from writing raw stdout/stderr behind the OpenTUI dashboard, while showing bounded diagnostic output and restoring the previous dashboard context cleanly.

## Findings

### Current TUI Command Surfaces

- `src/tui/dashboard/App.tsx` owns the dashboard view state through the `UIView` union in `src/tui/dashboard/types.ts`.
- Existing simple command progress uses `view: "progress"` plus `progressLines` and `progressDone` signals, rendered by `src/tui/dashboard/ProgressView.tsx`.
- Existing keyboard handling already blocks global keys while `view: "progress"` is active, and any key after `progressDone()` returns to `view: "list"`, calls `reload()`, and clamps the cursor.
- `open`, `close`, `clean`, `remove`, `merge`, `rename`, sync, push, and create paths already have captured progress-style UI patterns. The corruption risk is concentrated in generic command execution paths rather than all dashboard actions.

### Known Raw Output Paths

- `handleRun()` in `src/tui/dashboard/App.tsx` runs `Bun.spawn(["git-stacks", "run", name], { stdout: "pipe", stderr: "inherit" })`. Stdout is captured, but stderr is inherited and can corrupt the alternate screen.
- `executeManualCommand()` calls `runManualCommand()` from `src/lib/workspace-command.ts`.
- `runManualCommand()` calls `runShellSequence()` in `src/lib/lifecycle.ts`; `runShellSequence()` currently spawns shell commands with `stdout: "inherit"` and `stderr: "inherit"`.
- `executeIssueOpen()` already calls `openWorkspaceIssue()`, which pipes stdout and stderr. However, `openWorkspaceIssue()` reads stdout and stderr as full buffers and concatenates stdout lines before stderr lines, so it does not preserve interleaved stream ordering.
- Editor paths intentionally suspend the renderer and inherit stdio. These should remain separate from the captured-output viewer unless post-editor validation text leaks after resume.

### Existing Capture Patterns To Reuse

- `runHooksCaptured()` in `src/lib/lifecycle.ts` already pipes both stdout and stderr, splits into lines, tags each line with `stream: "stdout" | "stderr"`, and drains both streams concurrently.
- The lifecycle `_exec.spawn` object is mutable and test-friendly. Adding a captured shell sequence should preserve this injection pattern.
- `src/tui/dashboard/issue-actions.ts` already provides an injectable `_exec.spawn` for focused tests of issue opening behavior.
- `ProgressView.tsx` is the right shell to evolve into a bounded command-output viewer because it already uses `CenteredDialog` and is wired into dashboard modal state.

### Viewer Requirements

- Store output as structured lines, not strings: `{ text: string; stream: "stdout" | "stderr" | "system" }`.
- Maintain a bounded tail in App state before rendering; suggested bound is 80-120 lines. This is enough for diagnosis without resizing the modal uncontrollably.
- Track omitted line count and render a marker such as `... 12 earlier lines omitted ...` when the tail drops older output.
- Render stdout/system lines with the existing muted style and stderr lines with a distinct warning/error color.
- Represent status explicitly: running, exit 0, nonzero exit, and interrupted/cancelled if supported by the execution path.
- While running, keep the existing guard that blocks all keys. After completion, close/back should restore the prior dashboard list context rather than create hidden background command state.

### Implementation Shape

- Add command-output types/helpers near the dashboard layer, either in `src/tui/dashboard/types.ts` or a small helper module such as `src/tui/dashboard/command-output.ts`.
- Replace `progressLines: string[]` with a compatible structured output state, or introduce a parallel `commandOutput` state while adapting `ProgressView` props.
- Add a helper append function in `App.tsx` that applies the tail bound, increments omitted count, and preserves output ordering as events arrive.
- Add a captured shell runner for manual commands, either by extending `runShellSequence()` with a captured option or adding `runShellSequenceCaptured()` in `src/lib/lifecycle.ts`.
- Extend `runManualCommand()` options with an output callback and use the captured shell runner only when the callback is supplied. Keep CLI `git-stacks command run` behavior compatible with existing inherited stdio unless explicitly changed by another phase.
- Update `handleRun()` to pipe stderr as well as stdout and drain both streams concurrently.
- Update `openWorkspaceIssue()` or its caller to preserve stdout/stderr event ordering if possible; if Bun stream interleaving cannot be exactly recovered after process buffering, document the practical ordering boundary and at minimum keep both streams captured and tagged in the viewer.

### Tests To Add Or Update

- `tests/tui/dashboard/snapshots/ProgressView.snap.test.tsx`: verify bounded output marker, stderr styling text presence, running state, success state, and nonzero exit state.
- `tests/lib/workspace-command.test.ts`: verify manual command execution can route output through a callback without inherited stdio and stops on first failure while preserving failed command metadata.
- `tests/tui/dashboard/issue-actions.test.ts`: add stderr/nonzero coverage and assert both streams are captured.
- A focused dashboard integration test under `tests/tui/dashboard/` should exercise a noisy command path with mocked command execution, prove the modal contains recent output, prove older output is omitted, and prove post-completion keypress returns to the same tab/selected row context.
- Use `bun run scripts/test-runner.ts` through package scripts. Do not run `bun test tests/` as the full suite gate.

## Risks And Constraints

- Reading stdout and stderr in separate async readers preserves arrival order only at callback scheduling granularity. That is acceptable for the TUI viewer if line events are appended as readers deliver them, but exact OS-level interleaving is not recoverable from independent streams after the fact.
- Converting editor flows to the viewer would break interactive editor behavior. Keep renderer suspend/resume for workspace, repo, and template edit actions.
- A broad dashboard state refactor is unnecessary. The phase should keep changes localized to command output state, command runners, `ProgressView`, and focused tests.
- `runManualCommand()` is also used by CLI command execution in `src/commands/command.ts`; any API change must preserve current CLI behavior and tests.

## Validation Architecture

- Unit/component: render `ProgressView` with structured output states and assert visible strings for tail truncation, stderr lines, running status, success, and failure.
- Library: mock lifecycle execution in `tests/lib/workspace-command.test.ts` to verify manual command callback wiring and failure propagation.
- TUI integration: use `@opentui/solid` `testRender`, `mockInput`, `renderOnce`, and `captureCharFrame` to prove command output stays inside the OpenTUI frame and the dashboard returns to the same list context after completion.
- Regression gate: run focused tests during execution, then `bun run typecheck` and `bun run test` or the current canonical verify gate if time allows.

## RESEARCH COMPLETE
