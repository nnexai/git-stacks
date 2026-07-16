# Phase 125: Terminal-Safe Keyboard Navigation - Research

**Researched:** 2026-07-16
**Status:** Complete

## Summary

Phase 125 can stay within the existing package boundaries. The core needs a narrow authoritative global shortcut-settings module; protocol/service need a path-minimizing get/set contract; shared client helpers should own pure binding, fuzzy, and attention semantics; web should own the action callbacks, modal rendering, focus, and xterm hook. No new UI framework or fuzzy dependency is necessary.

The highest-risk mistake would be treating bindings like the current in-memory web `preferences`. The target architecture says the browser has no durable state, while KEY-01 requires rebind/unbind. Persist overrides in global `config.yml` through core's existing leased atomic `updateGlobalConfig()`, expose only normalized action bindings and a concurrency token, and never project arbitrary config or paths.

## Existing Architecture and Reusable Seams

### Core configuration authority

- `packages/core/src/config.ts` owns `GlobalConfigSchema`, `readGlobalConfig()`, `writeGlobalConfig()`, and `updateGlobalConfig()`. `updateGlobalConfig()` already uses `withMutationLeaseSync()` and atomic YAML replacement.
- `GlobalConfigSchema` currently contains `workspace_root`, integrations, ports, and secret resolver selection. Add a strict optional `web.shortcuts` shape rather than placing browser bindings in workspace definitions or an unvalidated record.
- Model only stable Phase 125 action IDs. Reject unknown action IDs, duplicate effective chords, unsafe modifier sets, malformed physical codes, and browser-hard defaults in core as well as in the UI. Core remains a leaf: define transport-independent domain constants/types locally and never import `@git-stacks/protocol`.
- Store platform-specific override maps (`macos`, `linux`) because the shipped defaults and collision constraints differ. Each action override has an optional primary binding (or null) plus bounded aliases. Absence means default primary with no aliases; Reset removes the override, while Unbind stores null and clears aliases. Do not persist derived labels or current defaults.
- Use a shortcut-subdocument revision/fingerprint for optimistic concurrency. A binding write receives the expected shortcut revision, runs inside the global-config lease, rechecks it, validates the complete effective registry, and writes once. This avoids tying configuration concurrency to unrelated workspace snapshot revisions.

### Protocol and service boundary

- `packages/protocol/src/web.ts` is the correct place for strict browser-safe shortcut schemas alongside pins, priorities, snapshot, and terminal contracts.
- Add bounded action/platform/code/modifier schemas plus a projected settings response containing only platform, revision, and effective bindings. No global config, filesystem path, command text, or environment value crosses the browser boundary.
- Add `shortcuts.get` under `snapshot.read` and `shortcuts.set` under `operation.write` in `packages/service/src/secure/router.ts`. Service may import both core and protocol, so it explicitly maps parsed transport requests to core intents and maps core results back to protocol responses. The router must not mutate YAML itself.
- `packages/service/src/main.ts` already injects core-owned pin and priority setters into the secure runtime. Inject the shortcut reader/updater in the same composition seam and add focused router/runtime contract tests.
- Prefer a dedicated settings get/set contract over expanding `web.snapshot`: the snapshot adapter does not currently carry global config, shortcut settings have their own concurrency token, and the settings UI explicitly needs loading/retry states. Load once during app bootstrap for dispatch/help, refresh on opening settings, and replace local effective bindings only after successful mutation.

### Shared client semantics

- `packages/client/src/presentation.ts` already centralizes signal grouping, scope matching, and workspace successor/priority order for web and TUI. Add separate focused modules instead of growing the presentation file indefinitely.
- A pure shortcut module should define stable action IDs, platform defaults, display labels, exact normalized chord keys, conflict validation, event-to-chord normalization, and safe-event guards. Keep DOM `KeyboardEvent` adaptation structurally typed so Node tests can cover it without a browser.
- A pure fuzzy module can implement deterministic subsequence scoring without another dependency: exact prefix/word-boundary/contiguous bonuses, gap penalty, field weight, then recency and stable ID only as tie-breakers. Both workspace and command overlays must call this one scorer.
- A pure attention module should accept projected workspaces, current non-dismissed signals, visible service-owned terminals, current selection, and tab order. Filter through `signalGroup()`, require active workspace/repository membership, skip missing ended/stale surfaces, deduplicate targets, sort by `workspaceSuccessorOrder`, repository name/ID, terminal tab order, and stable representative signal order, then return the next candidate with one deterministic wrap.

### Web integration

- `packages/web/src/app.ts` is currently imperative and monolithic. It already has reusable callbacks for creation, terminal close, pair selection, terminal selection, signals, and the one `modal()` seam.
- Introduce a canonical web action registry containing action ID, label/group, availability/disabled reason, current binding, and one callback. Toolbar buttons, help/settings rows, document dispatch, and xterm dispatch resolve through it.
- `TerminalView.open()` is the exact xterm integration point. Attach the custom key handler after terminal construction and before normal user input handling. The official xterm API documents that the handler runs before xterm processing and returns whether xterm should process the event. Return `false` only for an app-handled keydown; return `true` for unmatched, AltGraph, composition, keyup, and rejected events so normal `onData` PTY forwarding remains unchanged.
- The existing document shortcuts (`Ctrl/Cmd+K`, `Ctrl/Cmd+Shift+T`, `Ctrl+PageUp/PageDown`) must be removed. Route document and xterm events through one dispatcher. Avoid double execution by handling only `keydown`, calling `preventDefault()`/`stopPropagation()` once at the integration boundary, and treating `event.repeat` according to CONTEXT.
- Extend `modal()` into a named singleton controller that preserves the original terminal return target across overlay replacement, refocuses an already-open surface, traps Tab, contains overlay navigation, and makes confirmation/editor exclusivity visible to action availability.
- Extract overlay list mechanics (ranking, active index, wrap, Enter selection) enough to test without xterm. Keep DOM rendering in web.

## Recommended Data Contracts

```ts
type WebShortcutActionId =
  | "workspace.switch" | "commands.open" | "workspace.new"
  | "terminal.new" | "terminal.close" | "terminal.previous"
  | "terminal.next" | "attention.next"

type WebShortcutBinding = {
  code: `Key${string}`
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

type WebShortcutSettings = {
  platform: "macos" | "linux"
  revision: string
  bindings: Array<{
    action_id: WebShortcutActionId
    primary: WebShortcutBinding | null
    aliases: WebShortcutBinding[]
  }>
}

type WebShortcutSetRequest = {
  platform: "macos" | "linux"
  expected_revision: string
  action_id: WebShortcutActionId
} & (
  | { intent: "set-primary"; binding: WebShortcutBinding }
  | { intent: "set-aliases"; aliases: WebShortcutBinding[] }
  | { intent: "unbind" }
  | { intent: "reset" }
)
```

The service determines/validates allowed platforms for the connected browser contract; the client must not obtain broader host configuration authority by selecting an arbitrary config object. A successful set returns the complete new effective settings response so the registry updates atomically.

## Test Strategy

### Pure and contract tests

- Core schema/update tests: default derivation, platform maps, unbound `null`, round trip, unknown IDs, malformed physical codes, unsafe modifiers, duplicate conflicts, optimistic concurrency, lease-preserved unrelated config, and atomic failure.
- Protocol/router/projection tests: strict get/set bodies, scope enforcement, path/config/environment non-disclosure, capability unavailable, conflict error, full effective-response replacement, and runtime composition.
- Client shortcut tests: macOS/Linux defaults; exact modifiers; `KeyboardEvent.code` with non-US produced keys; `isComposing`, `Process`, `Dead`, AltGraph, keyup, repeat; match/no-match; and conflict display labels.
- Fuzzy tests: exact/prefix/word-boundary/contiguous/subsequence order, partial Enter top result, workspace field weights, command scoping, recency only after equal score, and stable ties.
- Attention tests: shared workspace successor order, repository/terminal ordering, current-target offset, deterministic wrap, deduplication, repository-only signals, stale/ended surface skip, archived/removed/inaccessible skip, dismissed input exclusion, empty result, and no mutation/dismissal.

### Web integration and browser evidence

- Add a testable web navigation/action module instead of source-string-only assertions. Existing `tests/service/web-presentation.test.ts` and `tests/service/client-architecture.test.ts` may retain architecture checks, but behavioral guarantees need executable imports.
- Add browser/xterm integration coverage that calls the attached preprocessor with representative events and proves: handled chord returns false/dispatches once; unmatched returns true; AltGraph/composition/non-US return true; overlay navigation never reaches PTY; repeated mutations do not run.
- DOM harness coverage should prove one backdrop/handler, same-overlay refocus, cross-overlay replacement without interim terminal focus, focus trap, active-descendant behavior, partial-query Enter, no-result Enter, close restoration, help/settings current bindings, inline conflict, and authoritative save rollback.
- Keep live web UAT for Phase 127: validate real xterm focus, shell/TUI input pass-through, the platform's physical keyboard, toolbar discovery, and visual comparison. Automated Phase 125 completion must not claim that human approval.

## Plan Boundaries and Parallelization

1. **Authority and transport:** core global schema/update module plus protocol/service get/set contract. This is upstream of settings persistence but can execute in parallel with pure client semantics.
2. **Shared navigation semantics:** shortcut normalization/defaults, fuzzy ranking, and attention traversal with exhaustive pure tests. This is independent of service persistence implementation once the action/binding shapes are agreed.
3. **Web action/xterm integration:** canonical action registry, legacy shortcut removal, terminal/attention actions, and xterm preprocessor. Depends on shared semantics; can begin against the agreed shapes while authority work finishes.
4. **Overlay/help/settings UI:** singleton focus controller, switcher/command overlays, help/settings/capture, toolbar controls, CSS, and DOM/browser tests. Depends on authority and shared semantics, then closes with full gates and UI review.

Use isolated worktrees for plans 1 and 2. Merge those foundations before splitting plans 3 and 4, or keep plan 4 dependent on both foundations to avoid parallel edits to `packages/web/src/app.ts` and `app.css`.

## Pitfalls to Avoid

- `localStorage`, IndexedDB, URL state, or another durable browser preference store.
- Projecting all `GlobalConfig` to the browser through `core.state` or `web.snapshot`.
- Letting the router, web client, or a second helper own YAML mutation.
- Matching `event.key` letters or accepting extra modifiers; both break non-US/AltGraph safety.
- Returning `false` for all xterm events, or dispatching on both keydown and keyup.
- Reopening/replacing the same overlay on key repeat and briefly restoring xterm focus.
- Sorting workspace results by recency before fuzzy score.
- Treating a stale terminal surface as repository-level attention; CONTEXT requires it be skipped.
- Adding app actions to the configured-command overlay or shipping browser-hard familiar aliases by default.

## Primary Source

- xterm.js `Terminal.attachCustomKeyEventHandler`: the handler runs before xterm processing and its boolean return decides whether xterm processes the event: https://xtermjs.org/docs/api/terminal/classes/terminal/
