# Phase 123: Archived Workspaces and Safe Removal - Research

**Researched:** 2026-07-16
**Domain:** Revisioned workspace lifecycle, service-owned PTY shutdown, destructive Git/filesystem safety, and web/TUI reconciliation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Archive Behavior and Navigation
- Archiving the currently selected workspace immediately selects the next active workspace by the existing pin/priority order with recency as the fallback; if none exists, show the active-list empty state.
- Archiving stops all service-owned terminals for the workspace. Terminal shutdown must be confirmed before archive state is written; a close failure leaves the workspace active and changes no persisted archive state.
- Archive is a reversible one-step action with immediate feedback and an Undo/Unarchive affordance, not a destructive confirmation dialog.
- The Archived Workspaces surface is a singleton minimal overlay or view containing only workspace identity, the chosen activity/archive timestamp, and Unarchive. It exposes no pins, repositories, normal actions, or detail drill-in.

### Archive and Remove Safety
- Archive and Remove close and confirm every workspace terminal first. Any terminal-close failure leaves the workspace active and deletes nothing.
- Normal Remove uses a default-cancel confirmation that names the workspace and explicitly lists terminals, managed worktrees, the workspace directory, and the YAML definition as deleted; it does not require typed-name entry.
- If dirty worktrees block removal after terminals stop, deletion stops, every blocking repository is listed, and the UI clearly states that terminals were already stopped.
- Web and TUI offer Force Remove after the dirty-worktree failure. Force Remove requires typing the exact workspace name and clearly identifies the dirty repositories and irreversible deletion before bypassing the dirty guard.

### Shared Operations and Concurrency
- Archive, unarchive, remove, and force-remove are shared service/core operations used by web and TUI; clients contain no filesystem or Git deletion implementation.
- Stale revisions are rejected and the client refreshes. Remove and Force Remove are never replayed automatically; the user must reconfirm against current authoritative state.
- Archive and unarchive converge safely as idempotent state changes. Remove requests use idempotency keys so retries cannot delete unrelated or newly recreated state.
- Operation progress exposes named stages for stopping terminals, checking worktrees, removing worktrees, deleting workspace files, and reconciling state. Selection, terminal tabs, signals, counts, and navigation refresh from the authoritative result only.

### the agent's Discretion
- Exact visual styling, copy details, animation, and placement are flexible within the established web and TUI design systems, provided the locked confirmation, failure, minimal archive-view, and authoritative reconciliation behavior remains intact.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within the Phase 123 boundary.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-01 | Persist `archived: true` and `archived_at`; omitted fields mean active. | Paired optional schema fields, atomic `updateWorkspace`, and backward-compatible read behavior. [VERIFIED: `packages/core/src/config.ts`] |
| ARCH-02 | Web and TUI archive/unarchive through shared core/service operations. | Stable-ID revision-bound mutation contract and shared service lifecycle coordinator. [VERIFIED: `packages/service/src/policy/operations.ts`, `packages/service/src/secure/router.ts`] |
| ARCH-03 | Exclude archived workspaces from normal lists, counts, pins, switching, attention, and selection. | Partition active versus archived definitions before expensive projection; filter signal presentation and preserve archived pin metadata. [VERIFIED: `packages/service/src/policy/snapshot.ts`, `packages/core/src/workspace-pins.ts`] |
| ARCH-04 | Preserve workspace resources across archive/unarchive. | Preserve repositories, worktrees, directory, YAML, notes, config, pin, and priority fields. The locked CONTEXT supersedes only the terminal-preservation clause: terminals must stop and are not recreated by unarchive. [VERIFIED: `123-CONTEXT.md`] |
| ARCH-05 | Separate minimal archived surface in web and TUI. | Add one minimal archived-summary projection and one singleton client surface per client. [VERIFIED: `packages/protocol/src/web.ts`, `packages/tui/src/types.ts`] |
| ARCH-06 | Sort archived newest-first by relevant activity/archive time, show time, empty state, no detail expansion. | Compute one server-owned `activity_at` summary as `max(last_opened ?? created, archived_at)` and return it already sorted. [VERIFIED: `packages/core/src/config.ts`, `packages/core/src/workspace-ops.ts`] |
| REMOVE-01 | Consistently named Remove with explicit confirmation of all deleted resource classes. | Reuse client dialog/modal primitives but replace generic confirmation copy with a lifecycle-specific deletion inventory. [VERIFIED: `packages/tui/src/ConfirmDialog.tsx`, `packages/web/src/app.ts`] |
| REMOVE-02 | Close all service-owned terminals first and fail closed when shutdown is unconfirmed. | Add a global-by-workspace terminal barrier and repair close confirmation semantics before calling core removal. [VERIFIED: `packages/service/src/web/terminal-manager.ts`] |
| REMOVE-03 | Apply dirty-worktree protection after terminal shutdown and report blockers. | Preserve the core dirty check, replace string-only failure parsing with a typed lifecycle error carrying repository names and `terminals_stopped`. [VERIFIED: `packages/core/src/workspace-lifecycle.ts`] |
| REMOVE-04 | Delete managed worktrees, workspace directory, and YAML only for the target. | Reuse `removeWorkspace`/`commitCleanup`; harden definition-file deletion for filename drift and retain authoritative paths from the YAML. [VERIFIED: `packages/core/src/workspace-lifecycle.ts`, `packages/core/src/config.ts`] |
| REMOVE-05 | Reconcile selection, terminal tabs, signals, counts, navigation, and progress. | Add a final authoritative reconcile stage and full-set client reconciliation after both success and terminal-stopped failure. [VERIFIED: `packages/web/src/app.ts`, `packages/tui/src/core-store.ts`] |
</phase_requirements>

## Summary

Phase 123 should be implemented as one revision-bound, workspace-scoped lifecycle pipeline, not as four client actions that happen to call related functions. The existing architecture already has the correct ownership split: core owns YAML, Git, and filesystem mutation; the service owns operations, snapshots, event reconciliation, and PTYs; web and TUI are projections and intent senders. [VERIFIED: `packages/core/README.md`, `packages/service/README.md`, `packages/web/README.md`, `packages/tui/README.md`]

The locked discussion changes the most important original assumption: archive must stop and confirm every service-owned workspace terminal before writing archive state. This supersedes the terminal-preservation phrase in ARCH-04, the Phase 123 roadmap success criterion, and the older STATE decision, while preserving all non-terminal workspace resources and metadata. [VERIFIED: `123-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`]

The highest-risk implementation seam is terminal shutdown. `WebTerminalManager.close()` currently sets a session to `ended` after the SIGKILL wait even when that second wait times out, and a concurrent `terminal.create` can start a new PTY after enumeration but before archive/remove mutation. A per-workspace service coordinator must block new terminal creation, await one shared close promise for every matching session across principals, verify actual exit/removal, retain the block through core mutation and snapshot reconciliation, and then release it. [VERIFIED: `packages/service/src/web/terminal-manager.ts`, `packages/service/src/secure/router.ts`]

**Primary recommendation:** Build a stable-workspace-ID lifecycle coordinator in the service that performs execution-time revision validation, workspace-scoped quiescing, typed terminal/dirty failure reporting, core archive/remove mutation, and authoritative catalog reconciliation; make both clients consume that one contract. [VERIFIED: codebase architecture and `123-CONTEXT.md`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Archive fields and atomic state transition | Core / Storage | Service | Workspace YAML and its mutation lease already live in core; the service orders terminal shutdown before the write. [VERIFIED: `packages/core/src/config.ts`] |
| Dirty-worktree guard and deletion | Core / Filesystem + Git | Service | Core already owns `getDirtyWorktrees`, worktree deletion, directory removal, and YAML deletion. [VERIFIED: `packages/core/src/workspace-lifecycle.ts`] |
| Terminal quiesce and confirmed shutdown | Service / Backend | Protocol | PTYs are service-lifetime state and must never move into core or either client. [VERIFIED: `packages/service/src/web/terminal-manager.ts`] |
| Revision, idempotency, progress, and operation sequencing | Service / Backend | Protocol | The durable operation registry and router already own these semantics. [VERIFIED: `packages/service/src/policy/operations.ts`, `packages/service/src/secure/router.ts`] |
| Active/archived partition and minimal summaries | Service projection | Core schema | The service should avoid building Git/file/launch projections for archived definitions and expose only a bounded summary. [VERIFIED: `packages/service/src/policy/snapshot.ts`] |
| Confirmation, Undo, archived view, force-name input | Browser/TUI clients | Shared client helpers | These are presentation and input concerns; clients submit intent and never inspect or delete files. [VERIFIED: `packages/web/src/app.ts`, `packages/tui/src/App.tsx`] |
| Post-operation selection and tab rendering | Browser/TUI clients | Shared ordering helper | Clients choose/render from the authoritative active catalog only. [VERIFIED: `packages/client/src/presentation.ts`] |
| Signal visibility for archived/removed workspaces | Service presentation | Client reducers | Journal records remain durable, but normal signal surfaces must filter against active workspace IDs. [VERIFIED: `packages/service/src/policy/event-journal.ts`, `packages/tui/src/hooks/useSignals.ts`] |

## Project Constraints

- No `AGENTS.md` exists at the repository root, so there are no additional repository-local agent directives. [VERIFIED: filesystem check]
- Package boundaries are enforced: protocol imports nothing; client may import protocol; core imports no workspace package; web may import only client/protocol; TUI may import only the constrained service client rather than the service root. [VERIFIED: `scripts/check-architecture.mjs`]
- The browser must remain path/secret minimized and must not gain Node APIs, durable browser storage, HTTP/SSE/WebSocket, or local Git/filesystem authority. [VERIFIED: `scripts/check-architecture.mjs`, `packages/web/README.md`]
- The TUI remains Bun/OpenTUI and consumes trusted service state through `@git-stacks/service/client`; the default Node/Vitest coverage intentionally excludes its rendering tests. [VERIFIED: `packages/tui/README.md`, `scripts/test-tui.mjs`]
- The CLI remains daemonless for ordinary commands. Phase 123 should not make CLI removal depend on the service terminal coordinator. [VERIFIED: `packages/cli/README.md`, `.planning/STATE.md`]
- No new global lock should be introduced; the milestone permits semantic per-target read-modify-write coordination. [VERIFIED: `.planning/STATE.md`]

## Current System Findings

### Persistence and archive metadata

- `WorkspaceSchema` is Zod-backed, optional fields are backward compatible, `updateWorkspace` holds a per-file mutation lease, reparses the result, and atomically replaces YAML. This is the correct archive-state authority. [VERIFIED: `packages/core/src/config.ts`]
- Use canonical paired fields: omitted `archived` and `archived_at` mean active; archive writes `archived: true` plus one ISO timestamp; unarchive removes both fields. Repeated archive must retain the original `archived_at` rather than refreshing it. [VERIFIED: `123-CONTEXT.md`; recommended from existing optional-field pattern]
- Use `z.literal(true).optional()` for `archived` and `z.string().datetime({ offset: true }).optional()` for `archived_at`, with a refinement requiring both or neither. This prevents ambiguous persisted `archived: false` and half-written archive records while keeping old YAML valid. [VERIFIED: existing Zod timestamp pattern in `packages/protocol/src/service.ts`; recommended]
- Archive/unarchive should be core functions using `updateWorkspace`, preserving every other field by spread/destructure. They must not call close/clean hooks or integrations because archive is metadata state, not existing workspace close semantics. [VERIFIED: `packages/core/src/workspace-lifecycle.ts`; recommended from locked archive boundary]

### Active and archived projections

- `createSnapshotBuilder.buildAll()` currently projects every definition through Git status, file status, environment, commands, and launch data. Archived definitions should be partitioned before this work so they do not enter normal snapshots or incur normal projection side effects/cost. [VERIFIED: `packages/service/src/policy/snapshot.ts`]
- `CoreStateProvider` currently requires a one-to-one match between all definitions and projected snapshots. It must reconcile active definitions against active projections and separately derive `archived_workspaces` summaries from archived definitions. [VERIFIED: `packages/service/src/policy/core-state.ts`]
- Introduce one shared `ArchivedWorkspaceSummary` protocol shape: `{ id, name, activity_at }`. Do not include repositories, branch, pins, priority, commands, file status, notes, paths, or actions. [VERIFIED: `123-CONTEXT.md`; recommended protocol shape]
- Compute `activity_at` as the later valid timestamp of `last_opened ?? created` and `archived_at`, sort descending in the service, then use name and stable ID as deterministic ties. `last_opened` is the only existing persisted workspace-activity timestamp and is updated by `openWorkspace`; no new activity tracker is required in this phase. [VERIFIED: `packages/core/src/config.ts`, `packages/core/src/workspace-ops.ts`; recommended]
- Keep the existing total workspace-definition capacity check for this phase, so archived definitions still count toward the existing limit and the minimal archive list remains bounded by the current workspace model limit. ARCH-03 excludes archived items from user-facing active counts, not from persisted-definition capacity. [VERIFIED: `packages/service/src/policy/operations.ts`, `packages/protocol/src/service.ts`; recommended compatibility policy]
- The aggregate revision must digest both active projections and archived summaries. Otherwise archive-only changes or an all-archived state can retain/emit an incorrect revision; current web projection also falls back to revision `0` for an empty snapshots array. [VERIFIED: `packages/service/src/policy/snapshot.ts`, `packages/service/src/web/projection.ts`]
- Prefer an aggregate workspace-catalog result carrying `{ revision, generated_at, active, archived }` over reconstructing revision from `snapshots[0]`. Existing `buildAll()` can remain a compatibility adapter if other callers require it. [VERIFIED: current empty-state revision behavior; recommended]

### Terminal shutdown and lifecycle sequencing

- `WebTerminalManager` owns all service PTYs, but its public enumeration is principal-scoped. Archive/remove needs an internal global-by-workspace method that closes matching sessions across principals without exposing cross-principal terminal metadata to either client. [VERIFIED: `packages/service/src/web/terminal-manager.ts`]
- Add a workspace quiesce token keyed by stable workspace ID. Acquiring it serializes archive/unarchive/remove/force-remove for that workspace and makes `terminal.create` reject that workspace until the operation reaches authoritative reconciliation. [VERIFIED: operation executions currently run concurrently in `packages/service/src/policy/operations.ts`; recommended]
- Store one close promise per session. A close call that observes `closing` must await the same promise rather than returning a merely `closing` projection. After SIGTERM and SIGKILL timeouts, report `cleanup_failed` unless the exit promise actually settled; do not assign `ended` solely because a timeout completed. [VERIFIED: `packages/service/src/web/terminal-manager.ts`; recommended repair]
- A terminal-close failure aborts before archive YAML, dirty checks, worktree removal, directory deletion, or YAML deletion. Some terminal processes may already have stopped, but persisted archive/filesystem state stays unchanged. [VERIFIED: `123-CONTEXT.md`]
- Normal Remove checks dirty worktrees only after the terminal barrier. Dirty failure returns the workspace active with terminals already stopped. Force Remove starts a new revision-bound operation, reacquires the barrier idempotently, verifies the exact confirmation name server-side, and only then invokes the existing core force path. [VERIFIED: `123-CONTEXT.md`; recommended defense in depth]
- Keep terminal quiescing in the service. Core `removeWorkspace` must remain usable by the daemonless CLI, which has no service PTY inventory. [VERIFIED: `packages/cli/README.md`, `packages/core/src/workspace-lifecycle.ts`]

### Removal results, progress, and failures

- Core removal currently returns `{ ok, error }`, embeds dirty repositories in a string, and the service adapter converts every failure to a plain `Error`. This is insufficient for a force-removal UI and should not be solved by parsing English text. [VERIFIED: `packages/core/src/workspace-lifecycle.ts`, `packages/service/src/policy/operations.ts`]
- Add typed lifecycle outcomes/errors with a bounded code and structured fields such as `blocking_repositories`, `terminals_stopped`, and `force_allowed`. Browser projection must allowlist repository names but never filesystem paths. [VERIFIED: `ApiErrorSchema` supports bounded scalar details in `packages/protocol/src/service.ts`; recommended]
- Because `ApiError.details` cannot carry arrays, either add a bounded lifecycle detail schema to `WebOperationSchema`/the operation error contract or encode blocker names as a bounded structured progress/result record. Do not comma-join names into a value clients must parse. [VERIFIED: `packages/protocol/src/service.ts`, `packages/protocol/src/web.ts`; recommended]
- Carry lifecycle stage names in `OperationProgress.data`, for example `{ kind: "workspace-lifecycle", phase: "stopping_terminals" }`, while retaining the generic `preparing/executing/rolling_back` stage. Extend the browser allowlist to expose only the lifecycle phase, safe message, counts, and blocker names. [VERIFIED: `OperationProgressSchema` already supports structured data; `projectWebOperation` currently strips it]
- A final `reconciling_state` execution step should rebuild the aggregate catalog and place its revision in the operation result before success. The existing post-success monitor invalidation can publish the control event, and clients can ignore a later duplicate invalidation for the revision they already loaded. [VERIFIED: `packages/service/src/main.ts`, `packages/tui/src/core-store.ts`; recommended]
- `deleteWorkspace(name)` currently unlinks the canonical filename even though reads support a definition whose filename drifted from its internal name. Removal should delete the resolved backing `workspaceFilePath(name)` so REMOVE-04 holds for valid drifted definitions. [VERIFIED: `packages/core/src/config.ts`]

### Revision and idempotency semantics

- Browser open/close already submit stable workspace IDs plus `expected_revision`; trusted TUI/core mutations currently submit names without revisions. New archive/remove contracts should use workspace ID plus expected revision for both clients, with the router resolving the current authoritative name. [VERIFIED: `packages/protocol/src/web.ts`, `packages/service/src/policy/core-contract.ts`, `packages/tui/src/App.tsx`]
- Revalidate the expected revision after acquiring the workspace operation gate, immediately before terminal shutdown. Submission-time validation alone is vulnerable to a queued operation changing the workspace before execution. [VERIFIED: operations schedule asynchronously and execute concurrently in `packages/service/src/policy/operations.ts`; recommended]
- For archive/unarchive, a stale request may still return idempotent success only when the same stable workspace ID already has the requested final state; it must not refresh `archived_at`. Any other stale state returns conflict and requires refresh. [VERIFIED: `123-CONTEXT.md`; recommended convergence rule]
- Remove/Force Remove retain one idempotency key for transport retry of one confirmed intent. A new confirmation creates a new key. A missing target under a different key is `not_found`, never success, so a newly recreated workspace cannot be deleted by replay. [VERIFIED: durable request hashing/reservations in `packages/service/src/policy/operations.ts`; recommended]
- Neither web nor TUI should copy the conflict auto-retry used by `terminal.create`; destructive operations refresh and require confirmation again. [VERIFIED: `packages/web/src/app.ts`, `123-CONTEXT.md`]

### Client reconciliation and pin/signal edges

- Web snapshot refresh currently clears an invalid selected pair and chooses a pinned/first workspace, but terminal reconciliation only adds sessions and does not dispose terminal views absent from `terminal.list`. An internal operation close can therefore leave a dead view. Reconcile terminal views as a full authoritative set after archive/remove success and after terminal-stopped failure. [VERIFIED: `packages/web/src/app.ts`]
- TUI state refreshes from snapshot-invalidated events, but lifecycle completion should explicitly await/reuse the authoritative reload so selection and progress do not depend on event timing. [VERIFIED: `packages/tui/src/core-store.ts`, `packages/tui/src/App.tsx`]
- Add a shared selection comparator: pinned first, numeric priority descending, persisted activity descending, then name/ID. After archiving the selected workspace, choose the first remaining active workspace by that order and its first repository; otherwise render the existing active empty state. [VERIFIED: `packages/client/src/presentation.ts`, `123-CONTEXT.md`; recommended]
- `setWorkspacePins` currently clears pin metadata from every workspace omitted from the active pin request. Once archived workspaces leave the active projection, this would erase their retained pin state. Restrict active pin replacement to active definitions and leave archived definitions untouched. [VERIFIED: `packages/core/src/workspace-pins.ts`]
- TUI signal rendering already drops signals whose workspace ID is absent from `core.state.workspaces`. Browser signal projection still passes notifications without checking active workspace IDs. Filter both activity and notifications against authoritative active IDs at service presentation time; retain journal records so unarchive remains reversible. [VERIFIED: `packages/tui/src/hooks/useSignals.ts`, `packages/service/src/web/projection.ts`]
- Archived summaries must not enter normal workspace counts, pinned IDs, priority updates, terminal creation resolution, normal action menus, repository groups, or detail panes. Partitioning at the authoritative catalog boundary provides this property with fewer client-specific filters. [VERIFIED: current clients derive these surfaces from snapshots/core state]

## Standard Stack

### Core

| Library / Runtime | Version | Purpose | Why Standard |
|-------------------|---------|---------|--------------|
| TypeScript | 6.0.3 installed (`^6.0.2`) | Shared contracts and implementation | Existing monorepo language and typecheck target. [VERIFIED: local binary and root `package.json`] |
| Zod | 4.3.6 | Workspace/protocol strict validation | Existing schema authority in core and protocol. [VERIFIED: package manifests] |
| YAML | 2.8.3 | Persist workspace definitions | Existing atomic workspace persistence format. [VERIFIED: `packages/core/package.json`] |
| Node.js | 26.5.0 available; project requires >=24 | Core, service, protocol, web build/test runtime | Existing supported runtime contract. [VERIFIED: local binary and root `package.json`] |
| Git | 2.55.0 available | Dirty checks and managed worktree removal | Existing core lifecycle dependency. [VERIFIED: local binary and `packages/core/src/git.ts`] |

### Supporting

| Library / Runtime | Version | Purpose | When to Use |
|-------------------|---------|---------|-------------|
| Vitest | 4.1.10 | Core/service/protocol unit and integration tests | All non-TUI source-level tests. [VERIFIED: local binary and root `package.json`] |
| Bun | 1.3.14 | TUI runtime and isolated rendering tests | TUI build and OpenTUI test files only. [VERIFIED: local binary and `packages/tui/package.json`] |
| Solid / OpenTUI Solid | 1.9.12 / 0.4.3 | TUI reactive view state and dialogs | Archived list, confirmations, force input, and progress in TUI. [VERIFIED: `packages/tui/package.json`] |
| Browser DOM + existing modal/context primitives | Repository-native | Web lifecycle surfaces | Keep the current dependency-free DOM app; no new UI framework. [VERIFIED: `packages/web/src/app.ts`] |
| node-pty | 1.2.0-beta.14 exact | Service-owned PTYs | Extend manager semantics; do not update this dependency in Phase 123. [VERIFIED: `packages/service/package.json`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Aggregate active+archived service catalog | Client-side filtering of full workspace definitions | Rejected: browser would receive forbidden detail, archived workspaces would still incur Git/file projection, and clients could diverge. [VERIFIED: package boundaries and locked minimal view] |
| Workspace-scoped service quiesce gate | Global operation lock | Rejected: unrelated workspaces would block each other and it conflicts with the milestone's per-target coordination rule. [VERIFIED: `.planning/STATE.md`] |
| Typed lifecycle failure/progress | Parsing current error/progress strings | Rejected: copy changes would break force-removal flow and structured reconciliation. [VERIFIED: current string-only lifecycle adapter] |
| Existing core remove path | Client-side `git worktree remove`/filesystem deletion | Rejected: violates shared authority, browser safety, and cross-client consistency. [VERIFIED: `123-CONTEXT.md`] |

**Installation:** No packages should be installed for Phase 123. [VERIFIED: required capabilities already exist in repository dependencies]

## Package Legitimacy Audit

Not applicable. Phase 123 requires no external package additions or updates. [VERIFIED: standard stack is repository-existing]

## Architecture Patterns

### System Architecture Diagram

```text
Web action / TUI action
        |
        | stable workspace_id + expected_revision + idempotency key
        | (+ exact confirmation_name for force-remove)
        v
Secure service router -- validate schema/scope and resolve authoritative target
        |
        v
Workspace lifecycle coordinator (keyed by stable workspace ID)
        |
        +--> acquire target gate / reject terminal.create for target
        |
        +--> execution-time revision check
        |       +--> stale and desired state not reached -> conflict -> refresh/reconfirm
        |
        +--> stop and CONFIRM every matching service PTY across principals
        |       +--> any unconfirmed exit -> fail; no YAML/Git/filesystem mutation
        |
        +--> archive branch
        |       +--> atomic core YAML RMW: archived=true + archived_at
        |
        +--> remove branch
        |       +--> core dirty check
        |               +--> dirty normal remove -> typed failure; terminals_stopped=true
        |               +--> force + exact name -> bypass guard
        |       +--> remove managed worktrees -> workspace dir -> resolved YAML file
        |
        +--> rebuild active+archived catalog / authoritative revision
        |
        +--> release target gate
        v
Durable operation event/result + snapshot invalidation
        |
        +--> Web: full-set snapshot/terminal/signal reconciliation
        +--> TUI: core-state/signal reload and deterministic selection
```

The flow keeps all destructive and terminal authority in the core/service boundary and makes clients presentation-only. [VERIFIED: repository architecture; recommended composition]

### Recommended Project Structure

```text
packages/core/src/
├── config.ts                    # archive schema, resolved definition deletion
├── workspace-archive.ts         # atomic idempotent archive/unarchive domain functions
├── workspace-lifecycle.ts       # typed dirty/removal progress and outcomes
├── workspace-pins.ts            # preserve pins on archived definitions
└── workspace-status.ts          # existing dirty-worktree authority
packages/protocol/src/
├── service.ts                   # archived summary, lifecycle mutation/progress/error contracts
└── web.ts                       # path-minimized web catalog/operation projection contracts
packages/client/src/
└── presentation.ts              # deterministic selection/archive ordering helpers
packages/service/src/
├── policy/snapshot.ts           # active/archived catalog and revision digest
├── policy/core-state.ts         # trusted active state + minimal archived summaries
├── policy/core-contract.ts      # shared stable-ID lifecycle requests
├── policy/operations.ts         # lifecycle coordinator execution and named stages
├── web/terminal-manager.ts      # workspace quiesce + confirmed close-all
├── web/projection.ts            # minimal archive and safe lifecycle detail allowlist
├── secure/router.ts             # revision/identity resolution; shared terminal manager injection
└── main.ts                      # wire one terminal manager/coordinator into router + adapters
packages/web/src/
├── app.ts                       # actions, confirmations, archive overlay, reconciliation
└── app.css                      # established visual system only
packages/tui/src/
├── App.tsx / types.ts           # lifecycle state machine and authoritative selection
├── ActionMenu.tsx               # Archive + Remove intents
└── lifecycle views              # minimal archive list, remove/force dialogs, progress/failure
```

This is a responsibility map, not a requirement to create every suggested new file; small pure contracts may remain in existing modules when that better matches local cohesion. [VERIFIED: current repository structure; recommended]

### Pattern 1: Paired Optional Archive State

**What:** Persist only canonical archived state and remove both fields on unarchive. [VERIFIED: locked requirement and existing optional metadata style]

**When to use:** Every core read/write and archive transition. [VERIFIED: `ARCH-01`]

```typescript
// Source: repository WorkspaceSchema/updateWorkspace pattern
const ArchiveStateSchema = z.object({
  archived: z.literal(true).optional(),
  archived_at: z.string().datetime({ offset: true }).optional(),
}).refine((value) => Boolean(value.archived) === Boolean(value.archived_at))

updateWorkspace(name, (current) => current.archived === true
  ? current
  : { ...current, archived: true, archived_at: clock().toISOString() })
```

### Pattern 2: Workspace Quiesce Lease

**What:** One per-workspace service lease spans terminal admission blocking, terminal exit confirmation, core mutation, and catalog reconciliation. [VERIFIED: concurrency gaps in current manager/registry; recommended]

**When to use:** Archive, unarchive, remove, force-remove, and terminal creation admission. Unarchive needs serialization but no terminal stop. [VERIFIED: `123-CONTEXT.md`]

```typescript
// Source: recommended composition from current OperationRegistry and WebTerminalManager
await lifecycleGate.withWorkspace(workspaceId, async (lease) => {
  await assertRevisionOrIdempotentFinalState(request)
  if (request.kind !== "unarchive") {
    lease.blockTerminalCreation()
    await terminals.closeWorkspaceConfirmed(workspaceId)
  }
  await mutateCore(request)
  result.revision = await catalog.currentRevision()
})
```

### Pattern 3: Typed Dirty Failure and Elevated Retry

**What:** Normal remove fails with a typed, bounded blocker list after terminals stop; Force Remove is a new confirmed operation with exact-name server validation. [VERIFIED: `123-CONTEXT.md`; recommended contract]

**When to use:** Only when the core dirty guard blocks normal Remove. Force is not presented for unrelated failures. [VERIFIED: locked decision]

```typescript
// Source: recommended protocol contract; values are illustrative
{
  code: "workspace_dirty",
  message: "Dirty worktrees block removal",
  lifecycle: {
    blocking_repositories: ["api", "web"],
    terminals_stopped: true,
    force_allowed: true,
  },
}
```

### Pattern 4: Authoritative Full-Set Reconciliation

**What:** Treat returned/reloaded catalog, terminal list, and active-ID-filtered signal projection as replacement sets. [VERIFIED: current add-only terminal reconciliation gap; recommended]

**When to use:** Archive/remove success and any failed operation whose details say terminals stopped. [VERIFIED: locked dirty-failure behavior]

```typescript
// Source: recommended extension of existing refreshSnapshot/loadTerminals flow
const [catalog, terminals, signalProjection] = await Promise.all([
  refreshWorkspaceCatalog(),
  fetchTerminals(),
  refreshSignals(),
])
reconcileTerminalViewsExactly(terminals)
selectFromActiveCatalog(catalog)
```

### Component Responsibilities

| Component | Owns | Must Not Own |
|-----------|------|--------------|
| Core archive module | Archive fields, timestamps, atomic idempotent RMW | PTY discovery, client selection, browser copy. [VERIFIED: architecture] |
| Core removal lifecycle | Dirty check, managed worktrees, directory, definition deletion | Browser/TUI confirmation or service principal logic. [VERIFIED: architecture] |
| Service lifecycle coordinator | Revision check, per-target lease, terminal barrier, force authorization contract, progress/reconcile ordering | Rendering or raw filesystem implementation. [VERIFIED: locked shared-operation decision] |
| Terminal manager | Admission gate and confirmed process-group exit | YAML or Git mutation. [VERIFIED: current manager boundary] |
| Protocol/projection | Bounded stable-ID requests and safe summaries/details | Paths, environment, secrets, or arbitrary thrown objects in browser. [VERIFIED: web safety boundary] |
| Web/TUI | Confirmations, exact-name input, Undo, archived view, deterministic selection | Git commands, directory deletion, or local YAML writes. [VERIFIED: locked decision] |

### Anti-Patterns to Avoid

- **Filtering only in render functions:** Archived workspaces would still affect counts, pins, signals, terminal launch resolution, and expensive projections. Partition at the authoritative catalog boundary. [VERIFIED: current data flow]
- **Calling terminal close from each client:** It misses other principals, is race-prone, and lets a client continue after partial close. Use one internal workspace barrier. [VERIFIED: principal-scoped terminal API]
- **Treating SIGKILL send as exit confirmation:** Sending a signal is not proof the exit promise settled. [VERIFIED: current timeout bug]
- **Parsing `Dirty worktrees: a, b`:** Repository names/copy changes make string parsing ambiguous. Use typed fields. [VERIFIED: current error shape]
- **Automatically retrying Remove after conflict/reconnect:** The user must see current state and confirm again. [VERIFIED: locked decision]
- **Clearing archived pins from an active pin replacement call:** Archived pin state must survive unarchive. [VERIFIED: `ARCH-04` and current `setWorkspacePins` loop]
- **Building normal snapshots for archived definitions and hiding them later:** This violates minimality and creates avoidable Git/filesystem work. [VERIFIED: snapshot builder behavior]
- **Returning raw paths in browser confirmation/error detail:** The browser projection is deliberately path minimized. Use resource categories and repository display names. [VERIFIED: web projection contract]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML atomicity | Direct `writeFile` from service/client | `updateWorkspace` + existing mutation lease/atomic replace | Preserves validation, permissions, cache invalidation, and concurrency behavior. [VERIFIED: `packages/core/src/config.ts`] |
| Worktree dirtiness/removal | Client Git commands | `getDirtyWorktrees` and core lifecycle | Existing repo-mode/path authority and safety are already centralized. [VERIFIED: core lifecycle] |
| Operation retry identity | Ad hoc in-memory debounce | Durable `OperationRegistry` idempotency reservations | Survives process lifetime and hashes canonical input. [VERIFIED: service operations] |
| Workspace ordering | Separate web/TUI sort rules | Shared client comparator | Prevents successor/archived ordering divergence. [VERIFIED: existing shared `workspacePriorityOrder`] |
| Confirmation name security | Client-only button enablement | Strict protocol field plus authoritative server comparison | Prevents alternate clients from bypassing elevated intent. [VERIFIED: secure router boundary; recommended] |
| Terminal process confirmation | Fixed sleep followed by assumed success | Existing exit promise with bounded TERM/KILL waits and explicit failure | A timeout must remain an unconfirmed failure. [VERIFIED: terminal manager] |
| Archived activity tracking | New event database | Existing persisted `last_opened`/`created` plus `archived_at` | Meets this phase's bounded minimal summary without introducing a new authority. [VERIFIED: core schema] |

**Key insight:** This phase is coordination-heavy, not library-heavy. Reusing existing authorities while strengthening the seams between them is safer than adding new persistence, Git, terminal, or UI dependencies. [VERIFIED: codebase findings]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Existing workspace YAML omits archive fields; operations live in `operations.json`; events/signals live in `events.jsonl`; web preferences may retain dead pair/tab IDs in memory. [VERIFIED: config, operation registry, event journal, web app] | No batch YAML migration: omitted fields stay active. Keep new protocol fields optional/backward compatible for retained operation/event records. Reconcile dead client IDs from authoritative sets. |
| Live service config | Service holds snapshot aggregate/revision caches, terminal sessions, operation executions, event subscriptions, and signal visibility in memory. [VERIFIED: service policy/router] | Add workspace quiesce state in memory, invalidate/rebuild the aggregate after mutation, and ensure service restart has no persisted lease to recover. |
| OS-registered state | Managed service discovery descriptor contains endpoint/trust/process metadata but no workspace list or archive marker. [VERIFIED: `packages/service/src/main.ts`] | None; no OS registration migration. |
| Secrets/env vars | Workspace env/secrets can be present in authoritative definitions and launch projections but archive state introduces no new key or variable. [VERIFIED: core schema/snapshot] | Preserve values in YAML; never project them into archived browser summaries or lifecycle errors. |
| Build artifacts | `packages/*/dist`, web `dist`, and TUI `dist` are generated; Node/conformance tests import built packages. [VERIFIED: manifests and test imports] | Rebuild packages/web/TUI before Node/full gates; do not edit generated artifacts by hand. |

After all source files are updated, no external database, cloud service, OS registry, or secret store retains archive state. The only durable new state is in workspace YAML; operation/event stores retain bounded protocol records as they already do. [VERIFIED: repository architecture]

## Common Pitfalls

### Pitfall 1: Context/requirements contradiction
**What goes wrong:** A plan preserves terminal processes because ARCH-04 and ROADMAP still say so. [VERIFIED: planning files]
**Why it happens:** The user changed the decision during discuss-phase. [VERIFIED: `123-CONTEXT.md`]
**How to avoid:** Copy the supersession into every plan objective and test archive by proving PTYs exit before YAML changes. [VERIFIED: locked decision]
**Warning signs:** Tests expect reattachment to an archived workspace or unarchive to revive old terminal IDs. [VERIFIED: derived acceptance constraint]

### Pitfall 2: Terminal creation TOCTOU
**What goes wrong:** A new PTY appears after close-all enumerates sessions but before deletion/archive. [VERIFIED: current manager has no workspace admission gate]
**Why it happens:** Operations execute concurrently and `terminal.create` is independent. [VERIFIED: service router/registry]
**How to avoid:** Hold the stable-ID quiesce lease through final catalog revision. [VERIFIED: recommended]
**Warning signs:** Concurrency tests can create a terminal while progress says `checking_worktrees`. [VERIFIED: derived test]

### Pitfall 3: False shutdown confirmation
**What goes wrong:** A process survives but the manager reports `ended`. [VERIFIED: current post-SIGKILL timeout assignment]
**Why it happens:** The second `Promise.race` result is ignored. [VERIFIED: terminal manager]
**How to avoid:** Test the settled result and return `cleanup_failed` when it times out. [VERIFIED: recommended]
**Warning signs:** Session is deleted without the fake PTY exit callback firing. [VERIFIED: derived test]

### Pitfall 4: Dirty failure cannot drive Force Remove
**What goes wrong:** UI must parse an English error string and cannot reliably know terminals stopped. [VERIFIED: current lifecycle/operation adapter]
**Why it happens:** Typed core details are discarded when the adapter throws. [VERIFIED: operations adapter]
**How to avoid:** Preserve typed error details through Operation, web projection, service client, and both UI state machines. [VERIFIED: recommended]
**Warning signs:** Code uses regex or `split(",")` on `error.message`. [VERIFIED: derived static check]

### Pitfall 5: Archived pins silently disappear
**What goes wrong:** Saving the active pin set unpins archived definitions. [VERIFIED: current `setWorkspacePins` behavior]
**Why it happens:** Replacement semantics iterate all definitions while archived IDs are absent from the client request. [VERIFIED: current implementation]
**How to avoid:** Apply replacement only to active definitions and preserve archived metadata. [VERIFIED: recommended]
**Warning signs:** Archive pinned workspace, pin another, unarchive, original is no longer pinned. [VERIFIED: derived integration test]

### Pitfall 6: Empty/all-archived revision becomes `0`
**What goes wrong:** Clients cannot submit correct unarchive mutations or distinguish catalog changes. [VERIFIED: current `projectWebSnapshot` fallback]
**Why it happens:** Revision is inferred from the first active snapshot. [VERIFIED: web projection]
**How to avoid:** Return revision at aggregate catalog level. [VERIFIED: recommended]
**Warning signs:** `web.snapshot.revision === "0"` while archived summaries exist. [VERIFIED: derived test]

### Pitfall 7: Dead terminal tabs remain after service-side close
**What goes wrong:** Browser views remain in `terminalViews` after the internal manager deleted sessions. [VERIFIED: add-only `loadTerminals`]
**Why it happens:** The existing per-tab close path assumes the browser initiated close. [VERIFIED: web app]
**How to avoid:** Reconcile by exact returned terminal IDs and dispose missing views after lifecycle operations. [VERIFIED: recommended]
**Warning signs:** A tab reconnects and receives `Unknown terminal` after archive/remove. [VERIFIED: derived UAT check]

### Pitfall 8: Filename-drift removal leaves YAML
**What goes wrong:** A valid definition found by content cannot be deleted at `${name}.yml`. [VERIFIED: config lookup/delete mismatch]
**Why it happens:** Reads resolve the backing path but delete reconstructs it. [VERIFIED: config]
**How to avoid:** Delete the resolved backing file under the existing mutation/cache discipline. [VERIFIED: recommended]
**Warning signs:** REMOVE-04 passes canonical filenames but fails the existing filename-drift fixture style. [VERIFIED: derived test]

### Pitfall 9: Force Remove is available for every failure
**What goes wrong:** Users can bypass errors unrelated to dirtiness, such as unconfirmed terminal exit or stale revision. [VERIFIED: locked force boundary]
**Why it happens:** UI treats `operation_failed` as one class. [VERIFIED: current generic error projection]
**How to avoid:** Offer force only for typed dirty failure with `terminals_stopped=true` and refresh before the exact-name prompt. [VERIFIED: recommended]
**Warning signs:** Force button appears after terminal cleanup failure or conflict. [VERIFIED: derived UI test]

### Pitfall 10: Archive retains normal signal/action surfaces
**What goes wrong:** Archived notifications remain in browser inbox or archived rows expose pins/details. [VERIFIED: current browser notification filter and locked minimality]
**Why it happens:** Only workspace list rendering was filtered. [VERIFIED: current data flow]
**How to avoid:** Filter at active-ID projection and use a separate summary schema/view. [VERIFIED: recommended]
**Warning signs:** Archived workspace appears in signal count, context menu, or terminal launch resolution. [VERIFIED: derived tests]

## State of the Art

| Old / Current Approach | Required Phase 123 Approach | Impact |
|------------------------|-----------------------------|--------|
| Core/service lifecycle mutation is one generic operation step. [VERIFIED: operations adapter] | Service-coordinated, named multi-stage workspace lifecycle. [VERIFIED: locked decision] | Enables terminal-first preconditions, structured failure, and honest progress. |
| Web operations expose create/open/close only. [VERIFIED: web protocol] | Shared archive/unarchive/remove/force-remove stable-ID contract. [VERIFIED: phase scope] | Removes client authority drift and enables parity. |
| TUI lifecycle requests use workspace names without revision. [VERIFIED: TUI/service client] | New destructive lifecycle requests carry stable ID and expected revision. [VERIFIED: recommended] | Prevents stale-name and queued-operation races. |
| Terminal close assumes success after a bounded kill sequence. [VERIFIED: terminal manager] | Exit-confirmed close promise plus workspace admission gate. [VERIFIED: locked safety requirement] | Makes “terminal stopped before mutation” testable and real. |
| Snapshot array represents all usable workspaces. [VERIFIED: snapshot builder] | Aggregate catalog partitions active full projections from archived minimal summaries. [VERIFIED: archive requirements] | Enforces exclusion/minimality and supports all-archived state. |

**Deprecated/outdated:** The terminal-preservation wording in ARCH-04, ROADMAP Phase 123 success criterion 1, ROADMAP scope control, and STATE archive decision is superseded for this phase by `123-CONTEXT.md`. [VERIFIED: planning files]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | None. All implementation findings are verified from repository source/tests or are explicit recommendations derived from locked user decisions. | — | — |

## Open Questions

No blocking product questions remain. [VERIFIED: `123-CONTEXT.md` status is Ready for planning]

The planner should encode these researched discretion choices rather than reopen them: use `max(last_opened ?? created, archived_at)` for the displayed archive activity time; retain the existing total definition capacity; expose repository display names but no paths in browser confirmation/error details; and make exact-name confirmation a server-validated field as well as a client affordance. [VERIFIED: codebase constraints; recommended]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Core/service/protocol/web tests and builds | ✓ | 26.5.0 (project >=24) | — [VERIFIED: local probe] |
| npm | Workspace builds and gates | ✓ | 11.17.0 | — [VERIFIED: local probe] |
| Vitest | Focused core/service validation | ✓ | 4.1.10 | — [VERIFIED: local probe] |
| TypeScript | Type validation | ✓ | 6.0.3 | — [VERIFIED: local probe] |
| Bun | TUI build/render tests | ✓ | 1.3.14 | — [VERIFIED: local probe] |
| Git | Dirty/worktree integration tests | ✓ | 2.55.0 | Existing test fixtures isolate Git state. [VERIFIED: local probe and test helpers] |

**Missing dependencies with no fallback:** None. [VERIFIED: local probes]

**Missing dependencies with fallback:** None. [VERIFIED: local probes]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 for core/service/protocol; Bun 1.3.14 + OpenTUI preload for TUI; Node test runner for built contract/runtime coverage. [VERIFIED: root scripts] |
| Config file | `vitest.config.ts`, `packages/tui/bunfig.toml`, and `scripts/test-tui.mjs`. [VERIFIED: repository files] |
| Quick run command | `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/lib/config.test.ts tests/lib/workspace-pins.test.ts tests/lib/workspace-lifecycle.test.ts tests/lib/service/snapshot.test.ts tests/lib/service/operations.test.ts tests/service/web-terminal.test.ts tests/service/web-projection.test.ts` |
| TUI quick command | `bun test --preload @opentui/solid/preload tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` |
| Full suite command | `npm test && npm run typecheck && npm run test:deps && npm run verify:gates` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-01 | Paired archive fields, omitted active, atomic/idempotent transitions | unit | `vitest run tests/lib/workspace-archive.test.ts tests/lib/config.test.ts` | ❌ Wave 0 / ✅ existing config base |
| ARCH-02 | Shared revision-bound archive/unarchive contract for browser and TUI | service integration | `vitest run tests/lib/service/workspace-lifecycle-operations.test.ts` | ❌ Wave 0 |
| ARCH-03 | Archived excluded from active snapshot, pins, signal projection, selection | unit/integration | `vitest run tests/lib/service/snapshot.test.ts tests/lib/workspace-pins.test.ts tests/service/web-projection.test.ts` | ✅ extend existing |
| ARCH-04 | Non-terminal resources/pin survive; terminals stop and are not recreated | service/core integration | `vitest run tests/lib/workspace-archive.test.ts tests/service/web-terminal.test.ts` | ❌/✅ extend |
| ARCH-05 | Minimal singleton archived surfaces in both clients | TUI rendering + web contract/UAT | `bun test --preload @opentui/solid/preload tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` | ❌ Wave 0 |
| ARCH-06 | Newest-first deterministic summary, timestamp, empty state | unit + TUI rendering | `vitest run tests/service/web-projection.test.ts tests/service/web-presentation.test.ts` | ✅ extend; TUI file ❌ |
| REMOVE-01 | Default-cancel confirmation lists target/resource classes | TUI rendering + web UAT/static contract | TUI command above | ❌ Wave 0 |
| REMOVE-02 | All workspace PTYs exit before mutation; failure mutates nothing | service unit/integration | `vitest run tests/service/web-terminal.test.ts tests/lib/service/workspace-lifecycle-operations.test.ts` | ✅ extend / ❌ Wave 0 |
| REMOVE-03 | Dirty guard runs after stop and reports typed blockers | core/service integration | `vitest run tests/lib/workspace-lifecycle.test.ts tests/lib/service/workspace-lifecycle-operations.test.ts` | ✅ extend / ❌ Wave 0 |
| REMOVE-04 | Managed worktrees, directory, resolved YAML deleted; unrelated state intact | integration | `vitest run tests/commands/workspace-lifecycle.test.ts tests/commands/workspace-destructive-safety.test.ts` | ✅ extend |
| REMOVE-05 | Named progress and authoritative snapshot/terminal/signal reconciliation | service + TUI integration | `vitest run tests/lib/service/workspace-lifecycle-operations.test.ts tests/service/web-projection.test.ts` plus TUI command | ❌/✅ extend |

### Required Concurrency/Failure Cases

- Terminal creation during a held archive/remove quiesce lease is rejected and no PTY is spawned. [VERIFIED: derived from locked concurrency requirement]
- One terminal exits on SIGTERM, one on SIGKILL, and one never exits; only the never-exit case aborts before core mutation. [VERIFIED: derived from terminal barrier]
- Two archive requests with different idempotency keys converge without changing the first `archived_at`; a stale conflicting state still fails. [VERIFIED: locked idempotence]
- Same-key Remove retry returns the original operation; same key with different body conflicts; a new key after deletion returns not-found. [VERIFIED: existing idempotency contract plus locked removal semantics]
- Normal dirty Remove reports all blocker names and `terminals_stopped=true`; Force Remove is accepted only after exact-name match and current revision. [VERIFIED: locked force flow]
- Archive pinned workspace, change active pins, unarchive, and prove the original pin is restored. [VERIFIED: ARCH-04 edge]
- Archive/remove selected workspace and prove successor/empty state, terminal view disposal, signal/count exclusion, and no automatic destructive replay after conflict. [VERIFIED: locked reconciliation]

### Sampling Rate

- **Per task commit:** Run the narrow Vitest or Bun file named by the test map plus the affected package typecheck. [VERIFIED: repository test layout]
- **Per wave merge:** Run the quick Vitest set, the new TUI integration file, `npm run typecheck`, and `npm run test:deps`. [VERIFIED: repository scripts]
- **Phase gate:** `npm test && npm run typecheck && npm run test:deps && npm run verify:gates`, followed by live web and TUI UAT for archive/undo/unarchive, normal remove dirty failure, exact-name force remove, terminal close failure, selection, and empty archived/active states. [VERIFIED: UI-heavy phase and existing gates]

### Wave 0 Gaps

- [ ] `tests/lib/workspace-archive.test.ts` — archive schema/transitions, timestamp stability, resource/pin preservation, filename drift.
- [ ] `tests/lib/service/workspace-lifecycle-operations.test.ts` — service coordinator, stages, revision/idempotency, quiesce, typed failures, reconciliation revision.
- [ ] `tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` — archive list/empty state, confirmations, force-name input, blockers, selection.
- [ ] Extend `tests/service/web-terminal.test.ts` with an injected PTY that ignores TERM/KILL and with workspace-global close/admission tests.
- [ ] Extend `tests/lib/service/snapshot.test.ts`, `tests/service/web-projection.test.ts`, `tests/lib/workspace-pins.test.ts`, and `tests/commands/workspace-lifecycle.test.ts` for partitioning, minimal summaries, all-archived revision, pin preservation, and resolved YAML deletion.
- [ ] Add a web lifecycle presentation seam or focused static/contract test for modal singleton, exact-name enablement, and full-set terminal reconciliation; final behavior still requires live browser UAT because the repository has no DOM browser-test harness. [VERIFIED: current test inventory]

No framework installation is needed. [VERIFIED: environment audit]

## Security Domain

Security enforcement is enabled because `.planning/config.json` does not set `security_enforcement: false`. [VERIFIED: `.planning/config.json`]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes, unchanged | Existing authenticated encrypted carrier and scoped principal; no new auth mechanism. [VERIFIED: secure runtime/router] |
| V3 Session Management | yes | Preserve one-use browser authority and service session isolation; lifecycle operations may internally close all target PTYs but expose no cross-principal terminal list. [VERIFIED: secure session authority/terminal manager] |
| V4 Access Control | yes | Require `operation.write`; resolve stable ID against authoritative catalog; server-validate exact force confirmation; never expose global close as a client method. [VERIFIED: router scopes; recommended] |
| V5 Input Validation | yes | Zod strict request schemas, UUID/revision/idempotency validation, bounded UTF-8 names/details, authoritative path resolution. [VERIFIED: protocol/core schemas] |
| V6 Cryptography | no new crypto | Reuse the existing encrypted, pinned transport and identity stack; do not add cryptographic code. [VERIFIED: service security architecture] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stale or replayed destructive request deletes a changed/recreated target | Tampering | Stable workspace ID, execution-time expected revision, durable request-hash idempotency, no automatic replay, not-found on new-key missing target. [VERIFIED: locked decisions; recommended] |
| Terminal starts during delete/archive barrier | Tampering / Denial of Service | Per-workspace admission gate held through reconciliation. [VERIFIED: discovered TOCTOU] |
| Force request bypasses confirmation via a custom client | Elevation of Privilege | Server compares `confirmation_name` to current authoritative name and requires operation scope/current revision. [VERIFIED: recommended] |
| Client supplies filesystem path or repository list | Tampering | Request carries only stable ID/revision; service/core derive paths/resources from validated YAML. [VERIFIED: architecture] |
| Browser learns local paths through progress/errors | Information Disclosure | Dedicated browser allowlist exposes only display names, counts, lifecycle phases, and booleans. [VERIFIED: existing web projection policy; recommended] |
| One principal infers another principal's terminal titles | Information Disclosure | Global close is internal only; confirmation copy names the terminal resource class, not cross-principal session metadata. [VERIFIED: principal-scoped current API; recommended] |
| Partial terminal failure followed by filesystem mutation | Tampering / Data Loss | Confirm every exit; abort before archive/dirty/delete when any session is unconfirmed. [VERIFIED: locked requirement] |
| Dirty blocker names or confirmation input exceed model bounds | Denial of Service | Existing workspace/repository limits and bounded protocol strings/arrays. [VERIFIED: protocol limits] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/123-archived-workspaces-and-safe-removal/123-CONTEXT.md` — locked behavior, safety, concurrency, and UI constraints. [VERIFIED: project source]
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — requirement traceability and superseded archive wording. [VERIFIED: project source]
- `packages/core/src/config.ts`, `workspace-lifecycle.ts`, `workspace-status.ts`, `workspace-pins.ts`, `workspace-ops.ts`, `git.ts` — persistence and destructive lifecycle behavior. [VERIFIED: codebase]
- `packages/protocol/src/service.ts`, `packages/protocol/src/web.ts`, `packages/protocol/src/secure.ts` — revisions, operations, errors, web models, and transport bounds. [VERIFIED: codebase]
- `packages/service/src/policy/{snapshot,core-state,core-contract,operations}.ts`, `packages/service/src/web/{terminal-manager,projection}.ts`, `packages/service/src/secure/router.ts`, `packages/service/src/main.ts` — service authority and identified race/failure seams. [VERIFIED: codebase]
- `packages/web/src/app.ts`, `packages/tui/src/{App,core-store,types}.tsx`, `packages/tui/src/hooks/{useWorkspaces,useSignals}.ts` — client selection, confirmation, progress, and reconciliation behavior. [VERIFIED: codebase]
- Existing tests under `tests/lib`, `tests/service`, `tests/commands`, and `tests/tui/dashboard` — test infrastructure and current coverage. [VERIFIED: codebase]

### Secondary (MEDIUM confidence)

None required. This is an internal architecture phase with no new external library/API decision. [VERIFIED: research scope]

### Tertiary (LOW confidence)

None. [VERIFIED: no external or training-only claims used]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions read from installed binaries and repository manifests. [VERIFIED: local probes/manifests]
- Architecture: HIGH — traced end-to-end through core, service, protocol, web, TUI, and tests. [VERIFIED: codebase]
- Pitfalls: HIGH — each critical risk maps to a concrete current implementation seam or locked decision. [VERIFIED: codebase/context]
- Validation: HIGH — commands and frameworks come from repository scripts; new behavior gaps are explicitly identified. [VERIFIED: package scripts/test inventory]

**Research date:** 2026-07-16
**Valid until:** 2026-08-15, or until Phase 123 implementation materially changes the lifecycle/projection seams.
