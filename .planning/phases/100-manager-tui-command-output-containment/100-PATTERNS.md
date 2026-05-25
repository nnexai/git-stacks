# Phase 100: Manager TUI Command Output Containment - Pattern Map

**Mapped:** 2026-05-25
**Status:** Ready for planning

## Target Files

| File | Role | Closest Existing Pattern | Notes |
|------|------|--------------------------|-------|
| `src/tui/dashboard/types.ts` | Shared dashboard view/output types | Existing `UIView` union and progress view state | Add structured command output line/status types here or in `command-output.ts`; keep `UIView` compatible with current modal flow. |
| `src/tui/dashboard/command-output.ts` | Optional helper for bounded output state | `buildSummary()` and small dashboard helpers in `App.tsx` | Prefer a pure helper for append/tail logic so unit tests can prove truncation without rendering. |
| `src/tui/dashboard/ProgressView.tsx` | Modal command-output viewer | Current `ProgressView` using `CenteredDialog` | Evolve props from `string[]`/`done` toward structured lines, status, omitted count, and close hint. |
| `src/tui/dashboard/App.tsx` | Command lifecycle wiring and context restoration | Existing progress, sync, push, create progress states | Replace ad hoc `progressLines` updates with bounded structured output; keep editor suspend/resume separate. |
| `src/lib/lifecycle.ts` | Captured shell execution primitive | `runHooksCaptured()` | Add `runShellSequenceCaptured()` or equivalent option using `_exec.spawn` with `stdout: "pipe"` and `stderr: "pipe"`. |
| `src/lib/workspace-command.ts` | Manual command runner | Existing `runManualCommand()` and `planManualCommand()` | Add optional output callback while preserving CLI inherited-stdio behavior when no callback is supplied. |
| `src/tui/dashboard/issue-actions.ts` | Issue-open command capture | Existing `_exec.spawn` injection | Return tagged output lines rather than plain strings; keep both streams captured and failure explicit. |

## Data Flow

1. A TUI action enters `App.tsx` through `handleRun()`, `executeManualCommand()`, or `executeIssueOpen()`.
2. `App.tsx` sets `view: "progress"` with the command label and initializes command output state.
3. The command runner pipes stdout and stderr, emits tagged line events, and never uses inherited stdout/stderr while the OpenTUI renderer remains active.
4. `App.tsx` appends each event through a bounded-tail helper that increments an omitted count after the limit is exceeded.
5. `ProgressView` renders command label, running/exit status, omitted marker, recent tagged lines, and a close hint only after completion.
6. A post-completion keypress returns to `view: "list"` and calls the existing reload/clamp path, preserving tab and selected row context.

## Code Excerpts

### Existing Raw Stderr Path

`src/tui/dashboard/App.tsx` `handleRun()` currently pipes stdout but inherits stderr:

```typescript
const proc = Bun.spawn(["git-stacks", "run", name], {
  stdout: "pipe",
  stderr: "inherit",
})
```

### Existing Manual Command Raw Path

`src/lib/workspace-command.ts` delegates manual commands to `runShellSequence()`:

```typescript
const result = await runShellSequence([step.shell], step.cwd, env)
```

`src/lib/lifecycle.ts` `runShellSequence()` inherits both streams:

```typescript
stdout: "inherit",
stderr: "inherit",
```

### Existing Captured Stream Pattern

`runHooksCaptured()` is the reference pattern for this phase: use `_exec.spawn`, pipe both streams, read them concurrently, split on newline, tag each output line by stream, and return explicit exit data rather than throwing.

### Existing Viewer Pattern

`ProgressView.tsx` already uses `CenteredDialog`, running state, output lines, and a done hint. It is the right shell to evolve into a command-output viewer instead of introducing a broad dashboard view redesign.

## Test Patterns

| Test File | Existing Pattern | Phase 100 Extension |
|-----------|------------------|---------------------|
| `tests/lib/lifecycle.test.ts` | `_exec.spawn` injection for shell runners and captured hooks | Prove captured shell sequence uses `stdout: "pipe"` and `stderr: "pipe"`, emits tagged lines, and stops on first failure. |
| `tests/lib/workspace-command.test.ts` | Mocked lifecycle runner and manual command ordering | Prove `runManualCommand(..., { onOutput })` calls captured runner and preserves CLI path when no callback exists. |
| `tests/tui/dashboard/snapshots/ProgressView.snap.test.tsx` | `testRender`, `captureCharFrame`, snapshot/text assertions | Prove omitted marker, stderr distinction, status text, empty/no-output, success, and failure states. |
| `tests/tui/dashboard/issue-actions.test.ts` | `_exec.spawn` injection for issue opening | Prove both streams are captured/tagged and nonzero exit remains visible. |
| `tests/tui/dashboard/integ-action-menu.test.tsx` | Manual command dashboard interaction | Add noisy/failing/no-output command assertions and same-context restore checks. |

## Planning Constraints

- Do not route `$EDITOR` flows through the viewer; keep renderer `suspend()`/`resume()` behavior.
- Do not add hidden background command state. Running commands remain modal and non-dismissible.
- Preserve `git-stacks command run` CLI behavior unless a TUI output callback is explicitly supplied.
- Use the custom package scripts (`bun run test:unit`, `bun run test:integ`, `bun run test`) rather than `bun test tests/` for suite gates.

## PATTERN MAPPING COMPLETE
