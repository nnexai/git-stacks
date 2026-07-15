---
phase: 114
status: planned
depends_on: [112, 113]
requirements: [TUI-01, TUI-02]
---

# Phase 114 Plan: Optional TUI Client Package

## Objective

Isolate Bun/OpenTUI as an optional renderer that consumes the official trusted service client and owns no machine/domain implementation.

## Work packages

### 1. Package isolation

- Move OpenTUI, Solid, spinner, rendering components, keymaps, and viewport state into the TUI workspace.
- Consume protocol/client exports and an explicit Node/Bun-compatible managed-service bootstrap contract without importing service internals.
- Keep only two client-local machine handoffs: opening a service-resolved path in `$EDITOR` and yielding the controlling terminal for an explicitly attached shell.
- Ensure default CLI/service/web dependency installation does not include TUI dependencies or Bun types.

### 2. Remove residual authority

- Replace any direct config, integration, labels, workspace-command, Git, file-status, template, or repository imports with trusted projections/operations.
- Use shared client reducers for SSE revisions, replay gaps, signals, priority, operation progress, and dismissals.
- Keep viewport splitting, selection, scroll, dialogs, and rendering local to TUI; shell byte viewport remains the only streamed viewport concern.
- Add architecture fixtures for every previously observed residual import class.

### 3. Lifecycle and parity

- Make TUI startup acquire a managed client lease and make all normal/interrupt/error exits release it exactly once.
- Ensure closing the TUI lets the service idle-stop when no web/terminal/client retention requires it.
- Preserve startup latency, selected-workspace detail stability, no-refresh-loop event behavior, scrolling, dismissals, commands, progress, and foreground handoffs.
- Verify service unavailability/restart yields bounded reconnect or an actionable exit, not flicker or request storms.

## Tests and evidence

- Package dependency audit and negative authority fixtures.
- Trusted-client conformance against the same service used by web tests.
- TUI snapshot/interaction tests for loading, navigation, viewport, signals, dismissals, commands, and reconnect.
- Real-process lifecycle test launches TUI, exits through normal and interrupt paths, and requires the managed command/service to terminate naturally.
- Startup/request-count instrumentation proves one initial snapshot plus event-driven updates rather than repeated full refreshes.

## Completion gate

- TUI is independently optional and Bun-only dependencies do not enter default packages.
- No TUI module performs domain reads, writes, Git inspection, or configured command execution.
- Closing the TUI reliably releases lifecycle ownership.
- User-visible v0.20 TUI behavior remains supported.

## Rollback

Revert the optional package distribution and client wiring. The Node CLI/service/web stack remains independently operational.
