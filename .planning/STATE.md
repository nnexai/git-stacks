---
gsd_state_version: 1.0
milestone: v0.21.0
milestone_name: Node Core and Client Architecture
current_phase: 122
current_phase_name: Adversarial Security and Distribution Closure
status: Secure migration and adversarial closure complete locally; hosted supported-platform evidence pending
stopped_at: Secure local/remote cutover and local RC verification complete
last_updated: "2026-07-15T11:37:14+02:00"
last_activity: 2026-07-15
last_activity_desc: planned the Node-default shared-core migration after validating runtime, transport, package, and filesystem risks
progress:
  total_phases: 15
  completed_phases: 12
  total_plans: 15
  completed_plans: 14
  percent: 80
---

# Project State

## Current Position

Phase: 122 of 122 (Adversarial Security and Distribution Closure)
Plan: 122-PLAN.md
Status: Secure architecture and adversarial closure complete on the local Linux x64 host; hosted Linux ARM/macOS matrix pending
Last activity: 2026-07-15 — cut web, TUI, local helper, and paired remote authorities to authenticated encrypted carriers

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
- Classified product traffic has no HTTP, SSE, WebSocket, or plaintext fallback; browser sessions use pinned WebTransport and TUI sessions use directly trusted-leaf TLS 1.3 plus in-channel proof.
- Browser authority is one-use and memory-only. Browser storage and localhost origin are never identity or durable trust.
- Remote carriers are isolated per authenticated local principal. This intentionally avoids sharing one helper-authenticated carrier across principals without a separate delegated-session protocol.
- Carrier loss fails the affected authenticated session closed. A fresh launch reconnects with bounded retry and reattaches service-owned terminals; non-idempotent work is never silently replayed.
- Migration phases cut callers over and delete old implementations; temporary shims may forward but never own behavior.

## Validated Inputs

- Spike 016: node-pty behavior and four-platform prebuild shape; beta adoption explicitly accepted.
- Spike 017: Node HTTP, SSE, WebSocket, backpressure, auth, replay, and shutdown.
- Spike 018: Node-compatible core and enforceable package boundaries.
- Spike 019: filesystem-authoritative synchronization, plus required atomic-write and lost-update corrections.
- Spikes 011-015: future remote identity, reconnect, framing, backpressure, and encrypted-carrier constraints to preserve.
- Phases 116-121: secure framing, identities, pairing, signed pin rollover, encrypted carriers, remote routing, ephemeral browser grants, and local-default client cutover.

## Remaining Release Evidence

- Run the checked-in hosted matrix on Linux x64/arm64 and macOS x64/arm64 before tagging.
- Keep `node-pty` `1.2.0-beta.14` exact-pinned and review the temporary beta exception on every dependency update.
- Do not tag, push, publish, or release without explicit approval.

## Execution Boundary

The full local implementation, secure transport cutover, and package-version bump to `0.21.0-rc.1` are complete. No tag, push, publish, or release has been performed.

## Session Continuity

Run `.github/workflows/node-runtime-matrix.yml`; if it passes, Phase 112 `TERM-03`, Phase 115 `DIST-01`/`DIST-03`, Phase 122 `SEC-02`, and the milestone can close before an explicitly approved tag.
