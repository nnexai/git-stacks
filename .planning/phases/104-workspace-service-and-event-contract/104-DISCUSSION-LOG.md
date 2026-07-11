# Phase 104: Workspace Service and Event Contract - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-11
**Phase:** 104-workspace-service-and-event-contract
**Areas discussed:** Snapshot and identity contract, Pairing and local security, Operation lifecycle, Event replay and gaps

---

## Snapshot and Identity Contract

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Snapshot shape | Aggregate snapshot; summary then details; separate resources | Aggregate snapshot |
| Rename behavior | Stable IDs; name-derived IDs; stable workspace IDs only | Stable IDs |
| Freshness | Revision plus timestamp; content token; events only | Revision plus timestamp |
| Missing capability | Explicit degradation; exact-set rejection; silent omission | Explicit degradation |

**User's choice:** Selected the recommended explicit, aggregate contract in all four questions.
**Notes:** Opaque workspace and repository identities survive renames; unsupported optional capabilities remain visible through structured errors.

---

## Pairing and Local Security

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Connectivity scope | Same-machine now with transport-neutral payloads; remote support | Same-machine only for Phase 104 |
| Bootstrap | Automatic protected credential; one-click approval; CLI command | Automatic protected credential |
| Service lifecycle | Client-managed on demand; login service; manual lifecycle | Client-managed on demand |
| Credential scope | Per installed client; per OS user; per service run | Per installed client |
| Rejection detail | Safe structured authenticated errors; uniform minimal; detailed for all | Safe structured authenticated errors |

**User's choice:** Local-only service with the simplest automatic connection setup.
**Notes:** Remote connections were considered and deferred. The application payload contract should not unnecessarily prevent a future remote transport.

---

## Operation Lifecycle

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| States | Explicit finite lifecycle; minimal lifecycle; operation-specific states | Explicit finite lifecycle |
| Progress | Stages and optional counts; universal percentage; messages only | Stages and optional counts |
| Idempotency reuse | Return original/conflict on mismatch; reject reuse; dedupe only while running | Return original/conflict on mismatch |
| Cancellation | Cooperative safe boundaries; guaranteed rollback; no cancellation | Cooperative safe boundaries |

**User's choice:** Selected a uniform, inspectable operation contract in all four questions.
**Notes:** Partial work and rollback outcome must be explicit; percentages must not be invented.

---

## Event Replay and Gaps

| Decision | Options considered | Selected |
|----------|--------------------|----------|
| Ordering | Service-wide sequence; per-workspace; per-topic/operation | Service-wide sequence |
| Restart retention | Bounded durable journal; memory only; operations only | Bounded durable journal |
| Replay gap | Structured rejection metadata; start at earliest; start from now | Structured rejection metadata |
| Slow consumer | Bounded queue and disconnect; drop progress; block producers | Bounded queue and disconnect |

**User's choice:** Selected durable, explicit replay semantics in all four questions.
**Notes:** Clients recover from authoritative snapshots when history is unavailable; no event loss is hidden.

---

## the agent's Discretion

- Concrete transport and persistence choices, numeric bounds, endpoint/schema naming, and migration mechanics remain for research and planning.

## Deferred Ideas

- Remote connectivity and its expanded threat model.
- Six loosely matched pending todos were reviewed and not folded into Phase 104.
