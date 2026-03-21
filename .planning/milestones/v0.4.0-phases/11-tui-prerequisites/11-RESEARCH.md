# Phase 11: tui-prerequisites - Research

**Researched:** 2026-03-21
**Domain:** OpenTUI built-in `<input>` element + Bun subprocess stream capture
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **InlineInput: Replace with built-in `<input>` wrapper**
   - Replace hand-rolled InlineInput (manual `useKeyboard` + `<text>` + trailing `_` cursor) with thin wrapper around OpenTUI's built-in `<input>` JSX element
   - Spike-verified: all 5 tests passed (typing, left-arrow + mid-string insert, enter/submit, escape via `useKeyboard` overlay, prefill display)
   - Wrapper responsibilities: `<box flexDirection="row">` with `<text>` label + `<input>` + `useKeyboard` for escape → onCancel + `onSubmit` → `onConfirm`
   - Props: `label`, `prefill`, `onConfirm`, `onCancel`, `ref?` (for InputRenderable, used by Phase 13 wizards)
   - Accept all built-in keybindings — no restrictions

2. **Cursor visual indicator**
   - Use native blinking block cursor from built-in `<input>` (default)
   - No custom cursor indicator — eliminates the trailing `_` hack

3. **runHooksCaptured: separate function with line-based callbacks**
   - New export in `src/lib/lifecycle.ts`, separate from `runHooks()`
   - API: `runHooksCaptured(commands, cwd, env, onOutput, abortOnFailure?): Promise<HookResult[]>`
   - Line-at-a-time callback with `{ line: string, stream: "stdout" | "stderr" }`
   - Returns `HookResult[]` instead of throwing; `abortOnFailure` (default true) stops sequence early
   - Implementation: `stdout: "pipe", stderr: "pipe"` on `Bun.spawn`, read lines from readable streams

4. **Existing InlineInput tests**
   - Update existing tests in `tests/tui/dashboard/InlineInput.test.tsx` for the new `<input>`-based wrapper
   - All current test scenarios (typing, backspace, escape, enter, prefill) must continue to pass
   - Add new cursor movement test: left-arrow + insert mid-string

### Claude's Discretion

None specified — phase scope is tight.

### Deferred Ideas (OUT OF SCOPE)

None — phase scope is tight.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| P-01 | `InlineInput` supports left/right cursor movement and character insertion at cursor position | Built-in `<input>` (InputRenderable → TextareaRenderable) provides `moveCursorLeft`, `moveCursorRight`, full edit buffer — all for free. `mockInput.pressArrow("left")` sends `\x1B[D` which the built-in handles natively. |
| P-02 | `lifecycle.ts` provides `runHooksCaptured()` variant that streams hook stdout/stderr via callback instead of `stdio: "inherit"` | Bun.spawn with `stdout: "pipe", stderr: "pipe"` gives ReadableStream. App.tsx already uses this pattern: `proc.stdout.getReader()` + `decoder.decode()` + line splitting. |
| T-03 (cursor part) | `InlineInput` test asserting cursor movement: left-arrow + character insertion produces correct string | `mockInput.pressArrow("left")` + `mockInput.typeText("X")` + `captureCharFrame()` is the test pattern. The built-in input moves the edit cursor on left-arrow, then inserts at that position. |
</phase_requirements>

## Summary

Phase 11 has two independent deliverables. Neither requires new library installations — both use capabilities already present in the project.

**P-01 (InlineInput rewrite):** The current InlineInput is 25 lines of hand-rolled keyboard handling with an `_` cursor hack. OpenTUI's built-in `<input>` element (backed by `InputRenderable → TextareaRenderable → EditBufferRenderable`) provides full cursor movement, selection, word navigation, undo/redo, and a proper blinking block cursor out of the box. The replacement is a thin wrapper: `<box flexDirection="row">` containing a `<text>` label and the `<input>` element, with `useKeyboard` layered on top for escape → onCancel (since the built-in input does not emit a cancel event). The spike confirmed all 5 test behaviors work with this wrapper. The existing 6 InlineInput tests must be updated to work with the new component, and a 7th cursor movement test must be added.

**P-02 (runHooksCaptured):** The existing `runHooks()` uses `stdio: "inherit"` which writes directly to the terminal — incompatible with TUI contexts where OpenTUI owns the screen. `runHooksCaptured()` uses `stdout: "pipe", stderr: "pipe"` on `Bun.spawn`, reads the resulting ReadableStreams, splits on newlines, and calls the `onOutput` callback per line. The App.tsx `handleRun` function already uses this exact pattern for capturing git-stacks subprocess output. The new function returns `HookResult[]` (one per command) rather than throwing, so TUI callers can surface errors in the UI.

**Primary recommendation:** Implement P-01 (InlineInput) first (simpler, existing tests guide correctness), then P-02 (runHooksCaptured). Both can be separate tasks within a single plan.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@opentui/solid` | 0.1.87 (installed) | `<input>` JSX element, `useKeyboard`, `testRender` | Project's TUI framework — built-in input is its official single-line text field |
| `@opentui/core` | 0.1.87 (installed) | `InputRenderable` type for ref prop typing | Peer dep of `@opentui/solid` |
| `bun:test` | Bun built-in | Test runner for InlineInput and runHooksCaptured tests | Already used across all test files |
| Bun built-in spawn | Bun 1.3.10 | `Bun.spawn` with `stdout: "pipe"` for runHooksCaptured | Already used in lifecycle.ts and App.tsx |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `solid-js` | 1.9.11 (installed) | `createSignal`, `Show` — component primitives | InlineInput wrapper uses them for any wrapper-level state |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `<input>` built-in | Extend hand-rolled component with manual cursor tracking | Hand-rolled cursor requires tracking cursor position index, rendering a split string, handling all edge cases — prohibitively complex vs. wrapping what already exists |
| `stdout.getReader()` loop | `for await (const chunk of proc.stdout)` | Either works in Bun; `getReader()` is explicit and already used in App.tsx — prefer consistency |

**Installation:** No new packages needed.

**Version verification:** `@opentui/solid@0.1.87` and `@opentui/core@0.1.87` confirmed in `node_modules`. `InputRenderable` class confirmed in `node_modules/@opentui/core/renderables/Input.d.ts`. `testRender` export confirmed in `node_modules/@opentui/solid/index.d.ts`.

## Architecture Patterns

### Recommended Project Structure
```
src/
  tui/dashboard/
    InlineInput.tsx        # P-01: rewrite to wrap <input> + useKeyboard for escape
  lib/
    lifecycle.ts           # P-02: add runHooksCaptured() export
tests/
  tui/dashboard/
    InlineInput.test.tsx   # update for new component + add cursor movement test
  lib/
    lifecycle.test.ts      # new: tests for runHooksCaptured
```

### Pattern 1: InlineInput as built-in `<input>` wrapper

**What:** Wrap `<input>` in a row box with a label text. Layer `useKeyboard` for escape → onCancel.
**When to use:** This IS the InlineInput implementation.
**Example:**
```typescript
// Source: @opentui/core/renderables/Input.d.ts + @opentui/solid/src/types/elements.d.ts (inspected locally)
/** @jsxImportSource @opentui/solid */
import { useKeyboard } from "@opentui/solid"
import type { InputRenderable } from "@opentui/core"

type Props = {
  label: string
  prefill: string
  onConfirm: (value: string) => void
  onCancel: () => void
  ref?: (el: InputRenderable) => void
}

export function InlineInput(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
  })

  return (
    <box flexDirection="row">
      <text fg="cyan">  {props.label}: </text>
      <input
        ref={props.ref}
        value={props.prefill}
        focused={true}
        onSubmit={(v) => props.onConfirm(v)}
      />
    </box>
  )
}
```

**Key points:**
- `value` prop sets the prefill (cursor starts at end of prefill — standard behavior)
- `focused={true}` ensures the input receives keyboard events when mounted
- `onSubmit` maps to `onConfirm` (InputRenderable fires `ENTER` event on return key)
- `useKeyboard` overlay fires for ALL keys including escape — but the built-in input consumes arrow keys etc. before the overlay sees them (OpenTUI's input's `handleKeyPress` returns `true` for handled keys, suppressing propagation)
- `ref` prop type is `InputRenderable` from `@opentui/core`

### Pattern 2: Cursor movement test with testRender

**What:** Press left arrow to move cursor back, then type a character to assert mid-string insertion.
**When to use:** T-03 cursor movement requirement.
**Example:**
```typescript
// Source: @opentui/core/testing/mock-keys.d.ts (inspected locally)
test("left-arrow then type inserts character at cursor position", async () => {
  let confirmed = ""
  const { mockInput, renderOnce } = await testRender(
    () => <InlineInput label="Name" prefill="ac" onConfirm={(v) => { confirmed = v }} onCancel={() => {}} />
  )
  await renderOnce()
  mockInput.pressArrow("left")  // cursor moves before "c"
  await renderOnce()
  await mockInput.typeText("b")  // inserts "b" at cursor → "abc"
  await renderOnce()
  mockInput.pressEnter()
  await renderOnce()
  expect(confirmed).toBe("abc")
})
```

**Key points:**
- `pressArrow("left")` sends `\x1B[D` (ARROW_LEFT escape sequence)
- The built-in input's `moveCursorLeft()` handles this — no delay needed (not a bare `\x1B`)
- `typeText` is async; always `await` it

### Pattern 3: runHooksCaptured implementation

**What:** Spawn process with piped stdio, read lines, call callback, return result array.
**When to use:** This IS the runHooksCaptured implementation shape.
**Example:**
```typescript
// Source: src/tui/dashboard/App.tsx handleRun() pattern + src/lib/lifecycle.ts (inspected locally)
import { spawn } from "bun"

export type HookOutputLine = {
  line: string
  stream: "stdout" | "stderr"
}

export type HookResult = {
  exitCode: number
  failed: boolean
  command: string
}

export async function runHooksCaptured(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  onOutput: (output: HookOutputLine) => void,
  abortOnFailure = true
): Promise<HookResult[]> {
  if (!commands || commands.length === 0) return []

  const mergedEnv = { ...process.env, ...env } as Record<string, string>
  const results: HookResult[] = []

  for (const cmd of commands) {
    const proc = spawn(["sh", "-c", cmd], {
      cwd,
      env: mergedEnv,
      stdout: "pipe",
      stderr: "pipe",
    })

    const decoder = new TextDecoder()
    let stdoutBuf = ""
    let stderrBuf = ""

    // Read stdout
    const stdoutReader = proc.stdout.getReader()
    const stderrReader = proc.stderr.getReader()

    const readStream = async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      stream: "stdout" | "stderr",
      buf: { value: string }
    ) => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          // Flush any remaining partial line
          if (buf.value) { onOutput({ line: buf.value, stream }); buf.value = "" }
          break
        }
        const text = decoder.decode(value)
        buf.value += text
        const lines = buf.value.split("\n")
        buf.value = lines.pop() ?? ""
        for (const line of lines) {
          if (line) onOutput({ line, stream })
        }
      }
    }

    const stdoutState = { value: stdoutBuf }
    const stderrState = { value: stderrBuf }

    await Promise.all([
      readStream(stdoutReader, "stdout", stdoutState),
      readStream(stderrReader, "stderr", stderrState),
    ])

    const exitCode = await proc.exited
    const result: HookResult = { exitCode, failed: exitCode !== 0, command: cmd }
    results.push(result)

    if (abortOnFailure && exitCode !== 0) break
  }

  return results
}
```

**Notes on reading both streams concurrently:** Reading stdout and stderr serially risks deadlock if the subprocess fills one pipe's buffer while waiting for the other to be drained. Always read them with `Promise.all`.

### Pattern 4: Testing runHooksCaptured

**What:** Unit test using a known command that produces output to stdout/stderr.
**When to use:** P-02 test.
**Example:**
```typescript
import { describe, test, expect } from "bun:test"
import { runHooksCaptured } from "../../../src/lib/lifecycle"

describe("runHooksCaptured", () => {
  test("captures stdout lines via callback", async () => {
    const lines: { line: string; stream: string }[] = []
    const results = await runHooksCaptured(
      ["echo hello && echo world"],
      "/tmp",
      {},
      (out) => lines.push(out)
    )
    expect(lines.map(l => l.line)).toEqual(["hello", "world"])
    expect(results[0].exitCode).toBe(0)
    expect(results[0].failed).toBe(false)
  })

  test("captures stderr separately", async () => {
    const lines: { line: string; stream: string }[] = []
    await runHooksCaptured(
      ["echo err >&2"],
      "/tmp",
      {},
      (out) => lines.push(out)
    )
    expect(lines.find(l => l.stream === "stderr")?.line).toBe("err")
  })

  test("stops sequence on first failure when abortOnFailure=true", async () => {
    const commands: string[] = []
    const results = await runHooksCaptured(
      ["exit 1", "echo second"],
      "/tmp",
      {},
      () => {}
    )
    expect(results).toHaveLength(1)
    expect(results[0].failed).toBe(true)
  })

  test("returns empty array for undefined commands", async () => {
    const results = await runHooksCaptured(undefined, "/tmp", {}, () => {})
    expect(results).toEqual([])
  })
})
```

### Anti-Patterns to Avoid

- **Calling `onSubmit` instead of `onConfirm` in InlineInput:** The built-in `<input>` fires `onSubmit(value: string)` on enter. Map this to `onConfirm` in the wrapper so the external API is unchanged.
- **Not using `focused={true}` on `<input>`:** Without it, the built-in input does not receive keyboard events even though `useKeyboard` is active globally.
- **Reading stdout then stderr serially in runHooksCaptured:** If the subprocess writes more than the pipe buffer to one stream while waiting for the other, the process can deadlock. Use `Promise.all` to drain both concurrently.
- **Using `for await ... of proc.stdout` instead of getReader():** Either works in Bun, but `getReader()` is already the established pattern in this codebase (App.tsx `handleRun`). Stay consistent.
- **Asserting escape in InlineInput tests without the 50ms delay:** `pressEscape()` sends `\x1B`. The OpenTUI parser holds `\x1B` briefly to check if more bytes follow. Always add `await new Promise(r => setTimeout(r, 50))` between `pressEscape()` and the assertion.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cursor position tracking in text input | Manual index tracking + split/join string rendering | `<input>` built-in (InputRenderable) | EditBuffer handles UTF, selection, undo/redo, Home/End, word movement — all edge cases handled |
| Blinking cursor rendering | Custom cursor timer + render cycle | `<input>` built-in with `cursorStyle: "block"` + `showCursor: true` (defaults) | CursorState in Zig renderer handles blinking via terminal sequences |
| Line-buffering subprocess output | Manual chunk accumulation with partial-line state | Stream reader pattern in runHooksCaptured (see Code Examples) | Chunks from ReadableStream do not align with newlines — requires partial-line buffer |

**Key insight:** The built-in input already solved the hardest parts of text editing. Adding cursor movement to the hand-rolled component would require implementing the same logic that `EditBufferRenderable` already provides.

## Common Pitfalls

### Pitfall 1: `focused` prop required for built-in input to receive keys

**What goes wrong:** `<input>` renders but ignores all keystrokes; `onSubmit` never fires.
**Why it happens:** OpenTUI's built-in input only handles keyboard events when focused. Without `focused={true}`, the input renders but is passive.
**How to avoid:** Always pass `focused={true}` in InlineInput wrapper when the component is visible.
**Warning signs:** Test typing into the new InlineInput and observing no character output.

### Pitfall 2: `useKeyboard` overlay fires for ALL keys, not just escape

**What goes wrong:** The `useKeyboard` overlay in InlineInput fires for arrow keys, letters — interfering with the built-in input's handling.
**Why it happens:** `useKeyboard` is a global broadcast; the overlay always sees the event.
**How to avoid:** In the `useKeyboard` callback, only act on `key.name === "escape"` and immediately return. Do NOT call anything for other keys — they should fall through to the built-in input's `handleKeyPress`.
**Warning signs:** Arrow keys don't move cursor; typing inserts nothing or double-inserts.

**Critical nuance:** This was spike-verified: the `useKeyboard` overlay for escape fires correctly alongside the built-in input handling other keys. The built-in input's `handleKeyPress` returns `true` for keys it consumes, but `useKeyboard` is a separate event subscription — both receive the event. The escape overlay must only handle escape and ignore everything else.

### Pitfall 3: onSubmit receives value, not a SubmitEvent

**What goes wrong:** TypeScript error or runtime error when calling `props.onConfirm(v)` from `onSubmit`.
**Why it happens:** The `InputProps.onSubmit` type from `@opentui/solid` is `(value: string) => void` — it already passes the current value. This differs from `TextareaOptions.onSubmit` which passes a `SubmitEvent` object.
**How to avoid:** Use `onSubmit={(v) => props.onConfirm(v)}` directly — `v` is a string.
**Warning signs:** TypeScript error `Type 'SubmitEvent' is not assignable to 'string'`.

### Pitfall 4: Partial lines at subprocess stream end

**What goes wrong:** Last line of subprocess output is lost (never passed to `onOutput`).
**Why it happens:** Subprocess may exit without a final `\n`. The accumulation buffer holds the last partial line but the `while(true)` loop ends when `done: true` before it can be flushed.
**How to avoid:** After the read loop exits, flush any remaining buffer content. See the `readStream` helper in the Code Examples section — it flushes `buf.value` on `done`.
**Warning signs:** Test counting output lines and getting N-1 instead of N.

### Pitfall 5: Escape delay in tests is 50ms minimum, not 0

**What goes wrong:** Escape tests fail intermittently or consistently because `cancelled` is still `false` after `pressEscape()` + `renderOnce()`.
**Why it happens:** `pressEscape()` sends `\x1B`. The OpenTUI escape-sequence parser holds `\x1B` briefly (disambiguating from arrow/function key prefix). This is inherent to the parser.
**How to avoid:** All escape tests must include `await new Promise(r => setTimeout(r, 50))` between `pressEscape()` and the assertion. This is the established project pattern (from Phase 10 discovery). InlineInput.test.tsx already uses 150ms for robustness — keep that.

## Code Examples

Verified patterns from local inspection of installed packages and existing codebase:

### InputProps type (what `<input>` accepts)
```typescript
// Source: @opentui/solid/src/types/elements.d.ts (inspected locally)
export type InputProps = ComponentProps<InputRenderableOptions, InputRenderable> & {
  focused?: boolean
  onInput?: (value: string) => void
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
}

// InputRenderableOptions (relevant props):
// value?: string           — initial value (prefill)
// maxLength?: number
// placeholder?: string
```

### InputRenderable ref type
```typescript
// Source: @opentui/core/renderables/Input.d.ts (inspected locally)
import type { InputRenderable } from "@opentui/core"

// Use as ref type in InlineInput Props:
type Props = {
  // ...
  ref?: (el: InputRenderable) => void
}
// JSX: <input ref={props.ref} ... />
```

### Existing stream-reading pattern (App.tsx handleRun)
```typescript
// Source: src/tui/dashboard/App.tsx lines 162-180 (inspected locally)
const proc = Bun.spawn(["git-stacks", "run", name], {
  stdout: "pipe",
  stderr: "inherit",
})
const reader = proc.stdout.getReader()
const decoder = new TextDecoder()
try {
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value)
    for (const line of text.split("\n")) {
      if (line) setProgressLines(prev => [...prev, line])
    }
  }
} catch {}
await proc.exited
```

**For runHooksCaptured:** Replace `stderr: "inherit"` with `stderr: "pipe"`, add a second reader for stderr, and drain both concurrently with `Promise.all`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled cursor with `_` hack | Built-in `<input>` element | Phase 11 (now) | Free cursor movement, selection, undo/redo, blinking cursor |
| `runHooks` throws on failure | `runHooksCaptured` returns result array | Phase 11 (now) | TUI callers show errors in UI instead of catching exceptions |
| Hooks write to inherited stdio | Hooks captured via pipe to callback | Phase 11 (now) | TUI context-safe: no terminal writes during OpenTUI rendering |

**Deprecated/outdated:**
- Hand-rolled `InlineInput` keyboard handler: replaced by built-in input wrapper. The old `useKeyboard` in InlineInput that handles letters/backspace/arrow is deleted entirely.

## Open Questions

1. **Does `focused={true}` need to be set dynamically when InlineInput is shown/hidden, or is always-focused acceptable?**
   - What we know: App.tsx uses `<Show when={view().view === "inline-input"}>` — InlineInput is only mounted when active
   - What's unclear: Whether OpenTUI's global `useKeyboard` in App.tsx interferes while InlineInput is mounted with `focused={true}`
   - Recommendation: Since App.tsx already ignores keys when `v.view === "inline-input"` (line 454: `if (v.view === "inline-input") return`), there is no interference. Always-focused is correct.

2. **Does `value` prop on `<input>` set cursor to end of prefill or to position 0?**
   - What we know: CONTEXT.md states "Cursor starts at end of prefill value (set via `value` prop). Standard behavior users expect." Spike confirmed this.
   - What's unclear: Nothing — spike has verified this works.
   - Recommendation: Use `value={props.prefill}` and trust standard behavior.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Bun 1.3.10 built-in) |
| Config file | bunfig.toml — `[test]` section `preload = ["@opentui/solid/preload"]` |
| Quick run command | `bun test tests/tui/dashboard/InlineInput.test.tsx` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P-01 | InlineInput left-arrow + insert produces correct string | unit | `bun test tests/tui/dashboard/InlineInput.test.tsx` | Partially (file exists; cursor test to be added) |
| P-01 | InlineInput typing, backspace, escape, enter, prefill continue to work | unit | `bun test tests/tui/dashboard/InlineInput.test.tsx` | Yes (6 tests pass today) |
| P-02 | runHooksCaptured stdout lines arrive via callback, not terminal | unit | `bun test tests/lib/lifecycle.test.ts` | No — Wave 0 gap |
| P-02 | runHooksCaptured stderr captured separately | unit | `bun test tests/lib/lifecycle.test.ts` | No — Wave 0 gap |
| P-02 | runHooksCaptured stops on first failure | unit | `bun test tests/lib/lifecycle.test.ts` | No — Wave 0 gap |
| T-03 (cursor) | Cursor movement test: left-arrow + mid-string insert | unit | `bun test tests/tui/dashboard/InlineInput.test.tsx` | No — Wave 0 gap (new test in existing file) |

### Sampling Rate
- **Per task commit:** `bun test tests/tui/dashboard/InlineInput.test.tsx` (for P-01 task), `bun test tests/lib/lifecycle.test.ts` (for P-02 task)
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/lifecycle.test.ts` — covers P-02 (runHooksCaptured stdout, stderr, failure behavior, empty commands)
- [ ] New test case in `tests/tui/dashboard/InlineInput.test.tsx` — covers T-03 cursor movement

*(Existing `tests/tui/dashboard/InlineInput.test.tsx` has 6 tests; the file exists but needs 1 new test and updates to all 6 for the new `<input>`-based component)*

## Sources

### Primary (HIGH confidence)
- `node_modules/@opentui/core/renderables/Input.d.ts` — InputRenderable, InputRenderableOptions, events
- `node_modules/@opentui/core/renderables/Textarea.d.ts` — TextareaRenderable methods (cursor movement, selection, undo/redo)
- `node_modules/@opentui/core/renderables/EditBufferRenderable.d.ts` — EditBufferOptions (showCursor, cursorStyle, etc.)
- `node_modules/@opentui/solid/src/types/elements.d.ts` — InputProps (focused, onInput, onChange, onSubmit)
- `node_modules/@opentui/solid/index.d.ts` — testRender export confirmed
- `node_modules/@opentui/core/testing/mock-keys.d.ts` — pressArrow, typeText, pressEscape, etc.
- `src/tui/dashboard/App.tsx` — existing ReadableStream + getReader() pattern (handleRun)
- `src/lib/lifecycle.ts` — existing runHooks() to extend
- `tests/tui/dashboard/InlineInput.test.tsx` — current 6 tests to update
- `.planning/phases/11-tui-prerequisites/11-CONTEXT.md` — locked decisions, spike results

### Secondary (MEDIUM confidence)
- `.planning/phases/10-test-harness/10-02-SUMMARY.md` — confirmed: 50ms escape delay, bunfig.toml [test] preload requirement, established test patterns

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed in node_modules; no new installs needed
- Architecture: HIGH — built-in input type signatures directly inspected; stream pattern directly observed in App.tsx; spike confirmed
- Pitfalls: HIGH — focused prop, useKeyboard ordering, and escape delay all confirmed via Phase 10 execution and type inspection

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable library, no fast-moving surface)
