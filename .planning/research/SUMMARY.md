# Project Research Summary

**Project:** git-stacks v0.4.0 — TUI Hardening & Polish
**Domain:** Bun CLI tool with SolidJS/OpenTUI terminal dashboard — test infrastructure, wizard flows, CRUD parity, sync
**Researched:** 2026-03-20
**Confidence:** HIGH

---

## RESOLVED CONTRADICTIONS

Two contradictions between research files have been explicitly resolved here. Requirements and roadmap must not re-litigate these decisions.

### Resolution 1: OpenTUI testRender IS Available

**Contradiction:** PITFALLS.md (Pitfall 1) states "There is no headless or virtual renderer for OpenTUI" and recommends testing only pure logic. STACK.md and ARCHITECTURE.md both independently verified, from installed package type declarations, that `@opentui/solid@0.1.87` exports `testRender` backed by `@opentui/core/testing/`.

**Resolution: Trust STACK.md (HIGH confidence, verified from installed source).**

`testRender` from `@opentui/solid` mounts SolidJS components in a headless `TestRenderer` with no real terminal required. `captureCharFrame()` returns the terminal buffer as a plain string (ANSI-stripped). `mockInput.pressKey/typeText/pressEnter` inject keystrokes directly into the renderer's keyboard pipeline. `renderOnce()` advances the render loop synchronously. Tests run in CI on Linux without a display server.

PITFALLS.md's Pitfall 1 is based on an incorrect assumption that no headless renderer exists. Its recommended testing strategy (pure-function extraction only, no component tests) was the correct fallback given that assumption, but is now superseded. **The three-tier testing model still applies at the architecture level, but Layer 2 (component tests with testRender) is feasible and should be built.**

The "looks done but isn't" checklist item from PITFALLS.md — "Unit tests import cleanly: bun test tests/ passes with zero imports from @opentui/solid or @opentui/core in test files" — is **incorrect** and must not be followed. Tests in `tests/tui/dashboard/` that use `testRender` will import from `@opentui/solid` by design.

### Resolution 2: Create Wizards Must Be Native TUI Components, NOT suspend+resume to @clack/prompts

**Contradiction:** FEATURES.md recommends `renderer.suspend()` + existing `@clack/prompts` wizards as the primary pattern for create flows (Features 3, 4, 5). PITFALLS.md (Pitfall 3) and ARCHITECTURE.md both independently state that `@clack/prompts` and OpenTUI have an unresolvable stdio ownership conflict — `renderer.suspend()` + clack is not reliable for wizard flows, only for $EDITOR launch.

**Resolution: Trust PITFALLS.md + STACK.md + ARCHITECTURE.md consensus over FEATURES.md.**

`@clack/prompts` and OpenTUI both assume exclusive ownership of the terminal (raw mode, cursor visibility, stdin handling). The `renderer.suspend()` + `@clack/prompts` pattern is only reliably usable for $EDITOR launch because editors are well-behaved terminal programs that restore terminal state on exit. `@clack/prompts` does not guarantee this — it calls `process.exit(1)` on cancel, which bypasses cleanup. FEATURES.md's confidence in this approach is misplaced; it confuses the working editor-launch pattern with the unproven clack-wizard-from-TUI pattern.

**The correct approach for all create flows is native TUI wizard components:**

- A new `WizardView.tsx` component manages multi-step state internally (ARCHITECTURE.md's Option C)
- `UIView` gets a `{ view: "wizard"; kind: "create-workspace" | "create-template" | "create-repo" }` variant
- Wizard-specific step/data state lives inside the WizardView component, not in UIView (per PITFALLS.md Pitfall 4)
- `renderer.suspend()` is reserved for: (a) $EDITOR launch only, and (b) `repo scan` as an explicit escape hatch since that flow has a complex directory traversal UI not worth rebuilding

This means the "suspend+resume" recommendations throughout FEATURES.md Features 3, 4, and 5 should be read as "native TUI wizard" for text-entry flows, and "suspend+resume escape hatch" only for `repo scan`.

---

## Executive Summary

git-stacks v0.4.0 closes the gap between what the CLI can do and what the TUI dashboard can do. The v0.3.0 dashboard is a read-and-act interface — users can open, rename, clean, merge, and remove workspaces, but they cannot create anything or sync from base branches without exiting to the CLI. v0.4.0 makes the dashboard fully self-sufficient for daily workspace management. The five deliverables are: workspace sync in the action menu, workspace and template create flows as native TUI wizards, repo management actions in the Repos tab, and a component-level test harness using OpenTUI's first-class headless test renderer.

The recommended implementation approach leverages capabilities that are already fully present in the installed packages. No new dependencies are required. `@opentui/solid@0.1.87` ships `testRender` for headless component testing — confirmed by reading the installed type declarations and implementation, not from documentation. `syncWorkspace()` is already implemented and exported from `workspace-ops.ts`. The wizard pattern extends the existing `UIView` signal-as-state-machine approach: add a `"wizard"` view variant, build `WizardView.tsx` as a self-contained multi-step component, and extend `InlineInput.tsx` with cursor movement before any wizard input uses it. The implementation build order has a clear dependency chain and can be executed phase-by-phase without rework.

The dominant risks are in the wizard layer. Two bugs are guaranteed to occur unless explicitly prevented: (1) `runHooks()` in `lifecycle.ts` uses `stdio: "inherit"` — hook output will corrupt the TUI if `post_create` hooks fire while the TUI is active; a `runHooksCaptured()` variant is a prerequisite for create operations in the TUI. (2) `useWorkspaces.reload()` does not return a `Promise<void>` — the cursor cannot be correctly positioned on the newly created entity without this change. Both are lib-layer changes of low scope but high consequence if missed. Sync has its own risk: `fetchOrigin()` in `git.ts` has no timeout, so a sync on a workspace with an unreachable remote will hang indefinitely; a 30-second per-repo timeout is required before the sync action ships.

---

## Key Findings

### Recommended Stack

The existing stack (Bun, TypeScript, Commander.js, `@opentui/solid`, SolidJS, YAML + Zod, `@clack/prompts`) is unchanged for v0.4.0. No new dependencies are required for any feature in this milestone.

**Core testing additions (no new packages):**

| API | Source | Purpose |
|-----|--------|---------|
| `testRender` | `@opentui/solid` (installed) | Mount SolidJS components in headless renderer |
| `captureCharFrame()` | `@opentui/core/testing` (installed) | Capture rendered output as plain string |
| `mockInput.typeText/pressKey/pressEnter/pressEscape/pressArrow` | `@opentui/core/testing` (installed) | Simulate keyboard input |
| `renderOnce()` | `@opentui/core/testing` (installed) | Advance render loop synchronously before asserting |
| `TestRecorder` | `@opentui/core/testing` (installed) | Record frame sequences for multi-step interaction tests |
| `toMatchSnapshot()` / `toMatchInlineSnapshot()` | `bun:test` built-in | Snapshot assertions on `captureCharFrame()` output |

**Key version notes:** `toMatchInlineSnapshot` requires Bun 1.1.39+; the project runs Bun 1.3.10. The `@opentui/core` native binary (`@opentui/core-linux-x64`) is already installed; test renderer initializes it with `testing: true`, disabling real terminal I/O. `bunfig.toml` already has `preload = ["@opentui/solid/preload"]` — component tests work without additional configuration.

**What not to add:** `node-pty` (native addon, Bun compatibility issues), `@solid-primitives/state-machine` (the view signal union IS the state machine — no external library needed), PTY-based e2e subprocess tests (brittle, slow, superseded by `testRender`).

### Expected Features

**Must have — P1 (core milestone, make TUI fully self-sufficient):**

- Workspace sync in action menu (`s` key) — lowest-effort gap closure; `syncWorkspace()` already complete
- Create workspace from TUI (`n` key in Workspaces tab) — native TUI wizard via `WizardView.tsx`
- Create template from TUI (`n` key in Templates tab) — native TUI wizard, same WizardView pattern
- Repo management actions from Repos tab (Enter opens action menu; add via InlineInput; scan via suspend+resume escape hatch; remove with ConfirmDialog)
- E2E test infrastructure — component-level tests with `testRender`; App integration tests; three-tier test model established
- `InlineInput` cursor movement (left/right arrows, insert at position) — prerequisite for any wizard text field; must ship before WizardView

**Should have — P2 (polish, ship if time allows):**

- TUI screen improvements: help bar fits 80 columns; column widths responsive to terminal width; workspace rows show age (`3d`) not ISO date
- Detail pane info density improvements (tighter padding, more content per screen row)

**Defer to v0.5.0+:**

- Snapshot testing for TUI layouts (brittle maintenance burden — use `toContain()` assertions instead of full-frame equality)
- Adjustable split ratio (no user requests)
- Batch workspace sync from TUI (git-lock-aware concurrency required; CLI `--all` flag is sufficient)
- Strategy selection UI for sync (always default to rebase in TUI)

**Explicit scope boundary for wizard flows:** The TUI create-workspace wizard supports template-based creation only (select template, enter name and branch). Ad-hoc repo selection from the TUI requires a `MultiSelectList` component that does not yet exist. Building it for v0.4.0 is feasible but increases scope significantly; defer ad-hoc mode to the CLI if time is constrained.

### Architecture Approach

The v0.4.0 architecture is an additive extension to the existing `App.tsx` / `UIView` state machine. The `UIView` discriminated union gains one new variant (`"wizard"`). A new `WizardView.tsx` component handles all multi-step create flows with self-contained step/data state. Five existing files get small modifications (types.ts, ActionMenu.tsx, TemplateActionMenu.tsx, App.tsx, and `lifecycle.ts` for the `runHooksCaptured` prerequisite). Five new test files establish the test harness. No new external dependencies.

**Major components:**

1. `WizardView.tsx` (new) — self-contained multi-step create wizard; owns `currentStep` and `collectedValues` signals; `useKeyboard` for Enter/Escape/arrow navigation; calls `onConfirm(values)` or `onCancel()` when done; renders in detail pane when `view().view === "wizard"`
2. `types.ts` (modified) — add `"sync"` to `Action` union; add `{ view: "wizard"; kind: WizardKind }` to `UIView`
3. `App.tsx` (modified) — import `syncWorkspace`; add sync case in `runAction`; add wizard routing; add `n` key binding for workspaces/templates tabs
4. `InlineInput.tsx` (modified) — add left/right cursor movement, insert at position; prerequisite for wizard text fields
5. `lifecycle.ts` (modified) — add `runHooksCaptured()` variant that captures stdout/stderr as callback lines instead of `stdio: "inherit"`; prerequisite for create operations in TUI

**Key architectural patterns to preserve:**

- Bottom-pane view routing: each view variant renders exclusively in the detail pane via `<Show when={view().view === "..."}>`; components own their `useKeyboard`; App.tsx is the single coordinator
- Early-return keyboard guard: `if (v.view === "wizard") return` in App.tsx keyboard handler prevents double-dispatch
- Config isolation in tests: `process.env.HOME` redirect before dynamic import; required for all App integration tests
- No nested `<text>` in OpenTUI JSX: use `<box flexDirection="row"><text>...</text><text>...</text></box>` for inline-styled content
- Full-frame snapshot assertions are an anti-pattern: assert with `captureCharFrame().toContain("expected text")`; not `toBe(entireFrame)`

### Critical Pitfalls

1. **`runHooks()` stdout corruption** — `lifecycle.ts` uses `stdio: "inherit"`; hook output writes directly to terminal while OpenTUI is rendering; TUI visually corrupts. Prevention: add `runHooksCaptured()` before implementing any create operation that may trigger hooks. This is a prerequisite, not a cleanup task.

2. **`@clack/prompts` in TUI context** — calling any `@clack/prompts` function from within the TUI corrupts the terminal, even with `renderer.suspend()`. Prevention: build create wizards as native TUI components (`WizardView.tsx`). The `grep -r "@clack" src/tui/dashboard/` check must return nothing.

3. **`useWorkspaces.reload()` is not async** — cursor cannot be positioned on the new entity after create without awaiting reload. Prevention: change `reload()` to return `Promise<void>`; `await reload()` then set cursor to new entity index before transitioning back to list view.

4. **`fetchOrigin()` has no timeout** — sync on a workspace with an unreachable remote hangs indefinitely. Prevention: add a 30-second `Bun.timeout()` wrapper around `fetchOrigin()` before shipping the sync action.

5. **`InlineInput` has no cursor movement** — users cannot correct mid-string errors in wizard text fields. Prevention: extend `InlineInput` with left/right arrow cursor movement and insert-at-position before WizardView is built; this is a prerequisite for the entire wizard layer.

6. **Wizard steps encoded in `UIView` union** — encoding individual steps as `UIView` variants balloons `App.tsx` and eliminates back-navigation. Prevention: `UIView` gets one `"wizard"` variant; all step state lives inside `WizardView.tsx` as local signals.

---

## Implications for Roadmap

Based on combined research, suggested phase structure (6 phases):

### Phase 1: Test Harness Foundation

**Rationale:** `testRender` is available and verified but no component tests exist yet. Establishing the harness before feature work gives regression coverage for everything that follows. The `process.env.HOME` isolation pattern, JSX pragma requirements, and `renderOnce()` discipline must be demonstrated in working tests before other developers rely on them.

**Delivers:** `tests/tui/dashboard/InlineInput.test.tsx` as the reference test; `tests/tui/dashboard/ActionMenu.test.tsx`; confirmed that `testRender` + `bun:test` + `bunfig.toml` preload works end-to-end; snapshot baseline for existing components.

**Addresses (FEATURES.md):** E2E test infrastructure (P1); establishes three-tier test model

**Avoids (PITFALLS.md):** Full-frame snapshot brittle anti-pattern (use `toContain` not `toBe`); double-rendering from missed `renderOnce()` calls; HOME isolation for App integration tests

**Research flag:** Standard patterns — skip `/gsd:research-phase`. `testRender` API is fully documented in STACK.md. No unknowns.

---

### Phase 2: Prerequisites — InlineInput Cursor + runHooksCaptured

**Rationale:** Two lib-layer changes are prerequisites for the wizard layer. Neither is large in scope, but both are guaranteed to cause hard-to-diagnose bugs if skipped: cursor-less InlineInput breaks usability in any multi-field wizard; `stdio: "inherit"` from hooks corrupts TUI rendering on any create operation that triggers `post_create` hooks. Completing both before wizard work begins eliminates an entire class of implementation bugs.

**Delivers:** `InlineInput.tsx` with left/right cursor movement and insert-at-position; `runHooksCaptured()` variant in `lifecycle.ts` that streams hook output via callback instead of inheriting stdio.

**Addresses (FEATURES.md):** Prerequisite for Features 3, 4, 5 (create flows)

**Avoids (PITFALLS.md):** Pitfall 8 (InlineInput cursor), Pitfall 10 (`runHooks` stdio corruption)

**Research flag:** Standard patterns — skip `/gsd:research-phase`. Both changes are well-scoped; implementation paths are specified in ARCHITECTURE.md and PITFALLS.md.

---

### Phase 3: Workspace Sync Action

**Rationale:** Sync is the lowest-effort P1 feature (4 small file modifications, no new files) and the highest-value gap closure (users who run `git-stacks sync` multiple times per day currently must exit the TUI to do so). Implementing it third gives a complete, testable feature that validates the ProgressView pattern before more complex work.

**Delivers:** `s` key in workspace ActionMenu triggers `syncWorkspace()` with streaming per-repo progress in ProgressView; `fetchOrigin()` timeout at 30 seconds; sync result summary (N synced, N skipped).

**Addresses (FEATURES.md):** Feature 6 (workspace sync); P1 priority

**Avoids (PITFALLS.md):** Pitfall 6 (fetchOrigin timeout), Pitfall 7 (concurrent sync — progress view must block all keys while in-progress)

**Uses (STACK.md):** `syncWorkspace()` already exported from `workspace-ops.ts`; no changes to ops layer

**Research flag:** Standard patterns — skip `/gsd:research-phase`. Sync integration path fully specified in ARCHITECTURE.md.

---

### Phase 4: WizardView + Create Workspace

**Rationale:** `WizardView.tsx` is the largest new component in this milestone. Building it for workspace creation first establishes the full multi-step wizard pattern — step signals, data accumulation, Enter/Escape navigation, `onConfirm`/`onCancel` callbacks — in a context where the requirements are fully known (name + branch + template). Template creation reuses the same component in Phase 5.

**Delivers:** `WizardView.tsx` with text-input and select-from-list step types; `n` key in Workspaces tab opens workspace creation wizard; `WizardView.test.tsx` unit tests for step progression, back-navigation, cancel safety; `reload()` made async with cursor-to-new-entity after create.

**Addresses (FEATURES.md):** Feature 3 (create workspace); P1 priority; template-only mode (ad-hoc repo selection deferred per scope boundary)

**Avoids (PITFALLS.md):** Pitfall 3 (no @clack/prompts in TUI), Pitfall 4 (wizard steps not in UIView), Pitfall 5 (reload cursor update), Pitfall 9 (repo multi-select deferred to CLI)

**Research flag:** Needs `/gsd:research-phase` during planning. WizardView's select-step type for template picking needs a concrete design before implementation. The `reload()` async change has downstream effects on all hooks that call it — scope the change carefully.

---

### Phase 5: Template Create + Repo Management Actions

**Rationale:** Template creation reuses Phase 4's WizardView verbatim — it is purely integration work. Repo management is independent: the Repos tab needs Enter to open an action menu (currently a no-op), InlineInput for path entry, and suspend+resume escape hatch for the scan wizard (the one explicitly sanctioned use of suspend+resume for a non-editor external tool).

**Delivers:** `n` key in Templates tab opens template create wizard via WizardView; Enter on Repos tab opens RepoActionMenu with add/scan/remove actions; InlineInput path entry with `existsSync` indicator; remove with ConfirmDialog showing used-by context; scan via `renderer.suspend()` + `runRepoScan()` + `renderer.resume()`.

**Addresses (FEATURES.md):** Feature 5 (template create); Feature 4 (repo management); P1 priority

**Avoids (PITFALLS.md):** Pitfall 5 (reload cursor after create); filesystem browser anti-pattern (InlineInput not a directory picker)

**Research flag:** Standard patterns for template create. Repo scan (suspend+resume) is the one explicitly allowed exception to the no-clack-in-TUI rule — document this clearly in the code to prevent future confusion.

---

### Phase 6: App Integration Tests + Screen Improvements

**Rationale:** Once all features are implemented, App-level integration tests can exercise complete key sequences against real (isolated) state. Screen improvements are cosmetic P2 work that benefit from a clean test baseline — verifying nothing breaks at 80 columns is easier when tests already exercise the rendering path.

**Delivers:** `App.integration.test.tsx` covering tab switching, action menu dispatch, wizard entry/completion/cancel, sync progress; help bar fits 80 columns; column widths responsive to terminal width; workspace rows show age not ISO date; responsive column truncation in WorkspaceRow and TemplateList.

**Addresses (FEATURES.md):** E2E test infrastructure (integration layer); TUI screen improvements (P2)

**Avoids (PITFALLS.md):** Full-frame snapshot assertion anti-pattern; PTY test brittleness (all tests use `testRender`, none use PTY)

**Research flag:** Standard patterns — skip `/gsd:research-phase`. App integration tests follow the pattern documented in ARCHITECTURE.md. Screen improvements are purely cosmetic with no architectural decisions.

---

### Phase Ordering Rationale

- Phase 1 before all others: tests written in Phase 1 catch regressions in all later phases; no point writing features then retrofitting a test harness
- Phase 2 before Phases 3-5: both prerequisites (`InlineInput` cursor, `runHooksCaptured`) are required by multiple later phases; fixing them once early is cheaper than discovering the gaps mid-implementation
- Phase 3 (sync) before Phase 4 (wizard): sync is fully independent and low-risk; completing it validates ProgressView integration before the more complex wizard layer is added
- Phases 4 and 5 are sequenced by complexity: WizardView must exist before template/repo flows can reuse it
- Phase 6 last: integration tests can only be meaningful once all features are wired; screen improvements are polish that belong at the end

### Research Flags

Phases needing `/gsd:research-phase` during planning:

- **Phase 4** — WizardView select-step design for template picker needs to be specified before implementation; `reload()` async change requires impact analysis across all hooks

Phases with standard patterns (skip research):

- **Phase 1** — `testRender` API is fully documented in STACK.md; no unknowns
- **Phase 2** — both prerequisite changes are small and fully specified
- **Phase 3** — sync integration path fully documented in ARCHITECTURE.md
- **Phase 5** — reuses Phase 4 patterns; suspend+resume for scan is the one documented exception
- **Phase 6** — follows patterns from ARCHITECTURE.md and Phase 1 harness

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All testing API claims verified from installed package type declarations (`node_modules/@opentui/core/testing.d.ts`, `node_modules/@opentui/solid/index.d.ts`). No external dependency on unverified docs. |
| Features | HIGH | Based on direct codebase analysis. Feature scope is internal (no external APIs to research). The wizard approach conflict (FEATURES.md vs. consensus) is resolved above. |
| Architecture | HIGH | All component boundaries verified against live source. Build order is dependency-driven and explicit. The `testRender` → `renderOnce()` → `captureCharFrame()` test loop was verified from compiled implementation (`testing.js`). |
| Pitfalls | HIGH (with correction) | Pitfall 1 (no headless renderer) is incorrect and resolved. All other pitfalls are derived from direct codebase analysis with specific file/line evidence. Critical pitfalls (hook stdio, fetchOrigin timeout, reload async) are concrete and actionable. |

**Overall confidence:** HIGH

### Gaps to Address

- **WizardView select-step implementation detail:** ARCHITECTURE.md specifies the shape (`{ type: "select"; field; label; options }`) but not the exact rendering approach for the option list. Options: extend `ActionMenu` with dynamic items, or use the `<select>` JSX element backed by OpenTUI's `SelectRenderable`. This is a design decision for Phase 4 planning, not a research gap.

- **`reload()` async change scope:** Making `useWorkspaces.reload()` return `Promise<void>` may affect other callers. Phase 4 planning should audit all call sites before making the change.

- **Wizard scope for repo selection:** Whether to build a `MultiSelectList` for ad-hoc workspace creation (full TUI, no CLI exit) or defer ad-hoc mode to the CLI is a product decision. The research recommends deferring; requirements must make this explicit to avoid scope creep during Phase 4 implementation.

- **Suspend+resume for `repo scan`:** The scan flow is the one sanctioned use of `renderer.suspend()` for a non-editor external tool. This exception should be documented in the codebase (a comment in App.tsx) to prevent future developers from using it as a precedent for other wizard flows.

---

## Sources

### Primary (HIGH confidence — verified from installed source)

- `node_modules/@opentui/core/testing.d.ts` — full testing export list
- `node_modules/@opentui/core/testing/test-renderer.d.ts` — `createTestRenderer`, `TestRenderer`, `MockInput` types
- `node_modules/@opentui/core/testing/mock-keys.d.ts` — `createMockKeys`, `KeyCodes`, `pressKey`, `typeText`, `pressArrow` signatures
- `node_modules/@opentui/core/testing/test-recorder.d.ts` — `TestRecorder`, `RecordedFrame` types
- `node_modules/@opentui/core/testing/manual-clock.d.ts` — `ManualClock` type
- `node_modules/@opentui/solid/index.d.ts` — `testRender` signature
- `node_modules/@opentui/core/testing.js` — `createTestRenderer` implementation confirming mock stdin, `testing: true` flag, ANSI-stripped `captureCharFrame`
- `src/tui/dashboard/App.tsx` — UIView state machine, keyboard dispatch, action routing, suspend/resume pattern
- `src/tui/dashboard/ActionMenu.tsx` — action list and keyboard handler
- `src/tui/dashboard/InlineInput.tsx` — current capabilities and limitations
- `src/tui/dashboard/types.ts` — UIView, Action, Tab types
- `src/lib/workspace-ops.ts` — `syncWorkspace()` signature and return type
- `src/lib/lifecycle.ts` — `runHooks()` with `stdio: "inherit"` (the hook stdio problem)
- `src/lib/git.ts` — `fetchOrigin()` without timeout
- `src/tui/dashboard/hooks/useWorkspaces.ts` — reload pattern, async status fetch
- `tests/lib/workspace-ops.test.ts` — process.env.HOME isolation pattern
- `tests/tui/messageUtils.test.ts` — existing pure-function TUI test pattern
- `.planning/PROJECT.md` — v0.4.0 milestone scope

### Secondary (MEDIUM confidence)

- OpenTUI testing guide: https://deepwiki.com/sst/opentui/6.1-getting-started — independently confirms testRender API surface
- Bun test runner docs: https://bun.sh/docs/test — `toMatchSnapshot`, `toMatchInlineSnapshot` confirmed
- Bun `toMatchInlineSnapshot` shipped in Bun v1.1.39: https://github.com/oven-sh/bun/issues/3623

### Tertiary (supporting context)

- `node-pty` Bun compatibility issue: https://github.com/microsoft/node-pty/issues/632 — confirmed native addon problems; supports rejection of PTY approach
- Project memory: `feedback_opentui_no_nested_text.md` — OpenTUI crashes on nested `<text>` elements

---

*Research completed: 2026-03-20*
*Ready for roadmap: yes*
