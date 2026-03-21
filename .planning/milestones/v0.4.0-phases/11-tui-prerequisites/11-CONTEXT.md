# Phase 11: tui-prerequisites — Context

**Created:** 2026-03-21
**Phase goal:** InlineInput supports cursor-positioned editing and hook output is capturable as a stream, unblocking all wizard and create-flow work.
**Requirements:** P-01 (cursor movement), P-02 (captured hook output)

## Decisions

### 1. InlineInput: Replace with built-in `<input>` wrapper

**Decision:** Replace the hand-rolled `InlineInput` (manual `useKeyboard` + `<text>` + trailing `_` cursor) with a thin wrapper around OpenTUI's built-in `<input>` JSX element.

**Why:** The built-in `<input>` (backed by `InputRenderable` → `TextareaRenderable` → `EditBufferRenderable`) provides cursor movement, blinking cursor, word-level movement, Home/End, delete forward/backward, undo/redo, text selection, and Ctrl+A all for free. Our custom component reimplements a fraction of this and would require significant work to add cursor positioning.

**Spike verified:** All 5 tests passed — typing, left-arrow + mid-string insert, enter/submit, escape via `useKeyboard` overlay, and prefill display all work correctly with `testRender`.

**Wrapper responsibilities:**
- Wrap `<input>` in a `<box flexDirection="row">` with a `<text>` label (same visual pattern as current)
- Layer `useKeyboard` for escape → `onCancel` (built-in input has no cancel action)
- Map `onSubmit` → `onConfirm` prop
- Expose `InputRenderable` ref via prop for parent focus management (Phase 13 wizards will need this)
- Props: `label`, `prefill`, `onConfirm`, `onCancel`, `ref?`

**What this gives us for free (accept all, no restrictions):**
- Left/right cursor movement
- Home/End, Ctrl+A/Ctrl+E
- Ctrl+Left/Right word movement
- Delete forward, delete word forward/backward
- Shift+arrow text selection, Ctrl+A select-all
- Undo/redo
- Blinking block cursor (default)
- No keybinding conflicts — input shortcuts only fire when the input is focused

### 2. Cursor visual indicator

**Decision:** Use the built-in `<input>` component's native cursor rendering — blinking block cursor, style `"block"`, `blinking: true` (the default).

**Why:** No custom cursor indicator needed. The built-in component renders a proper terminal cursor with blinking support via the Zig renderer's `CursorState`. Eliminates the trailing `_` hack entirely.

**Empty state:** Built-in input supports `placeholder` prop for empty state guidance.

**Initial cursor position:** Cursor starts at end of prefill value (set via `value` prop). Standard behavior users expect.

### 3. runHooksCaptured: separate function with line-based callbacks

**Decision:** Create `runHooksCaptured()` as a new export in `src/lib/lifecycle.ts`, separate from `runHooks()`.

**API shape:**
```typescript
type HookOutputLine = {
  line: string
  stream: "stdout" | "stderr"
}

type HookResult = {
  exitCode: number
  failed: boolean
  command: string
}

async function runHooksCaptured(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  onOutput: (output: HookOutputLine) => void,
  abortOnFailure?: boolean  // default true — stops sequence on first failure
): Promise<HookResult[]>
```

**Key choices:**
- **Line-at-a-time callback** (not raw chunks) — downstream consumers (ProgressView, wizard) want displayable lines
- **stdout/stderr separated** via `stream` discriminator — lets TUI style errors differently (e.g., red)
- **Returns result array** instead of throwing — TUI callers show "hook failed" in the UI, not catch exceptions. `abortOnFailure` still stops the sequence early but returns results collected so far.
- **Separate function** from `runHooks` — different return type (void vs HookResult[]), clear intent, zero risk to existing callers
- **Implementation:** Use `stdout: "pipe", stderr: "pipe"` on `Bun.spawn`, read lines from readable streams, call `onOutput` per line

### 4. Existing InlineInput tests

**Decision:** Update existing tests in `tests/tui/dashboard/InlineInput.test.tsx` to work with the new `<input>`-based wrapper. All current test scenarios (typing, backspace, escape, enter, prefill) should continue to pass. Add new tests for cursor movement (left-arrow + insert mid-string).

## Code Context

**Files to modify:**
- `src/tui/dashboard/InlineInput.tsx` — rewrite to wrap `<input>` + `useKeyboard` for escape
- `src/lib/lifecycle.ts` — add `runHooksCaptured()` export
- `tests/tui/dashboard/InlineInput.test.tsx` — update for new component, add cursor movement tests

**Files that import InlineInput (no API change needed if props stay the same):**
- `src/tui/dashboard/App.tsx` — uses InlineInput for rename

**Integration points:**
- `runHooksCaptured` will be consumed by Phase 12 (sync ProgressView) and Phase 13 (workspace create wizard)
- `InputRenderable` ref exposure will be consumed by Phase 13 (wizard focus management)

## Deferred Ideas

None — phase scope is tight.

---
*Context created: 2026-03-21*
