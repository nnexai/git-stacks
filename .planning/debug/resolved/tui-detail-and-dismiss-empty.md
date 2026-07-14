---
status: resolved
trigger: "source / issues / integrations still show up empty; also dismissing signals / messages does not work"
created: 2026-07-14
updated: 2026-07-14
---

## Symptoms

- Expected: workspace source, issue, and integration details render from shared core state.
- Actual: those sections appeared empty or broken until paging the TUI detail pane.
- Expected: dismissing a signal or message removes it from both clients and shared state.
- Actual: dismissing activity returned success but left it visible.

## Evidence

- The live `/v1/core` projection contained all workspace definitions, repository data, templates, and global integration configuration.
- The TUI reserved about 60 percent of the screen for a three-row list, then sliced detail rows with a separately estimated height.
- The signal endpoint journaled every valid dismissal ID, but `SignalState` accepted only notification IDs and clients continued rendering dismissed projection entries.
- A live 140x50 TUI showed all sections after the adaptive split; a 120x30 TUI used the native scrollbar and viewport paging.
- Live dismissal reduced the signal overlay immediately and remained in the service projection after the TUI exited.

## Eliminated

- hypothesis: `/v1/core` omitted source or integration configuration
  evidence: the authenticated projection matched persisted workspace and global configuration.
- hypothesis: cursor movement exhausted the request limit and caused the remaining empty sections
  evidence: the sections remained populated in the projection and the failure reproduced without additional core requests.

## Resolution

- root_cause: mismatched client-side layout estimates clipped detail rows, while shared signal state rejected activity dismissals and clients did not hide persisted dismissed IDs.
- fix: use an adaptive list/detail split plus OpenTUI native scrolling; accept activity dismissal in shared state, optimistically hide it in the TUI, and filter dismissed IDs from browser projections.
- verification: focused render/state/service tests, 90-file unit suite, 87-file isolated integration suite, type checks, web build, dependency scan, gates, and live TUI checks all pass.
- files_changed: src/tui/dashboard/App.tsx, src/tui/dashboard/WorkspaceDetail.tsx, src/tui/dashboard/SignalOverlay.tsx, src/tui/dashboard/hooks/useSignals.ts, src/lib/service/signal-state.ts, src/service/web/routes.ts, related tests and phase evidence.
