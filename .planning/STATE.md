---
gsd_state_version: 1.0
milestone: v0.20.0
milestone_name: milestone
current_phase: 107
current_phase_name: Beautify Native Workspace UI and Finalize UX
status: Phase 107 hardening execution in progress; 107-02 and 107-04 complete
stopped_at: Completed 107-06-PLAN.md
last_updated: "2026-07-12T11:03:44.113Z"
last_activity: 2026-07-12
last_activity_desc: completed authoritative workspace snapshot reconciliation and change monitoring
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 34
  completed_plans: 25
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-11)

**Core value:** One command takes a user from feature intent to a fully running development environment without manual setup.
**Current focus:** Phase 107 — native-client feature completion and polish before delivery work

## Current Position

Phase: 107 — Beautify Native Workspace UI and Finalize UX
Plan: 13 plans total — 107-01, 107-02, and 107-04 complete; remaining plans pending
Status: Phase 107 hardening execution in progress
Last activity: 2026-07-12 — completed authoritative workspace snapshot reconciliation and change monitoring

Progress: [███████░░░] 68%

## Performance Metrics

**Velocity:**

- Total plans completed: 25
- Average duration: 7min
- Total execution time: 46min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 104 | 7 | 46min | 7min |
| 104 | 9 | - | - |
| 105 | 9 | - | - |

**Recent Trend:** Phase 104 complete and ready for verification.
| Phase 104 P01 | 11min | 2 tasks | 7 files |
| Phase 104 P03 | 8min | 2 tasks | 3 files |
| Phase 104 P02 | 6min | 2 tasks | 4 files |
| Phase 104 P05 | 3min | 2 tasks | 6 files |
| Phase 104 P04 | 6min | 2 tasks | 4 files |
| Phase 104 P06 | 10min | 2 tasks | 9 files |
| Phase 104 P07 | 2min | 2 tasks | 7 files |
| Phase 104 P08 | 8min | 2 tasks | 4 files |
| Phase 104 P09 | 2min | 2 tasks | 5 files |
| Phase 105 P01 | 8min | 1 tasks | 5 files |
| Phase 105 P02 | 10min | 2 tasks | 12 files |
| Phase 105 P03 | 6min | 3 tasks | 12 files |
| Phase 105 P05 | 32min | 3 tasks | 12 files |
| Phase 105 P06 | 8min | 3 tasks | 9 files |
| Phase 105 P07 | 6min | 3 tasks | 10 files |
| Phase 107 P02 | 24min | 2 tasks | 5 files |
| Phase 107 P04 | 18min | 2 tasks | 7 files |
| Phase 107 P06 | 12min | 2 tasks | 9 files |

## Accumulated Context

### Roadmap Evolution

- Phase 107 added: Beautify native workspace UI and finalize sidebar, tab, and terminal UX after stability work; native delivery and cross-platform proof moved to Phase 108.
- Phase 107 reopened before Phase 108: the prior acceptance did not cover native workspace creation, reliable outside-client synchronization, Codex attention presentation/routing, or the release-critical UI review findings.

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- The Bun/TypeScript engine remains authoritative; native clients do not read or mutate workspace YAML.
- The MVP transport is authenticated loopback HTTP/JSON plus replayable SSE.
- Workspace configuration monitoring remains service-owned; native clients never watch or mutate YAML directly.
- External snapshot reconciliation preserves native presentation, live-terminal ownership, and unread attention; vanished authoritative pairs remain explicit while owned terminals are live.
- Linux is the primary deliverable; macOS is a thin architectural proof that must be built and verified on macOS hardware or CI.
- [Phase 107]: Keep ordinary config reads cached while service projections use explicit authoritative disk enumeration.
- [Phase 107]: Coalesce watcher and fingerprint triggers through one revision-comparing single-flight rebuild.
- [Phase 104]: Wire identifiers are UUIDs while request and operation IDs use explicitly prefixed opaque strings. — Prevents identifier-domain confusion at the wire boundary.
- [Phase 104]: Identity migration is service-only, lock-serialized, validated, fsynced, and atomically renamed. — Preserves CLI compatibility and prevents competing committed identities.
- [Phase 104]: Official client IDs are path-safe stable identifiers with independently revocable 256-bit credentials. — Prevents path traversal and limits credential compromise to one installed client.
- [Phase 104]: Authentication accepts only exact Bearer syntax and returns one rejection before downstream request evaluation. — Closes route, schema, capability, and rate-state admission oracles.
- [Phase 104]: Snapshot revisions derive from canonical contract-visible content and exclude diagnostic timestamps. — Prevents false revision churn while retaining a timestamp on every response.
- [Phase 104]: Launch contexts omit resolved secret values and expose only resolver reference metadata. — Service authentication does not imply access to workspace credentials.
- [Phase 104]: Journal sequence allocation, fsynced append, compaction, and subscriber registration share one serialization boundary. — Prevents replay/live races and active-generation compaction loss.
- [Phase 104]: Legacy message JSONL persistence remains authoritative and structured attention publication is additive and failure-isolated. — Preserves SVC-04 compatibility when the journal is unavailable.
- [Phase 104]: Operation state is persisted before journal append but becomes query/observer-visible only after append succeeds. — Prevents clients from observing unreplayable lifecycle transitions.
- [Phase 104]: Idempotency reservations are scoped by client, endpoint, and key with canonical request hashes. — Prevents retries and restarts from duplicating destructive workspace work.
- [Phase 104]: Every v1 request authenticates before route lookup, body parsing, capability checks, or rate-state evaluation. — Prevents admission oracles and isolates rate state by credential.
- [Phase 104]: Service descriptors carry endpoint and instance metadata plus a credential lookup identity, never bearer secrets. — Enables automatic protected discovery without secret duplication.
- [Phase 104]: Service commands register through the shared live Commander tree. — Keeps completion and release inventory aligned with the executable CLI.
- [Phase 104]: Managed attention publication uses ownership-aware disposal and snapshot-owned revision callbacks. — Prevents one service from detaching another and makes replay-gap rebuild metadata authoritative.
- [Phase 104]: Only the private ordinary execution-deadline sentinel maps to request_timeout; SSE remains exempt. — Preserves generic adapter failures and long-lived event streams while enforcing SVC-05.
- [Phase 105]: Ordinary native verification is offline and consumes a setup-populated user cache whose artifact and checkout identities are revalidated before every compile. — Preserves reproducibility without vendoring large upstream payloads or using network during ordinary verification.
- [Phase 105]: The feasibility spike imports the pinned full ghostty.h surface into a Zig object, proving API declarations without prematurely implementing or linking the later GTK host. — Retires API availability risk while leaving terminal lifecycle implementation in its planned slice.
- [Phase 105]: ABI interchange preserves canonical v1 JSON bytes behind opaque handles; no Zig or platform layout crosses the header. — Keeps both native shells on one product-owned contract.
- [Phase 105]: Destroyed handles retain a bounded tombstone while owned payload bytes are released immediately. — Makes double-destroy and post-destroy calls deterministic.
- [Phase 105]: Header portability is proven in Phase 105, while actual macOS execution and byte parity remain Phase 108 work. — Avoids a false runtime claim.
- [Phase 105]: Service disconnection retains an explicitly stale snapshot; revision drift and replay gaps enter refresh_required and emit only a refresh effect. — Preserve useful context while freezing mutations until authoritative refresh.
- [Phase 105]: Restoration accepts valid records independently and always materializes them as ended presentation state. — Presentation continuity must never spoof process liveness.
- [Phase 105]: Relaunch creates a distinct live surface with predecessor lineage and never rewrites the ended predecessor identity. — A new process lifetime cannot masquerade as the old surface.
- [Phase 105]: Linux terminal leaves use full Ghostty rendered surfaces hosted by GTK; git-stacks owns pane/workspace layout while Ghostty owns PTY, rendering, fonts, input protocol, and terminal compatibility. — The custom `ghostty-vt` plus Pango path cannot provide Ghostty fidelity or fully functional panes.
- [Phase 105]: The initial Linux surface integration may use the exact Limux Ghostty fork commit while an upstreamable patch and automated rebase/ABI audit are established. — Current upstream does not expose the rendered surface on Linux, but working multi-pane prior art exists.
- [Phase 105]: Plain GTK IM commits are buffered into the original Ghostty key event while true composition commits directly. — Preserves raw-mode TUI keys without duplicating cooked input.
- [Phase 105]: Launcher-scoped NO_COLOR is removed before Ghostty initializes while TERM, COLORTERM, TERMINFO, resources, and user configuration remain Ghostty-owned. — Prevents an embedding launcher from suppressing terminal child color capabilities.
- [Phase 107]: Codex hook mutation validates the complete hook collection and atomically replaces only after a safe merge.
- [Phase 107]: Hook-triggered publication uses a 1500ms abort deadline and suppresses publication-path failures while manual publication stays strict.

### Pending Todos

None yet.

### Blockers/Concerns

- The Limux Ghostty fork is materially behind current upstream and requires a pinned patch, ABI/build verification, and an upstream/rebase strategy.
- Phase 108 requires access to a macOS CI runner or physical macOS host; Linux-only inspection cannot complete MAC-06.

## Deferred Items

See REQUIREMENTS.md Out of Scope for deferred product breadth and platform polish.

## Session Continuity

Last session: 2026-07-12T11:03:44.091Z
Stopped at: Completed 107-06-PLAN.md
Resume file: None
