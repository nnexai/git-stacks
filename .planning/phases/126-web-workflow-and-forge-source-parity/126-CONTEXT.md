# Phase 126: Web Workflow and Forge-Source Parity - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Make web a complete high-frequency workspace control surface by routing lifecycle, Git, pin, notes, and file-status behavior through shared service authority, while closing the corresponding TUI gaps. Add a reviewed GitHub pull-request / GitLab merge-request creation flow that resolves a URL into an editable draft before normal workspace creation. This phase does not move Git, forge, notes, filesystem, lifecycle, or creation authority into either client. Phase 127 owns the consolidated live web/TUI UAT and supported-host approval before any release-candidate tag.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Milestone Contract
- `.planning/PROJECT.md` — Thin-client/service authority, local CLI boundary, target features, and milestone release boundary.
- `.planning/REQUIREMENTS.md` — `PARITY-01..05` and `SOURCE-01..04`, plus explicit out-of-scope and Phase 127 requirements.
- `.planning/ROADMAP.md` — Phase 126 goal/success criteria, dependencies, and Phase 127 live-UAT handoff.
- `.planning/STATE.md` — Current milestone decisions and completed Phase 123/125 contracts.
- `.planning/phases/123-archived-workspaces-and-safe-removal/123-CONTEXT.md` — Locked terminal-stop, destructive confirmation, force-remove, stale-revision, progress, and reconciliation behavior.
- `.planning/phases/125-terminal-safe-keyboard-navigation/125-CONTEXT.md` — Canonical web action/shortcut callback, singleton overlay, focus, repeat, and no-browser-authority decisions.

### Forge, Notes, and File-Status Contracts
- `docs/forge-source-resolver.md` — Existing resolver result/failure shapes, repo matching, plain-Git fetch boundary, branch conflict rules, and validation limits.
- `.planning/milestones/v0.18.0-phases/92-forge-source-research-and-resolver-design/92-CONTEXT.md` — Provider terminology, self-hosted identity, resolver metadata, and typed ambiguity decisions.
- `.planning/milestones/v0.18.0-phases/93-forge-source-workspace-creation/93-CONTEXT.md` — Existing normal-workspace source creation, provenance, fetch, rollback, and branch rules.
- `.planning/milestones/v0.19.0-phases/96-workspace-notes/96-CONTEXT.md` — Append-only JSONL list/add/clear behavior and malformed-store safety.
- `.planning/milestones/v0.19.0-phases/97-file-status-view-model-for-tui/97-CONTEXT.md` — Shared file-status states, grouped summaries, lazy loading, and severity model.
- `.planning/milestones/v0.19.0-phases/98-grounded-dashboard-control-center/98-CONTEXT.md` — Existing TUI detail placement for notes and file status.
- `.planning/milestones/v0.19.0-phases/99-dashboard-actions-and-correctness-polish/99-CONTEXT.md` — Existing TUI action-menu, disabled-reason, picker, and progress conventions.
- `.planning/todos/pending/2026-05-15-add-workspace-notes.md` — Original operator-memory intent and append-only preference.
- `.planning/todos/pending/2026-05-15-create-workspace-from-forge-source.md` — Original normal-workspace forge-source intent and template/repo matching expectations.

### Existing Implementation Seams
- `packages/web/src/navigation.ts` — Phase 125 action registry/dispatcher and availability model to generalize.
- `packages/web/src/app.ts` — Current workspace controls, lifecycle operations, overlays, operation observation, pinning, and one-step creation form.
- `packages/protocol/src/service.ts` and `packages/protocol/src/web.ts` — Strict typed service/web schemas and current limited creation/action contracts.
- `packages/service/src/secure/router.ts` — Secure scopes, notes/file-status reads, operation submit/get/cancel, pins, and browser projection routing.
- `packages/service/src/policy/operations.ts` — Existing core mutation adapters, progress, result, and workspace creation authority.
- `packages/core/src/notes.ts` — Authoritative append/list/clear note store.
- `packages/core/src/workspace-file-status.ts` — Rich core file-status model that must be projected without host paths.
- `packages/core/src/integrations/forge-source.ts` and `packages/core/src/workspace-source.ts` — Existing URL parsing, source preparation, matching, provenance, and branch-conflict behavior.
- `packages/tui/src/App.tsx`, `packages/tui/src/ActionMenu.tsx`, and `packages/tui/src/WorkspaceDetail.tsx` — Current TUI actions/progress, missing Pull/Pin/Cancel controls, and existing notes/file-status rendering.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createWebActionRegistry()` and the Phase 125 dispatcher already centralize shortcut metadata, availability, repeat behavior, and callbacks; Phase 126 can extract/generalize the action descriptor without discarding shortcut safety.
- `submitWorkspaceLifecycle()` / lifecycle operation observation in web and the TUI lifecycle views already implement the Phase 123 archive/remove/force contract.
- `SecureServiceRouter`, `CoreMutationAdapters`, and durable operation submit/get/cancel paths already provide the service-owned execution and progress foundation.
- `addWorkspaceNote()`, `listWorkspaceNotes()`, `clearWorkspaceNotes()`, and `getWorkspaceNoteSummary()` already own append-only note behavior in core.
- `getWorkspaceFileStatusView()` already computes grouped file status, states, severity, and summaries; a browser-safe projection can remove roots/paths without duplicating comparison policy.
- `parseForgeSourceUrl()` / `prepareWorkspaceSource()` and the existing `workspace.create` operation already provide source parsing, normal-workspace creation, plain-Git fetch, provenance, and rollback seams.
- The TUI action menu, confirm/progress views, core mutation runner, and lazy note/file-status detail hooks are direct parity integration points.

### Established Patterns
- Protocol inputs and projections are strict bounded Zod schemas. Expected conflicts and capability failures use typed errors; clients do not parse arbitrary error text to gain authority.
- Files/YAML and core operations are authoritative. Service snapshots, durable operations, and typed projections are the client truth; refresh/reconciliation closes every mutation attempt.
- Non-idempotent work is submitted once. Reconnect resumes observation only after an operation ID exists.
- Web is imperative DOM/xterm; TUI is SolidJS/OpenTUI. Shared behavior belongs in protocol/client/core/service layers, while each surface owns only rendering, focus, and explicit foreground handoff.
- Existing source creation is a normal workspace creation variant, not a special review-workspace type, and uses plain Git rather than provider checkout commands.

### Integration Points
- Generalize the web action descriptor so pointer/context/keyboard surfaces resolve one availability and execution path; add matching TUI action metadata/adapters where practical without forcing DOM-specific types into shared client code.
- Extend strict protocol schemas and secure routes for parity mutations, note Add/Clear, sanitized file-status detail, forge-source resolve drafts, and reviewed source-create submission.
- Add missing core/service operation adapters such as Pull and note mutations, then expose accurate cancellability and result/progress projections.
- Project rich file status through a dedicated path-free browser/service DTO before either client renders it.
- Replace the one-step web creation form and extend the TUI wizard with the locked resolve -> editable review -> token/revision submit flow.

</code_context>

<specifics>
## Specific Ideas

- The creation flow should visibly read as `Resolve URL` followed by `Review workspace` and only then `Create workspace`; Enter in the first step must never skip the review.
- File status may name configured logical targets such as a relative `.env` entry, but must never reveal the absolute workspace root or source/repository clone path used to compute it.
- Pull, Pin/Unpin, and Cancel are explicit TUI parity work in this phase, not optional polish.
- Live human web/TUI verification is intentionally one consolidated Phase 127 pre-tag gate so the milestone stops at a coherent manual approval point.

</specifics>

<deferred>
## Deferred Ideas

- Gitea support in the new service-backed reviewed web/TUI source-creation flow. Existing CLI/core Gitea behavior is not removed, but Phase 126 ships and verifies GitHub PR and GitLab MR parity only.
- Arbitrary note editing, deleting individual notes, history rewrite, tags, authors, search, and note synchronization beyond the authoritative local service.
- Browser-local Git inspection, forge CLI/API calls, note/file persistence, lifecycle decisions, durable operation state, or creation authority of any kind.
- Provider shorthand such as `github:123`, source auto-labels, multi-change/multi-source workspaces, and a distinct review-workspace type.
- Stale-workspace intelligence, cleanup recommendations, and consolidated live/hosted milestone UAT remain Phase 127 work.
- A generic application command palette or default shortcuts for every parity action.

</deferred>

---

*Phase: 126-web-workflow-and-forge-source-parity*
*Context gathered: 2026-07-16*
