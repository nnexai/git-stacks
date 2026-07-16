---
phase: 125-terminal-safe-keyboard-navigation
verified: 2026-07-16T16:40:46Z
status: passed
score: 13/13 requirements verified
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "Desktop, 320px, and 375px browser screenshots plus real xterm focus/pass-through and physical non-US/IME/AltGraph keyboard behavior are approved before tagging."
    addressed_in: "Phase 127"
    evidence: "Phase 127 owns live web/TUI UAT and the milestone stops before tagging for manual approval; Phase 125 verifies the event boundary, focus policy, and responsive contract through executable browser-harness and architecture tests."
---

# Phase 125: Terminal-Safe Keyboard Navigation Verification Report

**Phase goal:** Let a user operate the web client at speed while xterm retains focus, without stealing ordinary shell/TUI input or relying on browser-hard shortcuts.
**Verified:** 2026-07-16T16:40:46Z
**Status:** passed
**Verified revision:** `9ad6ce3b7b7c2d12b4133c24853635009a201632`

## Goal Achievement

Phase 125 achieves its local implementation and automated-verification goal. One authoritative shortcut registry drives document and xterm dispatch; app-owned defaults avoid browser-hard and shell-hostile chords; fuzzy overlays, terminal traversal, and attention navigation use shared client logic; overlay and shortcut-setting concurrency are one-shot and revision-safe; and the secure service remains the authority for settings and terminal state.

The independent code re-review is clean with zero findings. The final UI review passes at 22/24 with no source-level finding; its two withheld points are solely the explicit Phase 127 live-rendering and physical-input evidence boundary.

## Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| KEY-01 | VERIFIED | Protocol metadata, core persistence/validation, secure get/set routes, one web registry, keyboard help, primary/alias editing, reset, and unbind are wired. Complete settings replace browser state only after validated authoritative responses. |
| KEY-02 | VERIFIED | Defaults are `Ctrl+Cmd` on macOS and `Ctrl+Alt+Shift` on Linux for K/P/N/T/W/J/L/A. Contract and client shortcut tests cover the complete eight-action table. |
| KEY-03 | VERIFIED | `Terminal.attachCustomKeyEventHandler` delegates to the same dispatcher as the document boundary. Registered actions are consumed once; unmatched events return to xterm unchanged. |
| KEY-04 | VERIFIED | Matching uses physical `KeyboardEvent.code`, rejects AltGraph, composition, `Process`, and `Dead`, and covers non-US character values independently from physical codes. |
| KEY-05 | VERIFIED | Default audits reject browser tab/window and tab-traversal chords. The packaged-browser architecture gate rejects Keyboard Lock use; baseline behavior requires no fullscreen lock. |
| KEY-06 | VERIFIED | `Ctrl+K` and `Ctrl+Shift+P` are valid configurable aliases but absent from defaults. Conflict and unsafe-binding validation preserve normal terminal input. |
| KEY-07 | VERIFIED | Workspace/repository rows include only active snapshot workspaces, share weighted fuzzy ranking, use recency only after fuzzy score, and select the top partial match on Enter. |
| KEY-08 | VERIFIED | Configured commands use the same fuzzy/top-result contract and are sourced only from the selected workspace/repository command projection. Async activation is synchronously latched across Enter and pointer input. |
| KEY-09 | VERIFIED | One overlay controller owns one backdrop and listener set. Repeated shortcuts refocus the same surface; compatible surfaces replace in place; confirmation/editor/capture exclusivity blocks unrelated actions. |
| KEY-10 | VERIFIED | Arrow, Enter, Escape, and Tab are contained by the active overlay; listbox options stay out of the Tab sequence; close restores the recorded terminal target without forwarding palette keys. |
| ATTN-01 | VERIFIED | Shared `selectNextAttentionTarget` applies the existing priority ordering, advances after the current target, and wraps deterministically across active workspace/repository/terminal targets. |
| ATTN-02 | VERIFIED | Selection starts from active web projections and current accessible terminal/signal sets, skips dismissed or inaccessible targets, and does not clear unrelated attention. |
| ATTN-03 | VERIFIED | Next Attention is present in the safe default registry, visible toolbar, and keyboard help; the empty path reports `No workspace needs attention.` |

**Score:** 13/13 requirements verified.

## Required Artifacts and Key Links

| Artifact / link | Status | Evidence |
|---|---|---|
| `packages/protocol/src/web.ts` shortcut contract | VERIFIED | Strict action, binding, mutation, settings, and bounded shortcut-error detail schemas are consumed by client, service, and web. |
| `packages/core/src/web-shortcuts.ts` authoritative persistence | VERIFIED | Complete-registry validation, leases/revisions, rebind/reset/unbind, and pre-existing-owner conflict attribution are executable. |
| `packages/client/src/shortcuts.ts` matcher and metadata | VERIFIED | Platform defaults, effective bindings, collision checks, and event matching are shared and browser-state-free. |
| `packages/client/src/fuzzy.ts` ranking | VERIFIED | Workspace and command overlays use the same weighted ranking and stable tie-break contract. |
| `packages/client/src/attention.ts` traversal | VERIFIED | Web uses the shared attention selector rather than browser-local ordering logic. |
| Secure router to core shortcut authority | VERIFIED | `shortcuts.get`/`shortcuts.set` map strict protocol intent to core and return distinct stale-revision versus owner-conflict errors. |
| Secure error transport to web coordinator | VERIFIED | Only the strict shortcut detail union is forwarded; RPC preserves it; web validates code/detail pairs before deciding refresh/rebase versus inline owner conflict. |
| Web registry to document/xterm boundaries | VERIFIED | `createWebShortcutDispatcher` is used by both document handling and xterm preprocessing. |
| Registry to overlays/terminal/attention actions | VERIFIED | One registration table dispatches switcher, commands, workspace creation, terminal actions, and attention navigation with availability checks. |
| Overlay controller to focus restoration | VERIFIED | Singleton replacement preserves the original return target and final close restores the service-owned terminal view. |

Generic textual key-link checks reported false negatives where the exact plan wording differs from the implementation identifier. Manual import/call-site tracing and executable composed tests confirmed those links are wired.

## Review and Behavioral Evidence

| Gate | Result |
|---|---|
| Independent focused verifier run | 9 Phase 125 Vitest files, 82/82 passed |
| Secure browser architecture spot-check | 2/2 passed |
| Final code re-review | Clean, 25 files reviewed, 0 findings; focused matrix 62/62 |
| Final UI re-review | Passed, 22/24, no automated source-level finding; focused matrix 41/41 |
| Full Vitest with coverage | 147 files passed; 1,920 passed, 1 explicit capability skip |
| Node architecture/runtime suite | 46/46 passed |
| TUI suite | Passed |
| Workspace typechecks | Protocol, client, core, CLI, service, web, and TUI passed |
| Package and browser build | All packages and production web bundle passed |
| Dependency/cycle gate | Passed |
| `verify:gates` | Passed; inventory, mapped tests, and coverage artifacts aligned |

## Concurrency and Failure Disconfirmation

- Older settings loads and mutation responses cannot replace a newer accepted generation.
- Stale revisions reload the complete authoritative registry and expose only an explicitly rebased retry.
- Binding-owner conflicts are distinct, preserve current settings and capture, name the actual other action, and expose no retry loop.
- Repeated Enter, a second Enter, and rapid pointer activation share one pending selection latch and issue one terminal-create request.
- Compatible overlays replace one another without an intermediate focus restore; active capture remains exclusive.
- Unknown or malformed secure error details fail closed and are not forwarded as generic server detail.
- Unmatched, AltGraph, composing, dead-key, and non-US-layout events do not become app shortcuts.
- No browser-local Git, terminal, shortcut persistence, Keyboard Lock dependency, or second action implementation was introduced.

No blocker, warning, placeholder implementation, or unreferenced Phase 125 debt marker remains after the final review and verification pass.

## Deferred Live Evidence

Phase 127 must capture desktop, 375px, and 320px screenshots and exercise real xterm focus restoration/pass-through, Tab traversal, physical non-US keys, composition/IME, and AltGraph before any tag. This is a visible milestone-end UAT checkpoint, not a waived Phase 125 implementation gap. The autonomous run remains required to stop before tagging for the user's manual approval.

## Gaps Summary

No local implementation or automated-verification gap remains. Phase 125 is complete. Live browser/xterm/physical-keyboard approval remains explicitly assigned to Phase 127 pre-tag UAT.

---

_Verified: 2026-07-16T16:40:46Z_
_Verifier: independent GSD goal-verification pass, artifact finalized by the primary agent after the verifier process stalled post-checks_
