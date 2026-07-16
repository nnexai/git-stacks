# Phase 125: Terminal-Safe Keyboard Navigation - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver one collision-aware web action and shortcut system that remains available while xterm owns focus. Add active workspace/repository and configured-command fuzzy overlays, terminal navigation, Next Attention, rebind/unbind controls, and keyboard help. Keep the browser thin: navigation uses projected service state and mutations continue through existing service actions. This phase does not add the broader Phase 126 web-parity action set or browser-local domain authority.

</domain>

<decisions>
## Implementation Decisions

### Shortcut Registry and Matching
- Use one canonical action registry for visible controls, help, shortcut dispatch, and availability. Each entry has a stable action ID, label, category, default binding, current binding, availability/disabled reason, and a single execution callback.
- Ship the locked safe defaults: macOS `Ctrl+Cmd+K/P/N/T/W/J/L/A`; Linux `Ctrl+Alt+Shift+K/P/N/T/W/J/L/A`. The actions are workspace switcher, configured commands, new workspace, new terminal, close terminal, previous terminal, next terminal, and Next Attention respectively.
- Match letter actions by normalized physical `KeyboardEvent.code`, not produced glyph, and require the exact registered modifier set. Do not dispatch during IME composition, from composing events, or when AltGraph is active. Unmatched and rejected events pass through unchanged.
- Ignore `event.repeat` for actions that create, close, or move state. Repeated overlay shortcuts focus the existing overlay and never create another DOM layer.
- Rebinding is an explicit capture flow. Conflicting active bindings are rejected atomically with the other action named; every action can be unbound and reset to its platform default. Optional `Ctrl+K` and `Ctrl+Shift+P` aliases begin unbound.
- Persist rebind/unbind overrides in authoritative global configuration exposed through typed service operations and projection; do not use `localStorage` or other durable browser state. Bindings must not become workspace YAML or identity. Cross-machine import/export or synchronization stays out of scope.

### Overlays, Fuzzy Search, and Focus
- Keep exactly one modal/overlay controller. Invoking an already-open workspace, commands, help, or shortcut-settings surface focuses its search/control; invoking another replaces the existing surface without stacking backdrops or document handlers.
- While any confirmation, editor, or binding-capture modal is active, unrelated global actions are unavailable; only that surface's contained navigation, confirmation, cancellation, and explicitly allowed shortcut actions may run.
- Workspace switching searches only projected active workspaces and repositories. Each selectable row is a workspace/repository pair. Workspace name receives the strongest fuzzy weight, repository and branch text remain searchable, and recency is only a stable tie-breaker after match quality.
- Configured commands remain scoped to the selected active workspace/repository and use the same fuzzy scorer, active-row behavior, and top-partial-match Enter contract. The overlay must not become a generic application command palette.
- Both searchable overlays maintain one active result, contain ArrowUp/ArrowDown/Home/End/Enter/Escape and Tab focus, and select the highest-ranked row on Enter even for a partial query. Empty queries show deterministic default ordering.
- Opening an overlay records the active terminal as the focus return target. Closing or completing it restores that terminal when still available; otherwise it focuses the currently active terminal or a safe application control. Palette navigation and closing keys are consumed and never emitted to the PTY.

### Terminal Actions
- New Terminal creates a service-owned shell terminal for the selected active workspace/repository. If there is no active pair, show a clear non-mutating result and do not open an empty terminal.
- Close Terminal closes the active service-owned terminal through the existing terminal close path. If no terminal is active, report that result without changing selection.
- Previous/Next Terminal traverse only the visible terminal tabs for the selected workspace/repository, following the established tab order and wrapping deterministically. Ended tabs remain navigable until explicitly closed; closing selects the next remaining visible tab by that same order.
- Shortcut actions always reuse the same action callbacks as pointer controls. They must not introduce second implementations of terminal creation, closure, selection, or workspace creation.

### Next Attention and Discoverability
- Build candidates from current non-dismissed projected `needs-attention` signals only. Resolve each candidate to an active workspace and repository, plus its terminal when the referenced surface still exists. Skip archived/removed workspaces, inaccessible repositories, and stale terminal surfaces without dismissing any signal.
- Traverse candidates in the shared workspace successor order, repository name/stable-ID order, and terminal tab order; signal severity/recency chooses a representative only when multiple signals resolve to the same target. Start after the current workspace/repository/terminal candidate, wrap once, and select the next resolvable target deterministically.
- A valid workspace/repository signal without a live terminal selects the repository. A signal that names a stale surface is skipped rather than downgraded to a different target.
- Next Attention appears as a visible toolbar action, in keyboard help, and in shortcut settings. With no candidate, leave focus and selection unchanged and show `No workspace needs attention.`
- Keyboard help shows current effective bindings grouped by navigation, workspace, and terminal actions, including unbound status. Shortcut settings are reachable from help and present conflicts inline without silently replacing another action.

### the agent's Discretion
- Exact fuzzy scoring constants, CSS details, icons, transition timing, and the specific browser preference persistence adapter are flexible within existing architecture and visual conventions.
- Exact toolbar placement may adapt responsively, provided Next Attention and Keyboard Shortcuts remain visibly discoverable without opening a generic palette.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/web/src/app.ts` owns the current imperative web UI, `TerminalView`, selected pair/terminal state, configured-command launcher, singleton `modal()` seam, and terminal/service action callbacks.
- `TerminalView.open()` creates xterm and is the narrow integration point for `attachCustomKeyEventHandler` before normal `onData` PTY forwarding.
- `modal()` already replaces the prior backdrop and restores prior focus; extend it into a focus-contained singleton controller rather than layering a second overlay system.
- `visibleTerminals()`, `selectPair()`, `selectTerminal()`, `createTerminal()`, and `TerminalView.close()` already provide the authoritative terminal/navigation callbacks the action registry should call.
- `@git-stacks/client` exports `workspacePriorityOrder`, `matchesSignalScope`, and `signalGroup`; these are the shared ordering and attention classification seams.

### Established Patterns
- Web is an imperative, package-built browser client using existing CSS classes and native controls; no component registry or external design system is present.
- Browser actions operate on typed service projections and service mutations. Client code owns rendering/navigation only and must not inspect Git, files, raw environment, or workspace YAML.
- Existing browser preferences already hold pins, recent commands, tab order, theme, organization, and last selection in memory only. Durable shortcut overrides require a typed global-config service seam rather than expanding browser authority.
- The signal inbox already resolves a signal to workspace, repository, and terminal surface and explains a missing terminal; Next Attention should share that resolution policy while applying its stricter stale-surface skip rule.

### Integration Points
- Extract testable shortcut normalization, conflict validation, fuzzy scoring, action availability, and attention-candidate ordering from the DOM wiring. Shared, client-independent ranking/navigation logic belongs in `@git-stacks/client`; configuration mutation remains service/core-owned.
- Route both document-level and xterm pre-processing key events through the same dispatcher, with a handled/unhandled result that directly controls PTY pass-through.
- Replace the current broad `Ctrl/Cmd+K`, `Ctrl/Cmd+Shift+T`, and `Ctrl+PageUp/PageDown` document shortcuts with registry defaults so browser-hard and shell/TUI collisions are not shipped.
- Extend the current modal and launcher rendering for active-result semantics, focus containment, workspace switching, help, and binding capture.

</code_context>

<specifics>
## Specific Ideas

- Safe platform chords remain the baseline even though the project vision mentions familiar `Ctrl+K` and `Ctrl+Shift+P`; those familiar chords are opt-in aliases only.
- Enter must run or switch to the real top fuzzy result for partial input, not require an exact match and not fall back to substring-only filtering.
- No shortcut feature may depend on fullscreen Keyboard Lock.

</specifics>

<deferred>
## Deferred Ideas

- Fullscreen Keyboard Lock and browser-reserved shortcut capture.
- Cross-machine shortcut preference import, export, or synchronization.
- A generic application command palette.
- Phase 126 lifecycle/Git/notes/forge-source parity actions beyond routing existing Phase 125 callbacks through the registry.

</deferred>
