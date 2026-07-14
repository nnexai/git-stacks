---
status: resolved
trigger: "A shell shows another workspace's content after switching back until browser refresh; Copilot remains active and Codex signals are unreliable while hidden."
created: 2026-07-14
updated: 2026-07-14
resolved: 2026-07-14
---

# Debug Session: Web Terminal Resume and Signals

## Symptoms

- Returning to a shell after opening another workspace could visually show the other shell until browser refresh.
- Copilot could remain displayed as working, while Codex lifecycle activity could appear unreliable after switching away.

## Evidence

- Playwright reproduced two terminals with unique `A-MARK-*` and `B-ONLY-CONTENT` output.
- The hidden terminal's xterm accessibility buffer contained the correct A output while the visible pixels showed B.
- DOM inspection showed both terminal panes had `hidden=false` and identical bounds after returning to A.
- The service receives PTY bytes and runs `TerminalSignalFilter` before visible-output flow control, so hidden streaming is not supposed to suppress signals.
- Installed Copilot hooks were legacy repository/user integrations. Hook commands fell back to `$PPID`, which differs between lifecycle hook processes and stranded old `working` activity records.

## Eliminated

- PTY output loss: hidden output replay tests and live xterm buffers retained all output.
- WebSocket cursor replay failure: the correct A output was already present client-side before refresh.
- Signal loss caused by hidden flow control: a real PTY regression test publishes a Codex OSC while streaming is paused.

## Resolution

- root_cause: `renderTabs()` deactivated only terminals in the newly selected repository. A terminal from the previous workspace stayed visible and overlapped the selected pane. Repeated WebGL addon disposal/reload also cannot be used safely on one xterm instance. Agent hooks additionally used unstable process identities, legacy app-owned hooks were not migratable, and signal projection retained each obsolete session independently.
- fix: Deactivate every terminal outside the selected scope; retire WebGL to the built-in renderer after first deactivation; remove the redundant repository-local Copilot hook; migrate legacy app-owned integrations; use a stable provider/surface fallback identity; and project one current provider activity lane per terminal surface.
- verification: Playwright switched repeatedly between A and B with exactly one visible pane and the correct pixels; browser reload retained both service-owned shells; installed integration version 2 reports all four providers installed; focused tests passed 39/39; full suite passed 810 unit tests and 83/83 integration files; TypeScript, web TypeScript, web build, and dependency-cycle checks passed.
- files_changed: `.github/hooks/git-stacks.json`, `src/web-client/app.ts`, `src/lib/agent-hooks/integration-manager.ts`, `src/lib/agent-hooks/types.ts`, `src/lib/service/signal-state.ts`, generated web bundle, and focused tests.
