# Phase 107: Beautify Native Workspace UI and Finalize UX - Pattern Map

**Mapped:** 2026-07-12
**Dispatch:** Generic-agent workaround for `gsd-pattern-mapper`
**Scope source:** Reopened `107-CONTEXT.md`, `107-UI-REVIEW.md`, requirements LNX-07/LNX-08/LNX-09/ACT-07
**Files analyzed:** 32 proposed new/modified file groups
**Analogs found:** 30 / 32 (two areas have only partial local analogs)

There is no `107-RESEARCH.md` on disk. This map therefore treats the reopened context, UI review, live implementation, and prior Phase 104-106 contracts as authoritative. Proposed filenames below are seams for the planner, not permission to duplicate engine or widget state.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/workspace-creation.ts` (new) | domain service/planner | transform, file I/O orchestration | `src/lib/workspace-recreate.ts` + `src/tui/workspace-wizard.ts` | strong role/flow match |
| `src/tui/workspace-wizard.ts` | controller | interactive request -> domain call | its current `createWorkspace()` delegation | exact extension |
| `src/lib/workspace-lifecycle.ts` | domain executor | transactional file/Git I/O | same file's operation-runner/commit boundary | exact extension |
| `src/lib/service/contract.ts` | wire schema/model | request-response, event-driven | same file's strict operation/event schemas | exact extension |
| `src/lib/service/operations.ts` | operation service | async request-response, progress, rollback | same file's open/close adapters and `OperationRegistry` | exact extension |
| `src/service/server.ts` | authenticated route/controller | request-response, SSE | same file's admission-first mutation route | exact extension |
| `src/service/main.ts` | composition/lifecycle owner | event-driven, resource lifecycle | same file's journal/broker/operation/idle composition | exact extension |
| `src/lib/service/workspace-change-monitor.ts` (new) | monitor/service | filesystem events, debounce, periodic recovery | `createIdleLifecycle()` + snapshot dependency injection + event journal | partial; no watcher exists |
| `src/lib/service/snapshot.ts` | projection service/store | file I/O, transform, revisioning | same file's stable aggregate builder | exact extension |
| `src/lib/service/event-journal.ts` | append-only store | durable pub-sub/replay | same file's operation/attention append methods | exact extension |
| `src/lib/config.ts` | config store/cache | YAML file I/O | `invalidateConfigCache()` and external-edit tests | exact extension |
| `src/lib/agent-hooks/codex.ts` (new) | provider/plugin | JSON file merge, event-driven commands | `claude-code.ts` merge behavior + tracked `.codex/hooks.json` shape | strong role match |
| `src/lib/agent-hooks/types.ts`, `index.ts` | provider contract/registry | transform, plugin dispatch | same files | exact extension |
| `src/commands/install.ts` | CLI controller | interactive/flag-driven plugin dispatch | same file's Claude/Copilot resolution | exact extension |
| `src/commands/service.ts` | best-effort publisher | authenticated request-response | `src/lib/messages.ts` additive publication/IPC | strong behavioral match |
| `native/linux/service_client.zig` | protocol adapter/client | HTTP request-response, SSE | same file's launch/snapshot/event methods | exact extension |
| `native/linux/workspace_creation.zig` (new) | UI-neutral controller/store | form transform, async operation state | `native/linux/command_launcher.zig` | strong role match |
| `native/linux/app_graph.zig` | composition/reconciliation service | snapshot/event transform | same file's identity-preserving refresh | exact extension |
| `native/core/model.zig`, `reducer.zig`, `abi.zig` | shared model/reducer/ABI | event-driven transform | same files' attention/focus actions | exact extension |
| `native/linux/attention_view.zig` | presentation controller | model -> provider-aware rows/routes | same file + reducer focus route | exact extension |
| `native/linux/command_launcher.zig` | UI-neutral controller | query/filter/selection | same file | exact extension |
| `native/linux/workspace_view.zig`, `application.zig` | presentation/actions | event-driven projection | same files' page/action contracts | exact extension |
| `native/linux/app.zig` | GTK/libadwaita composition | event-driven widgets, worker handoff | command launcher dialog, GActions, close-page transaction | strong partial match |
| `native/build.zig`, `package.json` | build/test config | batch orchestration | existing explicit native test steps | exact extension |
| `scripts/verify-native.ts` | acceptance harness | process/service orchestration | existing workspace lifecycle smoke | exact extension |
| `tests/lib/workspace-creation.test.ts` (new), lifecycle tests | domain tests | transform, Git/file rollback | `workspace-recreate.test.ts` + `workspace-lifecycle-create.test.ts` | strong role match |
| `tests/lib/service/workspace-change-monitor.test.ts` (new) | monitor test | fake watcher/timer, event-driven | snapshot/config/journal tests | partial; no watcher test exists |
| `tests/service/workspace-create.test.ts`, `events.test.ts` | transport integration tests | auth, operation, SSE replay | existing service security/operations/events tests | exact extension |
| `tests/lib/agent-hooks.test.ts`, `structured-attention.test.ts` | provider tests | JSON file I/O, command transform | same files' Claude/Copilot tables | exact extension |
| `native/tests/service_client_test.zig`, `workspace_creation_test.zig` | adapter/controller tests | request/response transform | existing service-client and launcher tests | exact/strong match |
| `native/tests/app_graph_test.zig` | reconciliation test | snapshot/event transform, ownership | persistence + tab-registry tests | strong match |
| `native/tests/application_actions_test.zig`, `workspace_ui_test.zig`, `accessibility_test.zig` | GTK contract tests | event-driven interaction/semantics | same files plus `app_contract_test.zig` | exact extension |

## Pattern Assignments

### 1. Prompt-free workspace creation domain

**Targets:** `src/lib/workspace-creation.ts`, `src/tui/workspace-wizard.ts`, `src/lib/workspace-lifecycle.ts`, creation tests.

**Primary analogs:** `src/lib/workspace-recreate.ts`, `src/tui/workspace-wizard.ts`, `src/lib/workspace-lifecycle.ts`.

Use `workspace-recreate.ts` as the strongest structural analog: a synchronous, prompt-free planner resolves registry/template state and fails before mutation; a separate async executor owns side effects and rollback.

**Plan/apply split** (`src/lib/workspace-recreate.ts:24-33`, `:103-135`):

```typescript
export function planWorkspaceRecreate(
  workspace: Workspace,
  template: Template,
  registry: RepoRegistryEntry[],
  tasksDir: string,
): WorkspaceRecreatePlan {
  const registryByName = new Map(registry.map((entry) => [entry.name, entry]))
  const missing = template.repos.filter((repo) => !registryByName.has(repo.repo)).map((repo) => repo.repo)
  if (missing.length > 0) throw new Error(`Template references missing registry repos: ${missing.join(", ")}`)
  // ...materialize desired state without side effects...
}

export async function applyWorkspaceRecreate(plan: WorkspaceRecreatePlan): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // preflight, mutate, then writeWorkspace(plan.desired)
    return { ok: true }
  } catch (error) {
    // reverse created/removed worktrees and return a structured expected failure
  }
}
```

The new module should expose strict request/catalog types and a prompt-free resolver such as:

```typescript
type WorkspaceCreationRequest = {
  name: string
  branch: string
  source:
    | { kind: "template"; template: string }
    | { kind: "repositories"; repositories: string[] }
}
```

Resolve template composition, registered paths, `dir` versus `worktree`, task paths, hooks, commands, env, files, integration settings, ports, and labels in the engine. Do not import `@clack/prompts`, call `process.exit`, or return paths for the native client to interpret.

**Current template/repository materialization** (`src/tui/workspace-wizard.ts:77-132`):

```typescript
const registryMap = new Map(registry.map(r => [r.name, r]))
for (const tplRepo of template.repos) {
  const regEntry = registryMap.get(tplRepo.repo)
  // directory repos reference main_path; worktree repos receive task_path
  // and base_branch comes from template override or registry default.
}
```

Move this policy, not its prompt logging, into the domain module. For direct repository selection, map registered directories to `dir` and ordinary repositories to `worktree`; the reopened dialog intentionally has only name, branch, and source as primary inputs.

**Existing transactional executor boundary** (`src/lib/workspace-lifecycle.ts:655-687`, `:797-820`):

```typescript
for (const repo of worktreeRepos) {
  await runner.do(
    `create worktree ${repo.name}`,
    async () => { creation = await createWorktree(repo.main_path, repo.task_path, inputs.branch) },
    async () => { /* remove worktree and restore/delete branch */ },
  )
}
const runnerResult = runner.result()
if (!runnerResult.ok) return { ok: false, error: runnerResult.error, rollbackErrors: runnerResult.rollbackErrors }
writeWorkspace(workspaceObj) // commit point
```

Keep this as the single side-effect engine. Add any same-name creation lease and final existence recheck at this shared boundary so CLI, TUI, and service requests cannot race. Validation must include `NameSchema`, nonempty/valid Git branch (`git check-ref-format --branch` through the repo's injectable subprocess style), one source variant, at least one unique repository, every template repo present, and no pre-existing workspace.

The TUI should retain prompts only, then delegate to the shared request/planner/executor just as it already delegates resolved inputs to `createWorkspace()` at `src/tui/workspace-wizard.ts:647-668`.

### 2. Authenticated catalog and idempotent create operation

**Targets:** `src/lib/service/contract.ts`, `src/lib/service/operations.ts`, `src/service/server.ts`, `src/service/main.ts`, service tests.

**Primary analogs:** strict service schemas, `OperationRegistry`, existing mutation route.

**Strict schema and envelope pattern** (`src/lib/service/contract.ts:27-38`):

```typescript
export const ApiErrorSchema = z.strictObject({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean().optional(),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
})
export const successEnvelope = <T extends z.ZodType>(data: T) =>
  z.strictObject({ ...EnvelopeBase, ok: z.literal(true), data })
```

Add strict catalog and create request schemas beside the existing contract types. Prefer route-specific schemas over placing creation fields inside the current arbitrary `options` record. The catalog may expose names, descriptions, default/branch-pattern hints, repo type/default branch/directory flag, and explicit service limits; it must not make the client resolve YAML or paths.

**Admission-first route and idempotency pattern** (`src/service/server.ts:286-339`):

```typescript
const admission = authenticateAdmission(request.headers.get("authorization"), { serviceRoot: options.serviceRoot })
if (!admission.ok) return json(admission.body, admission.status)
// auth and rate checks precede route lookup and body parsing

const key = request.headers.get("idempotency-key")
if (!key || key.length > 256) return failure(id, "invalid_request", "A valid Idempotency-Key header is required", 400)
const operation = await options.operations.submit({
  clientId: admission.client.clientId,
  endpoint: mutation,
  idempotencyKey: key,
  request: parsed.data,
  execution: adapter(parsed.data, signal),
})
return json(success(id, operation), 202)
```

Catalog and create must stay behind this exact admission boundary. Register `workspace.create` through the existing operation registry rather than inventing a synchronous POST.

**Progress adapter pattern** (`src/lib/service/operations.ts:374-397`):

```typescript
const adapt = (name: "open" | "close", invoke: WorkspaceFunction): WorkspaceMutation => (request) => ({
  steps: [{
    name: `workspace.${name}`,
    stage: "executing",
    message: `${name === "open" ? "Opening" : "Closing"} workspace`,
    run: async (report) => {
      let progressQueue = Promise.resolve()
      const result = await invoke(request.workspace, { ...request.options, captured: true }, (message) => {
        progressQueue = progressQueue.then(() => report({ message })).then(() => undefined)
      })
      await progressQueue
      if (!result.ok) throw new Error(result.error ?? `Workspace ${name} failed`)
    },
  }],
})
```

Copy the serialized progress-callback bridge. Preserve `createWorkspace()` rollback failures in the terminal operation error/details rather than flattening them into a misleading `rollback_attempted: false`. Do not expose a native Cancel button unless creation becomes cooperatively cancellable at safe internal boundaries; the registry currently notices cancellation only between operation steps.

The successful result should identify the workspace and announce authoritative change, for example `{ workspace, snapshot_changed: true }`. Native refresh still consumes a snapshot; operation output is not a substitute workspace model.

### 3. Service-owned workspace-change monitoring and replayable invalidation

**Targets:** new monitor, snapshot/config/journal contract, service composition, native invalidation handling, monitor/events tests.

There is no filesystem-watch/debounce implementation in the repo. Do not disguise polling in the native client as the analog. Compose the new monitor from four existing patterns:

1. dependency injection like `SnapshotDependencies` (`src/lib/service/snapshot.ts:108-120`);
2. injectable/disposable timer ownership like `createIdleLifecycle()` (`src/service/main.ts:30-62`);
3. explicit cache invalidation (`src/lib/config.ts:32-36`);
4. serialized durable journal append followed by broker publication.

**Cache invalidation behavior already tested** (`tests/lib/config.test.ts:1314-1354`):

```typescript
writeFileSync(wsFile, `${makeWsYaml("external-ws")}description: after\n`)
expect(realReadWorkspace("external-ws").description).toBe("before")
realInvalidateConfigCache()
expect(realReadWorkspace("external-ws").description).toBe("after")
// The same pattern removes externally deleted list entries.
```

**Durable append-before-publish pattern** (`src/lib/service/event-journal.ts:89-111`, `:166-173`):

```typescript
const event = ServiceEventSchema.parse(build(this.nextSequence.toString(), new Date(this.now()).toISOString()))
const handle = await open(this.path, "a", 0o600)
try { await handle.write(`${JSON.stringify(event)}\n`, null, "utf8"); await handle.sync() }
finally { await handle.close() }
this.records.push(event)
this.nextSequence += 1n

const event = await journal.appendOperation(operation)
if (publish) await publish(event)
```

Add a validated control event such as `snapshot_invalidated { revision }`. Append it through `EventJournal`, then publish the returned record through `EventBroker`; never publish a non-durable invalidation. Successful service mutations call the same invalidator as filesystem changes.

Monitor contract:

- service-owned watcher covers absent-directory creation plus atomic rename/write/remove bursts;
- debounce/coalesce by rebuilding the aggregate and comparing its revision, not by filename count;
- a cheap periodic directory fingerprint recovers missed watch events;
- `startManagedService()` owns start/dispose just as it owns the attention publication, broker, server, and idle lifecycle;
- tests inject watcher, clock, timers, fingerprint, and rebuild callbacks; no real sleeps;
- snapshot enumeration explicitly bypasses stale in-process indexes and advances revision for the empty aggregate.

**Broker handoff remains unchanged** (`src/lib/service/event-broker.ts:132-150`): replay is registered inside the journal serialization boundary, retained events enqueue before live publication, and slow consumers close independently. The new control event should use that path unchanged.

### 4. Native client/controller, background operation, and zero-workspace shell

**Targets:** `service_client.zig`, new `workspace_creation.zig`, `app_graph.zig`, `application.zig`, `workspace_view.zig`, `app.zig`, native tests.

**Protocol request pattern** (`native/linux/service_client.zig:182-212`):

```zig
fn request(self: *Client, method: Method, path: []const u8, body: []const u8) !Request {
    if (self.cancelled) return error.Cancelled;
    if (!std.mem.startsWith(u8, self.authorization, "Bearer ")) return error.MissingCredential;
    return .{ .method = method, .path = path, .authorization = self.authorization, .body = body };
}
pub fn launchRequestAlloc(...) !Request {
    const body = try std.fmt.allocPrint(allocator, "{...}", .{ ... });
    return self.request(.POST, "/v1/native-launch", body);
}
```

Extend `Request`/transport with content type and idempotency key, use JSON-safe encoding for user-entered name/branch, decode catalog/accepted-operation/progress/failure/control events strictly, and keep bearer/path/loopback validation intact. One idempotency key belongs to one form submission and must be reused after an ambiguous transport failure.

**UI-neutral controller analog** (`native/linux/command_launcher.zig:3-14`):

```zig
pub const Launcher = struct {
    state: *const model.State,
    pair: model.PairKey,
    open: bool = false,
    error_message: [192]u8 = [_]u8{0} ** 192,
    error_len: u8 = 0,

    pub fn canLaunch(self: *const Launcher) bool { return self.state.connection == .ready; }
    pub fn collect(self: *const Launcher, query: []const u8, out: []Item) usize { /* pure projection */ }
    pub fn fail(self: *Launcher, message: []const u8) void { /* bounded user-visible error */ }
};
```

Make `workspace_creation.zig` the analogous form/operation state machine: catalog loading, source kind/selection, name/branch values, whether branch was manually edited, validation, generated idempotency identity, accepted/running/succeeded/failed state, progress, rollback details, and created workspace name. It must contain no GTK types and no YAML access.

**Worker -> GTK handoff pattern** (`native/linux/app.zig:292-389`):

```zig
const dispatch = state.graph.allocator.create(ReplayDispatch) catch continue;
dispatch.* = .{ .state = state, .frame = try allocator.dupe(u8, frame) };
_ = c.g_main_context_invoke(null, @ptrCast(&reduceReplayFrame), dispatch);
```

Catalog/create/poll/snapshot network work belongs on a worker-owned `HttpTransport`. Dispatch owned results to the GTK main context, coalesce refresh requests by revision, join/cancel workers during cleanup, and never perform snapshot HTTP/Git projection inside an idle callback on the GTK thread.

**Identity-preserving refresh to extend** (`native/linux/app_graph.zig:53-75`):

```zig
const previous = self.state;
self.state = reducer.reduce(self.state, action).state;
for (previous.pins[0..previous.pin_count]) |id| if (model.workspaceValid(&self.state, id)) { /* retain */ }
for (previous.pairs[0..previous.pair_count]) |old_pair|
    if (model.pairIndex(&self.state, old_pair.key)) |index| {
        self.state.pairs[index].surface_count = old_pair.surface_count;
        @memcpy(self.state.pairs[index].surfaces[0..old_pair.surface_count], old_pair.surfaces[0..old_pair.surface_count]);
    };
```

Extend this explicit merge to retain unread attention and recompute resolution. For a vanished authoritative pair with a live registry host, retain an explicit orphan pair/presentation until the owned terminal ends or the user confirms close. Do not destroy it because a snapshot omitted the pair.

`tab_registry.Registry` is the ownership authority (`native/linux/tab_registry.zig:22-45`): navigation/refresh may attach or detach presentation, while only explicit close, child exit, or quit calls terminal teardown.

Zero-workspace behavior must remove the current startup precondition that resolves and constructs a terminal before the window. Build the window/dialog/status pages with an optional initial terminal; after successful creation, refresh, select the created workspace's first repository, then use the existing registration-before-visible `createTerminal()` transaction.

**Reusable dialog ownership** (`native/linux/app.zig:1674-1708`):

```zig
const dialog = c.adw_dialog_new() orelse return null;
_ = c.g_object_ref_sink(dialog);
state.launcher = @ptrCast(dialog);
c.adw_dialog_set_title(@ptrCast(dialog), "Run command");
c.adw_dialog_set_child(@ptrCast(dialog), launcher_box);
c.adw_dialog_set_focus(@ptrCast(dialog), search);
_ = c.g_signal_connect_data(dialog, "closed", @ptrCast(&launcherClosed), state, null, 0);
```

Use the same state-owned reusable-dialog lifecycle for creation. Present it from a sidebar `+`, header/menu action, `Ctrl+Shift+N`, and the empty-status primary action; all converge on one `win.new-workspace` GAction.

### 5. Codex hook plugin and provider-aware attention

**Targets:** Codex plugin, hook registry/types/install command, best-effort publication, native model/decoder/view/routing, hook and attention tests.

**Plugin shape** (`src/lib/agent-hooks/types.ts:26-35`):

```typescript
export interface AgentHookPlugin {
  id: string
  label: string
  generateHookEntries(workspaceName: string): HookEntry[]
  install(repoWorktreePath: string, workspaceName: string): void
  remove(repoWorktreePath: string): void
}
```

Widen the source type in `structuredAttentionCommand()` and register/export `codexPlugin` beside Claude/Copilot. `install.ts` should extend its current flag/interactive registry resolution rather than special-case installation outside `agentHookPlugins`.

**Merge-preserving JSON plugin analog** (`src/lib/agent-hooks/claude-code.ts:78-122`):

```typescript
const data = readSettings(settingsPath)
const existingHooks = (data.hooks ?? {}) as HooksConfig
const cleaned: HooksConfig = {}
for (const [event, groups] of Object.entries(existingHooks)) {
  const kept = groups.filter((g) => !isGitStacksGroup(g))
  if (kept.length > 0) cleaned[event] = kept
}
// merge fresh entries, preserve unrelated settings, write one JSON document
```

Copy the preserve/clean/merge/idempotency structure, but improve marker precision: Codex remove/install should match commands containing both `service attention publish` and `--source codex`, not every command mentioning `git-stacks`. Malformed existing JSON must fail closed without overwriting the file.

The tracked `.codex/hooks.json:1-47` is the closest in-repo document-shape example (`hooks` keyed by event, nested command handlers, optional timeout). Treat it as a format analog only; do not copy GSD-specific absolute paths or assume every legacy event is a truthful Codex lifecycle signal.

Use only lifecycle states Codex exposes in the accepted hook contract: prompt submission -> working, permission request -> waiting, post-tool continuation -> working, stop -> completed. Do not fabricate general failure, arbitrary-question, or idle events when the provider supplies no truthful event.

**Best-effort optional delivery pattern** (`src/lib/messages.ts:63-70`, `:107-137`):

```typescript
if (publication) {
  try { await publication.publish(attention) }
  catch { /* additive delivery never breaks authoritative behavior */ }
}

try {
  await Promise.race([connectAndWrite(), timeout])
} catch {
  // never propagate
}
```

The hook-facing publish command needs an explicit quiet/best-effort mode or equivalent behavior: absent/stale service descriptor, refused connection, or workspace not yet in a snapshot must exit successfully and produce no routine stderr noise. Ordinary manually invoked service diagnostics can remain strict.

**Attention state to extend** (`native/core/model.zig:35`, `native/linux/service_client.zig:553-579`): current decoding validates source/title but stores neither. Add bounded provider/title/detail/occurred-at presentation fields to `model.Attention`, parse them in `service_client.zig` and `abi.zig`, and serialize them in canonical shared JSON. Preserve the service attention ID separately from the internal hash identity.

**Focus routing remains reducer-owned** (`native/core/reducer.zig:79-120`): receiving attention updates state with no focus effect; explicit `select_attention` derives exact-surface/ended-predecessor/repository/workspace/unresolved routing; `exact_tab_visible` clears matching surface attention only. GTK attention rows should bind the stable attention ID to `win.focus-attention`, and production tab selection must dispatch `exact_tab_visible` before projection refresh.

Render provider, title, optional detail, unread state, and location in a real attention popover/list. Numeric badges remain derived aggregates; they are not the provider UI.

### 6. UI-review hardening: keyboard, semantics, close safety, adaptive/actionable states

**Targets:** `application.zig`, `command_launcher.zig`, `workspace_view.zig`, `attention_view.zig`, `app.zig`, UI/accessibility/action tests.

Preserve the existing convergence rule: buttons, menus, shortcuts, row activation, and context actions dispatch named `win.*` GActions from `application.actions`; do not create pointer-only side paths.

**Central action readiness** (`native/linux/application.zig:2-5`, `native/linux/app.zig:656-670`): action metadata owns accelerators/readiness, while `refreshProjection()` applies contextual enablement to the corresponding `GSimpleAction`. Add create/retry/refresh/attention and keyboard pin/reorder actions there.

**Keyboard launcher extension point** (`native/linux/app.zig:1367-1385`):

```zig
fn launcherKeyPressed(..., keyval: c.guint, ..., data: ?*anyopaque) callconv(.c) c.gboolean {
    if (keyval != c.GDK_KEY_Escape) return 0;
    // close and restore prior focus
}
fn launcherActivated(..., row: ?*c.GtkListBoxRow, ...) callconv(.c) void {
    // stable command index -> createTerminal -> record recent -> close dialog
}
```

Extend the focused search entry's controller with Down/Up selection and Enter activation. `refreshLauncher()` selects the first result when present and emits a distinct row for “no configured commands” versus “no matches”. Escape retains the existing focus-restoration behavior.

**Live-close interception transaction** (`native/linux/app.zig:1027-1059`):

```zig
if (state.programmatic_tab_close) return 0;
// inspect stable surface ID and lifecycle
// TRUE stops default propagation; close_page_finish commits the decision.
c.adw_tab_view_close_page_finish(view, selected_page, 1);
return 1;
```

Keep ended-tab removal immediate. For a live surface, stop propagation, present an `AdwAlertDialog`, and only after affirmative response call registry teardown/model removal and `close_page_finish`. Guard against double prompt and stale page/surface callbacks. Keyboard close and pointer close already converge here and must remain identical.

**Accessibility testing pattern** (`native/tests/accessibility_test.zig:7-29`): inspect real GTK roles/properties where possible and separately test redundant attention text. Improve production `setAccessible`: the current helper ignores its role argument, so the fix must set actual widget role/state plus label/description. Selected pair and active grouping need selected/pressed/current semantics, status pages need status semantics, icon-only menu/new-tab/create buttons need accessible labels and tooltips, and attention text must be attached to the rendered row/badge.

There is no in-repo `AdwBreakpoint`, `AdwOverlaySplitView`, `AdwStatusPage`, or `AdwAlertDialog` example. Use libadwaita primitives directly, but preserve local ownership/callback/GAction conventions:

- replace fixed, nonshrinking `GtkPaned` policy with the declared `application.Breakpoint` thresholds;
- make the sidebar overlay/collapse at narrow widths and allow dialogs to clamp to available size;
- use actionable status pages for empty/create, disconnected/retry, refresh-required/refresh, incompatible/details, and failure/retry;
- stale mode retains visible read-only content instead of coercing to a blank label;
- standardize “terminal” versus “shell” copy and map internal `@errorName` values to user-facing copy while keeping codes in logs/details.

## Shared Patterns

### Engine authority and scope fence

- Native code consumes authenticated catalog/snapshot/event/operation contracts only.
- Native code never imports, locates, watches, parses, or writes registry/template/workspace YAML.
- The service monitor owns filesystem observation; the TypeScript workspace domain owns resolution and mutation.
- External editor/session integrations remain command invocations; git-stacks does not inventory or own them.

### Authentication and protocol validation

Follow `src/service/server.ts:286-339`: authenticate before route existence, parsing, capability, or rate information. Follow `native/linux/service_client.zig:83-156`: accept loopback endpoints and protected descriptor/credential files only. All new request/response/event objects are strict and bounded.

Do not add an unplanned discovery capability key casually: `validDiscovery()` currently requires exactly five capability entries (`native/linux/service_client.zig:328-339`). Either keep creation discoverable through the existing operations capability plus catalog response, or update compatibility/golden fixtures intentionally.

### Stable identity over display names

Workspace/repository/surface/attention routing uses UUID or prefixed opaque identities. Names are display and creation inputs only. Rename reconciliation must use stable workspace IDs; operation completion may use the requested name only to locate the newly returned authoritative ID after refresh.

### Expected failure shape

TypeScript domain operations use discriminated `{ ok: true } | { ok: false; error }` results. Wire failures use `ApiError` with safe message, retryability, and bounded details. Native controllers retain user input and translate known codes into recovery copy; logs retain technical codes.

### Worker ownership and GTK confinement

Network, filesystem projection, and operation polling run off the GTK main thread with worker-owned transports. Owned immutable results cross through `g_main_context_invoke`; widget/model projection runs on GTK. Cleanup signals cancellation, joins workers, then destroys widgets/transports in existing reverse ownership order.

### Snapshot reconciliation

Treat authoritative entities and native presentation as separate inputs to one explicit reconciliation transaction:

- authoritative snapshot replaces workspace/repository/command fields;
- stable pins/order/selection survive when targets survive;
- live/ended surfaces survive by registry identity, including explicit orphan containers for vanished pairs;
- unread attention survives and recomputes `resolved`/nearest route;
- one selected fallback is chosen only after reconciliation;
- no refresh steals focus or presents a window.

### Additive attention

Hook publication is optional and silent on service absence. Journal append precedes broker publication. Incoming attention updates state only; focus is emitted only from explicit user activation. Exact-tab visibility clears exact-surface attention, not all workspace/repository attention.

### Test seams

- Production TypeScript uses relative imports; tests may use `@/*`.
- Subprocess modules expose mutable dependency objects; watcher/clock/timer/network workers need equivalent injected seams.
- Avoid real sleeps in monitor/operation tests.
- Extend canonical TypeScript/native fixtures when the shared wire/model contract changes.
- Register every new Zig test module in `native/build.zig`, surface it through `scripts/verify-native.ts`/`package.json`, and keep `native:verify` as the combined gate.

## Focused Test Pattern Map

| Behavior | Test analog to extend/copy |
|---|---|
| Template/direct-repo planning, missing registry, branch/name validation | `tests/lib/workspace-recreate.test.ts:22-51`; `tests/tui/workspace-wizard.test.ts` |
| Worktree rollback and commit-point safety | `tests/lib/workspace-lifecycle-create.test.ts` |
| Idempotent accepted create operation and progress | `tests/lib/service/idempotency.test.ts:23-97`; `tests/lib/service/operations.test.ts` |
| Auth/schema/rate/deadline behavior | `tests/service/security.test.ts`; `tests/service/operations.test.ts` |
| Durable invalidation replay and live handoff | `tests/lib/service/event-journal.test.ts:21-84`; `event-broker.test.ts:17-100` |
| External edit/delete cache visibility | `tests/lib/config.test.ts:1314-1354` |
| Monitor debounce/missed-watch fallback | new injected monitor test; no exact analog |
| Catalog/create/invalidation/replay-gap decoding | `native/tests/service_client_test.zig` |
| Reconciliation retains pins/tabs/attention and orphans live vanished pairs | `native/tests/app_graph_test.zig` + `tab_registry_test.zig:15-53` |
| Creation form state and idempotency reuse | `native/tests/application_actions_test.zig:28-44` launcher-controller style |
| Codex JSON preservation/idempotency/removal | `tests/lib/agent-hooks.test.ts:38-155` |
| Best-effort absent service | `tests/lib/messages.test.ts:83-90`, `:213-225` |
| Provider/title/detail decode and exact routing | `native/tests/service_client_test.zig:104-110`; `native/tests/attention_test.zig` |
| Keyboard launcher/no-result/action readiness | `native/tests/application_actions_test.zig` + production `app_contract_test.zig` |
| Real accessible roles/states/labels | `native/tests/accessibility_test.zig:7-29` plus a rendered widget-tree test |
| Live close confirmation and ended immediate removal | extend `native:smoke-workspace` and app callback contract tests |
| Empty -> create -> selected shell; external create/edit/rename/remove | `scripts/verify-native.ts:509-579` workspace lifecycle harness |

## No Exact Analog Found

| Area | Closest partial pattern | Planner guidance |
|---|---|---|
| Service-owned filesystem watcher with debounce and periodic recovery | snapshot dependency injection, `createIdleLifecycle`, config invalidation tests | Create one lifecycle-owned monitor with injected watcher/timers/fingerprint; do not scatter `fs.watch` calls across server/snapshot/native code. |
| Adaptive libadwaita status/confirmation semantics | existing reusable `AdwDialog`, GAction registry, `close-page` transaction | Use `AdwBreakpoint`/overlay split, `AdwStatusPage`, and `AdwAlertDialog` directly while preserving local ownership and stable-ID callbacks; require real GTK interaction/AT evidence. |

Codex has a close role analog but not an existing product plugin. The tracked `.codex/hooks.json` proves a local nested hook document shape; Claude's plugin proves safe merge/idempotency. The implementation must combine those patterns and validate the current accepted Codex event contract rather than copy provider events mechanically.

## Anti-Patterns to Reject During Planning

- Calling the interactive workspace wizard or spawning `git-stacks new` from the service/native app.
- Returning repository paths or raw template/YAML to the native dialog.
- Encoding user-entered JSON with unescaped string interpolation.
- Generating a new idempotency key after an ambiguous retry.
- Treating operation output as the authoritative workspace snapshot.
- Watching YAML from Zig or refreshing only after successful SSE heartbeat leases.
- Publishing snapshot invalidation before its journal record is durable.
- Replacing all native state on refresh and thereby dropping attention/live hosts.
- Destroying a terminal because its workspace/repository vanished externally.
- Updating GTK or executing snapshot/Git projection on a background/main thread respectively.
- Installing Codex hooks by overwriting unrelated `.codex/hooks.json` keys.
- Fabricating Codex failure/idle/question states unsupported by its hooks.
- Swallowing malformed hook JSON and rewriting an empty document.
- Keeping provider/title/detail only in widgets instead of shared attention state.
- Clearing all attention on generic workspace navigation.
- Adding pointer-only controls that bypass GActions or keyboard alternatives.
- Calling `close_page_finish` for a live terminal before affirmative confirmation.
- Using CSS alone for selected/pressed/status accessibility semantics.
- Treating model-only accessibility tests or smoke output as final visual/AT evidence.

## Planner Handoff

Plan in dependency order:

1. prompt-free creation domain plus strict catalog/create operation and TypeScript tests;
2. service monitor, uncached/empty aggregate revisioning, durable invalidation, and replay tests;
3. native protocol/controller/worker and authoritative reconciliation, including zero-workspace startup and orphan/live-attention preservation;
4. Codex plugin plus provider-aware shared attention and exact production routing;
5. launcher/accessibility/live-close/adaptive/actionable-state GTK hardening;
6. combined native smoke, external-process interaction, keyboard/AT checks, light/dark/narrow visual evidence, and human UAT.

Keep each contract-producing plan paired with its decoder/fixture test. The highest-risk cross-cutting proof is a running empty client that creates its first workspace, then observes another process rename/remove it without restart while a live terminal and unread provider-labeled attention remain coherent.

## Metadata

**Analog search scope:** `src/lib`, `src/service`, `src/commands`, `src/tui`, `native/core`, `native/linux`, `native/tests`, `tests/lib`, `tests/service`, `scripts`

**Strong analog families:**

1. `workspace-recreate.ts` plan/apply plus `workspace-lifecycle.ts` transactional creation
2. strict service contract/server/operation registry
3. snapshot revision + event journal/broker + config invalidation
4. native service client/app graph/replay worker + command-launcher controller
5. Claude/Copilot plugin registry + additive messages publication
6. GAction/dialog/close-page/accessibility GTK composition

**Pattern extraction date:** 2026-07-12
