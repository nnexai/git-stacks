# Phase 123: Archived Workspaces and Safe Removal - Pattern Map

**Mapped:** 2026-07-16
**Files analyzed:** 33 likely path entries (28 existing modification points, 5 new/candidate entries)
**Analogs found:** 33 / 33

The phase is a coordinated extension of existing authorities, not a new subsystem. The strongest pattern is to keep YAML/Git/filesystem work in core, sequencing and PTY authority in service, bounded schemas in protocol, and confirmation/reconciliation state in thin clients. `123-CONTEXT.md` supersedes older terminal-preservation wording: archive must confirm terminal shutdown before writing archive state.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/core/src/config.ts` | model / persistence | file-I/O, CRUD | Existing `WorkspaceSchema`, `updateWorkspace`, and resolved lookup | exact |
| `packages/core/src/workspace-archive.ts` (new) | domain utility | CRUD, file-I/O | `packages/core/src/workspace-pins.ts` over `config.updateWorkspace` | role-match |
| `packages/core/src/workspace-lifecycle.ts` | service | batch Git + file-I/O | Existing `removeWorkspace` / `commitCleanup` pipeline | exact |
| `packages/core/src/workspace-pins.ts` | utility | CRUD, file-I/O | Existing active pin replacement loop | exact |
| `packages/protocol/src/service.ts` | model / contract | event-driven, request-response | Existing `Operation`, progress, error, snapshot schemas | exact |
| `packages/protocol/src/web.ts` | model / contract | request-response | Existing strict web mutation/snapshot/operation schemas | exact |
| `packages/client/src/presentation.ts` | utility | transform | Existing `workspacePriorityOrder` and relative-time helpers | exact |
| `packages/service/src/policy/core-contract.ts` | model / contract | request-response | Existing strict core state and mutation schemas | exact |
| `packages/service/src/policy/client.ts` | client adapter | request-response, streaming | Existing `runCoreMutation` / operation stream | exact |
| `packages/service/src/policy/snapshot.ts` | provider | batch, transform | Existing stable aggregate builder and revision store | exact |
| `packages/service/src/policy/core-state.ts` | provider | batch, transform | Existing trusted definition/projection reconciliation | exact |
| `packages/service/src/policy/operations.ts` | service / coordinator | event-driven, batch | Existing durable `OperationRegistry` and mutation adapters | exact |
| `packages/service/src/web/terminal-manager.ts` | service | streaming, event-driven | Existing session manager close/stop lifecycle | exact |
| `packages/service/src/web/projection.ts` | mapper | transform | Existing browser allowlist projection | exact |
| `packages/service/src/secure/router.ts` | controller | request-response | Existing revision-bound operation submission | exact |
| `packages/service/src/main.ts` | composition root | event-driven | Existing shared snapshot/registry/router wiring | exact |
| `packages/web/src/app.ts` | component / controller | request-response, event-driven | Existing modal, operation submit, refresh, terminal map | exact |
| `packages/web/src/app.css` | presentation | transform | Existing modal/context-menu/toast design tokens | exact |
| `packages/tui/src/types.ts` | model / UI state | event-driven | Existing `Action` and discriminated `UIView` union | exact |
| `packages/tui/src/ActionMenu.tsx` | component | event-driven | Existing keyboard-driven workspace actions | exact |
| `packages/tui/src/App.tsx` | component / controller | event-driven, request-response | Existing confirm/progress/action state machine | exact |
| `packages/tui/src/{ArchivedWorkspacesDialog,WorkspaceRemovalDialog}.tsx` (candidate names; may remain colocated) | component | event-driven | `ConfirmDialog.tsx`, `CenteredDialog`, and existing `App.tsx` overlays | role-match |
| `tests/lib/workspace-archive.test.ts` (new) | test | file-I/O, CRUD | `tests/lib/workspace-pins.test.ts` plus config fixture patterns | role-match |
| `tests/lib/workspace-lifecycle.test.ts` | test | Git + file-I/O | Existing removal safety fixture | exact |
| `tests/lib/service/workspace-lifecycle-operations.test.ts` (new) | test | event-driven, concurrency | `tests/lib/service/operations.test.ts` | role-match |
| `tests/lib/service/snapshot.test.ts` | test | batch, transform | Existing injected snapshot dependencies and `MemoryStore` | exact |
| `tests/lib/workspace-pins.test.ts` | test | CRUD | Existing dependency-injected pin writes | exact |
| `tests/service/web-terminal.test.ts` | test | streaming, concurrency | Existing injectable terminal manager tests | exact |
| `tests/service/web-projection.test.ts` | test | transform, security | Existing browser secret/path allowlist assertions | exact |
| `tests/commands/workspace-lifecycle.test.ts` | test | Git + file-I/O | Existing command lifecycle fixture | exact |
| `tests/commands/workspace-destructive-safety.test.ts` | test | Git + file-I/O | Existing fail-closed destructive safety fixture | exact |
| `tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` (new) | test | event-driven rendering | `tests/tui/dashboard/integ-wizard.test.tsx` and `integ-action-menu.test.tsx` | role-match |
| `tests/service/web-presentation.test.ts` | test | transform / static contract | Existing dependency-free browser presentation checks | exact |

## Pattern Assignments

### Core archive persistence: `config.ts` + new `workspace-archive.ts`

**Primary analogs:** `packages/core/src/config.ts`, `packages/core/src/workspace-pins.ts`

Keep the archive pair in the authoritative Zod model beside other optional workspace metadata, then mutate through the existing leased atomic read-modify-write path. The new archive module should be a thin domain wrapper, like pins, not a second YAML writer.

**Schema placement** (`packages/core/src/config.ts:243-266`):

```typescript
export const WorkspaceSchema = z.object({
  id: z.string().uuid().optional(),
  name: NameSchema,
  // ...
  last_opened: z.string().optional(),
  // ...
  pinned: z.boolean().optional(),
  priority: z.number().int().min(-2147483648).max(2147483647).optional(),
})
```

**Atomic validated mutation** (`packages/core/src/config.ts:403-413`):

```typescript
export function updateWorkspace(name: string, intent: (current: Workspace) => Workspace): Workspace {
  const path = workspacePath(name)
  return withMutationLeaseSync(path, () => {
    const current = readYaml(path, WorkspaceSchema)
    const next = WorkspaceSchema.parse(intent(current))
    if (next.name !== name) throw new Error("A workspace field intent cannot rename its target")
    writeYaml(path, next)
    workspaceIndex.set(name, next)
    workspaceListPopulated = false
    return next
  })
}
```

Apply this pattern to archive/unarchive with idempotent object transforms: archive writes paired `archived: true` + `archived_at` only when not already archived; unarchive removes both fields. Preserve all other fields, including pin/priority/notes-related configuration. Do not call lifecycle hooks from this module.

`deleteWorkspace` should follow the already-existing resolved lookup (`workspaceFilePath`, `packages/core/src/config.ts:416-427`) rather than reconstructing `${name}.yml`, so filename-drift fixtures remain deletable.

### Core remove outcome and commit ordering: `workspace-lifecycle.ts`

**Analog:** existing prepare/commit split in `packages/core/src/workspace-lifecycle.ts`

**Commit authority and failure boundary** (`packages/core/src/workspace-lifecycle.ts:237-283`):

```typescript
const closeResult = await commitClose(workspace, config, tasksDir, opts, onProgress)
if (!closeResult.ok) return closeResult

const failures: string[] = []
for (const repo of workspace.repos.filter(isWorktreeRepo)) {
  if (!existsSync(repo.task_path)) continue
  try {
    await removeWorktree(repo.main_path, repo.task_path)
    onProgress?.(`removed  ${repo.name}`)
  } catch (err) {
    failures.push(`${repo.name} (${err})`)
  }
}
// ... folder, then config deletion
```

**Dirty guard before destructive commit** (`packages/core/src/workspace-lifecycle.ts:375-414`):

```typescript
if (!opts.force) {
  const dirty = await getDirtyWorktrees(workspace)
  if (dirty.length > 0) {
    return { ok: false, error: `Dirty worktrees: ${dirty.join(", ")}` }
  }
}
// ... prepare lifecycle
const committed = await commitCleanup(workspace, config, tasksDir, {
  ...lifecycleOpts,
  deleteFolder: true,
  deleteConfig: true,
}, onProgress)
```

Retain this core ordering, but replace the string-only dirty failure with a typed bounded result that preserves blocker names. Service-level terminal stopping is a prerequisite outside this function so daemonless CLI behavior remains intact.

### Strict lifecycle contracts: protocol + core contract

**Analogs:** `packages/protocol/src/web.ts`, `packages/service/src/policy/core-contract.ts`

Use strict Zod shapes, stable workspace IDs, expected revisions, and a distinct exact-name field only for force remove. Extend the discriminated mutation unions rather than adding ad hoc endpoint bodies.

**Revision-bound mutation union** (`packages/protocol/src/web.ts:42-49`):

```typescript
export const WebWorkspaceMutationSchema = z.strictObject({
  workspace_id: EntityIdSchema,
  expected_revision: RevisionSchema,
})
export const WebOperationMutationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("workspace.create"), request: WorkspaceCreationRequestSchema }),
  z.strictObject({ kind: z.enum(["workspace.open", "workspace.close"]), request: WebWorkspaceMutationSchema }),
])
```

**Bounded browser projection types** (`packages/protocol/src/web.ts:96-103`, `122-131`):

```typescript
export const WebSnapshotSchema = z.strictObject({
  protocol: z.literal(WEB_PROTOCOL),
  revision: RevisionSchema,
  generated_at: TimestampSchema,
  pinned_workspace_ids: z.array(EntityIdSchema).max(16),
  workspaces: z.array(WebWorkspaceSchema),
})

export const WebOperationSchema = z.strictObject({
  // bounded progress/result/error allowlist
})
```

Add one shared minimal archived summary (`id`, `name`, `activity_at`) and typed lifecycle progress/failure detail. Browser types must not acquire paths, repository internals, environment, or terminal metadata from other principals.

### Durable lifecycle orchestration: `operations.ts` + `secure/router.ts`

**Primary analog:** `packages/service/src/policy/operations.ts`

Model archive/unarchive/remove/force-remove as one workspace-scoped coordinator that emits existing operation records. Preserve generic stages while adding typed lifecycle phase data.

**Operation step contract** (`packages/service/src/policy/operations.ts:41-54`):

```typescript
export interface OperationStep {
  name: string
  stage: "preparing" | "executing"
  message: string
  run: (report: (progress: OperationProgressInput) => void | Promise<void>) => Promise<void>
  rollback?: () => Promise<void>
}
```

**Progress is parsed and published at every boundary** (`packages/service/src/policy/operations.ts:322-349`):

```typescript
for (let index = 0; index < execution.steps.length; index += 1) {
  const step = execution.steps[index]!
  current = OperationSchema.parse({
    // ...
    progress: { stage: step.stage, message: step.message, completed: index, total: execution.steps.length },
  })
  await this.visible(current)
  await step.run(async (reported) => {
    current = OperationSchema.parse({ /* ... */ progress: { ...reported, stage: reported.stage ?? step.stage } })
    await this.visible(current)
  })
  completed.push(step)
}
```

Use named lifecycle phases `stopping_terminals`, `checking_worktrees`, `removing_worktrees`, `deleting_workspace_files`, and `reconciling_state`. Preserve canonical request hashing (`packages/service/src/policy/operations.ts:393-399`) and durable idempotency reservations for retries.

**Router resolution pattern** (`packages/service/src/secure/router.ts:384-426`):

```typescript
const web = WebOperationMutationSchema.safeParse(request.body)
// ...
const snapshots = await this.options.snapshot.buildAll()
const selected = snapshots.find((item) => item.workspace.id === mutationRequest.workspace_id)
if (!selected) throw coded("Workspace not found", "not_found")
if (selected.revision !== mutationRequest.expected_revision) throw coded("Authoritative snapshot revision is stale", "conflict")
// stable ID resolves to authoritative name before adapter execution
```

Phase 123 must repeat the revision check after acquiring the per-workspace gate. Archive/unarchive may converge only when the same stable ID is already in the requested state. Remove/force-remove never auto-replay after a stale conflict.

### Authoritative active/archive catalog: `snapshot.ts` + `core-state.ts` + projection

**Primary analog:** `packages/service/src/policy/snapshot.ts`

Partition definitions before calling the expensive `project()` path. Active definitions keep the existing full snapshot; archived definitions become minimal sorted summaries. Digest both sets into one aggregate revision, including all-archived state.

**Single aggregate generation** (`packages/service/src/policy/snapshot.ts:323-348`):

```typescript
async function buildAll(): Promise<WorkspaceSnapshotResponse[]> {
  const names = [...dependencies.listWorkspaceNames()].sort((a, b) => a.localeCompare(b))
  const projections = []
  for (const name of names) {
    const projection = await projectStable(name, config)
    if (projection) projections.push(projection)
  }
  const revision = await dependencies.revisionStore.update(digest(projections))
  aggregateRevision = revision
  // ... one generated_at and revision for every projection
}
```

`core-state.ts` currently reconciles every definition to one projection (`packages/service/src/policy/core-state.ts:39-58`). Change that invariant to active-definition/full-projection parity plus separately derived `archived_workspaces`. Keep archive rows minimal and already sorted by service-owned `activity_at`.

**Browser allowlist pattern** (`packages/service/src/web/projection.ts:48-72`):

```typescript
if (operation.state === "running") {
  return WebOperationSchema.parse({ ...common, progress: {
    ...(operation.progress.message ? { message: operation.progress.message } : {}),
    ...(operation.progress.completed === undefined ? {} : { completed: operation.progress.completed, total: operation.progress.total }),
  } })
}
// success and failure each copy only explicit safe fields
```

Extend this explicit allowlist for lifecycle phase, blocker display names, booleans, and counts. Filter both activity and notifications by authoritative active workspace IDs; retain journal records.

### Confirmed terminal barrier: `terminal-manager.ts`

**Analog:** existing session ownership and close lifecycle in `packages/service/src/web/terminal-manager.ts`

**Creation resolves an authoritative revision before spawning** (`packages/service/src/web/terminal-manager.ts:130-142`):

```typescript
const resolution = await this.snapshot.resolveTerminalLaunch({
  workspace_id: input.workspace_id,
  repository_id: input.repository_id,
  // ...
  expected_revision: input.expected_revision,
})
if (!resolution.resolved) throw Object.assign(new Error(resolution.error.message), { /* ... */ })
```

Insert the workspace admission/quiesce check before PTY allocation and hold it through catalog reconciliation.

**Current close seam to strengthen** (`packages/service/src/web/terminal-manager.ts:235-268`):

```typescript
if (session.state === "closing") return this.project(session)
session.state = "closing"
this.killGroup(session, "SIGTERM")
const exited = await Promise.race([session.exited.then(() => true), timeout])
if (!exited) {
  this.killGroup(session, "SIGKILL")
  await Promise.race([session.exited, timeout])
}
session.state = "ended"
```

Replace the early `closing` projection with one shared close promise, and treat the post-SIGKILL timeout as `cleanup_failed`, not proof of exit. Add an internal global-by-workspace close method; keep public `list/get/close` principal-scoped. Any unconfirmed session aborts before archive YAML or deletion.

### Shared selection and pin preservation: client + core

**Analogs:** `packages/client/src/presentation.ts`, `packages/core/src/workspace-pins.ts`

Extend one shared comparator rather than adding separate web/TUI successor rules.

**Current ordering seam** (`packages/client/src/presentation.ts:86-93`):

```typescript
export function workspacePriorityOrder(left, right): number {
  return (right.priority ?? 0) - (left.priority ?? 0)
    || left.name.localeCompare(right.name)
    || (left.id ?? "").localeCompare(right.id ?? "")
}
```

The successor comparator must add pinned-first and persisted activity recency before name/ID. Restrict pin replacement to active definitions so archived definitions omitted from client requests retain their `pinned` field; the current loop touches every definition (`packages/core/src/workspace-pins.ts:19-29`).

### Thin web lifecycle UI: `web/src/app.ts`

**Analog:** existing operation submit, singleton modal, and authoritative refresh flow

**Revision-bound intent with unique key** (`packages/web/src/app.ts:820-824`):

```typescript
const operation = await api("operation.submit", {
  kind,
  request: { workspace_id: workspace.id, expected_revision: snapshot.revision },
}, {
  scope: "operation.write",
  idempotencyKey: `${kind}-${workspace.id}-${crypto.randomUUID()}`,
})
```

**Singleton modal primitive** (`packages/web/src/app.ts:830-842`):

```typescript
function modal(title: string) {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  const backdrop = element("div", "modal-backdrop")
  const dialog = element("section", "modal")
  dialog.setAttribute("role", "dialog")
  dialog.setAttribute("aria-modal", "true")
  // Escape/backdrop close and focus restoration
}
```

Use it for the minimal archived view, normal removal inventory, dirty blocker result, and exact-name force confirmation. Archive is one-click with Undo/Unarchive; normal remove defaults to cancel; force remains disabled until the exact current name matches.

**Authoritative selection refresh** (`packages/web/src/app.ts:917-934`) already clears invalid selection and chooses a remaining workspace. Extend it to the shared comparator. `loadTerminals` currently only adds returned sessions (`packages/web/src/app.ts:948-952`); change it to dispose views absent from the returned full set after lifecycle success or `terminals_stopped=true` failure.

### TUI discriminated views and dialogs: `types.ts`, `ActionMenu.tsx`, `App.tsx`

**Analogs:** existing discriminated `UIView`, `ConfirmDialog`, and overlay switching

**UI state contract** (`packages/tui/src/types.ts:48-64`):

```typescript
export type UIView =
  | { view: "list" }
  | { view: "action-menu"; index: number }
  | { view: "confirm"; index: number; action: Action; batch?: boolean }
  | { view: "progress"; message: string }
  | { view: "inline-input"; index: number; purpose: /* ... */; prefill: string }
```

Add explicit archive-list, remove-confirm, dirty-blocked, and force-name states rather than overloading one generic error string. Use a dedicated input view for exact-name force confirmation.

**Default-cancel confirmation primitive** (`packages/tui/src/ConfirmDialog.tsx:13-26`):

```tsx
useKeyboard((key) => {
  if (key.name === "y") props.onConfirm()
  if (key.name === "n" || key.name === "escape") props.onCancel()
})
```

**Thin mutation handling** (`packages/tui/src/App.tsx:398-414`):

```typescript
async function runWorkspaceMutation(/* ... */): Promise<boolean> {
  try {
    await runCoreMutation(mutation, { workspace, options }, { onOperation: operationProgress })
    return true
  } catch (error) {
    appendSystemLine(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}
```

Replace name-only lifecycle calls for Phase 123 operations with stable ID + expected revision through the service client. After completion or terminal-stopped dirty failure, await the authoritative core reload before selection/progress settles. UI components display typed blockers and stages; they do not parse error strings or run Git/filesystem commands.

### Tests: injected authorities, concurrency gates, and real rendering

**Operation concurrency analog** (`tests/lib/service/operations.test.ts:78-115`): use deferred promises, captured event transitions, and explicit call ordering to prove the workspace gate blocks terminal creation and terminal confirmation precedes mutation.

```typescript
const firstDone = deferred()
const continueFirst = deferred()
const calls: string[] = []
// ... run first step, cancel/queue while held, release, then assert exact calls/events
```

**Terminal analog** (`tests/service/web-terminal.test.ts:37-54`): create through injected manager dependencies, close, then assert terminal state, session removal, and diagnostics. Add fake PTYs for TERM exit, KILL exit, and never-exit; the never-exit case must produce cleanup failure and zero core mutation calls.

**Projection security analog** (`tests/service/web-projection.test.ts:32-55`): assert exact allowlisted lifecycle fields and confirm encoded output excludes paths/secrets. Filter notification and activity IDs against active workspace IDs.

**TUI integration analog** (`tests/tui/dashboard/integ-wizard.test.tsx:99-127`): register mocks before dynamic imports, inject `setCoreStateFactoryForTests`, render `<App />`, drive keys, and inspect captured frames. The Phase 123 integration should exercise archive/Undo/unarchive, normal remove confirmation inventory, dirty blockers, exact-name force input, progress, successor selection, and both empty states.

## Shared Patterns

### Validation and identity

- Parse every persisted or transport boundary with the owning Zod schema.
- Clients submit stable workspace ID and expected aggregate revision; service resolves the authoritative name and paths.
- Exact-name force confirmation is validated again server-side.

### Error handling

- Core returns typed, bounded lifecycle outcomes; service preserves them through operation records.
- Browser projection allowlists safe display fields only.
- Terminal-close failure aborts before YAML/Git/filesystem mutation.
- Dirty failure may occur after terminals stop and must explicitly report `terminals_stopped=true`; force is offered only for that typed failure.

### Reconciliation

- Returned catalog, terminal list, and active-filtered signals are replacement sets.
- Revision digests active projections and archived summaries together.
- Web and TUI await authoritative state before choosing the next active workspace.
- Archive/unarchive are idempotent state convergence; remove and force-remove require a newly confirmed intent after stale conflict.

### Package boundaries

- Core: YAML, Git, filesystem, archive metadata, dirty/removal outcomes.
- Service: revision/idempotency, per-workspace gate, PTY barrier, stages, reconciliation.
- Protocol: bounded strict contracts.
- Web/TUI: confirmation, progress, Undo, exact-name input, and rendering only.

## No Exact Analog Found

| File / Concern | Role | Data Flow | Guidance |
|---|---|---|---|
| `packages/core/src/workspace-archive.ts` | domain utility | CRUD, file-I/O | Compose `updateWorkspace` exactly like workspace metadata utilities; no new storage primitive. |
| Workspace-scoped lifecycle coordinator inside `operations.ts` (or a cohesive new service module if planning requires it) | service | concurrency, event-driven | Compose `OperationRegistry`, router revision checks, and terminal manager; do not introduce a global lock. |
| TUI archived/force-removal views | component | event-driven | Reuse `CenteredDialog`, discriminated `UIView`, and keyboard patterns; keep archived rows minimal. |

These are composition gaps, not reasons to introduce new libraries.

## Metadata

**Analog search scope:** `packages/{core,protocol,client,service,web,tui}/src`, `tests/{lib,service,commands,tui/dashboard}`
**Primary analog families:** persistence, lifecycle operations, catalog projection, terminal manager, web/TUI state machines, focused tests
**Pattern extraction date:** 2026-07-16
**Dependencies required:** none beyond the repository's existing stack
