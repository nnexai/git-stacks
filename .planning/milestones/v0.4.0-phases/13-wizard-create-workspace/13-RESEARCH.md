# Phase 13: wizard-create-workspace — Research

**Researched:** 2026-03-21
**Domain:** OpenTUI/SolidJS TUI — multi-step wizard component, workspace creation, progress display
**Confidence:** HIGH

## Summary

Phase 13 builds a multi-step create-workspace wizard entirely inside the TUI dashboard, without touching `@clack/prompts`. The wizard is triggered from two entry points: the Templates tab (action menu "Create workspace") and the Repos tab (`n` key with multi-select or single highlight). A reusable `WizardView` component manages step/data state as local SolidJS signals and renders inside the existing detail box (the universal action zone pattern).

The creation logic is adapted from `src/tui/workspace-wizard.ts` — specifically `buildReposFromTemplate()`, the worktree loop, hooks, file ops, and integration artifact generation — but uses `runHooksCaptured()` (not `runHooks()`) for TUI safety. The progress display replicates the `SyncProgressView` pattern: one status row per repo, updating in-place, with a done/summary line and "Press any key to continue."

One pre-requisite code change is needed before the cursor-placement feature (C-03) can work: `useWorkspaces.reload()` currently returns `void` and must be changed to return `Promise<void>` so callers can await it before positioning the cursor on the new workspace.

**Primary recommendation:** Build in three plans — (1) `WizardView` + `CreateProgressView` components with tests, (2) template-based create flow wired into App.tsx, (3) ad-hoc (Repos tab) create flow wired in.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Template-based create: Templates tab action menu gains "Create workspace" action.
- **D-02:** Ad-hoc create: Repos tab — multi-select repos (Space) or highlighted repo — press `n` — launches wizard with selected repos defaulting to worktree mode.
- **D-03:** No `n` key or create action in the Workspaces tab.
- **D-04:** Repos tab `n` behavior: if repos are multi-selected, uses those; if none selected, uses highlighted repo.
- **D-05:** Template wizard steps: enter name → enter branch (prefilled from auto-expanded pattern) → summary/confirm → create.
- **D-06:** Branch input auto-expands the template's `branch_pattern` using the entered workspace name, shown as a prefilled editable input.
- **D-07:** Summary step: template name, resolved branch, repo list with modes → `y` to create, `Esc` to go back.
- **D-08:** Ad-hoc steps: enter name → enter branch (blank input) → summary/confirm → create.
- **D-09:** All selected repos in ad-hoc mode default to worktree mode.
- **D-10:** No per-repo mode override step in either wizard flow.
- **D-11:** No description step.
- **D-12:** No integration configuration step.
- **D-13:** Escape at any non-first step returns to previous step.
- **D-14:** Template wizard: escape at first step (name) cancels and returns to Templates tab action menu/list.
- **D-15:** Ad-hoc wizard: escape at first step (name) cancels and returns to Repos tab list.
- **D-16:** After confirm, wizard transitions to per-repo progress view — same pattern as SyncProgressView.
- **D-17:** Hook failure shows warning inline but does NOT abort — remaining repos continue.
- **D-18:** "Done. Press any key to continue." pause after completion before returning to list.
- **D-19:** If creation fails partway through, clean up partial state and show error.
- **D-20:** After creation and dismiss, switch to Workspaces tab, reload list, position cursor on newly created workspace.
- **D-21:** Build a reusable WizardView component that Phase 14 (template create) can also use.
- **D-22:** WizardView manages step/data state as local signals inside the component.
- **D-23:** WizardView renders inside the detail box (universal action zone pattern).

### Claude's Discretion
- Exact WizardView step abstraction API (step definitions, data accumulation pattern)
- Progress view spinner/indicator characters and colors
- Hook output display (inline beneath repo line or collapsed)
- Cleanup implementation details on partial failure
- Whether summary step is a distinct WizardView step or a ConfirmDialog reuse
- Keyboard isolation approach within wizard steps

### Deferred Ideas (OUT OF SCOPE)
- Per-repo mode override in wizard
- Description input step
- Integration configuration step
- Clone workspace from within TUI
- Workspace creation from Workspaces tab `n` key
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| C-01 | User can create a new workspace from within the TUI (n key from Templates/Repos tabs) without exiting to CLI — wizard: enter name → enter branch | WizardView component, InlineInput steps, template/registry data from config.ts |
| C-02 | Wizard supports back-navigation (escape goes to previous step) and full cancel (escape from first step returns to list) | WizardView step stack with local signals; escape handler per step |
| C-03 | After workspace creation, the list refreshes and cursor positions on the newly created workspace | useWorkspaces.reload() must return Promise<void>; cursor set to index of new workspace name in entries array |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@opentui/solid` | 0.1.87 | TUI renderer + testRender | Project standard — all dashboard components use it |
| `solid-js` | (project version) | Reactive signals, For, Show, createSignal | Project standard |
| `bun:test` | (built-in) | Test framework | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/lib/config.ts` | — | listTemplates, readTemplate, writeWorkspace, workspaceExists, expandBranchPattern, readRegistry, readGlobalConfig | All data reads/writes for workspace creation |
| `src/lib/git.ts` | — | createWorktree(repoPath, worktreePath, branch) | Creating git worktrees per repo |
| `src/lib/lifecycle.ts` | — | runHooksCaptured() | TUI-safe hook execution with progress callbacks |
| `src/lib/files.ts` | — | applyFileOpsForRepo, applyFileOpsForWorkspace | File copy/symlink ops from template |
| `src/lib/integrations/index.ts` | — | integrations array, IntegrationContext | Generating IDE artifacts after creation |
| `src/lib/workspace-ops.ts` | — | mergeEnv, writeEnvFiles | Env setup (needed if template has env/env_file) |
| `src/lib/paths.ts` | — | getTasksDir | Resolves tasks directory from config |

### Alternatives Considered
None — all stack choices are locked by project conventions.

## Architecture Patterns

### Recommended Project Structure
```
src/tui/dashboard/
  WizardView.tsx          — reusable multi-step wizard component (new)
  CreateProgressView.tsx  — per-repo creation progress (new, mirrors SyncProgressView)
  TemplateActionMenu.tsx  — extend with "create-workspace" action (modify existing)
  types.ts                — add wizard UIView variant + create-workspace Action (modify)
  App.tsx                 — wire wizard entry/exit, Repos tab n key, cursor placement (modify)
tests/tui/dashboard/
  WizardView.test.tsx     — step navigation, back-nav, cancel (new)
  CreateProgressView.test.tsx — row statuses, done state, summary (new)
```

### Pattern 1: WizardView Step Abstraction
**What:** WizardView takes a steps definition array and manages a step index + accumulated data as local `createSignal`s. Each step renders inside the detail box. On confirm (Enter/y), data accumulates into an object and step advances. On escape, step decrements; at step 0 escape calls `onCancel`.

**When to use:** Any multi-step data collection flow in the TUI.

**Example (recommended API):**
```typescript
// Source: adapted from existing InlineInput.tsx + ConfirmDialog.tsx patterns
type WizardStep<T> =
  | { kind: "text"; label: string; key: keyof T; prefill?: (data: Partial<T>) => string; validate?: (v: string) => string | undefined }
  | { kind: "confirm"; buildMessage: (data: Partial<T>) => string }

// WizardView props
type Props<T extends Record<string, unknown>> = {
  steps: WizardStep<T>[]
  onComplete: (data: T) => void
  onCancel: () => void
}
```

**Why this shape:** Keeps step definitions declarative, avoids duplication between template and ad-hoc flows, and makes Phase 14 (template create wizard) reusable with different step arrays.

### Pattern 2: UIView Variant for Wizard State
**What:** Add a `wizard-create` view to the `UIView` union in `types.ts`. The view variant only stores which entry point launched it (template index or repo selection); wizard step/data state lives inside `WizardView.tsx` local signals per D-22.

**Recommended addition to types.ts:**
```typescript
| { view: "wizard-create"; source: "template"; templateIndex: number }
| { view: "wizard-create-adhoc"; source: "repos"; repoNames: string[] }
| { view: "create-progress"; workspaceName: string }
```

**Why separate create-progress variant:** The keyboard handler in App.tsx needs to distinguish sync-progress (returns to Workspaces tab) from create-progress (also returns to Workspaces tab but with cursor placement). Separate variant keeps the guards clean.

### Pattern 3: Template Action Menu Extension
**What:** Add "Create workspace" entry (`w` key) to `TemplateActionMenu.tsx`. The action type is `"create-workspace"` — add to the `Action` union in types.ts.

**Keyboard routing in App.tsx:**
```typescript
// In handleTemplateAction:
if (action === "create-workspace") {
  setView({ view: "wizard-create", source: "template", templateIndex: (view() as any).index })
  return
}
```

### Pattern 4: Repos Tab `n` Key Handler
**What:** App.tsx keyboard handler — in `list` view, when `tab() === "repos"` and `key.name === "n"`, collect selected repo names (or highlighted repo name if none selected) and switch to wizard-create-adhoc view.

**Current state:** The Repos tab has no `n` key handler. Space is only wired for the Workspaces tab. Multi-select on Repos tab does not yet exist — implementing it for this phase is part of D-02/D-04.

**Recommended approach:** Add a separate `reposSelected` signal (mirroring `selected` for Workspaces tab) with Space toggling on Repos tab. The `n` key then reads from it.

### Pattern 5: CreateProgressView (mirror of SyncProgressView)
**What:** Per-repo progress display for workspace creation. Same shape as SyncProgressView but with creation-specific statuses.

**Status set:**
```typescript
type CreateRow = {
  repo: string
  status: "pending" | "creating-worktree" | "running-hooks" | "done" | "failed" | "skipped"
  detail: string
}
```

**Why `skipped`:** Trunk-mode repos don't get a worktree — they are noted as skipped in the progress display.

### Pattern 6: Cursor Placement After Creation
**What:** After `CreateProgressView` dismisses (any key), App.tsx:
1. `setTab("workspaces")`
2. `await reload()` — must be `Promise<void>`
3. Find index of new workspace in `entries()` by name
4. `setTabCursor.workspaces(index)`
5. `setView({ view: "list" })`

**Prerequisite (confirmed needed):** `useWorkspaces.reload()` currently returns `void`. It must be changed to `return fetchStatuses(...)` so callers can `await reload()` and know when the list is settled.

**Verified:** The `fetchStatuses` function already returns `Promise<void>`. The fix is a one-liner: `function reload(): Promise<void> { ... return fetchStatuses(...) }`.

### Pattern 7: Workspace Creation Logic (adapted from CLI wizard)
**What:** The creation execution (not the wizard UI) follows the same sequence as `runWorkspaceNew()` in `src/tui/workspace-wizard.ts`:

1. Build `WorkspaceRepo[]` — `buildReposFromTemplate()` for template flow; direct registry lookup for ad-hoc
2. Run `pre_create` hooks via `runHooksCaptured()`
3. Create worktrees via `createWorktree()` per worktree-mode repo
4. Apply file ops via `applyFileOpsForRepo()` / `applyFileOpsForWorkspace()`
5. Write env files if `wsEnvFile` configured
6. Run `post_create` hooks via `runHooksCaptured()`
7. `writeWorkspace(workspaceObj)` — saves YAML
8. Generate integration artifacts via `integrations` loop

**D-17 (hook failure = warn, not abort):** Pass `abortOnFailure = false` to `runHooksCaptured()`. Capture result array and emit warnings per failed command.

**D-19 (cleanup on failure):** If `createWorktree()` throws on repo N, remove already-created worktrees (repos 0..N-1) via `removeWorktree()`, skip `writeWorkspace()`, and show error.

### Anti-Patterns to Avoid
- **Calling `@clack/prompts` from within wizard:** Stdio ownership conflict with OpenTUI — confirmed out of scope, grep check required.
- **Using `runHooks()` instead of `runHooksCaptured()`:** `runHooks` uses `stdio: "inherit"` which corrupts the OpenTUI screen.
- **Leaking trigger keypress into InlineInput:** Use `setTimeout(() => setFocused(true), 0)` when transitioning from an action menu to a wizard step (deferred focus pattern from Phase 11 decision).
- **Putting step/data in UIView union variants:** Per D-22 and STATE.md decision, wizard state lives inside WizardView local signals.
- **Not guarding navigation keys when wizard is active:** The `v.view === "wizard-create"` guard must appear in the App.tsx useKeyboard handler before navigation/tab-switch handlers, same as `inline-input` guard.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text input with cursor | Custom char accumulation | `<input>` via `InlineInput.tsx` wrapper | Built-in provides cursor movement, undo/redo, blinking cursor |
| Branch pattern expansion | String.replace by hand | `expandBranchPattern(pattern, name)` from config.ts | Already handles `<workspace-name>` token |
| Workspace existence check | fs.existsSync | `workspaceExists(name)` from config.ts | Canonical path resolution |
| YAML write | Manual yaml.stringify | `writeWorkspace(obj)` from config.ts | Zod-validated schema, ensureDir included |
| Hook execution in TUI | spawn with stdio inherit | `runHooksCaptured()` from lifecycle.ts | Line-streaming, captures output without corrupting terminal |
| Worktree creation | Raw git shell commands | `createWorktree(repoPath, worktreePath, branch)` from git.ts | Handles branch-exists check, `-b` flag |

**Key insight:** The creation logic in `workspace-wizard.ts` is the source of truth for WHAT creation does — port it to TUI by replacing `@clack/prompts` spinner/log with `CreateProgressView` row updates.

## Common Pitfalls

### Pitfall 1: reload() not awaited before cursor placement
**What goes wrong:** `setTab("workspaces")` fires, then `setTabCursor(index)` runs before `entries()` is populated with the new workspace. Cursor lands on wrong row or index 0.
**Why it happens:** `useWorkspaces.reload()` currently returns `void`, not `Promise<void>`. The async `fetchStatuses` call is not exposed.
**How to avoid:** Change `reload()` signature to `function reload(): Promise<void>` and `return fetchStatuses(...)`. Await in App.tsx before setting cursor.
**Warning signs:** Cursor always lands on first row after creation.

### Pitfall 2: Trigger keypress leaking into first InlineInput
**What goes wrong:** Pressing `n` in Repos tab launches the wizard, and `n` appears as the first character in the name input.
**Why it happens:** OpenTUI `<input>` receives the keypress that triggered wizard activation if `focused={true}` is set synchronously.
**How to avoid:** Mount first wizard step with `focused={false}`, then `setTimeout(() => setFocused(true), 0)`. This is the established Phase 11 deferred focus pattern.
**Warning signs:** Input starts with the trigger key character.

### Pitfall 3: Navigation keys firing during wizard text input
**What goes wrong:** Pressing `j`/`k` while typing workspace name moves the list cursor.
**Why it happens:** `useKeyboard` is a global broadcast — all handlers see all keys.
**How to avoid:** Add `if (v.view === "wizard-create" || v.view === "wizard-create-adhoc") return` guard at the top of App.tsx `useKeyboard` callback, above all navigation. The WizardView's own `useKeyboard` handles escape for back-nav.
**Warning signs:** List cursor jumps while typing in wizard fields.

### Pitfall 4: Partial worktree state on failure
**What goes wrong:** If creation fails on repo N, repos 0..N-1 have worktrees but no workspace YAML. User is left with orphan worktrees.
**How to avoid:** Track created worktrees in an array. On any `createWorktree()` failure, run cleanup loop: `removeWorktree(repo.main_path, repo.task_path)` for each already-created entry. Only call `writeWorkspace()` after all worktrees succeed.
**Warning signs:** `git worktree list` shows entries not tracked by any workspace YAML.

### Pitfall 5: Space key conflict between Workspaces tab selection and Repos tab multi-select
**What goes wrong:** Adding Space for Repos tab selection may accidentally fire in the Workspaces tab if the guard is wrong.
**How to avoid:** The existing `key.name === "space" && tab() === "workspaces"` guard already scopes space. Add a parallel `key.name === "space" && tab() === "repos"` block for the new `reposSelected` signal.
**Warning signs:** Workspaces tab unexpectedly selects/deselects rows when on Repos tab.

### Pitfall 6: createWorktree error output corrupting TUI
**What goes wrong:** `createWorktree()` uses Bun `$` (shell) which may write to stdout/stderr on failure, corrupting OpenTUI rendering.
**Why it happens:** `$` does not pipe output away from the terminal by default on error. However, checking the implementation — `createWorktree` uses `.quiet()` is NOT called; errors throw with message only. The git command output goes to the process stdout/stderr.
**How to avoid:** Wrap `createWorktree()` in try/catch, set worktree creation status to "failed" via callback, collect error string from the thrown Error message. The terminal should be fine as long as the TUI renderer is active — OpenTUI takes over the terminal. Verify in manual test.

## Code Examples

### Verified: expandBranchPattern usage
```typescript
// Source: src/lib/config.ts line 282
export function expandBranchPattern(pattern: string, workspaceName: string): string {
  return pattern.replace(/<workspace-name>/g, workspaceName)
}
// Usage: expandBranchPattern("feature/<workspace-name>", "my-ticket") => "feature/my-ticket"
```

### Verified: buildReposFromTemplate (adapt directly from workspace-wizard.ts)
```typescript
// Source: src/tui/workspace-wizard.ts lines 62-96
function buildReposFromTemplate(
  template: Template,
  registry: RepoRegistryEntry[],
  wsName: string,
  _branch: string,
  tasksDir: string,
): WorkspaceRepo[]
// Returns array of WorkspaceRepo with name, repo, type, mode, main_path, task_path, base_branch
```

### Verified: runHooksCaptured signature
```typescript
// Source: src/lib/lifecycle.ts lines 46-100
export async function runHooksCaptured(
  commands: string[] | undefined,
  cwd: string,
  env: Record<string, string>,
  onOutput: (output: HookOutputLine) => void,
  abortOnFailure = true   // <-- pass false for D-17 warn-not-abort behavior
): Promise<HookResult[]>
```

### Verified: SyncProgressView props shape (replicate for CreateProgressView)
```typescript
// Source: src/tui/dashboard/SyncProgressView.tsx lines 28-32
type Props = {
  rows: SyncRow[]
  done: boolean
  summary: { text: string; color: "green" | "yellow" | "red" }
}
```

### Verified: useWorkspaces reload fix
```typescript
// Current (src/tui/dashboard/hooks/useWorkspaces.ts line 33):
function reload() {
  // ...
  fetchStatuses(workspaces, setEntries, () => cancelled).then(...)
}
// Change to:
function reload(): Promise<void> {
  // ...
  return fetchStatuses(workspaces, setEntries, () => cancelled).then(() => {
    if (!cancelled) setLoading(false)
  })
}
```

### Verified: Deferred focus pattern (Phase 11 decision)
```typescript
// Source: established pattern in CLAUDE.md + STATE.md
// When activating an <input> from a keypress:
setView({ view: "wizard-create", ... })
// Inside WizardView, mount first step with:
const [focused, setFocused] = createSignal(false)
setTimeout(() => setFocused(true), 0)
// <input focused={focused()} .../>
```

### Verified: App.tsx UIView guard pattern
```typescript
// Source: src/tui/dashboard/App.tsx line 509
if (v.view === "inline-input") return
// Add adjacent to this:
if (v.view === "wizard-create" || v.view === "wizard-create-adhoc") return
if (v.view === "create-progress") return
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) + `@opentui/solid` testRender |
| Config file | bunfig.toml `[test]` preload section |
| Quick run command | `bun test tests/tui/dashboard/WizardView.test.tsx tests/tui/dashboard/CreateProgressView.test.tsx` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| C-01 | WizardView renders name input step | unit | `bun test tests/tui/dashboard/WizardView.test.tsx` | No — Wave 0 |
| C-01 | WizardView renders branch input step after name confirmed | unit | `bun test tests/tui/dashboard/WizardView.test.tsx` | No — Wave 0 |
| C-01 | WizardView renders summary/confirm step | unit | `bun test tests/tui/dashboard/WizardView.test.tsx` | No — Wave 0 |
| C-01 | No @clack/prompts imports in TUI dashboard (grep) | smoke | `grep -r '@clack/prompts' src/tui/dashboard/ -- count` | N/A |
| C-02 | Escape at non-first step returns to previous step | unit | `bun test tests/tui/dashboard/WizardView.test.tsx` | No — Wave 0 |
| C-02 | Escape at first step calls onCancel | unit | `bun test tests/tui/dashboard/WizardView.test.tsx` | No — Wave 0 |
| C-03 | useWorkspaces.reload() returns Promise<void> | unit | `bun test tests/tui/dashboard/` (existing or new) | Partial — modify hook |
| C-03 | CreateProgressView done state shows summary text | unit | `bun test tests/tui/dashboard/CreateProgressView.test.tsx` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/tui/dashboard/`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/tui/dashboard/WizardView.test.tsx` — covers C-01, C-02 step navigation
- [ ] `tests/tui/dashboard/CreateProgressView.test.tsx` — covers C-03 done/summary display

*(Existing test infrastructure — bunfig.toml, @opentui/solid testRender, kittyKeyboard pattern — is already in place from Phase 10/11/12.)*

## Open Questions

1. **Repos tab multi-select implementation scope**
   - What we know: Space multi-select exists only for Workspaces tab. D-02/D-04 require it for Repos tab.
   - What's unclear: Whether to add a full `reposSelected` signal + BatchBar equivalent, or just a single-entry selection.
   - Recommendation: Add `reposSelected` signal (Set<number>) mirroring the existing `selected` signal, but no BatchBar for Repos tab (D-10 keeps it simple). A single row indicator suffices.

2. **TemplateActionMenu cursor/arrow navigation**
   - What we know: Current `TemplateActionMenu.tsx` uses direct key shortcuts only (e, c, r), no arrow nav.
   - What's unclear: Should "Create workspace" entry follow the same pattern or add arrow navigation?
   - Recommendation: Keep letter-key shortcuts only for consistency with existing TemplateActionMenu, add `w` key for "Create workspace". This matches the established pattern.

3. **createWorktree error output to TUI**
   - What we know: `createWorktree()` uses Bun `$` without `.quiet()` suppression. Errors throw with message only.
   - What's unclear: Whether failed `git worktree add` output corrupts the OpenTUI-managed terminal.
   - Recommendation: Test manually. If output corrupts rendering, wrap `$` call in a temporary redirect or use `.quiet().nothrow()` pattern used elsewhere in git.ts.

## Sources

### Primary (HIGH confidence)
- Direct source code reads: `src/tui/workspace-wizard.ts`, `src/tui/dashboard/App.tsx`, `src/tui/dashboard/SyncProgressView.tsx`, `src/tui/dashboard/types.ts`, `src/tui/dashboard/InlineInput.tsx`, `src/tui/dashboard/ConfirmDialog.tsx`, `src/tui/dashboard/ActionMenu.tsx`, `src/tui/dashboard/TemplateActionMenu.tsx`, `src/lib/config.ts`, `src/lib/lifecycle.ts`, `src/lib/git.ts`, `src/tui/dashboard/hooks/useWorkspaces.ts`, `src/tui/dashboard/hooks/useTemplates.ts`, `src/tui/dashboard/hooks/useRepos.ts`
- Test patterns: `tests/tui/dashboard/SyncProgressView.test.tsx`, `tests/tui/dashboard/ActionMenu.test.tsx`
- Project constraints: `CLAUDE.md`, `.planning/STATE.md` (accumulated decisions), `13-CONTEXT.md`

### Secondary (MEDIUM confidence)
- OpenTUI deferred focus pattern: Verified via CLAUDE.md Dashboard TUI input rules section and STATE.md Phase 11 decision note.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified by direct import in existing source files
- Architecture: HIGH — patterns verified by reading existing SyncProgressView, App.tsx, InlineInput flows
- Pitfalls: HIGH — most derived from established decisions in STATE.md and CLAUDE.md plus direct code reading

**Research date:** 2026-03-21
**Valid until:** 2026-06-21 (stable internal codebase; OpenTUI API stable at 0.1.87)
