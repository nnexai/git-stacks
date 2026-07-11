---
phase: 106-linux-workspace-commands-and-attention
type: service-native-integration-audit
date: 2026-07-12
status: diagnosed
scope: read-only
---

# Phase 106 Service and Native Integration Audit

## Executive conclusion

The UAT failures are reproducible from current control flow and are not independent UI defects. They originate in four contract mismatches:

1. The service assigns revisions per workspace projection, while the Zig aggregate client keeps only the greatest revision and sends it for every launch.
2. The native launch adapter concatenates individually quoted argv elements without separators, producing one invalid executable word for multi-argument commands.
3. The native replay worker implements repeated finite SSE fetches whose completion is heartbeat-bound; cancellation cannot interrupt the active `std.http.fetch`.
4. Workspace creation outside the service operation path emits no event, while ordinary operation events only advance the cursor and do not refresh the aggregate snapshot.

Managed-service reuse and non-hermetic smoke setup amplify these defects by retaining old server state and allowing tests to attach to the user's real descriptor.

## Findings

### F1 — `LaunchRejected` after restart is primarily a revision-domain mismatch

Evidence:

- Each workspace snapshot calls the single `revisionStore.update(digest(projection))` independently (`src/lib/service/snapshot.ts:262-277`).
- `buildAll()` runs those per-workspace updates concurrently (`src/lib/service/snapshot.ts:282-285`).
- The Zig aggregate decoder reduces all workspace revisions to one maximum and stores it as `Client.revision` (`native/linux/service_client.zig`, `aggregateState`; `Client.decodeAggregateSnapshot` at lines 162 and following).
- Every launch request sends that one client revision regardless of selected workspace (`native/linux/service_client.zig:129-133`).
- The service rebuilds all snapshots, selects the requested workspace, and requires exact equality with that workspace's own revision (`src/lib/service/snapshot.ts:292-299`).
- The Zig graph maps every non-200/error envelope to the opaque `LaunchRejected`, discarding `conflict`, `not_found`, and the service message (`native/linux/app_graph.zig:66-71`; `native/linux/service_client.zig:163`).

With two or more workspaces, the maximum aggregate revision is not guaranteed to be the selected workspace's revision. Because all workspaces share one revision store, building different projections can also advance the store merely by alternating workspaces. Restart/reuse changes build ordering and makes the mismatch visible, but is not the fundamental cause.

Required fix:

- Choose one revision domain and enforce it end to end. Preferred: make `/v1/snapshot` return a single aggregate revision and require that revision for launch resolution. Alternative: retain and send a revision per workspace/pair in the native model.
- Serialize aggregate snapshot construction/revision assignment; do not concurrently mutate one revision store from `Promise.all`.
- Decode error envelopes in Zig and surface the service error code/message. On `conflict`, refresh once and retry launch once using the new authoritative revision.

### F2 — Configured commands exit immediately because argv serialization is invalid

Evidence:

- The service correctly resolves configured commands to `[shell, "-lc", step.command]` (`src/lib/service/snapshot.ts:309-315`).
- `launchSpec` invokes `appendQuoted` for each argv element without inserting a space (`native/linux/app.zig:121-122`).
- `appendQuoted` surrounds each argument with single quotes. Adjacent shell quotes concatenate, so `['/bin/sh', '-lc', 'echo ok']` becomes effectively one word such as `/bin/sh-lcecho ok`, not three argv elements.
- Ghostty receives this combined string as `cfg.command` (`native/linux/ghostty_surface.zig`, `createSurface`, command assignment).

This explains the gray/blank terminal, immediate child exit, and absent command output. A one-element interactive shell can appear to work because it does not expose the missing separator.

Required fix:

- Stop round-tripping argv through an ambiguous shell command string if Ghostty can accept an argv-preserving launch API.
- If the Ghostty ABI only accepts a command string, insert separators and use a tested POSIX serialization routine; cover spaces, quotes, empty args, Unicode, and leading dashes.
- Add a production-path test that resolves `[shell, "-lc", command]`, verifies the exact Ghostty launch configuration, and observes command output and exit status.

### F3 — Workspace list does not refresh after TUI creation because no invalidation reaches the native snapshot

Evidence:

- The snapshot builder dynamically reads `listWorkspaceNames()` only when `/v1/snapshot` is requested (`src/lib/service/snapshot.ts:282-285`).
- The event journal is fed by service operations and attention publication (`src/service/main.ts:140-157`). A workspace created directly by the TUI does not pass through those operation adapters and emits no service event.
- In the native worker, non-attention events reduce to a generic `.event`, which only advances sequence. Snapshot refresh occurs only for a replay gap (`native/linux/app.zig:256-275`; `native/linux/service_client.zig`, `decodeReducerEvent`).
- There is no filesystem watcher, periodic snapshot refresh, focus-triggered refresh, or explicit TUI-to-service invalidation.

Required fix:

- Publish a workspace-registry change event from every mutation path, including the TUI, or add a service-owned registry watcher.
- Define an event kind that means “snapshot invalidated”; native handling must fetch `/v1/snapshot`, reconcile presentation state, and refresh projection.
- Add a bounded foreground/focus refresh as recovery, not as the primary consistency mechanism.

### F4 — Pin appears to do nothing because pinning is presentation-only, errors are swallowed, and rendering has no pinned section

Evidence:

- The action calls `view.pin(id) catch {}` and ignores persistence failure (`native/linux/app.zig:1052-1060`). Any invalid identity, capacity, or I/O error becomes a silent no-op.
- Workspace rendering iterates authoritative workspaces in their existing order and only decorates pinned rows with a star/CSS class (`native/linux/app.zig:474-500`). It does not render a pinned section or reorder pinned workspaces.
- Snapshot reduction replaces the whole native state (`native/linux/app_graph.zig:53-58` through reducer `.snapshot`), so future refresh work must explicitly preserve/reconcile presentation pins rather than replacing them with the snapshot's empty presentation fields.

The current evidence proves the missing pinned-section behavior and silent-failure path. It does not prove which silent error occurred in the reported click because no diagnostic is emitted.

Required fix:

- Render pinned workspaces as a distinct ordered section and unpinned workspaces separately.
- Never swallow pin/persistence errors; log and present them.
- Preserve organization mode, pins, last pair, and tab presentation while applying authoritative service snapshots.
- Add UI UAT for pin, unpin, reorder, restart restoration, and snapshot refresh preservation.

### F5 — Managed-service reuse can preserve stale ownership and hides lifecycle responsibility

Evidence:

- Reuse checks only that the descriptor PID is alive, the credential exists, and authenticated `GET /v1` succeeds (`src/service/main.ts:107-117`). It does not prove that the server was started for the current executable/config generation or that its snapshot contract matches the caller's requested adapter.
- A reused service returns `stop() {}` (`src/service/main.ts:134-136`). The caller therefore has no lease/release handle and cannot deliberately replace or stop it.
- The descriptor records instance/server IDs, but `descriptorUsable` does not compare an expected instance, build version, config-root fingerprint, or capabilities beyond HTTP success.
- `runInteractiveApp` accepts reuse and later calls the no-op stop (`scripts/verify-native.ts:453-463`).

Required fix:

- Add descriptor compatibility metadata: executable/service build identity, config-root identity, and contract/capability version.
- Return a lease for reused services; distinguish “owner stop” from “client release.”
- Provide an explicit replace/restart policy when compatibility or health checks fail.
- Make descriptor cleanup conditional on instance identity, and test stale-live PID, wrong config root, changed binary, revoked credential, and reused shutdown.

### F6 — SSE polling/reconnect causes the approximately 13-second shutdown

Evidence:

- Native requests `/v1/events?finite=1` (`native/linux/service_client.zig:122-127`).
- The server's finite stream closes after one delivered frame, but if no event is ready the next frame is the 15-second heartbeat (`src/service/server.ts:238-267`; `SSE_HEARTBEAT_MS = 15_000`).
- `HttpTransport.cancel()` only changes a boolean checked before a request. It cannot interrupt an active `std.http.fetch` (`native/linux/service_client.zig`, `HttpTransport.execute`).
- The worker owns a separate local transport, while cleanup sets `replay_cancel` and immediately `join()`s (`native/linux/app.zig:173-180`). The active fetch remains blocked until the heartbeat closes the finite stream.

Closing roughly two seconds after a poll starts therefore leaves roughly thirteen seconds until join returns, matching UAT.

Additional reconnect defect:

- `client.attempt` is reset after every HTTP 200 even when frames are invalid or no useful state was applied (`native/linux/app.zig:278-303`), weakening backoff.
- On replay gap the worker resets its local cursor from `state.graph.service.sequence` before the UI-thread refresh has completed, so it can reconnect with the same stale cursor.

Required fix:

- Use an interruptible streaming request owned by the worker and close/shutdown its socket during cancellation, or use a short explicit server-side long-poll timeout substantially below shutdown SLA.
- Join only after the active I/O primitive has been interrupted.
- Make cursor publication atomic/UI-safe. After a replay gap, block reconnect until snapshot refresh publishes the new cursor.
- Reset backoff only after a valid frame or successful refresh, not every HTTP 200.

### F7 — `native:verify` smoke can miss `READY` because it is not service/config isolated

Evidence:

- `smokeApp()` starts the artifact with inherited `process.env` and no temporary `GIT_STACKS_CONFIG_DIR` (`scripts/verify-native.ts:466-477`).
- Native discovery defaults to the user's real `~/.config/git-stacks/service` descriptor (`native/linux/app_graph.zig:35-50`).
- If a live reused descriptor exists, activation performs a real snapshot and authoritative launch before presenting the window (`native/linux/app.zig:1455-1488`). Any revision conflict/`LaunchRejected` exits activation before `smokeEvidence` can emit `GIT_STACKS_NATIVE_READY`.
- The dedicated workspace smoke does create an isolated service root, demonstrating the missing isolation in the generic smoke (`scripts/verify-native.ts`, `smokeWorkspaceLifecycle`).

Required fix:

- Run every graphical smoke with a temporary config root and an explicitly owned service fixture, or explicitly disable service discovery for renderer-only smoke.
- Capture and report activation errors separately from missing READY evidence.
- Ensure teardown stops the fixture service and removes its descriptor.

## Fix order

1. **Revision contract and error envelopes:** establish aggregate/per-workspace revision semantics, serialize revision assignment, decode errors, and add conflict refresh/retry. This unblocks reliable startup and all launches.
2. **Argv-preserving launch:** correct Ghostty command construction and add real output coverage. This unblocks configured commands.
3. **Interruptible SSE lifecycle:** replace heartbeat-bound finite polling, fix cancellation/join and cursor publication, then verify sub-second shutdown and reconnect/backoff.
4. **Snapshot invalidation:** publish/watch workspace registry changes and refresh/reconcile native state on invalidation.
5. **Presentation reconciliation and pins:** preserve presentation across snapshot refresh, render a pinned section, and expose errors.
6. **Managed-service leases/compatibility:** strengthen reuse and descriptor ownership after the core revision contract is stable.
7. **Hermetic native smoke:** isolate service/config for all graphical gates and improve failure diagnostics.

## Verification matrix for the repair

- Multi-workspace snapshot followed by launch from first, middle, and last workspace; restart and service reuse included.
- Configured command with three argv elements, embedded quote, spaces, Unicode, environment and port values; assert visible output.
- Create workspace through TUI while native app is open; assert list update without restart.
- Pin/unpin/reorder, refresh snapshot, restart app; assert exact presentation restoration.
- Idle SSE shutdown at every point in the heartbeat interval; require bounded shutdown below one second.
- Replay disconnect/reconnect, duplicate, gap, and snapshot refresh with monotonic cursor.
- Stale descriptor with live unrelated PID, incompatible service build, changed config root, revoked credential, and owner/reuser shutdown.
- Generic native smoke with no user config present and with a deliberately broken real user descriptor; results must remain identical and emit READY.

## Scope note

This audit is based on current source and focused read-only tracing. No production files were modified and no destructive service lifecycle action was taken.
