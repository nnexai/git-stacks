---
gsd_state_version: 1.0
milestone: v0.21.0
milestone_name: Node Core and Client Architecture
current_phase: 108
current_phase_name: Package and Runtime Foundation
status: Planned; ready for Phase 108 execution
stopped_at: Full migration roadmap and implementation blueprints prepared
last_updated: "2026-07-15T00:25:02+02:00"
last_activity: 2026-07-15
last_activity_desc: planned the Node-default shared-core migration after validating runtime, transport, package, and filesystem risks
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 8
  completed_plans: 0
  percent: 0
---

# Project State

## Current Position

Phase: 108 of 115 (Package and Runtime Foundation)
Plan: 108-PLAN.md
Status: Ready to execute
Last activity: 2026-07-15 — v0.21.0 migration milestone fully planned

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

## Blockers/Concerns

- Actual macOS x64/arm64 PTY lifecycle and watcher behavior is a release gate, not an architecture blocker.
- The accepted PTY version is a beta and must not float; release notes and dependency policy must make the exception explicit.
- Current fixed `.tmp` writes and metadata-only fallback fingerprints must be replaced before concurrent Node CLI/service use is considered safe.

## Execution Boundary

Planning is complete. No migration source changes, package-version bump, tag, push, or release have been performed by this planning pass.

## Session Continuity

Begin with [Phase 108](./phases/108-package-and-runtime-foundation/108-PLAN.md). Do not start downstream package moves until its boundary tests and build graph pass.
