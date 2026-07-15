---
gsd_state_version: 1.0
milestone: v0.22.0
milestone_name: Workspace Productivity
status: planning
last_updated: "2026-07-15T21:15:18.538Z"
last_activity: 2026-07-15
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-07-15 — Milestone v0.22.0 started

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

## Release Evidence

- The hosted `Build and test` workflow completed successfully for shipped implementation commit `e878f964` on 2026-07-15: https://github.com/nnexai/git-stacks/actions/runs/29442095014
- `node-pty` `1.2.0-beta.14` remains exact-pinned; its temporary beta exception must be reviewed on every dependency update.
- No final `v0.21.0` tag, push, publish, or release was requested or performed during milestone closeout.

## Execution Boundary

The full implementation, secure transport cutover, hosted release gates, and package-version progression through `0.21.0-rc.6` are complete. Milestone closure is a planning operation only and does not imply a final `v0.21.0` release.

## Verification Overrides

- Phases 116-122 were delivered and shipped through release candidates, but several phase directories lack the standard GSD `SUMMARY.md` and/or `VERIFICATION.md` artifacts.
- Duplicate historical directory names remain for Phases 118 and 120. They are preserved in the archive rather than rewritten after delivery.
- The successful hosted workflow above closes `TERM-03`, `DIST-01`, `DIST-03`, and `SEC-02`; the missing standard phase artifacts are accepted as planning debt by explicit user choice.

## Deferred Items

The following pre-existing backlog items remain open for explicit triage; milestone closure does not claim they were delivered:

- `2026-05-15-add-manual-workspace-commands.md`
- `2026-05-15-add-workspace-notes.md`
- `2026-05-15-add-workspace-stale-view.md`
- `2026-05-15-create-workspace-from-forge-source.md`
- `2026-05-15-improve-template-composition-understanding.md`
- `2026-05-15-improve-tui-dashboard-experience.md`
- `2026-07-09-plan-broader-code-quality-improvement-run.md`

## Operator Next Steps

- Start the next milestone with $gsd-new-milestone
