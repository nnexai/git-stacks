---
phase: 104-workspace-service-and-event-contract
verified: 2026-07-11T13:00:51Z
status: passed
score: 20/20 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 15/20
  gaps_closed:
    - "Production attention events now append to the shared journal and broker, with ownership-safe lifecycle cleanup."
    - "Production replay gaps now obtain the current authoritative snapshot revision from the snapshot subsystem."
    - "SSE transport now retains each event and byte charge through destination acceptance and disconnects stalled readers at either cap."
    - "Ordinary authenticated handlers now have an independent execution deadline with strict 504 mapping and recovery."
  gaps_remaining: []
  regressions: []
---

# Phase 104: Workspace Service and Event Contract Verification Report

**Phase Goal:** Native clients can securely consume authoritative workspace state, resolved execution context, asynchronous operations, and structured events through a versioned local contract.
**Verified:** 2026-07-11T13:00:51Z
**Status:** passed
**Re-verification:** Yes — after gap closure in Plans 104-07, 104-08, and 104-09

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Strict v1 discovery, envelopes, capabilities, entities, launches, operations, cursors, events, and timeout errors validate. | VERIFIED | `contract.ts`; discovery, snapshot, and timeout golden fixtures parse exactly and strict rejection tests pass. |
| 2 | Workspace/repository IDs survive rename and legacy migration without breaking name callers. | VERIFIED | `identity.ts`; persistence, rename, restart, and symlink tests pass. |
| 3 | Golden fixtures contain only declared contract fields. | VERIFIED | Exact round-trip and unknown-field rejection tests pass. |
| 4 | Snapshots are internally consistent aggregates. | VERIFIED | Bounded fingerprint retry and mixed-generation rejection tests pass. |
| 5 | Revisions are monotonic, projection-based, durable, timestamped, and queryable for replay recovery. | VERIFIED | Snapshot revision tests, including current greatest revision and empty state, pass. |
| 6 | Launch specs expose authoritative cwd, ports, steps, and safe environment data without secrets. | VERIFIED | Launch-context tests pass, including resolved-secret omission. |
| 7 | Official clients receive isolated, revocable, protected credentials automatically. | VERIFIED | Credential provisioning/revocation and owner-only filesystem tests pass. |
| 8 | Authentication failures are generic and occur before detailed routing or body work. | VERIFIED | Real loopback unauthenticated-route and admission tests pass. |
| 9 | Credential storage rejects unsafe permission, ownership, and symlink layouts. | VERIFIED | Credential filesystem-boundary tests pass. |
| 10 | Mutations are durably accepted and transition to exactly one terminal state. | VERIFIED | Operation lifecycle, append-failure, and restart tests pass. |
| 11 | Progress and cooperative cancellation report completed work and rollback outcome. | VERIFIED | Named cancellation/rollback behavioral test passes. |
| 12 | Credential-scoped equivalent retries deduplicate across concurrency/restart and conflicts reject. | VERIFIED | Idempotency concurrency, conflict, restart, and retention tests pass. |
| 13 | Operation transitions append before observation/live publication. | VERIFIED | Append-first and append-failure behavioral tests pass. |
| 14 | Production operation and attention events share one durable monotonically increasing cursor stream. | VERIFIED | Managed service installs `configureAttentionPublication`; real authenticated SSE/restart test observes operation sequence 1 and attention sequence 2. |
| 15 | Journal retention is dual-bounded and stale cursors include the authoritative snapshot revision. | VERIFIED | Journal compaction tests pass; managed HTTP replay-gap test reports injected authoritative revision `7`. |
| 16 | Slow SSE clients remain bounded through the real network transport and publishers/healthy clients continue. | VERIFIED | Direct-stream reservation accounting plus real stalled-loopback event-cap and byte-cap tests pass. |
| 17 | Official client starts/discovers an authenticated random-port loopback service. | VERIFIED | Real loopback discovery, concurrent reuse, and protected descriptor tests pass. |
| 18 | Body, rate, timeout, SSE, connection, queue-event, and queue-byte limits are enforced. | VERIFIED | Source wiring plus authentication, deadline, SSE exemption, broker accounting, and real backpressure tests pass. |
| 19 | Snapshot, operation lifecycle, idempotency, ordered replay, replay gaps, attention interleaving, and overflow work across the local contract. | VERIFIED | Focused core and real-transport suites pass; the prior missing transport behaviors now have behavior-first tests. |
| 20 | Five-minute idle exit requires zero clients and zero active operations. | VERIFIED | Injected timer transition test passes and production composition updates both counts. |

**Score:** 20/20 truths verified (0 present, behavior-unverified)

### Prior Gap Closure Evidence

| Prior Gap | Production Closure | Behavioral Proof | Status |
|---|---|---|---|
| Attention publication was not composed into journal/SSE. | `startManagedService` installs an ownership-safe attention adapter that resolves stable workspace IDs, awaits journal append, then publishes the exact event to the broker; stop disposes only its adapter. | `managed attention publication is durable and available over authenticated SSE`; message ownership/disposal tests. | CLOSED |
| Replay gaps used default snapshot revision `0`. | Production constructs `EventJournal` with `snapshotRevision: () => snapshot.currentRevision()`. | `managed replay gaps expose the authoritative snapshot revision`; snapshot greatest/empty revision tests. | CLOSED |
| SSE drained bounded broker data into uncharged stream memory. | `EventSubscription` transfers one shared charge queue -> reservation -> ack; `SseTransportBridge` uses Bun direct destination writes and acknowledges only after flush. | Real raw-loopback stalled readers overflow independently at the event and encoded-byte caps; healthy reader progresses and resources return to baseline. | CLOSED |
| Ordinary handlers had socket-idle timeout only. | Every non-SSE route runs through an independent `withDeadline` race with an `AbortSignal`; only the private timeout sentinel maps to strict HTTP 504 `request_timeout`. | Stalled snapshot returns exact golden 504, late work is contained, later discovery/snapshot succeed, and SSE survives beyond the injected ordinary deadline. | CLOSED |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/lib/service/contract.ts` | Strict v1 wire contract | VERIFIED | Substantive, fixture-backed, imported by service modules. |
| `src/lib/service/identity.ts` | Stable lazy identity migration | VERIFIED | Substantive and used by snapshot production adapter. |
| `src/lib/service/snapshot.ts` | Aggregate snapshots and current revision provider | VERIFIED | Production-wired and behavior-tested. |
| `src/lib/service/credentials.ts` | Protected per-client admission | VERIFIED | Server-wired with generic rejection. |
| `src/lib/service/operations.ts` | Durable operations/idempotency | VERIFIED | Managed-service/server-wired and transition-tested. |
| `src/lib/service/event-journal.ts` | Ordered durable replay journal | VERIFIED | Append-first, restart, gap, corruption, and dual-bound tests pass. |
| `src/lib/service/event-broker.ts` | Shared bounded queue/reservation ledger | VERIFIED | Queue/reserve/ack invariants and both cap paths tested. |
| `src/service/server.ts` | Authenticated bounded HTTP/SSE adapter | VERIFIED | Direct SSE bridge and ordinary deadline are production paths with real loopback tests. |
| `src/service/main.ts` | Discovery, attention, revision, and lifecycle composition | VERIFIED | All core modules are composed; adapter cleanup and descriptor ownership are tested. |
| `tests/service/events.test.ts` | Managed event/replay proof | VERIFIED | Real authenticated attention/operation SSE and authoritative gap tests. |
| `tests/service/events-backpressure.test.ts` | Real stalled-reader proof | VERIFIED | Raw loopback event/byte overflow, healthy progress, and cleanup. |
| `tests/service/security.test.ts` | Admission/deadline proof | VERIFIED | Exact timeout envelope, recovery, late-work containment, and SSE exemption. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `identity.ts` | `config.ts` | validated reads/writes | WIRED | Optional IDs and atomic migration use canonical schemas. |
| `snapshot.ts` | identity/command/env/status modules | authoritative projection | WIRED | Production adapter calls shared engine functions. |
| `operations.ts` | `event-journal.ts` | injected append-first publisher | WIRED | Managed service publishes journal record before broker delivery. |
| `messages.ts` | `event-journal.ts` | managed attention adapter | WIRED | Stable workspace ID resolution -> appendAttention -> broker.publish. |
| `event-journal.ts` | `snapshot.ts` | `snapshot.currentRevision()` | WIRED | Production replay-gap metadata uses an authoritative current build. |
| `server.ts` | `event-broker.ts` | reserve/direct-write/flush/ack | WIRED | Event remains charged until destination acceptance. |
| `server.ts` | snapshot/operation routes | independent deadline wrapper | WIRED | Non-SSE awaited work receives AbortSignal and strict timeout mapping. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Gap-closure and Phase 104 core/transport behavior | `bun test tests/lib/messages.test.ts ... tests/service/operations.test.ts` | 71 pass, 0 fail | PASS |
| Full CLI/OpenTUI compatibility | `bun run test -- --workers 8` | Full unit and isolated integration run exited 0 | PASS |
| Static type safety | `bun run typecheck` | exit 0 | PASS |
| Dependency graph | `bun run test:deps` | no circular dependencies | PASS |
| Release gates | `bun run verify:gates` | inventory, mapped tests, and coverage artifacts aligned | PASS |

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| SVC-01 | SATISFIED | Authenticated versioned discovery works over random-port loopback. |
| SVC-02 | SATISFIED | Stable identity, aggregate snapshot, and current revision tests pass. |
| SVC-03 | SATISFIED | Resolved secret-safe launch projections pass. |
| SVC-04 | SATISFIED | Full CLI/OpenTUI suite passes; message persistence remains additive and failure-isolated. |
| SVC-05 | SATISFIED | Generic authentication, protected storage, body/rate/connection bounds, real handler deadline, and bounded SSE transport are proven. |
| EVT-01 | SATISFIED | Durable asynchronous lifecycle, progress, cancellation, and nonblocking ordinary queries are tested. |
| EVT-02 | SATISFIED | Idempotency concurrency/restart/conflict behavior passes. |
| EVT-03 | SATISFIED | Managed operation and attention records share ordered durable SSE replay. |
| EVT-04 | SATISFIED | Reconnect replay and authoritative replay-gap rebuild metadata pass through HTTP. |
| EVT-05 | SATISFIED | Real stalled network readers hit both shared caps without unbounded transport escape. |

### Anti-Patterns Found

No unreferenced `TBD`, `FIXME`, or `XXX` markers were found in Phase 104 source files. The previous assertion-only event coverage has been replaced by managed-service and real raw-loopback behavioral tests. Existing TerminalConsoleCache listener warnings appear in unrelated TUI tests and do not affect this phase verdict.

### Human Verification Required

None. Every behavior-dependent Phase 104 truth has automated behavioral evidence, including cancellation/rollback, restart/idempotency, authenticated transport, replay/gap recovery, real network backpressure, cleanup, and timeout/recovery.

### Gaps Summary

No gaps remain. Plans 104-07 through 104-09 close all four prior production-boundary failures, and focused, full-suite, type, dependency, and release checks pass.

---

_Verified: 2026-07-11T13:00:51Z_
_Verifier: the agent (gsd-verifier)_
