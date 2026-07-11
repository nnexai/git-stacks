# Phase 104: Workspace Service and Event Contract - Research

**Researched:** 2026-07-11
**Domain:** Local authenticated HTTP service, aggregate workspace views, asynchronous operations, and durable SSE replay
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** A workspace query returns one internally consistent aggregate snapshot containing the workspace, repositories, named commands, and resolved launch contexts.
- **D-02:** Workspace and repository identities are opaque and stable across renames; display names and paths may change without changing identity.
- **D-03:** Every aggregate snapshot carries an opaque monotonic revision for correctness plus a timestamp for diagnostics and display.
- **D-04:** `/v1` capability discovery is explicit. Unsupported optional capabilities produce a structured `capability_unavailable` response while the rest of the compatible contract remains usable; unsupported data is never silently omitted.
- **D-05:** Phase 104 supports same-machine access only. Keep the `/v1` application payload contract transport-neutral enough that remote transport could be added in a future phase, but do not add remote connectivity now.
- **D-06:** Official clients discover an automatically provisioned user-scoped credential from a protected git-stacks config/runtime location. Initial setup requires no pairing prompt or manual command.
- **D-07:** An official client starts the service on demand. The service may exit after an idle period only when no clients are connected and no operations remain active.
- **D-08:** Each installed client receives its own revocable credential rather than sharing a user-wide secret or rotating on every service run.
- **D-09:** Authenticated clients receive stable structured error codes and non-sensitive diagnostics. Unauthenticated callers receive only a generic rejection.
- **D-10:** Every asynchronous mutation follows `accepted -> running -> succeeded | failed | cancelled`, with timestamps, structured progress, and a terminal result or structured error.
- **D-11:** Progress uses stable machine-readable stage codes, human-readable messages, and completed/total counts when exact counts exist. Do not fabricate percentages.
- **D-12:** Reusing an idempotency key with an equivalent request returns the original operation. Reusing the key with different input returns a structured conflict. Deduplication remains valid after the operation reaches a terminal state for the configured retention window.
- **D-13:** Cancellation is cooperative at safe boundaries. The terminal result must identify completed work and whether rollback occurred; cancellation does not promise perfect restoration.
- **D-14:** All retained operation and attention events share one service-wide monotonically increasing sequence and replay cursor.
- **D-15:** Recent event history persists across service restarts in a bounded durable journal constrained by both age and size.
- **D-16:** A cursor older than retained history is rejected with structured `replay_gap` metadata containing the earliest available cursor and current authoritative snapshot revision. Clients rebuild from snapshots before reconnecting at the new boundary.
- **D-17:** Each SSE client has a bounded queue. A slow client is disconnected with its last safely delivered cursor and must replay or rebuild on reconnect; events are never silently dropped and producers are not blocked by a consumer.

### the agent's Discretion
- Choose the concrete local transport, protected credential file layout, service discovery mechanism, and idle timeout while preserving same-machine-only access and automatic setup.
- Define numeric request-size, rate, timeout, journal age/size, operation-result retention, and per-client queue limits from research and tests.
- Define exact endpoint paths, schema field names, error envelope, cursor encoding, capability identifiers, and persistence format consistent with the locked semantics above.
- Decide how stable opaque IDs are introduced for existing name-based YAML entities without changing CLI/OpenTUI behavior or requiring native clients to read YAML.

### Deferred Ideas (OUT OF SCOPE)
- Remote client connections — future phase requiring a separate transport and threat model.

### Reviewed Todos (not folded)
- **Add manual workspace commands** — already represented by the existing command model; expanding command authoring is outside the service-contract phase.
- **Add workspace notes** — product capability outside the Phase 104 service and event boundary.
- **Add workspace stale view** — UI behavior belongs in a client/UI phase, not the foundational service contract.
- **Create workspace from forge source** — workspace-creation product breadth is outside this phase.
- **Plan broader code quality improvement run** — unrelated completed planning stream from the prior milestone.
- **Improve TUI dashboard experience** — existing OpenTUI changes are explicitly outside the additive native service scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SVC-01 | Native clients can negotiate a versioned `/v1` protocol and discover supported capabilities. | Defines discovery endpoint, schema version, capabilities, and explicit unavailable errors. |
| SVC-02 | Native clients can query workspace, repository, and named-command snapshots using stable opaque identities. | Defines persisted UUID identity migration and aggregate snapshot/revision algorithm. |
| SVC-03 | Native clients receive git-stacks-resolved launch specifications without reading workspace YAML. | Reuses workspace command, environment, paths, and port resolution behind service view models. |
| SVC-04 | Existing CLI and OpenTUI behavior remains compatible with the extracted service boundary. | Keeps `src/lib` authoritative and treats service as an additive adapter; includes compatibility tests. |
| SVC-05 | The local service accepts authenticated requests only from the paired native client and enforces bounded request, rate, and timeout policies. | Recommends loopback Bun HTTP, per-client bearer credentials, constant-time verification, and numeric bounds. |
| EVT-01 | Long-running workspace mutations return operation identities and structured progress without blocking ordinary queries. | Defines operation registry, state machine, event publication, and query/mutation separation. |
| EVT-02 | Retried mutations use idempotency keys so destructive work is not duplicated. | Defines canonical request hashing and durable idempotency records. |
| EVT-03 | Native clients receive ordered operation and agent-attention events over SSE. | Defines one sequenced durable journal and SSE event encoding. |
| EVT-04 | A reconnecting client can replay retained events or detect a gap and rebuild state from an authoritative snapshot. | Defines cursor semantics, replay boundary checks, and `replay_gap`. |
| EVT-05 | Slow or disconnected clients cannot create unbounded service memory or event queues. | Defines fixed queues, byte/event caps, disconnect metadata, and non-blocking publishers. |
</phase_requirements>

## Summary

Implement Phase 104 as a new adapter over existing `src/lib` workspace functions, not as a parallel engine. [VERIFIED: codebase inspection] Bun 1.3.14, Zod 4.3.6, the Fetch `Request`/`Response` model, atomic config writes, `workspace-command.ts`, `workspace-env.ts`, status models, and the existing compensation runner already supply the necessary primitives. [VERIFIED: package.json and source inspection] No new external package is needed.

Use a loopback-only HTTP/1.1 `Bun.serve` process with a runtime descriptor in the user config directory. Bun explicitly supports `hostname: "127.0.0.1"`, request body limits, per-request timeouts, and SSE streaming responses. [CITED: https://bun.com/reference/bun/Serve] [CITED: https://bun.com/docs/guides/http/sse] Persist per-client credentials, opaque entity IDs, operation/idempotency records, the snapshot revision counter, and an append-only event journal beneath `WS_CONFIG_DIR/service/`, with owner-only directory/file modes and atomic replacement. Use Zod schemas as the canonical wire contract and generate golden JSON fixtures for Phase 105.

The subtle compatibility requirement is mutations outside the service. Existing CLI/OpenTUI code must keep working directly, so the snapshot builder must read an internally consistent view and detect authoritative file changes even when no service mutation event fired. [VERIFIED: codebase inspection] Add optional persisted `id` fields to workspace/repository YAML objects through a lazy, atomic identity migration; names remain lookup/display fields. Compute a canonical aggregate digest and allocate a durable monotonic revision when the digest changes. Use pre/post file fingerprints with bounded retry so a snapshot never combines generations.

**Primary recommendation:** Build one schema-first local service core with thin Bun HTTP/SSE transport, durable metadata stores, and adapters to existing workspace functions; plan contract/persistence, snapshots/identity, operations, and transport/security as independently testable waves.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `/v1` discovery and wire schemas | API / Backend | Browser / Client | Service owns compatibility; clients decode the declared contract. |
| Aggregate workspace snapshot | API / Backend | Database / Storage | Service adapts authoritative YAML/status/env models; storage supplies persistence. |
| Stable identities and revision | Database / Storage | API / Backend | IDs/counters must survive process and rename; API exposes opaque values. |
| Authentication and bounds | API / Backend | Database / Storage | Request admission is server-owned; credentials and rate metadata are persisted/protected. |
| Async operations | API / Backend | Database / Storage | Registry orchestrates business logic and persists terminal/idempotency records. |
| Ordered event replay | Database / Storage | API / Backend | Durable sequence/journal establishes order; SSE transports retained/live events. |
| Native client startup/discovery | Browser / Client | API / Backend | Installed client launches process and reads descriptor; service publishes readiness. |

## Standard Stack

### Core
| Library/runtime | Version | Purpose | Why Standard |
|-----------------|---------|---------|--------------|
| Bun | 1.3.14 installed | Loopback HTTP server, Fetch API, streams, runtime | Existing project runtime; `Bun.serve` provides loopback binding, body limits, timeouts, and streaming. [VERIFIED: local CLI] [CITED: https://bun.com/docs/runtime/http/server] |
| Zod | ^4.3.6 | Strict request/response/event schemas and inferred TypeScript types | Existing trust-boundary convention; discriminated unions fit stable operation/error/event variants. [VERIFIED: package.json] [CITED: https://zod.dev/api?id=discriminated-unions] |
| Node built-ins (`crypto`, `fs`, `path`) | Bun-compatible | Credentials, hashes, timing-safe comparison, protected atomic files | Already available; `randomBytes` and `timingSafeEqual` are documented for secret material. [CITED: https://nodejs.org/api/crypto.html] |

### Supporting
| Existing module | Purpose | When to Use |
|-----------------|---------|-------------|
| `src/lib/config.ts` | Authoritative validated workspace models and atomic YAML writes | Snapshot reads and lazy ID migration. [VERIFIED: codebase inspection] |
| `src/lib/workspace-command.ts` + `workspace-env.ts` | Resolve command cwd, shell, environment, ports, and repo context | Produce launch specifications; do not expose raw YAML. [VERIFIED: codebase inspection] |
| `src/lib/workspace-status.ts` and `workspace-file-status.ts` | Current repository/workspace status projections | Populate aggregate views. [VERIFIED: codebase inspection] |
| `src/lib/operation-runner.ts` | LIFO compensation and rollback reporting | Adapt safe mutation boundaries; do not treat its string callback as the final event schema. [VERIFIED: codebase inspection] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Loopback HTTP | Unix domain HTTP socket | Strong filesystem admission, but worse cross-platform client interoperability and discovery; bearer auth is still required by D-08. |
| JSONL journal + compact index | SQLite | Better transactional querying, but adds a dependency and migration surface unnecessary for a bounded sequential log. |
| Persist IDs in YAML | Sidecar name-to-ID map | Avoids YAML additions but rename correctness depends on every rename path updating a second map; optional schema fields are safer and remain CLI-compatible. |

**Installation:** None. This phase should add no package.

## Package Legitimacy Audit

Not applicable: no external package installation is recommended.

## Architecture Patterns

### System Architecture Diagram

```text
Official client
  -> reads protected service descriptor + its credential
  -> starts service on demand if descriptor is stale/missing
  -> HTTP request to 127.0.0.1 random port
       -> generic authentication rejection
       -> per-client rate/body/timeout admission
       -> strict /v1 route schema
          -> query: consistent snapshot builder
               -> existing config/status/env/ports/command modules
               -> identity migration + digest/revision store
          -> mutation: idempotency registry -> operation registry -> existing workspace functions
               -> structured progress/terminal result
               -> durable sequenced journal
          -> events: validate cursor -> replay journal -> bounded live queue -> SSE
               -> gap? structured replay_gap -> client rebuilds from snapshot
               -> slow? disconnect with last delivered cursor -> replay on reconnect
```

### Recommended Project Structure

```text
src/
├── lib/service/
│   ├── contract.ts          # Zod wire schemas, codes, capability constants
│   ├── snapshot.ts          # aggregate adapter, consistency retry, revision
│   ├── identity.ts          # persisted opaque ID migration
│   ├── credentials.ts       # provisioning, revocation, constant-time auth
│   ├── operations.ts        # registry, state machine, cancellation, idempotency
│   ├── event-journal.ts     # append/replay/retention/sequence
│   └── event-broker.ts      # bounded per-client queues
├── service/
│   ├── server.ts            # Bun HTTP/SSE adapter and admission policies
│   └── main.ts              # lifecycle, descriptor, idle shutdown
└── commands/service.ts      # internal/client-managed start/status surface
tests/
├── lib/service/             # deterministic unit/contract tests
├── service/                 # loopback integration tests
└── fixtures/service-v1/     # golden JSON contract fixtures
```

### Pattern 1: Schema-First Envelope
**What:** Every success/error/event shape is a strict Zod schema. Use a stable envelope such as `{ protocol: "v1", request_id, data }` or `{ protocol: "v1", request_id, error: { code, message?, details? } }`; never serialize raw `Error` objects. [CITED: https://zod.dev/api?id=discriminated-unions]
**When to use:** Every trust boundary and persisted journal record.

```typescript
const ApiErrorSchema = z.strictObject({
  protocol: z.literal("v1"),
  request_id: z.string(),
  error: z.strictObject({
    code: z.enum(["invalid_request", "capability_unavailable", "replay_gap"]),
    message: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
})
// Source: Zod object/discriminated-union APIs and project Zod convention.
```

### Pattern 2: Consistent Snapshot with Change Detection
**What:** Enumerate relevant files, record metadata/content hashes, parse and resolve the full aggregate, then recheck fingerprints. Retry on change; after a small bound return `snapshot_busy`, never a mixed snapshot. Canonically hash the API projection excluding diagnostic timestamp. Under a metadata lock, return the existing revision for the same digest or increment/persist the counter for a changed digest.
**When to use:** Every snapshot request and before returning `replay_gap` metadata.

### Pattern 3: Durable Write-Ahead Event Publication
**What:** Allocate sequence and append a validated journal record before offering it to live queues. One serialized writer establishes service-wide order. A live notification is only an optimization; the journal is truth.
**When to use:** Operation transition/progress and attention publication.

### Pattern 4: Idempotency as Credential-Scoped Request Identity
**What:** Key by `(client_id, endpoint, idempotency_key)` and store a canonical request hash plus operation ID before execution. Same hash returns the operation; different hash returns `idempotency_conflict`. Persist terminal entries until retention expiry.
**When to use:** Every mutation endpoint.

### Pattern 5: Bounded Subscriber Mailbox
**What:** Each SSE connection owns a queue capped by both event count and encoded bytes. Journal producers enqueue without awaiting consumers. On overflow, close the stream after emitting/recording a final control reason when possible; retain `last_delivered_cursor` server-side only as diagnostic, while the client reconnects with its own last received event ID.
**When to use:** Live tail after replay catches up.

### Recommended `/v1` Surface

| Method/path | Contract |
|-------------|----------|
| `GET /v1` | Protocol metadata, server instance ID, capability map, limits. |
| `GET /v1/snapshot` | All-workspace aggregate, revision, generated timestamp. |
| `GET /v1/workspaces/:workspace_id` | One internally consistent aggregate workspace snapshot. |
| `POST /v1/operations/:mutation` | Requires `Idempotency-Key`; returns `202` operation. |
| `GET /v1/operations/:operation_id` | Current/terminal operation record. |
| `POST /v1/operations/:operation_id/cancel` | Requests cooperative cancellation. |
| `GET /v1/events?cursor=<opaque>` | Replay then live SSE; `id:` carries opaque encoded sequence. |

### Recommended Numeric Policies

| Policy | Default | Verification rationale |
|--------|---------|------------------------|
| Request body | 256 KiB | Mutations are identifiers/options, not file upload; test exact boundary and `413`. Bun exposes `maxRequestBodySize`. [CITED: https://bun.com/reference/bun/Serve/BaseServeOptions/maxRequestBodySize] |
| Authenticated rate | token bucket 60 requests/minute, burst 20 per credential; SSE connection excluded after admission | Ample for interactive clients while bounding loops; fake-clock tests prove refill/isolation. |
| Ordinary request timeout | 30 seconds | Queries should be short; mutations return `202`; test timeout mapping. |
| Snapshot consistency retries | 3 | Prevent livelock under active legacy mutation; test injected fingerprint changes. |
| Service idle exit | 5 minutes | Fast on-demand restart, but only with zero clients and zero nonterminal operations. |
| Journal retention | 7 days and 64 MiB, whichever boundary removes events first | Bounded disk with useful reconnect window; tests use tiny injected limits. |
| Operation/idempotency retention | 24 hours after terminal state and max 10,000 terminal records | Covers practical retries while bounding storage; active operations never evicted. |
| SSE client queue | 256 events and 1 MiB encoded bytes | Dual limit handles many small or few large events; test both overflow paths. |
| SSE heartbeat | 15 seconds | Keeps intermediaries/idle detection observable; Bun requires disabling per-request idle timeout for long-lived SSE. [CITED: https://bun.com/docs/guides/http/sse] |
| Connected SSE clients | 8 per credential, 32 service-wide | Prevents connection fan-out; test admission and cleanup. |

All limits must be exported constants with dependency-injected overrides for deterministic boundary tests. [VERIFIED: project test-seam convention]

### Anti-Patterns to Avoid
- **Deriving IDs from names or paths:** breaks D-02 on rename. Persist random IDs in the authoritative entity records.
- **Incrementing revision only in service mutations:** misses CLI/OpenTUI changes. Derive change from the aggregate API projection.
- **Using filesystem watch as correctness:** watchers coalesce/miss changes; use them only to invalidate caches.
- **Publishing before durable append:** creates unreplayable events after a crash.
- **One global SSE array with no byte cap:** violates EVT-05.
- **Holding snapshot/config locks while running mutations:** blocks ordinary queries and risks deadlock.
- **Returning resolved secrets:** launch specs may include sensitive env. Define an explicit allow/redaction policy; credentials do not justify leaking secret values.
- **Reusing `/tmp/git-stacks.sock`:** current path is unauthenticated, fixed, best-effort, and silently drops delivery. [VERIFIED: `src/lib/messages.ts`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP parser/server | Raw TCP HTTP parsing | `Bun.serve` | Correct parsing, request limits, timeout controls, Fetch streams. |
| Secret generation/comparison | Random strings or `===` | `crypto.randomBytes` and equal-length `timingSafeEqual` | Standard CSPRNG and timing-safe primitive. [CITED: https://nodejs.org/api/crypto.html] |
| Contract validation | Type assertions/manual property checks | Existing Zod 4 | Runtime validation and inferred types. |
| Workspace resolution | Reparse YAML in service routes | Existing config/status/env/command modules | Preserves authoritative semantics and CLI compatibility. |
| Event delivery truth | In-memory EventEmitter only | Durable journal plus bounded broker | Replay and restart guarantees require persistence. |

**Key insight:** Hand-roll only the small domain-specific registries/journal because the repository already owns its filesystem model; reuse runtime and validation primitives for protocol/security mechanics.

## Runtime State Inventory

This phase is an additive service-boundary refactor/migration.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Workspace YAML currently uses names as identity; message JSONL stores workspace names. | Add optional UUID `id` to workspace and repo schemas and lazily persist missing IDs atomically. Preserve legacy message files as input; publish new structured attention events without destructive migration. |
| Live service config | No existing daemon/service registry; current TUI socket state exists only while OpenTUI runs. [VERIFIED: codebase inspection] | Create protected service descriptor/credential registry; stale descriptor detection must be tested. |
| OS-registered state | No service manager registration is required; client starts process on demand. | None; avoid systemd/launchd scope in Phase 104. |
| Secrets/env vars | `GIT_STACKS_CONFIG_DIR` changes config root; workspace secret resolvers can materialize secret env values. | Honor isolated config root. Never journal/log credentials or resolved secrets; define launch-env redaction/allow policy. |
| Build artifacts | Package currently exposes `src/index.ts`; installed clients need a discoverable service entry point later. | Add source/bin entry compatible with packaging, but Phase 104 tests can spawn via Bun. No existing artifact migration. |

## Common Pitfalls

### Pitfall 1: A Snapshot That Is Aggregated but Not Consistent
**What goes wrong:** workspace YAML, status, commands, and launch contexts represent different moments.
**Why it happens:** multiple reads race with CLI atomic replacements or Git changes.
**How to avoid:** fingerprint before/after, retry, hash the final projection, and return explicit busy error after the bound.
**Warning signs:** revision unchanged while fields disagree, flaky cross-field invariants.

### Pitfall 2: Idempotency Record Written Too Late
**What goes wrong:** a retry starts duplicate destructive work.
**Why it happens:** operation execution begins before durable key reservation.
**How to avoid:** serialize reservation and operation creation before scheduling work; recover accepted/running records on restart as failed/interrupted unless resumability is explicitly implemented.
**Warning signs:** two operation IDs for one credential/key.

### Pitfall 3: SSE Replay/Live Race
**What goes wrong:** events appended between replay query and subscriber registration are skipped or duplicated.
**Why it happens:** two-phase handoff without a high-water mark.
**How to avoid:** register subscriber under journal serialization, capture high-water cursor, replay through it, then drain queued later events; clients/reducer should also tolerate duplicate cursors defensively.
**Warning signs:** gaps under concurrent publisher integration test.

### Pitfall 4: Credential File Permissions Are Assumed
**What goes wrong:** umask, pre-existing files, symlinks, or parent-directory permissions expose credentials.
**Why it happens:** relying only on `writeFile({mode})`.
**How to avoid:** create owner-only directory, reject symlinks/non-owned files where supported, open with exclusive flags for creation, chmod existing files, atomic replace metadata, and validate permissions on startup.
**Warning signs:** credential readable by group/other or accepted from an unexpected path.

### Pitfall 5: Cancellation Overpromises Rollback
**What goes wrong:** UI reports cancelled/restored while subprocess work continued or partial work remains.
**Why it happens:** cancellation checked only at operation start or conflated with rollback success.
**How to avoid:** cancellation token checks between safe steps, explicit `completed_work`, `rollback_attempted`, `rollback_succeeded`, and terminal `cancelled` result.
**Warning signs:** terminal state lacks partial-work detail.

### Pitfall 6: Unauthenticated Error Oracle
**What goes wrong:** route existence, credential IDs, service version, or rate state leaks.
**Why it happens:** routing/validation before authentication.
**How to avoid:** authenticate first for every `/v1` route and return the same generic status/body for missing, malformed, revoked, or unknown credentials.
**Warning signs:** distinct unauthenticated response bodies/timings in tests.

## Code Examples

### Loopback Server and SSE Timeout
```typescript
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  maxRequestBodySize: 256 * 1024,
  async fetch(req, server) {
    if (new URL(req.url).pathname === "/v1/events") {
      server.timeout(req, 0)
      return new Response(makeBoundedEventStream(), {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      })
    }
    server.timeout(req, 30)
    return routeV1(req)
  },
})
// Sources: https://bun.com/reference/bun/Serve and https://bun.com/docs/guides/http/sse
```

### Equal-Length Credential Check
```typescript
function matchesToken(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8")
  const b = Buffer.from(expected, "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}
// Source: https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b
```

### SSE Record
```text
id: eyJzZXEiOiIxMjM0In0
event: operation.progress
data: {"schema":"v1","sequence":"1234","operation_id":"...","stage":"repo.fetch","message":"Fetching repository","completed":2,"total":5}

```
Cursor encoding is opaque to clients; internally store sequence as a decimal string/`bigint`, not a JavaScript `number`, to avoid long-run precision loss.

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Best-effort unauthenticated Unix socket push | Authenticated loopback HTTP + durable replayable SSE | Native clients get recovery and bounded delivery. |
| Name as canonical identity | Persisted opaque UUID plus mutable display name/path | Rename-safe shared model. |
| String progress callback | Versioned stage/result schemas | Cross-language clients can reduce state reliably. |
| Direct blocking CLI mutation | Accepted operation + registry + progress events | Queries remain responsive and retries deduplicate. |

**Deprecated/outdated:**
- `/tmp/git-stacks.sock` is migration input only, not the Phase 104 service contract. [VERIFIED: codebase inspection]
- `MessageRecord { workspace, text, from?, timestamp }` is insufficient for typed attention identity/replay; retain CLI compatibility while adapting publication. [VERIFIED: codebase inspection]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The recommended numeric limits are product defaults selected for this local interactive workload, not external standards. | Recommended Numeric Policies | Limits may require tuning after client load tests; all are injectable/configurable. |
| A2 | Persisting optional IDs in workspace YAML is acceptable because CONTEXT delegates the mechanism and CLI/OpenTUI ignore the additive fields after schema support is added. | Summary / alternatives | If YAML must remain byte-stable, use a transactionally maintained sidecar and wire every rename/delete path. |
| A3 | Launch specifications should not expose resolved secret values by default. | Anti-patterns / Security | Phase 105 may require selected secrets; contract needs an explicit allowlist/capability rather than accidental leakage. |
| A4 | Other processes running as the same OS user can generally read user-owned service credentials. | Security Domain | Per-client credentials are revocable but are not an OS-user sandbox boundary. |

## Open Questions (RESOLVED)

1. **RESOLVED — Which mutations are in the first `/v1` capability set?**
   - What we know: EVT requirements need long-running mutation infrastructure; milestone clients primarily need launch and command actions.
   - What's unclear: exact lifecycle/Git endpoint breadth is not locked.
   - Resolution: implement the generic operation substrate and advertise workspace `open` and `close` as the initial mutation capabilities. Return `capability_unavailable` for every other optional mutation. This proves lifecycle, cancellation, and idempotency without expanding command authoring, forge, or unrelated CRUD scope.

2. **RESOLVED — May native launch specs receive secret-resolved environment values?**
   - What we know: existing `buildWorkspaceEnv` resolves secrets and clients need launch environment.
   - What's unclear: exposure policy across a local process boundary.
   - Resolution: launch specs include resolved ordinary environment values but omit resolved secret values by default, representing them only through explicit secret-reference/redaction metadata. Phase 104 does not advertise a capability that transmits resolved secrets.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Bun | Service/runtime/tests | ✓ | 1.3.14 | None required |
| Node-compatible crypto/fs | Credential and persistence primitives | ✓ | Node CLI 26.5.0; Bun compatibility used at runtime | Web Crypto for token bytes if needed |
| Git | Authoritative workspace status/mutations | ✓ | 2.55.0 | Existing project errors |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** Context7 MCP/CLI was unavailable during research; official Bun, Zod, and Node documentation was used directly.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `bun:test` 1.3.14 with custom isolated runner |
| Config file | `scripts/test-runner.ts`, `bunfig.toml` |
| Quick run command | `bun test tests/lib/service/<file>.test.ts` |
| Full suite command | `bun run test && bun run typecheck && bun run test:deps && bun run verify:gates` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | RED-First Test Creation Owner |
|--------|----------|-----------|-------------------|-------------------------------|
| SVC-01 | discovery/version/capability unavailable | contract + integration | `bun test tests/lib/service/contract.test.ts tests/service/discovery.test.ts` | 104-01-01 and 104-06-01 |
| SVC-02 | stable IDs, consistent aggregate, monotonic revision | unit + integration | `bun test tests/lib/service/identity.test.ts tests/lib/service/snapshot.test.ts` | 104-01-02, 104-02-01, and 104-06-01 |
| SVC-03 | resolved cwd/env/ports/commands without YAML exposure | unit | `bun test tests/lib/service/launch-context.test.ts` | 104-02-02 and 104-06-01 |
| SVC-04 | unchanged CLI/OpenTUI contracts | regression | `bun test tests/commands/command.test.ts tests/commands/workspace-json-contracts.test.ts tests/tui` | Existing regression suites plus 104-01-01, 104-01-02, 104-02-01, 104-02-02, 104-05-02, and 104-06-02 |
| SVC-05 | auth, revocation, loopback, body/rate/timeout bounds | unit + integration | `bun test tests/lib/service/credentials.test.ts tests/service/security.test.ts` | 104-03-01, 104-03-02, 104-06-01, and 104-06-02 |
| EVT-01 | nonblocking lifecycle and structured transitions | unit + integration | `bun test tests/lib/service/operations.test.ts tests/service/operations.test.ts` | 104-04-01 and 104-06-01 |
| EVT-02 | same-key replay and conflict after restart | unit | `bun test tests/lib/service/idempotency.test.ts` | 104-04-02 and 104-06-01 |
| EVT-03 | ordered operation/attention SSE | unit + integration | `bun test tests/lib/service/event-journal.test.ts tests/lib/service/event-broker.test.ts tests/lib/service/operations.test.ts tests/service/events.test.ts` | 104-05-01, 104-05-02, 104-04-01, and 104-06-01 |
| EVT-04 | replay, restart, gap metadata/rebuild revision | unit + integration | `bun test tests/lib/service/event-journal.test.ts tests/service/events.test.ts` | 104-05-01 and 104-06-01 |
| EVT-05 | event/byte queue caps and producer nonblocking | unit + integration | `bun test tests/lib/service/event-broker.test.ts tests/service/events.test.ts` | 104-05-02 and 104-06-01 |

### Sampling Rate
- **Per task commit:** focused `bun test <changed test files>` plus `bun run typecheck`.
- **Per wave merge:** `bun run test:unit && bun run test:deps` or relevant integration set.
- **Phase gate:** `bun run test && bun run typecheck && bun run test:deps && bun run verify:gates` green before verification.

### Test-Creation Ownership (RESOLVED — No Separate Wave 0)

All missing tests and fixtures are owned by the twelve `tdd="true"` implementation tasks and must be created and run RED before production changes. Task 104-01-01 owns the cross-language golden fixtures; the corresponding unit tasks own injectable clocks, IDs, persistence roots, limits, and executors; 104-06-01 owns the isolated port-0 loopback harness and cleanup; and 104-05-01, 104-05-02, and 104-04-02 own crash/restart, corrupt-tail, concurrent ordering, replay/live handoff, idempotency, and exact-boundary fixtures. This assignment matches `104-VALIDATION.md`; no standalone Wave 0 plan remains.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Per-client CSPRNG bearer token, protected registry, revocation, constant-time compare. |
| V3 Session Management | yes (credential lifecycle) | Stable client credential IDs, explicit revocation; no cookies/browser sessions. |
| V4 Access Control | yes | Each authenticated credential receives explicit capabilities; all `/v1` routes deny before route detail. |
| V5 Input Validation | yes | Strict Zod schemas, route allowlist, body/rate/time bounds, opaque ID validation. |
| V6 Cryptography | yes | Node/Bun crypto primitives; never custom randomness/comparison. |

### Known Threat Patterns for Local Bun HTTP Service
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Service bound beyond loopback | Information disclosure / Elevation | Explicit `127.0.0.1`, integration test remote interfaces are absent, no remote config. |
| Credential theft through permissions/logs | Spoofing / Information disclosure | Owner-only storage, no query-string tokens, redact headers/errors, reject unsafe files. |
| Malicious local request flood/body | Denial of service | Body cap, token bucket, connection caps, per-request timeout. |
| Path/ID injection | Tampering | Opaque ID lookup and Zod validation; never concatenate client names into paths. |
| Journal corruption/partial tail | Tampering / DoS | Validate every record, checksummed/framed append or tolerate/truncate only partial final record, atomic compact replacement. |
| Replay cursor manipulation | Tampering | Decode/validate opaque cursor; compare against retained min/max; do not trust client sequence claims. |
| Secret-bearing launch context in logs/journal | Information disclosure | Field allowlist/redaction; events contain stage/result metadata, not raw env or command output. |

The same-machine boundary protects against remote network callers, not other processes running as the same OS user. [ASSUMED] Per-client revocation provides product isolation and recovery, but an already-compromised same-user account can generally read user-owned credentials; document this threat boundary rather than claiming sandbox-grade isolation.

## Sources

### Primary (HIGH confidence)
- Repository `package.json`, `src/lib/config.ts`, `workspace-command.ts`, `workspace-env.ts`, `workspace-status.ts`, `workspace-file-status.ts`, `operation-runner.ts`, `messages.ts`, and corresponding tests — current stack and authoritative seams.
- https://bun.com/reference/bun/Serve — loopback hostname, body size, idle timeout API.
- https://bun.com/docs/runtime/http/server — port `0` discovery and per-request timeout behavior.
- https://bun.com/docs/guides/http/sse — SSE streaming, `ReadableStream` cleanup, idle timeout handling.
- https://zod.dev/api?id=discriminated-unions — runtime discriminated union contracts.
- https://nodejs.org/api/crypto.html — `randomBytes` and `timingSafeEqual` behavior.

### Secondary (MEDIUM confidence)
- `.planning/PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, phase CONTEXT, and codebase maps — project intent and documented architecture, cross-checked against source.

### Tertiary (LOW confidence)
- Product-default numeric limit recommendations and same-user threat-boundary characterization, explicitly marked in the assumptions/security sections.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — installed versions and source usage verified; official APIs cited.
- Architecture: HIGH — derived from locked decisions and current code seams; no new dependency.
- Pitfalls: HIGH — directly implied by replay, compatibility, security, and boundedness invariants; testable mitigations specified.

**Research date:** 2026-07-11
**Valid until:** 2026-08-10
