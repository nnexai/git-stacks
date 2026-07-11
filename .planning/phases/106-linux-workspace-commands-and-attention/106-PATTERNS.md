# Phase 106: Linux Workspace, Commands, and Attention - Pattern Map

**Mapped:** 2026-07-11
**Dispatch:** Generic-agent workaround for `gsd-pattern-mapper`
**Files analyzed:** 22 proposed new or modified files
**Analogs found:** 5 strong codebase analog families covering all 22 files

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/service/contract.ts` | model/schema | request-response, event-driven | same file, strict service schemas | exact extension |
| `src/lib/service/snapshot.ts` | service | request-response, transform | `tests/lib/service/launch-context.test.ts` + current snapshot builder | exact extension |
| `src/lib/service/event-journal.ts` | service/store | event-driven, append-only file I/O, replay | same file | exact extension |
| `src/lib/agent-hooks/types.ts` | model/provider contract | event-driven | same file + `src/lib/messages.ts` | role match |
| `src/lib/agent-hooks/claude-code.ts` | provider | event-driven | same file + `src/lib/messages.ts` publication seam | exact extension |
| `src/lib/agent-hooks/copilot.ts` | provider | event-driven | same file + `src/lib/messages.ts` publication seam | exact extension |
| `tests/lib/service/native-launch.test.ts` | test | request-response | `tests/lib/service/launch-context.test.ts` | exact role/flow |
| `tests/lib/agent-hooks/structured-attention.test.ts` | test | event-driven | `tests/lib/messages.test.ts` and `tests/lib/agent-hooks.test.ts` | role match |
| `tests/lib/service/event-journal.test.ts` | test | event-driven, file I/O | same file's existing journal tests | exact extension |
| `native/core/model.zig` | model/store | event-driven, transform | same file's normalized Phase 105 state | exact extension |
| `native/core/reducer.zig` | reducer/controller | event-driven, effects | same file's pure action/effect reducer | exact extension |
| `native/core/persistence.zig` | persistence utility | file I/O, transform | same file's ended-only tolerant restore | exact extension |
| `native/core/contract.zig` | boundary validator | request-response, transform | same file's recursive identity validation | exact extension |
| `native/core/abi.zig` | adapter/provider | request-response | same file's opaque handle and structured error ABI | exact extension |
| `native/linux/application.zig` | controller/component | event-driven | `native/linux/app.zig` + `native/linux/terminal_host.zig` | partial; composition point exists |
| `native/linux/workspace_view.zig` | component | event-driven, transform | `native/linux/app.zig` boundary plus core projection | partial; first real GTK view |
| `native/linux/tab_registry.zig` | service/store | event-driven, resource lifecycle | `native/linux/terminal_host.zig` | strong lifecycle match |
| `native/linux/command_launcher.zig` | component/controller | request-response, event-driven | `src/lib/service/contract.ts` launch schema + reducer effects | cross-layer match |
| `native/linux/attention_view.zig` | component/controller | event-driven, transform | `native/core/reducer.zig` action/effect split | cross-layer match |
| `native/tests/workspace_ui_test.zig` | test | event-driven | `native/tests/reducer_test.zig` | role match |
| `native/tests/tab_registry_test.zig` | test | event-driven, resource lifecycle | `native/tests/terminal_host_test.zig` | strong match |
| `native/tests/attention_test.zig` | test | event-driven, transform | `native/tests/reducer_test.zig` | exact role/flow |

The research's filenames are proposed seams, not permission to duplicate authority. In particular, GTK files must project core state and dispatch actions; they must not become independent stores.

## Strong Existing Analogs

### 1. Strict service contract and authoritative launch projection

**Primary sources:** `src/lib/service/contract.ts`, `tests/lib/service/launch-context.test.ts`

Use strict Zod objects, stable UUID identities, discriminated event unions, and structured API errors. Extend the existing launch types with opaque command identity/scope and add a fresh resolution request/response rather than executing snapshot display data.

**Schema pattern** (`src/lib/service/contract.ts:57-85`):

```typescript
export const RepositorySnapshotSchema = z.strictObject({
  id: EntityIdSchema, name: z.string().min(1), mode: z.enum(["worktree", "trunk", "dir"]), path: z.string().min(1),
})
export const LaunchStepSchema = z.strictObject({
  bucket: z.enum(["pre", "main", "post"]),
  scope: z.enum(["workspace", "repo"]),
  command: z.string().min(1),
  cwd: z.string().min(1),
  repository_id: EntityIdSchema.optional(),
  repository_name: z.string().min(1).optional(),
  environment: z.record(z.string(), z.string()),
}).refine((step) => step.scope === "repo" ? Boolean(step.repository_id && step.repository_name) : !step.repository_id && !step.repository_name, {
  message: "repository identity is required only for repository-scoped steps",
})
```

**Structured outcome pattern** (`src/lib/service/contract.ts:23-34`):

```typescript
export const ApiErrorSchema = z.strictObject({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean().optional(),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
})
export const ErrorEnvelopeSchema = z.strictObject({ ...EnvelopeBase, ok: z.literal(false), error: ApiErrorSchema })
export const successEnvelope = <T extends z.ZodType>(data: T) => z.strictObject({ ...EnvelopeBase, ok: z.literal(true), data })
```

**Test construction and non-execution pattern** (`tests/lib/service/launch-context.test.ts:55-77`):

```typescript
test("projects ordered workspace and repository command steps without executing them", async () => {
  let planned = 0
  const instance = builder({ planManualCommand: (_workspace, name) => {
    planned++
    expect(name).toBe("dev")
    return [
      { bucket: "main", scope: "workspace", commandName: "dev", shell: "bun dev", cwd: "/tasks/alpha" },
      { bucket: "main", scope: "repo", commandName: "dev", shell: "bun test --watch", cwd: "/tasks/alpha/git-stacks", repoName: "git-stacks", repo: ws.repos[0] },
    ]
  } })
  const response = await instance.buildWorkspace("alpha", "req_0123456789abcdef")
  expect(planned).toBe(1)
  expect(WorkspaceSnapshotResponseSchema.parse(response)).toEqual(response)
})
```

Apply this family to service contract/snapshot changes, command launcher inputs, and `native-launch.test.ts`. Preserve the secret-redaction assertions at `tests/lib/service/launch-context.test.ts:80-86`.

### 2. Durable ordered attention journal and additive hook publication

**Primary sources:** `src/lib/service/event-journal.ts`, `src/lib/messages.ts`

Structured attention belongs in the validated durable event stream. Hooks/messages publish through an injected adapter; legacy message persistence is not silently made dependent on optional structured delivery.

**Serialized validate-before-append pattern** (`src/lib/service/event-journal.ts:89-110`):

```typescript
private async append(build: (sequence: string, timestamp: string) => ServiceEvent): Promise<ServiceEvent> {
  return this.serialized(async () => {
    await this.initialize()
    const event = ServiceEventSchema.parse(build(this.nextSequence.toString(), new Date(this.now()).toISOString()))
    const handle = await open(this.path, "a", 0o600)
    try {
      await handle.write(`${JSON.stringify(event)}\n`, null, "utf8")
      await handle.sync()
    } finally { await handle.close() }
    this.records.push(event)
    this.nextSequence += 1n
    return event
  })
}
```

**Replay-gap pattern** (`src/lib/service/event-journal.ts:125-138`):

```typescript
const requested = cursor(after)
const earliest = this.records[0] ? cursor(this.records[0].sequence) : this.nextSequence
const latest = this.records.at(-1) ? cursor(this.records.at(-1)!.sequence) : this.nextSequence - 1n
if (this.records.length && requested < earliest - 1n) {
  return { kind: "replay_gap", requested: after, earliest_cursor: earliest.toString(), latest_cursor: latest.toString(), snapshot_revision: await this.snapshotRevision() }
}
return { kind: "events", events: this.records.filter((record) => cursor(record.sequence) > requested && cursor(record.sequence) <= upper) }
```

**Injected additive publication pattern** (`src/lib/messages.ts:63-70`):

```typescript
const publication = attentionPublication
if (publication) {
  try {
    const workspaceId = await publication.workspaceId(workspace)
    await publication.publish({ workspace_id: workspaceId, code: "message", message: text })
  } catch {
    // Structured attention delivery is additive; legacy message persistence stays authoritative.
  }
}
```

Replace the underspecified payload with a strict lifecycle event carrying attention, workspace, optional repository/surface, source, timestamp/sequence, and safe presentation fields. Keep deduplication/order in the journal and derive counts in native state; never increment independent widget counters.

### 3. Pure normalized native state with explicit effects

**Primary sources:** `native/core/model.zig`, `native/core/reducer.zig`

Phase 106 should expand the one-surface foundation into identity-keyed entities, exact workspace-repository pair collections, ordered surfaces, attention items, selection, and presentation preferences. Preserve the existing rule that the reducer is pure and platform work is emitted as effects.

**State pattern** (`native/core/model.zig:3-22`):

```zig
pub const Connection = enum { disconnected_no_snapshot, connecting, ready, stale, refresh_required, incompatible, failed };
pub const Lifecycle = enum { live, ended, failed_cleanup };

pub const Surface = struct {
    id: [36]u8,
    predecessor_surface_id: ?[36]u8 = null,
    lifecycle: Lifecycle = .ended,
    order: u32 = 0,
};

pub const State = struct {
    connection: Connection = .disconnected_no_snapshot,
    revision: u64 = 0,
    sequence: u64 = 0,
    has_snapshot: bool = false,
    surface: ?Surface = null,
    attention_id: ?[36]u8 = null,
};
```

**Action/effect pattern** (`native/core/reducer.zig:4-17`):

```zig
pub const Action = union(enum) {
    connected: struct { revision: u64, sequence: u64 },
    disconnected,
    event: struct { revision: u64, sequence: u64 },
    refreshed: struct { revision: u64, sequence: u64 },
    relaunch: struct { new_surface_id: [36]u8 },
    terminal_ended: struct { surface_id: [36]u8 },
};

pub const Effect = union(enum) {
    none, refresh_service, persist,
    terminal_create: struct { id: [36]u8, predecessor: [36]u8 },
    platform_focus: [36]u8,
};
```

**Gap/duplicate handling pattern** (`native/core/reducer.zig:23-35`):

```zig
.connected => |a| {
    if (a.sequence <= state.sequence) state.duplicate_count += 1 else {
        state.connection = .ready; state.revision = a.revision; state.sequence = a.sequence; state.has_snapshot = true;
    }
},
.event => |a| {
    if (a.sequence <= state.sequence) state.duplicate_count += 1 else if (a.sequence != state.sequence + 1 or a.revision > state.revision) {
        state.connection = .refresh_required; effect = .refresh_service;
    } else state.sequence = a.sequence;
},
```

New focus behavior should follow the same shape: receiving attention only updates state; `select_attention` may emit an identity-addressed focus route. Navigation actions must remain read-neutral, and visible exact-surface focus should be a separate action that clears only that surface's current items.

### 4. Versioned, presentation-only, tolerant persistence

**Primary source:** `native/core/persistence.zig`

Persist stable identities, selected pair, pin/order preferences, tab title/order, ended status, and lineage. Never persist argv/environment, credentials, PTY ownership, or live process truth. Reconcile each entry independently and produce diagnostics for invalid or vanished identities.

**Record boundary** (`native/core/persistence.zig:5-17`):

```zig
pub const Record = struct {
    surface_id: [36]u8,
    workspace_id: ?[36]u8 = null,
    repository_id: ?[36]u8 = null,
    title: []const u8 = "",
    order: u32 = 0,
    cwd_label: []const u8 = "",
    last_exit_status: ?i32 = null,
    predecessor_surface_id: ?[36]u8 = null,
    lifecycle: model.Lifecycle = .ended,
};
pub const Diagnostic = struct { index: usize, hash: [16]u8, code: []const u8 };
```

**Per-entry recovery pattern** (`native/core/persistence.zig:61-77`):

```zig
for (entries.array.items, 0..) |entry, index| {
    const rendered = try std.fmt.allocPrint(a, "{any}", .{entry});
    const object = if (entry == .object) entry.object else {
        try result.diagnostics.append(a, .{ .index = index, .hash = shortHash(rendered), .code = "invalid_entry" }); continue;
    };
    const sid = object.get("surface_id") orelse {
        try result.diagnostics.append(a, .{ .index = index, .hash = shortHash(rendered), .code = "missing_identity" }); continue;
    };
    if (sid != .string or !identity.isUuid(sid.string)) {
        try result.diagnostics.append(a, .{ .index = index, .hash = shortHash(rendered), .code = "invalid_identity" }); continue;
    }
}
```

Use this exact tolerant-entry approach for vanished pins and stale selected identities: preserve valid neighbors, remove invalid references, select a deterministic fallback, and surface a bounded one-time notice.

### 5. Registry-owned terminal lifecycle and stale-callback defense

**Primary sources:** `native/linux/terminal_host.zig`, `native/tests/terminal_host_test.zig`

`tab_registry.zig` should own `TerminalHost` instances by surface identity and expose pair-indexed ordered collections. Changing the selected pair must only alter view selection; it must not call `exit` or `unrealize`.

**Registration-before-live pattern** (`native/linux/terminal_host.zig:18-31`):

```zig
pub fn realize(self: *TerminalHost, backend: anytype, client_pgid: i32, guard_pgid: i32) !void {
    if (self.realized) return error.AlreadyRealized;
    self.generation +%= 1;
    self.graphics_ready = true;
    self.terminal.create();
    self.controllers_connected = true;
    // Ownership registration is the final step before public liveness.
    try self.owner.exposeLive(backend, client_pgid, guard_pgid);
    self.realized = true;
}
```

**Input ownership and shortcut arbitration** (`native/linux/terminal_host.zig:38-49`):

```zig
pub fn focus(self: *TerminalHost, value: bool) !void { try self.active(); try self.terminal.dispatch(.{ .focus = value }); }
pub fn key(self: *TerminalHost, value: adapter.KeyEvent) !void { try self.active(); if (!value.native_shortcut) try self.terminal.dispatch(.{ .key = value }); }
pub fn text(self: *TerminalHost, value: []const u8) !void { try self.active(); try self.terminal.dispatch(.{ .text = value }); }
pub fn preedit(self: *TerminalHost, value: []const u8, cursor: usize) !void { try self.active(); try self.terminal.dispatch(.{ .preedit = .{ .text = value, .cursor = cursor } }); }
```

**Reverse teardown and generation invalidation** (`native/linux/terminal_host.zig:50-57`):

```zig
pub fn unrealize(self: *TerminalHost, backend: anytype) !void {
    if (!self.realized) return;
    self.controllers_connected = false; self.teardown_stage = .controllers_disconnected;
    self.generation +%= 1; self.teardown_stage = .work_stopped;
    try self.owner.close(backend);
    self.terminal.destroy(); self.teardown_stage = .surface_released;
    self.graphics_ready = false; self.realized = false; self.teardown_stage = .gpu_released;
}
```

**Lifecycle test style** (`native/tests/terminal_host_test.zig:29-41`):

```zig
const token = window.callbackToken();
try window.key(.{ .key = 'c', .mods = 1, .native_shortcut = true });
try std.testing.expectEqual(@as(usize, 0), terminal.events.items.len);
try window.unrealize(&backend);
try std.testing.expect(!window.dispatchQueued(token, .draw));
try std.testing.expectEqual(host.TeardownStage.gpu_released, window.teardown_stage);
```

Add pair-switch churn tests that retain the same host generation, ownership registration, and PGID. A failed service resolution or failed host startup must leave both registry and tab collection unchanged.

## GTK Composition Assignment

Phase 105 intentionally has only a toolkit-neutral shell seam (`native/linux/app.zig:5-9`):

```zig
/// Minimal single-window shell composition point. Toolkit-specific handles are
/// intentionally introduced only by the eventual executable wrapper.
pub fn createTerminalHost(terminal: *adapter.Adapter, owner: ownership.Owner) host.TerminalHost {
    return host.TerminalHost.init(terminal, owner);
}
```

Therefore the GTK files have no same-role in-repository widget analog yet. Their correct local pattern is architectural:

- `application.zig` owns GTK/libadwaita objects, scoped actions, accelerators, and effect execution.
- `workspace_view.zig`, `command_launcher.zig`, and `attention_view.zig` receive projected immutable/core-owned state plus stable-ID callbacks.
- `tab_registry.zig` owns hosts independently of whether GTK currently displays their pair.
- GTK row bind/unbind callbacks carry stable IDs and reset all labels, CSS state, signal handlers, accessible descriptions, and drag state.
- Menus, shortcuts, tab-bar double click, and buttons converge on the same GAction/action-dispatch path.
- Incoming service events never call GTK present/focus/navigation APIs.

## Shared Patterns

### Boundary validation

Follow `native/core/contract.zig:8-17` and `:20-40`: reject empty/oversized/non-UTF-8/non-v1 input, recursively validate known identities, and keep GTK/terminal types out of core. Extend known identity validation to command, surface, and attention IDs.

### ABI error ownership

Follow `native/core/abi.zig:41-47` and `:56-73`: clear outputs first, return status codes, allocate structured JSON errors through the ABI-owned allocator, and leave the opaque model handle null on failure.

### No phantom state

Service resolution succeeds first, terminal registration-before-live succeeds second, then reducer state appends the live tab. On either failure, keep the launcher open, return a structured safe error, and do not add a tab or persist a surface.

### Accessibility and focus

Retain `TerminalHost`'s native-shortcut arbitration and explicit text/preedit routes. Standard GTK controls own traversal; application actions consume only documented shortcuts. Status must use icon/text/count/accessible description in addition to color.

### Verification wiring

Follow `scripts/verify-native.ts:54-67` for canonical fixture export/drift checking and `:79-99` for architectural boundary audits. New TypeScript contract fixtures should be exported to native fixtures and included in the explicit allowlist; new native targets should be wired through `native/build.zig` and script/package commands rather than invoked with ambient Zig.

## Anti-Patterns to Reject During Planning

- Treating workspace/repository names, command display names, or GTK row pointers as identity.
- Keeping tabs, pins, unread counts, or selection only in widgets.
- Reusing snapshot launch strings as current execution authority.
- Creating a visible tab before resolution and host registration both succeed.
- Calling `TerminalHost.unrealize()` during ordinary pair navigation.
- Clearing descendant attention on workspace/repository navigation.
- Emitting focus effects when an attention event arrives.
- Parsing terminal output or free-form legacy messages into lifecycle state.
- Persisting argv, environment, credentials, ownership, PID/PGID, or live lifecycle.
- Adding GTK/Ghostty types to `native/core` or the public ABI.

## Planner Handoff

Plan contract-first: service identities/fresh resolution/structured attention and fixtures; then normalized native model/reducer/persistence/ABI; then registry lifecycle; then GTK projections/actions; finally focused automation plus real-session UAT. The highest-risk proof is that switching workspace-repository pairs does not unrealize, recreate, or change the generation/PGID of hidden live hosts.
