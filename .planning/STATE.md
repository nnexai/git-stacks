---
gsd_state_version: 1.0
milestone: v0.20.0
milestone_name: Local Web Workspace Client
current_phase: 107.3
current_phase_name: Web Client and Local Terminal Bridge
status: Complete; maintenance mode pending the next milestone decision
stopped_at: Retired unsupported desktop client and retained the web/service architecture
last_updated: "2026-07-14T16:59:12+02:00"
last_activity: 2026-07-14
last_activity_desc: made coding-agent signal hooks opt-in and removed the superseded project-local hook system
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 3
  completed_plans: 3
  percent: 100
---

# Project State

## Current Position

The supported graphical product is the local browser client backed by the Bun/TypeScript service. Phase 107.3 is implemented and verified on Linux. No next milestone has been selected.

## Supported Surfaces

- CLI workspace lifecycle and integrations
- OpenTUI dashboard
- Loopback web client
- Local workspace, operation, event, signal, and browser-terminal service

## Current Constraints

- Browser terminals are retained only for the lifetime of the managed service process.
- Browser terminal capability is disabled on unverified platforms.
- Remote hosting and shared terminal writing remain out of scope.

## Blockers/Concerns

- None for the supported Linux web-client path.
- Future platform enablement requires actual-host PTY and process-tree cleanup evidence.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|---|---|---|---|---|
| 260714-mvm | Make user-level coding-agent signal hooks opt-in with provider-selected install/uninstall and installed-only update | 2026-07-14 | 795c1219 | Verified | [260714-mvm-make-coding-agent-hook-integrations-stri](./quick/260714-mvm-make-coding-agent-hook-integrations-stri/) |
| 260714-mez | Retire and completely remove the unsupported native GTK/libghostty client while preserving and generalizing the web service foundations | 2026-07-14 | 004b5679 | Verified | [260714-mez-retire-and-completely-remove-the-unsuppo](./quick/260714-mez-retire-and-completely-remove-the-unsuppo/) |

## Session Continuity

No active phase handoff. Start the next product milestone from `PROJECT.md`, `REQUIREMENTS.md`, and `ROADMAP.md`.
