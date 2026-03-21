# Phase 10: test-harness - Research

**Researched:** 2026-03-21
**Domain:** OpenTUI headless test infrastructure + config isolation
**Confidence:** HIGH

## Summary

Phase 10 establishes the headless test harness that all subsequent TUI phases depend on. The core API (`testRender`) already ships in `@opentui/solid@0.1.87` and is confirmed present in `node_modules`. The `mockInput` object provides every keyboard primitive needed by T-02 (`typeText`, `pressKey`, `pressEnter`, `pressEscape`, `pressArrow`, `pressBackspace`). `captureCharFrame()` returns the rendered framebuffer as a plain string — no terminal required.

The config isolation requirement (T-06) requires a targeted change to `src/lib/paths.ts`. Currently `WS_CONFIG_DIR` is hardcoded to `join(HOME, ".config/git-stacks")` at module-load time. A `GIT_STACKS_CONFIG_DIR` env override must be plumbed through `paths.ts` so every downstream constant (`WORKSPACES_DIR`, `REGISTRY_FILE`, `TEMPLATES_DIR`, `MESSAGES_DIR`, `GLOBAL_CONFIG_FILE`) redirects automatically. The existing pattern — `process.env.HOME` redirect + dynamic import — is fragile for TUI tests because the dashboard hooks call config functions after module load; the env var approach is cleaner and does not require dynamic imports.

**Critical discovery:** `ActionMenu` currently has NO arrow key cursor navigation — it dispatches on letter keys only (`o`, `n`, `e`, `c`, `r`, `m`). T-04 requires "arrow key navigation, option selection on enter, dismiss on escape". This means Phase 10 must add arrow-cursor state to `ActionMenu` as part of making it testable, not just write tests against the current implementation.

**Primary recommendation:** Add `GIT_STACKS_CONFIG_DIR` to `paths.ts` first, then add arrow-cursor state to `ActionMenu`, then write `InlineInput.test.tsx` and `ActionMenu.test.tsx` using `testRender`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| T-01 | Component-level TUI tests run in CI without a real terminal using `testRender` | `createTestRenderer` sets `useAlternateScreen: false`, `useConsole: false`, `OTUI_USE_CONSOLE=false` — confirmed headless |
| T-02 | Tests simulate keyboard input and assert on rendered output via `captureCharFrame()` | `mockInput` exposes `typeText`, `pressKey(key, modifiers)`, `pressEnter`, `pressEscape`, `pressArrow(direction)`, `pressBackspace`; `captureCharFrame()` returns frame as string |
| T-03 | `InlineInput` tests: typing, cursor movement, backspace, escape cancel, enter confirm | `InlineInput` uses `useKeyboard` hook; `key.name` values: single chars for typing, `"backspace"`, `"escape"`, `"return"` — all simulatable via `mockInput` |
| T-04 | `ActionMenu` tests: arrow nav, option select on enter, dismiss on escape | **ActionMenu must be enhanced first** — current implementation has no cursor/arrow state; arrow keys `"up"` / `"down"` map to `key.name` in opentui's `KeyEvent` |
| T-06 | `GIT_STACKS_CONFIG_DIR` env var redirects all config reads/writes to a temp dir | `src/lib/paths.ts` hardcodes `WS_CONFIG_DIR` at module load; must be changed to read env var first |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@opentui/solid` | 0.1.87 (installed) | `testRender` headless component renderer | Already the project's TUI framework; `testRender` is its official test API |
| `@opentui/core` | 0.1.87 (installed) | `TestRendererOptions`, `KeyCodes`, `MockInput` types | Peer dep of `@opentui/solid` |
| `bun:test` | Bun built-in | Test runner (`describe`, `test`, `expect`, `beforeEach`, `afterEach`) | Already used across all test files in this project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `solid-js` | 1.9.11 (installed) | `createSignal`, `Show`, `For` — component building blocks | Tests render actual SolidJS components; no mock framework needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `testRender` | PTY subprocess testing | PTY tests are explicitly out of scope — brittle, slow, require a real terminal |
| `captureCharFrame()` string match | `captureSpans()` structured frame | Use spans only when you need color/attribute assertions; string match is simpler |

**Installation:** No new packages needed — `@opentui/solid` and `bun:test` are already present.

**Version verification:** Confirmed `@opentui/solid@0.1.87` and `@opentui/core@0.1.87` are in `node_modules`. `testRender` export confirmed in `node_modules/@opentui/solid/index.d.ts`.

## Architecture Patterns

### Recommended Project Structure
```
tests/
  tui/
    messageUtils.test.ts       # existing — pure logic, no testRender
    dashboard/
      InlineInput.test.tsx     # T-03: component tests with testRender
      ActionMenu.test.tsx      # T-04: component tests with testRender
src/
  lib/
    paths.ts                   # T-06: add GIT_STACKS_CONFIG_DIR override
```

### Pattern 1: testRender Component Test
**What:** Mount a single component in isolation using `testRender`, drive it with `mockInput`, assert with `captureCharFrame()`.
**When to use:** Every test of a component that uses `useKeyboard`.
**Example:**
```typescript
// Source: @opentui/solid/index.d.ts + @opentui/core/testing/mock-keys.d.ts (inspected locally)
/** @jsxImportSource @opentui/solid */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { testRender } from "@opentui/solid"
import { InlineInput } from "../../../src/tui/dashboard/InlineInput"

describe("InlineInput", () => {
  test("typing appends characters", async () => {
    const onConfirm = (v: string) => {}
    const onCancel = () => {}
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <InlineInput label="Name" prefill="" onConfirm={onConfirm} onCancel={onCancel} />
    )
    await renderOnce()
    await mockInput.typeText("hello")
    await renderOnce()
    expect(captureCharFrame()).toContain("hello")
  })
})
```

### Pattern 2: Spy callbacks for event assertions
**What:** Pass spy functions as `onConfirm`/`onCancel`/`onAction` props, assert they were called.
**When to use:** When testing that a keypress triggers the correct event rather than a rendered change.
**Example:**
```typescript
let called = ""
const { mockInput, renderOnce } = await testRender(
  () => <ActionMenu workspaceName="ws" onAction={(a) => { called = a }} onCancel={() => {}} />
)
await renderOnce()
mockInput.pressKey("o")
await renderOnce()
expect(called).toBe("open")
```

### Pattern 3: GIT_STACKS_CONFIG_DIR isolation in tests
**What:** Set env var before importing config-dependent modules, create a temp dir, clean up after.
**When to use:** Any test that exercises config reads/writes.
**Example:**
```typescript
import { makeTmpDir, cleanup } from "../../helpers"
import { beforeEach, afterEach } from "bun:test"

let tmp: string
beforeEach(() => {
  tmp = makeTmpDir("tui-test")
  process.env.GIT_STACKS_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.GIT_STACKS_CONFIG_DIR
  cleanup(tmp)
})
```

### Pattern 4: paths.ts env-var override
**What:** Read `GIT_STACKS_CONFIG_DIR` at the top of `paths.ts`, fall back to the default if not set.
**When to use:** T-06 implementation — one change, all downstream constants redirect automatically.
**Example:**
```typescript
// src/lib/paths.ts — proposed change
export const WS_CONFIG_DIR =
  process.env.GIT_STACKS_CONFIG_DIR ?? join(HOME, ".config", "git-stacks")
```
All other constants (`WORKSPACES_DIR`, `REGISTRY_FILE`, etc.) already derive from `WS_CONFIG_DIR` so they redirect automatically. No other files need to change.

**Caveat:** Because `paths.ts` is a module, the constants are evaluated once at import time per module cache entry. Bun's test runner forks fresh processes per test file, so setting `process.env.GIT_STACKS_CONFIG_DIR` before the first import of `paths.ts` (or `config.ts`) within a test file is sufficient. Do NOT set the env var mid-test after the module is already cached.

### Pattern 5: ActionMenu cursor-based navigation (required for T-04)
**What:** Add a `createSignal(0)` cursor index to `ActionMenu`. Arrow up/down moves it. Enter dispatches the action at cursor index.
**When to use:** Required change before T-04 tests can be written — the current implementation has no cursor state.
**Example:**
```typescript
// ActionMenu.tsx — proposed enhancement
const [cursor, setCursor] = createSignal(0)
useKeyboard((key) => {
  if (key.name === "escape") { props.onCancel(); return }
  if (key.name === "down") { setCursor(c => Math.min(c + 1, actions.length - 1)); return }
  if (key.name === "up") { setCursor(c => Math.max(c - 1, 0)); return }
  if (key.name === "return") { props.onAction(actions[cursor()].action); return }
  const match = actions.find((a) => a.key === key.name)
  if (match) props.onAction(match.action)
})
```
The rendered output should show the selected item highlighted so `captureCharFrame()` assertions can detect cursor position.

### Anti-Patterns to Avoid
- **Asserting against the full frame string:** `captureCharFrame()` returns the entire 80x24 (or configured) frame including padding and blanks. Use `toContain()` not `toBe()` for substring assertions.
- **Missing `await renderOnce()` after input:** Input events are buffered; the render loop is not automatic in tests. Always call `await renderOnce()` after each `mockInput` call.
- **Setting env var after first import of paths.ts:** The module cache returns the already-evaluated constants. Set `GIT_STACKS_CONFIG_DIR` before any import that transitively imports `paths.ts`.
- **Using dynamic import for config isolation in TUI tests:** The `process.env.HOME` + dynamic import pattern used in `tests/lib/config.test.ts` is fragile for TUI tests. Use `GIT_STACKS_CONFIG_DIR` instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key event simulation | Custom stdin buffer injection | `mockInput.pressKey / typeText / pressArrow` | `createMockKeys` handles escape sequence encoding, kitty keyboard mode, event routing through the same `keyInput` EventEmitter that `useKeyboard` listens on |
| Frame capture | Read renderer internals directly | `captureCharFrame()` | Returns decoded real-char bytes from the render buffer — handles wide chars and ANSI correctly |
| Headless renderer setup | `new CliRenderer(...)` manually | `testRender(node, config)` | Sets `useAlternateScreen: false`, `useConsole: false`, `OTUI_USE_CONSOLE=false`, and calls `engine.attach()` — skipping any of these causes terminal writes in CI |

**Key insight:** The entire headless setup (`testRender` + `mockInput` + `captureCharFrame`) is a first-class API from the framework authors. Do not bypass it.

## Common Pitfalls

### Pitfall 1: Missing JSX preload in test files
**What goes wrong:** TypeScript/Bun does not know how to transform `.tsx` files with the opentui JSX pragma. Tests import correctly but JSX render fails at runtime.
**Why it happens:** `bunfig.toml` has `preload = ["@opentui/solid/preload"]` which registers the Babel/solid transform plugin. This applies globally to `bun test`, so `.tsx` test files ARE covered — but only if the preload path resolves correctly.
**How to avoid:** Confirm `bunfig.toml` preload is `"@opentui/solid/preload"` (it is, in this project). Test files should use `/** @jsxImportSource @opentui/solid */` pragma at top to be explicit.
**Warning signs:** `SyntaxError: Unexpected token '<'` or `JSX element is not a constructor` at test runtime.

### Pitfall 2: Render loop not flushed
**What goes wrong:** Input is sent via `mockInput` but `captureCharFrame()` returns the pre-input frame — assertion fails.
**Why it happens:** The test renderer's `loop()` (exposed as `renderOnce()`) must be awaited to process pending render work. Input events do not synchronously trigger a re-render.
**How to avoid:** Pattern: `mockInput.pressKey("x"); await renderOnce(); expect(captureCharFrame()).toContain(...)`.
**Warning signs:** Tests pass locally (timing-dependent) but fail in CI, or assertions consistently return the initial frame content.

### Pitfall 3: Module-cached paths constants
**What goes wrong:** `GIT_STACKS_CONFIG_DIR` is set in `beforeEach` but config writes still go to `~/.config/git-stacks`.
**Why it happens:** Bun caches ESM modules within a process. If `paths.ts` was already imported (e.g., by another test in the same file or a top-level import), the constants are frozen.
**How to avoid:** Set `process.env.GIT_STACKS_CONFIG_DIR` at the top of the test file (before any imports that transitively load `paths.ts`), or ensure the env var is in place before the first `import` executes. Bun spawns a fresh process per test file, so cross-file contamination is not an issue.
**Warning signs:** Config writes appear in real config dir during tests; isolation cleanup leaves files behind.

### Pitfall 4: ActionMenu tests written before cursor state exists
**What goes wrong:** Tests for T-04 arrow navigation are written against the current `ActionMenu`, which ignores arrow keys. Tests fail permanently.
**Why it happens:** The current `ActionMenu` has no `cursor` signal and no `key.name === "up"/"down"` handler.
**How to avoid:** The implementation task for cursor-based navigation in `ActionMenu` must be completed before the T-04 tests are written — or test and implementation are done in the same task.
**Warning signs:** `mockInput.pressArrow("down"); await renderOnce()` produces no observable change in `captureCharFrame()`.

### Pitfall 5: InlineInput cursor movement (T-03 partial gap)
**What goes wrong:** T-03 requires "cursor movement (left/right)" tests, but the current `InlineInput` does not handle left/right arrow keys — only `backspace`, `return`, `escape`, and character appending.
**Why it happens:** Left/right cursor movement is listed as P-01 (Phase 11 prerequisite). T-03 tests for cursor movement will fail against the Phase 10 version of `InlineInput`.
**How to avoid:** For Phase 10, test only what `InlineInput` currently supports: typing, backspace, escape cancel, enter confirm. Mark cursor-movement tests as deferred to Phase 11 (when P-01 is implemented). Do NOT write failing cursor-movement tests in Phase 10.
**Warning signs:** Tests for `left`/`right` arrow keys in `InlineInput` return the same frame — cursor position not tracked.

## Code Examples

Verified patterns from official sources:

### testRender signature
```typescript
// Source: node_modules/@opentui/solid/index.d.ts
import { testRender } from "@opentui/solid"
const { renderer, mockInput, mockMouse, renderOnce, captureCharFrame, captureSpans, resize } =
  await testRender(node: () => JSX.Element, renderConfig?: TestRendererOptions)
```

### MockInput API
```typescript
// Source: node_modules/@opentui/core/testing/mock-keys.d.ts
mockInput.typeText(text: string, delayMs?: number): Promise<void>
mockInput.pressKey(key: KeyInput, modifiers?: { shift?; ctrl?; meta?; super?; hyper? }): void
mockInput.pressEnter(modifiers?): void
mockInput.pressEscape(modifiers?): void
mockInput.pressBackspace(modifiers?): void
mockInput.pressArrow(direction: "up" | "down" | "left" | "right", modifiers?): void
// KeyInput = string | keyof typeof KeyCodes
// KeyCodes includes: RETURN, ESCAPE, BACKSPACE, ARROW_UP, ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, etc.
```

### KeyEvent shape (received by useKeyboard callbacks)
```typescript
// Source: node_modules/@opentui/core/lib/KeyHandler.d.ts (inspected locally)
interface KeyEvent {
  name: string      // e.g. "a", "return", "escape", "backspace", "up", "down", "left", "right"
  ctrl: boolean
  meta: boolean
  shift: boolean
  option: boolean
  sequence: string
  // ...
}
// Arrow key names: "up", "down", "left", "right" (NOT "arrow_up" etc.)
```

### TestRendererOptions
```typescript
// Source: node_modules/@opentui/core/testing/test-renderer.d.ts
interface TestRendererOptions extends CliRendererConfig {
  width?: number    // default: 80
  height?: number   // default: 24
  kittyKeyboard?: boolean
  otherModifiersMode?: boolean
}
```

### Full InlineInput test skeleton
```typescript
/** @jsxImportSource @opentui/solid */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { testRender } from "@opentui/solid"
import { makeTmpDir, cleanup } from "../../helpers"
import { InlineInput } from "../../../src/tui/dashboard/InlineInput"

let tmp: string
beforeEach(() => { tmp = makeTmpDir("tui"); process.env.GIT_STACKS_CONFIG_DIR = tmp })
afterEach(() => { delete process.env.GIT_STACKS_CONFIG_DIR; cleanup(tmp) })

describe("InlineInput", () => {
  test("typing appends characters to display", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <InlineInput label="Name" prefill="" onConfirm={() => {}} onCancel={() => {}} />
    )
    await renderOnce()
    await mockInput.typeText("abc")
    await renderOnce()
    expect(captureCharFrame()).toContain("abc")
  })

  test("backspace removes last character", async () => {
    const { mockInput, renderOnce, captureCharFrame } = await testRender(
      () => <InlineInput label="Name" prefill="ab" onConfirm={() => {}} onCancel={() => {}} />
    )
    await renderOnce()
    mockInput.pressBackspace()
    await renderOnce()
    expect(captureCharFrame()).not.toContain("ab")
    expect(captureCharFrame()).toContain("a")
  })

  test("escape calls onCancel", async () => {
    let cancelled = false
    const { mockInput, renderOnce } = await testRender(
      () => <InlineInput label="Name" prefill="" onConfirm={() => {}} onCancel={() => { cancelled = true }} />
    )
    await renderOnce()
    mockInput.pressEscape()
    await renderOnce()
    expect(cancelled).toBe(true)
  })

  test("enter calls onConfirm with current value", async () => {
    let confirmed = ""
    const { mockInput, renderOnce } = await testRender(
      () => <InlineInput label="Name" prefill="hello" onConfirm={(v) => { confirmed = v }} onCancel={() => {}} />
    )
    await renderOnce()
    mockInput.pressEnter()
    await renderOnce()
    expect(confirmed).toBe("hello")
  })
})
```

### paths.ts change for T-06
```typescript
// src/lib/paths.ts — change line 9 only
export const WS_CONFIG_DIR =
  process.env.GIT_STACKS_CONFIG_DIR ?? join(HOME, ".config", "git-stacks")
// All downstream constants (WORKSPACES_DIR, REGISTRY_FILE, etc.) derive from WS_CONFIG_DIR
// and require no changes.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PTY-based subprocess tests | `testRender` headless API | OpenTUI 0.1.x | No display server required in CI |
| `process.env.HOME` redirect + dynamic import | `GIT_STACKS_CONFIG_DIR` env var | Phase 10 (this phase) | Cleaner isolation without ESM cache workarounds |

**Deprecated/outdated:**
- `process.env.HOME` redirect: Works for lib tests that use dynamic import, but not reliable for TUI component tests where dashboard hooks import config at module load time. Use `GIT_STACKS_CONFIG_DIR` for TUI tests going forward.

## Open Questions

1. **Does `renderOnce()` need to be called multiple times after async state updates?**
   - What we know: `renderOnce()` calls `renderer.loop()` which processes one render tick. SolidJS signals update synchronously, but the renderer may need multiple ticks to settle.
   - What's unclear: Whether a single `await renderOnce()` is always sufficient or whether two calls are needed for signals that trigger cascading updates.
   - Recommendation: Start with single `renderOnce()` per test step; add a second if assertions fail unexpectedly.

2. **InlineInput cursor-movement tests (T-03 partial)**
   - What we know: T-03 explicitly lists "cursor movement (left/right)" but `InlineInput` does not currently implement it. P-01 (Phase 11) adds this.
   - What's unclear: Whether the planner should write cursor-movement test stubs (that will fail) in Phase 10 or defer them entirely to Phase 11.
   - Recommendation: Phase 10 covers typing, backspace, escape, enter. Cursor-movement tests are authored in Phase 11 alongside the P-01 implementation so they start green.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in to Bun) |
| Config file | `bunfig.toml` — `preload = ["@opentui/solid/preload"]` handles TSX transform |
| Quick run command | `bun test tests/tui/dashboard/` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| T-01 | `bun test tests/tui/dashboard/` passes in CI without terminal | smoke | `bun test tests/tui/dashboard/` | ❌ Wave 0 |
| T-02 | `typeText`, `pressKey`, `pressArrow`, `captureCharFrame()` work | unit | `bun test tests/tui/dashboard/InlineInput.test.tsx` | ❌ Wave 0 |
| T-03 | `InlineInput`: typing, backspace, escape, enter | unit | `bun test tests/tui/dashboard/InlineInput.test.tsx` | ❌ Wave 0 |
| T-04 | `ActionMenu`: arrow nav, enter select, escape dismiss | unit | `bun test tests/tui/dashboard/ActionMenu.test.tsx` | ❌ Wave 0 |
| T-06 | `GIT_STACKS_CONFIG_DIR` redirects config I/O | unit | `bun test tests/tui/dashboard/` | ❌ Wave 0 (paths.ts change) |

### Sampling Rate
- **Per task commit:** `bun test tests/tui/dashboard/`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/tui/dashboard/InlineInput.test.tsx` — covers T-02, T-03
- [ ] `tests/tui/dashboard/ActionMenu.test.tsx` — covers T-02, T-04
- [ ] `src/lib/paths.ts` change — covers T-06 (not a test file, but required before tests can isolate)
- [ ] `src/tui/dashboard/ActionMenu.tsx` cursor state addition — required before T-04 tests can pass

## Sources

### Primary (HIGH confidence)
- `node_modules/@opentui/solid/index.d.ts` — `testRender` signature, return type
- `node_modules/@opentui/core/testing/test-renderer.d.ts` — `TestRendererOptions`, `createTestRenderer`, `captureCharFrame`, `renderOnce`
- `node_modules/@opentui/core/testing/mock-keys.d.ts` — `MockInput` API: `typeText`, `pressKey`, `pressEnter`, `pressEscape`, `pressArrow`, `pressBackspace`, `KeyCodes`
- `node_modules/@opentui/core/testing.js` — `createTestRenderer` implementation: confirms `useAlternateScreen: false`, `useConsole: false`, `OTUI_USE_CONSOLE=false`
- `node_modules/@opentui/core/lib/KeyHandler.d.ts` — `KeyEvent` shape: `name`, `ctrl`, `meta`, `shift`
- `node_modules/@opentui/solid/index.js` — `testRender` implementation: calls `engine.attach()` + `mountSolidRoot`
- `bunfig.toml` — `preload = ["@opentui/solid/preload"]` confirmed (JSX transform active for all test files)
- `src/lib/paths.ts` — `WS_CONFIG_DIR` hardcoded to `join(HOME, ".config", "git-stacks")` — T-06 change point identified
- `src/tui/dashboard/InlineInput.tsx` — current implementation: handles `escape`, `return`, `backspace`, single chars; no left/right arrow
- `src/tui/dashboard/ActionMenu.tsx` — current implementation: letter-key dispatch only; no arrow cursor state

### Secondary (MEDIUM confidence)
- `node_modules/@opentui/core/index.js` line 5908-5909 — key names `"up"` / `"down"` confirmed from internal key binding maps

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `testRender` confirmed in installed node_modules with full type declarations
- Architecture: HIGH — `testRender` implementation inspected directly; key event flow traced from `mockInput.pressKey` through `KeyEvent.name`
- Pitfalls: HIGH for pitfalls 1-4 (found by code inspection); MEDIUM for pitfall 5 (render loop timing)

**Research date:** 2026-03-21
**Valid until:** 2026-04-20 (stable library — opentui API unlikely to change within 30 days)
