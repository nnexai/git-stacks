# Phase 126: Web Workflow and Forge-Source Parity - Research

**Researched:** 2026-07-16
**Domain:** Shared workspace actions, browser-safe service projections, and reviewed GitHub/GitLab source resolution
**Confidence:** HIGH

## User Constraints

The following decisions are copied verbatim from `126-CONTEXT.md` and are mandatory for planning.

### Canonical Workspace Actions
- **D-01:** Define one canonical browser-safe workspace action model for archive/unarchive, remove/force-remove, rename, open/close, pin/unpin, sync, pull, push, merge, notes, file-status inspection, and operation cancellation. Visible controls, context menus, and keyboard entry points dispatch the same action IDs and callbacks rather than owning parallel operation code.
- **D-02:** Extend the Phase 125 registry/dispatcher pattern without turning every workspace action into a default global shortcut. The canonical action model owns label, availability, disabled reason, confirmation policy, pending/progress state, and execution callback; shortcut bindings are one optional invoker of that model.
- **D-03:** Core/service operations remain the only mutation authority. Web and TUI may collect intent and render typed projections, but they do not run Git, read or write workspace YAML, mutate note files, inspect the host filesystem, invoke forge CLIs, or infer lifecycle guards locally.
- **D-04:** Action availability and disabled reasons come from typed authoritative state plus current operation state. A hidden menu item must not become a substitute for an explicit disabled reason when the action is relevant but unavailable.
- **D-05:** Reuse the Phase 123 archive, remove, exact-name force-remove, terminal-stop, dirty-worktree, stale-revision, and non-replay contracts unchanged. Rename, merge, sync, pull, and push similarly reuse existing core semantics rather than defining browser variants.
- **D-06:** Every accepted action has one durable operation identity where the operation framework applies. Progress, completion, failure, and cancellation settle from operation state, followed by authoritative snapshot refresh even when an operation fails after changing service-owned terminal or transient state.
- **D-07:** Cancellation is explicit and honest: clients expose Cancel only while the service reports an operation cancellable, submit `operation.cancel` once, and render already-finished/non-cancellable/too-late outcomes without claiming rollback. Cancellation never means replaying or silently replacing the original intent.

### Web and TUI Parity Surface
- **D-08:** Web exposes the full high-frequency action set through contextual workspace/repository controls plus discoverable visible controls where frequency warrants it. The configured-command overlay remains a command launcher, not a generic application action palette.
- **D-09:** TUI closes its known parity gaps by adding Pull, Pin/Unpin, and cancellable-operation controls to the existing action/progress surfaces. Existing TUI archive/remove/sync/push/merge/open/close behavior is adapted to the same action availability and operation-result contract rather than rewritten.
- **D-10:** Pointer, menu, and keyboard invocation share confirmations, disabled reasons, progress, cancellation, typed errors, and refresh behavior. A shortcut may never bypass a confirmation, guard, or in-flight lock that applies to the matching button/menu action.
- **D-11:** Concurrent or repeated submission is one-shot. While an action is pending, the same destructive or non-idempotent action is disabled; reconnect resumes observation of a known durable operation and never silently resubmits intent.
- **D-12:** Success and failure feedback names the workspace and operation, keeps actionable provider/repository detail where safe, and restores the user to a valid authoritative selection. Archived/removed targets leave normal controls immediately after reconciliation.
- **D-13:** Phase 126 supplies deterministic protocol, core/service, client, DOM/browser-harness, and OpenTUI coverage for all action paths. Physical-keyboard, real-xterm, live service reconnect/progress, hosted forge/auth, and cross-client visual approval are consolidated in Phase 127 before tagging.

### Authoritative Notes and Path-Free File Status
- **D-14:** Notes retain the existing authoritative append-only model: list newest-first, add a plain-text record, and clear the workspace note history behind confirmation. Web and TUI do not add arbitrary record editing, record deletion, history rewriting, tags, authors, search, or browser-local persistence.
- **D-15:** List/Add/Clear are typed service capabilities backed by `@git-stacks/core`; malformed storage fails clearly and does not mutate. Add and Clear refresh the authoritative note list/summary after completion, and Clear uses the same explicit confirmation whether invoked by pointer, menu, or keyboard.
- **D-16:** Notes remain operator memory associated with a workspace, separate from signals/messages and separate from project `.planning`. Note mutations do not emit fake signal events or become workspace YAML fields.
- **D-17:** File-sync status is service-computed and lazily requested for the selected workspace. Clients render shared states (`missing`, `pullable`, `pushable`, `diverged`, `error`, and healthy states), severity, counts, logical scope/repository identity, and actionable sanitized explanations without re-running comparison policy.
- **D-18:** The browser-safe file-status protocol is path-free. It must not expose workspace roots, repo `main_path`/`task_path`, absolute source/target paths, raw filesystem errors, or hints containing host paths. The service maps the existing rich core view into bounded logical labels, relative configured targets where safe, typed reason codes, and sanitized messages.
- **D-19:** TUI may consume the same sanitized projection for parity even though it is trusted/local; retaining a separate rich client-only shape must not create divergent status states or policy.

### Forge URL Resolution and Reviewed Creation
- **D-20:** The new reviewed client flow accepts full GitHub PR and GitLab MR web URLs only. GitHub and GitLab, including configured self-hosted instances where existing metadata supports them, share one typed service resolver contract while preserving provider terminology in user-facing text.
- **D-21:** Resolution is an explicit service-owned first step with no workspace YAML or worktree creation. It returns canonical repository identity, matched template/repository, head/source branch and ref, base/target branch, fork/source-repository and remote/fetch needs, normalized provenance, typed confidence, and a safe suggested workspace name.
- **D-22:** Resolution produces an opaque, short-lived review token bound to the resolved source and an authoritative catalog/core revision. Raw forge credentials, CLI output, filesystem paths, clone paths, and fetch commands never enter the client draft.
- **D-23:** After resolution, web and TUI show an editable review form. The user may edit the workspace name, selected template, included repositories, matched source repository, and proposed branch mappings before creation. Provider/source identity and immutable change metadata remain visibly anchored to the resolved URL.
- **D-24:** Editing the draft does not grant authority. Submit carries the review token, expected revision, and complete reviewed draft; the service revalidates name, template/repository membership, worktree modes, branch mappings, fork/remote access plan, token freshness, and current catalog state before accepting one idempotent creation operation.
- **D-25:** Enter on the URL/input stage resolves only. Workspace creation is possible only from the resolved review stage through an explicit submit action; unresolved, ambiguous, stale, expired, or edited-invalid drafts cannot create.
- **D-26:** Accepted creation reuses the existing normal workspace creation and plain-Git fetch/worktree path. Provider checkout commands remain metadata/research references and do not become an alternate workspace implementation.
- **D-27:** Safe suggested names are normalized through existing workspace-name rules and remain editable. A suggestion is never silently substituted for an invalid or conflicting final name at submit time.
- **D-28:** Malformed/unsupported URLs, unsupported hosts, missing tooling or authentication, inaccessible/closed changes, unmatched or ambiguous template repos, non-worktree matches, fork/remote failures, branch conflicts, stale revisions, and expired tokens fail non-destructively with typed recovery guidance. Resolve failures create no workspace resources; accepted-create rollback follows existing creation guarantees.
- **D-29:** Resolver and creation status are separately visible. A successful resolve is not reported as a created workspace, and a failed submit preserves the editable review state when safe so the user can correct fields or re-resolve.

### the agent's Discretion
- Exact responsive layout, icons, copy polish, action grouping, progress presentation, draft-token lifetime, and whether the review form is one overlay or a contained two-step view are flexible within existing web/OpenTUI conventions.
- Exact type/module names and the split between protocol projection helpers and client presentation helpers are flexible, provided the locked service authority, one-action model, path-free browser contract, and resolve-review-submit boundary remain explicit and testable.

### Deferred Ideas
- Gitea support in the new service-backed reviewed web/TUI source-creation flow. Existing CLI/core Gitea behavior is not removed, but Phase 126 ships and verifies GitHub PR and GitLab MR parity only.
- Arbitrary note editing, deleting individual notes, history rewrite, tags, authors, search, and note synchronization beyond the authoritative local service.
- Browser-local Git inspection, forge CLI/API calls, note/file persistence, lifecycle decisions, durable operation state, or creation authority of any kind.
- Provider shorthand such as `github:123`, source auto-labels, multi-change/multi-source workspaces, and a distinct review-workspace type.
- Stale-workspace intelligence, cleanup recommendations, and consolidated live/hosted milestone UAT remain Phase 127 work.
- A generic application command palette or default shortcuts for every parity action.

## Summary

Phase 126 should extend the existing authority chain rather than add client-specific implementations: strict transport types in `@git-stacks/protocol`, domain mutations and rich local models in `@git-stacks/core`, policy/projection/token authority in `@git-stacks/service`, pure action coordination in `@git-stacks/client`, and rendering only in web/OpenTUI. The existing operation registry already supplies durable IDs, idempotency reservations, persisted terminal states, progress events, and safe-boundary cancellation machinery, but it does not currently project whether cancellation is still possible or distinguish requested/already-finished/too-late outcomes. [VERIFIED: `packages/service/src/policy/operations.ts`, `packages/protocol/src/service.ts`, `packages/protocol/src/web.ts`]

The existing notes implementation is reusable, while the existing file-status service route is not browser-safe: it returns the rich core object containing `root`, `mainPath`, absolute-path warnings/errors, and verbose path lists. Forge-source code is also only a URL parser plus synthetic-ref preparation today; it invents `source/<forge>-<type>-<number>` and `refs/heads/...`, fetches that from `origin`, and never resolves the real provider head project/ref/SHA. Those assumptions must be corrected before exposing reviewed creation. [VERIFIED: `packages/core/src/notes.ts`, `packages/core/src/workspace-file-status.ts`, `packages/service/src/secure/router.ts`, `packages/core/src/workspace-source.ts`]

**Primary recommendation:** build the phase in four foundations—protocol/projections, service/core actions, provider-backed resolve/review tokens, then shared client and UI integration—and require a fetched-ref SHA equality check immediately before normal workspace creation.

## Correcting the Existing Forge-Source Design

`docs/forge-source-resolver.md` is useful historical intent, not an accurate description of the current implementation or current GitLab CLI contract. Planning must explicitly correct these points. [VERIFIED: codebase and current official docs]

| Existing assumption | Current evidence | Required correction |
|---|---|---|
| `glab mr view` is a stable full-URL resolver | Current official synopsis documents `glab mr view [<id \| branch>]`; unlike `glab mr checkout`, it does not document URL input. [CITED: https://docs.gitlab.com/cli/mr/view/] | Parse the URL in core, then call `glab api --hostname <host> projects/<encoded-target>/merge_requests/<iid>`. Do not pass the URL to `glab mr view`. |
| Resolver success already contains authoritative source metadata | `prepareWorkspaceSource()` derives a synthetic branch and ref solely from URL components. [VERIFIED: `packages/core/src/workspace-source.ts`] | Resolve provider state, real source project, real head branch/ref, and immutable head SHA before review. |
| `origin` can always fetch the change | Fork PRs/MRs have a distinct head/source repository. GitHub exposes `headRepository` and `isCrossRepository`; GitLab exposes `source_project_id`. [CITED: https://docs.github.com/en/graphql/reference/pulls] [CITED: https://docs.gitlab.com/api/merge_requests/] | Keep source clone/fetch coordinates server-side and fetch the real source branch from the real source repository. |
| Any non-GitHub `/pull` URL can be treated as Gitea | `parseForgeSourceUrl()` currently makes that inference. [VERIFIED: `packages/core/src/integrations/forge-source.ts`] | Phase 126 accepts only GitHub/GitLab hosts matched against built-in or configured `base_url` metadata; Gitea remains deferred. |
| Documented repo matching precedence is implemented | Current matching checks only `forge_metadata.repo_path`. [VERIFIED: `packages/core/src/workspace-source.ts`] | Implement host + repo-path matching with repo-level metadata first, integration base URL second, and unique remote inference only as the final bounded fallback. |
| A dry-run URL parse is equivalent to resolution | Current dry-run skips fetch and can succeed without tooling/auth/provider metadata. [VERIFIED: `packages/core/src/workspace-source.ts`] | `resolve` must actually query the provider and return typed tooling/auth/inaccessible/closed failures; it still creates no Git/workspace resources. |

## Architectural Responsibility Map

| Capability | Primary package/module | Secondary integration | Boundary rule |
|---|---|---|---|
| Action IDs, request/response DTOs, safe projections | `packages/protocol/src/service.ts`, `packages/protocol/src/web.ts` | protocol contract tests | Strict bounded Zod; no core imports and no host paths. |
| Workspace/notes/Git/creation domain authority | `packages/core/src/*` | existing config, notes, workspace-git, lifecycle, creation modules | Core remains a leaf and never imports protocol. |
| Provider URL parsing and normalized resolution | `packages/core/src/integrations/forge-source.ts` plus a focused resolver module | injected argv runner | No shell; rich trusted result may include fetch coordinates but is never returned directly to a browser. |
| Review-token, catalog-revision, provider recheck, routes | `packages/service/src/policy/forge-source-review.ts` (recommended), `secure/router.ts`, `main.ts` | operation registry and snapshot adapter | Service holds token state and maps core results into safe DTOs. |
| Rich-to-safe notes/file/operation projection | `packages/service/src/web/projection.ts` plus focused projection modules | protocol schemas | Allowlist fields and generate messages from typed codes; never scrub arbitrary raw strings after the fact. |
| Pure action metadata/availability/one-shot coordination | `packages/client/src/workspace-actions.ts` (recommended) | Phase 125 shortcut helpers | Inputs are typed authoritative projections plus active operations; no DOM/OpenTUI imports. |
| Web rendering and invocation | `packages/web/src/app.ts`, `navigation.ts`, `app.css` | singleton overlay/controller | Pointer/menu/shortcut call the same registered callback. |
| TUI rendering and invocation | `packages/tui/src/App.tsx`, `ActionMenu.tsx`, `WorkspaceDetail.tsx` | `packages/service/src/policy/client.ts` | Add Pull, Pin/Unpin, Cancel, notes mutations, and reviewed creation without local authority. |

[VERIFIED: current package dependency direction and canonical references in `126-CONTEXT.md`]

## Standard Stack

No external package is needed. Use the repository's existing Zod protocol schemas, Node/Bun argv-based process runner, Web Crypto/Node crypto random bytes, operation registry, core Git primitives, imperative DOM, and SolidJS/OpenTUI. [VERIFIED: `package.json` and current source]

| Existing stack | Use |
|---|---|
| Zod strict objects/discriminated unions | Bound every action, note, file-status, resolve, review, cancellation, and error DTO. |
| `OperationRegistry` | Durable mutation identity, idempotency reservation, progress, terminal result, and non-replay. |
| `AbortController` / `AbortSignal` | Direct resolve cancellation and only those durable mutations that expose real safe boundaries. |
| Existing core notes/Git/lifecycle/creation functions | Preserve CLI/TUI semantics instead of creating browser variants. |
| `gh api graphql` and `glab api` | Authenticated provider metadata using the user's existing CLI host/auth configuration. |

## Canonical Action and Cancellation Architecture

### One action model

Define stable action IDs for `workspace.archive`, `workspace.unarchive`, `workspace.remove`, `workspace.force-remove`, `workspace.rename`, `workspace.open`, `workspace.close`, `workspace.pin`, `workspace.unpin`, `workspace.sync`, `workspace.pull`, `workspace.push`, `workspace.merge`, `workspace.notes.list`, `workspace.notes.add`, `workspace.notes.clear`, `workspace.files.inspect`, and `operation.cancel`. The protocol should project service-calculated base availability/disabled reason for each relevant workspace action; `@git-stacks/client` then combines that with active-operation state and surface state to produce the final descriptor. This prevents either client from inferring dirty-worktree, repo mode, remote, terminal, or revision guards. [VERIFIED: D-01 through D-11]

Recommended descriptor:

```ts
type WorkspaceActionDescriptor = {
  action_id: WorkspaceActionId
  label: string
  subject: { workspace_id: string; repository_id?: string }
  availability:
    | { available: true }
    | { available: false; reason_code: WorkspaceActionDisabledReason; message: string }
  confirmation: "none" | "confirm" | "exact-workspace-name"
  pending_operation_id?: string
}
```

Buttons, context-menu entries, and optional shortcut registrations resolve this descriptor and call one surface-owned callback. The callback performs confirmation, acquires a synchronous one-shot latch before any `await`, submits exactly once with a fresh idempotency key, stores the operation ID, observes it, and refreshes the authoritative snapshot in `finally`. Reconnect may reattach only when an operation ID is already known. [VERIFIED: Phase 123/125 behavior and D-10/D-11]

### Honest cancellation contract

The present `operation.cancel` returns the pre-cancel operation and cannot tell a client whether cancellation was accepted or too late. `WebOperationSchema` also has no cancellability field. [VERIFIED: `OperationRegistry.cancel()`, `SecureServiceRouter.cancelOperation()`, `WebOperationSchema`]

Add an execution declaration (`cancellation: "safe-boundaries" | "none"`) and project cancellation state on accepted/running operations:

```ts
type OperationCancellationView =
  | { state: "available" }
  | { state: "requested" }
  | { state: "unavailable"; reason: "not-supported" | "committed" | "finished" }

type CancelOperationResult = {
  outcome: "requested" | "already-requested" | "already-finished" | "too-late" | "not-cancellable"
  operation: WebOperation
}
```

`OperationRegistry.cancel()` must make the outcome decision under its serialization queue, and `OperationCancellation.commit()` must make `committed` visible before irreversible work begins. Operations whose core implementation cannot stop or check between safe boundaries must report `not-supported`; the UI must not display Cancel for them. A cancel request is itself one-shot and never means undo succeeded. The eventual operation terminal state remains the truth. [VERIFIED: existing safe-boundary/commit mechanics in `operations.ts`; recommendation closes D-07]

## Notes and File-Status DTOs

### Notes

Keep `WorkspaceNoteRecord { text, created }` as the core storage model, but expose bounded protocol types keyed by workspace ID. Recommended response: `{ workspace_id, revision, count, records }`, with newest-first records, at most 50 records, ISO timestamps, and UTF-8 text capped at 4096 bytes. Add/Clear requests carry `workspace_id`, current workspace/catalog revision, and notes revision; Clear also travels only after the shared confirmation. Mutations run through durable operations/idempotency and return a refreshed notes response or revision. Malformed JSONL remains a typed non-mutating failure. [VERIFIED: `packages/core/src/notes.ts`; bounds are a recommended browser contract]

Core needs no rewrite of append/list/clear semantics. Add a notes fingerprint/revision at the core/service seam and adapters for `workspace.notes.add` and `workspace.notes.clear`; do not add record IDs, edit/delete, signals, YAML fields, or browser storage. [VERIFIED: D-14 through D-16]

### Path-free file status

Do not expose `WorkspaceFileStatusView` from `core.workspace.files` to browser mode. It contains `workspace.root`, repo `mainPath`/`root`, raw warnings/errors, hints derived from row data, and verbose `sourceOnly`/`targetOnly`/`differing`/`errors` path arrays. [VERIFIED: `packages/core/src/workspace-file-status.ts`, `packages/service/src/secure/router.ts`]

Create a strict safe DTO with only:

- workspace/repository IDs and bounded logical names;
- scope, configured target only when it is a normalized relative label (otherwise a generic `Configured target` label);
- entry type, shared state, severity, attention flag;
- aggregate and sync counts, never verbose child-path arrays;
- enumerated reason codes such as `target_missing`, `source_missing`, `content_differs`, `diverged`, `comparison_failed`, and `repo_root_missing`;
- fixed service-authored messages generated from those reason codes, never raw caught errors or hints.

The projection must be allowlist-built and validated before routing to either client. Tests should seed canary absolute paths in every rich field and assert none occur in serialized browser DTOs, errors, progress, events, or logs captured by the route harness. [VERIFIED: D-17 through D-19 and current rich model]

## Provider-Backed Forge Resolution

### Injected runner

Add a forge command runner dependency with argv, bounded stdout/stderr, timeout, working directory, environment overrides, and `AbortSignal`. The production runner uses `packages/core/src/node-runtime.ts`; tests inject scripted outcomes. Never use `sh -c`, never inherit stdin, and never expose raw output. Set non-interactive/no-color environment controls, cap each stream (recommended 256 KiB), enforce a short timeout (recommended 15 seconds), and terminate on abort. [VERIFIED: existing argv runner patterns in core; limits are recommendations]

```ts
type ForgeCommandRunner = (request: {
  argv: readonly string[]
  cwd?: string
  env?: Readonly<Record<string, string>>
  signal?: AbortSignal
  timeout_ms: number
  max_output_bytes: number
}) => Promise<{ exit_code: number; stdout: string; stderr: string }>
```

CLI JSON is untrusted provider data: parse it with strict provider-specific schemas, normalize into a core-owned union, and discard raw buffers. Do not pass tokens on argv. `gh`/`glab` should obtain credentials from their existing authenticated host configuration. [CITED: https://cli.github.com/manual/gh_api] [CITED: https://docs.gitlab.com/cli/api/] [CITED: https://docs.gitlab.com/cli/auth/login/]

### GitHub: GraphQL through `gh api`

Use `gh api graphql --hostname <parsed-and-allowed-host>` with variables for owner, repository, and PR number. Request only `number`, `url`, `state`, `isDraft`, `baseRefName`, `baseRefOid`, `headRefName`, `headRefOid`, `isCrossRepository`, and `baseRepository`/`headRepository` fields `nameWithOwner`, `url`, and `sshUrl`. GitHub documents `gh api graphql`, typed variables, hostname selection, and the relevant PullRequest/Repository fields. [CITED: https://cli.github.com/manual/gh_api] [CITED: https://docs.github.com/en/graphql/guides/using-graphql-clients] [CITED: https://docs.github.com/en/graphql/reference/pulls] [CITED: https://docs.github.com/en/graphql/reference/repos]

Illustrative command shape (implementation constructs the equivalent argv array, not a shell string):

```bash
gh api graphql --hostname "$host" \
  -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number url state isDraft baseRefName baseRefOid headRefName headRefOid isCrossRepository baseRepository{nameWithOwner url sshUrl} headRepository{nameWithOwner url sshUrl}}}}' \
  -f owner="$owner" -f name="$repo" -F number="$number"
```

Require an open PR, non-null head repository, real head ref name, and full head OID. Store clone/fetch coordinates only in the trusted resolution/token record; the browser receives logical repository identity and whether a separate source remote is required. [VERIFIED: official field semantics plus D-20 through D-22]

### GitLab: REST through `glab api`

Use the parsed target project path and IID, URL-encode the project path, and call `glab api --hostname <allowed-host> projects/<encoded-path>/merge_requests/<iid>`. Read `state`, `web_url`, `sha`, `source_branch`, `source_project_id`, `target_branch`, `target_project_id`, and optionally `diff_refs.head_sha` as a consistency check. Then query `projects/<source_project_id>` for `path_with_namespace`, `ssh_url_to_repo`, `http_url_to_repo`, and `web_url`. GitLab documents all of these fields and notes that `diff_refs` can initially be empty, so `sha` is the primary head SHA. [CITED: https://docs.gitlab.com/cli/api/] [CITED: https://docs.gitlab.com/api/merge_requests/] [CITED: https://docs.gitlab.com/api/projects/]

Require `state === "opened"`, a source project, branch, and full SHA. Use `--hostname` explicitly instead of relying on current-directory remote detection. This is stable for self-managed instances configured in project metadata and `glab` auth. [CITED: https://docs.gitlab.com/cli/api/] [CITED: https://docs.gitlab.com/cli/auth/status/]

### Normalized trusted result and safe draft

The core resolver should return a trusted union containing provider, canonical host/change identity, target and source logical repo identities, source branch/ref, head SHA, target branch/SHA, source fetch URL(s), cross-repository flag, match/confidence, and proposed name. Service stores the complete trusted result in an in-memory short-lived record keyed by 256-bit random opaque token; a 10-minute TTL is a reasonable default. Service restart invalidates tokens safely. [RECOMMENDATION]

The client DTO includes only token, expiry, expected catalog revision, canonical web URL, provider/change terminology, logical repo identities, branches, head SHA abbreviation, matched template/repo candidates, confidence, remote-needed boolean, and suggested name. It excludes CLI output, credentials, paths, clone URLs, fetch commands, and host environment. [VERIFIED: D-21/D-22]

### Submit-time TOCTOU and SHA verification

Submit must perform all validation again; possession of a token is not authority. Recommended order:

1. Atomically consume/reserve the live token for one idempotency key; reject expired, wrong-principal, or already-bound reuse.
2. Rebuild authoritative catalog/core state and compare its revision/fingerprint with the token and submitted expected revision.
3. Validate final name with existing rules; validate template/repository membership, worktree modes, branch mappings, and source-repo selection from authoritative config.
4. Re-query the provider and require the same provider/host/repo/change, open state, source project/ref, and head SHA. A moved head returns `source_changed`; preserve the editable draft but require re-resolve.
5. Fetch the real source branch from the server-held source clone URL into a private git-stacks ref, resolve that ref locally, and compare it byte-for-byte with the provider head SHA. Delete the private ref and fail `source_changed` if they differ. This closes the race between provider re-query and Git fetch.
6. Check an existing target branch against that verified SHA. A mismatch is `branch_conflict`; an exact match may be reused under existing rules.
7. Only then call the normal workspace creation path. Keep provider checkout commands out of implementation and retain existing rollback/YAML-last guarantees.

[VERIFIED: current Git fetch/branch-conflict/creation seams in `packages/core/src/git.ts`, `workspace-source.ts`, and `workspace-creation.ts`; sequence is the recommended TOCTOU closure]

## Failure Classification and Redaction

Map failures at the service boundary to a strict code, safe context, retryability, and recovery action. Do not forward provider stderr, raw JSON, command argv, clone URL, filesystem/Git error text, or nested generic `Error.message` to browser responses.

| Code | Detection | Safe recovery |
|---|---|---|
| `malformed_url` | strict URL/path parse fails | Paste a full supported PR/MR URL. |
| `unsupported_host` / `unsupported_provider` | host does not match built-in/configured forge metadata | Configure the host or use GitHub/GitLab. |
| `cli_unavailable` | spawn `ENOENT` for `gh`/`glab` | Install the named official CLI. |
| `auth_required` | CLI/API authentication classification | Authenticate the named host with `gh auth login`/`glab auth login`. |
| `change_not_found` | provider null/404; intentionally does not reveal private existence | Check URL and account access. |
| `change_closed` | authenticated provider state is not open | Choose an open PR/MR. |
| `rate_limited` / `provider_unavailable` | typed HTTP/CLI classification | Retry later; preserve URL input. |
| `provider_response_invalid` | strict JSON/schema failure or output cap | Update CLI/retry; no raw output. |
| `repo_not_matched` / `ambiguous_repo` / `template_repo_missing` / `not_worktree_mode` | authoritative config matching | Select/configure a supported worktree repo. |
| `review_expired` / `stale_revision` | token TTL or catalog mismatch | Re-resolve while preserving safe editable fields. |
| `source_changed` | provider or fetched SHA differs from reviewed SHA | Re-resolve and review the new head. |
| `fork_unreachable` / `branch_conflict` | fetch/access or local branch SHA mismatch | Fix access or choose another branch; create nothing. |
| `cancelled` / `request_timeout` | request signal/runner timeout | Retry resolve; no workspace resources were created. |

[RECOMMENDATION grounded in D-28 and existing typed API error practice]

Raw provider output may be retained only in bounded, access-controlled diagnostic logging after applying the existing redaction policy; safest for this phase is not to log it at all. Provider titles/bodies are not needed for creation resolution and should not be requested. [RECOMMENDATION]

## Implementation Dependency Graph

```text
1. Protocol action/note/file/operation/source schemas
   ├── 2a. Core pull + notes adapters and cancellation declarations
   ├── 2b. Safe service projections and route contracts
   └── 2c. Core provider resolver + injected runner + real source metadata
          └── 3. Service review-token authority + provider recheck + SHA-safe source prep

2a + 2b ──> 4a. Shared client action/coordinator model
3       ──> 4b. Shared client resolve/review state machine

4a + 4b ──> 5a. Web controls/context menus/notes/status/review UI
4a + 4b ──> 5b. TUI Pull/Pin/Cancel/notes/review parity

5a + 5b ──> 6. Cross-surface deterministic gates and Phase 127 live-UAT handoff
```

Wave 2a/2b/2c can be isolated in parallel after protocol contracts land. Web and TUI can then proceed in parallel after the shared client coordinators and service routes merge. Avoid parallel edits to `secure/router.ts`, `protocol/web.ts`, or `web/app.ts`; give each a single owning plan per wave. [VERIFIED: repository hotspots and user-enabled parallel execution]

## Test Strategy

### Protocol and architecture

- Round-trip every strict DTO and reject unknown fields, oversized text/lists, invalid states, duplicate IDs, path-bearing fields, raw provider output, clone URLs, and fetch commands.
- Architecture gates: core imports no protocol/service/client; web/TUI import no core Git/config/notes/files/forge mutation module; browser route never returns `WorkspaceFileStatusView`.
- Assert every visible/context/shortcut action ID resolves the same registry entry/callback and confirmation policy.

### Operation and action correctness

- Deferred-promise tests for rapid click/Enter/repeat prove one submit and one idempotency key reservation.
- Reconnect tests prove known operation observation resumes without resubmit; terminal events always trigger authoritative refresh on success, failure, and cancellation.
- Race cancellation before start, during cancellable work, after `commit()`, after finish, duplicate cancel, non-cancellable execution, and service restart. Assert typed outcomes and no rollback claim.
- Core/service parity fixtures cover open/close/archive/unarchive/remove/force-remove/rename/pin/unpin/sync/pull/push/merge and stale revisions.

### Notes and file status

- Notes: newest-first, bounded list, add, confirmed clear, malformed JSONL fail-closed, idempotent replay, stale notes/workspace revisions, and refreshed response.
- File status: every shared state/severity/count; lazy selected-workspace request; absolute-path canaries in roots, hints, warnings, errors, verbose path arrays, and thrown errors; serialize and assert no canary or path separator leakage.
- TUI and web render the same sanitized DTO and reason codes.

### Forge resolution and creation

- URL table tests for GitHub.com, GitLab.com, configured self-hosted hosts, nested GitLab groups, malformed paths, wrong change kind, unsupported host, query/fragment normalization, and Gitea rejection.
- Injected runner fixtures for success, missing CLI, auth, not found, closed/merged, fork, timeout, abort, rate limit, invalid/truncated/oversized JSON, source project missing, and self-hosted hostname argv.
- Exact argv snapshots prove `gh api graphql`/`glab api`, explicit hostname, no shell, no token args, and no `glab mr view <url>`.
- Matching fixtures cover explicit metadata precedence, base URL, unique remote inference, ambiguity, missing template repo, and non-worktree mode.
- Token tests cover entropy/opacity, principal binding, expiry, restart, catalog revision, one idempotency key, safe retry after validation failure, and no client fetch coordinates.
- TOCTOU fixtures move provider head before re-query and between re-query/fetch; both must fail `source_changed` without YAML/worktrees. Same-SHA existing branch succeeds; different-SHA branch fails.
- Creation rollback fixtures reuse existing normal creation tests and verify provider checkout commands are never invoked.

### UI harness and deferred live evidence

- DOM/OpenTUI harnesses prove Resolve Enter cannot create, resolved review is editable, immutable identity stays anchored, final submit is explicit/one-shot, failures preserve safe edits, and resolve/creation statuses are distinct.
- Web 320px layout, dialog focus, disabled reasons, confirmation parity, progress, cancellation, and valid successor selection require deterministic coverage.
- Defer real `gh`/`glab` authenticated hosts, physical keyboard/xterm, reconnect observation, screenshots, and supported-host approval to Phase 127 exactly as D-13 requires.

## Security Verification

Security enforcement applies. Relevant OWASP ASVS concerns are input validation (V5), stored/output data protection (V8), communications/provider authentication (V9), and malicious/untrusted provider data handling (V12). The phase should validate URLs and provider JSON at trust boundaries, use argv execution without a shell, keep secrets in CLI auth stores, issue high-entropy expiring review tokens, bind tokens to principal/revision/source, and use allowlist projections. [VERIFIED: local architecture; ASVS mapping is a planning control]

Specific negative gates:

- no credentials, environment, raw CLI output, absolute paths, clone URLs, or commands in protocol DTOs, operation results/progress, events, DOM text, snapshots, or persisted workspace provenance;
- no client-selected host outside configured allowlist and no URL credentials;
- no mutation on resolve, no create on unresolved/expired/stale/changed source, and no fetch before authoritative match/review validation;
- no log injection from provider strings; titles/bodies are unnecessary and should not be fetched;
- no token replay across principals, revisions, source identities, or different request bodies.

## Common Pitfalls

- Extending the Phase 125 shortcut enum into a second operation implementation instead of generalizing one action descriptor.
- Treating `operation.state === running` as proof that cancellation is possible.
- Making every Git operation appear cancellable even though existing core functions do not accept a signal or check safe boundaries.
- Returning the rich TUI file-status object to the browser and attempting regex redaction afterward.
- Using workspace names rather than authoritative IDs/revisions at the browser boundary.
- Passing a full MR URL to `glab mr view`; current official docs guarantee only ID or branch there.
- Fetching a synthetic PR/MR ref from `origin`, which breaks fork/source-project correctness.
- Trusting reviewed branch text without binding and checking the immutable provider head SHA.
- Treating provider API success as creation success or preserving a token after source/catalog changes.
- Exposing clone URLs because they look non-secret; they may contain host/user topology and are unnecessary client authority.

## Official Sources

- GitHub CLI `gh api`: https://cli.github.com/manual/gh_api
- GitHub GraphQL client usage: https://docs.github.com/en/graphql/guides/using-graphql-clients
- GitHub PullRequest fields: https://docs.github.com/en/graphql/reference/pulls
- GitHub Repository clone/name fields: https://docs.github.com/en/graphql/reference/repos
- GitLab CLI `glab api`: https://docs.gitlab.com/cli/api/
- GitLab CLI `glab mr view` synopsis: https://docs.gitlab.com/cli/mr/view/
- GitLab Merge Requests API: https://docs.gitlab.com/api/merge_requests/
- GitLab Projects API: https://docs.gitlab.com/api/projects/
- GitLab CLI authentication: https://docs.gitlab.com/cli/auth/login/

## Package Legitimacy Audit

No new external package is recommended or required, so the package-legitimacy gate is not applicable.

## Research Validation

- [x] Context decisions, discretion, and deferred scope copied into the first content section.
- [x] Current code and historical forge design compared; stale assumptions called out explicitly.
- [x] Current official GitHub/GitLab CLI and API documentation cross-checked.
- [x] Exact package boundaries, DTOs, cancellation, redaction, injected runner, failure taxonomy, TOCTOU verification, dependency graph, tests, and risks documented.
- [x] Security domain included; no rename/refactor runtime-state inventory required.
- [x] No new package proposed.

