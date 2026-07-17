# Phase 127: Stale Workspace Intelligence and RC Closure - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a separate, advisory stale-workspace view for web and TUI using one service-owned, explainable evidence policy. The view ranks candidates, shows every confirmed reason and relevant timestamp, preserves failed evidence as unknown, supports Refresh and canonical Open, and routes Archive/Remove follow-ups through the Phase 123 lifecycle contracts without automatic mutation. Close the milestone with live/hosted/manual evidence plus version, changelog, migration, shortcut, shell, package, and release-candidate preparation for `0.22.0-rc.1` / `v0.22.0-rc.1`.

This phase does not add automatic cleanup, a client-owned stale policy, a new CLI stale command, Gitea parity, or any tag, push, publish, package release, or GitHub Release side effect.

</domain>

<decisions>
## Implementation Decisions

### Qualification and Ranking
- **D-01:** Use a fixed 30-day inactivity threshold for the first release candidate; do not add configuration or migration scope.
- **D-02:** A workspace qualifies with at least one confirmed positive reason: canonical change merged or closed, a confirmed repo-scoped deleted remote branch, a missing managed worktree, or activity older than the threshold.
- **D-03:** Rank transparently rather than with an opaque score: more confirmed reasons first, then stronger terminal evidence, then inactivity-only candidates, then oldest activity, then stable name/ID tie-breaking.
- **D-04:** Keep branch evidence repository-scoped and never imply that one missing branch makes the whole workspace safe to remove. Dirty/ahead/drift/notes are visible cautions only and neither prove nor suppress staleness.

### Evidence, Refresh, and Unknowns
- **D-05:** Fetch stale evidence through a separate revision-bound lazy service projection; do not add network work to the base snapshot or introduce background polling.
- **D-06:** Make view-level Refresh the primary operation. A row retry is optional only if it reuses the same evidence policy and code path.
- **D-07:** Cache network evidence in volatile memory for five minutes. Explicit Refresh bypasses the cache, and probe results are never persisted to workspace YAML.
- **D-08:** Require at least one confirmed positive reason for candidate ranking. Failed evidence remains `unknown`; unknown-only workspaces appear separately as evaluation incomplete and never among stale candidates.
- **D-09:** Use authoritative `activity_at` for inactivity, provider event timestamps for merged/closed changes, and observation timestamps such as “confirmed missing at” for deleted branches or missing worktrees rather than fabricating event times.
- **D-10:** Revision mismatch fails closed and reloads authoritative state before any retry.

### Forge Status and Provider Scope
- **D-11:** Query change status only when validated persisted `workspace.source` provenance supplies provider, host, repository, change type, and number.
- **D-12:** Do not infer PR/MR identity from branch names or remotes. Workspaces without provenance still receive activity, missing-worktree, and remote-branch evidence.
- **D-13:** Emit distinct `merged` and `closed` reason codes with provider timestamps; both qualify under STALE-01.
- **D-14:** Keep the Phase 126 GitHub/GitLab baseline. Authentication, rate limiting, malformed metadata, unsupported hosts/providers, and provider unavailability are sanitized unknown outcomes; Gitea remains deferred.

### Product Surface and Follow-up Actions
- **D-15:** Deliver required web and TUI surfaces only; do not add the exploratory `git-stacks stale` CLI command in this phase.
- **D-16:** Web uses a singleton, scrollable stale overlay adjacent to Archived Workspaces with contained focus and in-place loading, error, refresh, candidate, and incomplete-evaluation states.
- **D-17:** TUI uses a dedicated keyboard-first `UIView`, not the minimal archived dialog, so multiple reasons, timestamps, unknowns, cautions, and richer navigation remain legible.
- **D-18:** Open invokes the existing canonical workspace action and selects/navigates only after authoritative success.
- **D-19:** Show Refresh and Open directly. Expose Archive and Remove through canonical service descriptors and unchanged confirmations; Force Remove appears only after a fresh service inventory permits it.
- **D-20:** After lifecycle operations, reconcile the stale view and normal workspace state from the authoritative revision. New entry/refresh shortcuts must use the canonical shortcut registry rather than client-local bindings.

### Release and Verification Boundary
- **D-21:** Prepare lockstep package versions, changelog, migration notes, shortcut reference, configured-shell documentation, package checks, and supported-host evidence for `0.22.0-rc.1` / `v0.22.0-rc.1`.
- **D-22:** Preserve the Phase 126 handoff boundary: deterministic tests do not substitute for hosted receipts, physical browser/xterm interaction, interactive OpenTUI validation, responsive screenshots, authenticated GitHub/GitLab checks, or human cross-client parity approval.
- **D-23:** Do not tag, push, publish packages, create a release, or trigger release-only workflows without separate explicit authorization.

### Claude's Discretion
- Exact sanitized DTO names, internal cache structure, component factoring, visual labels, and registry-selected shortcut bindings may follow established package conventions.
- A per-row retry may be omitted if it would create a second refresh path; view-level Refresh is mandatory.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/service/src/policy/snapshot.ts` already owns authoritative workspace activity fallback semantics.
- `packages/core/src/workspace-status.ts` isolates missing, moved, inaccessible, and invalid managed-worktree evidence.
- `packages/core/src/git.ts` exposes typed remote-branch presence/missing/error evidence without conflating failure with absence.
- `packages/core/src/integrations/forge-source-resolver.ts` provides bounded argv-only provider execution patterns, but stale status needs a separate read-only merged/closed contract.
- `packages/service/src/policy/workspace-actions.ts` and `packages/client/src/workspace-actions.ts` own canonical Open/Archive/Remove availability, confirmation, one-shot submission, and reconciliation behavior.
- `packages/client/src/presentation.ts` provides relative-time presentation helpers.
- Existing release checks in `scripts/check-packages.mjs`, `scripts/release-rc-check.mjs`, and `scripts/pack-release.mjs` cover lockstep versions, RC validation, package checks, and explicit tag gating.

### Established Patterns
- Files and workspace YAML are authoritative; service projections are bounded, revisioned, sanitized, and path-free.
- Lazy service routes such as notes and file inspection use stable workspace identity and current revisions rather than expanding the base snapshot.
- Web singleton overlays restore prior focus and render loading/error/empty states in place.
- TUI navigation uses the discriminated `UIView` model and generation-safe refresh so older responses cannot overwrite newer state.
- Network evidence may use a short volatile TTL with explicit force refresh; failures render as unknown rather than negative evidence.
- Web and TUI consume shared action labels and inventories instead of reconstructing policy locally.

### Integration Points
- Add bounded stale DTOs and request/response schemas in protocol, then implement one service-owned evidence policy/cache and secure revision-bound route.
- Add shared client/service adapters so web and TUI consume identical evidence and reason semantics.
- Integrate the web surface through the existing overlay controller and app shell; integrate TUI through `UIView` routing and the official service adapter.
- Reuse the canonical shortcut registry for entry/refresh bindings and existing lifecycle execution paths for Archive/Remove.
- Extend release metadata, documentation, package verification, hosted evidence, and the Phase 126 milestone-end UAT handoff without triggering release side effects.

</code_context>

<specifics>
## Specific Ideas

- Prefer a visibly explainable ordered list over a hidden numeric stale score.
- Keep unknown-only evaluations visible in a compact separate section so failures are honest without diluting candidate ranking.
- Label missing evidence by observation time (“confirmed missing at”) unless the provider supplies a real event timestamp.
- Preserve the supported GitHub/GitLab and web/TUI milestone boundary rather than broadening provider or CLI scope during RC closure.

</specifics>

<deferred>
## Deferred Ideas

- A read-only `git-stacks stale --json` CLI surface.
- Gitea change-status parity.
- Inferring PR/MR identity from branch names or remote searches.
- User-configurable inactivity thresholds and related migration/UI work.
- Background/global stale polling or persisted evidence caches.

</deferred>
