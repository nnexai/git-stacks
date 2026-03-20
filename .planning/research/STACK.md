# Stack Research

**Domain:** Bun CLI tool with SolidJS/OpenTUI dashboard — v0.4.0 additions
**Researched:** 2026-03-20
**Confidence:** HIGH (key claims verified against installed package type definitions and official docs)

---

## Scope

This document covers **only the additions needed for v0.4.0**. The existing stack (Bun, TypeScript, Commander.js, `@opentui/solid`, SolidJS, YAML + Zod, `@clack/prompts`) is unchanged and not re-researched.

Two questions answered:

1. What is the right testing stack for the OpenTUI TUI dashboard?
2. What patterns/primitives support multi-step create wizard flows within the existing OpenTUI architecture?

---

## Finding 1: OpenTUI Has a First-Class Testing Module (Already Installed)

`@opentui/core@0.1.87` (installed) ships a `./testing` export that provides a complete headless test renderer. `@opentui/solid@0.1.87` re-exports `testRender` that mounts a SolidJS component tree into that renderer. **No new dependencies are required for TUI component testing.**

Verified by reading `node_modules/@opentui/core/testing.d.ts`, `node_modules/@opentui/core/testing/test-renderer.d.ts`, `node_modules/@opentui/solid/index.d.ts`, and the compiled `node_modules/@opentui/core/testing.js`. HIGH confidence.

### The TUI Test API (All From Installed Packages)

```typescript
import { testRender } from "@opentui/solid"
import { KeyCodes, TestRecorder } from "@opentui/core/testing"

// Mount a SolidJS component in a headless renderer (no TTY required)
const { renderer, mockInput, renderOnce, captureCharFrame, resize } =
  await testRender(() => <MyComponent />, { width: 80, height: 24 })

// Simulate keyboard input
await mockInput.typeText("hello")
mockInput.pressKey("1")               // single keypress, no await needed
await mockInput.pressKeys(["j", "j"]) // multiple keys
mockInput.pressEnter()
mockInput.pressEscape()
mockInput.pressArrow("down")
mockInput.pressKey("ArrowUp", { ctrl: true })

// Advance the render loop (MUST call after each input batch before asserting)
await renderOnce()

// Capture output as a plain string (no ANSI codes)
const frame = captureCharFrame()
expect(frame).toContain("my-workspace")

// Resize the virtual terminal
resize(120, 40)

// Record multiple frames for sequence assertions
const recorder = new TestRecorder(renderer)
recorder.rec()
// ...interactions...
recorder.stop()
const frames = recorder.recordedFrames // RecordedFrame[]
```

Key points:
- `captureCharFrame()` returns the visible character content of the terminal buffer **without ANSI escape codes**. This makes `expect(frame).toContain("text")` and `expect(frame).toMatchSnapshot()` straightforward.
- `renderOnce()` is required after input — the test renderer does not auto-loop. Every assertion must be preceded by `await renderOnce()`.
- The renderer does not write to stdout (`useAlternateScreen: false`, `useConsole: false` in the test renderer constructor). Tests run silently in CI.
- Set `OTUI_USE_CONSOLE=false` to suppress any remaining console interception during tests (the `createTestRenderer` implementation sets this automatically).
- The `TestRenderer` extends `CliRenderer` — the same renderer type used in production. The test variant uses a mock stdin (`new Readable({ read() {} })`) instead of process.stdin.

### Snapshot Testing With bun:test

`bun:test` supports `toMatchSnapshot()` (file-based) and `toMatchInlineSnapshot()` (inline in test file). `toMatchInlineSnapshot` was shipped in Bun v1.1.39 (December 2024) and is available in the project's runtime (Bun 1.3.10). Types in `@types/bun` may lag; cast to `any` if the TypeScript compiler complains until `@types/bun` catches up.

Pattern for TUI snapshot testing:

```typescript
test("workspace list renders correctly", async () => {
  const { renderOnce, captureCharFrame } = await testRender(() => <WorkspaceList ... />)
  await renderOnce()
  expect(captureCharFrame()).toMatchSnapshot()
})
```

Snapshots live in `tests/__snapshots__/`. Update with `bun test --update-snapshots`.

---

## Finding 2: InlineInput Already Exists; Multi-Step Wizard = SolidJS View State

### Existing InlineInput Pattern

`src/tui/dashboard/InlineInput.tsx` is the existing single-step text input. It:
- Registers `useKeyboard` to handle character input, backspace, enter, and escape
- Exposes `onConfirm(value)` and `onCancel()` callbacks
- Is surfaced from `App.tsx` via the `view` signal: `setView({ view: "inline-input", purpose: "rename", prefill: name })`

This pattern scales cleanly to multi-step wizards. A multi-step form is just an extended view state with a `step` field and accumulated partial data.

### Multi-Step Wizard Pattern (No New Libraries Needed)

A wizard is a named view state with a `step` discriminant and a partial data accumulator. The entire pattern fits in existing SolidJS primitives (`createSignal`, `createMemo`).

```typescript
// In App.tsx view union — extend existing UIView type
type UIView =
  | { view: "list" }
  | { view: "inline-input"; purpose: string; prefill: string; index?: number }
  | { view: "new-workspace-wizard"; step: "name" | "template" | "branch"; data: Partial<NewWorkspaceInput> }
  | { view: "action-menu"; index: number }
  // ...

// Transition: enter wizard
setView({ view: "new-workspace-wizard", step: "name", data: {} })

// Transition: advance to next step (in handleWizardStep)
setView(v => ({
  ...v,
  step: "template",
  data: { ...(v as any).data, name: enteredName }
}))

// Transition: wizard complete
const formData = (view() as any).data
await createWorkspace(formData)
setView({ view: "list" })
```

Each wizard step renders a different `<InlineInput>` (or a `<Select>`-backed picker) in the detail pane, driven by the `step` field. No external state machine library is needed; the view signal IS the state machine.

**Why not `@solid-primitives/state-machine`:** `createMachine` from `@solid-primitives/state-machine@0.1.1` adds abstractions (state callback functions, typed transitions) that are appropriate when a state machine has complex side-effect lifecycles. For a multi-step form, the `view()` signal-as-discriminated-union pattern used throughout `App.tsx` is already established and sufficient. Adding a new primitive for the same job introduces cognitive overhead with no architectural benefit.

### Select-Based Step (Template / Repo Picker)

Some wizard steps require picking from a list (e.g., "choose a template"). The existing `<ActionMenu>` component renders a numbered list and uses `useKeyboard` for navigation. Wizard steps that need a picker can reuse or extend `ActionMenu` with dynamic items.

OpenTUI `SelectRenderable` (via `@opentui/core/renderables/Select.d.ts`, already in the package) is the lower-level primitive if a fully-styled picker with scroll is needed. In the SolidJS context, `<select>` is the JSX element mapped to `SelectRenderable`. However, the existing `ActionMenu` pattern is simpler and already tested by users — prefer it for v0.4.0 wizard steps.

---

## Recommended Stack Additions

### Core Testing (No New Dependencies)

| API | Source | Purpose |
|-----|--------|---------|
| `testRender` | `@opentui/solid` (installed) | Mount SolidJS components in headless renderer |
| `captureCharFrame()` | `@opentui/core/testing` (installed) | Capture rendered output as plain string |
| `mockInput.typeText/pressKey` | `@opentui/core/testing` (installed) | Simulate keyboard input |
| `renderOnce()` | `@opentui/core/testing` (installed) | Advance render loop once |
| `TestRecorder` | `@opentui/core/testing` (installed) | Record frame sequences for multi-step interaction tests |
| `toMatchSnapshot()` | `bun:test` (built-in) | Snapshot assertions on `captureCharFrame()` output |
| `toMatchInlineSnapshot()` | `bun:test` v1.1.39+ (Bun 1.3.10) | Inline snapshots for small assertions |

### Wizard Flow (No New Dependencies)

| Pattern | Implementation | Source |
|---------|---------------|--------|
| Multi-step view state | Extend `UIView` discriminated union with `step` + `data` fields | Existing `App.tsx` pattern |
| Text input step | `<InlineInput>` with `purpose` matching the wizard step | Existing component |
| Picker step | Extend `<ActionMenu>` with dynamic items, or use `<select>` JSX element | Existing components |
| Step transitions | `setView(v => ({ ...v, step: nextStep, data: merged }))` | SolidJS `createSignal` |

---

## Installation

No new packages required. The testing API is already present in the installed `@opentui/core@0.1.87` and `@opentui/solid@0.1.87`.

```bash
# Verify current install is clean
bun install

# No new packages needed
```

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `node-pty` | Has known Bun compatibility issues (native addon). Bun 1.3.x has its own PTY API (`Bun.Terminal`) but that is for spawning external processes — overkill here since OpenTUI's test renderer handles everything in-process. | `testRender` from `@opentui/solid` |
| `ink` testing utilities (`@inkjs/ui`, `ink-testing-library`) | Different TUI framework entirely. Incompatible with OpenTUI's Zig-backed renderer. | `testRender` + `captureCharFrame` |
| `@solid-primitives/state-machine` | The `view()` signal-as-state-machine pattern already used in `App.tsx` is sufficient for wizard flows. A state machine library adds abstraction with no benefit at this scale. | Extend the existing `UIView` union type |
| PTY-based e2e via `Bun.Terminal` + `Bun.spawn` | Spawning the full `git-stacks manage` process in a PTY and parsing ANSI output is brittle and slow. The OpenTUI test renderer does the same thing in-process with clean string output. | `testRender` + `captureCharFrame` |
| `vitest` or `jest` | Project is already on `bun:test` which is Jest-compatible. Switching runners provides no benefit and removes the Bun-native speed advantage. | `bun:test` (existing) |
| Global state pollution between tests | `testRender` creates an isolated renderer instance per test. Use `afterEach` to call `renderer.destroy()`. | Lifecycle hooks in `bun:test` |

---

## Integration With Existing bun:test Setup

Tests for TUI components live under `tests/tui/`. The existing test at `tests/tui/messageUtils.test.ts` tests pure utility functions — no renderer needed. New component tests that use `testRender` require the preload:

`bunfig.toml` already has `preload = ["@opentui/solid/preload"]`. Component tests using `testRender` will work under `bun test tests/` without additional configuration.

OpenTUI requires the Zig native binary (`@opentui/core-linux-x64` is installed). The test renderer initialises this binary with `testing: true` which disables actual terminal I/O. Tests will run in CI on Linux without a display server.

---

## Version Compatibility

| Package | Version | Notes |
|---------|---------|-------|
| `@opentui/core` | 0.1.87 (installed) | `./testing` export and `TestRecorder` confirmed in installed type definitions |
| `@opentui/solid` | 0.1.87 (installed) | `testRender` confirmed in installed `index.d.ts` and `index.js` |
| `bun:test` | Bun 1.3.10 | `toMatchSnapshot` supported since Bun 1.x. `toMatchInlineSnapshot` since Bun 1.1.39 (Dec 2024). Both available. |
| `OTUI_USE_CONSOLE` env var | Any | Set automatically by `createTestRenderer`. No configuration needed. |

---

## Sources

- `node_modules/@opentui/core/testing.d.ts` — full testing export list, HIGH confidence (installed source)
- `node_modules/@opentui/core/testing/test-renderer.d.ts` — `createTestRenderer`, `TestRenderer`, `MockInput`, `MockMouse` types, HIGH confidence (installed source)
- `node_modules/@opentui/core/testing/mock-keys.d.ts` — `createMockKeys`, `KeyCodes`, `pressKey`, `typeText`, `pressArrow` signatures, HIGH confidence (installed source)
- `node_modules/@opentui/core/testing/test-recorder.d.ts` — `TestRecorder`, `RecordedFrame` types, HIGH confidence (installed source)
- `node_modules/@opentui/solid/index.d.ts` — `testRender` signature, HIGH confidence (installed source)
- `node_modules/@opentui/core/testing.js` — `createTestRenderer` implementation (mock stdin, `testing: true` flag, `captureCharFrame` reads `getRealCharBytes(true)` which strips ANSI), HIGH confidence (installed source)
- OpenTUI testing guide: https://deepwiki.com/sst/opentui/6.1-getting-started — MEDIUM confidence (independently confirms API surface)
- Bun test runner docs: https://bun.sh/docs/test — `toMatchSnapshot`, `toMatchInlineSnapshot` confirmed, HIGH confidence (official docs)
- Bun `toMatchInlineSnapshot` issue: https://github.com/oven-sh/bun/issues/3623 — shipped in Bun v1.1.39, HIGH confidence (issue confirmed closed/completed)
- Bun Terminal PTY API: https://bun.sh/docs/api/spawn — PTY approach considered and rejected in favour of in-process `testRender`, HIGH confidence
- `node-pty` Bun issue: https://github.com/microsoft/node-pty/issues/632 — native addon compatibility problems confirmed, HIGH confidence

---

*Stack research for: git-stacks v0.4.0 — TUI e2e testing and wizard create flows*
*Researched: 2026-03-20*
