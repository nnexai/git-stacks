# Phase 127: Stale Workspace Intelligence and RC Closure - Pattern Map

**Mapped:** 2026-07-17
**Scope source:** `127-CONTEXT.md`, `127-RESEARCH.md`, `127-UI-SPEC.md`, `127-VALIDATION.md`
**Files classified:** 40 concrete or candidate files across 33 logical rows
**Analogs found:** 30 / 33 logical rows; three rows require a new composition or planner-selected artifact name

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/protocol/src/web.ts` | model / transport schema | transform, request-response | same file: workspace action, shortcut, file-status, and forge DTOs | exact |
| `packages/core/src/integrations/forge-change-status.ts` | integration service | external-process request-response, transform | `packages/core/src/integrations/forge-source-resolver.ts` | exact mechanics, new semantics |
| `packages/service/src/policy/stale-workspaces.ts` | policy service / volatile cache | batch, request-response, transform | `packages/service/src/policy/forge-source-review.ts` plus `snapshot.ts`, `git.ts`, `workspace-status.ts`, `concurrency.ts` | composite |
| `packages/service/src/secure/router.ts` | route / authorization boundary | request-response | same file: `workspace.actions`, notes, and file-status routes | exact |
| `packages/service/src/main.ts` | composition / config | service-lifetime dependency injection | same file: snapshot/core/forge-review composition | exact |
| `packages/service/src/policy/client.ts` | service client adapter | request-response, validation | same file: `fetchWorkspaceActionInventory()` | exact |
| `packages/service/src/web/projection.ts` | browser projection | transform | same file: `projectWebActionInventory()` | exact |
| `packages/client/src/stale-workspaces.ts` | shared presentation / generation utility | transform, event-driven request-response | `packages/client/src/forge-review.ts` and `packages/tui/src/workspace-action-inventory.ts` | composite |
| `packages/client/src/shortcuts.ts` | shortcut registry | event-driven transform | same file: `actionMetadata`, default bindings, input guards | exact |
| `packages/client/src/index.ts` | package barrel | transform / module export | same file export list | exact |
| `packages/web/src/app.ts` | browser controller / component composition | event-driven request-response | same file: snapshot refresh, Archived overlay, lifecycle reconciliation | exact |
| `packages/web/src/app.css` | component styling | responsive transform | same file: modal, Forge review, 375px/320px rules | exact |
| `packages/tui/src/types.ts` | view-state model | event-driven | same file: `UIView` discriminated union | exact |
| `packages/tui/src/StaleWorkspacesView.tsx` | OpenTUI component | event-driven request-response | `packages/tui/src/ForgeSourceReviewDialog.tsx` | role/data-flow match |
| `packages/tui/src/workspace-action-inventory.ts` | response gate utility | event-driven transform | same file: action and notes generation gates | exact |
| `packages/tui/src/App.tsx` | TUI controller / provider | event-driven request-response | same file: view ownership, action-inventory generation, lifecycle routing | exact |
| `packages/tui/src/official-service.ts` | trusted service adapter barrel | request-response | same file: official action/notes/file-status adapters | exact |
| `tests/lib/core/forge-change-status.test.ts` | unit test | external-process request-response | `tests/lib/forge-source-resolver.test.ts` | exact mechanics |
| `tests/lib/service/stale-workspaces.test.ts` | unit/integration test | batch, request-response, cache | `tests/lib/concurrency-limiter.test.ts` plus service policy tests | composite |
| `tests/service/web-stale-workspaces.test.ts` | browser-support/service test | request-response, event-driven | `tests/service/web-forge-review.test.ts` | role-match |
| `tests/service/phase127-cross-client-conformance.test.ts` | conformance test | transform, event-driven | `tests/service/phase126-cross-client-conformance.test.ts` | exact |
| `tests/tui/dashboard/StaleWorkspaces.test.tsx` | OpenTUI render/key test | event-driven | `tests/tui/dashboard/ForgeSourceReview.test.tsx` | exact |
| `tests/architecture/phase127-stale-authority.test.mjs` | architecture test | batch/static scan | `tests/architecture/phase126-client-authority.test.mjs` | exact |
| `package.json` and `packages/{protocol,client,core,web,service,cli,tui}/package.json` | release config | batch/transform | current lockstep manifests plus `scripts/check-packages.mjs` | exact |
| `package-lock.json` | release config | batch/transform | npm lockfile generated from the lockstep manifests | exact |
| `CHANGELOG.md` | release documentation | transform | current `0.21.0-rc.6` entry | exact |
| `README.md` | product / migration / shortcut / shell documentation | transform | existing shell and shared-service sections | role-match |
| `docs/releasing.md` | release documentation | batch/process | same file: validation-only/tag/publication boundary | exact |
| `docs/stale-workspaces.md` *(candidate; may be folded into README)* | product documentation | transform | `docs/forge-source-resolver.md` | role-match |
| `docs/migration-v0.22.md` *(candidate; filename not established)* | migration documentation | transform | changelog/README release notes | partial |
| `tests/commands/release-rc.test.ts` | release script test | batch/request-response | same file: current RC smoke tests | exact |
| `tests/architecture/release-publish.test.mjs` | release architecture test | batch/static scan | same file | exact |
| Phase 127 exact-SHA receipt index *(candidate `127-RECEIPTS.md`)* | verification artifact | batch/manual evidence | `126-PHASE127-HANDOFF.md` and `126-VERIFICATION.md` | partial; filename unresolved |

## Pattern Assignments

### `packages/protocol/src/web.ts` — bounded stale request/response DTOs and shortcut vocabulary

**Primary analog:** `packages/protocol/src/web.ts`

**Copy the strict request shape** from lines 261-264:

```typescript
export const WebWorkspaceMutationSchema = z.strictObject({
  workspace_id: EntityIdSchema,
  expected_revision: RevisionSchema,
})
```

The stale request should follow the same strict-object convention, carry `expected_revision`, and add only the explicit refresh flag. Reject extra keys.

**Copy browser-safe message discipline** from lines 78-86:

```typescript
const SafeBrowserMessageSchema = utf8BoundedString(500, 1).refine(
  (value) => !containsHostPath(value),
  { message: "Browser messages must not contain host paths" },
)
```

Prefer finite enums and static presentation mappings over a generic provider or Git error string. The stale response must not contain paths, argv, stdout, stderr, environment, credentials, bearer material, or raw exceptions.

**Copy bounded-array and cross-field validation** from `WebWorkspaceActionInventorySchema`, lines 134-161:

```typescript
export const WebWorkspaceActionInventorySchema = z.array(WebWorkspaceActionSchema)
  .min(WEB_WORKSPACE_BASE_ACTION_IDS.length)
  .max(WEB_WORKSPACE_ACTION_IDS.length)
  .superRefine((rows, context) => {
    const ids = new Set(rows.map(({ action_id }) => action_id))
    // enforce completeness and uniqueness
  })
```

For stale DTOs, apply the same approach to:

- candidate and incomplete arrays, capped by `CLIENT_MODEL_LIMITS.workspaces`;
- per-workspace reason, unknown, caution, and repository-scoped evidence arrays;
- consistency between reason codes and required `occurred_at`/`observed_at` fields;
- uniqueness where repository/reason identity must not repeat;
- `threshold_days: z.literal(30)` rather than configurable input.

**Reuse primitives** from `packages/protocol/src/service.ts` lines 9-21 and 44-58:

```typescript
export const EntityIdSchema = z.string().uuid()
export const RevisionSchema = CursorSchema
export const TimestampSchema = z.string().datetime({ offset: true })
```

Use `CLIENT_MODEL_LIMITS.workspaces` and `CLIENT_MODEL_LIMITS.repositories_per_workspace`; do not invent larger unbounded response collections.

**Persisted provenance is not the browser DTO.** `packages/core/src/config.ts` lines 211-227 defines the current persisted `WorkspaceSourceSchema`. The evaluator may validate and consume that trusted source, but the browser projection should expose only approved provider/reason identity fields.

**Shortcut IDs:** extend `WEB_SHORTCUT_ACTION_IDS` at `packages/protocol/src/web.ts:22-31` in lockstep with `packages/client/src/shortcuts.ts`. Add the shared stale entry and context refresh action IDs; refresh has no browser-global default.

**Known trap:** do not place stale schemas in `service.ts` merely because they are service-produced. Browser-visible request/response contracts belong in `web.ts`; `service.ts` supplies shared primitives and bounds.

---

### `packages/core/src/integrations/forge-change-status.ts` — read-only provider status acquisition

**Primary analog:** `packages/core/src/integrations/forge-source-resolver.ts`

**Copy the injected bounded runner contract** from lines 16-26:

```typescript
export type ForgeCommandRequest = {
  argv: readonly string[]
  cwd?: string
  env?: Readonly<Record<string, string>>
  signal?: AbortSignal
  timeout_ms: number
  max_output_bytes: number
}

export type ForgeCommandRunner =
  (request: ForgeCommandRequest) => Promise<ForgeCommandResult>
```

**Copy the process mechanics** from `runForgeCommand()` beginning at line 64:

```typescript
const proc = spawn(request.argv, {
  cwd: request.cwd,
  env: { ...process.env, ...request.env },
  stdin: "ignore",
  stdout: "pipe",
  stderr: "pipe",
  isolatedProcessGroup: true,
})
```

Retain abort-before-start handling, timeout, bounded stdout/stderr collection, process-group cleanup, and typed error codes. Never invoke a shell or construct one command string.

**Copy non-interactive environment** from line 380:

```typescript
env: {
  GH_PROMPT_DISABLED: "1",
  GLAB_PROMPT_DISABLED: "1",
  NO_COLOR: "1",
}
```

**Copy provider argv construction, not business semantics:** GitHub starts at line 429 with `gh api graphql --hostname <validated-host>`; GitLab encodes the project path at line 486 before `glab api --hostname ...`. Request only status and provider event timestamps.

**New closed result union:** this has no exact existing business-contract analog. Follow `127-RESEARCH.md:279-297`:

```typescript
export type ForgeChangeStatus =
  | { status: "merged"; occurred_at: string }
  | { status: "closed"; occurred_at: string }
  | { status: "open" }
  | { status: "unknown"; reason: ForgeStatusUnknownReason }
```

**Validation boundary:** accept only validated persisted `workspace.source` data compatible with GitHub PR or GitLab MR. Gitea, mismatched provider/change type, malformed source data, and unsupported hosts return sanitized `unknown`; they do not trigger a process.

**Do not copy:** `resolveForgeChangeSource()` rejects closed changes because it serves creation. Stale intelligence specifically needs merged/closed/open status and must not inherit the open-only resolver contract.

---

### `packages/service/src/policy/stale-workspaces.ts` — policy, local evidence, network cache, ranking, atomic response

**This is a new composition.** No current file combines all stale semantics. Copy individual mechanisms from the following sources.

#### Trusted activity semantics

**Source:** `packages/service/src/policy/snapshot.ts:144-155`

```typescript
export function workspaceActivityAt(
  workspace: Pick<Workspace, "created" | "last_opened">,
): string {
  if (workspace.last_opened !== undefined) return workspace.last_opened
  return DATE_ONLY_WORKSPACE_ACTIVITY.test(workspace.created)
    ? `${workspace.created}T00:00:00.000Z`
    : workspace.created
}
```

Use this exact fallback. The inactivity check is strict: `activity_at < checked_at - 30 days`; equality at the cutoff is not stale.

#### Repository-scoped remote evidence

**Source:** `packages/core/src/git.ts:239-258`

```typescript
export type RemoteBranchStatus =
  | { status: "present" }
  | { status: "missing" }
  | { status: "error"; error: string }

export async function isBranchGoneOnRemote(...) {
  if (result.exitCode === 0) return { status: "present" }
  if (result.exitCode === 2) return { status: "missing" }
  return { status: "error", error: ... }
}
```

Map only `missing` to `remote_branch_deleted`. Attach repository identity and an observation timestamp. Map `error` to a fixed unknown code; never convert it to absence or project its message.

#### Managed-worktree evidence

**Source:** `packages/core/src/workspace-status.ts`, `getWorkspaceStatus()`.

Confirm `managed_worktree_missing` only for a managed `mode === "worktree"` repository with `exists === false`. A degraded/inaccessible result is unknown, not missing. Trunk and directory repositories do not qualify through this reason.

#### Bounded fan-out

**Source:** `packages/core/src/concurrency.ts:2-39`

```typescript
export async function mapLimited<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array(items.length)
  // workers claim indexes and write results[index]
}
```

Use `mapLimited()` for provider and remote probes. Preserve association with the input workspace/repository and do not issue unbounded `Promise.all()` across the maximum workspace and repository counts.

#### Volatile TTL and dependency injection

**Partial source:** `packages/service/src/policy/forge-source-review.ts:209-220,291-307,620-626`

```typescript
export class ForgeSourceReviewAuthority {
  private readonly records = new Map<string, TrustedForgeReview>()
  private readonly now: () => number
  private readonly ttlMs: number

  constructor(options) {
    this.now = options.now ?? Date.now
    this.ttlMs = options.ttlMs ?? DEFAULT_FORGE_REVIEW_TTL_MS
  }
}
```

Copy service-lifetime in-memory state, injectable clock/TTL, explicit expiry, and no persistence. Do **not** copy the ten-minute TTL or token-specific semantics.

The exact stale cache algorithm is new and must follow `127-RESEARCH.md:299-312`:

- TTL is exactly 300,000 ms for network evidence only;
- local activity/worktree/caution evidence is recomputed on every request;
- normal misses are singleflight per key;
- explicit refresh bypasses reads and begins a newer per-key generation;
- only the newest generation may commit a cache value;
- failures are cached as sanitized unknown outcomes;
- service shutdown/new service instance discards all entries.

#### Classification and ordering

**Source:** locked policy in `127-RESEARCH.md:314-335`.

```typescript
if (confirmedReasons.length > 0) candidates.push(row)
else if (unknownEvidence.length > 0) incomplete.push(row)
// otherwise omit
```

Sort only in the service with this tuple:

1. confirmed reason count descending;
2. strongest reason by `merged > closed > remote_branch_deleted > managed_worktree_missing > inactive`;
3. inactivity-only candidates last;
4. oldest valid activity first, unknown activity last;
5. normalized workspace name;
6. workspace ID.

Return every reason and relevant timestamp. Do not return a numeric stale score. Dirty/ahead/drift/notes are cautions only and cannot qualify or suppress a candidate.

#### Canonical lifecycle boundary

**Source:** `packages/service/src/policy/workspace-actions.ts:134-168`.

```typescript
if (actionId === "workspace.force-remove") {
  return input.removal?.revision === input.state.revision
    && input.removal.details.kind === "workspace_dirty"
    && input.removal.details.terminals_stopped === true
    && input.removal.details.force_allowed === true
    ? AVAILABLE
    : unavailable("dirty_worktree")
}
```

The evaluator receives no archive/remove/write/terminal mutation dependencies. Stale evidence is advisory and must never synthesize action availability.

---

### `packages/service/src/secure/router.ts` — revision-bound lazy route

**Primary analog:** existing read routes in the same file.

**Scope registration:** copy `methodScopes` at lines 128-138 and add:

```typescript
"workspace.stale.evaluate": "snapshot.read",
```

**Revision-first pattern:** copy `resolveWorkspaceTarget()` and the workspace action route checks at lines 536-556:

```typescript
const parsed = schema.safeParse(body)
if (!parsed.success) throw coded("Invalid workspace detail request", "invalid_request")

const state = await this.options.core.build()
if (state.revision !== parsed.data.expected_revision) {
  throw coded("Authoritative snapshot revision is stale", "conflict")
}
```

The stale route must compare the authoritative revision **before** reading the stale cache, starting forge probes, or running remote checks. This zero-probe-on-conflict ordering is a security and exhaustion requirement.

Return one atomic response containing `revision`, `checked_at`, candidates, and incomplete rows. Do not stream per-row updates and do not add stale work to base snapshot construction.

**Retry boundary:** the route itself returns conflict. Web/TUI reload authoritative state and retry once through their current generation; the router does not loop or probe against a superseded revision.

---

### `packages/service/src/main.ts` — one service-lifetime evaluator/cache

**Primary analog:** same file lines 418-518.

```typescript
const snapshot = options.snapshot ?? createSnapshotBuilder(...)
const core = createCoreStateProvider(snapshot)
const forgeSourceReview = new ForgeSourceReviewAuthority({...})

running = await startSecureServiceRuntime({
  ...,
  core,
  forgeSourceReview,
})
```

Construct one stale evaluator per running service, inject its clock, provider probe, remote probe, local status readers, and concurrency settings, and pass it into the secure runtime/router. Do not construct a cache per request and do not persist it through shutdown.

Tests should be able to inject deterministic clocks and probe implementations through the same composition seam.

---

### `packages/service/src/policy/client.ts` and `packages/tui/src/official-service.ts` — strict trusted-client adapter

**Primary analog:** `packages/service/src/policy/client.ts:150-159`.

```typescript
export async function fetchWorkspaceActionInventory(
  request: z.infer<typeof WebWorkspaceMutationSchema>,
  signal?: AbortSignal,
): Promise<WebWorkspaceActionInventory> {
  const parsed = WebWorkspaceMutationSchema.parse(request)
  return WebWorkspaceActionInventorySchema.parse(
    await secureRequest("workspace.actions", parsed, {
      signal,
      scope: "snapshot.read",
    }),
  )
}
```

Add a stale fetcher that parses both request and response and uses `snapshot.read`. Keep the transport method name aligned with the router (`workspace.stale.evaluate`).

Then re-export it through `@git-stacks/service/client` and add it to `packages/tui/src/official-service.ts`, following lines 4-19 where action, notes, and file-status fetchers are imported and exposed unchanged.

**Known trap:** TUI must use `@git-stacks/service/client`; it must not import service internals or core probe functions.

---

### `packages/service/src/web/projection.ts` — browser-safe allowlist projection

**Primary analog:** `projectWebActionInventory()` at lines 241-264.

```typescript
export function projectWebActionInventory(
  actions: readonly CanonicalWorkspaceAction[],
): WebWorkspaceActionInventory {
  const projected = actions.map(/* explicit allowlist mapping */)
  return WebWorkspaceActionInventorySchema.parse(projected)
}
```

Project stale results field-by-field into the protocol DTO, then parse the complete response schema. Do not serialize trusted evaluator or probe objects directly.

**Static error copy:** follow `operationFailureMessage()` at lines 222-239. Unknown codes receive fixed shared labels/recovery text; raw core/provider/Git errors never cross the projection.

Add disclosure canaries for:

- machine/task/worktree paths;
- repository URLs not explicitly approved by the DTO;
- argv, stdout, stderr;
- credentials, token/bearer fields, environment;
- raw exception/message fields.

---

### `packages/client/src/stale-workspaces.ts` and `packages/client/src/index.ts` — shared labels and generation-safe response acceptance

**Primary analogs:** `packages/client/src/forge-review.ts:220-255` and `packages/tui/src/workspace-action-inventory.ts:37-75`.

```typescript
let generation = 0
const operationGeneration = generation
const response = await callbacks.resolve(...)
if (operationGeneration !== generation) {
  return { status: "ignored", reason: "superseded" }
}
```

```typescript
begin(workspaceId, revision) {
  generation += 1
  return Object.freeze({ generation, workspaceId, revision })
}

accepts(token, response) {
  return token.generation === generation
    && token.revision === response.revision
}
```

Create a shared stale response gate/token keyed by monotonic generation and expected revision. A newer request or view exit invalidates older responses. Preserve service ordering; the utility may map reason/unknown/caution codes to stable labels but must not classify, filter, rescore, or re-sort rows.

Use `packages/client/src/presentation.ts:67-78` for relative time:

```typescript
export function relativeTime(occurredAt: string, now = Date.now()): string {
  const occurred = Date.parse(occurredAt)
  if (!Number.isFinite(occurred)) return ""
  // fixed relative display
}
```

Keep exact UTC timestamps available to renderers alongside relative labels.

Export the new module from `packages/client/src/index.ts` following its existing `export * from "./...js"` list.

---

### `packages/client/src/shortcuts.ts` — canonical entry and context refresh actions

**Primary analog:** same file.

**Metadata registry:** lines 19-31:

```typescript
const actionMetadata: Record<
  WebShortcutActionId,
  Omit<ShortcutActionMetadata, "actionId">
> = {
  "workspace.switch": {
    label: "Switch workspace",
    category: "navigation",
    defaultCode: "KeyK",
  },
}
```

Register shared labels for `Open stale workspaces` and `Refresh stale evidence`. The entry action gets physical `KeyS`; refresh is context-scoped with no browser-global default.

**Platform defaults:** lines 89-100:

```typescript
return platform === "macos"
  ? { ctrl: true, alt: false, shift: false, meta: true }
  : { ctrl: true, alt: true, shift: true, meta: false }
```

This yields `Ctrl+Command+S` on macOS and `Ctrl+Alt+Shift+S` on Linux.

**Input isolation:** lines 120-121:

```typescript
if (event.isComposing || event.key === "Process" || event.key === "Dead") {
  return "composing"
}
if (event.getModifierState?.("AltGraph")) return "alt-graph"
```

Do not add client-local listeners that bypass collision validation, xterm preprocessing, IME/AltGraph handling, or configurable bindings.

---

### Canonical lifecycle actions used by both renderers

**Source:** `packages/client/src/workspace-actions.ts:94-136`.

```typescript
export function createWorkspaceActionRegistry(...) {
  const latches = new Set<string>()

  if (!descriptor.availability.available) {
    return { available: false, reason: descriptor.availability.message }
  }

  if (latches.has(key)) return { status: "pending" }
  latches.add(key)
  try {
    return await callback(...)
  } finally {
    latches.delete(key)
  }
}
```

Apply to web and TUI Open/Archive/Remove paths. Local state may only narrow service availability. It cannot enable an unavailable descriptor or reveal Force Remove before the current typed dirty-worktree sequence authorizes it.

Open selects/navigates only after authoritative success. Archive/Remove use unchanged confirmations and operation reconciliation. After terminal completion, refresh normal state and stale evidence without replaying the mutation.

---

### `packages/web/src/app.ts` — singleton stale overlay and retained-data refresh state

**Primary analogs:** current snapshot refresh, Archived overlay, overlay controller, and lifecycle reconciliation.

**Monotonic refresh:** `packages/web/src/app.ts:2114-2118`:

```typescript
async function refreshSnapshot(): Promise<void> {
  const generation = ++snapshotRefreshGeneration
  const refreshed = await api<Snapshot>("web.snapshot", undefined, {
    scope: "snapshot.read",
  })
  if (generation !== snapshotRefreshGeneration) return
  snapshot = refreshed
}
```

Use a separate stale request generation and bind every accepted response to both generation and revision. A revision conflict reloads authoritative state and retries once. A second conflict or other failure is rendered without looping.

**Placement and existing overlay seam:** toolbar markup is at line 559; `showArchivedWorkspaces()` begins at line 1442. Add `Stale workspaces` immediately adjacent to Archived and use the common `modal()`/overlay controller, but do not copy the Archived dialog's minimal data model.

**Singleton/refocus/focus containment:** `packages/web/src/overlay-controller.ts:79-107,124-154`:

```typescript
if (active?.id === request.id) {
  active.primaryFocus()
  return { kind: "refocused", view: active.view }
}

dialog.setAttribute("role", "dialog")
dialog.setAttribute("aria-modal", "true")
```

The controller owns Escape, Tab containment, backdrop close, generation-protected cleanup, and exact valid focus restoration. Repeated entry must refocus the current stale overlay rather than creating another instance.

**Retained-data state machine:** during refresh, keep the previous successful response visible and mark it busy. If refresh fails, keep those rows and show the error. Only first-load failure uses an error-only body. Background completion must not steal focus.

**Lifecycle reconciliation:** copy `reconcileAuthoritativeState()` beginning at line 1406. After an operation terminal result, reload normal state and stale evidence; never replay the accepted mutation intent.

**Rendering requirements:** use native buttons, list semantics, `<time datetime>`, `aria-busy`, a polite status region, and alert errors. Render the service order verbatim.

---

### `packages/web/src/app.css` — bounded responsive stale overlay

**Primary analog:** modal rules at lines 159-164:

```css
.modal {
  width: min(620px, calc(100vw - 28px));
  max-width: 100%;
  max-height: 78vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.modal-body {
  min-height: 0;
  display: grid;
  gap: 16px;
  overflow: auto;
  padding: 16px;
}
```

Add a stale modifier with `width: min(760px, calc(100vw - 28px))`; preserve the existing bounded height and internal scrolling.

Copy the responsive structure at lines 276-279. Add explicit stale rules for desktop, 375px, and 320px so evidence rows, exact timestamps, errors, menus, and action buttons wrap without horizontal page overflow. At 320px, one-column evidence and full-width actions are acceptable.

Do not encode status by color alone. Unknowns and cautions need written labels; merged status must not use success green as a safety signal.

---

### `packages/tui/src/types.ts`, `packages/tui/src/StaleWorkspacesView.tsx`, and `packages/tui/src/workspace-action-inventory.ts`

**View model:** extend the `UIView` discriminated union at `packages/tui/src/types.ts:69-82`, rather than overloading `archived-workspaces`.

The stale variant should retain enough state to restore origin and reject stale updates: originating row/workspace identity, selected row, response or retained response, loading/error state, and current request generation/revision.

**Renderer analog:** `packages/tui/src/ForgeSourceReviewDialog.tsx`.

Too-small contract at lines 59-63 and 165-176:

```typescript
const tooSmall = () =>
  dimensions().width < 40 || dimensions().height < 12
```

```tsx
<Match when={tooSmall()}>
  <text fg="yellow">
    Terminal is too small for workspace review. Resize to at least 40 × 12.
  </text>
</Match>
```

Stale view uses the same `< 40 x 12` safe fallback and accepts only Escape there.

Keyboard ownership at lines 115-122:

```typescript
useKeyboard((key) => {
  if (tooSmall()) {
    if (key.name === "escape") props.onBack()
    return
  }
  // owned view keys
})
```

Implement wide two-pane at 80+, stacked at 56-79, single-column below 56, and the safe fallback below 40x12. Required owned keys are arrows/`j`/`k`, Home/End, PageUp/PageDown, `r`, `o`/Enter, `a`, and Escape. Ignore repeated refresh while busy.

**Generation gate:** extend `packages/tui/src/workspace-action-inventory.ts:37-75`. The stale gate must include generation and expected revision, accept only matching response revision, and invalidate on view exit/new request.

**OpenTUI constraints:** do not nest `<text>` elements. Use sibling `<text>` nodes inside a row `<box>`. If native input focus is introduced, copy deferred focus from `ForgeSourceReviewDialog.tsx:59` rather than focusing synchronously during mount.

---

### `packages/tui/src/App.tsx` — stale view routing and key isolation

**Primary analog:** same file.

Action-inventory response safety appears at lines 743-768:

```typescript
const token = workspaceActionInventoryGate.begin(workspaceId)
const descriptors = await officialService.fetchWorkspaceActionInventory(...)
if (
  !workspaceActionInventoryGate.isCurrent(token, target.workspaceId)
  || view().view !== "action-menu"
  || activeTarget?.workspaceId !== target.workspaceId
) return
```

Apply the same checks to stale fetches, adding expected revision.

**Global key ownership:** global keyboard handling starts around line 1678; modal/view early returns are around lines 1726-1738. Add `stale-workspaces` to the early-owned view paths before global dashboard navigation, tab, filter, and action keys.

`[s]` opens or refocuses the stale `UIView`. While the stale view is visible, no underlying list/detail key handler may run. Escape restores the originating workspace row. Lifecycle confirmation/operation views continue to take precedence.

Do not duplicate lifecycle submission code in the stale view. Route `a` through the existing action inventory/menu and only for confirmed candidates. Incomplete-only rows cannot open actions and must produce the shared explanation without transport.

---

## Test Pattern Assignments

### `tests/lib/core/forge-change-status.test.ts`

**Analog:** `tests/lib/forge-source-resolver.test.ts:76-193`.

Copy the injected scripted runner and exact argv assertions:

```typescript
expect(scripted.calls[0].argv.slice(0, 5)).toEqual(
  ["gh", "api", "graphql", "--hostname", "github.com"],
)
expect(scripted.calls[0].argv.join(" ")).not.toContain("token")
expect(scripted.calls[0].timeout_ms).toBeGreaterThan(0)
expect(scripted.calls[0].max_output_bytes).toBeGreaterThan(0)
```

Cover GitHub/GitLab merged, closed, and open; invalid provenance with zero runner calls; Gitea unsupported; missing CLI; auth; rate limit; unavailable provider; timeout; abort; oversized/malformed JSON; encoded GitLab path; and absence of raw detail in returned unknowns.

### `tests/lib/service/stale-workspaces.test.ts`

**Analogs:** service policy tests, `tests/lib/concurrency-limiter.test.ts`, and injected-clock patterns in forge review tests.

Required cases are the complete `127-VALIDATION.md:62-73` matrix, especially:

- one positive reason qualifies;
- reason plus unknown remains a candidate;
- unknown-only enters `incomplete`;
- cautions do not qualify;
- strict one-millisecond cutoff boundaries;
- stable lexicographic order;
- local evidence recomputed on cache hits;
- 300,000 ms fresh/expired behavior;
- ordinary singleflight;
- forced refresh bypass;
- cached unknowns;
- newest generation wins cache writes;
- revision conflict performs zero probe calls;
- evaluator has no mutation calls.

### `tests/service/web-stale-workspaces.test.ts`

**Analog:** `tests/service/web-forge-review.test.ts`.

Use service/router/projection integration plus source/CSS/DOM contract assertions. Cover singleton/refocus, retained data on refresh and refresh failure, one conflict reload/retry, late-response rejection, focus restoration, service order, path/credential/raw-output canaries, native action callbacks, and 375px/320px overflow rules.

### `tests/service/phase127-cross-client-conformance.test.ts`

**Analog:** `tests/service/phase126-cross-client-conformance.test.ts:130-203`.

Import the real shared client module and both renderer adapters. Assert identical service order, labels, reason/unknown/caution copy, exact timestamps, availability, callback identity, one-shot latches, conflict behavior, and terminal reconciliation. Do not compare two hand-built fixtures that bypass production adapters.

### `tests/tui/dashboard/StaleWorkspaces.test.tsx`

**Analog:** `tests/tui/dashboard/ForgeSourceReview.test.tsx:39-198`.

Use `bun:test` and `testRender`. Copy its render-frame, key injection, one-shot, responsive-width, and too-small assertions. Required widths include wide, medium, below 56, 40, and 39x11. Prove only Escape works in the too-small state and no stale-view key leaks to the dashboard.

Run through `npm run test:tui`; do not combine OpenTUI files into one Bun test process.

### `tests/architecture/phase127-stale-authority.test.mjs`

**Analog:** `tests/architecture/phase126-client-authority.test.mjs:7-119`.

Extend the static import/source scanner to reject:

- web imports from core or service internals;
- TUI imports outside `@git-stacks/service/client`;
- client provider CLI, Git remote checks, process spawning, or stale classification/ranking;
- evaluator imports of archive/remove/write/terminal mutation authority;
- browser fields containing paths, credentials, tokens, argv, stdout, stderr, or raw environment;
- synthetic provider identity derived from branch/remotes.

Include hostile fixture strings so every forbidden rule is proven to fire.

---

## Release, Documentation, and Receipt Patterns

### Root and seven workspace manifests plus `package-lock.json`

**Source of truth:** `scripts/check-packages.mjs:7-41,83-150`.

The script already enforces:

- root plus seven workspace versions match;
- internal `@git-stacks/*` ranges equal the exact release version;
- default dependency graph excludes optional TUI;
- all eight package dry-runs succeed;
- `.planning` and `.coverage` do not leak into tarballs.

Update every manifest to `0.22.0-rc.1`, every exact internal range to `0.22.0-rc.1`, and regenerate `package-lock.json` with npm. Do not hand-edit only the root version.

### `CHANGELOG.md`

**Analog:** current entry at lines 11-20.

Add the newest heading `## [0.22.0-rc.1] - 2026-07-17`, categorize stale intelligence and RC closure, and include the exact package/tag/dist-tag statement:

```text
0.22.0-rc.1 / v0.22.0-rc.1; npm prerelease publication uses next
```

Do not describe hosted/manual checks as passed unless exact-SHA receipts exist.

### `README.md`, `docs/stale-workspaces.md`, and migration/shortcut/shell notes

**README analogs:** shell `cd` integration at lines 210-222 and Shared Service Architecture beginning at line 456.

Document:

- advisory stale policy and confirmed versus incomplete evidence;
- web/TUI entry and refresh shortcuts through the canonical registry;
- no automatic cleanup and canonical lifecycle confirmations;
- configured-shell compatibility/support boundary;
- v0.22 migration notes, including that the 30-day threshold is fixed and no YAML migration/configuration is introduced.

`docs/forge-source-resolver.md` is the closest focused feature-doc analog for provider scope, validation limits, and implementation boundaries. A dedicated `docs/stale-workspaces.md` is reasonable, but the repository has no established v0.22 migration filename. The planner may fold migration/shortcut material into README if it avoids an unsupported documentation hierarchy.

### `docs/releasing.md`

**Analog:** same file lines 11-29 and 53-59.

Preserve the separation:

```text
npm run release:check
```

is validation-only. `--tag` is a later explicit action; publication starts only from the approved matching GitHub Release workflow. Add exact-SHA supported-host receipt requirements without turning a workflow dispatch into a release action.

### Release tests

**Sources:**

- `tests/commands/release-rc.test.ts:112-182`
- `tests/architecture/release-publish.test.mjs`
- `scripts/release-rc-check.mjs:45-50`

Update current `0.21.0-rc.6` assertions to `0.22.0-rc.1`, require matching changelog/README/docs language, and retain the default safety assertion:

```javascript
if (process.argv.includes("--tag")) {
  // explicit tag path
} else {
  console.log(
    `Verification only. Pass --tag explicitly to create ${rcTag}; ...`,
  )
}
```

The plan and verification commands must use `npm run release:check` without `--tag`.

### Phase 127 exact-SHA receipt index

**Closest analogs:**

- `.planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md`
- `.planning/phases/126-web-workflow-and-forge-source-parity/126-VERIFICATION.md`
- `.github/workflows/node-runtime-matrix.yml:7-10,41-62,91-154`

The Phase 126 handoff records a validated commit, deterministic command results, explicit missing hosted/manual categories, and a release stop. The hosted workflow is dispatchable, has `contents: read`, uses Node 24, and names package/shell artifacts with `${{ github.sha }}`.

Create a planner-selected Phase 127 receipt index containing, per evidence class:

- exact candidate SHA;
- workflow URL/run ID and `head_sha`;
- required job names and conclusions;
- safe artifact names and checksums;
- authenticated GitHub/GitLab sanitized receipts;
- live reconnect/two-client results;
- physical browser/xterm results;
- responsive screenshot locations;
- interactive OpenTUI results;
- human cross-client approval;
- explicit missing/blocked status where evidence is unavailable.

There is no canonical repository filename for this index. `127-RECEIPTS.md` is a candidate, not an established convention. Keep deterministic test results and hosted/manual evidence distinct.

**Mandatory release stop:**

> Do not tag, push, publish packages, create a release, or trigger release-only workflows without separate explicit authorization.

Do not dispatch `.github/workflows/release-artifacts.yml` or `.github/workflows/release-publish.yml` as preflight evidence.

## Shared Patterns

### Revision Before Probe

**Source:** `packages/service/src/secure/router.ts:536-556`

**Apply to:** stale secure route, web retry flow, TUI retry flow, service tests.

Parse request, build current trusted state, compare `expected_revision`, then and only then evaluate/cache/probe. A mismatch must produce zero probe calls.

### Closed Evidence Algebra

**Sources:** `packages/core/src/git.ts:239-258`, `127-RESEARCH.md:279-297`

**Apply to:** forge status, remote branch, worktree, activity, policy DTO projection.

Every probe returns confirmed positive/negative or sanitized unknown. Operational failure is never evidence of absence.

### Network-Only Cache

**Sources:** partial lifetime/TTL analog in `forge-source-review.ts:209-220,291-307,620-626`; prescriptive algorithm in `127-RESEARCH.md:299-312`.

**Apply to:** forge and remote-branch outcomes only.

Local activity, managed worktree status, dirty/ahead/drift/notes cautions are always recomputed.

### Service-Owned Ordering

**Source:** `127-RESEARCH.md:314-335`.

**Apply to:** evaluator and cross-client tests.

Web/TUI render response order without sorting, scoring, filtering, or moving incomplete rows into candidates.

### Canonical Action Authority

**Sources:**

- `packages/service/src/policy/workspace-actions.ts:134-168`
- `packages/client/src/workspace-actions.ts:94-136`

**Apply to:** web/TUI Open, Archive, Remove, Force Remove, confirmations, and reconciliation.

Stale evidence never grants destructive capability. Force Remove remains hidden/unavailable until a fresh same-revision typed dirty blocker permits it.

### Sanitized Browser Projection

**Sources:** `packages/protocol/src/web.ts:78-86`, `packages/service/src/web/projection.ts:222-264`.

**Apply to:** stale DTO, router response, browser tests, architecture sentinel.

Use allowlists, fixed enums, static messages, and final schema parse. Never project trusted probe objects.

### Monotonic Request Generations

**Sources:** `packages/client/src/forge-review.ts:220-255`, `packages/tui/src/workspace-action-inventory.ts:37-75`, `packages/web/src/app.ts:2114-2118`.

**Apply to:** service cache writes, shared stale gate, web state, TUI state.

Newest generation wins. Superseded work may finish for its original caller but cannot overwrite a newer cache or UI state.

### TUI Input Isolation

**Sources:** `packages/tui/src/ForgeSourceReviewDialog.tsx:59-63,115-122,165-176`, `packages/tui/src/App.tsx:1678-1738`.

**Apply to:** stale `UIView` and global dashboard handling.

The active view owns its keys before global handling. Below 40x12 only Escape is accepted. Never nest OpenTUI `<text>` nodes.

### Validation and Release Safety

**Sources:** `CLAUDE.md`, `127-VALIDATION.md:16-37`, `scripts/release-rc-check.mjs:45-50`, `docs/releasing.md:11-29`.

- Focused Node tests use `npx vitest run <files>`.
- OpenTUI tests use `npm run test:tui` for per-file Bun isolation.
- Full preflight uses `npm run release:check` without `--tag`.
- Hosted/manual receipts are not replaced by deterministic tests.

## Known Traps and Reuse Constraints

1. **Do not reuse the forge creation resolver's open-only outcome contract.** Reuse only its process runner, limits, argv construction, validation, and sanitization.
2. **Do not infer change identity.** Query forge status only from compatible persisted `workspace.source` provenance; no branch/remote heuristics.
3. **Do not treat Gitea as closed/open parity.** It is a sanitized unsupported-provider unknown in this phase.
4. **Do not probe before revision validation.** Cache reads also occur after revision validation.
5. **Do not cache local evidence.** Worktree/activity/cautions are current per evaluation.
6. **Do not let an older force refresh overwrite newer evidence.** Cache and renderer generations are separate required protections.
7. **Do not conflate unknown with present/absent.** Unknown-only workspaces are visible in `incomplete`, never candidates.
8. **Do not make repository evidence workspace-global.** Missing branch/worktree reasons retain repository identity.
9. **Do not add a numeric score.** The service uses the locked transparent tuple.
10. **Do not add stale probing to the base snapshot or background polling.** The route remains lazy and revision-bound.
11. **Do not move sorting or action availability into clients.** Both clients consume service order and canonical descriptors.
12. **Do not expose Force Remove on initial stale evidence.** It requires the normal fresh typed dirty-worktree sequence.
13. **Do not clear successful rows during refresh.** Retain data and show busy/error state in place.
14. **Do not allow stale-view keys to reach the TUI dashboard or browser terminal.** Use established shortcut preprocessing and view ownership.
15. **Do not use nested OpenTUI `<text>`.** Use sibling text nodes in row boxes.
16. **Do not claim hosted/manual evidence from fixtures or source assertions.** Record missing evidence honestly.
17. **Do not tag, push, publish, create a release, or trigger release-only workflows.** RC closure in this phase stops after preparation and evidence.

## No Exact Analog Found

| File / Concern | Role | Data Flow | Planner Guidance |
|---|---|---|---|
| `packages/service/src/policy/stale-workspaces.ts` as a whole | policy/cache service | batch, request-response, transform | Compose existing activity, branch, worktree, limiter, TTL-lifetime, and action-authority patterns; use `127-RESEARCH.md:299-335` for the new cache and ranking algorithm. |
| Race-safe five-minute network cache | utility inside policy | request-response, event-driven | No existing cache has the required ordinary singleflight + forced generation + newest-write-wins combination. Do not simplify it to a plain TTL map. |
| Phase 127 receipt index filename/layout | verification artifact | batch/manual | Follow Phase 126 handoff content, but select and document a Phase 127 filename; research explicitly found no canonical existing name. |
| Dedicated v0.22 migration document filename | documentation | transform | Repository has no migration-doc convention. Fold into README/changelog or create a focused file without implying an established naming pattern. |

## Metadata

**Analog search scope:**

- `packages/protocol/src`
- `packages/core/src`
- `packages/service/src`
- `packages/client/src`
- `packages/web/src`
- `packages/tui/src`
- `tests/lib`, `tests/service`, `tests/tui`, `tests/architecture`, `tests/commands`
- `scripts`, `.github/workflows`, `docs`, `README.md`, `CHANGELOG.md`
- Phase 126 handoff and verification artifacts

**Primary patterns retained:** strict Zod DTOs, argv-only bounded provider execution, revision-before-probe routing, service-lifetime volatile state, allowlist browser projection, generation-safe response acceptance, canonical lifecycle descriptors, singleton web overlays, dedicated TUI `UIView` key ownership, cross-client conformance, validation-only RC preparation, and exact-SHA receipt separation.

**Pattern extraction date:** 2026-07-17
