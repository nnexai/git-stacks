---
gsd_state_version: 1.0
milestone: v0.21.0
milestone_name: Node Core and Client Architecture
current_phase: 115
current_phase_name: Distribution Parity and Legacy Removal
status: Implementation complete locally; hosted supported-platform matrix pending
stopped_at: Node package cutover and local release verification complete
last_updated: "2026-07-15T02:18:30+02:00"
last_activity: 2026-07-15
last_activity_desc: planned the Node-default shared-core migration after validating runtime, transport, package, and filesystem risks
progress:
  total_phases: 8
  completed_phases: 6
  total_plans: 8
  completed_plans: 8
  percent: 75
---

# Project State

## Current Position

Phase: 115 of 115 (Distribution Parity and Legacy Removal)
Plan: 115-PLAN.md
Status: Complete on the local Linux x64 host; hosted Linux ARM and macOS matrix pending
Last activity: 2026-07-15 — cut over core, CLI, service, web, and optional TUI to the package architecture

## Decisions

- Node 24 LTS is the default runtime target for core, CLI, service, and web distribution.
- TypeScript stays on 6.x for this migration.
- The existing CLI remains local-only and daemonless; ordinary commands invoke the core directly.
- The Node service owns persistent snapshots, operations, events, signals, authentication, and terminal sessions.
- Web and optional TUI clients remain thin service clients; Bun is isolated to the optional OpenTUI package.
- `node-pty` `1.2.0-beta.14` is accepted temporarily and must be exact-pinned, prebuild-only for supported installs, actual-host tested, and reviewed before each update.
- Files are authoritative. Watchers provide latency; aggregate content reconciliation provides correctness.
- No global lock is introduced. Only semantic per-target read-modify-write operations may coordinate across processes.
- Protocol and terminal policy remain carrier-neutral so future encrypted remote clients do not require another core rewrite.
- Migration phases cut callers over and delete old implementations; temporary shims may forward but never own behavior.

## Validated Inputs

- Spike 016: node-pty behavior and four-platform prebuild shape; beta adoption explicitly accepted.
- Spike 017: Node HTTP, SSE, WebSocket, backpressure, auth, replay, and shutdown.
- Spike 018: Node-compatible core and enforceable package boundaries.
- Spike 019: filesystem-authoritative synchronization, plus required atomic-write and lost-update corrections.
- Spikes 011-015: future remote identity, reconnect, framing, backpressure, and encrypted-carrier constraints to preserve.

## Remaining Release Evidence

- Run the checked-in hosted matrix on Linux x64/arm64 and macOS x64/arm64 before tagging.
- Keep `node-pty` `1.2.0-beta.14` exact-pinned and review the temporary beta exception on every dependency update.
- Do not tag, push, publish, or release without explicit approval.

## Execution Boundary

The full local implementation and package-version bump to `0.21.0-rc.1` are complete. No tag, push, publish, or release has been performed.

## Session Continuity

Continue with the hosted matrix in `.github/workflows/node-runtime-matrix.yml`; if it passes, Phase 112 `TERM-03`, Phase 115 `DIST-01`/`DIST-03`, and the milestone can close before an explicitly approved tag.
