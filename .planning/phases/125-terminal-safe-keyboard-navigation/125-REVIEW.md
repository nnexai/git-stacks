---
phase: 125-terminal-safe-keyboard-navigation
reviewed: 2026-07-16T16:00:59Z
depth: deep
files_reviewed: 22
files_reviewed_list:
  - packages/client/src/attention.ts
  - packages/client/src/fuzzy.ts
  - packages/client/src/index.ts
  - packages/client/src/shortcuts.ts
  - packages/core/src/config.ts
  - packages/core/src/web-shortcuts.ts
  - packages/protocol/src/web.ts
  - packages/service/src/main.ts
  - packages/service/src/secure/router.ts
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
  critical: 4
  warning: 0
  info: 0
  total: 4
status: issues_found
---

# Phase 125: Code Review Report

**Reviewed:** 2026-07-16T16:00:59Z  
**Depth:** deep  
**Files Reviewed:** 22  
**Status:** issues_found

## Summary

The core persistence path is narrow, leased, strict, and browser-state-free, and the pure matcher/fuzzy/attention helpers are generally well separated. The integrated keyboard/UI path still has four correctness failures that violate locked Phase 125 behavior: compatible overlays cannot replace one another through shortcuts, repeated Enter can create multiple terminals, browser shortcut state can be rolled back by out-of-order responses and cannot recover from a stale revision, and conflict errors can identify the wrong owner. The current tests remain green because the app-level wiring is asserted mostly through source strings while helper modules are exercised in isolation.

## Narrative Findings (AI reviewer)

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
