# Pitfalls Research

**Domain:** v0.4.0 — E2E test infrastructure + wizard flows (create workspace/template/repo) + workspace sync in Bun/SolidJS/OpenTUI TUI dashboard
**Researched:** 2026-03-20
**Confidence:** HIGH — derived from direct codebase analysis of current source, established patterns, and known OpenTUI constraints

---

## Critical Pitfalls

### Pitfall 1: Testing OpenTUI Components Is Nearly Impossible Without a Headless Renderer

**What goes wrong:**
There is no headless or virtual renderer for OpenTUI. Any test that attempts to `render()` an OpenTUI component will try to write to stdout, enter raw terminal mode, and manipulate the terminal — which breaks in CI environments (no TTY), test runners (captured stdout), and parallel test execution. You cannot test that a component renders correctly by inspecting its output, because the output goes directly to the terminal escape code stream, not to a queryable DOM.

Attempting to mock `@opentui/solid` and `@opentui/core` deeply enough to unit-test component rendering is a dead end. The renderer, layout engine, and keyboard event system are tightly coupled in the OpenTUI internals — there is no public test API.

**Why it happens:**
OpenTUI is a terminal rendering library with no browser-style JSDOM equivalent. The rendering target is a real terminal, not a virtual tree that can be snapshot-tested. This is the same fundamental problem as testing `ink` (the React-based terminal library) — ink solved it by providing an `ink-testing-library` with a virtual output buffer. OpenTUI has no equivalent as of 2026.

**How to avoid:**
The correct testing strategy for this codebase has three tiers, and they must be kept separate:

1. **Unit test pure logic extracted from components** — `messageUtils.ts`, `groupBySender`, `formatAge`, validation functions, form state machines, and anything that can be separated from OpenTUI JSX. These test with `bun test` normally. The existing `tests/tui/messageUtils.test.ts` is the exact right model.

2. **Unit test the underlying lib functions** — `workspace-ops.ts`, `git.ts`, `config.ts`. These already have tests in `tests/lib/`. New create/sync operations must expose their core logic as testable lib functions before wiring them into the TUI. Test the lib, not the TUI component that calls the lib.

3. **Smoke/integration tests via CLI subprocess** — spawn `bun run src/index.ts manage` as a child process with a real (but temporary) config directory, send keystrokes via PTY, and assert on the terminal output buffer. This is what tools like `xterm.js` headless or `node-pty` + `expect`-style scripting provide. This approach is feasible but has high implementation cost — it is the right approach for e2e validation, but should be scoped carefully.

Do not waste time trying to mock OpenTUI internals for rendering tests. Write zero rendering tests. Write extensive logic tests.

**Warning signs:**
- A test file imports from `@opentui/solid` or `@opentui/core` directly — this will fail or require extensive mocking.
- A test description says "renders correctly" or "shows the right text" — this is a rendering test and will not work.
- A test attempts to call `render()` from `@opentui/solid` — even with mocks, this will break.

**Phase to address:** E2E test infrastructure phase — must establish the three-tier testing model as the first deliverable, before writing any tests. The model needs to be documented so future phases follow it automatically.

---

### Pitfall 2: PTY-Based E2E Tests Are Brittle Against Terminal Width, Speed, and Render Timing

**What goes wrong:**
If you implement PTY-based e2e tests (spawning the TUI in a headless PTY, sending keystrokes, asserting on the output buffer), they will be extremely sensitive to:
- **Terminal width/height assumptions** — the TUI renders differently at 80 vs 120 vs 200 columns. A test that asserts `"[1 Workspaces]"` is on the first line will fail when the terminal is narrower than expected.
- **Render timing** — OpenTUI renders at 30fps (`targetFps: 30`). A keypress sent immediately after the previous one may arrive before the TUI has re-rendered, causing the assertion to see the pre-keypress state.
- **Async status loading** — `useWorkspaces` loads git status asynchronously. If your e2e test asserts on workspace status before async fetching completes, it will see "pending" indicators and fail.
- **File system state** — tests need a fully isolated config directory or they will see real user workspaces, which are unpredictable.

**Why it happens:**
Terminal applications don't have a stable DOM to query. The only observable output is raw terminal escape codes, which are fragile to assert on. Timing is non-deterministic — async git operations, the render loop, and keystroke processing all run concurrently.

**How to avoid:**
- Set a fixed terminal size in PTY-based tests: `pty.spawn(..., { cols: 120, rows: 40 })`. Hard-code all output assertions to assume 120x40.
- After sending keystrokes, wait for a stable-state marker rather than a fixed timeout. For example, after opening the TUI, wait until the help bar text appears (it only renders when not loading). `await waitForText(pty, "r Refresh")` is more robust than `await sleep(500)`.
- Redirect `HOME` or set `XDG_CONFIG_HOME` to a temp directory in every e2e test. Populate it with fixture YAML files representing known workspaces/templates/repos before launching.
- Never assert on terminal escape codes directly. Strip ANSI codes before asserting (`output.replace(/\x1b\[[0-9;]*m/g, "")`) and assert on plain text.
- Keep PTY-based tests to a small set of smoke tests (5–10) covering the most critical user paths. Do not try to cover every feature with PTY tests.

**Warning signs:**
- E2e tests pass locally but fail in CI with "text not found" — likely a timing or terminal size issue.
- E2e tests are flaky at a rate above 5% — timing assumptions are wrong; add proper wait conditions.
- An e2e test file exceeds 300 lines — scope creep; the PTY test suite should be minimal.

**Phase to address:** E2E test infrastructure phase — establish the PTY harness with the right abstractions (fixed terminal size, ANSI stripping, wait-for-text helpers) before writing any actual test cases.

---

### Pitfall 3: Wizard Flows (Multi-Step Create) Cannot Use `@clack/prompts` Inside the TUI Renderer — They Conflict

**What goes wrong:**
The existing `workspace-wizard.ts`, `template-wizard.ts`, and `repo-wizard.ts` use `@clack/prompts` (`p.text`, `p.select`, `p.multiselect`). These prompts take over the terminal directly — they write to stdout and read from stdin in their own input loop. This is fundamentally incompatible with having the OpenTUI renderer active at the same time.

If you try to trigger a `@clack/prompts` flow from within the TUI (e.g., pressing "n" in the workspace action menu to create a new workspace), the clack prompts will write to the terminal while OpenTUI is also writing to it — causing garbled output. Even with `renderer.suspend()`, the clack prompts may not restore terminal state correctly when the TUI resumes, because clack leaves the terminal in a different mode than it found it.

This is why the current TUI only calls `renderer.suspend()` for `$EDITOR` launches, and only for that — it does not invoke any `@clack/prompts` flows from within the TUI at all.

**Why it happens:**
`@clack/prompts` and OpenTUI both assume exclusive ownership of the terminal. They each manage raw mode, cursor visibility, and stdin handling. There is no protocol for one to yield to the other and then resume cleanly.

**How to avoid:**
Create wizard flows inside the TUI using the existing TUI primitives — specifically the multi-step `InlineInput` pattern extended to a "form wizard" flow. The wizard is a new `UIView` state (e.g., `{ view: "wizard"; step: number; data: Partial<WizardState> }`) that renders fields one step at a time using the existing `InlineInput` component as the building block, with a `StepIndicator` component to show progress.

Do not attempt to invoke `@clack/prompts` from within the TUI under any circumstances. The clack-based wizards (`workspace-wizard.ts`, `template-wizard.ts`) remain available as standalone CLI commands (`git-stacks new`, `git-stacks template new`) — they do not need to be replaced, only re-implemented as native TUI flows for the dashboard.

The `renderer.suspend()` → clack flow → `renderer.resume()` pattern that some developers attempt is not reliable. `launchEditor()` works only because `$EDITOR` is a well-behaved terminal program that respects SIGWINCH and restores terminal state on exit. `@clack/prompts` does not guarantee this.

**Warning signs:**
- A developer attempts to call `runWorkspaceNew()` from within a TUI action menu handler — this will corrupt the terminal.
- A PR adds `import * as p from "@clack/prompts"` to any file in `src/tui/dashboard/` — this is a red flag.
- The wizard phase starts by trying to wrap clack prompts in a `renderer.suspend()` call — do not proceed with this approach.

**Phase to address:** All create-flow phases (create workspace, create template, create repo from TUI). The constraint must be stated at the start of every wizard phase design.

---

### Pitfall 4: Multi-Step TUI Wizard State Stored in `UIView` Union Grows Unmanageable Without a Form State Machine

**What goes wrong:**
The existing `UIView` union has simple states: `list`, `action-menu`, `confirm`, `progress`, `inline-input`. Adding multi-step create flows (workspace creation requires: name, template-or-adhoc choice, repo selection, branch, description; template creation requires: name, repo selection, per-repo mode, description) will balloon the `UIView` union.

If you encode wizard steps directly in `UIView` (e.g., `{ view: "create-workspace-step-2"; name: string; mode: "template" | "adhoc" }`), `App.tsx` will have a combinatorial explosion of step-specific keyboard handlers and render branches. The existing keyboard handler is already 160+ lines for 5 simple views.

Additionally, the wizard may need to go "back" — the user presses Escape to go to the previous step, not cancel entirely. This requires wizard state to be a stack, not a flat discriminated union.

**Why it happens:**
The `UIView` approach works beautifully for modal dialogs (confirm, progress, inline-input) because they have exactly one step. It degrades for multi-step flows because each step is a different type of interaction, and the transitions between steps need to carry accumulated form data.

**How to avoid:**
Introduce a dedicated wizard state object alongside `UIView`, not inside it. When the user enters a wizard flow, `UIView` transitions to `{ view: "wizard"; kind: "create-workspace" | "create-template" | "create-repo" }`. The wizard-specific state lives in a separate `createSignal<WizardState>()` scoped to the wizard component. The wizard component handles its own keyboard input via `useKeyboard` (like `ActionMenu` and `ConfirmDialog` already do) and calls `onComplete(result)` or `onCancel()` when done.

This keeps the wizard entirely self-contained: `App.tsx` only has to render `<CreateWorkspaceWizard ... />` when `view().view === "wizard"`. It does not need to know about individual steps.

Each wizard component owns a `step` signal and a partial data accumulator signal. It renders the current step's input and navigates forward/backward via its own `useKeyboard` handler. The `App.tsx` keyboard handler does the same `if (v.view === "wizard") return` early-return it already does for `action-menu` and `confirm`.

**Warning signs:**
- `UIView` union grows beyond 8 variants — sign that wizard steps are being encoded at the wrong level.
- `App.tsx` keyboard handler grows beyond 250 lines — sign that wizard step dispatch is leaking into App.
- A PR adds `step` as a field on the `UIView` object — wrong abstraction level.

**Phase to address:** First wizard phase (whichever create flow is implemented first). The wizard component pattern must be established on the first wizard, then followed for all subsequent ones.

---

### Pitfall 5: Create Operations Must Reload the Correct Data Hook After Writing — Stale Lists Are the #1 UX Bug

**What goes wrong:**
After creating a workspace in the TUI, the workspace list still shows the old state until `reload()` is called on the `useWorkspaces` hook. The same applies to templates and repos. If the wizard's `onComplete` callback forgets to call `reload()` (or calls the wrong hook's reload), the new entity appears to be missing, and the user may attempt to create it again.

More subtle: `useWorkspaces.reload()` re-fetches git status for all workspaces asynchronously (the `fetchStatuses` batch). After creating a new workspace, the new entry will appear in "pending" state during the refetch. If the cursor lands on the new entry before its status is loaded, detail pane shows "pending" — which is correct but may appear as a bug if not expected.

Additionally, `reload()` does not update the cursor position — if there are 5 workspaces, the user creates a 6th, and `reload()` is called, the cursor stays at its previous position. The new workspace may be offscreen.

**Why it happens:**
Data hooks in this TUI are pull-based: they load data on demand and on explicit `reload()` calls. They have no awareness of external writes. After a create operation writes a new YAML file, the hook does not know the file exists until `reload()` is called.

**How to avoid:**
- Every create wizard's `onComplete` callback must call the appropriate `reload()` before calling `setView({ view: "list" })`.
- After reload, set the cursor to point at the newly created entity: `setCursor(newEntryIndex)`. Compute the index from the post-reload list. This requires `reload()` to be synchronous for the cursor update to be correct, or using an `afterReload` callback.
- Design `reload()` to return a `Promise<void>` so the wizard can `await reload()` and then set the cursor. The current `useWorkspaces.reload()` does not return a promise — this will need to be changed for wizard flows.
- For workspace creation specifically, note that `useWorkspaces.reload()` triggers async git status fetching — the new workspace will appear with `state: "pending"` initially. This is correct behavior; do not treat it as an error.

**Warning signs:**
- After creating a workspace, the list still shows the old count — `reload()` was not called.
- Cursor lands on the wrong entry after create — cursor was not updated after reload.
- The new entity is "missing" but actually exists on disk — `reload()` called before the write operation completed.

**Phase to address:** Every wizard create phase. The reload-and-cursor-update pattern should be documented as a required step in the completion protocol for all create operations.

---

### Pitfall 6: Workspace Sync Is an Async Network Operation — `fetchOrigin` Can Block for Tens of Seconds on Slow Remotes

**What goes wrong:**
`syncWorkspace()` calls `fetchOrigin()` for all repos in parallel before the rebase/merge step. `fetchOrigin` is a `git fetch origin` shell call. On a slow remote (high latency, large repo, weak network), this can take 10–60 seconds per repo. With 5 repos in a workspace, the parallel fetch is still gated by the slowest repo.

In the TUI, a sync action that blocks for 30+ seconds with only a spinner and no per-repo progress creates the impression the TUI has hung. The user may press Ctrl+C, which tears down the TUI without completing the sync — leaving repos in a partially-fetched state (some repos fetched, some not; rebase not yet run).

Additionally, if the user navigates away from the progress view (the current implementation allows any key to dismiss the progress view when `progressDone()` is true, but during an operation the only guard is `if (v.view === "progress" && !progressDone()) return`), an inadvertent keypress could re-trigger the TUI's `reload()` or switch tabs in the background.

**Why it happens:**
Network I/O latency is unpredictable and cannot be bounded. The current progress view was designed for operations that complete in under 10 seconds (open, clean, rename). Sync has qualitatively different timing characteristics because it depends on remote network performance.

**How to avoid:**
- Show per-repo progress for sync, not just a global spinner. Each repo's fetch, conflict check, and rebase/merge result should stream into `progressLines` as it completes, not just at the end. The existing `onProgress` callback pattern in `syncWorkspace()` already emits per-repo messages — the TUI just needs to display them as they arrive.
- Add a timeout to `fetchOrigin` — if a single repo's fetch takes more than 30 seconds, skip it with a "fetch timeout" warning and continue with the other repos. This prevents one slow remote from blocking the entire sync.
- Respect the existing `--best-effort` semantics in the TUI: if any repo's sync fails (network error, conflict, dirty worktree), the TUI should continue with remaining repos and show the per-repo results, not abort the entire operation.
- Make the progress view non-dismissible during a sync (or any long-running operation): do not allow any key to dismiss or return to list view until `progressDone()` is true. The current pattern already handles this but verify for sync specifically.

**Warning signs:**
- Sync progress view shows only "Fetching from origin..." for over 30 seconds with no updates — per-repo progress is not being emitted.
- User reports TUI hangs during sync — network timeout is needed.
- After a failed sync (partial), the workspace list still shows the old status — `reload()` must be called even after errors.

**Phase to address:** Workspace sync phase. The timeout and per-repo streaming are must-haves before the feature ships; do not ship a sync action with only a single "syncing..." spinner.

---

### Pitfall 7: Concurrent Sync Operations Can Corrupt Repo State — No Locking on Git Worktrees

**What goes wrong:**
If two sync operations run simultaneously on the same repo (e.g., user triggers sync via TUI and also runs `git-stacks sync <name>` from the terminal), both will run `git fetch origin` and `git rebase origin/main` on the same worktree path. Two concurrent rebases on the same working tree will corrupt the rebase state — one will leave `.git/rebase-merge/` in place and the other will find a rebase-in-progress error.

In the TUI, this is most likely to happen when:
- The user triggers sync, the progress view is showing, and they also run sync from a terminal.
- A batch sync (syncing multiple workspaces) runs parallel operations on workspaces that share a repo (e.g., two workspaces both have worktrees of the same repo).

**Why it happens:**
Git worktrees do not have cross-process locking for high-level operations like rebase. Git's internal lock files (`index.lock`, `MERGE_HEAD`) protect individual atomic operations but not multi-step operations like rebase.

**How to avoid:**
- Do not run parallel syncs on the same workspace. The current TUI action model triggers one action per keypress, so single-workspace sync is inherently serialized.
- For any future batch sync (multiple workspaces at once), check whether repos overlap across the selected workspaces before running in parallel. If they share a repo (same `main_path`), serialize those syncs.
- In the sync progress view, disable all keys that could trigger another sync or git operation. The current progress view already blocks keys while in-progress, which is correct.
- Document in the workspace action menu help text: "Do not run `git-stacks sync` from the terminal while TUI sync is in progress."

**Warning signs:**
- Sync fails with "Another rebase in progress" error — concurrent sync detected.
- After sync, `git status` in the worktree shows `interactive rebase in progress` — a previous sync was interrupted.

**Phase to address:** Workspace sync phase. The concurrency concern should inform the UI design: show a clear "sync in progress" status on the workspace row to discourage concurrent operation from the CLI.

---

### Pitfall 8: `InlineInput` Multi-Character Sequences (Arrows, Special Keys) Break Text Editing

**What goes wrong:**
The existing `InlineInput` component handles only single-character key events (`key.name.length === 1`) and named keys (`backspace`, `return`, `escape`). It does not handle:
- Left/right arrow keys for cursor movement within the input
- Home/End keys to jump to beginning/end
- Ctrl+A, Ctrl+E, Ctrl+K (shell-style editing shortcuts)
- Copy/paste (Ctrl+V or terminal paste) which sends multi-character sequences

For the simple `rename` and `clone-template` use cases, this is acceptable — the input is short and the user can backspace to correct mistakes. For wizard inputs like workspace name, branch name, template name, and repo path, the lack of cursor movement will frustrate users entering paths or making corrections in the middle of the string.

**Why it happens:**
OpenTUI's keyboard event model fires one event per logical key. Arrow keys produce `key.name === "left"` or `key.name === "right"` — these are already available. The current `InlineInput` simply does not handle them because they were not needed for the rename use case.

**How to avoid:**
Extend `InlineInput` to support cursor movement before it is used for wizard flows. Add:
- `left`/`right` arrow keys to move a cursor position signal
- `home`/`end` keys to jump to start/end
- Character insertion at cursor position (not just append)
- Display the cursor using a visual cursor indicator (e.g., `text[0..cursorPos] + "_" + text[cursorPos..]`)

Alternatively, create a new `WizardInput` component with full cursor support, and reserve the simple `InlineInput` for the existing rename/clone flows.

Do not start wizard implementation using the existing `InlineInput` without this upgrade. The first user complaint will be that they typed a long path, realized there was a typo in the middle, and had to delete all the way back to the typo.

**Warning signs:**
- Wizard design docs say "use the existing InlineInput component" without mentioning cursor support — flag for enhancement.
- A test for wizard input only tests appending characters, never tests correcting a middle character.

**Phase to address:** The first wizard phase. `InlineInput` must be upgraded (or `WizardInput` created) before wizard implementation begins.

---

### Pitfall 9: Repo Selection in TUI Wizard Needs a Multi-Select UI That Doesn't Exist Yet

**What goes wrong:**
Both workspace creation and template creation require selecting multiple repos from the registry. The `@clack/prompts` `p.multiselect` component is not available in the TUI. The existing TUI has no multi-select component — only single-item cursor navigation.

The workspace wizard must support selecting 1–N repos from the registry. With a large registry (20+ entries), this also needs filtering. Without a multi-select component, the developer faces a choice:
- Implement a custom multi-select in OpenTUI (space to toggle, enter to confirm) — significant UI work.
- Limit the TUI wizard to template-based creation only (no ad-hoc repo selection) and defer the ad-hoc path to the CLI.
- Use a sequence of "yes/no per repo" steps — terrible UX for large registries.

**Why it happens:**
Multi-select is a complex UI primitive that requires both cursor navigation and selection state. The existing TUI's `BatchBar` + space-to-select pattern in the workspace list is the closest analogue, but it operates on a known list of already-loaded workspaces, not an inline selection within a wizard flow.

**How to avoid:**
Build a `MultiSelectList` component that embeds cursor navigation + space-to-toggle + enter-to-confirm behavior. It should be a self-contained component receiving `items: Array<{ label: string; hint?: string }>` and calling `onConfirm(selectedIndices: number[])` and `onCancel()`. The `BatchBar` selection pattern from `WorkspaceList` is the right model.

Alternatively, scope the TUI create-workspace wizard to template-only mode (select template, enter name and branch) and leave ad-hoc multi-repo selection to the CLI `git-stacks new`. This is a valid scope decision that reduces the v0.4.0 surface area. The FEATURES.md should make this scoping explicit.

Do not attempt the "yes/no per repo" approach — it is unusable for registries with 5+ repos.

**Warning signs:**
- A wizard design specifies "show each repo as an inline-input step with y/n" — this is the wrong approach.
- A wizard design does not mention how repo selection works — a design gap that will block implementation.

**Phase to address:** Template and workspace create phases. Must be resolved at design time, not during implementation.

---

### Pitfall 10: After Create, Existing Hooks (`pre_create`, `post_create`) Run in the TUI Process — They Spawn Subprocesses with Inherited Stdio

**What goes wrong:**
`workspace-ops.ts` and `workspace-wizard.ts` run `pre_create` and `post_create` hooks via `runHooks()` in `lifecycle.ts`. `runHooks` uses `Bun.spawn` with `stdio: "inherit"` — the hook subprocess inherits the TUI's stdin/stdout/stderr. This means hook output goes directly to the terminal while OpenTUI is also rendering, causing visual corruption.

This is the same problem documented in the existing PITFALLS.md for `runHooks` called from the TUI context (see "Integration Gotchas" table). For the create wizard specifically, it means any `post_create` hook (which the user configured in the template) will corrupt the TUI display when the wizard calls `createWorkspace` internally.

**Why it happens:**
`lifecycle.ts` was designed for the CLI context where `stdio: "inherit"` is correct. In TUI context, it must capture hook output and stream it to the progress view's `progressLines` signal instead.

**How to avoid:**
When calling create operations from the TUI, use the `onProgress` callback pattern that already exists in `cleanWorkspace`, `removeWorkspace`, etc. However, `runHooks` does not support this callback pattern — it uses `stdio: "inherit"` directly.

Before adding create operations to the TUI, modify `runHooks` (or create a `runHooksCaptured` variant) that captures hook stdout/stderr and returns it line-by-line via a callback, instead of inheriting stdio. The existing `handleRun()` in `App.tsx` (which spawns `git-stacks run` with `stdout: "pipe"` and streams output to `progressLines`) shows the right pattern.

This is a lib-layer change that must be made before any TUI wizard can safely run hooks.

**Warning signs:**
- A create workspace wizard calls `runHooks()` directly — this will corrupt the TUI.
- A PR adds a create action to the TUI without modifying `runHooks` to support captured output.
- Testing the create wizard with a template that has `post_create` hooks shows visual corruption — the symptom is unmistakable.

**Phase to address:** Create workspace phase (first wizard phase). The `runHooks` captured-output change is a prerequisite, not an enhancement.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `InlineInput` without cursor movement for wizards | Reuse existing component | Users cannot edit middle of long paths; first complaint on first real use | Never for wizard input with paths or long strings |
| Encode wizard steps in `UIView` union | Familiar pattern from existing views | Combinatorial explosion in App.tsx keyboard handler; no "back" navigation | Only for truly single-step interactions; never for multi-step flows |
| Call `@clack/prompts` from TUI with `renderer.suspend()` | Reuse existing wizard logic | Terminal corruption; unreliable state restoration | Never — dedicated TUI wizard components required |
| Skip `reload()` cursor update after create | Simpler code | New entity appears offscreen; user confused about whether create succeeded | Never — cursor update is required for perceived correctness |
| PTY e2e tests without fixed terminal size and wait helpers | Quick initial tests | Flaky CI failures; false confidence in coverage | Never — always set dimensions and wait for stable state |
| Hook process with `stdio: "inherit"` from TUI context | No code change needed | Hook output corrupts TUI rendering | Never from TUI context — always use captured output |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenTUI + `@clack/prompts` | Calling `p.text()` / `p.select()` from TUI action handlers | Build native TUI wizard components using `InlineInput` and `useKeyboard` |
| `runHooks()` from TUI | Calling `runHooks()` with inherited stdio | Extend to `runHooksCaptured()` variant; stream output via `onProgress` callback to `progressLines` |
| `useWorkspaces.reload()` after create | Not awaiting reload before cursor update | Make `reload()` async (return `Promise<void>`); `await reload()` then compute and set new cursor index |
| `syncWorkspace()` from TUI | Showing only a spinner without per-repo progress | `syncWorkspace()` already emits per-repo messages via `onProgress`; ensure the TUI calls this and streams them |
| `bun test` + `@opentui/solid` imports | Importing OpenTUI in test files | Extract all testable logic into pure TypeScript files; never import `@opentui/solid` in tests |
| PTY e2e tests + async git status loading | Asserting on workspace status before `fetchStatuses` completes | Wait for help bar to appear (stable TUI state indicator) before sending navigation keystrokes |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `fetchOrigin` without timeout in sync | Sync hangs for minutes on slow/offline remote | Add 30-second timeout per repo; skip timed-out repos as `skipped` with reason | Immediately on any remote unavailability |
| Reload + full git status refetch after every create | Create workspace triggers 5-second status loading for all workspaces | After create, do a targeted single-workspace status fetch rather than full reload | With 10+ workspaces, each create triggers ~10 concurrent git-status calls |
| Multi-select component with full list re-render on every space keypress | Flicker in multi-select list with 20+ repos | Use cursor + selection state signals; only re-render changed rows | ~20+ items in the select list |
| PTY test suite grows to 50+ test cases | CI takes 5+ minutes for TUI e2e tests | Cap PTY tests at 10–15 smoke cases; cover logic with unit tests instead | As soon as CI budget exceeds 2 minutes for the TUI test suite |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Wizard cancel deletes partially-created files | User loses work; orphaned worktrees on disk | Only write config/create worktrees after all wizard steps complete; wizard state is in-memory until commit |
| Wizard with no "back" navigation | Typo in step 1 requires canceling the entire flow and starting over | Implement "back" (`Escape` goes to previous step); only `Escape` at step 0 cancels the whole wizard |
| Sync shows "Done" even when some repos were skipped (best-effort) | User thinks all repos are in sync when some failed | Show per-repo result table: synced/skipped/failed count; "Done" message includes summary |
| Create workspace wizard offers no preview of what will be created | User doesn't know how many worktrees will be created, which paths, which branch | Show a summary step as the final step before creation begins ("Will create 3 worktrees at ~/workspaces/tasks/foo/") |
| Keyboard focus is ambiguous when wizard is open and list is still visible | User presses arrow key expecting to navigate wizard but list cursor also moves | Wizard must render in the detail pane with the list pane still visible but keyboard-blocked; App.tsx early-return pattern handles this if done correctly |

---

## "Looks Done But Isn't" Checklist

- [ ] **E2E test isolation:** Every PTY test sets `XDG_CONFIG_HOME` or `HOME` to a temp directory — verify no test reads real user config.
- [ ] **PTY terminal size:** Every PTY test explicitly sets terminal to fixed dimensions (`cols: 120, rows: 40`) — verify locally and in CI.
- [ ] **Wizard cancel safety:** Cancel at any wizard step leaves no files on disk (no YAML written, no worktree created) — verify by inspecting the temp config dir after cancel.
- [ ] **Wizard back navigation:** `Escape` at step 2+ goes to step 1, not cancel — verify by testing multi-step wizard with Escape at each non-first step.
- [ ] **Create reload cursor:** After workspace create, the cursor points to the new workspace in the list — verify by asserting on the detail pane content.
- [ ] **Hook capture:** `post_create` hook output appears in the TUI progress view, not in the terminal background — verify with a template that has a `post_create` hook echoing text.
- [ ] **Sync per-repo progress:** Sync action emits one progress line per repo (fetch, conflict check, rebase result) — verify by watching `progressLines` grow during sync.
- [ ] **Sync timeout:** Sync on an unreachable remote repo returns a "fetch timeout" skipped result within 30 seconds, not hang indefinitely — verify by pointing a test repo at an unreachable URL.
- [ ] **Unit tests import cleanly:** `bun test tests/` passes with zero imports from `@opentui/solid` or `@opentui/core` in test files — verify with `grep -r "@opentui" tests/`.
- [ ] **InlineInput cursor:** Typing a long string and pressing left arrow moves cursor left; subsequent character insertion inserts at cursor position — verify before using in any wizard.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| E2E tests written as rendering tests (impossible to run) | MEDIUM | Delete rendering tests; extract logic into `messageUtils.ts`-style pure functions; rewrite as unit tests of those functions |
| Wizard implemented with `@clack/prompts` + `renderer.suspend()` | HIGH | Rewrite wizard as native TUI component; extract validation and business logic from clack wizard into lib functions reusable by both |
| `runHooks` inherited stdio corrupts TUI on post_create hooks | HIGH | Add `runHooksCaptured()` variant immediately; the TUI component using the hook will need to be updated to pass `onProgress` |
| Create operation writes partial state on wizard cancel | MEDIUM | Add transactional wrapper: accumulate all writes into a "pending" structure; execute all writes atomically only on wizard confirmation |
| Sync hangs due to missing network timeout | LOW-MEDIUM | Add `Bun.timeout()` wrapper around `fetchOrigin()`; already within one function so the change is localized |
| PTY tests are 100% flaky in CI | MEDIUM | Add `waitForText()` helper; fix terminal size; reduce to smoke test set; accept that some TUI behavior is manual-test only |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Testing OpenTUI components | E2E test infrastructure phase — establish three-tier model | No `@opentui` imports in `tests/`; all TUI tests are in `tests/tui/` and test pure logic |
| PTY test brittleness | E2E test infrastructure phase — build the harness correctly first | Harness must fix terminal size, strip ANSI, and expose `waitForText()`; test in CI before using for feature tests |
| `@clack/prompts` in TUI | Every create wizard phase — stated as constraint in phase design | `grep -r "@clack" src/tui/dashboard/` returns nothing |
| Wizard state in `UIView` | First wizard phase — establish wizard component pattern | `UIView` union count stays at ≤ 8 variants after first wizard |
| Reload cursor update | Every create wizard completion | After create, cursor is on the new entity; detail pane shows the new entity's content |
| `fetchOrigin` timeout for sync | Workspace sync phase | Sync on unreachable remote returns within 30s with `skipped` entry |
| Concurrent sync corruption | Workspace sync phase | Verify that only one sync can run at a time; TUI progress view blocks all other actions |
| `InlineInput` cursor movement | First wizard phase (prerequisite) | Left/right arrow keys move cursor in any wizard text field |
| Multi-select UI | Create template/workspace phase (design step) | Either `MultiSelectList` component exists, or ad-hoc repo selection is explicitly out of scope for TUI |
| `runHooks` captured output | Create workspace phase (prerequisite lib change) | `post_create` hook output appears in TUI progress view, not leaked to terminal |

---

## Sources

- Direct codebase analysis (HIGH confidence — verified line-by-line):
  - `src/tui/dashboard/App.tsx` — keyboard handler structure, view dispatch, renderer.suspend pattern
  - `src/tui/dashboard/InlineInput.tsx` — current capabilities and limitations
  - `src/tui/dashboard/ProgressView.tsx` — progress streaming model
  - `src/tui/dashboard/hooks/useWorkspaces.ts` — reload pattern, async status fetch
  - `src/tui/dashboard/run.tsx` — `render()` API call, `onDestroy` callback
  - `src/tui/workspace-wizard.ts` — clack-based wizard structure (must not be imported from TUI)
  - `src/lib/workspace-ops.ts` — `syncWorkspace()`, `cleanWorkspace()`, `onProgress` callback pattern
  - `src/lib/lifecycle.ts` — `runHooks()` with `stdio: "inherit"` (the problem)
  - `src/lib/git.ts` — `fetchOrigin()`, no timeout, pure async
  - `tests/tui/messageUtils.test.ts` — the correct model for TUI logic tests
  - `.planning/PROJECT.md` — Key Decisions table, established constraints

- Project memory (HIGH confidence — recorded from real bugs):
  - `feedback_opentui_no_nested_text.md` — `TextRenderable.add()` crash on nested `<text>`
  - v0.3.0 Key Decisions table — height-based tab visibility, Switch/Match repaint issue

- Prior research (HIGH confidence — verified patterns from Phase 9 research):
  - `SolidJS Map signal identity check` — must create new Map to trigger re-render
  - `onIpcMessage mutable export` — namespace import required for reassignment
  - `useKeyboard global broadcast` — parent must return early to prevent double-dispatch

- Inference from OpenTUI architecture (MEDIUM confidence — no headless renderer exists):
  - No test renderer available as of 2026; confirmed by absence in npm ecosystem and OpenTUI docs
  - `renderer.suspend()` + `@clack/prompts` incompatibility — architectural consequence of both owning terminal raw mode

---
*Pitfalls research for: v0.4.0 — E2E tests + wizard flows + workspace sync in Bun/SolidJS/OpenTUI*
*Researched: 2026-03-20*
