---
phase: 125-terminal-safe-keyboard-navigation
reviewed: 2026-07-16T16:00:59Z
re_reviewed: 2026-07-16T16:29:08Z
depth: deep
files_reviewed: 25
files_reviewed_list:
  - packages/client/src/attention.ts
  - packages/client/src/fuzzy.ts
  - packages/client/src/index.ts
  - packages/client/src/secure-session.ts
  - packages/client/src/shortcuts.ts
  - packages/core/src/config.ts
  - packages/core/src/web-shortcuts.ts
  - packages/protocol/src/secure.ts
  - packages/protocol/src/web.ts
  - packages/service/src/main.ts
  - packages/service/src/secure/router.ts
  - packages/service/src/security/session-authority.ts
  - packages/web/src/app.css
  - packages/web/src/app.ts
  - packages/web/src/navigation.ts
  - packages/web/src/overlay-controller.ts
  - tests/architecture/secure-browser-bundle.test.mjs
  - tests/lib/client-attention.test.ts
  - tests/lib/client-fuzzy.test.ts
  - tests/lib/client-shortcuts.test.ts
  - tests/lib/web-shortcut-config.test.ts
  - tests/service/web-keyboard-navigation.test.ts
  - tests/service/web-keyboard-overlays.test.ts
  - tests/service/web-shortcut-authority.test.ts
  - tests/service/web-shortcut-contract.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 125: Code Review Report

**Reviewed:** 2026-07-16T16:00:59Z  
**Re-reviewed:** 2026-07-16T16:29:08Z
**Depth:** deep  
**Files Reviewed:** 25
**Status:** clean

## Summary

All four original blockers and the CR-03-R1 re-review finding are resolved. Overlay replacement and exclusivity compose correctly, async command activation is one-shot while pending, authoritative settings operations reject stale responses, stale revisions alone reload/rebase, owner collisions preserve prior authoritative state without reload or retry, and core/service/browser layers retain the actual conflict owner through a strict bounded transport contract.

## Independent Re-review

| Finding | Result | Resolution evidence |
|---|---|---|
| CR-01 | Resolved | `shortcutAvailability()` now delegates to `overlayAwareActionAvailability()`, which blocks only exclusive surfaces or unregistered navigation actions. `createSingletonOverlayController.open()` replaces a non-exclusive active surface without focus restoration and preserves the original return target. The executable overlay test proves workspace-to-commands replacement leaves one backdrop and capture exclusivity blocks replacement. |
| CR-02 | Resolved | `mountFuzzyOverlay()` takes a synchronous `selecting` latch before invoking the callback, consumes repeated Enter without selection, disables pointer options while pending, and exposes the promise to the harness. `showLauncher()` now returns the `createTerminal()` promise. The delayed-promise test proves repeated Enter, a second non-repeat Enter, and pointer activation produce one selection until completion. |
| CR-03 | Resolved | Monotonic coordinator generations prevent older loads and mutations from replacing newer state. The router now emits distinct `shortcut_revision_conflict` and `shortcut_binding_conflict` codes with strictly validated typed details; the secure session validates details before emission and the RPC client preserves them. Browser classification requires a matching code/details pair. Stale revisions reload and expose only a rebased retry, while owner collisions perform no reload, preserve prior authoritative state, expose no retry, keep captured input active, and render the friendly owner label inline. |
| CR-04 | Resolved | Core mutation validation now builds the pre-mutation owner map excluding the edited action, then attributes every conflicting candidate primary/alias to that existing owner before complete-registry validation. Core tests cover both action-order directions and primary/alias ownership; router tests verify the projected owner message. |

### CR-03-R1: Binding-owner conflicts are misclassified as stale revisions and can retry forever

**Files:** `packages/service/src/secure/router.ts:617-628`, `packages/web/src/app.ts:49-54`, `packages/web/src/navigation.ts:173-184`, `packages/web/src/navigation.ts:250-277`, `packages/web/src/overlay-controller.ts:447-461`

**Original severity:** Critical

**Resolution:** Resolved by `fd12f7f6`. `WebShortcutErrorDetailsSchema` is a strict discriminated union whose owner field is the canonical eight-action enum. The router emits distinct codes and typed details, the secure session re-validates and allowlists those details, the RPC client preserves them, and `classifyWebShortcutMutationConflict()` fails closed on malformed or code/detail-mismatched input. The coordinator reloads/rebases only `stale_revision`; `binding_owner_conflict` immediately raises a typed owner error without loading or creating a retry. The settings surface maps the canonical owner ID to its friendly action label, retains capture/exclusivity for captured chords, preserves the prior authoritative registry, and renders no `Retry saving shortcut` control. Focused tests passed 62/62, and an independent RPC probe preserved code, details, and message end to end.

**Issue:** The service deliberately exposes both `WebShortcutStaleRevisionError` and `WebShortcutConflictError` as code `conflict`, while the browser's `isConflict` predicate checks only that code. The settings coordinator reloads authoritative state and changes only `expected_revision` for every such failure. If the mutation's requested chord is now owned by another action, retrying sends the same conflicting chord, receives the same owner conflict, reloads, and offers the same retry again. The service's correctly attributed `Shortcut conflicts with {owner}` message is discarded, capture is cleared, and the UI shows stale-settings copy instead of the required inline named-owner conflict.

**Implemented repair contract:** The secure service maps `WebShortcutStaleRevisionError` to `shortcut_revision_conflict` plus `{ kind: "stale_revision" }`, and `WebShortcutConflictError` to `shortcut_binding_conflict` plus `{ kind: "binding_owner_conflict", owner_action_id }`. Only the first class reloads and rebases. The second performs no unnecessary reload because the core rejected the write atomically at the matching revision; it preserves the current authoritative registry, provides no retry mutation, and renders the validated owner inline.

## Original Findings (2026-07-16T16:00:59Z)

## Critical Issues

### CR-01: App availability swallows shortcut-driven replacement of compatible overlays

**File:** `packages/web/src/app.ts:411-415`  
**Related:** `packages/web/src/navigation.ts:95-103`

**Issue:** `shortcutAvailability()` rejects every action whose ID differs from the currently open surface. The dispatcher then consumes that registered chord without invoking its callback. As a result, while the workspace switcher is open, the configured-commands shortcut is silently swallowed instead of replacing it; the inverse is also true, and workspace/command shortcuts cannot replace help or settings. This bypasses the controller's deliberately implemented compatible-surface replacement path and violates KEY-09 and the CONTEXT rule that only confirmations, editors, and active binding capture block unrelated actions.

**Fix:** Model modal compatibility explicitly. Block app actions only when the controller reports an exclusive confirmation/editor or active capture state; allow registered overlay actions to execute while a compatible non-exclusive surface is active so `open()` can replace it while preserving the original return target. Add a composed registry/controller test that dispatches `workspace.switch`, then `commands.open`, and proves one backdrop, the second surface active, and no interim focus restoration.

### CR-02: Repeated Enter in the commands overlay can create multiple terminals

**File:** `packages/web/src/overlay-controller.ts:260-269`  
**Related:** `packages/web/src/app.ts:1271-1277`

**Issue:** The fuzzy overlay invokes `options.select()` for every Enter keydown without checking `event.repeat` or an in-flight selection guard. The configured-command callback starts `createTerminal()` and leaves the overlay open until the async request succeeds. Holding Enter therefore submits multiple `terminal.create` operations before the first response closes the overlay. This directly violates the locked repeat contract that no repeated key may produce a second service operation.

**Fix:** Always consume repeated Enter but do not invoke selection. Also add a one-shot/in-flight guard around async command selection so separate Enter events before completion cannot duplicate the request. Cover a delayed `createTerminal` promise with repeated Enter events and assert exactly one call and one close.

### CR-03: Shortcut configuration concurrency can roll the browser back and stale retries never recover

**File:** `packages/web/src/navigation.ts:129-141`  
**Related:** `packages/web/src/app.ts:1282-1289`, `packages/web/src/overlay-controller.ts:389-407`, `packages/web/src/overlay-controller.ts:529-533`, `packages/web/src/overlay-controller.ts:547-559`

**Issue:** Every settings load clears and later replaces the registry with no request generation, cancellation, mounted-surface check, or revision ordering. If settings is closed/reopened while a request is pending, an older GET can resolve after a newer load or successful mutation and overwrite `shortcutSettings` plus the live dispatcher with stale bindings. Separately, every mutation failure stores the exact request as `retryMutation`; a revision conflict therefore makes `Retry saving shortcut` resend the same stale `expected_revision` forever. Concurrent edits or a lost success response can leave the service authoritative state changed while help and dispatch continue using older bindings.

**Fix:** Introduce one settings coordinator with monotonic load/mutation generations (or abortable requests) and accept a response only if it belongs to the latest active generation. On `conflict`, reload the complete authoritative registry, replace browser state only from that response, then revalidate/rebase the requested edit with the new revision or require recapture; never retry an unchanged stale mutation. Add deferred-promise tests where load 2 resolves before load 1 and where a stale write is followed by retry.

### CR-04: Core conflict attribution can name the edited action as its own conflict owner

**File:** `packages/core/src/web-shortcuts.ts:154-162`  
**Related:** `packages/service/src/secure/router.ts:613-619`

**Issue:** Conflict ownership is inferred only from fixed registry iteration order. If an earlier action is rebound to a later action's chord, the edited action claims the chord first and validation throws when it reaches the unchanged later row. For example, rebinding `workspace.switch` to the Linux `KeyP` default throws `WebShortcutConflictError("commands.open", "workspace.switch")`; the service consequently reports `Shortcut conflicts with workspace.switch` even though `commands.open` is the pre-existing owner. Atomic rejection is correct, but the required other-action attribution is wrong and concurrent/server-side conflicts surface misleading recovery guidance.

**Fix:** Preserve the mutation action ID when validating and report the member of the conflicting pair that differs from it, or validate the candidate chord against the pre-mutation effective registry before applying it and then run complete-registry validation. Add both conflict directions and primary-vs-alias directions to core/router tests.

---

_Reviewed: 2026-07-16T16:00:59Z_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: deep_
