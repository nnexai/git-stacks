---
phase: 106-linux-workspace-commands-and-attention
plan: 02
review_depth: deep
reviewed_range: 0cee9173..e0d93b10
reviewed_at: 2026-07-11
status: complete
verdict: approved-after-remediation
findings:
  critical: 0
  warning: 0
  info: 0
---

# Phase 106 Plan 02 Code Review

## Verdict

**106-02 cannot legitimately be considered complete.** The focused tests pass, but they test isolated, hand-fed data structures rather than the production behavior required by the plan. The implementation has no authenticated HTTP/SSE transport, does not decode service snapshots or events into reducer actions, does not own `TerminalHost`, is not connected to the Linux application, and does not expose the new reducer actions through the ABI.

The completion claims in `106-02-SUMMARY.md` and `requirements-completed` are therefore false-green. Plan 03 cannot safely treat Plan 02 as an implemented service/model/host foundation.

## Scope and method

- Compared `106-02-PLAN.md` must-haves, tasks, acceptance criteria, verification, and success criteria against commits `0cee9173..e0d93b10` (and inspected `0cee9173` where Task 1 evidence was necessary).
- Traced imports and call sites across `native/`, the C ABI, the Linux application, and the authoritative TypeScript service contract.
- Inspected focused tests for behavioral coverage versus direct state-machine stimulation.
- Re-ran `native:test:service-client`, `native:test:tabs`, `native:test:attention`, and `native:test:restore`; all pass, which confirms the false-green coverage described below rather than the required production integration.

## Critical findings

### C1. `service_client.zig` is not a transport client and never authenticates a request

**Requirement violated:** Task 3 and its done/acceptance criteria; must-have “The Linux adapter authenticates to the existing service, consumes aggregate snapshots and ordered replayable events, recovers gaps by refreshing, and resolves launches without duplicating engine logic.”

**Evidence:**

- `native/linux/service_client.zig:12-34` stores an arbitrary borrowed `authorization` slice and changes enum/counter state only.
- `native/linux/service_client.zig:35-85` accepts already-provided HTTP status/body or already-extracted numeric revisions/sequences. It never opens a socket, constructs an HTTP request, discovers a service endpoint, attaches an `Authorization: Bearer` header, calls a `/v1` endpoint, consumes SSE, persists/resumes a cursor, schedules reconnects, or cancels in-flight I/O.
- There are no `std.http`, endpoint, request, response-stream, SSE framing, or transport abstractions anywhere in the module.
- `native/tests/service_client_test.zig:3-30` directly calls `acceptDiscovery`, `acceptSnapshot`, `acceptEvent`, and `resolveLaunch`; no fake transport is present and no request/header/path/SSE behavior is asserted.
- Production search finds `service_client` imported only by `native/tests/service_client_test.zig` and its build target. The Linux application never constructs or calls it.

**Impact:** The real Linux application cannot discover or authenticate to the service, load a snapshot, subscribe/replay events, refresh after a gap, or request launch resolution. The plan’s central synchronization path does not exist.

**Required remediation:** Implement an actual cancellable HTTP/JSON + SSE adapter over the Phase 104 discovery/credential boundary, with authenticated requests, strict endpoint/request contracts, cursor persistence/resumption, replay-gap snapshot refresh, bounded reconnect scheduling, and a production app integration point. Exercise it with a fake HTTP/SSE transport that asserts methods, paths, headers, bodies, ordering, cancellation, and retries.

### C2. Service payloads are not strictly decoded and are never fed into reducer actions

**Requirement violated:** key link `service_client.zig -> reducer.zig` via “strict contract decoding into snapshot/event actions and structured launch outcomes”; Task 3 action and acceptance criteria.

**Evidence:**

- Authoritative discovery is a strict success envelope containing `protocol`, `request_id`, `ok`, and `data` with `service_version`, five capabilities, and limits (`src/lib/service/contract.ts:35-60`). `acceptDiscovery` checks only a top-level string `protocol == "v1"` (`native/linux/service_client.zig:41-50`), accepting malformed or failed envelopes and ignoring capability compatibility.
- `acceptSnapshot` takes two integers and parses no `WorkspaceSnapshotResponse`; it cannot populate normalized workspaces, repositories, commands, revision, or selection (`native/linux/service_client.zig:53-58`).
- `acceptEvent` takes only a sequence integer and parses no `ServiceEvent`; it cannot distinguish control/operation/attention events or create `attention_received` actions (`native/linux/service_client.zig:59-69`).
- `resolveLaunch` validates only `resolved`, nonempty `argv` length, and `cwd` (`native/linux/service_client.zig:70-85`). It neither validates nor retains argv strings, environment, ports, configuration, redaction data, or revision required by `NativeLaunchResolutionSchema` (`src/lib/service/contract.ts:122-134`). It accepts non-string argv elements and arbitrary unknown/missing fields, so it is not strict. The returned `Launch` contains only `argv_count` and cwd and is not executable.
- Service attention IDs are `att_...`, but `model.Attention.id` is `model.Id` (a 36-byte UUID), so an authoritative `StructuredAttentionEvent` cannot even be represented without changing its identity (`src/lib/service/contract.ts:8-13,136-150`; `native/core/model.zig:2,21`).
- No function in `service_client.zig` imports `reducer` or returns a reducer `Action`. No production call site bridges outcomes to `reduce`.

**Impact:** Even if some outside code supplied response bodies, authoritative service state and events could not reach product state faithfully. Launches lose the executable and security-relevant contract. Tests pass because they assert only counters/tags and two decoded scalar fields.

**Required remediation:** Define strict native DTO decoders matching every required field and refinement in `contract.ts`, map snapshots/events to explicit reducer actions, retain a fully owned launch payload, preserve service identity domains, and add rejection tests for missing, mistyped, extra, inconsistent, and oversized fields.

### C3. `tab_registry.zig` owns metadata, not `TerminalHost` or process ownership

**Requirement violated:** artifact “Navigation-independent ownership of live `TerminalHost` instances”; Task 3 behaviors, acceptance, done statement, and key link from reducer launch effects through registration to a live tab.

**Evidence:**

- `native/linux/tab_registry.zig:3` defines a new `Host` record containing IDs, generation, PGID, birth token, and booleans. It contains no `TerminalHost`, Ghostty surface, PTY/process handle, ownership guard, teardown handle, or view widget.
- The module does not import `native/linux/terminal_host.zig`, `native/terminal/ownership.zig`, or any Phase 105 lifecycle/teardown implementation.
- `register` merely checks `pgid > 1` and `birth_token != 0` and appends the caller’s metadata (`native/linux/tab_registry.zig:13-17`). The caller can claim `registered = true`; no guard registration occurs.
- `attach`/`detach` flip a boolean (`:22-29`). `close`/`quit` remove or return records (`:30-36`) but never signal, reap, close, destroy, or invoke Phase 105 teardown. Child exit and crash paths are absent.
- `commitAfterRegistration` directly mutates the model after metadata insertion (`:38-52`); it performs no service resolution, terminal construction, process spawn, or ownership registration.
- Production search finds `tab_registry` only in its focused test/build target. The Linux application does not own a registry or route navigation/exit/quit through it.
- `native/tests/tab_registry_test.zig` constructs synthetic metadata with arbitrary PGIDs; the “ownership invariant” assertion only proves the same integers remain in an array after booleans toggle.

**Impact:** Navigation-independent live terminal survival, close/exit/quit/crash teardown, ownership registration, and “no visible tab before authoritative launch and ownership success” remain unimplemented. The registry tests cannot detect process leaks, host destruction, duplicated terminals, or generation/guard errors.

**Required remediation:** Make the registry own real or interface-injected `TerminalHost` instances and ownership guards; integrate it into the Linux app; distinguish view attachment from host lifetime; route all close/exit/quit/crash paths through Phase 105 teardown; and test with a faithful fake host plus at least one production-graph lifecycle test.

### C4. The ABI cannot dispatch or project any Plan 02 model/attention behavior

**Requirement violated:** Task 2 “Extend the pure reducer and opaque ABI with normalized attention items, derived aggregates, explicit `select_attention`, exact-tab-visible read handling, and `FocusRoute`/`FallbackReason`”; ABI completeness implied by artifacts and Plan 03 consumption.

**Evidence:**

- The C header adds only two enum declarations (`native/include/git_stacks_native_v1.h:17-18`). It adds no input/output structs or functions for snapshots, normalized workspace/repository/pair/tab collections, attention, aggregates, focus routes, selection, read state, tab lifecycle, rename/order, or persistence.
- `gs_model_dispatch_v1` recognizes only `"disconnected"` and `"unknown_optional"` (`native/core/abi.zig:84-100`). All new reducer actions (`attention_received`, `select_attention`, `exact_tab_visible`, `navigate_pair`) are unreachable through the ABI.
- `canonicalAlloc` exposes only counts and legacy scalar surface fields, not the normalized records or focus effect (`native/core/model.zig:110-114`). `gs_model_dispatch_v1` discards `Result.effect` entirely.
- `native/tests/abi_harness.c` merely asserts enum members differ. It never compiles or exercises a Plan 02 ABI operation.

**Impact:** GTK or any C consumer cannot supply authoritative state/events, render normalized collections, select attention, observe routing, or manage tabs through the promised opaque boundary. Adding enum names gives a compile-time false positive without an ABI.

**Required remediation:** Design and expose versioned ABI operations/data for all Plan 02 actions and projections, return effects (including focus routes and launch/host effects), validate identities and payloads, and expand the C harness to exercise success, rejection, lifetime, and complete field projection.

## Warning findings

### W1. Presentation persistence omits the presentation state the plan requires and weakens corrupt-entry quarantine

**Requirement violated:** Task 1 D-01 through D-08 behavior/action/acceptance, especially organization mode, pinned/manual order, last-pair restoration, independent quarantine, and presentation-only restoration.

**Evidence:**

- `Presentation` declares `organization_mode`, `pinned_workspace_ids`, and `last_pair` (`native/core/persistence.zig:16-21`), but no function encodes or restores a `Presentation`; `encodeAlloc` accepts only `[]Record` and emits only entries (`:41-64`).
- Invalid workspace/repository/predecessor identities are silently converted to `null` rather than quarantining the corrupt record (`:98-115`). Wrong title/cwd/order/exit types silently default rather than diagnose. A persisted `lifecycle: "live"` is ignored and restored as ended; that safety property is good, but the test does not prove rejection/quarantine of other malformed fields.
- Unbounded integers are cast directly to `u32`/`i32` (`:96-97,116-117`), which can trap in safety builds instead of preserving other valid records and emitting a diagnostic.
- `encodeAlloc` validates only surface identity/lifecycle. Optional pair and predecessor IDs are serialized without validation (`:47-60`).
- There is no file I/O, atomic replace, symlink defense, owner verification, or permission application in this module. `isSafeMode` is only a predicate and has no call sites in persistence.

**Impact:** Organization/pin/selection state is not persisted, malformed entries can be silently altered or crash restoration, and the claimed persistence safety is not implemented end-to-end.

### W2. Attention resolution and fallback routing are semantically incorrect/incomplete

**Requirement violated:** D-14 through D-18; exact live/ended predecessor/repository/workspace fallback; unresolved diagnostics; duplicate/replay/read/removal stability.

**Evidence:**

- Workspace-scoped attention has no repository, but receipt calls `pairValid` with an all-zero repository and therefore always marks valid workspace attention unresolved (`native/core/reducer.zig:79-82`).
- If an attention item’s exact surface exists but is ended, selection routes to that ended surface and labels it `ended_predecessor`; it does not resolve a live relaunch descendant/predecessor lineage (`:89-101`).
- If a supplied predecessor exists, its lifecycle and pair nesting are not checked before routing.
- Duplicate IDs only increment a counter and discard the later event (`:73-83`). If repeated events represent lifecycle updates, status/detail/read state cannot advance. There is no removal action despite acceptance explicitly requiring removal not to drift aggregates.
- Capacity exhaustion silently drops attention with no explicit failure or diagnostic (`:79-84`).
- `navigate_pair` accepts nonexistent pairs without validation (`:112-115`).
- Tests cover exact live, repository fallback, and receipt/no-focus only. They do not cover workspace fallback, ended lineage, unresolved identity combinations, removals, exact-visible clearing across “current” items, capacity, or invalid navigation.

**Impact:** Valid events can become diagnostically unresolved, fallback focus can target an ended/wrong surface, and normalized attention can become stale or silently incomplete.

### W3. Normalized model mutation and canonical projection are incomplete and retain a conflicting legacy surface

**Requirement violated:** Task 1 normalized pair collections and Task 2 deterministic accessible projections.

**Evidence:**

- `State` still contains the legacy singleton `surface` alongside `pairs` (`native/core/model.zig:31-32`). Existing terminal actions in `reducer.zig` mutate only that singleton, while registry code mutates pair surfaces directly. There is no single reducer-owned lifecycle model.
- No reducer actions implement pair-local reorder, rename, close, relaunch lineage, snapshot reconciliation, workspace expansion/collapse, pin/manual order changes, or tab restoration into state. Tests largely assign arrays directly and assert assigned values.
- `canonicalAlloc` exposes `pair_count` and `attention_count` but not their contents (`native/core/model.zig:110-114`), so deterministic state cannot be projected or round-tripped.

**Impact:** Two incompatible sources of surface truth can diverge, and consumers cannot use the normalized state as a fully featured product model.

### W4. Focused verification proves isolated helpers, not the stated production acceptance

**Requirement violated:** all Task 3 acceptance criteria and plan success criteria.

**Evidence:**

- All four focused commands pass, but the service and registry modules are test-only imports.
- Service tests hand in pre-decoded status/body/sequence values and never test HTTP, authentication headers, SSE framing, strict full payloads, reducer actions, reconnect scheduling, or app integration.
- Registry tests use scalar metadata and never create a fake/real `TerminalHost`, process, ownership guard, view, exit callback, or teardown path.
- Attention tests instantiate internal model values using UUID attention IDs that cannot originate from the authoritative service contract.
- The ABI harness checks enum inequality rather than Plan 02 reachability.

**Impact:** The green targets are structurally incapable of failing for the major missing requirements, so they cannot support `status: complete` or `requirements-completed`.

## Requirement-level completion audit

| Plan obligation | Evidence status | Result |
|---|---|---|
| Normalized pair-bound collections and deterministic reconciliation | Partial internal structs/helpers; mutation/projection incomplete | Not complete |
| Full presentation persistence with ended-only restoration and quarantine | Record subset only; presentation fields and robust quarantine absent | Not complete |
| Derived attention and no async focus theft | Partial pure reducer behavior | Partial |
| Exact/ended/repository/workspace/unresolved focus routing | Multiple semantic gaps and missing cases | Not complete |
| Complete opaque ABI for model/actions/effects | Enums only; actions unreachable | Not complete |
| Authenticated discovery and `/v1` HTTP transport | No transport | Missing |
| Strict snapshot/event decoding into reducer actions | No payload decoding/action bridge | Missing |
| Ordered SSE replay, durable resume, gap refresh, reconnect, shutdown cancellation | Integer state machine only | Missing |
| Full fresh launch resolution | Partial cwd/count decoder; no request or executable payload | Missing |
| Registry-owned live `TerminalHost` lifetimes | Metadata array only | Missing |
| Resolution -> registration -> live ordering in production | Direct helper only, no resolution/host creation/app call site | Missing |
| Close/exit/quit/crash Phase 105 teardown | No teardown integration | Missing |
| Focused tests cover stated acceptance | Major paths cannot be exercised by tests | Not complete |

## Conclusion

Plan 106-02 should be reopened. The summary’s `status: complete` and `requirements-completed` declaration should not be used as downstream evidence. A legitimate completion requires production-connected transport and host ownership, strict full-contract mapping into reducer actions, a usable ABI, complete presentation persistence, corrected attention semantics, and tests that exercise those paths rather than only isolated counters and metadata.

## Remediation audit — 2026-07-11

The review was acted on in commits `a16e4081`, `da9d7b06`, `0079e402`, `87a99e3d`, `6ed596c4`, `75452fbf`, `edc67976`, `82bf655e`, and `f0b415b0`.

### Resolved findings

- **C2 resolved:** aggregate snapshots and structured SSE attention now decode into reducer actions; authoritative attention IDs are retained separately from ABI-compatible internal keys; launch argv/cwd are owned; commands and normalized collections project through the ABI.
- **C4 resolved:** the ABI ingests bounded snapshots and attention, dispatches selection/read/navigation/removal, projects normalized collections and derived aggregates, and returns concrete effect payloads. The C harness exercises snapshot → attention → explicit focus.
- **W1 resolved for Plan 02's in-memory persistence boundary:** full presentation encoding covers organization mode, pins, last pair, and records; numeric restoration uses checked bounds. Phase 105 owns the protected file boundary.
- **W2 resolved:** workspace attention validates correctly, invalid navigation is rejected, removal is reducer-owned, and authoritative attention identity is retained.
- **W3 substantially resolved:** normalized collections and commands are projected through the canonical ABI. The legacy singleton remains only for Phase 105 callback compatibility and must not be used by the GTK collection projection.
- **W4 resolved:** service verification includes real `std.http` traffic against a loopback test server, secure descriptor/credential fixtures, aggregate reduction, SSE reduction, and production-graph compilation/audit. Registry tests use injected lifecycle operations, while the Linux app adopts realized Ghostty hosts into the registry.

### Remaining critical findings

- **C1 partially resolved:** secure Phase 104 descriptor/credential lookup, loopback-only `std.http`, bearer requests, aggregate snapshots, replay cursor, SSE parsing, duplicate/gap handling, and cancellation state exist. The GTK application does not yet run `replayOnce` on a cancellable worker; a direct call would block GTK activation on the persistent SSE stream.
- **C3 partially resolved:** the production graph owns the registry and realized Ghostty hosts are adopted with real process identity and teardown. However, the initial Ghostty surface is still created before a fresh `/v1/native-launch` result is injected, because the current surface constructor accepts neither owned argv/environment nor cwd. Registration-before-live for service-resolved launches is therefore not proven.

### Verification evidence

- `bun run native:test:restore`
- `bun run native:test:attention`
- `bun run native:test:service-client`
- `bun run native:test:tabs`
- `bun run native:test:quick`
- `bun run native:verify`
- `bun run typecheck`
- `bun run test:deps`
- `bun run verify:gates`

All commands above passed after remediation. Green verification does not override the two explicit production orchestration gaps, so this review remains incomplete.

## Final closure audit — 2026-07-11

Commit `11786f45` closes the two remaining production orchestration gaps:

- **C1 resolved:** the Linux application starts replay on a background worker after activation, sends the current cursor as `Last-Event-ID`, applies bounded reconnect backoff, schedules decoded reducer work through `g_main_context_invoke`, refreshes the authoritative snapshot on a sequence gap, cancels active transport sockets at shutdown, and joins the worker before graph destruction.
- **C3 resolved:** activation obtains a fresh revision-bound `/v1/native-launch` before calling `Surface.createWithLaunch`. The surface configuration owns and injects the resolved argv command, cwd, environment, ports/configuration result, and reserved surface/workspace/repository identities. A terminal enters the registry/model only after Ghostty process ownership succeeds; resolution, construction, or ownership failure cannot publish a host or tab.

Production-path contract coverage asserts the replay lifecycle and the ordering `resolve -> create configured Ghostty surface -> publish terminal`, and strict service tests retain actual environment and port values rather than counters alone.

The complete Plan 02 verification set passed after closure: `native:test:restore`, `native:test:attention`, `native:test:service-client`, `native:test:tabs`, `native:test:quick`, `native:verify`, `typecheck`, `test:deps`, and `verify:gates`. The native verifier additionally passed 25 graphical lifecycle cycles, GTK smoke, terminal round-trip smoke, and multisurface smoke. No Plan 02 critical or warning finding remains open.
