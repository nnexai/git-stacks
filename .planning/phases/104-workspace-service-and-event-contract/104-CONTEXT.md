# Phase 104: Workspace Service and Event Contract - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a secure, versioned, same-machine `/v1` service contract through which paired native clients consume authoritative aggregate workspace state, resolved launch context, asynchronous mutations, and structured replayable events. git-stacks remains the authoritative workspace engine; existing CLI and OpenTUI behavior stays compatible, and native clients never parse or mutate workspace YAML directly.

</domain>

<decisions>
## Implementation Decisions

### Snapshot and Identity Contract
- **D-01:** A workspace query returns one internally consistent aggregate snapshot containing the workspace, repositories, named commands, and resolved launch contexts.
- **D-02:** Workspace and repository identities are opaque and stable across renames; display names and paths may change without changing identity.
- **D-03:** Every aggregate snapshot carries an opaque monotonic revision for correctness plus a timestamp for diagnostics and display.
- **D-04:** `/v1` capability discovery is explicit. Unsupported optional capabilities produce a structured `capability_unavailable` response while the rest of the compatible contract remains usable; unsupported data is never silently omitted.

### Pairing and Local Security
- **D-05:** Phase 104 supports same-machine access only. Keep the `/v1` application payload contract transport-neutral enough that remote transport could be added in a future phase, but do not add remote connectivity now.
- **D-06:** Official clients discover an automatically provisioned user-scoped credential from a protected git-stacks config/runtime location. Initial setup requires no pairing prompt or manual command.
- **D-07:** An official client starts the service on demand. The service may exit after an idle period only when no clients are connected and no operations remain active.
- **D-08:** Each installed client receives its own revocable credential rather than sharing a user-wide secret or rotating on every service run.
- **D-09:** Authenticated clients receive stable structured error codes and non-sensitive diagnostics. Unauthenticated callers receive only a generic rejection.

### Operation Lifecycle
- **D-10:** Every asynchronous mutation follows `accepted -> running -> succeeded | failed | cancelled`, with timestamps, structured progress, and a terminal result or structured error.
- **D-11:** Progress uses stable machine-readable stage codes, human-readable messages, and completed/total counts when exact counts exist. Do not fabricate percentages.
- **D-12:** Reusing an idempotency key with an equivalent request returns the original operation. Reusing the key with different input returns a structured conflict. Deduplication remains valid after the operation reaches a terminal state for the configured retention window.
- **D-13:** Cancellation is cooperative at safe boundaries. The terminal result must identify completed work and whether rollback occurred; cancellation does not promise perfect restoration.

### Event Replay and Gaps
- **D-14:** All retained operation and attention events share one service-wide monotonically increasing sequence and replay cursor.
- **D-15:** Recent event history persists across service restarts in a bounded durable journal constrained by both age and size.
- **D-16:** A cursor older than retained history is rejected with structured `replay_gap` metadata containing the earliest available cursor and current authoritative snapshot revision. Clients rebuild from snapshots before reconnecting at the new boundary.
- **D-17:** Each SSE client has a bounded queue. A slow client is disconnected with its last safely delivered cursor and must replay or rebuild on reconnect; events are never silently dropped and producers are not blocked by a consumer.

### the agent's Discretion
- Choose the concrete local transport, protected credential file layout, service discovery mechanism, and idle timeout while preserving same-machine-only access and automatic setup.
- Define numeric request-size, rate, timeout, journal age/size, operation-result retention, and per-client queue limits from research and tests.
- Define exact endpoint paths, schema field names, error envelope, cursor encoding, capability identifiers, and persistence format consistent with the locked semantics above.
- Decide how stable opaque IDs are introduced for existing name-based YAML entities without changing CLI/OpenTUI behavior or requiring native clients to read YAML.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Scope and Contract
- `.planning/PROJECT.md` — Defines the v0.20.0 native-client goal, ownership boundary, and compatibility requirements.
- `.planning/REQUIREMENTS.md` — Defines SVC-01 through SVC-05 and EVT-01 through EVT-05, plus milestone-wide exclusions.
- `.planning/ROADMAP.md` — Defines the Phase 104 goal, fixed boundary, and five success criteria.

### Existing Architecture Maps
- `.planning/codebase/ARCHITECTURE.md` — Documents current workspace lifecycle, configuration, environment, operation, and notification flows.
- `.planning/codebase/INTEGRATIONS.md` — Documents the existing local socket notification path, config storage, subprocess boundaries, and external integrations.
- `.planning/codebase/TESTING.md` — Defines the custom isolated test runner and fixture patterns that Phase 104 verification must preserve.

No external protocol specification or ADR was referenced during discussion.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/config.ts`: authoritative Zod schemas plus indexed workspace/template reads; service snapshots should adapt these models rather than expose YAML or filesystem layout.
- `src/lib/workspace-status.ts` and `src/lib/workspace-file-status.ts`: existing query models for repository and file state.
- `src/lib/workspace-env.ts` and `src/lib/ports.ts`: authoritative environment and port resolution needed for resolved launch specifications.
- `src/lib/operation-runner.ts`: existing progress and rollback vocabulary that can seed the asynchronous operation adapter.
- `src/lib/messages.ts`: durable JSONL attention records and best-effort Unix-socket delivery provide migration inputs, but not the final authenticated/replayable event contract.

### Established Patterns
- Business logic lives in `src/lib/`; Commander commands and OpenTUI are adapters over shared functions. The new service must be another adapter, not a second workspace engine.
- Schemas use Zod at trust boundaries, subprocess execution has injectable seams, and filesystem writes favor explicit validation and bounded behavior.
- Existing CLI/OpenTUI stdout, stderr, and workflow semantics are compatibility constraints.
- Tests that use module mocks run in isolated processes through `scripts/test-runner.ts`; broad verification must use project scripts rather than `bun test tests/`.

### Integration Points
- Extract stable service-facing view models from current config/status/env/ports/command resolution without exposing internal YAML schemas.
- Route long-running lifecycle and Git mutations through an operation registry while preserving the existing direct CLI/OpenTUI call paths.
- Replace or adapt the current unauthenticated `/tmp/git-stacks.sock` notification push with the authenticated event publisher and durable replay journal.
- Add a client-managed service entry point and capability/version negotiation without making the native client responsible for workspace process or YAML ownership.

</code_context>

<specifics>
## Specific Ideas

- Optimize same-machine setup for simplicity: official clients should connect automatically without a pairing ceremony.
- Keep future remote support possible at the application-contract level only; remote transport and its threat model are explicitly not part of this phase.
- Prefer explicit recovery over apparent continuity: replay gaps, unsupported capabilities, partial cancellation, and slow-consumer disconnects must all be visible and machine-readable.

</specifics>

<deferred>
## Deferred Ideas

- Remote client connections — future phase requiring a separate transport and threat model.

### Reviewed Todos (not folded)
- **Add manual workspace commands** — already represented by the existing command model; expanding command authoring is outside the service-contract phase.
- **Add workspace notes** — product capability outside the Phase 104 service and event boundary.
- **Add workspace stale view** — UI behavior belongs in a client/UI phase, not the foundational service contract.
- **Create workspace from forge source** — workspace-creation product breadth is outside this phase.
- **Plan broader code quality improvement run** — unrelated completed planning stream from the prior milestone.
- **Improve TUI dashboard experience** — existing OpenTUI changes are explicitly outside the additive native service scope.

</deferred>

---

*Phase: 104-workspace-service-and-event-contract*
*Context gathered: 2026-07-11*
