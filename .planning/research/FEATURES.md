# Feature Research — v0.4.0 TUI Hardening & Polish

**Domain:** Terminal workspace manager — TUI e2e testing, wizard flows, screen improvements, CLI parity features
**Researched:** 2026-03-20
**Confidence:** HIGH (based on direct codebase analysis; no external research required for internal feature scoping)

---

## Current State Baseline (v0.3.0)

The dashboard (`git-stacks manage`) ships with:
- Three tabs: Workspaces | Templates | Repos; `1`/`2`/`3` and `[`/`]` navigation
- Split list+detail panes per tab; cursor-reactive detail pane
- Workspace actions via ActionMenu: open, rename, edit, clean, remove, merge
- Template actions: edit, clone, remove
- Repo tab: browse-only (disk health indicators, used-by display)
- IPC push messages: live notification display, MessageOverlay (`m` key)
- InlineInput for rename and clone-as; ProgressView for long-running ops; ConfirmDialog for destructive ops
- Help overlay (`?` key), help bar, filter mode (`/`)

**What is CLI-only and blocked from TUI:**
- `git-stacks new` — workspace creation wizard (multi-step `@clack/prompts` flow)
- `git-stacks clone` — workspace clone wizard
- `git-stacks repo add` / `repo scan` / `repo remove` — registry mutation
- `git-stacks template new` — template creation wizard
- `git-stacks sync` — workspace sync (fetch+rebase/merge from base branch)

**Test coverage today:**
- Unit tests: `tests/lib/` and `tests/commands/` cover business logic, CLI output format, workspace-ops
- One TUI-layer test: `tests/tui/messageUtils.test.ts` tests pure utility functions extracted from dashboard components
- Zero tests for TUI rendering, keyboard routing, or wizard interaction

---

## Feature 1: E2E Test Infrastructure for the TUI

### Table Stakes

Features this test infrastructure must have to be worth shipping.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Headless render + key injection | Without programmatic key injection there is no way to drive TUI state without a real terminal. This is the bedrock capability. | HIGH | The existing `run.tsx` uses `@opentui/solid`'s `render()`. Headless mode means calling `render()` with a mock/offline renderer or patching the keyboard source. Context7 / OpenTUI docs need investigation. Alternatively: mock the `useKeyboard` hook at the test boundary. |
| Assertions on rendered output (text content) | Tests must verify what text actually appears on screen. Without this you can only check state signals, not what the user sees. | HIGH | OpenTUI renders to a terminal buffer. Need access to that buffer as a string or structured tree. If OpenTUI exposes a snapshot API, use it. If not, assert on the SolidJS reactive state directly (signals are readable in tests). |
| Test isolation per test (fresh state, no shared singletons) | `useWorkspaces`, `useTemplates`, `useRepos` read from `~/.config/git-stacks/`. Tests must redirect `HOME` or mock these hooks to prevent cross-test pollution. | MEDIUM | The existing test pattern (`process.env.HOME` redirect in `tests/helpers.ts`) works for lib-layer tests. The same approach applies here: each TUI test sets a temp `HOME` before any import that reads config. |
| Coverage of the keyboard routing state machine | The most bug-prone code in the TUI is the `useKeyboard` handler in `App.tsx`. Tests must exercise: tab switching, filter mode entry/exit, action menu open/close, inline input, confirm dialog y/n, progress → list transition. | MEDIUM | These are pure state-machine transitions that don't require rendering. Extracting the keyboard handler logic into a testable function (separate from `useKeyboard`) makes this tractable without headless render infra. |
| Tests run in `bun test` without external dependencies | The test suite already runs under `bun test`. E2E TUI tests must fit into the same runner and require no Xvfb, no Docker, no TTY allocation. | MEDIUM | This constrains the approach: full headless terminal simulation (e.g., a PTY-based approach) is out. The viable path is either (a) OpenTUI headless mode, or (b) logic extraction + unit testing of the state machine, or (c) integration testing via the CLI process. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Snapshot testing for TUI layouts | Catch layout regressions (column truncation, pane height bugs) automatically. Valuable for the screen improvement work in this same milestone. | HIGH | Requires a render-buffer snapshot API from OpenTUI. Unlikely to be available. Defer unless OpenTUI exposes it. |
| Wizard flow integration tests (suspend+resume path) | Verify that suspending the renderer, running a `@clack/prompts` wizard, and resuming the renderer leaves the TUI in a clean state. | HIGH | These tests need a real TTY or PTY. Extremely difficult to do in a headless bun test. Defer to manual testing discipline or a future dedicated E2E harness. |
| Coverage report showing TUI logic coverage | Makes gaps visible to developers. Encourages extracting more logic from JSX components into testable pure functions. | LOW | Standard bun test coverage (`bun test --coverage`) already works; just ensure TUI utility files are included in the coverage glob. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| PTY/headless terminal simulation (e.g., `node-pty`, `blessed-fork`) | Requires native addons or platform-specific tooling, makes CI brittle, slows the test suite significantly. The TUI is SolidJS reactive code — most value comes from testing state transitions, not pixel output. | Extract keyboard routing logic into pure functions; test state machines directly. |
| Testing OpenTUI rendering internals | OpenTUI's rendering pipeline is a black box with known bugs (`useKeyboard` global broadcast, render loop stall). Testing its internals creates tests coupled to the library implementation, not to user-visible behavior. | Test that the right signals have the right values; trust the renderer to render correctly once state is correct. |
| Mocking `@opentui/solid` hooks wholesale | If `useKeyboard` and `useRenderer` are replaced with mocks, the tests no longer test the actual interaction model. They only test that the mocks were called. | Extract pure state logic from the JSX layer; test the extracted logic, not the JSX. |
| Requiring 100% TUI coverage at first pass | The TUI has inherently hard-to-test paths (suspend/resume, editor launch, wizard flows). Requiring complete coverage creates pressure to test the wrong things (mock-heavy, brittle tests). | Target 60-70% of the keyboard handler state machine on first pass. That covers the high-value paths. Defer wizard flow testing. |

### What "Done" Looks Like

A developer can run `bun test tests/tui/` and get passing tests that verify:
- Tab switching (1/2/3 keys change active tab)
- Filter mode enters and exits correctly
- Action menu opens on Enter and dispatches the right action
- Confirm dialog dispatches confirm on `y` and cancel on `n`/`Escape`
- InlineInput accumulates typed characters and calls `onConfirm` on Enter
- Workspace list, template list, and repo list cursor navigation (up/down/j/k)
- Progress view clears on keypress when `progressDone` is true

The tests are pure function tests or signal tests, not render snapshot tests. They run in under 5 seconds total. They do not require a TTY.

### Realistic vs. Aspirational Coverage at First Pass

**Realistic (v0.4.0):** Test the state machine logic extracted from `App.tsx`'s `useKeyboard` handler. This means extracting keyboard handler logic into a plain TypeScript function that takes `(key, state) => newState`. Test that function with bun:test. Coverage of rendering output or wizard flows is out of scope.

**Aspirational (later):** Full headless TUI integration tests using whatever headless API OpenTUI eventually ships, or a PTY-based approach acceptable in CI.

---

## Feature 2: TUI Screen Improvements (Info Density, Layout Polish)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Detail pane shows more information without scrolling | Currently, the detail pane height is ~40% of terminal height. At 40-row terminals (common) this shows only 6-8 lines. The workspace detail (repos + messages) and repo detail (path, usage) are cramped. Improving info density means showing more per row, not requiring scroll. | LOW | Tighter row padding, more compact repo status row format, removing blank lines between sections. |
| List pane truncates long names gracefully | Workspace names longer than ~30 chars truncate with `...` suffix. Repo paths truncate with `...` prefix (already done in `RepoList`). Template names with long descriptions need similar treatment. | LOW | Already partially done (`truncatePath` in RepoList). Apply same pattern in WorkspaceRow and TemplateList. |
| Help bar text fits in 80 columns | The workspace tab help bar (`1/2/3 Tabs  ↑↓/jk Navigate  Enter Actions  Space Select  m Messages  / Filter  r Refresh  ? Help  q Quit`) is ~100 chars. At 80-col terminals it wraps. | LOW | Use abbreviations at narrow widths: swap `Navigate` → `Nav`, drop least-used bindings from the bar, keeping them in `?` overlay. |
| Column widths responsive to terminal width | Fixed-width column padding (e.g., `entry.name.padEnd(24)`) breaks at narrow terminals. Columns should scale to available width. | MEDIUM | Pass terminal width signal into list components; compute column widths proportionally. Already have `useTerminalDimensions()` in App.tsx but it's not passed to child list components. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Workspace list shows branch + age on same row as name | Currently each workspace row shows name, branch, dirty/missing flags, created date. Showing age instead of ISO date (`3d` vs `2026-03-17`) makes rows more scannable. | LOW | `formatAge()` already exists in `workspace-ops.ts`. Apply to WorkspaceRow. |
| Repos tab shows workspace count in list row | Instead of "used by N templates, M workspaces" in the detail pane, show the count directly in the list row as a badge. Useful for quickly identifying orphaned or heavily-used repos. | LOW | Compute usage count from `allWorkspaces` + `allTemplates` in `RepoList`. Pass counts as props alongside the entry. |
| Two-pane layout adjustable split ratio | Power users prefer more list space or more detail space. A keypress (e.g., `>` / `<`) cycles through split ratios: 50/50, 60/40, 70/30. | MEDIUM | Requires a `splitRatio` signal in App.tsx. OpenTUI's flexbox uses `flexGrow` integers — change `flexGrow={3}` / `flexGrow={2}` on the two boxes. Signal stores the ratio pair. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Color themes / custom color schemes | Adds a configuration surface (global config + per-workspace override) for marginal value. Terminal color preferences belong to the terminal emulator itself. | Ship with the existing color choices. If users want different colors, they can configure their terminal. |
| Animation and transitions | Transition animations between views (slide in/out) add complexity to the render model and distract from the management task. | Keep the existing instant-switch behavior. |
| Persistent user layout preferences | Saving split ratio to `~/.config/git-stacks/config.yml` requires Zod schema update, migration, and tests. The value is low (defaults are fine for most users). | Make the split ratio adjustment ephemeral (per-session). |

### What "Done" Looks Like

The TUI renders cleanly at 80x24 (minimum common terminal size) without text overflow or wrapping in the help bar. Column widths scale with terminal width. Workspace rows show age (`3d`) instead of ISO date. The detail pane reads comfortably at 40-row terminals with no empty space wasted.

---

## Feature 3: Create Workspace (new/clone) from within TUI

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `n` key in Workspaces tab opens workspace creation wizard | The Workspaces tab has actions for every existing workspace but no way to create a new one. This is the most glaring CLI-only gap. Users expect `n` to mean "new" (lazygit convention). | MEDIUM | The wizard (`runWorkspaceNew`) already exists in `src/tui/workspace-wizard.ts`. The pattern is: suspend renderer, call `runWorkspaceNew()`, resume renderer, call `reload()`. This is identical to the editor launch pattern already working in `launchEditor()`. |
| `c` key (or action menu entry) opens workspace clone wizard | Clone is the second most common workspace creation path. `c` conflicts with "clean" in the batch selection context — choose a non-conflicting key or put it in the action menu. | MEDIUM | Same suspend+resume pattern as new. `runWorkspaceClone()` already exists. Key conflict: `c` is used for batch clean. Use `C` (uppercase) or add "New" and "Clone" to a creation sub-menu triggered by `n`. |
| After wizard completes, workspace list reloads automatically | If `reload()` is not called after wizard exit, the new workspace doesn't appear without manual `r` refresh. This would feel broken. | LOW | `reload()` is called in the `finally` block of `launchEditor()` already. Apply the same pattern: `await runWorkspaceNew(); reload()`. |
| Escape / Ctrl-C in wizard cancels cleanly and returns to TUI | `@clack/prompts` exits with `process.exit(1)` on cancel. The TUI must resume even if the wizard was cancelled. | MEDIUM | Wrap the wizard call in `try/catch`. The `renderer.suspend()` + `renderer.resume()` pair must be in a `try/finally` block, not a try/catch that swallows exceptions. The existing `launchEditor()` already does this correctly. |
| Works when no templates exist (ad-hoc repo selection path) | The wizard has an ad-hoc mode (pick repos directly from registry). This path must work from TUI just as it does from CLI. | LOW | No code change needed — `runWorkspaceNew()` handles both paths. The wizard prompts transparently in the raw terminal during suspend. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Clone as option in workspace action menu | Currently the action menu has open, rename, edit, clean, remove, merge. Adding "clone" here (as an alternative to `c` from list view) is consistent with the existing menu pattern and avoids key conflicts. | LOW | Add `{ key: "C", action: "clone", label: "Clone" }` to ActionMenu's actions array. Handle in `runAction`. |
| Show "Creating..." overlay during wizard (brief progress indicator) | When the suspend completes and the wizard runs, the TUI screen blanks. A brief "Creating workspace..." line shown before suspend makes the transition feel intentional. | LOW | Print one line to stdout before `renderer.suspend()`. The existing `renderer.suspend()` call doesn't currently show any message. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Reimplementing the workspace wizard as an in-TUI multi-step form | Building wizard steps as TUI views (replacing `@clack/prompts` with SolidJS reactive forms) means duplicating all wizard logic into the dashboard layer. The wizard is 400+ lines with validation, hooks, integration generation, file ops — this would be a full rewrite in a different paradigm for no user-visible benefit. | Suspend+resume is the right pattern. The terminal goes to `@clack/prompts` for wizard interaction, then returns to the TUI. |
| Blocking the TUI event loop during wizard execution | `runWorkspaceNew()` is async and runs in-process during suspend. While it runs, the TUI's render loop is paused (renderer is suspended). This is correct behavior — do not try to run the wizard in a subprocess or background it. | Accept the suspend; the TUI is not interactive during creation. |

### What "Done" Looks Like

From the Workspaces tab, pressing `n` suspends the TUI and runs the workspace creation wizard in the same terminal. When the wizard exits (success or cancel), the TUI resumes and the workspace list shows the new workspace (or is unchanged if cancelled). The user never needs to exit `git-stacks manage` to create a workspace.

---

## Feature 4: Repo Management in TUI (add, scan, remove)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Repos tab shows action menu on Enter (not just browse) | Currently Enter does nothing in the Repos tab (the keyboard handler explicitly returns early for repos). This is a dead-end UX. Even if the only action is "remove", Enter should open a menu. | LOW | Remove the `if (tab() === "repos") return` guard in the `return` key handler. Add a `RepoActionMenu` component. |
| Remove a repo from the registry via TUI | The "repo remove" operation is write-once CLI-only today. A TUI user who added a repo by mistake has no way to clean it up without exiting. Registry remove is simple: filter the entry out and `writeRegistry()`. | LOW | Add "remove" to the repo action menu. Show a ConfirmDialog first (repo is referenced by N workspaces — confirm?). Call `writeRegistry(registry.filter(r => r.name !== name))`. Reload repos. |
| Add a single repo path via suspend+resume | `git-stacks repo add <path>` is a non-interactive command (no wizard). Triggering it from TUI means either (a) an InlineInput asking for a path, or (b) suspending to a minimal prompt. InlineInput is simpler and keeps the user in the TUI. | MEDIUM | Add an "add" action or `a` key in Repos tab. Show InlineInput with label "Repo path". On confirm, call the repo add logic directly (same as `repo add` command: `readRegistry()`, detect type, append entry, `writeRegistry()`). |
| Scan a directory for repos via suspend+resume | `runRepoScan(dir)` in `src/tui/repo-wizard.ts` is already a full wizard (spinner + multiselect). Trigger it via suspend+resume just like workspace new/clone. | MEDIUM | `s` key in Repos tab opens an InlineInput asking for a directory path. On confirm: suspend renderer, call `runRepoScan(dir)`, resume renderer, `reloadRepos()`. The wizard handles the interactive multiselect. |
| Reload repos after mutation | After add/scan/remove, the repos list must show the new state immediately. | LOW | `reloadRepos()` hook already exists in `useRepos`. Call it after any write operation. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Warn before removing a referenced repo | If a repo is used by 1+ templates or workspaces, removal will break them. The confirm dialog should say "repo-name is used by 2 templates and 1 workspace — remove anyway?" | LOW | The `RepoDetail` component already computes `usedByTemplates` and `usedByWorkspaces`. Pass this context into the remove confirm message. |
| Path autocomplete hint in add InlineInput | When the user types a partial path in the InlineInput, the hint area could show `...` for long paths or indicate if the path exists on disk. Not full filesystem completion (that requires native readline), but a real-time `existsSync(value)` indicator. | LOW | While user types in InlineInput, call `existsSync(value)` (synchronous, fast for short paths). Show a green checkmark or red X beside the input. InlineInput currently shows no feedback beyond the cursor. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full filesystem browser in TUI for path selection | Building a directory picker (like `fzf` or a `ranger`-style browser) inside the TUI is a separate product. The InlineInput with a typed path is sufficient for a developer tool. | InlineInput for path entry. The user knows where their repos are. |
| Auto-scanning on TUI open | Scanning `~/projects/` or similar directories on every TUI launch adds startup latency and could register repos the user doesn't want. | Manual scan trigger only (`s` key or explicit menu action). |

### What "Done" Looks Like

From the Repos tab: pressing `a` prompts for a path and registers a single repo. Pressing `s` prompts for a directory, suspends to the scan wizard (which shows discovered repos to select), and returns. Pressing Enter on a repo opens an action menu with "remove". All mutations reload the list immediately. The Repos tab is no longer read-only.

---

## Feature 5: Template Creation from within TUI

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `n` key in Templates tab triggers template creation wizard | Templates tab already supports edit/clone/remove. Creation is the missing CRUD operation. Symmetry with the Workspaces tab (`n` = new) makes this discoverable. | MEDIUM | `runTemplateNew()` exists in `src/tui/template-wizard.ts`. Pattern: suspend renderer, call `runTemplateNew()`, resume renderer, `reloadTemplates()`. Same as workspace creation. |
| After wizard completes, template list reloads automatically | Without reload, the new template doesn't appear. | LOW | `reloadTemplates()` already exists in `useTemplates`. Call it in the `finally` block. |
| Escape / cancel in template wizard returns to TUI cleanly | `@clack/prompts` cancel calls `process.exit(1)`. Must be caught. | MEDIUM | Same `try/finally` pattern as workspace creation. The `renderer.resume()` call must be in `finally`, not just in the success path. |
| Works only when registry has repos | `runTemplateNew()` already guards against empty registry (`p.cancel("No repos registered.")`). No additional guard needed in TUI — the wizard handles it. | LOW | No code change needed. The wizard will display the error message before cancelling. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Action menu shows "New" as the first option | The template action menu (`TemplateActionMenu`) is opened on an existing template. "New" doesn't belong in this menu — it's a list-level action. Make `n` clearly distinct from Enter-then-n. Document it in the help overlay. | LOW | Update the help overlay `?` to show "n New" in the Templates context. Update the help bar text for Templates tab. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| In-TUI step-by-step template wizard | The `runTemplateNew()` wizard already handles repo selection (multiselect), per-repo mode selection, branch patterns, and optional hooks. Rebuilding this as TUI views adds weeks of work with no new capability. | Suspend+resume to the existing wizard. |
| Template import/export (copy template YAML between machines) | Out of scope for this milestone. Registry paths are machine-specific; a "template portability" feature requires a separate design. | YAML files are already manually copyable. Document that. |

### What "Done" Looks Like

From the Templates tab, pressing `n` suspends the TUI and runs the template creation wizard. When the wizard exits, the TUI resumes and the template list shows the new template. The user can complete the full template lifecycle (create, edit, clone, remove) without leaving the TUI.

---

## Feature 6: Workspace Sync in TUI Action Menu

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| "Sync" entry in workspace ActionMenu | `git-stacks sync <name>` already exists and is the correct operation for rebasing/merging worktrees from their base branch. The TUI action menu lacks it. Users doing daily maintenance expect sync to be accessible where their other workspace actions are. | LOW | Add `{ key: "s", action: "sync", label: "Sync" }` to ActionMenu's actions array. Add `"sync"` to the `Action` type in `types.ts`. |
| Sync runs with progress output | `syncWorkspace()` accepts a `ProgressCallback`. Like clean/remove/merge, sync should use the ProgressView. | LOW | The `executeConfirmed` / `runAction` pattern in App.tsx handles this. Add a sync case that calls `syncWorkspace(name, {}, onProgress)`. |
| Default strategy is rebase; no strategy prompt | The TUI is a quick-action surface. The CLI has `--strategy rebase|merge` for advanced users. For TUI, default to rebase (consistent with the CLI default) and don't prompt. Advanced users can use the CLI for merge strategy control. | LOW | Call `syncWorkspace(name, { strategy: "rebase" }, onProgress)`. No strategy selection UI. |
| Sync does NOT require a confirm dialog | Sync is non-destructive (rebase/merge from base branch, but your branch and working state are preserved). It's analogous to "open" — just runs and shows progress. Skip the ConfirmDialog. | LOW | Handle sync in `runAction` directly (like "open" and "run"), not routing it through `executeConfirmed`. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Show sync result summary in ProgressView | After sync completes, the ProgressView lines should summarize: "3 repos synced (rebase), 1 repo skipped (conflicts)". `syncWorkspace()` returns a `SyncResult` with `synced[]` and `skipped[]`. | LOW | Append summary lines to `progressLines` from the `SyncResult` after the operation completes. This is a UX improvement over the generic "Done" message. |
| Conflict warning before sync (dry-run) | `syncWorkspace()` already does a conflict pre-check before doing anything. If conflicts exist, it returns early with an error. Show this as a warning in ProgressView ("conflicts in repo-x — sync aborted"). | LOW | The error is already returned in `SyncResult.error`. The existing error display in ProgressView handles it: `if (!result.ok) setProgressLines(prev => [...prev, "ERROR: " + result.error])`. No additional code needed. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Strategy selection UI (choose rebase vs. merge in TUI) | Adding a sub-menu or InlineInput for strategy selection makes sync a two-step interaction. The benefit (avoiding one CLI invocation) is marginal and adds UI complexity. | Hard-code rebase in the TUI action. Document "use `git-stacks sync --strategy merge` for merge strategy". |
| Sync all workspaces action ("sync all") | Batch sync via TUI could hit git lock contention or take minutes. This is a CLI-scripting use case, not a dashboard action. | Document `git-stacks sync --all` as the CLI path for batch sync. |
| `--best-effort` toggle in TUI | `best-effort` means "skip repos with conflicts". This is a nuanced flag best left to CLI users who understand it. TUI sync always runs in strict mode. | Default to strict; if sync aborts due to conflicts, the error message explains how to use `--best-effort` from CLI. |

### What "Done" Looks Like

In the workspace action menu, `s` runs sync. ProgressView shows fetch → sync → done lines per repo, then a summary ("3 synced, 1 skipped"). Any conflicts cause a clear error message. The user never needs to exit `git-stacks manage` to pull from base for a workspace.

---

## Feature Dependencies

```
E2E test infrastructure
    └──enables──> Regression coverage for all other v0.4.0 features
    └──requires──> Keyboard logic extractable as pure functions (refactor prerequisite)

TUI screen improvements
    └──independent──> no dependencies on other v0.4.0 features
    └──enables──> better validation of wizard flows (more info visible per screen)

Create workspace (new/clone) in TUI
    └──requires──> renderer.suspend() / renderer.resume() pattern (already working)
    └──uses──> runWorkspaceNew() (src/tui/workspace-wizard.ts) — no changes needed
    └──uses──> runWorkspaceClone() (src/tui/workspace-clone.ts) — no changes needed
    └──key conflict──> 'c' used by batch-clean; 'n' is free; resolve before implementation

Repo management in TUI
    └──requires──> Repos tab action menu (currently Enter is a no-op in repos tab)
    └──uses──> runRepoScan() (src/tui/repo-wizard.ts) — no changes needed for scan
    └──uses──> writeRegistry() (src/lib/config.ts) — no changes needed for add/remove
    └──enhances──> RepoDetail already shows used-by info; reuse for remove warning

Template creation in TUI
    └──requires──> renderer.suspend() / renderer.resume() pattern (already working)
    └──uses──> runTemplateNew() (src/tui/template-wizard.ts) — no changes needed
    └──key conflict──> 'n' in Templates tab; already free (action menu only shows for existing items)

Workspace sync in TUI
    └──requires──> Action type extended: add "sync" to Action union in types.ts
    └──uses──> syncWorkspace() (src/lib/workspace-ops.ts) — already exported, no changes needed
    └──uses──> ProgressView (already wired for clean/remove/merge) — reuse same pattern
    └──independent──> no dependencies on wizard flows or repo management
```

### Dependency Notes

- **E2E tests depend on logic extraction:** The only prerequisite for testable keyboard logic is extracting the state-transition logic from `App.tsx`'s `useKeyboard` handler into a pure function. This is a refactor of ~100 lines, not a new feature.
- **Create workspace and template creation share the same pattern:** Both use suspend+resume to hand off to an existing `@clack/prompts` wizard. They can be implemented by the same developer in the same phase with minimal additional work.
- **Repo management's action menu is a prerequisite for remove:** The Enter no-op guard must be removed before any action (add/scan/remove) can be triggered from the Repos tab.
- **Sync in action menu has zero external dependencies:** `syncWorkspace()` is exported and stable. The `Action` type union needs one new variant. ProgressView is already wired. This is the simplest feature of the six.

---

## MVP Definition for v0.4.0

### Ship With (core milestone — makes TUI fully self-sufficient)

- [ ] **Workspace sync in action menu** — closes the most-used CLI-only gap with minimal code; straightforward `Action` union extension + `syncWorkspace()` call
- [ ] **Create workspace (new/clone) from TUI** — `n` in Workspaces tab for new; clone option in action menu; suspend+resume to existing wizards
- [ ] **Template creation in TUI** — `n` in Templates tab; suspend+resume to existing wizard; completes template CRUD
- [ ] **Repo management actions in TUI** — Enter opens action menu in Repos tab; add via InlineInput; scan via suspend+resume; remove with confirm
- [ ] **E2E test infrastructure (first pass)** — extract keyboard handler state machine to pure function; cover tab switching, filter, action menu, confirm, inline input transitions with unit tests
- [ ] **TUI screen improvements** — help bar fits 80 columns; column widths responsive to terminal width; age display in workspace rows

### Defer (after v0.4.0 validation)

- [ ] **Snapshot testing for TUI layouts** — requires OpenTUI headless render API which is not confirmed available
- [ ] **Wizard flow E2E tests (suspend+resume)** — requires PTY or full process-level testing; out of scope for headless bun test
- [ ] **Adjustable split ratio** — nice-to-have, no user requests
- [ ] **Batch workspace sync** — CLI `--all` flag is sufficient; TUI batch would need git-lock-aware concurrency
- [ ] **Strategy selection UI for sync** — CLI-level control; TUI always rebase

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Workspace sync in action menu | HIGH (closes daily-use gap) | LOW (Action union + syncWorkspace call) | P1 |
| Create workspace from TUI | HIGH (biggest CLI-only gap) | MEDIUM (suspend+resume, key conflict resolution) | P1 |
| Template creation in TUI | HIGH (completes CRUD parity) | MEDIUM (suspend+resume, same pattern as above) | P1 |
| Repo management in TUI | MEDIUM (used less frequently than workspace creation) | MEDIUM (new action menu, InlineInput for add path) | P1 |
| E2E test infrastructure | HIGH (enables sustainable development) | HIGH (requires logic extraction refactor) | P1 |
| TUI screen improvements | MEDIUM (polish, not capability) | LOW (cosmetic changes, no new components) | P2 |
| Snapshot testing | LOW (developer-only value) | HIGH (needs OpenTUI API not confirmed available) | P3 |
| Wizard flow E2E tests | MEDIUM (developer value) | HIGH (needs PTY or process-level harness) | P3 |

**Priority key:**
- P1: Ship in v0.4.0
- P2: Ship in v0.4.0 if time allows; defer to patch if not
- P3: Future milestone

---

## Wizard Interaction Pattern Analysis

The central design question for features 3, 4, and 5 is: how do wizard flows work when triggered from inside the TUI?

### Pattern: Suspend+Resume (Recommended for All Three)

**How it works:** `renderer.suspend()` pauses the OpenTUI render loop and restores the terminal to its normal state. The `@clack/prompts` wizard runs normally in the terminal. `renderer.resume()` returns the terminal to OpenTUI control.

**Evidence this works:** `launchEditor()` in `App.tsx` uses this pattern today (renderer.suspend + Bun.spawn editor + renderer.resume). It is production-tested as of v0.3.0.

**Key invariant:** `renderer.resume()` must be in a `try/finally` block. If the wizard calls `process.exit()` (which `cancel()` does), the `finally` block does not run. Solution: the existing `@clack/prompts` flow must be wrapped so that `process.exit` is caught or pre-empted before `renderer.resume()` is called. The `launchEditor()` code handles this correctly; wizard calls must follow the same pattern.

**What the user sees:** When `n` is pressed in Workspaces tab, the TUI screen clears and the `@clack/prompts` styled wizard appears fullscreen. Steps proceed normally. When the wizard exits, the TUI reappears with the list reloaded.

**Confidence:** HIGH (tested in production, matches OpenTUI suspend/resume documentation).

### Pattern: Inline TUI Form (Not Recommended)

**How it would work:** Wizard steps are implemented as TUI views (new `UIView` variants: `{ view: "wizard-step-1" }`, etc.) rendered in the detail pane or as overlays.

**Problems:** Each wizard step has validation logic, branching (template vs. ad-hoc, worktree vs. trunk per repo), and multi-select (repo list). Recreating `p.multiselect()` in OpenTUI requires implementing a multi-select component that doesn't exist today. Total effort is 400+ lines per wizard, duplicating existing `@clack/prompts` logic in a different rendering model.

**Verdict:** Reject. Suspend+resume reuses 100% of existing wizard code.

### Interaction Patterns That Work Well in Terminal TUIs (Research-Informed)

Based on the existing codebase patterns and lazygit/k9s conventions:

1. **Single-field input in detail pane (InlineInput):** Works for simple confirmations like "enter name for rename" or "enter path for repo add". The existing `InlineInput` component handles this. Appropriate when the interaction needs only one piece of freeform text.

2. **Confirm dialog in detail pane:** Works for binary decisions. The existing `ConfirmDialog` (y/n) is the right choice for destructive operations. Do not try to build a richer confirmation UI.

3. **Action menu in detail pane:** Works for choosing between 3-8 options. The existing `ActionMenu` pattern (key + label rows) is the right choice. Do not use arrow-navigation selection for short menus — single-key dispatch is faster.

4. **Suspend+resume to external tool (full-screen takeover):** Works for multi-step wizard flows. The terminal is handed off entirely to the wizard; the TUI is not visible during this time. This is the correct pattern for creation wizards. Users understand and expect "the TUI goes away and comes back".

5. **Overlay (HelpOverlay / MessageOverlay pattern):** Works for read-only information that overlays the entire screen. Not appropriate for interactive input — the overlay pattern doesn't compose well with keyboard routing when the overlay needs text entry.

---

## Phase-Specific Warnings and Research Flags

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| E2E test infrastructure | OpenTUI's `useKeyboard` is a global broadcast — extracting the handler to a pure function requires removing the `useKeyboard` call first, which changes the actual runtime behavior if done naively | Extract logic to a `handleKey(key, state) => state` function; call it from `useKeyboard` in App.tsx; test the extracted function directly |
| Create workspace / template creation from TUI | `process.exit()` in `@clack/prompts` cancel handler bypasses `finally` | Wrap the wizard call in a subprocess (like `launchEditor` does with `Bun.spawn`) OR patch the cancel handler at the call site to use `throw new Error("cancelled")` instead of `process.exit(1)` — verify which approach the existing `launchEditor()` relies on |
| Repo add via InlineInput | `repo add` internally calls `detectRepoType()` and `getCurrentBranch()` which are async. InlineInput's `onConfirm` is sync. | Make the repo add action handler async, run detection after confirm, show a brief progress indicator |
| Workspace sync key conflict | `s` is free in the action menu; but if there's a future "status" or "switch" action, `s` will conflict | Reserve `s` for sync; document the choice in ActionMenu; use full word labels |
| Screen improvements at narrow widths | OpenTUI's flexbox layout may not gracefully handle sub-60-column terminals | Test layout at 80x24, 100x30, 120x40 during implementation; document 80 columns as the minimum supported width |

---

## Sources

- **Direct codebase analysis (2026-03-20):** `src/tui/dashboard/App.tsx`, `ActionMenu.tsx`, `types.ts`, `InlineInput.tsx`, `ProgressView.tsx`, `ConfirmDialog.tsx`, `RepoList.tsx`, `RepoDetail.tsx`, `run.tsx`, `hooks/useWorkspaces.ts` (HIGH confidence)
- **Direct codebase analysis (2026-03-20):** `src/tui/workspace-wizard.ts`, `workspace-clone.ts`, `template-wizard.ts`, `repo-wizard.ts` (HIGH confidence)
- **Direct codebase analysis (2026-03-20):** `src/lib/workspace-ops.ts` — `syncWorkspace()`, `cleanWorkspace()`, `mergeWorkspace()` signatures and return types (HIGH confidence)
- **Prior v0.3.0 research (2026-03-19):** `.planning/research/FEATURES.md` — anti-features and patterns remain valid (HIGH confidence)
- **PROJECT.md (2026-03-20):** milestone scope, key decisions, constraints (HIGH confidence)
- **tests/tui/messageUtils.test.ts:** Shows the existing TUI test pattern (pure function extraction) is already validated (HIGH confidence)

---
*Feature research for: v0.4.0 — TUI hardening, e2e testing, wizard flows, CLI parity*
*Researched: 2026-03-20*
