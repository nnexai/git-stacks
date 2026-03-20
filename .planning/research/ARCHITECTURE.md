# Architecture Research

**Domain:** TUI dashboard e2e testing, wizard create flows, and sync integration — v0.4.0 milestone
**Researched:** 2026-03-20
**Confidence:** HIGH for integration points and component boundaries (verified against live source); HIGH for OpenTUI testing API (verified against installed node_modules type declarations); MEDIUM for wizard flow UX patterns (based on existing codebase patterns + tradeoff analysis)

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  CLI Entry  src/index.ts                                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │ Commands (src/commands/)                                               │   │
│  │ workspace.ts | template.ts | repo.ts | doctor.ts | config.ts           │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│  TUI Dashboard  src/tui/dashboard/                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │  run.tsx — mounts App, opens Unix socket                              │    │
│  │                                                                        │    │
│  │  App.tsx — tab state, keyboard dispatch, view routing                  │    │
│  │  ┌──────────────────────────────────────────────────────────────┐     │    │
│  │  │ UIView state machine                                          │     │    │
│  │  │  "list" | "action-menu" | "confirm" | "progress"             │     │    │
│  │  │  "inline-input" | "messages" | [NEW: "wizard"]               │     │    │
│  │  └──────────────────────────────────────────────────────────────┘     │    │
│  │                                                                        │    │
│  │  List pane (top box)          Detail pane (bottom box)                 │    │
│  │  WorkspaceList.tsx            WorkspaceDetail.tsx                      │    │
│  │  TemplateList.tsx             TemplateDetail.tsx / ActionMenus         │    │
│  │  RepoList.tsx                 RepoDetail.tsx                           │    │
│  │                               ConfirmDialog.tsx                        │    │
│  │                               InlineInput.tsx                          │    │
│  │                               ProgressView.tsx                         │    │
│  │                               [NEW: WizardView.tsx]                    │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│  Hooks  src/tui/dashboard/hooks/                                              │
│  useWorkspaces | useTemplates | useRepos | useMessages                        │
│                                                                               │
│  Ops Layer  src/lib/workspace-ops.ts                                          │
│  openWorkspace | cleanWorkspace | removeWorkspace | mergeWorkspace            │
│  renameWorkspace | syncWorkspace | getWorkspaceListInfo                       │
│                                                                               │
│  Config Layer  src/lib/config.ts                                              │
│  YAML read/write, Zod validation, listWorkspaces, listTemplates               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `run.tsx` | Mount App, manage Unix socket lifecycle | Existing — no changes needed for v0.4.0 features |
| `App.tsx` | UIView state machine, keyboard dispatch, tab routing | Existing — needs `sync` added to `Action`, wizard view added to `UIView`, `syncWorkspace` import added |
| `ActionMenu.tsx` | Keyboard-driven menu for workspace actions | Existing — add `[s] Sync` entry |
| `TemplateActionMenu.tsx` | Keyboard-driven menu for template actions | Existing — add `[n] New` entry |
| `InlineInput.tsx` | Single-field inline text entry | Existing — reuse as-is for simple prompts |
| `ConfirmDialog.tsx` | y/n confirmation | Existing — no changes needed |
| `ProgressView.tsx` | Streaming progress lines | Existing — reuse for sync progress |
| `types.ts` | UIView union, Action union, Tab type | Existing — add `"sync"` to Action, add `"wizard"` view shape |
| `WizardView.tsx` | Multi-step TUI wizard — NEW | New file |
| `hooks/useWorkspaces.ts` | Workspace list + status fetching | Existing — no changes needed |
| `hooks/useTemplates.ts` | Template list | Existing — no changes needed |
| `hooks/useRepos.ts` | Repo registry list | Existing — no changes needed |

---

## Question 1: E2E Test Architecture

### What OpenTUI Provides

OpenTUI ships first-class test infrastructure in `@opentui/core/testing/` and re-exports from `@opentui/solid`:

- `testRender(component, config?)` — mounts a SolidJS component into a headless `TestRenderer` (no real terminal), returns `{ renderer, mockInput, mockMouse, renderOnce, captureCharFrame, captureSpans, resize }`
- `mockInput.pressKey(key)` — inject a keypress into the renderer's keyboard pipeline
- `mockInput.typeText(text)` — inject a sequence of character keypresses
- `mockInput.pressKeys([...], delayMs?)` — sequence of keys with optional delay
- `mockInput.pressEnter()` / `pressEscape()` / `pressArrow(dir)` — named shorthand keys
- `captureCharFrame()` — snapshot the current terminal buffer as a string
- `captureSpans()` — structured span capture with fg/bg/text for precise assertions
- `resize(w, h)` — simulate terminal resize
- `TestRecorder` — hooks into the render pipeline to record frames for playback
- `ManualClock` — controllable clock for testing timeouts without `sleep`

This is an **in-process, headless test renderer**. No PTY, no subprocess, no real terminal needed.

### Recommended First-Pass Test Architecture

**Use `testRender` from `@opentui/solid` directly in bun:test.** This is the correct first pass.

```
tests/
  tui/
    messageUtils.test.ts    (already exists — pure function unit tests, no renderer)
    dashboard/
      InlineInput.test.tsx  (NEW — component unit test)
      ActionMenu.test.tsx   (NEW — component unit test)
      WizardView.test.tsx   (NEW — wizard step progression)
      App.integration.test.tsx (NEW — integration: key sequences drive state changes)
```

**Three layers, in order of build priority:**

**Layer 1 — Pure function unit tests** (already established pattern)
Test `messageUtils.ts`, `formatAge`, etc. No renderer. Use bun:test directly. Already working in `tests/tui/messageUtils.test.ts`.

**Layer 2 — Component unit tests with `testRender`**
Mount a single component (e.g. `InlineInput`, `ActionMenu`) with controlled props, inject keypresses, assert `captureCharFrame()` contains expected text. Filesystem-isolated (no real config reads).

```typescript
// tests/tui/dashboard/InlineInput.test.tsx
import { testRender } from "@opentui/solid"
import { InlineInput } from "../../../src/tui/dashboard/InlineInput"
import { describe, test, expect } from "bun:test"

test("InlineInput renders prefill and accepts input", async () => {
  let confirmed = ""
  const { mockInput, renderOnce, captureCharFrame } = await testRender(() => (
    <InlineInput label="Name" prefill="foo" onConfirm={(v) => { confirmed = v }} onCancel={() => {}} />
  ))
  await renderOnce()
  expect(captureCharFrame()).toContain("foo")
  mockInput.pressKey("b")
  await renderOnce()
  expect(captureCharFrame()).toContain("foob")
  mockInput.pressEnter()
  expect(confirmed).toBe("foob")
})
```

**Layer 3 — App-level integration tests with mocked ops**
Mount `App` (or a test harness wrapping it) with filesystem isolation. Mock or stub `workspace-ops.ts` functions. Drive key sequences and assert view state changes. These tests validate that pressing `Enter` opens the action menu, pressing `s` triggers sync, etc.

The key challenge is that `App.tsx` imports live config readers (`listWorkspaces`, `listTemplates`, `listRegistry`) directly inside hooks. The existing pattern in `tests/lib/workspace-ops.test.ts` sets `process.env.HOME` before dynamic import to redirect config reads. The same pattern must be used for App integration tests.

### Why Not PTY-Based Subprocess Tests

PTY tests (spawn `git-stacks manage` in a pty, send keystrokes via node-pty or expect) are expensive: slow startup (~500ms), flaky timing, hard to assert partial frames, no type safety, no access to internal state. The OpenTUI `testRender` approach is in-process, fast, and deterministic. PTY tests are appropriate only if testing the actual terminal rendering pipeline (ANSI escape codes, alternate screen) which is OpenTUI's concern, not git-stacks's.

### Why Not Visual Snapshot Tests

Snapshot tests against `captureCharFrame()` string output are brittle — any layout change breaks them, even cosmetic ones. Use `captureCharFrame().toContain("expected text")` assertions instead of full-frame equality. Reserve `TestRecorder` frame capture only for regression tests on specific rendering bugs.

### Configuration for JSX in Test Files

The `/** @jsxImportSource @opentui/solid */` pragma must be at the top of any test file that uses JSX. The existing `tsconfig.json` likely needs `"jsx": "preserve"` or similar for Bun to handle `.tsx` test files. Verify the existing `bunfig.toml` handles `.tsx` transforms in the test runner.

---

## Question 2: Wizard Flows for Create Operations

### The Three Options

**Option A: Subprocess @clack/prompts wizards** — suspend the TUI renderer (`renderer.suspend()`), exec the existing CLI wizard as a subprocess, resume on return.

- Pros: zero new TUI code, reuses all existing validation logic
- Cons: jarring UX (TUI disappears, clack prompts appear, TUI returns), duplicate code paths, wizard output/errors are not surfaced in the TUI, no shared state between TUI and wizard, cannot integrate with TUI's progress/error display

**Option B: Inline multi-field TUI forms using InlineInput pattern** — chain multiple `InlineInput` steps, each as a separate `UIView` state.

- Pros: stays entirely in TUI, consistent with existing rename/clone patterns, no new component architecture
- Cons: InlineInput is one field at a time. Multi-field flows (workspace new needs name + branch + template selection) require managing step state in App.tsx or an ad-hoc state object, no selection widgets for multi-select (template picker, repo picker)

**Option C: Full-screen overlay wizard** — a new `WizardView.tsx` component that manages its own multi-step state, renders in the detail pane (bottom box), handles its own keyboard routing.

- Pros: self-contained component, clean separation from App state, can handle multi-field and selection steps, follows the MessageOverlay/HelpOverlay full-screen pattern already established
- Cons: new component to build, needs a "select from list" sub-widget for template/repo picking

### Recommendation: Option C (WizardView) for New Creates, Option A (subprocess) as Escape Hatch

Use `WizardView.tsx` for the create flows, displayed in the detail pane (bottom box) when view state is `"wizard"`. For v0.4.0 first pass, this is the right call because:

1. The existing codebase has a clear pattern: components own their own `useKeyboard` handler and receive callbacks (`onConfirm`, `onCancel`). WizardView follows this exactly.
2. Create workspace requires 3+ fields (name, branch, template selection). InlineInput chaining would scatter that logic across App.tsx's `handleInlineInputConfirm`.
3. ProgressView is already available to show post-create progress. WizardView collects inputs, App.tsx calls `createWorkspace` (CLI wrapper or direct ops layer call), then transitions to ProgressView.
4. The `renderer.suspend()` + subprocess pattern already works for `launchEditor` in App.tsx — use it as a fallback for anything too complex to build in-TUI for v0.4.0, but do not use it as the primary path.

**What WizardView needs to support:**

```typescript
// src/tui/dashboard/WizardView.tsx
type WizardStep =
  | { type: "text"; field: string; label: string; validate?: (v: string) => string | undefined }
  | { type: "select"; field: string; label: string; options: { value: string; label: string }[] }

type WizardProps = {
  title: string
  steps: WizardStep[]
  onConfirm: (values: Record<string, string>) => void
  onCancel: () => void
}
```

WizardView manages `currentStep` and `collectedValues` internally. Each step renders a prompt + current value. Navigation: Enter to advance, Escape to go back (or cancel on step 0). The `select` step type handles arrow navigation through options.

**Important constraint:** OpenTUI's known pitfall — no nested `<text>` elements. WizardView must use `<box flexDirection="row"><text>...</text><text>...</text></box>` for any inline-styled content.

### Template Select Widget

For template/repo selection inside a wizard step, a simple vertically-navigable list (like TemplateList but embedded) is sufficient. This is a `select` step type: arrow up/down moves cursor, Enter confirms. No multi-select needed for the create workspace wizard (single template).

### Subprocess Escape Hatch (repo add/scan)

Repo scan (`git-stacks repo scan`) involves directory traversal output and is inherently complex. For v0.4.0, use `renderer.suspend()` + `Bun.spawn` to call the existing `repo scan` CLI, then `renderer.resume()` + `reloadRepos()`. This is the same pattern as `launchEditor` in App.tsx. It is acceptable here because repo scan is an infrequent, non-critical flow.

---

## Question 3: Workspace Sync Integration

### Current State

`syncWorkspace(name, opts, onProgress)` exists in `src/lib/workspace-ops.ts` at line 677. It:
- Accepts `name`, `{ strategy?: "rebase" | "merge", bestEffort?: boolean }`, and a progress callback
- Returns `SyncResult = { ok, synced, skipped, error? }`
- Runs fetch, conflict check, then rebase or merge per repo
- Streams progress via `onProgress` callbacks

### Integration Work Required

**1. Add `"sync"` to the `Action` union in `types.ts`**

```typescript
export type Action = "open" | "edit" | "rename" | "clean" | "remove" | "merge" | "sync"
```

**2. Add sync entry to ActionMenu.tsx**

```typescript
{ key: "s", action: "sync", label: "Sync (rebase)" },
```

Note: `"s"` is currently unbound in ActionMenu. Verify no conflict with batch selection key `"s"` (which only applies in list view, not action-menu view — the keyboard guards in App.tsx already prevent this).

**3. Wire sync in App.tsx `runAction`**

Sync does not need a confirmation dialog (it is non-destructive and reversible). It goes directly to progress view, same as `open`:

```typescript
if (action === "sync") {
  setProgressLines([])
  setProgressDone(false)
  setView({ view: "progress", message: `Syncing ${name}...` })
  const result = await syncWorkspace(name, {}, (msg) =>
    setProgressLines((prev) => [...prev, msg])
  )
  if (!result.ok) {
    setProgressLines((prev) => [...prev, `ERROR: ${result.error}`])
    if (result.skipped.length > 0) {
      result.skipped.forEach(s => setProgressLines(prev => [...prev, `  skipped ${s.repo}: ${s.reason}`]))
    }
  } else {
    result.synced.forEach(s => setProgressLines(prev => [...prev, `  synced ${s.repo} (+${s.commits})`]))
  }
  setProgressDone(true)
  return
}
```

**4. Import `syncWorkspace` in App.tsx**

```typescript
import {
  cleanWorkspace, removeWorkspace, mergeWorkspace, openWorkspace,
  editWorkspaceYaml, renameWorkspace, syncWorkspace  // add syncWorkspace
} from "../../lib/workspace-ops"
```

**5. No strategy selection UI needed for v0.4.0**

Default to `{ strategy: "rebase" }`. A future enhancement could add a select step in a wizard. The `bestEffort` flag is not needed in the first pass — let the user see conflict errors and resolve manually.

### Total sync integration: 4 file changes, no new files

---

## Question 4: New Files vs Modified Files

### New Files

| File | What It Is | Why New |
|------|-----------|---------|
| `src/tui/dashboard/WizardView.tsx` | Multi-step create wizard component | Handles workspace new, workspace clone, template new. Self-contained step state. |
| `tests/tui/dashboard/InlineInput.test.tsx` | Component unit test | First test using `testRender` — establishes the test harness pattern |
| `tests/tui/dashboard/ActionMenu.test.tsx` | Component unit test | Verifies key bindings dispatch correct actions |
| `tests/tui/dashboard/WizardView.test.tsx` | Wizard step progression tests | Validates multi-step navigation, field collection, cancel |
| `tests/tui/dashboard/App.integration.test.tsx` | App-level integration tests | Key sequences → view state assertions, mocked ops layer |

### Modified Files

| File | Change | Scope |
|------|--------|-------|
| `src/tui/dashboard/types.ts` | Add `"sync"` to `Action`, add `{ view: "wizard"; purpose: WizardPurpose }` to `UIView` | Small — 2-3 lines |
| `src/tui/dashboard/ActionMenu.tsx` | Add `{ key: "s", action: "sync", label: "Sync (rebase)" }` to actions array | 1 line |
| `src/tui/dashboard/TemplateActionMenu.tsx` | Add `[n] New` entry and keyboard handler | ~5 lines |
| `src/tui/dashboard/App.tsx` | Import `syncWorkspace`, add sync case in `runAction`, add wizard view in `UIView` routing, add create-workspace keyboard trigger | Medium — ~50 lines |
| `src/lib/workspace-ops.ts` | No changes for sync — it is already complete | No changes |

---

## Data Flow

### Sync Action Flow

```
User presses Enter on workspace row
  → view = { view: "action-menu", index }
  → ActionMenu renders with [s] Sync visible
  → User presses "s"
  → runAction("sync", index) in App.tsx
  → view = { view: "progress", message: "Syncing..." }
  → syncWorkspace(name, {}, onProgress) called
  → onProgress callbacks → setProgressLines(prev => [...prev, msg])
  → SolidJS reactivity → ProgressView re-renders each line
  → syncWorkspace resolves → setProgressDone(true)
  → User presses any key → reload() → view = { view: "list" }
```

### Wizard Create Flow (workspace new)

```
User presses "n" on workspaces tab (list view, no selection)
  → view = { view: "wizard", purpose: "new-workspace" }
  → WizardView renders with steps: [name, branch, template-select]
  → User navigates steps, Enter advances, Esc backs up
  → WizardView.onConfirm({ name, branch, template }) fires
  → App.tsx calls createWorkspace (via CLI spawn or ops layer)
  → view = { view: "progress", message: "Creating..." }
  → On complete: reload() → view = { view: "list" }
```

### Test Data Flow (testRender)

```
bun test
  → testRender(<InlineInput ...props />)
  → Creates headless TestRenderer (no real tty, no stdin/stdout)
  → mockInput.pressKey("a")
  → Key injected directly into renderer's keyboard event pipeline
  → SolidJS reactive update fires
  → renderOnce() — forces a synchronous render pass
  → captureCharFrame() returns terminal buffer as string
  → expect(frame).toContain("a_")  ← asserts rendered text
```

---

## Architectural Patterns

### Pattern 1: Bottom-Pane View Routing

**What:** App.tsx holds a `UIView` signal. Each view variant renders exclusively in the detail pane (bottom box) via `<Show when={view().view === "...">`. Components own their own `useKeyboard` handler; App.tsx passes `onAction`/`onConfirm`/`onCancel` callbacks.

**When to use:** All interactive overlays and forms that replace the detail pane. Applies to action menus, confirm dialogs, inline inputs, progress views, wizard views.

**Trade-offs:** Clean separation — components are unaware of each other. App.tsx is the single coordinator. Risk: App.tsx grows large with many view cases. Mitigate by keeping each view's logic in its component.

### Pattern 2: InlineInput for Single-Field Prompts

**What:** `InlineInput.tsx` is a 25-line component. One field, one label, prefill, Enter/Escape callbacks. Used for rename (existing) and clone-template (existing).

**When to use:** Single-field prompts only. Rename, clone-with-name, any prompt that is one string input.

**Do not use for:** Multi-field create flows. Use WizardView instead.

### Pattern 3: ProgressView for Async Ops with Streaming Output

**What:** `ProgressView.tsx` receives `lines[]` and `done` props. App.tsx pushes lines via `setProgressLines`. Any key while `done === true` clears the view and reloads.

**When to use:** All async operations that call `workspace-ops.ts` functions. open, clean, remove, merge, rename, sync — all feed into ProgressView.

**Trade-offs:** Simple and consistent. Cannot scroll long outputs (if a sync touches 20 repos, the oldest lines scroll off). Acceptable for v0.4.0.

### Pattern 4: Config Isolation in Tests via process.env.HOME Redirect

**What:** `workspace-ops.test.ts` uses `process.env.HOME = tmpDir` before dynamically importing config functions to ensure all YAML reads/writes go to a temp directory, not the developer's real config.

**When to use:** Any test that touches `src/lib/config.ts`, `src/lib/workspace-ops.ts`, or any dashboard hook that calls these. Essential for App integration tests.

**Example:**
```typescript
const tmpHome = makeTmpDir("test-app")
process.env.HOME = tmpHome
// write fixture configs into tmpHome/.config/git-stacks/
const { default: App } = await import("../../../src/tui/dashboard/App")
const { testRender } = await import("@opentui/solid")
// ... test ...
process.env.HOME = originalHome
```

---

## Anti-Patterns

### Anti-Pattern 1: Subprocess Wizards as Primary TUI Interaction Path

**What people do:** Call `renderer.suspend()` and spawn the @clack/prompts wizard as a subprocess for create flows inside the TUI.

**Why it's wrong:** The TUI disappears during the wizard. The wizard has no access to TUI state. Error output from the subprocess is not surfaced in the TUI's ProgressView. This is appropriate only for `$EDITOR` launch (external tool, user expects the handoff) and as a one-time escape hatch for operationally complex flows like `repo scan`.

**Do this instead:** Build WizardView for create flows. Reserve subprocess pattern only for editor launch and `repo scan`.

### Anti-Pattern 2: Nested `<text>` in OpenTUI Components

**What people do:** Write `<text><text fg="red">error:</text> message</text>`.

**Why it's wrong:** OpenTUI's `TextRenderable.add()` rejects `TextRenderable` children. This causes a crash or silent render failure.

**Do this instead:** `<box flexDirection="row"><text fg="red">error:</text><text> message</text></box>`

### Anti-Pattern 3: Full-Frame Snapshot Assertions in TUI Tests

**What people do:** `expect(captureCharFrame()).toBe(entireScreenSnapshot)`.

**Why it's wrong:** Any layout change — spacing, padding, terminal width — breaks the snapshot. Tests become a maintenance burden rather than a safety net.

**Do this instead:** Assert specific text presence: `expect(captureCharFrame()).toContain("[s] Sync")`. For structural assertions, use `captureSpans()` to check specific colored regions.

### Anti-Pattern 4: Switch/Match for Conditional Rendering in OpenTUI

**What people do:** Use SolidJS `<Switch><Match when={...}>` to conditionally render tab content.

**Why it's wrong:** OpenTUI's renderer does not repaint when SolidJS swaps conditional DOM branches on some versions. This is a known established pattern in this codebase — use height-based visibility (`height={isActive ? "100%" : 0}`) instead.

**Exception:** `App.tsx` currently uses `<Switch><Match>` for tab content inside the list pane (lines 568–595) and it works. The concern applies specifically to top-level alternating between fundamentally different component trees. Follow the existing pattern in the file when in doubt.

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `App.tsx` ↔ `ActionMenu.tsx` | Props: `workspaceName`, `onAction`, `onCancel`, `onRun` | Add `"sync"` to `Action` type and actions array |
| `App.tsx` ↔ `TemplateActionMenu.tsx` | Props: `templateName`, `onAction`, `onCancel` | Add `"create"` action to trigger wizard |
| `App.tsx` ↔ `WizardView.tsx` (NEW) | Props: `title`, `steps`, `onConfirm`, `onCancel` | New boundary — follows same callback pattern |
| `App.tsx` ↔ `workspace-ops.ts` | Direct async function calls with progress callbacks | `syncWorkspace` added to existing imports |
| `App.tsx` ↔ `types.ts` | `UIView`, `Action`, `Tab` unions | Add `"sync"` to Action, `"wizard"` view to UIView |
| `testRender` ↔ component | `@opentui/solid` testRender API | `mockInput`, `captureCharFrame`, `renderOnce` |
| `tests/*` ↔ config layer | `process.env.HOME` redirect + dynamic import | Required for any test touching config/ops layer |

### External Boundaries (no change for v0.4.0)

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `run.tsx` ↔ Unix socket | `Bun.listen` / `Bun.connect` | IPC unchanged for v0.4.0 |
| `workspace-ops.ts` ↔ git | `Bun.$` shell calls | No change |
| `workspace-ops.ts` ↔ YAML config | `src/lib/config.ts` read/write | No change |

---

## Build Order Recommendation

Dependencies flow in this order — build bottom-up:

1. **types.ts changes first** — `"sync"` in Action, `"wizard"` view variant. Everything else depends on this.

2. **ActionMenu.tsx sync entry** — trivial, unblocks integration test writing.

3. **App.tsx sync wiring** — import `syncWorkspace`, add sync case to `runAction`. Self-contained, no new components needed. Can be tested immediately.

4. **InlineInput.test.tsx** — establishes the `testRender` + bun:test pattern before building WizardView. Validates the test harness works.

5. **WizardView.tsx** — new component. Build after InlineInput test confirms the harness pattern is working.

6. **WizardView.test.tsx** — unit tests for step progression, field collection, cancel.

7. **App.tsx wizard routing** — wire WizardView into App's view state and keyboard dispatch. Add "n" key binding on workspaces and templates tabs.

8. **App.integration.test.tsx** — requires working WizardView + sync routing.

9. **TemplateActionMenu.tsx create entry** — add "n" key for template create, triggers wizard.

10. **Repo management in TUI** (if in scope) — uses `renderer.suspend()` pattern for scan, WizardView for add.

---

## Sources

- `src/tui/dashboard/App.tsx` — verified live source for UIView state machine, keyboard dispatch, action routing
- `src/tui/dashboard/ActionMenu.tsx` — verified live source for action list and keyboard handler
- `src/tui/dashboard/InlineInput.tsx` — verified live source for inline input pattern
- `src/tui/dashboard/types.ts` — verified UIView, Action, Tab types
- `src/lib/workspace-ops.ts` — verified syncWorkspace signature at line 677
- `node_modules/@opentui/solid/index.d.ts` — verified `testRender` export
- `node_modules/@opentui/core/testing/test-renderer.d.ts` — verified TestRenderer API
- `node_modules/@opentui/core/testing/mock-keys.d.ts` — verified MockInput API
- `node_modules/@opentui/core/testing/test-recorder.d.ts` — verified TestRecorder API
- `node_modules/@opentui/core/testing/manual-clock.d.ts` — verified ManualClock API
- `tests/lib/workspace-ops.test.ts` — verified process.env.HOME isolation pattern
- `tests/tui/messageUtils.test.ts` — verified existing pure-function TUI test pattern
- `.planning/PROJECT.md` — v0.4.0 milestone scope confirmed

---
*Architecture research for: v0.4.0 TUI e2e testing, wizard create flows, sync action integration*
*Researched: 2026-03-20*
