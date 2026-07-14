---
status: resolved
trigger: "Closed web terminal tabs continue to show Copilot completed and Codex working in the workspace sidebar."
created: 2026-07-14
updated: 2026-07-14
resolved: 2026-07-14
---

# Closed web terminal signals

## Symptoms

- expected: Closing a terminal tab removes every agent lifecycle indicator owned by that terminal surface.
- actual: The PTY and tab close, but the signal projection retains the surface's last provider states.
- reproduction: Run Codex or Copilot in a browser terminal, close the tab, and inspect its workspace sidebar row.

## Evidence

- Terminal closure deleted the service-owned session without publishing a final lifecycle transition.
- Signal projection coalesced activity by provider and surface, so its last `working` or `completed` record remained durable.

## Resolution

- root_cause: Terminal and signal lifecycles were not joined at the service boundary.
- fix: Track providers observed on each service-owned terminal, publish an `idle` transition for every lane during closure, treat `idle` as a durable activity-lane tombstone during journal replay, and intersect each browser principal's activity projection with its retained service-side terminal surfaces. Existing orphaned records are therefore hidden immediately, while detached-but-retained tabs still reconnect normally.
- verification: Signal-state, browser projection, request-boundary, and real-PTY terminal closure regressions pass, along with repository and web TypeScript checks.
- files_changed: src/service/web/terminal-manager.ts, src/service/web/projection.ts, src/service/web/routes.ts, src/lib/service/signal-state.ts, tests/service/web-terminal.test.ts, tests/service/web-projection.test.ts, tests/service/web-security.test.ts, tests/lib/service/signal-state.test.ts
