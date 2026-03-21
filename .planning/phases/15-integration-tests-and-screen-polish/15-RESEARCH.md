# Phase 15: integration-tests-and-screen-polish - Research

**Researched:** 2026-03-21
**Domain:** OpenTUI/SolidJS TUI testing, responsive terminal layout, SolidJS reactive memos
**Confidence:** HIGH

## Summary

Phase 15 is purely implementation — no new libraries are required. All tooling (testRender, mockInput, captureCharFrame, useTerminalDimensions, formatAge) is already present in the codebase. The four integration tests exercise App.tsx as a whole, seeding YAML fixture files via `GIT_STACKS_CONFIG_DIR` into a tmp dir and mocking git operations so no real worktrees are created. The three UI polish items are surgical replacements of hard-coded `padEnd()` values and the static `helpBarText` memo.

The key design constraint for integration tests is that `paths.ts` reads `GIT_STACKS_CONFIG_DIR` at **module load time**. Because Bun shares a module cache within a test run, tests that import App.tsx in the same process as other tests that already imported `paths.ts` will see the cached dir, not the tmp dir. The established workaround (used in `paths.test.ts`) is subprocess spawning — the integration tests must use `mock.module` (Bun's module mock) or arrange that the env var is set before the module is first imported. Given that `testRender` renders components inline (not in a subprocess), the safest path is setting `process.env.GIT_STACKS_CONFIG_DIR` before the describe block and then **dynamically importing** App at test time, consistent with the subprocess approach used in paths.test.ts.

However, the CONTEXT.md D-17 states: "Config isolation infra from Phase 10 already supports this." The four integration test files test isolated sub-flows (tab switching, action menu, wizard, sync progress), so the simplest approach for each test file is to set `GIT_STACKS_CONFIG_DIR` before any import of App.tsx and rely on the fact that each test file runs in its own module scope in Bun.

**Primary recommendation:** Write four test files in `tests/tui/dashboard/` — one per flow. Each file sets `process.env.GIT_STACKS_CONFIG_DIR` at the top before importing App, seeds YAML fixtures with `write()` from `tests/helpers.ts`, and mocks git ops with `mock.module`. UI changes are three surgical patches to existing source files.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Help bar condensation (UI-01)**
- D-01: Tiered progressive dropping based on fixed terminal width breakpoints
- D-02: Drop sequence (lowest priority first): `↑↓/jk Navigate` → `1/2/3 Tabs` → `r Refresh` → collapse to `? Help  q Quit`
- D-03: Fixed width tiers: ≥100 full, ≥80 drop Navigate, ≥65 also drop Tabs, ≥50 also drop Refresh, <50 minimal
- D-04: Workspaces tab adds `m Messages` to active tier; Templates/Repos tabs omit it

**Relative age display (UI-02)**
- D-05: Reuse existing `formatAge()` from `messageUtils.ts` on workspace `created` field — `3d`, `2h`, `5m`
- D-06: Detail pane keeps full date — relative age for list row only

**Responsive column widths (UI-03)**
- D-07: Fixed columns stay fixed: prefix (`>[x]`), status indicators, type badges
- D-08: Growable columns: name, branch, path, message preview
- D-09: Minimum widths with `…` truncation: name min 10, branch gets remaining space
- D-10: Repo path truncates from left (`…/repo/path`)
- D-11: Message preview disappears entirely on very narrow terminals
- D-12: No proportional ratios — fixed columns first, name gets min, branch/path get rest

**Detail pane**
- D-13: Detail pane columns stay fixed
- D-14: Long content truncates with `…` rather than overflowing
- D-15: Reflow label+value to vertical stacking where it helps — Claude's discretion

**Integration test scope (T-05)**
- D-16: Four test flows, one file per flow:
  1. Tab switching — press 1/2/3, assert correct tab renders
  2. Action menu → confirm → execute — Enter on workspace, pick action, confirm dialog
  3. Wizard entry → complete → cancel — wizard flow with back-nav via escape
  4. Sync progress flow — action menu → confirm → progress → done → return to list
- D-17: Mocking strategy: seed real config files via `GIT_STACKS_CONFIG_DIR` temp dir. Mock only git operations. Config isolation infra from Phase 10 already supports this.
- D-18: Assertion depth: assert view transitions AND side effects where fixture setup supports it. Do not mock git deeply enough to verify git operations — just verify UI flow completed.

### Claude's Discretion
- Which detail pane fields benefit from vertical stacking reflow vs simple truncation
- Column width allocation formula (how to distribute remaining space among growable columns)
- Test fixture data (workspace names, template configs, repo registry entries)
- Exact breakpoint behavior when help bar items are right at the boundary
- Whether `formatAge()` needs adaptation for `created` field (ISO date string vs timestamp)
- Progress spinner/indicator rendering in sync progress test assertions

### Deferred Ideas (OUT OF SCOPE)
- T-03 partial (InlineInput cursor movement tests)
- T-07 snapshot baseline tests
- R-02/R-03 (repo add/scan from TUI)
- Batch sync from TUI (WS-05)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| T-05 | App-level integration tests cover: tab switching, action menu dispatch, wizard entry/exit, sync progress flow | testRender + mockInput + captureCharFrame pattern; module-level env isolation; mock.module for git ops |
| UI-01 | Help bar content fits within 80 terminal columns without truncation | Replace `helpBarText` createMemo with tiered function of `dims().width`; `useTerminalDimensions()` already reactive |
| UI-02 | Workspace list rows show relative age (`3d`, `2h`, `5m`) instead of ISO date string | `formatAge()` already exists in `messageUtils.ts`; `ws().created` is ISO date string compatible with `new Date(isoTimestamp)` |
| UI-03 | Column widths respond to terminal width (no hard-coded character widths) | `useTerminalDimensions()` already imported in WorkspaceRow.tsx; replace `padEnd(22)`, `padEnd(32)`, `padEnd(24)` etc. with computed widths |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@opentui/solid` | 0.1.87 | testRender, captureCharFrame, mockInput, useTerminalDimensions | Already in use across 8 test files |
| `bun:test` | (Bun 1.3.10) | describe/test/expect/mock/mock.module | Project test runner |
| `solid-js` | (current) | createMemo, reactivity | All UI components use this |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tests/helpers.ts` | (project) | makeTmpDir, cleanup, write, makeFileTree | Seeding YAML fixture files in integration tests |

**No new dependencies required.** All tooling is already installed.

## Architecture Patterns

### Integration Test File Structure

Each integration test file must follow this pattern to guarantee config isolation before App.tsx module is loaded:

```typescript
// MUST be set before any import that reaches paths.ts
// This works because each test file has its own Bun module scope
import { makeTmpDir, cleanup, write } from "../../helpers"

const configDir = makeTmpDir("app-integ-tabs")
process.env.GIT_STACKS_CONFIG_DIR = configDir

// Seed YAML fixtures
// write(configDir, "workspaces/my-ws.yml", yaml)
// write(configDir, "registry.yml", yaml)

// Dynamic import of App happens AFTER env is set
// (or use mock.module for git ops)
```

**Key insight:** Because each `.test.tsx` file in Bun has its own module load scope, setting `process.env.GIT_STACKS_CONFIG_DIR` at file top (before any import that touches `paths.ts`) is sufficient for integration tests. This differs from the `paths.test.ts` subprocess approach — that file tests the paths module itself, so it cannot import it in-process.

### Mock Strategy for Git Operations

Integration tests for flows that would trigger git operations (sync, create workspace) need git ops mocked. Use `mock.module` from bun:test:

```typescript
import { mock } from "bun:test"

mock.module("../../src/lib/git", () => ({
  createWorktree: mock(async () => {}),
  fetchOrigin: mock(async () => {}),
  removeWorktree: mock(async () => {}),
  isWorktreeRegistered: mock(async () => false),
}))
```

This must appear before importing App.tsx.

### YAML Fixture Shape

Workspace fixture (minimal valid shape for `WorkspaceSchema`):
```yaml
name: test-ws
branch: feature/test
created: "2026-01-01T00:00:00.000Z"
repos: []
```

Registry fixture (minimal valid shape for `RepoRegistrySchema`):
```yaml
- name: my-repo
  local_path: /tmp/test-repo
  type: other
  default_branch: main
```

Template fixture (minimal valid shape for `TemplateSchema`):
```yaml
name: my-template
repos:
  - repo: my-repo
    mode: worktree
```

### Help Bar Tier Implementation Pattern

Replace the static `helpBarText` createMemo in `App.tsx` lines 168-176 with a width-aware function:

```typescript
const helpBarText = createMemo(() => {
  const w = dims().width
  const t = tab()

  const msgShortcut = t === "workspaces" ? "  m Messages" : ""
  const minimalBar = "? Help  q Quit"

  if (w < 50) return minimalBar
  const bar50 = `Enter Actions  Space Select  / Filter${msgShortcut}  ? Help  q Quit`
  if (w < 65) return bar50
  const bar65 = `r Refresh  ${bar50}`
  if (w < 80) return bar65
  const bar80 = `1/2/3 Tabs  ${bar65}`
  if (w < 100) return bar80
  return `↑↓/jk Navigate  ${bar80}`
})
```

Note: The exact string ordering follows D-02 drop sequence. The planner should define the canonical full bar string and strip from it.

### Responsive Column Width Pattern

For `WorkspaceRow.tsx`, replace fixed `padEnd(22)` and `padEnd(32)` with computed widths derived from `useTerminalDimensions()` (already imported):

```typescript
const nameWidth = createMemo(() => {
  const w = dims().width
  // Fixed: prefix(5) + space(1) + status(2) + space(1) = 9
  // Fixed: wt/tr indicator ~12 chars minimum
  const fixed = 9 + 12
  const remaining = w - fixed
  const nameMin = 10
  const branchMin = 10
  if (remaining < nameMin + branchMin) return nameMin
  const nameAlloc = Math.min(24, Math.max(nameMin, Math.floor(remaining * 0.35)))
  return nameAlloc
})

const branchWidth = createMemo(() => {
  const w = dims().width
  const fixed = 9 + 12
  const nw = nameWidth()
  // message preview disappears at narrow widths (D-11)
  // branch gets what's left after fixed + name
  return Math.max(10, w - fixed - nw - 4) // -4 for spacing
})
```

For `RepoList.tsx`, replace `padEnd(24)` and `padEnd(12)` with computed widths, and replace the `truncatePath(40)` fixed truncation with a computed available width:

```typescript
// Left-truncate path (D-10): most meaningful part is the right side
function leftTruncate(p: string, maxLen: number): string {
  if (p.length <= maxLen) return p
  return "…" + p.slice(p.length - (maxLen - 1))
}
```

### Age Display Compatibility

`formatAge()` accepts an ISO timestamp string and calls `new Date(isoTimestamp).getTime()`. The workspace `created` field is stored as a string (validated by Zod as `z.string()`). Example value from config.test.ts: `"2026-01-01"`. `new Date("2026-01-01")` parses correctly in V8/Bun. No adaptation needed.

### Integration Test Flow: Tab Switching

```typescript
// tests/tui/dashboard/integ-tab-switching.test.tsx
const renderOpts = { kittyKeyboard: true }

test("pressing 2 switches to Templates tab", async () => {
  const { mockInput, renderOnce, captureCharFrame } = await testRender(
    () => <App />, renderOpts
  )
  await renderOnce()
  mockInput.pressKey("2")
  await renderOnce()
  const frame = captureCharFrame()
  expect(frame).toContain("Templates")  // tab header or list fallback text
})
```

### Integration Test Flow: Wizard Entry and Cancel

The wizard flow requires that App.tsx renders with at least one workspace in the fixture so pressing `n` triggers the create flow. The test asserts view transitions by checking for wizard-specific content in the frame.

### Integration Test Flow: Sync Progress

The sync flow requires mocking `syncWorkspace` in `workspace-ops.ts` to control when the progress callback fires and when the operation resolves. The test asserts: action menu appears, confirm dialog appears after action dispatch, sync progress view appears, done state is shown after sync resolves.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal width detection | Custom signal/polling | `useTerminalDimensions()` from `@opentui/solid` | Already reactive, re-renders on resize |
| Relative time formatting | Custom age formatter | `formatAge()` from `messageUtils.ts` | Already tested, handles s/m/h/d |
| Left-truncating paths | External library | Inline 2-line helper | Simple enough; no library needed |
| Test config isolation | Subprocess spawning | Set `GIT_STACKS_CONFIG_DIR` at file top | Per-file module scope is sufficient for component tests |

## Common Pitfalls

### Pitfall 1: Module Cache — Config Dir Not Isolated
**What goes wrong:** Test sets `GIT_STACKS_CONFIG_DIR` after `paths.ts` has already been loaded by a previous test, so `listWorkspaces()` still reads the real config dir.
**Why it happens:** Bun shares module cache within a test run; `process.env` changes after import have no effect on already-evaluated module-level constants.
**How to avoid:** Set `process.env.GIT_STACKS_CONFIG_DIR` at the very top of the test file, before any import that transitively imports `paths.ts`. Each test file is a separate module scope entry point in Bun.
**Warning signs:** Tests pass when run in isolation but fail (or leak data) when run with the full suite.

### Pitfall 2: Kitty Keyboard Mode Required for Escape
**What goes wrong:** `mockInput.pressEscape()` in tests without `kittyKeyboard: true` requires a `setTimeout(50ms)` before asserting — the escape sequence parser waits for more bytes.
**Why it happens:** Raw `\x1B` is ambiguous — it could start a multi-byte escape sequence. The parser holds it briefly.
**How to avoid:** Always pass `{ kittyKeyboard: true }` as `renderOpts`. Every existing test file already does this.
**Warning signs:** Escape-triggered callbacks are never called, or require setTimeout workarounds.

### Pitfall 3: Deferred Focus After Step Transitions
**What goes wrong:** In multi-step wizard tests, typing on step 2 appears on step 1 because the step transition fires synchronously but focus defers via setTimeout.
**Why it happens:** WizardView mounts new InlineInput with `focused={false}` and uses `setTimeout(..., 0)` to set focus — so the triggering Enter key doesn't leak as first character.
**How to avoid:** After advancing a wizard step, call `await new Promise(r => setTimeout(r, 0))` then `await renderOnce()` before typing into the next step.
**Warning signs:** Step 2 input shows garbled text or Enter from step 1 bleeds into step 2's input.

### Pitfall 4: useWorkspaces Loads from `listWorkspaces()` at Mount Time
**What goes wrong:** App.tsx calls `listWorkspaces()` synchronously when the component mounts — before `renderOnce()` is awaited. If fixtures aren't written before `testRender(...)` is called, the workspace list is empty.
**Why it happens:** `useWorkspaces` calls `listWorkspaces()` in its function body (not in an effect), so it runs immediately at component construction time.
**How to avoid:** Write all YAML fixtures to the tmp config dir before calling `testRender(...)`.
**Warning signs:** App renders "No workspaces found" even though fixtures were written.

### Pitfall 5: Hard-Coded Column Widths Not Responding to Dims
**What goes wrong:** Column widths look correct at 80 columns but overflow or leave wasted space at other widths — `padEnd` was replaced but the new computation uses `dims().width` from a memo that captures dims at creation time rather than reactively.
**Why it happens:** If column width computation is inside JSX strings rather than `createMemo`, it won't re-evaluate on resize.
**How to avoid:** Put all width computations in `createMemo(() => ...)` that closes over `dims()`. `useTerminalDimensions()` returns a reactive signal.
**Warning signs:** Resize test (if written) shows no change in column widths.

### Pitfall 6: `ws().created` May Be Date-Only String
**What goes wrong:** `formatAge("2026-01-01")` parses as midnight UTC; displayed age in local timezones may be off by hours.
**Why it happens:** YAML config stores `created` as a plain date string (e.g. `2026-01-01`), not full ISO timestamp.
**How to avoid:** The discrepancy only matters for sub-day precision — `formatAge` returns `Nd` for multi-day values regardless. For the list row display this is acceptable. No adaptation needed per D-05.
**Warning signs:** Age shows `23h` for a workspace created "today" — this is expected when date-only strings are used.

## Code Examples

### Current helpBarText (to replace)
```typescript
// src/tui/dashboard/App.tsx lines 168-176
const helpBarText = createMemo(() => {
  const t = tab()
  if (t === "workspaces")
    return "1/2/3 Tabs  ↑↓/jk Navigate  Enter Actions  Space Select  m Messages  / Filter  r Refresh  ? Help  q Quit"
  if (t === "templates")
    return "1/2/3 Tabs  ↑↓/jk Navigate  Enter Actions  Space Select  / Filter  r Refresh  ? Help  q Quit"
  return "1/2/3 Tabs  ↑↓/jk Navigate  Enter Actions  Space Select  / Filter  r Refresh  ? Help  q Quit"
})
```

The full bar for workspaces tab is 96 chars. At 80-column terminal this overflows. The new implementation must close over both `dims()` and `tab()`.

### Current WorkspaceRow hard-coded widths (to replace)
```typescript
// src/tui/dashboard/WorkspaceRow.tsx lines 60-65
<text fg="white"> {ws().name.padEnd(22)}</text>
<text fg="cyan"> {ws().branch.padEnd(32)}</text>
// line 65: messagePreview() ? ... : `  ${ws().created}`  ← ISO date to replace with formatAge
```

### Current TemplateList hard-coded width (to replace)
```typescript
// src/tui/dashboard/TemplateList.tsx line 45
<text fg="white">{entry.name.padEnd(22)}</text>
```

### Current RepoList hard-coded widths (to replace)
```typescript
// src/tui/dashboard/RepoList.tsx lines 51-53
<text fg="white">{`  ${entry.name.padEnd(24)}`}</text>
<text fg="cyan">{`  ${entry.type.padEnd(12)}`}</text>
<text fg="gray">{`  ${truncatePath(entry.local_path)}`}</text>  // truncatePath uses fixed 40
```

### formatAge (confirmed compatible, no changes needed)
```typescript
// src/tui/dashboard/messageUtils.ts lines 9-19
export function formatAge(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60) return `${diffSecs}s`
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d`
}
```

### Passing terminal width to TemplateList and RepoList

`TemplateList` and `RepoList` currently receive a `height` prop from App.tsx but not `width`. They also do not currently call `useTerminalDimensions()` themselves. Two options:

**Option A (preferred):** Call `useTerminalDimensions()` inside `TemplateList` and `RepoList` directly — consistent with how `WorkspaceRow` already does it. No new props needed.

**Option B:** Add a `width` prop passed from App.tsx. Adds prop threading but makes the dependency explicit.

Option A is preferred because `WorkspaceRow` already uses `useTerminalDimensions()` directly, establishing the pattern.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed `padEnd()` column widths | Computed widths from `useTerminalDimensions()` | Phase 15 | Columns adapt on resize |
| Static ISO date string in list rows | `formatAge()` relative display | Phase 15 | Human-readable workspace ages |
| Static help bar string | Tiered width-breakpoint bar | Phase 15 | Fits 80-column terminals |

## Open Questions

1. **mock.module scope in Bun**
   - What we know: `mock.module` in bun:test replaces a module's exports for the current test file scope
   - What's unclear: Whether `mock.module("../../src/lib/git", ...)` applies when App.tsx imports `../../lib/git` (the paths differ by one directory level relative to the test file)
   - Recommendation: Use the absolute path from the project root or verify that Bun resolves by canonical path. If uncertain, test with a simple mock in an isolated test first. Alternative: pass mock functions as props or use dependency injection if App.tsx is refactored. However, App.tsx currently imports git ops directly, so `mock.module` is the practical path.

2. **Integration test granularity — test App or test flows via sub-components**
   - What we know: The CONTEXT.md specifies "App-level integration tests" using testRender. The existing WizardView tests already exercise isolated sub-components.
   - What's unclear: Whether "App-level" means rendering `<App />` directly (harder, requires full config fixture + all hooks) or rendering the flow-relevant sub-tree (easier, more targeted)
   - Recommendation: For tab-switching and help bar tests, render `<App />` directly. For action menu → confirm flow, rendering `<App />` with fixtures is cleanest. For sync progress, rendering `<SyncProgressView>` directly is already tested at unit level; the integration test should exercise the App keyboard routing that leads to the SyncProgressView being rendered.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Bun 1.3.10) |
| Config file | bunfig.toml `[test]` section with `preload = ["@opentui/solid/preload"]` |
| Quick run command | `bun test tests/tui/dashboard/integ-` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| T-05 | Tab switching (1/2/3 keys) | integration | `bun test tests/tui/dashboard/integ-tab-switching.test.tsx` | ❌ Wave 0 |
| T-05 | Action menu dispatch → confirm | integration | `bun test tests/tui/dashboard/integ-action-menu.test.tsx` | ❌ Wave 0 |
| T-05 | Wizard entry/complete/cancel | integration | `bun test tests/tui/dashboard/integ-wizard.test.tsx` | ❌ Wave 0 |
| T-05 | Sync progress flow | integration | `bun test tests/tui/dashboard/integ-sync-progress.test.tsx` | ❌ Wave 0 |
| UI-01 | Help bar ≤80 chars at 80-col terminal | unit | `bun test tests/tui/dashboard/` (via App render assertion) | ❌ inline in integ-tab-switching |
| UI-02 | WorkspaceRow shows `3d` not ISO date | unit | `bun test tests/tui/dashboard/` | ❌ inline in integ-tab-switching |
| UI-03 | Column widths change with terminal width | unit | `bun test tests/tui/dashboard/` | ❌ inline in integ-tab-switching |

### Sampling Rate
- **Per task commit:** `bun test tests/tui/dashboard/`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/tui/dashboard/integ-tab-switching.test.tsx` — covers T-05 (tab switching), UI-01 (help bar), UI-02 (age display), UI-03 (column widths)
- [ ] `tests/tui/dashboard/integ-action-menu.test.tsx` — covers T-05 (action menu dispatch)
- [ ] `tests/tui/dashboard/integ-wizard.test.tsx` — covers T-05 (wizard entry/exit)
- [ ] `tests/tui/dashboard/integ-sync-progress.test.tsx` — covers T-05 (sync progress flow)

All four test files are new; no existing infrastructure gaps (framework, preload, helpers already exist).

## Sources

### Primary (HIGH confidence)
- Direct source code inspection: `src/tui/dashboard/App.tsx`, `WorkspaceRow.tsx`, `TemplateList.tsx`, `RepoList.tsx`, `messageUtils.ts`
- Direct source code inspection: `tests/tui/dashboard/*.test.tsx` — 8 existing test files establishing patterns
- Direct source code inspection: `tests/lib/paths.test.ts` — GIT_STACKS_CONFIG_DIR isolation pattern
- Direct source code inspection: `src/lib/paths.ts` — env var read at module load time
- Direct source code inspection: `bunfig.toml` — test preload configuration
- CONTEXT.md decisions D-01 through D-18 (verbatim requirements)

### Secondary (MEDIUM confidence)
- Bun 1.3.10 documentation on `mock.module` behavior (per-file scope)
- `@opentui/solid` 0.1.87 `useTerminalDimensions` reactive behavior (inferred from WorkspaceRow.tsx usage)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, versions verified from installed packages
- Architecture: HIGH — patterns directly copied from existing test files in the same codebase
- Pitfalls: HIGH — derived from `STATE.md` accumulated decisions and direct source reading
- Test strategy: MEDIUM — `mock.module` path resolution is the one uncertain point

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable codebase, no external library updates needed)
