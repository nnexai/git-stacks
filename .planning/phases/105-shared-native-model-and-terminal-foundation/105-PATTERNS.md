# Phase 105: Shared Native Model and Terminal Foundation - Pattern Map

**Mapped:** 2026-07-11
**Files analyzed:** 24 new/modified files or file groups
**Analogs found:** 20 / 24 (the GTK/libghostty host, C ABI, Zig build, and guard process have no repo-native implementation analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `native/build.zig`, `native/build.zig.zon` | config | batch | `package.json` | role-match |
| `native/deps/ghostty.lock` | config | file-I/O | `scripts/verify-prereqs.ts` | role/data-flow match |
| `native/include/git_stacks_native_v1.h` | provider | request-response | `src/lib/service/contract.ts` | boundary-match; language differs |
| `native/core/identity.zig` | model | transform | `src/lib/service/contract.ts`, `src/lib/service/identity.ts` | exact domain match |
| `native/core/contract.zig` | model | transform | `src/lib/service/contract.ts` | exact domain match |
| `native/core/model.zig`, `native/core/reducer.zig` | model/service | event-driven | `src/lib/service/event-broker.ts`, `src/lib/service/event-journal.ts` | data-flow match |
| `native/core/persistence.zig` | store | file-I/O | `src/lib/service/snapshot.ts`, `src/lib/service/identity.ts` | exact persistence match |
| `native/core/abi.zig` | provider | request-response | `src/lib/service/contract.ts` | boundary-match; no FFI analog |
| `native/terminal/adapter.zig` | service | streaming/event-driven | none local; pinned `ghostty.h` from research | external exact API |
| `native/terminal/ownership.zig` | service | event-driven | `src/lib/operation-runner.ts`, `src/lib/lifecycle.ts` | lifecycle/cleanup match |
| `native/terminal/guard.zig` | service | streaming/event-driven | `src/service/main.ts`, `src/lib/lifecycle.ts` | partial; separate guard is new |
| `native/terminal/diagnostics.zig` | utility | event-driven | `src/lib/platform-exec.ts`, `src/lib/service/contract.ts` | error-contract match |
| `native/linux/app.zig`, `native/linux/terminal_host.zig` | component/provider | streaming/event-driven | none local; pinned `ghostty.h` from research | external exact API |
| `native/tests/fixtures/**` | test fixture | file-I/O | `tests/fixtures/service-v1/*.json` | exact source-of-truth match |
| `native/tests/abi_harness.c` | test | request-response | `tests/service/security.test.ts` | boundary-negative-test match |
| `native/tests/reducer_test.zig` | test | event-driven | `tests/service/events.test.ts` | data-flow match |
| `native/tests/persistence_test.zig` | test | file-I/O | `tests/service/security.test.ts`, service store tests | role/data-flow match |
| `native/tests/ownership_test.zig`, `native/tests/lifecycle_stress.zig` | test | event-driven/batch | `tests/service/operations.test.ts`, `tests/service/events.test.ts` | lifecycle-test match |
| `scripts/verify-native.ts` (implied) | utility/gate | batch | `scripts/verify-prereqs.ts`, `scripts/verify-gates.ts` | exact gate pattern |
| `package.json` | config | batch | existing `package.json` scripts | exact |
| `.github/workflows/*` native CI lane (implied) | config | batch | existing repository CI workflows | role-match |
| Phase 105 real-session runbook (implied) | test/documentation | manual event-driven | no product analog | new proof artifact |
| Phase 105 accessibility limitation note (implied) | documentation | transform | no product analog | new contract artifact |

## Pattern Assignments

### `native/core/identity.zig` and `native/core/contract.zig` (model, transform)

**Analog:** `src/lib/service/contract.ts`

**Strict versioned contract pattern** (lines 3-15, 22-33):

```typescript
export const ProtocolVersionSchema = z.literal("v1")
export const RequestIdSchema = z.string().regex(/^req_[A-Za-z0-9_-]{16,}$/)
export const EntityIdSchema = z.string().uuid()
export const RevisionSchema = CursorSchema

export const ApiErrorSchema = z.strictObject({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean().optional(),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
})
const EnvelopeBase = { protocol: ProtocolVersionSchema, request_id: RequestIdSchema }
```

Copy the semantics, not Zod: validate the literal protocol version, opaque identity shapes, decimal revision strings, strict known fields, and structured errors at the Zig boundary. Preserve Phase 104 JSON field names so fixture drift is mechanically detectable.

**Tagged-state pattern** (lines 119-136):

```typescript
export const OperationSchema = z.discriminatedUnion("state", [
  z.strictObject({ operation_id: OperationIdSchema, state: z.literal("accepted"), accepted_at: TimestampSchema }),
  z.strictObject({ operation_id: OperationIdSchema, state: z.literal("running"), accepted_at: TimestampSchema, started_at: TimestampSchema, progress: OperationProgressSchema }),
  OperationResultSchema, OperationFailureSchema,
])
export const ServiceEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...EventBase, type: z.literal("operation"), operation: OperationSchema }),
  // ... attention and control variants
])
```

Represent connection, restoration, and surface lifecycle as tagged unions. Invalid combinations must be unrepresentable or rejected, rather than normalized into an apparently healthy state.

---

### `native/core/model.zig` and `native/core/reducer.zig` (model/service, event-driven)

**Analogs:** `src/lib/service/event-broker.ts`, `src/lib/service/event-journal.ts`

**Ordered, idempotent event admission** (`event-broker.ts` lines 27-44):

```typescript
enqueue(event: ServiceEvent): boolean {
  if (this.closed || BigInt(event.sequence) <= BigInt(this.lastDelivered)) return true
  if (this.queue.some((item) => item.event.sequence === event.sequence)) return true
  // bounded admission, then deliver or enqueue
}
```

Reducer actions that carry revisions/sequences should be deterministic, reject or inertly diagnose duplicates/old data, and never synthesize missing authoritative state.

**Explicit replay-gap outcome** (`event-journal.ts` lines 19-21, 125-134):

```typescript
export type ReplayResult =
  | { kind: "events"; events: ServiceEvent[] }
  | { kind: "replay_gap"; requested: string; earliest_cursor: string; latest_cursor: string; snapshot_revision: string }

if (this.records.length && requested < earliest - 1n) {
  return { kind: "replay_gap", requested: after, earliest_cursor: earliest.toString(), latest_cursor: latest.toString(), snapshot_revision: await this.snapshotRevision() }
}
```

Use the same explicit-outcome style for `stale`, `refresh_required`, `incompatible`, quarantined restoration entries, and failed cleanup. Reducer output should be `{ state, effects }`; effects are tagged data and adapters alone perform I/O.

---

### `native/include/git_stacks_native_v1.h` and `native/core/abi.zig` (provider, request-response)

**Analog:** `src/lib/service/contract.ts` (product boundary); no local FFI analog.

Apply the contract conventions above to an opaque C ABI: version-suffixed symbols, opaque model handles, fixed-width status/scalar types, UTF-8 byte slices, explicit length validation, structured returned error bytes, and a matching product-owned free for every returned allocation. Do not export Zig structs, enums, allocators, GTK types, or libghostty handles.

Use Phase 104's success/error envelope separation (`contract.ts` lines 30-33) as the response model:

```typescript
export const ErrorEnvelopeSchema = z.strictObject({ ...EnvelopeBase, ok: z.literal(false), error: ApiErrorSchema })
export const successEnvelope = <T extends z.ZodType>(data: T) => z.strictObject({ ...EnvelopeBase, ok: z.literal(true), data })
```

The C harness must cover null handle, null pointer/nonzero length, oversized input, invalid UTF-8/JSON, ABI mismatch, double-destroy policy, allocation/free, and post-destroy rejection.

---

### `native/core/persistence.zig` (store, file-I/O)

**Analogs:** `src/lib/service/snapshot.ts`, `src/lib/service/identity.ts`

**Owner-only atomic replacement** (`snapshot.ts` lines 63-87):

```typescript
mkdirSync(join(this.path, ".."), { recursive: true, mode: 0o700 })
const release = acquireFileLock(this.path)
try {
  // validate current content
  const temporary = `${this.path}.${process.pid}-${randomUUID()}.tmp`
  const fd = openSync(temporary, "wx", 0o600)
  try {
    writeFileSync(fd, `${JSON.stringify(next)}\n`, "utf8")
    fsyncSync(fd)
  } finally { closeSync(fd) }
  renameSync(temporary, this.path)
} finally { release() }
```

**Symlink refusal and validate-before/after-write** (`identity.ts` lines 30-56):

```typescript
if (lstatSync(path).isSymbolicLink()) throw new Error(`Refusing identity migration through symlink: ${path}`)
const current = validatedWorkspace(path)
// construct and validate next value
renameSync(tmp, path)
return validatedWorkspace(path)
```

Persist only the presentation fields allowed by D-05. Parse entries independently; valid entries continue, while invalid/missing-identity entries produce bounded quarantine records containing index/hash/error code. Never persist PID, PGID, PTY path, argv, environment, token, or liveness. Every restored entry is `ended`; relaunch allocates a new ID and records predecessor lineage.

---

### `native/terminal/ownership.zig` and `native/terminal/guard.zig` (service, event-driven)

**Analogs:** `src/lib/operation-runner.ts`, `src/lib/lifecycle.ts`; the independent sibling guard itself is new.

**Commit ownership only after success** (`operation-runner.ts` lines 88-105):

```typescript
try {
  await forward()
} catch (err) {
  forwardError = err instanceof Error ? err.message : String(err)
  await rollback()
  throw err
}
stack.push({ name, undo })
```

Creation must not enter `live` until surface, PTY, child PID/PGID, and guard registration succeed. Teardown must be idempotent and preserve the original failure while collecting cleanup diagnostics; unlike generic best-effort rollback, unproven process absence must become visible `failed_cleanup`.

**Injectable process seam** (`lifecycle.ts` lines 21-56):

```typescript
export type SpawnHandle = {
  exited: Promise<number>
  stdout: ReadableStream<Uint8Array> | null
  stderr: ReadableStream<Uint8Array> | null
}
export const _exec = { spawn: (args: { cmd: string[]; cwd: string; env: Record<string, string>; stdout: "inherit" | "pipe"; stderr: "inherit" | "pipe" }): SpawnHandle => { /* ... */ } }
```

Make clock, sleep/polling, signal, reap, `/proc` birth-token lookup, spawn, and guard-channel operations injectable. Validate that a candidate PGID differs from client and guard groups before registration/signaling. The guard receives registrations only through a private inherited channel; EOF means client death and triggers bounded group teardown.

---

### `native/terminal/diagnostics.zig` (utility, event-driven)

**Analogs:** `src/lib/platform-exec.ts`, `src/lib/service/contract.ts`

**Typed failure carrying result evidence** (`platform-exec.ts` lines 1-12):

```typescript
export class PlatformCommandError extends Error {
  constructor(readonly command: string, readonly result: PlatformCommandResult) {
    super(`${command} failed (exit ${result.exitCode})${result.stderr ? `: ${result.stderr.trim()}` : ""}`)
  }
}
```

Diagnostics should retain stable codes plus bounded, redacted details. Never include argv, environment, bearer tokens, clipboard content, or unrestricted terminal bytes. Unknown negotiated optionals are stored as inert diagnostic data and cannot emit effects.

---

### `native/terminal/adapter.zig` and `native/linux/terminal_host.zig` (service/component, streaming)

**Analog:** none in this repository. Use the exact pinned `include/ghostty.h` API identified by `105-RESEARCH.md`; keep it behind `adapter.zig`, the only file allowed to import libghostty details.

The host lifecycle must follow: realize graphics resources; create only after host prerequisites exist; resize with content scale and dimensions; route focus to GTK IM plus libghostty; route key/text/preedit/mouse/clipboard through explicit adapter calls; derive IME cursor location from the surface; make callbacks inert via generation/liveness token; disconnect controllers; join/stop work; free surface/GPU resources during unrealize. Product/native shortcuts get first arbitration, then sufficiently rich terminal key events are forwarded.

Do not copy OpenTUI patterns here: it is a separate adapter and cannot establish GTK/libghostty lifecycle correctness.

---

### `native/build.zig`, `native/build.zig.zon`, and `native/deps/ghostty.lock` (config, batch/file-I/O)

**Analogs:** `package.json`, `scripts/verify-prereqs.ts`

**Fail-closed prerequisite audit** (`verify-prereqs.ts` lines 19-57, 81-95):

```typescript
function collectPrereqProblems(): PrereqProblem[] {
  const problems: PrereqProblem[] = []
  if (!existsSync(join(ROOT, "tests/e2e-inventory.ts"))) {
    problems.push({ surface: "inventory", message: "missing tests/e2e-inventory.ts" })
  }
  return problems
}
// print all scoped problems, then exit nonzero; otherwise run validation tests
```

Record Ghostty tag object and peeled source commit separately, enforce HEAD/source checksum, and provision Zig 0.15.2 from a repo-controlled version+checksum path. Ambient Zig 0.16.0 must fail the native prerequisite check rather than silently build. Add minimum GTK/libadwaita CI as well as the current-host lane.

---

### `native/tests/**`, `scripts/verify-native.ts`, and package/CI wiring (tests/gate, batch)

**Analogs:** `tests/service/events.test.ts`, `tests/service/security.test.ts`, `scripts/verify-gates.ts`, `package.json`

**Deterministic injected lifecycle tests** (`tests/service/operations.test.ts` lines 4-19):

```typescript
const callbacks: Array<() => void> = []
let exited = 0
const lifecycle = createIdleLifecycle({
  idleMs: 5,
  setTimer: (fn: () => void) => { callbacks.push(fn); return callbacks.length as never },
  clearTimer: () => {},
  onIdle: () => { exited += 1 },
})
```

**Reverse-order cleanup for integration tests** (`tests/service/events.test.ts` lines 10-11):

```typescript
const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
```

**Security-negative assertions** (`tests/service/security.test.ts` lines 32-49, 66-74): enumerate malformed shapes, assert one stable rejection, and assert serialized contexts contain no secret.

Use Phase 104 fixtures in `tests/fixtures/service-v1/` as the canonical corpus; generate/copy them through one checked workflow and consume the same bytes from Bun, Zig, and Linux C, with strict public-header C/Clang portability checks for later Phase 107 macOS execution. Add the native gate as an explicit `package.json` script beside `verify:gates` (lines 32-46), and make the release gate report missing/invalid artifacts using the collected-report style in `scripts/verify-gates.ts` lines 17-43 and 179-208.

Automated layers must include reducer transitions, ABI negatives/ownership, mixed-entry persistence, real process-group/guard crash paths, GTK lifecycle, and warm-up/trend stress checks. The documented real-session artifact must cover Wayland/X11 where supported, keyboard, mouse, Unicode/graphemes, resize/reflow, alternate screen, both clipboards, IME preedit/commit/cursor, focus, exit, repeated GPU lifecycle, and accessibility inspection.

## Shared Patterns

### Trust-boundary validation

**Source:** `src/lib/service/contract.ts` lines 22-33 and 85-101.

Apply strict validation before state mutation at JSON fixture, ABI, persistence, and guard-command boundaries. Return structured, versioned errors. Unknown optional negotiated data is the one deliberate exception to strict rejection: preserve it inertly with degraded-compatibility diagnostics, but never execute it.

### Explicit outcomes over coercion

**Source:** `src/lib/service/event-journal.ts` lines 19-21 and 125-134; `src/lib/operation-runner.ts` lines 32-35.

Use tagged outcomes for replay gaps, stale/refetch-required state, incompatible protocol, quarantined restoration entries, ended surfaces, and failed cleanup. Preserve last valid snapshot only for stale/refresh-required; incompatible state clears service-derived truth while retaining local presentation metadata.

### Atomic owner-only persistence

**Source:** `src/lib/service/snapshot.ts` lines 63-87; `src/lib/service/identity.ts` lines 34-56.

Use mode `0700` directories, `0600` files, exclusive temporary creation, fsync, atomic rename, symlink refusal, and validation. Add directory fsync where needed for the native implementation's crash contract.

### Injectable lifecycle boundaries

**Source:** `src/lib/lifecycle.ts` lines 21-56; `tests/service/operations.test.ts` lines 4-19.

All time, process, signal, polling, and callback behavior needs deterministic seams. Production defaults remain bounded; tests advance fake time and inject failures without sleeping.

### Cleanup ordering and truth

**Source:** `src/lib/operation-runner.ts` lines 70-105; `tests/service/events.test.ts` lines 10-11.

Acquire resources forward, release in reverse order, continue collecting cleanup errors, and preserve the primary failure. For owned processes, cleanup is not complete until absence is proved; otherwise retain `failed_cleanup` and diagnostics.

### Boundary isolation

Phase 104 remains the canonical service contract. The Zig reducer consumes its fixtures; it does not port workspace business logic. `terminal/adapter.zig` alone imports libghostty; GTK/libadwaita types stay in `native/linux`; the exported C header exposes neither. Phase 105 proves Linux execution and compile portability only; Phase 107 proves actual macOS ABI/model parity and native integration.

## Planner Warnings

- There is no existing native tree, Zig convention, GTK component, libghostty adapter, C ABI, or crash guard to imitate. Treat the research pin/API and these product boundaries as specifications, not optional suggestions.
- Do not use `libghostty-vt` as the terminal foundation, do not float the Ghostty/Zig versions, and do not record the annotated tag object as the source commit.
- Do not infer restored liveness from persisted OS identifiers, reuse a surface identity for relaunch, or delete a surface record when process cleanup is unproven.
- Headless draw/create tests are necessary but cannot replace the required real-session interaction and accessibility proof.
- RSS need only return to a bounded warmed baseline/trend; owned surface/process/PGID counters must return exactly to zero.
