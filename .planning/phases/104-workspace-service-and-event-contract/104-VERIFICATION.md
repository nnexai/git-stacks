---
phase: 104-workspace-service-and-event-contract
verified: 2026-07-11T12:18:44Z
status: gaps_found
score: 15/20 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Operation and attention events share one durable service-wide monotonic cursor and are appended before live publication (D-14)."
    status: failed
    reason: "The managed service wires operation publication into the journal but never configures messages.ts attention publication, so real attention messages do not enter the service journal or SSE stream."
    artifacts:
      - path: "src/service/main.ts"
        issue: "Constructs the journal and broker but never calls configureAttentionPublication."
      - path: "src/lib/messages.ts"
        issue: "Attention publication is optional global state and remains undefined in production service composition."
    missing:
      - "Configure and clean up attention publication in the managed service, resolving workspace names to stable IDs and appending through EventJournal before broker publication."
      - "Add a real transport test proving attention and operation events interleave in one cursor stream."
  - truth: "Retention is bounded by seven days and 64 MiB; stale cursors return replay_gap with earliest cursor and authoritative snapshot revision (D-15, D-16)."
    status: partial
    reason: "Retention and cursor bounds are implemented, but production constructs EventJournal without a snapshotRevision provider, so replay gaps report the hard-coded default revision 0 rather than the current authoritative snapshot revision."
    artifacts:
      - path: "src/service/main.ts"
        issue: "new EventJournal({ root: serviceRoot }) omits snapshotRevision."
      - path: "src/lib/service/event-journal.ts"
        issue: "The omitted provider defaults to () => '0'."
    missing:
      - "Inject the authoritative snapshot revision provider into the production EventJournal composition."
      - "Exercise an HTTP replay-gap response after a nonzero snapshot revision."
  - truth: "Each SSE subscriber is bounded by 256 events and 1 MiB, and a slow network client is disconnected without allowing service memory to grow without bound (D-17, EVT-05)."
    status: failed
    reason: "The broker queue is bounded, but the HTTP adapter continuously drains it into ReadableStream via controller.enqueue without checking desiredSize or otherwise applying a bounded transport buffer. A slow socket therefore moves queued events into an unbounded stream queue and never triggers broker overflow."
    artifacts:
      - path: "src/service/server.ts"
        issue: "The for-await loop enqueues every event regardless of ReadableStream backpressure."
      - path: "tests/service/events.test.ts"
        issue: "The supposed end-to-end event suite only checks three exported constants; it never opens SSE, stalls a reader, or proves disconnect/cleanup."
    missing:
      - "Couple SSE delivery to a bounded network-facing queue/backpressure signal so broker limits remain effective through the real transport."
      - "Add real loopback SSE overflow and cleanup tests for both event and byte limits."
  - truth: "Ordinary authenticated requests enforce a 30-second processing deadline and timed-out requests are rejected while valid requests continue to work (SVC-05)."
    status: failed
    reason: "server.timeout(request, 30) and idleTimeout configure socket inactivity, but handlers await snapshot/operation work without an execution deadline, abort race, or timeout error mapping. The security test only asserts the exported constant."
    artifacts:
      - path: "src/service/server.ts"
        issue: "No handler deadline wraps buildAll, buildWorkspace, submit, get, or cancel."
      - path: "tests/service/security.test.ts"
        issue: "No slow-handler transport test exists; timeout coverage is a constant assertion."
    missing:
      - "Enforce an injectable ordinary-handler deadline with a stable non-sensitive timeout response."
      - "Add a real loopback test with a stalled injected adapter and a subsequent successful request."
---

# Phase 104: Workspace Service and Event Contract Verification Report

**Phase Goal:** Native clients can securely consume authoritative workspace state, resolved execution context, asynchronous operations, and structured events through a versioned local contract.
**Verified:** 2026-07-11T12:18:44Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Strict v1 discovery, envelopes, capabilities, entities, launches, operations, cursors, and events validate. | VERIFIED | `contract.ts`; golden fixture and strict-rejection tests pass. |
| 2 | Workspace/repository IDs survive rename and legacy migration without breaking name callers. | VERIFIED | `identity.ts`; persistence, rename, and symlink tests pass. |
| 3 | Golden fixtures contain only declared contract fields. | VERIFIED | Exact round-trip tests pass. |
| 4 | Snapshots are internally consistent aggregates. | VERIFIED | Bounded fingerprint retry and mixed-generation rejection tests pass. |
| 5 | Revisions are monotonic, projection-based, durable, and timestamped. | VERIFIED | Snapshot revision tests pass. |
| 6 | Launch specs expose authoritative cwd, ports, steps, and safe environment data without secrets. | VERIFIED | Launch-context tests pass, including secret omission. |
| 7 | Official clients receive isolated, revocable, protected credentials automatically. | VERIFIED | Credential provisioning/revocation tests pass. |
| 8 | Authentication failures are generic and occur before detailed routing. | VERIFIED | Real loopback unauthenticated-route test and admission tests pass. |
| 9 | Credential storage rejects unsafe permission and symlink layouts. | VERIFIED | Credential filesystem boundary tests pass. |
| 10 | Mutations are durably accepted and transition to exactly one terminal state. | VERIFIED | Operation lifecycle/restart tests pass. |
| 11 | Progress and cooperative cancellation report completed work and rollback outcome. | VERIFIED | Named cancellation/rollback behavioral test passes. |
| 12 | Credential-scoped equivalent retries deduplicate across concurrency/restart and conflicts reject. | VERIFIED | Idempotency behavioral tests pass. |
| 13 | Operation transitions append before observation/live publication. | VERIFIED | Append-first and append-failure tests pass. |
| 14 | Operation and attention events share the production journal. | FAILED | Operations are wired in `main.ts`; `configureAttentionPublication` is never called. |
| 15 | Journal retention is dual-bounded and stale cursors include authoritative snapshot revision. | FAILED | Compaction passes, but production replay-gap revision defaults to `0`. |
| 16 | Broker subscriptions are bounded and nonblocking. | VERIFIED | Broker-level event/byte cap, handoff, isolation, and latency tests pass. |
| 17 | Official client starts/discovers an authenticated random-port loopback service. | VERIFIED | Real loopback discovery and protected descriptor tests pass. |
| 18 | Body, rate, timeout, SSE, and connection admission limits work through transport. | FAILED | Body/rate/connection paths exist, but request execution timeout is absent and tests only assert constants. |
| 19 | Snapshot, operation, cancellation, idempotency, replay, gap, and overflow work end to end. | FAILED | Transport operation/event suites do not exercise these flows; concrete replay-revision and SSE-buffer wiring defects exist. |
| 20 | Five-minute idle exit requires zero clients and zero active operations. | VERIFIED | Injected timer state-transition test passes and production lifecycle observes both counts. |

**Score:** 15/20 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/lib/service/contract.ts` | Strict v1 wire contract | VERIFIED | Substantive, fixture-backed, imported by service modules. |
| `src/lib/service/identity.ts` | Stable lazy identity migration | VERIFIED | Substantive and used by snapshot production adapter. |
| `src/lib/service/snapshot.ts` | Aggregate authoritative snapshots | VERIFIED | Substantive, production-wired, behavior-tested. |
| `src/lib/service/credentials.ts` | Protected per-client admission | VERIFIED | Substantive and server-wired. |
| `src/lib/service/operations.ts` | Durable operations/idempotency | VERIFIED | Substantive and managed-service/server-wired. |
| `src/lib/service/event-journal.ts` | Ordered durable replay journal | PARTIAL | Substantive, but production lacks authoritative revision provider. |
| `src/lib/service/event-broker.ts` | Bounded live mailboxes | PARTIAL | Core is bounded; HTTP stream drains it into an unbounded downstream queue. |
| `src/service/server.ts` | Authenticated bounded HTTP/SSE adapter | FAILED | Missing handler deadline and effective SSE backpressure bound. |
| `src/service/main.ts` | Discovery and lifecycle composition | PARTIAL | Does not wire attention publication or snapshot revision into journal. |
| `tests/service/events.test.ts` | End-to-end replay/live/overflow proof | STUB | Ten lines; asserts constants only. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `identity.ts` | `config.ts` | validated reads/writes | WIRED | Optional IDs and atomic migration use config schemas. |
| `snapshot.ts` | identity/command/env/status modules | authoritative projection | WIRED | Production adapters call shared engine functions. |
| `operations.ts` | `event-journal.ts` | injected publisher | WIRED | Managed service injects append-then-broker publisher. |
| `messages.ts` | `event-journal.ts` | attention publisher | NOT_WIRED | Optional publisher is never configured by the service. |
| `server.ts` | snapshots/operations/broker | authenticated routes | PARTIAL | Routes exist, but transport resource semantics have the gaps above. |
| `event-journal.ts` | snapshot revision | replay-gap metadata | NOT_WIRED | Production uses default `0`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase-focused service behavior | `bun test tests/lib/service/... tests/service/...` | 48 pass, 0 fail | PASS |
| Full CLI/OpenTUI compatibility | `bun run test -- --workers 8` | 749 unit tests and 85/85 integration files pass | PASS |
| Static type safety | `bun run typecheck` | exit 0 | PASS |
| Dependency graph | `bun run test:deps` | no circular dependencies | PASS |
| Release gates | `bun run verify:gates` | inventory, mappings, coverage artifacts aligned | PASS |

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| SVC-01 | SATISFIED | Versioned authenticated discovery works over loopback. |
| SVC-02 | SATISFIED | Stable identity and snapshot tests pass. |
| SVC-03 | SATISFIED | Resolved secret-safe launch projections pass. |
| SVC-04 | SATISFIED | Full CLI/OpenTUI suite passes. |
| SVC-05 | BLOCKED | Authentication/body/rate scaffolding exists, but ordinary processing deadline is not enforced. |
| EVT-01 | SATISFIED | Durable asynchronous lifecycle and progress tests pass. |
| EVT-02 | SATISFIED | Idempotency concurrency/restart/conflict tests pass. |
| EVT-03 | BLOCKED | Production attention publication is not connected to the shared journal/SSE. |
| EVT-04 | BLOCKED | Replay works, but production replay-gap rebuild metadata reports revision `0`. |
| EVT-05 | BLOCKED | Broker is bounded in isolation; real SSE streaming bypasses that bound through an unbounded stream queue. |

### Anti-Patterns Found

No unreferenced `TBD`, `FIXME`, or `XXX` markers were found in Phase 104 source files. The principal anti-pattern is assertion-only transport coverage: `tests/service/events.test.ts` and most of `tests/service/operations.test.ts` prove exports/constants rather than the promised end-to-end behavior.

### Gaps Summary

The service core is substantial and its focused unit tests are green, and existing CLI/OpenTUI compatibility is preserved. The phase goal is nevertheless not achieved at the real local-contract boundary: attention messages are not composed into the journal, replay gaps cannot name the authoritative snapshot revision, slow network consumers can bypass broker bounds through the stream adapter, and ordinary handler execution has no enforced deadline. These are Phase 104 contract/security/resource-bound requirements, not work deferred to Phases 105-107.

---

_Verified: 2026-07-11T12:18:44Z_
_Verifier: the agent (gsd-verifier)_
