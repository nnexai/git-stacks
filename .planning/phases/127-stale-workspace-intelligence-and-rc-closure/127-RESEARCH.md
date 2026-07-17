# Phase 127: Stale Workspace Intelligence and RC Closure - Research

**Researched:** 2026-07-17
**Domain:** Revision-bound stale-workspace evidence, cross-client advisory UX, and release-candidate closure
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Qualification and Ranking
- Use a fixed 30-day inactivity threshold for the first release candidate; do not add configuration or migration scope.
- A workspace qualifies with at least one confirmed positive reason: canonical change merged or closed, a confirmed repo-scoped deleted remote branch, a missing managed worktree, or activity older than the threshold.
- Rank transparently rather than with an opaque score: more confirmed reasons first, then stronger terminal evidence, then inactivity-only candidates, then oldest activity, then stable name/ID tie-breaking.
- Keep branch evidence repository-scoped and never imply that one missing branch makes the whole workspace safe to remove. Dirty/ahead/drift/notes are visible cautions only and neither prove nor suppress staleness.

### Evidence, Refresh, and Unknowns
- Fetch stale evidence through a separate revision-bound lazy service projection; do not add network work to the base snapshot or introduce background polling.
- Make view-level Refresh the primary operation. A row retry is optional only if it reuses the same evidence policy and code path.
- Cache network evidence in volatile memory for five minutes. Explicit Refresh bypasses the cache, and probe results are never persisted to workspace YAML.
- Require at least one confirmed positive reason for candidate ranking. Failed evidence remains `unknown`; unknown-only workspaces appear separately as evaluation incomplete and never among stale candidates.
- Use authoritative `activity_at` for inactivity, provider event timestamps for merged/closed changes, and observation timestamps such as “confirmed missing at” for deleted branches or missing worktrees rather than fabricating event times.
- Revision mismatch fails closed and reloads authoritative state before any retry.

### Forge Status and Provider Scope
- Query change status only when validated persisted `workspace.source` provenance supplies provider, host, repository, change type, and number.
- Do not infer PR/MR identity from branch names or remotes. Workspaces without provenance still receive activity, missing-worktree, and remote-branch evidence.
- Emit distinct `merged` and `closed` reason codes with provider timestamps; both qualify under STALE-01.
- Keep the Phase 126 GitHub/GitLab baseline. Authentication, rate limiting, malformed metadata, unsupported hosts/providers, and provider unavailability are sanitized unknown outcomes; Gitea remains deferred.

### Product Surface and Follow-up Actions
- Deliver required web and TUI surfaces only; do not add the exploratory `git-stacks stale` CLI command in this phase.
- Web uses a singleton, scrollable stale overlay adjacent to Archived Workspaces with contained focus and in-place loading, error, refresh, candidate, and incomplete-evaluation states.
- TUI uses a dedicated keyboard-first `UIView`, not the minimal archived dialog, so multiple reasons, timestamps, unknowns, cautions, and richer navigation remain legible.
- Open invokes the existing canonical workspace action and selects/navigates only after authoritative success.
- Show Refresh and Open directly. Expose Archive and Remove through canonical service descriptors and unchanged confirmations; Force Remove appears only after a fresh service inventory permits it.
- After lifecycle operations, reconcile the stale view and normal workspace state from the authoritative revision. New entry/refresh shortcuts must use the canonical shortcut registry rather than client-local bindings.

### Release and Verification Boundary
- Prepare lockstep package versions, changelog, migration notes, shortcut reference, configured-shell documentation, package checks, and supported-host evidence for `0.22.0-rc.1` / `v0.22.0-rc.1`.
- Preserve the Phase 126 handoff boundary: deterministic tests do not substitute for hosted receipts, physical browser/xterm interaction, interactive OpenTUI validation, responsive screenshots, authenticated GitHub/GitLab checks, or human cross-client parity approval.
- Do not tag, push, publish packages, create a release, or trigger release-only workflows without separate explicit authorization.

### Claude's Discretion
- Exact sanitized DTO names, internal cache structure, component factoring, visual labels, and registry-selected shortcut bindings may follow established package conventions.
- A per-row retry may be omitted if it would create a second refresh path; view-level Refresh is mandatory.

### Deferred Ideas (OUT OF SCOPE)
- A read-only `git-stacks stale --json` CLI surface.
- Gitea change-status parity.
- Inferring PR/MR identity from branch names or remote searches.
- User-configurable inactivity thresholds and related migration/UI work.
- Background/global stale polling or persisted evidence caches.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STALE-01 | A separate stale-workspace view identifies cleanup candidates using explainable signals such as merged/closed PR or MR, deleted remote branch, prolonged inactivity, or missing managed worktree. | Use one lazy `snapshot.read` route that captures an authoritative revision/read model once, derives local evidence from that model, and calls dedicated bounded AbortSignal-aware GitHub/GitLab and remote-branch observers. [VERIFIED: codebase] |
| STALE-02 | Every candidate displays its triggering reasons and relevant timestamps; users can refresh evidence and open the workspace before deciding what to do. | Return one bounded atomic response containing ordered candidates, every confirmed reason, unknowns, cautions, `activity_at`, reason timestamps, `checked_at`, and revision; render it through the approved singleton web overlay and dedicated TUI `UIView`. [VERIFIED: codebase] |
| STALE-03 | Stale detection is suggestion-only and never archives, removes, closes terminals, discards worktrees, or changes workspace YAML automatically. | Keep the evaluator read-only, cache only volatile probe outcomes, and expose no mutation from evaluation or refresh. Lifecycle changes remain explicit canonical operations. [VERIFIED: codebase] |
| STALE-04 | Archive and Remove are explicit follow-up actions using the same confirmation, terminal, dirty-worktree, and failure semantics defined above. | Reuse `deriveWorkspaceActionInventory()`, `workspace.actions`, `createWorkspaceActionRegistry()`, and existing lifecycle reconciliation. Never infer action availability from stale reasons. [VERIFIED: codebase] |
| STALE-05 | Forge/network failures and unavailable activity data remain visible as unknown evidence and cannot be treated as proof that a workspace is stale. | Use closed probe result unions with sanitized reason codes; require `confirmed_reasons.length > 0` for a candidate and place unknown-only rows in `incomplete`. [VERIFIED: codebase] |
| REL-01 | Package versions, changelog, migration notes, shortcut reference, shell compatibility documentation, and supported-host gates prepare the first v0.22 candidate as `0.22.0-rc.1` / `v0.22.0-rc.1`. | Update all eight package manifests and exact internal ranges in lockstep, add the matching changelog/docs, run package/release checks, and retain exact-SHA hosted receipts. [VERIFIED: codebase] |
| REL-02 | Planning and local release preparation do not tag, push, publish, or create a release without separate explicit approval. | Run `npm run release:check` without `--tag`; do not trigger tag-only `release-artifacts.yml` or release-published `release-publish.yml`. [VERIFIED: codebase] |
</phase_requirements>

## Summary

Phase 127 should add one service-owned stale-evidence pipeline, not a client feature with duplicated policy. The service already has the required authoritative inputs: revision-consistent workspace definitions/projections, activity fallback semantics, typed managed-worktree status, repository-scoped remote-branch status, notes/file/Git cautions, strict secure-route revision checks, and canonical workspace action inventories. The missing capability is a separate read-only forge change-status probe plus a stale evaluator that joins those inputs into one bounded, sanitized, revision-bound response. [VERIFIED: codebase]

The evaluator should classify each workspace into exactly one of three outcomes: ranked candidate when at least one positive reason is confirmed; evaluation-incomplete when there are unknowns but no confirmed reason; or omitted when neither applies. Network evidence alone uses a five-minute volatile cache; local authoritative evidence is recomputed on every request. Explicit refresh bypasses cache reads, and both cache writes and client response acceptance need generation protection so older work cannot overwrite newer results. [VERIFIED: codebase]

RC closure is a separate final workstream after product and deterministic test completion. The repository already provides lockstep package checks, RC validation, dry-run package construction, a dispatchable non-release Build and test workflow, and hard tag/publish workflow boundaries. Phase 127 must collect the remaining exact-commit hosted and human receipts but stop before tag, push, publication, GitHub Release creation, or release-only workflow activation. [VERIFIED: codebase]

**Primary recommendation:** Implement protocol → read-only bounded core probes → service evaluator/cache/route over one captured read model → shared adapters → web/TUI surfaces → deterministic security/conformance tests → RC metadata/docs → hosted/live/manual evidence, with no tag, push, publish, GitHub Release, or release-only workflow side effect. [VERIFIED: codebase]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Strict stale request/response vocabulary | Protocol | Client/service | Transport-neutral schemas must define one bounded vocabulary for both clients. [VERIFIED: codebase] |
| GitHub/GitLab change status acquisition | Core integration | Service policy | Provider execution needs trusted host/process access; clients must never execute provider commands. [VERIFIED: codebase] |
| Remote-branch and managed-worktree evidence | Core | Service policy | Core already owns Git and filesystem inspection; service maps typed outcomes into product evidence. [VERIFIED: codebase] |
| Qualification, unknown separation, timestamp semantics, and ranking | Service policy | — | These are product policy and must be identical across web and TUI. [VERIFIED: codebase] |
| Five-minute volatile cache | Service runtime | Core probe | One service instance must own cache lifetime and forced refresh behavior; clients and YAML must not store it. [VERIFIED: codebase] |
| Revision validation and authorization | Secure service router | Core state provider | The route must validate `expected_revision` before probes and require `snapshot.read`. [VERIFIED: codebase] |
| Shared labels, relative time, and response generations | Client | Web/TUI | Renderer-neutral presentation and stale-response rejection can be shared without moving ranking to clients. [VERIFIED: codebase] |
| Web stale UI | Browser/client | Service | DOM overlay/focus/responsiveness belong in web; all evidence and action authority remain service-owned. [VERIFIED: codebase] |
| TUI stale UI | TUI renderer | Service/client | Navigation and layout belong in the dedicated `UIView`; data and mutations come through the trusted service contract. [VERIFIED: codebase] |
| Archive/Remove/Force Remove | Service operation authority | Web/TUI adapters | Existing descriptors, confirmation, terminal shutdown, dirty protection, and reconciliation remain canonical. [VERIFIED: codebase] |
| Release candidate metadata and validation | Repository tooling | Hosted CI/human review | Local scripts prepare and verify; hosted and physical evidence validates supported environments without publishing. [VERIFIED: codebase] |

## Project Constraints (from CLAUDE.md)

- Use Node.js 24 and npm as the default toolchain; use Bun only for the optional OpenTUI package. [VERIFIED: codebase]
- Keep package direction `protocol <- client <- web`, with core as the only config/persistence/Git/workspace/integration implementation and service as the trusted network/terminal authority. [VERIFIED: codebase]
- Keep protocol transport-neutral and browser-safe; web must not import Node, filesystem, core, service, process, or secrets. [VERIFIED: codebase]
- Keep the CLI local and daemonless; this phase adds no stale CLI command and must not require service startup for ordinary CLI behavior. [VERIFIED: codebase]
- Interactive clients fetch revisioned state and follow service events; navigation, selection, tabs, and scrolling must not trigger filesystem, Git, or network scans. [VERIFIED: codebase]
- Keep browser projections narrower than trusted state: no machine paths, credentials, raw environment values, bearer material, or unapproved launch context. [VERIFIED: codebase]
- Preserve WebTransport/TLS/application-auth transport invariants and do not introduce HTTP, SSE, WebSocket, cookies, or browser storage for product data. [VERIFIED: codebase]
- Durable user choices belong in YAML, but stale probe outcomes are explicitly volatile and therefore must not become durable choices or persisted state. [VERIFIED: codebase]
- Expected failures use structured outcomes; destructive Git/worktree behavior fails closed and retains recovery context. [VERIFIED: codebase]
- Production behavior needs Node tests with Bun absent from `PATH`; OpenTUI tests run through `npm run test:tui`, which isolates each file in its own Bun process. [VERIFIED: codebase]
- Use `npx vitest run <focused-file>` for focused core/service/web-support tests. [VERIFIED: codebase]
- Do not tag, push, publish packages, or create a release without explicit authorization. [VERIFIED: codebase]

## Standard Stack

No new package is needed or recommended. Phase 127 should use the repository's existing, already-pinned stack; package legitimacy work is therefore not triggered. Versions below are manifest versions verified in the repository on 2026-07-17, not new registry recommendations. [VERIFIED: codebase]

### Core
| Library/runtime | Version | Purpose | Why Standard |
|-----------------|---------|---------|--------------|
| Node.js | 24 target; local 26.5.0 | Core/service/runtime tests and release tooling | The supported CI matrix and project commands target Node 24; local Node 26 satisfies `>=24` but does not replace Node 24 hosted evidence. [VERIFIED: codebase] |
| npm | 11.17.0 | Workspace install, build, tests, package checks | Root `packageManager` and hosted workflow pin this exact version. [VERIFIED: codebase] |
| TypeScript | `^6.0.2` | Strict cross-package implementation | Existing workspace compiler and typecheck path. [VERIFIED: codebase] |
| Zod | `^4.3.6` | Strict protocol and trusted-state validation | Protocol and core already use Zod schemas as authority boundaries. [VERIFIED: codebase] |
| Vitest | 4.1.10 | Node unit/integration/browser-support tests | Existing isolated Node suite and V8 coverage provider. [VERIFIED: codebase] |

### Supporting
| Library/runtime | Version | Purpose | When to Use |
|-----------------|---------|---------|-------------|
| SolidJS | 1.9.12 | TUI reactive view and existing web dependency | Use for the dedicated OpenTUI `UIView`; web remains its existing imperative DOM app. [VERIFIED: codebase] |
| OpenTUI | 0.4.3 exact | Optional TUI rendering | Use only under `packages/tui`; build/test with Bun 1.3.14. [VERIFIED: codebase] |
| Bun | 1.3.14 | OpenTUI build and isolated tests | Do not use for core/service production validation. [VERIFIED: codebase] |
| xterm | `^6.0.0` | Browser terminal input/focus integration | Reuse existing shortcut preprocessing and physical-input validation. [VERIFIED: codebase] |
| Git | local 2.55.0 | Repository-scoped remote ref evidence | Reuse the core Git adapter; do not shell out from clients. [VERIFIED: codebase] |
| GitHub CLI (`gh`) | local 2.96.0 | Authenticated GitHub status API adapter | Invoke through the bounded argv-only core command runner. [CITED: https://cli.github.com/manual/gh_api] |
| GitLab CLI (`glab`) | missing locally | Authenticated GitLab status API adapter | Required for live GitLab evidence or a compatible injected fixture runner; installation/auth remains an environment gate. [CITED: https://docs.gitlab.com/cli/api/] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate lazy stale route | Add forge status to base snapshot | Rejected: would add network latency/failure to ordinary navigation and violate the locked no-polling/no-base-network decision. [VERIFIED: codebase] |
| Service-owned evaluator | Compute stale status in each client | Rejected: duplicates policy, weakens security boundaries, and can diverge across web/TUI. [VERIFIED: codebase] |
| Existing forge creation resolver | Treat its open-only result as status | Rejected: it intentionally rejects closed changes and cannot distinguish merged from closed for stale evidence. [VERIFIED: codebase] |
| Volatile cache | Persist probe results in YAML/browser storage | Rejected: stale evidence is observational, expires after five minutes, and must not become authoritative product state. [VERIFIED: codebase] |
| View-level refresh | Add row-specific retry logic | Omit for this RC: one refresh path reduces race and policy divergence; the UI specification explicitly omits per-row retry. [VERIFIED: codebase] |
| Existing stack | Add a cache, concurrency, or state-management package | Rejected: the repository already has `mapLimited`, monotonic generations, runtime composition, and small in-memory state patterns. [VERIFIED: codebase] |

**Installation:**
```bash
npm ci
```

## Architecture Patterns

### System Architecture Diagram

```text
Web toolbar/shortcut                         TUI [s] / dedicated UIView
         |                                              |
         +-------------- stale.evaluate request --------+
                    { expected_revision, force_refresh }
                                   |
                                   v
                   Secure service router (snapshot.read)
                                   |
                      build authoritative CoreState
                                   |
                  revision matches before any probe?
                         | yes                | no
                         v                    v
              Service stale evaluator      conflict
                 /        |       \          -> client reloads snapshot
                /         |        \            and retries once
               v          v         v
       captured local model   network evidence   captured cautions
       activity/status        forge + remote     dirty/ahead/files/notes
       one revision build     5-minute memory    same revision build
                \         |        /
                 \        v       /
                  classify each workspace
             confirmed reason? / unknown only? / neither?
                    |              |              |
                    v              v              v
             ranked candidates   incomplete      omit
                    \              /
                     atomic bounded response
          { revision, checked_at, threshold_days, candidates, incomplete }
                              |
                  shared labels/generation gates
                         /                 \
             web singleton overlay      TUI dedicated UIView
                         \                 /
                canonical workspace.actions inventory
                              |
              explicit Open / Archive / Remove operations
                              |
                 authoritative state + stale refresh
```

This flow keeps entry points, trusted processing, decision branches, external provider boundaries, and mutation follow-ups distinct. [VERIFIED: codebase]

### Recommended Project Structure

```text
packages/
├── protocol/src/web.ts                         # bounded stale DTOs + global/scoped shortcut IDs
├── core/src/integrations/forge-change-status.ts # read-only GitHub/GitLab status probe
├── core/src/integrations/remote-branch-status.ts # bounded abortable repo-scoped branch evidence
├── core/src/{config,web-shortcuts}.ts           # persisted global stale-entry authority only
├── core/src/concurrency.ts                     # reuse mapLimited
├── service/src/policy/stale-workspaces.ts      # policy, ranking, cache, atomic result
├── service/src/secure/router.ts                # revision-bound snapshot.read route
├── service/src/policy/client.ts                # TUI/service adapter
├── service/src/web/projection.ts               # browser-safe allowlist projection
├── client/src/stale-workspaces.ts              # labels + response generation gate
├── client/src/shortcuts.ts                     # canonical entry/refresh metadata
├── web/src/app.ts                              # toolbar, overlay, actions, reconciliation
└── tui/src/
    ├── types.ts                                # dedicated UIView variant
    ├── StaleWorkspacesView.tsx                 # dedicated renderer
    ├── workspace-action-inventory.ts           # response gate reuse/extension
    └── App.tsx                                 # routing and key ownership

tests/
├── lib/core/forge-change-status.test.ts
├── lib/core/remote-branch-status.test.ts
├── lib/service/stale-workspaces.test.ts
├── service/web-stale-workspaces-schema.test.ts
├── service/web-stale-workspaces.test.ts
├── service/phase127-cross-client-conformance.test.ts
├── tui/dashboard/StaleWorkspaces.test.tsx
└── architecture/phase127-stale-authority.test.mjs
```

Names may follow local conventions, but the ownership boundaries should remain as shown. [VERIFIED: codebase]

### Component Responsibilities and Precise Seams

| File / symbol | Phase 127 responsibility |
|---------------|--------------------------|
| `packages/protocol/src/web.ts` / stale schemas and shortcut constants | Add strict stale request/response schemas; add persisted/global `workspace.stale` separately from scoped `workspace.stale.refresh`; keep both vocabularies exhaustive without placing refresh in global settings. [VERIFIED: codebase] |
| `packages/protocol/src/service.ts` / `RevisionSchema`, `TimestampSchema`, `CLIENT_MODEL_LIMITS` | Reuse shared primitives and cap candidate/incomplete/reason arrays. Current bounds include 16 workspaces and 8 repositories per workspace. [VERIFIED: codebase] |
| `packages/core/src/config.ts` / `WorkspaceSourceSchema` | Treat persisted forge source as input only after stricter Phase 127 compatibility checks; Gitea and provider/change-type mismatches become unknown. [VERIFIED: codebase] |
| `packages/core/src/integrations/forge-source-resolver.ts` / `runForgeCommand` | Reuse timeout, output cap, abort, no-prompt, process-group cleanup, and sanitized failure patterns; do not reuse the resolver's open-only semantic contract. [VERIFIED: codebase] |
| `packages/core/src/integrations/forge-change-status.ts` / new closed union | Return `merged`, `closed`, `open`, or sanitized `unknown`; never expose stdout/stderr, argv, tokens, or raw exceptions. [VERIFIED: codebase] |
| `packages/core/src/integrations/remote-branch-status.ts` / new observer | Use the established injected command-runner shape with fixed `git ls-remote` argv, timeout/output bounds, AbortSignal, exit 0 present, exit 2 missing, and all other outcomes sanitized unknown. Do not call the existing non-abortable helper from the evaluator. [VERIFIED: codebase] |
| Captured authoritative catalog/read model | Confirm missing only for managed worktree mode with `exists === false`; degraded/inaccessible status remains unknown. Derive local facts from the route's one revision build rather than calling `getWorkspaceStatus()` a second time. [VERIFIED: codebase] |
| `packages/core/src/concurrency.ts` / `mapLimited()` | Bound provider/remote fan-out and preserve input-order result association. [VERIFIED: codebase] |
| `packages/service/src/policy/snapshot.ts` / `workspaceActivityAt()` | Reuse authoritative `last_opened` then `created` fallback; do not add provider probing to snapshot construction. [VERIFIED: codebase] |
| `packages/service/src/policy/core-state.ts` / `createCoreStateProvider().build()` | Supply definitions and projections from one revision-consistent trusted generation. [VERIFIED: codebase] |
| `packages/service/src/policy/stale-workspaces.ts` / new evaluator | Own cutoff, reason mapping, unknown separation, cautions, ranking, cache, observation time, and response assembly. [VERIFIED: codebase] |
| `packages/service/src/policy/workspace-actions.ts` / `deriveWorkspaceActionInventory()` | Remain the only action availability authority, including revision-bound Force Remove eligibility. [VERIFIED: codebase] |
| `packages/service/src/secure/router.ts` / route scope map and revision checks | Add `workspace.stale.evaluate` with `snapshot.read`; reject stale revision before network work. [VERIFIED: codebase] |
| `packages/service/src/main.ts` | Construct exactly one service-lifetime stale evaluator/cache and inject clock/probes for deterministic tests. [VERIFIED: codebase] |
| `packages/service/src/policy/client.ts` | Add the official TUI-facing strict stale response adapter. [VERIFIED: codebase] |
| `packages/service/src/web/projection.ts` | Parse/allowlist the browser response and add path/secret/raw-error canary tests. [VERIFIED: codebase] |
| `packages/client/src/workspace-actions.ts` / `createWorkspaceActionRegistry()` | Invoke Open/Archive/Remove with existing confirmation and one-shot latch behavior. [VERIFIED: codebase] |
| `packages/client/src/presentation.ts` / `relativeTime()` | Share human time labels; exact UTC timestamps remain in DTO/UI detail. [VERIFIED: codebase] |
| `packages/core/src/{config,web-shortcuts}.ts` and `packages/client/src/shortcuts.ts` | Add rebindable/unbindable global `workspace.stale` through protocol/core/client parity; keep `workspace.stale.refresh` in a distinct exhaustive scoped registry with no persisted setting, conflict owner, settings row, or browser-global chord. [VERIFIED: codebase] |
| `packages/web/src/overlay-controller.ts` / `createSingletonOverlayController()` | Own one overlay instance, contained focus, Escape/backdrop, and exact focus restoration. [VERIFIED: codebase] |
| `packages/web/src/app.ts` / refresh generations, lifecycle reconciliation | Add toolbar entry and stale state machine; retain prior data on refresh failure; accept only current generation/revision; reuse canonical lifecycle functions. [VERIFIED: codebase] |
| `packages/tui/src/types.ts` / `UIView` | Add a dedicated stale-workspaces discriminant with origin/selection/response state. [VERIFIED: codebase] |
| `packages/tui/src/App.tsx` | Route `[s]`, own stale-view keys before normal dashboard keys, restore origin on Escape, and reuse canonical action registry. [VERIFIED: codebase] |
| `packages/tui/src/workspace-action-inventory.ts` / generation gates | Add a stale response token keyed by generation and expected revision; invalidate on view exit or replacement request. [VERIFIED: codebase] |

### Pattern 1: Strict Revision-Bound Lazy Projection

**What:** Parse the request, build current trusted state, compare `expected_revision`, and only then start provider or remote probes. [VERIFIED: codebase]

**When to use:** Every stale initial load or explicit refresh. [VERIFIED: codebase]

```typescript
// Source: adaptation of packages/service/src/secure/router.ts
const parsed = WebStaleWorkspaceRequestSchema.parse(payload)
const state = await coreState.build()
if (state.revision !== parsed.expected_revision) {
  throw coded("Authoritative snapshot revision is stale", "conflict")
}
return staleWorkspaces.evaluate(state, { forceRefresh: parsed.force_refresh })
```

The client handles one conflict by reloading authoritative state and retrying through the same monotonic-generation path; it must not loop indefinitely. [VERIFIED: codebase]

### Pattern 2: Closed Evidence Algebra

**What:** Every probe returns a small discriminated union. Operational failures become safe reason codes, not false negatives and not raw error strings. [VERIFIED: codebase]

```typescript
// Source: recommended extension of packages/core/src/git.ts and forge-source-resolver.ts
export type ForgeChangeStatus =
  | { status: "merged"; occurred_at: string }
  | { status: "closed"; occurred_at: string }
  | { status: "open" }
  | { status: "unknown"; reason: ForgeStatusUnknownReason }

export type RemoteEvidence =
  | { status: "present" }
  | { status: "missing"; observed_at: string }
  | { status: "unknown"; reason: RemoteUnknownReason }
```

Recommended unknown codes are finite protocol enums such as `unsupported_provider`, `invalid_provenance`, `tool_unavailable`, `authentication_required`, `rate_limited`, `request_timeout`, `provider_unavailable`, `malformed_response`, `remote_check_failed`, `worktree_inaccessible`, and `activity_unavailable`. Recovery messages should be static mappings in shared presentation code. [VERIFIED: codebase]

### Pattern 3: Network-Only TTL Cache with Race-Safe Writes

**What:** Cache forge and remote-branch outcomes for 300,000 ms; each route request builds authoritative activity, worktree, notes, file-drift, dirty, and ahead facts once, and the evaluator derives local evidence from that captured revision model without a second scan. [VERIFIED: codebase]

**When to use:** Normal initial/reopen requests may read fresh entries; explicit Refresh sets `force_refresh` and bypasses reads. [VERIFIED: codebase]

Prescriptive cache behavior:
1. Key forge evidence by validated provider, normalized host, repository identity, change type, and change number. [VERIFIED: codebase]
2. Key remote evidence by stable internal repository identity plus remote/ref identity; paths may remain internal probe input but never enter the DTO. [VERIFIED: codebase]
3. Deduplicate concurrent ordinary misses with one in-flight promise per key. [VERIFIED: codebase]
4. A forced refresh starts a new key generation; only the newest generation may commit a cache value. [VERIFIED: codebase]
5. A superseded request may finish for its caller, but it cannot overwrite the cache; an aborted request cannot commit cache state; web/TUI generation gates prevent either result from replacing newer presentation. [VERIFIED: codebase]
6. Cache failure outcomes too, for the same short TTL, to avoid hammering an unavailable provider; explicit refresh still bypasses them. [VERIFIED: codebase]
7. Destroy the cache on service shutdown; never serialize it. [VERIFIED: codebase]

### Pattern 4: Classification and Transparent Lexicographic Ranking

**What:** Build reasons, unknowns, and cautions independently, then classify and sort only in the service. [VERIFIED: codebase]

```typescript
// Source: locked Phase 127 policy expressed as implementation pseudocode
if (confirmedReasons.length > 0) candidates.push(row)
else if (unknownEvidence.length > 0) incomplete.push(row)
// otherwise omit from the stale response
```

Use this explicit sort tuple, compared lexicographically:
1. confirmed reason count descending;
2. strongest confirmed reason descending using fixed precedence `merged`, `closed`, `remote_branch_deleted`, `managed_worktree_missing`, `inactive`;
3. inactivity-only flag last;
4. valid `activity_at` ascending (oldest first), unknown activity last;
5. normalized workspace name ascending;
6. workspace ID ascending. [VERIFIED: codebase]

Within a row, render terminal reasons before inactivity, while preserving all reasons. Do not return or display a numeric score. [VERIFIED: codebase]

The inactivity boundary should be strict: `activity_at < checked_at - 30 days` qualifies; exactly the cutoff does not mean “older than 30 days.” Inject the clock and test one millisecond on each side. [VERIFIED: codebase]

### Pattern 5: Atomic Response with Separate Incomplete Section

**What:** Return candidate and incomplete sections together under one revision and `checked_at`; never stream partial row updates. [VERIFIED: codebase]

Recommended response shape:

```typescript
// Source: project protocol conventions plus locked Phase 127 decisions
{
  revision,
  checked_at,
  threshold_days: 30,
  candidates: [{
    workspace_id,
    workspace_name,
    activity_at,
    confirmed_reasons: [{ code, occurred_at, repository_id? }],
    unknown_evidence: [{ code, repository_id? }],
    cautions: [{ code, count?, repository_id? }],
  }],
  incomplete: [{
    workspace_id,
    workspace_name,
    activity_at,
    unknown_evidence: [{ code, repository_id? }],
  }],
}
```

Use protocol enums and bounds. Do not include repository paths, provider URLs unless explicitly approved, CLI output, raw messages, credentials, environment, branch inference, or launch context. [VERIFIED: codebase]

### Pattern 6: Provider Status Acquisition

**GitHub:** Query the persisted repository owner/name and PR number with `gh api graphql --hostname <validated-host>` through `runForgeCommand`. Request only `state`, `merged`, `mergedAt`, and `closedAt`; `merged === true` with `mergedAt` yields `merged`, otherwise a closed PR with `closedAt` yields `closed`. [CITED: https://docs.github.com/en/graphql/reference/objects#pullrequest] [CITED: https://cli.github.com/manual/gh_api]

```graphql
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      state
      merged
      mergedAt
      closedAt
    }
  }
}
```

**GitLab:** Query `projects/:url_encoded_path/merge_requests/:iid` with `glab api --hostname <validated-host>`. Use `merged_at` for merged, and `state === "closed"` plus `closed_at` for closed. Keep project path and IID from validated persisted provenance. [CITED: https://docs.gitlab.com/api/merge_requests/] [CITED: https://docs.gitlab.com/cli/api/]

**Remote branches:** Keep the existing `git ls-remote --exit-code` semantics: exit 0 means a matching ref, exit 2 means no matching ref, and other failures remain operational errors. [CITED: https://git-scm.com/docs/git-ls-remote]

For all providers, reject unsupported provider/host/type combinations before execution; pass argv arrays, timeout, output cap, abort signal, and no-prompt environment; parse strict JSON; and discard provider text after mapping to the closed union. [VERIFIED: codebase]

### Pattern 7: Canonical Follow-Up Actions

The stale response does not contain mutation authority. Each row requesting actions must load the current `workspace.actions` inventory for that workspace/revision and pass descriptors to `createWorkspaceActionRegistry()`. Open is direct only when its canonical descriptor is available. Archive and Remove remain in the canonical menu with written disabled reasons. Incomplete-only rows expose Open but no stale-surface lifecycle menu. [VERIFIED: codebase]

Force Remove must never appear as a stale reason or initial stale-card action. It can appear only after normal Remove returns the fresh typed `workspace_dirty` lifecycle result with `terminals_stopped === true` and `force_allowed === true`, and a same-revision inventory authorizes `workspace.force-remove`. [VERIFIED: codebase]

### Pattern 8: Renderer-Specific State Machines, Shared Semantics

**Web:** Use one stable overlay ID, preserve previous successful data during refresh, disable duplicate refresh, use `aria-busy`, reject old generations, retain rows on refresh failure, and reconcile normal/stale state after lifecycle completion. Initial focus, contained Tab, Escape, backdrop, and return focus come from the existing overlay controller. [VERIFIED: codebase]

**TUI:** Add a dedicated `UIView`, not `ArchivedWorkspacesDialog`. Handle stale-view keys before normal dashboard keys; `[s]` enters, `[r]` refreshes, `[o]`/Enter opens, `[a]` loads actions only for candidates, and Escape restores the originating row. Use wide split, medium stacked, narrow single-column, and below-40x12 safe fallback states from the approved UI specification. [VERIFIED: codebase]

### Pattern 9: Release Preparation Without Release Execution

Update the root facade plus seven workspace manifests to `0.22.0-rc.1`, update every exact internal `@git-stacks/*` dependency, and update `package-lock.json`. Add `## [0.22.0-rc.1]` to `CHANGELOG.md`, migration notes, stale/shortcut docs, configured-shell compatibility docs, and supported-host evidence references. [VERIFIED: codebase]

Run `npm run release:check` without `--tag`. The script builds, tests, covers, audits, and checks packages, then prints a validation-only message. `scripts/check-packages.mjs` verifies lockstep versions, exact native pins, eight dry-run tarballs, and exclusion of the optional TUI from the default graph. `scripts/pack-release.mjs` creates eight local tarballs plus an integrity manifest without publishing. [VERIFIED: codebase]

Use `.github/workflows/node-runtime-matrix.yml` for hosted receipts: it is dispatchable and has read-only contents permission. Do not trigger `.github/workflows/release-artifacts.yml`, which requires a `v*` tag push, or `.github/workflows/release-publish.yml`, which runs only after a GitHub Release is published and publishes to npm. [VERIFIED: codebase]

### Recommended Implementation Order

1. **Protocol contract:** stale request/response/reason/unknown/caution schemas and bounds. Shortcut IDs wait until the atomic protocol/core/client global/scoped registry change so exhaustive records never become incomplete. [VERIFIED: codebase]
2. **Core probes:** add the read-only forge status adapter; preserve current remote/worktree unions; test argv, timeout, strict parsing, provider compatibility, and sanitization. [VERIFIED: codebase]
3. **Service policy:** implement classification, observation timestamps, cautions, lexicographic ranking, five-minute cache, race-safe cache generations, and bounded fan-out. [VERIFIED: codebase]
4. **Route/composition:** wire one service-lifetime evaluator into `main.ts`, add the `snapshot.read` secure route, and enforce revision-before-probe. [VERIFIED: codebase]
5. **Adapters/shared client semantics:** add strict service client fetcher, labels, relative-time use, shortcut metadata, and response generation gate. [VERIFIED: codebase]
6. **Web:** add toolbar control, singleton overlay state machine, candidate/incomplete rendering, direct Open, action inventory menu, focus/accessibility/responsive behavior, and authoritative reconciliation. [VERIFIED: codebase]
7. **TUI:** add dedicated `UIView`, width/height layouts, keyboard ownership, generation-safe refresh, Open/action flows, and origin restoration. [VERIFIED: codebase]
8. **Deterministic verification:** service fixtures, provider fixtures, race/TTL/revision tests, browser-safe projection canaries, web DOM tests, isolated TUI render/key tests, architecture tests, and cross-client conformance. [VERIFIED: codebase]
9. **RC metadata/docs:** version lockstep, changelog, migration/shortcut/shell/stale docs, package and release checks. [VERIFIED: codebase]
10. **Hosted/live/manual evidence:** exact-SHA Build and test workflow, authenticated GitHub/GitLab, live operation reconnect/cancellation, physical browser/xterm, screenshots, interactive TUI, and human parity. [VERIFIED: codebase]
11. **Stop:** record missing evidence honestly; do not tag, push, publish, create a release, or trigger release-only workflows. [VERIFIED: codebase]

### Anti-Patterns to Avoid

- **Probing during base snapshot:** It turns ordinary navigation into provider/network work and broadens failure scope. Use the lazy route. [VERIFIED: codebase]
- **Treating probe failure as absence:** Authentication, timeout, malformed output, and rate limiting must become unknown, never deleted/closed. [VERIFIED: codebase]
- **Inferring change identity:** Branch names and remotes are not PR/MR provenance. Query only validated persisted source metadata. [VERIFIED: codebase]
- **Projecting raw provider errors:** stderr and exception strings can contain hosts, paths, tokens, or commands. Map to fixed enums and fixed recovery copy. [VERIFIED: codebase]
- **Client sorting/filtering:** It can make web and TUI disagree and can hide unknowns. Consume service order and sections verbatim. [VERIFIED: codebase]
- **Letting stale evidence authorize deletion:** Evidence is advisory. Canonical inventory and lifecycle operations remain the only authority. [VERIFIED: codebase]
- **Clearing data on refresh:** Retain the last successful response during refresh and refresh failure; replace both sections atomically on success. [VERIFIED: codebase]
- **Accepting late responses:** Protect both service cache writes and client presentation with generations. [VERIFIED: codebase]
- **Using `Promise.all` over the full candidate/repository matrix:** The protocol permits up to 16 workspaces and 8 repositories each; reuse `mapLimited()` to avoid a process/network burst. [VERIFIED: codebase]
- **Running OpenTUI tests directly as one Bun suite:** Use `npm run test:tui` so mocks remain file-isolated. [VERIFIED: codebase]
- **Using release workflows as preflight:** Tag-only and release-published workflows cross the explicit authorization boundary. [VERIFIED: codebase]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DTO validation | Ad hoc object checks | Zod strict schemas in protocol/core | Existing boundaries reject extra and malformed fields consistently. [VERIFIED: codebase] |
| Provider process execution | `exec`, shell strings, or client subprocesses | `runForgeCommand` pattern | It already provides argv-only execution, timeouts, caps, abort, no-prompt, and cleanup. [VERIFIED: codebase] |
| Remote ref interpretation | Parse human Git output or call the existing non-abortable helper directly | Dedicated injected `remote-branch-status` adapter using bounded `git ls-remote --exit-code` argv | Typed exit semantics distinguish missing from failure, AbortSignal/timeout/output bounds apply, and raw output never reaches policy. [VERIFIED: codebase] |
| Concurrent probe limiter | New dependency or unbounded `Promise.all` | `@git-stacks/core/concurrency` `mapLimited()` | Existing canonical helper is sufficient and preserves input ordering. [VERIFIED: codebase] |
| Action availability/confirmation | Stale-specific Archive/Remove buttons with local policy | `deriveWorkspaceActionInventory()` + `createWorkspaceActionRegistry()` | Prevents confirmation and Force Remove divergence. [VERIFIED: codebase] |
| Overlay focus management | New modal stack | `createSingletonOverlayController()` | Existing controller handles singleton identity, Tab, Escape, backdrop, and focus restoration. [VERIFIED: codebase] |
| Relative-time formatting | Per-client date strings | `relativeTime()` plus exact UTC `<time>`/detail text | Keeps presentation terminology aligned while preserving exact evidence time. [VERIFIED: codebase] |
| Stale persistence | YAML/browser/service preference storage | Five-minute in-memory service cache | Probe outcomes are volatile observations, not durable user choices. [VERIFIED: codebase] |
| Release packaging | Custom tarball or publish script | `check-packages.mjs`, `pack-release.mjs`, `release-rc-check.mjs` | Existing scripts validate exact release graph and side-effect boundary. [VERIFIED: codebase] |

**Key insight:** The difficult parts are authority, failure classification, revision consistency, cache races, and lifecycle safety—not rendering a list. Reusing existing boundaries avoids a second implementation of those rules. [VERIFIED: codebase]

## Common Pitfalls

### Pitfall 1: Revision Check After Network Work
**What goes wrong:** A stale request spends time probing providers and returns evidence for a state the user no longer has. [VERIFIED: codebase]
**Why it happens:** The evaluator is called before the router compares `expected_revision`. [VERIFIED: codebase]
**How to avoid:** Build current core state and reject mismatch before reading the cache or starting probes. [VERIFIED: codebase]
**Warning signs:** Provider mock calls occur in revision-mismatch tests; UI briefly shows old rows before retry. [VERIFIED: codebase]

### Pitfall 2: Cache Refresh Race
**What goes wrong:** A slow normal request overwrites a newer forced-refresh result in memory or presentation. [VERIFIED: codebase]
**Why it happens:** TTL entries have expiry but no key generation, or clients accept whichever promise resolves last. [VERIFIED: codebase]
**How to avoid:** Add per-key cache generations and monotonic request tokens in web/TUI. [VERIFIED: codebase]
**Warning signs:** A second Refresh makes `checked_at` or reasons move backward. [VERIFIED: codebase]

### Pitfall 3: Conflating Unknown with Negative
**What goes wrong:** Tool absence, auth failure, inaccessible worktree, or invalid activity is silently interpreted as “not stale” or “branch exists.” [VERIFIED: codebase]
**Why it happens:** Boolean probes erase the third state. [VERIFIED: codebase]
**How to avoid:** Use discriminated unions and retain every unknown item. [VERIFIED: codebase]
**Warning signs:** Catch blocks return `false`; unknown-only fixtures disappear from both sections. [VERIFIED: codebase]

### Pitfall 4: Over-Claiming Branch Evidence
**What goes wrong:** One repository's missing branch is presented as proof that the whole multi-repo workspace is safe to remove. [VERIFIED: codebase]
**Why it happens:** Repository identity is dropped from the reason DTO. [VERIFIED: codebase]
**How to avoid:** Keep `repository_id` and safe repository name on branch reasons and use advisory copy only. [VERIFIED: codebase]
**Warning signs:** UI says “workspace branch deleted” without naming the repository. [VERIFIED: codebase]

### Pitfall 5: Reusing the Creation Resolver's Open-Only Contract
**What goes wrong:** Merged/closed changes are transformed into generic resolution failures, so STALE-01 cannot distinguish them. [VERIFIED: codebase]
**Why it happens:** Shared process mechanics are mistaken for shared business semantics. [VERIFIED: codebase]
**How to avoid:** Reuse the runner/classifier mechanics in a separate read-only status module. [VERIFIED: codebase]
**Warning signs:** Status tests expect creation-resolver errors for closed changes. [VERIFIED: codebase]

### Pitfall 6: Force Remove Leakage
**What goes wrong:** Force Remove appears because a row is stale or dirty, before normal Remove returns the fresh typed blocker. [VERIFIED: codebase]
**Why it happens:** Client code reconstructs action availability. [VERIFIED: codebase]
**How to avoid:** Load canonical inventory and preserve the existing fresh-result authorization sequence. [VERIFIED: codebase]
**Warning signs:** Initial stale card menus include Force Remove. [VERIFIED: codebase]

### Pitfall 7: Browser Projection Disclosure
**What goes wrong:** Raw provider output, paths, source URLs, environment, or tokens cross into the browser response/error. [VERIFIED: codebase]
**Why it happens:** Trusted probe objects are serialized directly. [VERIFIED: codebase]
**How to avoid:** Build a protocol-safe policy result and parse it through an allowlist projection; add POSIX/Windows/token/stderr canaries. [VERIFIED: codebase]
**Warning signs:** DTOs contain `error: string`, `path`, `argv`, `stdout`, or `stderr`. [VERIFIED: codebase]

### Pitfall 8: Refresh Creates a Second Mutation Path
**What goes wrong:** Row retry and view refresh have different caching, revision, or unknown semantics. [VERIFIED: codebase]
**Why it happens:** Convenience handlers duplicate evaluator logic. [VERIFIED: codebase]
**How to avoid:** Omit per-row retry for this RC; all retries invoke view-level Refresh. [VERIFIED: codebase]
**Warning signs:** More than one client function accepts `force_refresh`. [VERIFIED: codebase]

### Pitfall 9: Deterministic Tests Claimed as Live Evidence
**What goes wrong:** Mocked provider/render tests are cited as proof of authenticated hosts, physical xterm input, responsive rendering, or supported runners. [VERIFIED: codebase]
**Why it happens:** The release checklist does not separate evidence classes. [VERIFIED: codebase]
**How to avoid:** Preserve separate deterministic, hosted, authenticated-live, physical/manual, and human-parity gates with exact commit SHA. [VERIFIED: codebase]
**Warning signs:** REL-01 is marked complete without workflow URL/screenshots/manual receipts. [VERIFIED: codebase]

### Pitfall 10: Accidental Release Side Effect
**What goes wrong:** A tag triggers artifact workflow, or a GitHub Release triggers npm trusted publishing. [VERIFIED: codebase]
**Why it happens:** Operators treat release workflows as validation commands. [VERIFIED: codebase]
**How to avoid:** Use only the dispatchable Build and test workflow and local validation-only commands before explicit approval. [VERIFIED: codebase]
**Warning signs:** `--tag`, `git tag`, `git push --tags`, `gh release create`, or release workflow dispatch appears in a Phase 127 plan task. [VERIFIED: codebase]

## Code Examples

### Authoritative Activity Semantics

```typescript
// Source: packages/service/src/policy/snapshot.ts
export function workspaceActivityAt(
  workspace: Pick<Workspace, "created" | "last_opened">
): string {
  if (workspace.last_opened !== undefined) return workspace.last_opened
  return DATE_ONLY_WORKSPACE_ACTIVITY.test(workspace.created)
    ? `${workspace.created}T00:00:00.000Z`
    : workspace.created
}
```

Use this exact fallback before applying the fixed 30-day cutoff. [VERIFIED: codebase]

### Canonical Bounded Fan-Out

```typescript
// Source: packages/core/src/concurrency.ts
const settled = await mapLimited(probeRequests, probeOne, 4)
```

Keep the limit injected/configured internally for tests, but do not make it user configuration in this phase. [VERIFIED: codebase]

### TUI/Web Response Gate

```typescript
// Source: adaptation of packages/tui/src/workspace-action-inventory.ts
export function createStaleResponseGate() {
  let generation = 0
  return {
    begin(revision: string) {
      generation += 1
      return Object.freeze({ generation, revision })
    },
    accepts(token: { generation: number; revision: string }, response: WebStaleWorkspaceResponse) {
      return token.generation === generation && token.revision === response.revision
    },
    invalidate() { generation += 1 },
  }
}
```

The web can retain its existing integer-generation style; semantics must match. [VERIFIED: codebase]

### GitHub Read-Only Status Request

```typescript
// Source: GitHub GraphQL PullRequest fields and gh api manual
await runForgeCommand({
  argv: [
    "gh", "api", "graphql", "--hostname", validatedHost,
    "-f", `query=${query}`,
    "-F", `owner=${owner}`,
    "-F", `name=${repo}`,
    "-F", `number=${changeNumber}`,
  ],
  signal,
  timeout_ms: STATUS_TIMEOUT_MS,
  max_output_bytes: STATUS_OUTPUT_LIMIT,
})
```

[CITED: https://docs.github.com/en/graphql/reference/objects#pullrequest] [CITED: https://cli.github.com/manual/gh_api]

### Validation-Only RC Check

```bash
npm run release:check
# Never add --tag without separate explicit authorization.
```

The script performs local validation and only creates `v0.22.0-rc.1` when `--tag` is explicitly present. [VERIFIED: codebase]

## State of the Art

| Old/current approach | Phase 127 approach | When changed | Impact |
|----------------------|--------------------|--------------|--------|
| Forge source resolver accepts only open changes for reviewed creation | Separate read-only status contract distinguishes merged, closed, open, and unknown | Phase 127 | Reuses secure process mechanics without corrupting creation semantics. [VERIFIED: codebase] |
| Base snapshot contains local authoritative state only | Keep base snapshot local; add lazy revision-bound stale projection | Phase 127 | Navigation remains independent of provider latency/failure. [VERIFIED: codebase] |
| Archived surface is intentionally minimal | Dedicated stale surfaces carry multiple reasons, timestamps, unknowns, cautions, and actions | Phase 127 | Avoids overloading archive UI with advisory evidence. [VERIFIED: codebase] |
| Phase 126 deterministic parity evidence exists | Add exact-commit hosted, authenticated, physical, screenshot, interactive, and human receipts | Phase 127 | Completes the milestone evidence boundary without treating mocks as live proof. [VERIFIED: codebase] |
| Package version is `0.21.0-rc.6` | Prepare lockstep `0.22.0-rc.1` metadata and artifacts | Phase 127 | Enables first v0.22 RC validation while preserving explicit release approval. [VERIFIED: codebase] |

**Deprecated/outdated for this phase:**
- Using `resolveForgeChangeSource()` as a general status API: it is open-only by design. [VERIFIED: codebase]
- Treating Gitea in the persisted schema as Phase 127 status support: Gitea parity is deferred. [VERIFIED: codebase]
- Treating local Node 26 success as the supported Node 24 matrix receipt: hosted Node 24 cells are still required. [VERIFIED: codebase]
- Triggering release artifact/publish workflows as preflight: those workflows require a tag or published GitHub Release. [VERIFIED: codebase]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | None. Architectural claims were verified against the repository, and provider API claims are cited to official documentation. | — | — |

## Open Questions (RESOLVED)

1. **Canonical hosted/manual receipt index — RESOLVED**
   - The canonical Phase 127 evidence ledger is `.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-RECEIPTS.md`. Its single marker-delimited JSON source of truth binds exact row IDs and immutable required-subcase arrays for deterministic, hosted, authenticated, live-service, physical, visual, interactive, and human-parity evidence to one immutable candidate SHA while excluding secrets, machine paths, raw provider output, and release authorization. [VERIFIED: planning decision]

2. **Configured self-hosted GitHub/GitLab release claim — RESOLVED**
   - GitHub.com and GitLab.com remain the mandatory baseline. Self-hosted GitHub/GitLab hosts are `NOT_CLAIMED` unless the operator supplies an explicit supported-host list; only then may exact-SHA receipts for each named host be required and reviewed. Hosts are never inferred or probed. [VERIFIED: planning decision]

3. **Authenticated GitLab evidence environment — RESOLVED**
   - Because `glab` is not available locally, authenticated GitLab evidence must route through the blocking Plan 127-13 human checkpoint or another separately authorized environment. Planning and execution must not install or authenticate tooling implicitly; unavailable evidence remains `PENDING`. [VERIFIED: planning decision]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Build, service tests, release checks | ✓ | 26.5.0 local; Node 24 required in hosted matrix | Use CI's pinned Node 24 for supported-runtime evidence. [VERIFIED: environment audit] |
| npm | Workspace install and scripts | ✓ | 11.17.0 | — [VERIFIED: environment audit] |
| Bun | Optional TUI build/tests | ✓ | 1.3.14 | No fallback; use only TUI commands. [VERIFIED: environment audit] |
| Git | Remote-branch probe and repository tests | ✓ | 2.55.0 | Inject fixture probe for deterministic unit tests only. [VERIFIED: environment audit] |
| `gh` | Authenticated GitHub status/live receipts | ✓ | 2.96.0 | Inject command runner for deterministic tests; live evidence still needs authentication. [VERIFIED: environment audit] |
| `glab` | Authenticated GitLab status/live receipts | ✗ | — | Inject command runner for deterministic tests; live proof requires Plan 127-13's blocking checkpoint or another separately authorized environment. [VERIFIED: environment audit] |
| GitHub Actions supported runners | REL-01/host evidence | External | Defined in workflow | Dispatch Build and test for exact candidate SHA; unavailable cells remain missing evidence. [VERIFIED: codebase] |

**Missing dependencies with no fallback:**
- Authenticated GitLab live evidence is blocked locally until `glab` is installed/configured or the receipt is executed on another authorized environment. Deterministic implementation/tests are not blocked. [VERIFIED: environment audit]

**Missing dependencies with fallback:**
- Local Node is 26 rather than the workflow's Node 24 target; the dispatchable hosted matrix supplies authoritative Node 24 evidence. [VERIFIED: codebase]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 for Node unit/integration/browser-support; native `node:test` for architecture/conformance/runtime; Bun 1.3.14 isolated OpenTUI tests. [VERIFIED: codebase] |
| Config file | `vitest.config.ts`; TUI isolation via `scripts/test-tui.mjs`. [VERIFIED: codebase] |
| Quick run command | `GIT_STACKS_KEY_STORE=file npx vitest run tests/lib/service/stale-workspaces.test.ts tests/service/web-stale-workspaces.test.ts` [VERIFIED: codebase] |
| TUI focused command | `npm run test:tui` (do not invoke one combined Bun suite directly). [VERIFIED: codebase] |
| Full suite command | `npm test && npm run typecheck && npm run test:architecture && npm run test:deps` [VERIFIED: codebase] |
| Release validation command | `npm run release:check` without `--tag`. [VERIFIED: codebase] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| STALE-01 | Confirmed merged/closed, deleted branch, missing worktree, and strict 30-day inactivity qualify; deterministic order follows tuple. | unit/integration | `npx vitest run tests/lib/service/stale-workspaces.test.ts` | ❌ Wave 0 |
| STALE-02 | DTO retains all reasons/timestamps; refresh bypasses cache; Open uses canonical action and atomic reconciliation. | service/web/TUI | `npx vitest run tests/service/web-stale-workspaces.test.ts tests/service/phase127-cross-client-conformance.test.ts` plus `npm run test:tui` | ❌ Wave 0 |
| STALE-03 | Evaluation/refresh performs no YAML, terminal, worktree, archive, or remove mutation. | unit/architecture | `node --test tests/architecture/phase127-stale-authority.test.mjs && npx vitest run tests/lib/service/stale-workspaces.test.ts` | ❌ Wave 0 |
| STALE-04 | Archive/Remove descriptors, confirmation, dirty blocker, Force Remove gate, and reconcile path remain canonical. | integration/conformance | `npx vitest run tests/service/phase127-cross-client-conformance.test.ts tests/lib/service/workspace-action-authority.test.ts` plus `npm run test:tui` | ❌ Wave 0 for Phase 127 conformance; existing authority test ✅ |
| STALE-05 | Auth/tool/rate/timeout/malformed/degraded/activity failures remain unknown; unknown-only rows are incomplete. | unit/projection | `npx vitest run tests/lib/core/forge-change-status.test.ts tests/lib/service/stale-workspaces.test.ts tests/service/web-stale-workspaces.test.ts` | ❌ Wave 0 |
| REL-01 | Lockstep `0.22.0-rc.1`, changelog/docs, package contents, local gates, supported-host workflow receipts. | script/hosted/manual | `npm run release:check` after manifests and docs, plus exact-SHA Build and test workflow | Existing scripts/workflow ✅; staged metadata/docs/evidence updates pending |
| REL-02 | Local preparation has no tag/push/publish/release side effect. | architecture/script review | `node --test tests/architecture/release-publish.test.mjs` and `npx vitest run tests/commands/release-rc.test.ts -t "Phase 127 pre-metadata release authority"` | Existing historical temp-tag fixture excluded from the Wave 0 focused run; manifest assertions stage in Plan 127-10 and docs assertions in Plan 127-11 |

### Required Deterministic Test Matrix

| Domain | Required fixtures/assertions |
|--------|------------------------------|
| Protocol | Top-level and nested strict extra-key rejection; nested collection/string bounds; positive revision and valid timestamp parsing; finite reason/unknown/caution/action enums; rejection of path, raw-error, command, argv, stdout, stderr, credential, and environment fields. [VERIFIED: codebase] |
| Forge probe | GitHub merged, GitHub closed, GitHub open; GitLab merged, GitLab closed, GitLab open; Gitea unsupported; provider/type mismatch; missing CLI; auth; rate limit; timeout; malformed/oversized JSON; abort; host argv; no raw output. [VERIFIED: codebase] |
| Remote branch | Exit 0 present, exit 2 missing, other exit/timeout unknown; one repository missing does not alter sibling evidence. [CITED: https://git-scm.com/docs/git-ls-remote] |
| Worktree | Managed missing qualifies; existing/degraded/inaccessible is not misclassified; observation time is `checked_at`. [VERIFIED: codebase] |
| Activity | `last_opened` precedence; date-only `created` fallback; strict cutoff boundary; invalid/unavailable becomes unknown; clock injected. [VERIFIED: codebase] |
| Classification | candidate with one reason; candidate with reason+unknown; unknown-only incomplete; no reason/no unknown omitted; cautions neither add nor remove qualification. [VERIFIED: codebase] |
| Ranking | reason-count precedence; reason-strength precedence; inactivity-only later; oldest activity; stable name/ID; same fixture produces identical web/TUI order. [VERIFIED: codebase] |
| Cache | fresh hit, expiry at five minutes, forced bypass, ordinary singleflight, cached unknown, old request cannot overwrite forced result, no local evidence caching, cache reset on new service instance. [VERIFIED: codebase] |
| Revision | mismatch causes zero probe calls; client reload/retry exactly once; second conflict fails closed; mismatched response rejected. [VERIFIED: codebase] |
| Web | singleton/refocus, no-data loading, retained-data refresh, first-load and refresh errors, incomplete-only copy, zero/one/many, direct Open, action menu fail-closed, focus restoration, 320/375 DOM/CSS contract, no disclosure canaries. [VERIFIED: codebase] |
| TUI | dedicated view, all width tiers, too-small lockout, navigation, no wrapping, generation rejection, repeated `r` ignored, Open, incomplete action rejection, canonical menu, Escape origin restore, no input leakage. [VERIFIED: codebase] |
| Lifecycle | Open success/failure; Archive/Remove same descriptors; Force Remove absent initially and authorized only by fresh typed blocker; terminal result followed by state+stale refresh without replay. [VERIFIED: codebase] |
| Architecture | Web/TUI cannot import core probe or execute provider/Git commands; browser schema rejects path/secret/raw-output fields; no stale mutation implementation in clients. [VERIFIED: codebase] |
| Release | all manifests/internal ranges lockstep; changelog heading; package dry-runs; no `.planning` leak; default graph excludes TUI; release check does not tag by default. [VERIFIED: codebase] |

### Evidence Classes and Release Gates

| Gate | What automation can prove | Required non-automated/hosted evidence | Completion rule |
|------|---------------------------|----------------------------------------|-----------------|
| Deterministic local | Policy truth table, cache/revision races, security projection, action reuse, renderer states, package graph | None | Full local commands green on candidate commit. [VERIFIED: codebase] |
| Hosted supported runtime | Build/test/package/TUI/shell jobs on pinned hosts and exact SHA | Workflow URL, SHA, every required job conclusion, downloaded safe receipt artifacts | Green Node 24 on Ubuntu 24.04 x64/ARM and macOS 15 Intel/Apple Silicon; package/policy; Bun TUI; shell-hosted jobs. Unavailable runner is missing evidence. [VERIFIED: codebase] |
| Authenticated providers | Fixture parsers and sanitized errors | GitHub.com and GitLab.com authenticated flows, same-repo/fork cases, failure recovery, and any explicitly claimed self-hosted hosts | Safe receipts contain no credentials, raw output, paths, or environment. [VERIFIED: codebase] |
| Live service operations | Operation contracts and mocked reconnect/cancel | Disconnect/reconnect by same operation ID, cancel once, too-late cancel, refresh-failed lock, simultaneous clients | Both clients converge on authoritative revisions without mutation replay. [VERIFIED: codebase] |
| Physical browser/xterm | DOM and synthetic key tests | Pointer, physical keys, xterm-focused shortcuts, unmatched/AltGraph/IME/non-US input, focus restoration | No key leakage/duplication and exact valid focus return. [VERIFIED: codebase] |
| Responsive visual | CSS contract and test DOM | Light/dark screenshots at desktop, 375px, 320px for all required stale states and confirmations | No horizontal overflow, clipping, hover-only action, unreadable contrast, or disclosure. [VERIFIED: codebase] |
| Interactive TUI | Render-buffer and key harness | Wide, stacked, single-column, short-height, too-small, refresh/Open/lifecycle/incomplete flows | Required evidence and actions remain legible and keys do not leak. [VERIFIED: codebase] |
| Human cross-client parity | Shared fixture conformance | Side-by-side approval of order, labels, timestamps, unknown/caution split, actions, confirmations, and reconciliation | Differences resolved or explicitly accepted before RC approval. [VERIFIED: codebase] |
| Release authorization | Local package and RC validation | Separate explicit user approval | Only after approval may a tag/push/release/publish workflow be considered; Phase 127 stops before this. [VERIFIED: codebase] |

### Hosted Receipt Collection

The dispatchable Build and test workflow exposes the exact `github.sha` in artifact names and shell receipt content. GitHub Actions APIs expose workflow runs, jobs, conclusions, head SHA, and artifacts, so the receipt index should retain the run URL/ID, `head_sha`, job names/conclusions, artifact names, and checksums of downloaded safe artifacts. [CITED: https://docs.github.com/en/rest/actions/workflow-runs] [CITED: https://docs.github.com/en/rest/actions/workflow-jobs] [CITED: https://docs.github.com/en/rest/actions/artifacts]

Do not trigger any workflow implicitly while executing these plans. If the user separately authorizes hosted evidence collection, `node-runtime-matrix.yml` is the only eligible non-release workflow for the exact candidate commit; the tag-triggered artifact workflow and release-published publish workflow remain out of bounds. [VERIFIED: codebase]

### Sampling Rate
- **Per task commit:** focused Vitest file(s), relevant `node --test` architecture file, or `npm run test:tui` for TUI changes. [VERIFIED: codebase]
- **Per wave merge:** `npm run build:packages && npm run typecheck && npm run test:architecture && npm run test:deps && npm run test:vitest && npm run test:node && npm run test:tui`. [VERIFIED: codebase]
- **RC metadata wave:** `npm run audit:licenses && npm run audit:runtime && npm run check:packages`. [VERIFIED: codebase]
- **Phase gate:** `npm run release:check` without `--tag`, then exact-SHA hosted and manual evidence gates. [VERIFIED: codebase]

### Wave 0 Gaps
- [ ] `tests/helpers/phase127-stale-fixtures.ts` and `tests/service/web-stale-workspaces-schema.test.ts` — guarded-import runtime Zod RED matrix for strict nested objects, bounds, revisions/timestamps, finite enums, and disclosure fields.
- [ ] `tests/lib/core/forge-change-status.test.ts` — provider status unions, argv, parse, timeout/abort, and sanitization for STALE-01/05.
- [ ] `tests/lib/core/remote-branch-status.test.ts` — fixed argv, exit 0/2/error, timeout/output/AbortSignal, sanitization, and cancellation-safe outcomes.
- [ ] `tests/lib/service/stale-workspaces.test.ts` — qualification, timestamps, captured local read model, unknown separation, ranking, TTL, refresh, races, abort, and revisions for STALE-01/02/03/05.
- [ ] `tests/service/web-stale-workspaces.test.ts` — guarded-import secure route/projection/browser state for STALE-02/05.
- [ ] `tests/service/phase127-cross-client-conformance.test.ts` — guarded-import shared order, labels, actions, shortcuts, and reconciliation for STALE-02/04.
- [ ] `tests/tui/dashboard/StaleWorkspaces.test.tsx` — isolated-runner dedicated view layouts and keyboard behavior for STALE-02/04/05.
- [ ] `tests/architecture/phase127-stale-authority.test.mjs` — forbid client provider/Git/mutation authority and disclosure for STALE-03/05.
- [ ] Keep `tests/architecture/release-publish.test.mjs` and the uniquely named `Phase 127 pre-metadata release authority` suite in `tests/commands/release-rc.test.ts` green for the hermetic pre-metadata no-outward-release-action/default-package/planning-tree fence. The Wave 0 Vitest command must filter to that suite, exclude the historical temp-repository tag fixture, and assert the fake Git shim records no `git tag` request; current RC manifest assertions begin in Plan 127-10 and docs assertions in Plan 127-11.
- [ ] Add safe fixture factories for core state, provider outcomes, clock advancement, and stale response rows.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Provider CLIs use their configured authenticated sessions in trusted core only; browser receives no credentials or provider auth material. [VERIFIED: codebase] |
| V3 Session Management | yes | Existing secure service session and `snapshot.read` scope protect the lazy route; no new cookie/browser-storage session is introduced. [VERIFIED: codebase] |
| V4 Access Control | yes | Router scope map authorizes stale evaluation as read-only; canonical action inventories separately authorize Open/Archive/Remove/Force Remove. [VERIFIED: codebase] |
| V5 Input Validation | yes | Strict Zod request/response schemas, provider/host/type compatibility validation, bounded arrays/output, and strict provider JSON parsing. [VERIFIED: codebase] |
| V6 Cryptography | no new control | Reuse existing pinned WebTransport/TLS/application authentication; do not add crypto or transport. [VERIFIED: codebase] |
| V7 Error Handling and Logging | yes | Convert provider/Git/process failures to fixed safe codes; do not return stderr, argv, paths, tokens, raw exception messages, or environment. [VERIFIED: codebase] |
| V9 Communications | yes | Reuse existing service transports; no HTTP/SSE/WebSocket/cookie/browser-storage product path. [VERIFIED: codebase] |
| V12 Files and Resources | yes | Core alone inspects worktrees/config; evaluation is read-only and destructive actions retain leases, terminal shutdown, dirty protection, and fail-closed behavior. [VERIFIED: codebase] |
| V13 API and Web Service | yes | Bounded revision-bound RPC, `snapshot.read`, exact response projection, TTL/cancellation, and no partial streaming. [VERIFIED: codebase] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Provider command injection through host/repository metadata | Tampering/Elevation | Validate provenance, pass argv arrays only, URL-encode GitLab project path, never invoke a shell. [VERIFIED: codebase] |
| Credential/path leakage in provider errors | Information Disclosure | Closed error enums, fixed recovery copy, browser allowlist projection, disclosure canaries. [VERIFIED: codebase] |
| Forged stale revision causing stale evidence/action | Tampering | Compare `expected_revision` before probing; one reload/retry; canonical action inventory independently revision-bound. [VERIFIED: codebase] |
| Provider/remote probe exhaustion | Denial of Service | Five-minute cache, bounded output/timeouts, abort signals, `mapLimited`, ordinary singleflight, duplicate refresh suppression. [VERIFIED: codebase] |
| Cache poisoning by older request | Tampering | Per-key cache generation and commit-if-current rule; client monotonic response gates. [VERIFIED: codebase] |
| Confused-deputy lifecycle action from stale reason | Elevation/Tampering | Stale evaluator has no mutation capability; clients use service descriptors and unchanged confirmations. [VERIFIED: codebase] |
| Cross-repository evidence confusion | Tampering | Keep repository ID/name on branch/worktree reasons and cache keys; never infer workspace-wide safety. [VERIFIED: codebase] |
| False stale verdict from unavailable evidence | Repudiation/Tampering | Three-state unions, unknown-only incomplete section, confirmed-reason qualification requirement. [VERIFIED: codebase] |
| Outward release-authority side effect during validation | Tampering | No new package; exact pins and package checks; hermetic no-tag command-plan tests; real release check without `--tag`; do not tag, push, publish, create a GitHub Release, or trigger release-only workflows. Ordinary local build/coverage outputs are allowed. [VERIFIED: codebase] |

### Security Verification Checklist

- Revision mismatch test proves zero provider/remote calls. [VERIFIED: codebase]
- Host/repo/change inputs are validated and passed only as argv. [VERIFIED: codebase]
- Provider stdout/stderr is capped and never projected/logged into browser-safe outcomes. [VERIFIED: codebase]
- Browser DTO/source scan rejects path, token, credential, environment, bearer, argv, stdout, and stderr fields. [VERIFIED: codebase]
- TUI imports only `@git-stacks/service/client` for stale data and never imports the core probe. [VERIFIED: codebase]
- Refresh cannot invoke any workspace mutation; lifecycle mutations require canonical descriptors. [VERIFIED: codebase]
- Force Remove remains impossible before the existing typed dirty-worktree sequence. [VERIFIED: codebase]
- Release validation commands contain no tag/push/publish/release operation. [VERIFIED: codebase]

## Sources

### Primary (HIGH confidence)
- Repository `CLAUDE.md` — runtime, architecture, security, testing, and release boundaries. [VERIFIED: codebase]
- `.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-CONTEXT.md` — locked product and release decisions. [VERIFIED: codebase]
- `.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-UI-SPEC.md` — approved web/TUI states, focus, responsive behavior, keys, and manual evidence. [VERIFIED: codebase]
- `.planning/REQUIREMENTS.md` — STALE-01..05 and REL-01..02. [VERIFIED: codebase]
- `.planning/phases/126-web-workflow-and-forge-source-parity/126-PHASE127-HANDOFF.md` — deterministic evidence and remaining hosted/live/manual gates. [VERIFIED: codebase]
- `packages/protocol/src/{web,service}.ts` — current DTOs, revisions, timestamps, and bounds. [VERIFIED: codebase]
- `packages/core/src/{config,git,workspace-status,concurrency}.ts` and `packages/core/src/integrations/forge-source-resolver.ts` — provenance, evidence unions, bounded concurrency, and provider runner patterns. [VERIFIED: codebase]
- `packages/service/src/policy/{snapshot,core-state,workspace-actions,client}.ts`, `packages/service/src/secure/router.ts`, `packages/service/src/web/projection.ts`, `packages/service/src/main.ts` — service authority, revisions, routes, projections, and composition. [VERIFIED: codebase]
- `packages/client/src/{workspace-actions,presentation,shortcuts}.ts`, `packages/web/src/{app,overlay-controller}.ts`, and `packages/tui/src/{App,types,workspace-action-inventory}.ts` — action, presentation, overlay, generation, and renderer seams. [VERIFIED: codebase]
- `scripts/{release-rc-check,check-packages,pack-release}.mjs` and `.github/workflows/{node-runtime-matrix,release-artifacts,release-publish}.yml` — RC validation and side-effect boundaries. [VERIFIED: codebase]

### Secondary (official documentation; MEDIUM confidence)
- [GitHub GraphQL PullRequest object](https://docs.github.com/en/graphql/reference/objects#pullrequest) — merged/closed state and timestamps.
- [GitHub CLI `gh api`](https://cli.github.com/manual/gh_api) — GraphQL and hostname invocation.
- [GitLab Merge Requests API](https://docs.gitlab.com/api/merge_requests/) — `state`, `merged_at`, and `closed_at`.
- [GitLab CLI `glab api`](https://docs.gitlab.com/cli/api/) — authenticated API and hostname invocation.
- [Git `ls-remote`](https://git-scm.com/docs/git-ls-remote) — `--exit-code` status 2 for no matching refs.
- [GitHub Actions workflow runs](https://docs.github.com/en/rest/actions/workflow-runs), [jobs](https://docs.github.com/en/rest/actions/workflow-jobs), and [artifacts](https://docs.github.com/en/rest/actions/artifacts) — exact-SHA hosted receipt metadata.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; versions and commands verified from manifests and environment. [VERIFIED: codebase]
- Architecture: HIGH — exact ownership seams, symbols, routes, and action authority verified in the repository. [VERIFIED: codebase]
- Provider acquisition: MEDIUM-HIGH — process integration is verified in the repository; status fields and CLI invocation are cited to official provider documentation. [CITED: https://docs.github.com/en/graphql/reference/objects#pullrequest] [CITED: https://docs.gitlab.com/api/merge_requests/]
- Cache/ranking policy: HIGH — locked decisions plus existing generation/concurrency patterns define a prescriptive implementation. [VERIFIED: codebase]
- Pitfalls/security: HIGH — derived from existing architecture guards, browser projection tests, lifecycle authority, and release scripts. [VERIFIED: codebase]
- Hosted/manual validation: HIGH — required evidence and workflow boundaries are explicit in the Phase 126 handoff and Phase 127 UI specification. [VERIFIED: codebase]

**Research date:** 2026-07-17
**Valid until:** 2026-08-16 for repository architecture; re-check provider CLI/API behavior and hosted workflow state at execution time.
