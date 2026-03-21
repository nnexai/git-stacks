# Phase 14: template-and-repo-management — Research

**Researched:** 2026-03-21
**Domain:** OpenTUI/SolidJS TUI — action menus, wizard flows, repo registry mutation, selection display unification
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Entry points — template create from Repos tab selection**
- D-01: Template create (C-04): select repos on Repos tab → Enter → action menu → "Create template" → WizardView (name → confirm) → template saved with selected repos defaulting to worktree mode + registry default branch
- D-02: No `n` key on Templates tab for create — creation lives on the Repos tab where the source data (repos) lives, paralleling the workspace create pattern from Phase 13
- D-03: The existing `n` shortcut on Repos tab for "Create workspace" moves INTO the action menu — no standalone `n` key anymore

**Repos tab action menu (R-01)**
- D-04: Enter on a repo row opens `RepoActionMenu` with: `[w] Create workspace`, `[t] Create template`, `[r] Remove`
- D-05: Menu is selection-aware — when repos are multi-selected, labels show count: "Create workspace (3 repos)", "Create template (3 repos)", "Remove (3)". When single (no multi-select), shows focused repo name.
- D-06: Action menu follows the same component pattern as TemplateActionMenu and workspace ActionMenu

**Repo remove (R-04)**
- D-07: Remove shows a ConfirmDialog listing workspaces and templates that reference the repo
- D-08: Remove is BLOCKED if any workspace or template references the repo — user must remove those references first. Dialog shows what references it and explains why removal is blocked.
- D-09: If no references exist, standard confirm dialog with repo name and path

**Unified selection display**
- D-10: All three tabs use the `>[x]` / `>[ ]` / ` [x]` / ` [ ]` checkbox indicator style (currently only Workspaces uses this; Repos uses bare `x`/`>` markers)
- D-11: Templates tab gains Space multi-select (currently has none) — all three tabs behave identically: Space to toggle, Enter for action menu
- D-12: RepoList row format updated from bare markers to checkbox format matching WorkspaceRow
- D-13: TemplateList row format updated to include checkbox column

**Help bar alignment**
- D-14: Repos tab help bar changes from `Space Select  n Create` to match the other tabs: `Enter Actions  Space Select  / Filter  r Refresh  ? Help  q Quit`
- D-15: All three tab help bars show the same core shortcuts — `1/2/3 Tabs  ↑↓/jk Navigate  Enter Actions  Space Select  / Filter  r Refresh  ? Help  q Quit`. Workspaces additionally shows `m Messages`.

**Template create wizard flow**
- D-16: WizardView steps: name (text, with uniqueness validation via `templateExists()`) → confirm (shows template name + repo list with modes)
- D-17: All repos default to worktree mode + registry default branch — no per-repo mode picker in wizard. User can edit YAML after for description, branch patterns, hooks, modes.
- D-18: After template creation, switch to Templates tab and position cursor on the new template (parallels D-20 from Phase 13 for workspace create)

**Scope reduction — deferred**
- D-19: Add repo (R-02) deferred — requires path input / file explorer component
- D-20: Scan repos (R-03) deferred — requires path input for scan directory
- D-21: No rename action on repos for now — edit YAML or use CLI

### Claude's Discretion
- RepoActionMenu component implementation details
- How to detect references (grep workspace/template YAMLs for repo name)
- Template YAML structure for the new template (schema already exists in config.ts)
- Whether `templateExists()` needs a new helper or reuses existing config functions
- Batch remove UX when multiple repos selected (sequential confirms or single batch confirm)

### Deferred Ideas (OUT OF SCOPE)
- Add repo from TUI (R-02) — requires path input / file explorer; use CLI `repo add` for now
- Scan repos from TUI (R-03) — requires scan directory path; use CLI `repo scan` for now
- Repo rename in TUI — edit YAML or use CLI `repo rename`
- Per-repo mode/branch picker in template create wizard — edit YAML after creation
- Template description step in wizard — edit YAML after creation
- Batch remove confirmation (single dialog for multiple selected repos) — start with sequential
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| C-04 | User can create a new template from the Templates tab (`n` key) without exiting to CLI | Decision D-01/D-02 reframes entry point to Repos tab action menu; WizardView is directly reusable with `templateExists()` validation; `writeTemplate()` already handles persistence |
| R-01 | User can open an action menu from the Repos tab (Enter on a repo row opens actions) | Enter key currently returns early for `tab === "repos"` (App.tsx line 844); add `RepoActionMenu` component following `TemplateActionMenu` pattern; add `repo-action-menu` UIView variant |
| R-02 | User can add a repo to the registry from within the TUI (deferred per D-19) | OUT OF SCOPE for this phase |
| R-03 | User can trigger a repo directory scan from within the TUI (deferred per D-20) | OUT OF SCOPE for this phase |
| R-04 | User can remove a repo from the registry from within the TUI (ConfirmDialog showing which workspaces reference it) | `RepoDetail.tsx` already computes referencing templates+workspaces; `writeRegistry()` handles persistence; blocked path needs `RemoveBlockedView`; safe path reuses `ConfirmDialog` |
</phase_requirements>

---

## Summary

Phase 14 adds template creation from the Repos tab and repo removal to the TUI dashboard. The implementation is additive — no existing behavior is destroyed, only extended. Three parallel work streams make this phase: (1) `RepoActionMenu` component + Enter key wiring + two new UIView variants, (2) template create wizard using the existing `WizardView<T>` component with a 2-step flow (name → confirm), and (3) selection display unification across all three list components to the `>[x]` checkbox style.

All required infrastructure from prior phases is in place. `WizardView` handles text + confirm steps with deferred focus and back-navigation already working. `ConfirmDialog` and the `templateExists()` / `writeTemplate()` / `readRegistry()` / `writeRegistry()` functions cover all persistence needs. `RepoDetail.tsx` already computes the `usedByTemplates` and `usedByWorkspaces` arrays needed for the remove-blocked path — that logic can be lifted directly.

The main judgment calls for implementation are: (a) how `RepoActionMenu` renders selection-aware labels (needs `reposSelected` count passed as a prop), (b) that the confirm context guard in `executeConfirmed()` is currently a string enum (`"workspace" | "template"`) and will need either extension or a separate code path for repo removal, and (c) tab switching after template create must mirror the post-workspace-create pattern in `create-progress` handler (lines 801-808 of App.tsx).

**Primary recommendation:** Implement in plan order: types.ts extensions → new components (RepoActionMenu, RemoveBlockedView) → selection unification (RepoList, TemplateList) → App.tsx wiring (Enter handler, Space for templates, executeCreateTemplate, executeRemoveRepo, help bar, view guard). Each plan is independently testable.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @opentui/solid | 0.1.87 | TUI rendering, `useKeyboard`, `testRender` | Project standard — all TUI components use this |
| solid-js | current | Reactive signals, `createSignal`, `createMemo`, `Show`, `Switch`, `Match`, `For` | Required by OpenTUI |
| bun:test | bundled | Unit + component tests | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| yaml (via config.ts) | bundled | YAML I/O | All registry/template persistence goes through `src/lib/config.ts` — never call yaml directly |

**Installation:** None needed — all dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
src/tui/dashboard/
  RepoActionMenu.tsx        — new: action menu for repo rows
  RemoveBlockedView.tsx     — new: read-only blocked-removal explanation view
tests/tui/dashboard/
  RepoActionMenu.test.tsx   — new: renders labels, keyboard shortcuts, escape
```

### Pattern 1: Action Menu Component

All action menus in this codebase are thin stateless components with a `useKeyboard` handler and a JSX render. They do NOT manage cursor state internally (unlike `ActionMenu.tsx` which is the only exception — it has internal cursor state because workspace actions are navigated by arrow keys). `TemplateActionMenu` is the reference for key-shortcut-only menus.

**RepoActionMenu should follow TemplateActionMenu exactly:**

```typescript
// src/tui/dashboard/RepoActionMenu.tsx
/** @jsxImportSource @opentui/solid */
import { useKeyboard } from "@opentui/solid"

type Props = {
  repoName: string        // focused repo name (shown in single-select mode)
  selectionCount: number  // 0 = single (focused only), >0 = multi-select active
  onAction: (action: "create-workspace" | "create-template" | "remove") => void
  onCancel: () => void
}

export function RepoActionMenu(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape") { props.onCancel(); return }
    if (key.name === "w") { props.onAction("create-workspace"); return }
    if (key.name === "t") { props.onAction("create-template"); return }
    if (key.name === "r") { props.onAction("remove"); return }
  })
  // labels are selection-aware per D-05
}
```

**Source:** `src/tui/dashboard/TemplateActionMenu.tsx` (lines 10-17)

### Pattern 2: UIView Union Extension

New variants must be added to `UIView` in `types.ts` before any component can render them. The union is a discriminated union with `view` as the discriminant:

```typescript
// Addition to UIView union in src/tui/dashboard/types.ts
| { view: "wizard-create-template"; source: "repos"; repoNames: string[] }
| { view: "repo-action-menu"; index: number }
| { view: "repo-remove-blocked"; repoName: string }
```

And new keyboard guards in the main `useKeyboard` callback in App.tsx must be placed above the list-navigation block:

```typescript
if (v.view === "wizard-create-template") return   // WizardView handles its own keys
if (v.view === "repo-action-menu") return          // RepoActionMenu handles its own keys
if (v.view === "repo-remove-blocked") return       // RemoveBlockedView handles its own keys (Esc)
```

**Source:** `src/tui/dashboard/types.ts` (current UIView union); App.tsx lines 791-810 (guard pattern)

### Pattern 3: Template Create — WizardView Reuse

The `WizardView<T>` generic component needs only a `steps` array and `onComplete`/`onCancel` callbacks. For template create, the data type is `{ name: string }` (only one text field; repos come from `repoNames` in the UIView variant, not from the wizard):

```typescript
type CreateTemplateData = { name: string }

function buildCreateTemplateSteps(repoNames: string[]): WizardStep<CreateTemplateData>[] {
  return [
    {
      kind: "text",
      label: "Template name",
      key: "name",
      validate: (v: string) => {
        if (!v.trim()) return "Required"
        if (templateExists(v.trim())) return `Template '${v.trim()}' already exists`
        return undefined
      },
    },
    {
      kind: "confirm",
      buildMessage: (data: Partial<CreateTemplateData>) => {
        const repoLines = repoNames.map(n => `  ${n} (worktree)`).join("\n")
        return `Create template "${data.name}" with ${repoNames.length} repos?\n${repoLines}`
      },
    },
  ]
}
```

`templateExists()` is already exported from `src/lib/config.ts` (line 247). No new helper needed.

**Source:** App.tsx `buildAdhocWizardSteps` (lines 489-515) — closest analog; `WizardView.tsx` (full file)

### Pattern 4: Template Persistence

Template YAML structure is defined by `TemplateSchema` in `src/lib/config.ts`. For the new template, construct a minimal `Template` object and pass to `writeTemplate()`:

```typescript
async function executeCreateTemplate(data: { name: string }, repoNames: string[]) {
  const registry = readRegistry()
  const registryMap = new Map(registry.map(r => [r.name, r]))
  const templateRepos: TemplateRepo[] = repoNames.map(name => ({
    repo: name,
    mode: "worktree" as const,
    // base_branch intentionally omitted — defaults to registry entry's default_branch at workspace creation
  }))
  const template: Template = {
    name: data.name.trim(),
    schema_version: "1",
    repos: templateRepos,
  }
  writeTemplate(template)
}
```

After `writeTemplate()`, call `reloadTemplates()`, then switch tab to `"templates"` and position cursor:

```typescript
reloadTemplates().then(() => {
  const idx = templateEntries().findIndex(t => t.name === data.name.trim())
  if (idx >= 0) tabCursor.templates[1](idx)
  setTab("templates")
  setView({ view: "list" })
})
```

Note: `useTemplates.reload()` returns `Promise<void>` (confirmed in Phase 13 for `useWorkspaces.reload()` — same pattern). Verify `useTemplates.ts` exports `reload(): Promise<void>` before coding.

**Source:** `src/lib/config.ts` lines 243-278; App.tsx `executeCreateWorkspace` post-completion block (lines 800-808)

### Pattern 5: Repo Removal

The CLI `repo remove` does: `registry.splice(idx, 1); writeRegistry(registry)`. The TUI must replicate this. The confirm-context enum currently distinguishes `"workspace" | "template"`. For repo removal, the cleanest approach is a dedicated `executeRemoveRepo(repoName: string)` function rather than extending `confirmContext`.

```typescript
async function executeRemoveRepo(repoName: string) {
  const registry = readRegistry()
  const updated = registry.filter(r => r.name !== repoName)
  writeRegistry(updated)
  reloadRepos()
  setView({ view: "list" })
  clampCursor()
}
```

Reference check logic (for the blocked path) is already in `RepoDetail.tsx` as reactive memos. For the imperative remove path, compute inline:

```typescript
function getRepoReferences(repoName: string) {
  const refTemplates = templateEntries().filter(t => t.repos.some(r => r.repo === repoName))
  const refWorkspaces = allWorkspaces().filter(ws => ws.repos.some(r => r.repo === repoName))
  return { refTemplates, refWorkspaces }
}
```

**Source:** `src/commands/repo.ts` lines 98-119; `src/tui/dashboard/RepoDetail.tsx` lines 19-26; `src/lib/config.ts` line 232

### Pattern 6: Selection Display Unification

`WorkspaceRow.tsx` lines 28-31 define the canonical prefix logic. The same 4-character logic applies to RepoList and TemplateList row prefixes:

```typescript
// Canonical pattern (from WorkspaceRow.tsx lines 28-31):
const prefix = () => {
  const sel = props.selected ? "x" : " "
  const focus = props.focused ? ">" : " "
  return `${focus}[${sel}]`
}
```

RepoList currently uses: `isSelected() ? " x " : focused() ? " > " : "   "` — this is 3 characters, not 4. The updated version must be 4 characters: `>[x]` / `>[ ]` / ` [x]` / ` [ ]`.

TemplateList currently has no `selected` prop. It needs:
- `selected?: Set<number>` prop added to `Props`
- same prefix logic
- The parent App.tsx must pass a `templatesSelected` signal (new signal, parallels `reposSelected`)

**Source:** `src/tui/dashboard/WorkspaceRow.tsx` lines 28-31; `src/tui/dashboard/RepoList.tsx` line 44; `src/tui/dashboard/TemplateList.tsx` lines 9-11

### Pattern 7: Space Multi-Select for Templates Tab

App.tsx already has Space multi-select for `tab === "workspaces"` (lines 849-858) and `tab === "repos"` (lines 860-869). The templates case needs identical logic with a new `templatesSelected` signal. The `TemplateList` component needs a `selected` prop passed from App.tsx.

### Anti-Patterns to Avoid

- **Extending `confirmContext` string enum for repos:** The `confirmContext` signal currently controls whether `executeConfirmed()` runs template-delete or workspace-delete logic. Adding a third `"repo"` case creates more branching in an already-complex function. Use a dedicated `executeRemoveRepo()` instead.
- **Modifying `buildTemplateWizardSteps` or `buildAdhocWizardSteps`:** These are workspace-create helpers. Template-create needs its own `buildCreateTemplateSteps()`.
- **Reading templates/workspaces from disk** in the remove-blocked check: Use the existing reactive signals `templateEntries()` and `allWorkspaces()` — they are already loaded and current.
- **Calling `registry.splice()` directly in the TUI** without going through `writeRegistry()`: The CLI does this; the TUI should call the same config function.
- **Placing new keyboard guards after list navigation:** All modal view guards (`if (v.view === "repo-action-menu") return`) MUST be placed before `if (v.view === "list")` in the `useKeyboard` callback — otherwise keystrokes reach the list navigation while a modal is showing.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text input with validation | Custom keyboard accumulation | `WizardView` + `InlineInput` | Built-in cursor movement, undo/redo, focus management |
| Template uniqueness check | File scan loop | `templateExists(name)` from config.ts | Already handles the path construction and existsSync |
| Template YAML write | YAML.stringify + fs.writeFileSync | `writeTemplate(template)` from config.ts | Handles dir creation, Zod schema compliance |
| Registry mutation | Direct YAML edit | `readRegistry()` + `writeRegistry(entries)` | Consistent with CLI implementation |
| Referencing-workspace detection | Custom JSON grep | Use `templateEntries()` and `allWorkspaces()` signals | Already loaded, reactive, correct |
| Deferred focus on wizard open | Manual keypress eat | `focused={false}` + `setTimeout(() => setFocused(true), 0)` | Established project pattern — prevents trigger keypress leaking |

---

## Common Pitfalls

### Pitfall 1: N-key handler on Repos tab not removed
**What goes wrong:** After adding Enter → RepoActionMenu, the existing `n` key handler (lines 894-909 of App.tsx) still fires `wizard-create-adhoc` directly. Per D-03, the `n` key is removed — workspace creation from Repos tab now goes through the action menu's `[w]` option.
**Why it happens:** The handler is a separate `if` block that won't conflict with Enter, so it's easy to overlook.
**How to avoid:** The plan for App.tsx wiring must explicitly include removing the `n` key handler and replacing it with `[w]` in the action menu.
**Warning signs:** Pressing `n` on the Repos tab still opens the wizard without going through the menu.

### Pitfall 2: View guard missing for new UIView variants
**What goes wrong:** Keyboard events reach list navigation while RepoActionMenu or WizardView (template create) is shown.
**Why it happens:** Each new UIView variant must have an explicit guard in the main `useKeyboard` block. Omitting one means the new modal's keystrokes (especially `t`, `r`, `w`) also fire the tab-switch or other list-level handlers.
**How to avoid:** Add three guards above `if (v.view === "list")`: for `wizard-create-template`, `repo-action-menu`, and `repo-remove-blocked`.
**Warning signs:** Pressing `r` in RepoActionMenu triggers a workspace refresh instead of/in addition to Remove.

### Pitfall 3: detailBoxTitle memo not updated for new views
**What goes wrong:** The detail box border title shows the wrong text (or the selected item name) while a wizard or action menu is displayed.
**Why it happens:** `detailBoxTitle` in App.tsx explicitly checks for `wizard-create`, `wizard-create-adhoc`, `create-progress` but won't know about `wizard-create-template`, `repo-action-menu`, `repo-remove-blocked` unless added.
**How to avoid:** Add matching `if` cases to `detailBoxTitle` memo. Suggested titles: `" Create Template "` for wizard, the repo name for action menu and remove-blocked views.
**Warning signs:** The bottom pane border shows a workspace/template name while the wizard is active.

### Pitfall 4: Cursor placement after template create uses wrong signal
**What goes wrong:** After `writeTemplate()` + `reloadTemplates()`, `tabCursor.templates[1](idx)` is called before the reload resolves, so `templateEntries()` hasn't updated yet and `findIndex` returns -1.
**Why it happens:** `reloadTemplates()` is async. Must await or use `.then()` on the Promise before reading `templateEntries()`.
**How to avoid:** Mirror the workspace create pattern exactly (App.tsx lines 803-807): call inside `.then()` callback after `reload()`.
**Warning signs:** After creating a template, the Templates tab cursor is at index 0 instead of the new template.

### Pitfall 5: TemplateList `selected` prop is undefined when no multi-select signal exists
**What goes wrong:** TypeScript compile error or runtime error if TemplateList receives `selected` as required prop but App.tsx doesn't pass one.
**Why it happens:** Adding `selected` as required to TemplateList Props without creating the corresponding signal in App.tsx.
**How to avoid:** Create `templatesSelected` signal in App.tsx at the same time as updating TemplateList. Make `selected` optional (`selected?: Set<number>`) in TemplateList Props to avoid breaking existing render while wiring is incomplete.
**Warning signs:** TypeScript error on TemplateList JSX in App.tsx.

### Pitfall 6: RepoActionMenu action dispatch does not pass repoNames to wizard
**What goes wrong:** `wizard-create-template` UIView variant needs `repoNames: string[]` but the action handler only has `index: number` from the `repo-action-menu` view.
**Why it happens:** The repoNames must be computed at dispatch time from the `reposSelected` signal (or the focused repo if no selection).
**How to avoid:** In `handleRepoAction("create-template")`, compute `repoNames` from `reposSelected()` or `currentRepo()` at the moment of dispatch — same pattern as the existing `n`-key workspace create (App.tsx lines 896-908).

---

## Code Examples

### RemoveBlockedView component structure

```typescript
// Source: 14-CONTEXT.md D-08, 14-UI-SPEC.md Repo remove flow Path A
/** @jsxImportSource @opentui/solid */
import { For } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { Template, Workspace } from "../../lib/config"

type Props = {
  repoName: string
  refTemplates: Template[]
  refWorkspaces: Workspace[]
  onBack: () => void
}

export function RemoveBlockedView(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape") props.onBack()
  })

  return (
    <box flexDirection="column" paddingTop={1} paddingLeft={2}>
      <text fg="yellow">  Cannot remove "{props.repoName}" — referenced by:</text>
      <For each={props.refTemplates}>
        {(t) => <text fg="gray">    template: {t.name}</text>}
      </For>
      <For each={props.refWorkspaces}>
        {(ws) => <text fg="gray">    workspace: {ws.name}</text>}
      </For>
      <text fg="gray">{"\n"}  Remove these references first, then retry.</text>
      <text fg="gray">  [Esc] Back</text>
    </box>
  )
}
```

### RepoActionMenu selection-aware labels

```typescript
// Source: 14-CONTEXT.md D-05; 14-UI-SPEC.md Interaction Contract
const wsLabel = () => props.selectionCount > 0
  ? `[w] Create workspace (${props.selectionCount} repos)`
  : "[w] Create workspace"
const tmLabel = () => props.selectionCount > 0
  ? `[t] Create template (${props.selectionCount} repos)`
  : "[t] Create template"
const rmLabel = () => props.selectionCount > 0
  ? `[r] Remove (${props.selectionCount})`
  : "[r] Remove"
```

### Repo remove dispatch in handleRepoAction

```typescript
// Source: RepoDetail.tsx lines 19-26 (reference logic); config.ts writeRegistry
async function handleRepoAction(action: "create-workspace" | "create-template" | "remove") {
  const v = view() as { view: "repo-action-menu"; index: number }
  const repo = filteredRepos()[v.index]
  if (!repo) { setView({ view: "list" }); return }

  if (action === "remove") {
    const refTemplates = templateEntries().filter(t => t.repos.some(r => r.repo === repo.name))
    const refWorkspaces = allWorkspaces().filter(ws => ws.repos.some(r => r.repo === repo.name))
    if (refTemplates.length > 0 || refWorkspaces.length > 0) {
      setView({ view: "repo-remove-blocked", repoName: repo.name })
    } else {
      // Show ConfirmDialog — need to set context so executeConfirmed knows it's a repo
      // Recommendation: use dedicated executeRemoveRepo path, not confirmContext extension
    }
    return
  }
  // ... workspace / template create flows
}
```

### RepoList checkbox unification

```typescript
// Source: WorkspaceRow.tsx lines 28-31 (canonical reference)
// Replace current RepoList line 44:
//   {isSelected() ? " x " : focused() ? " > " : "   "}
// With:
const prefix = () => {
  const sel = isSelected() ? "x" : " "
  const focus = focused() ? ">" : " "
  return `${focus}[${sel}]`
}
// In JSX: <text fg={focused() ? "white" : "gray"}>{prefix()} </text>
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Jest-compatible) + `testRender` from `@opentui/solid` |
| Config file | `bunfig.toml` — `[test]` preload applies Babel solid transform |
| Quick run command | `bun test tests/tui/dashboard/RepoActionMenu.test.tsx` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R-01 | RepoActionMenu renders labels for single-select | unit | `bun test tests/tui/dashboard/RepoActionMenu.test.tsx` | ❌ Wave 0 |
| R-01 | RepoActionMenu shows selection-aware labels when selectionCount > 0 | unit | `bun test tests/tui/dashboard/RepoActionMenu.test.tsx` | ❌ Wave 0 |
| R-01 | RepoActionMenu dispatches correct action on key shortcut (`w`, `t`, `r`) | unit | `bun test tests/tui/dashboard/RepoActionMenu.test.tsx` | ❌ Wave 0 |
| R-01 | RepoActionMenu calls onCancel on Escape | unit | `bun test tests/tui/dashboard/RepoActionMenu.test.tsx` | ❌ Wave 0 |
| R-04 | RemoveBlockedView renders referenced templates and workspaces | unit | `bun test tests/tui/dashboard/RemoveBlockedView.test.tsx` | ❌ Wave 0 |
| R-04 | RemoveBlockedView calls onBack on Escape | unit | `bun test tests/tui/dashboard/RemoveBlockedView.test.tsx` | ❌ Wave 0 |
| C-04 | Template create wizard: validates uniqueness, shows error on duplicate name | unit | `bun test tests/tui/dashboard/WizardView.test.tsx` | ✅ (extend existing) |
| C-04 | Template create wizard: confirm step shows repo list | unit | `bun test tests/tui/dashboard/WizardView.test.tsx` | ✅ (extend existing) |

### Sampling Rate
- **Per task commit:** `bun test tests/tui/dashboard/`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/tui/dashboard/RepoActionMenu.test.tsx` — covers R-01 (render, keyboard shortcuts, selection-aware labels, Escape cancel)
- [ ] `tests/tui/dashboard/RemoveBlockedView.test.tsx` — covers R-04 blocked path (renders references, Escape calls onBack)
- Note: `WizardView.test.tsx` already exists and covers the reusable wizard — extend it for template-create-specific validation if warranted

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@clack/prompts` for TUI create flows | Native `WizardView` component | Phase 13 | All create flows must be native TUI — clack has unresolvable stdio conflict |
| `renderer.suspend()` for all spawned processes | Reserved for $EDITOR and `repo scan` only | Phase 13 decisions | No suspend/resume for template create |
| Ad-hoc workspace create via `n` key (standalone) | `n` key removed; create flows go through action menu | This phase (D-03) | Breaking change on Repos tab keyboard UX |

---

## Open Questions

1. **Does `useTemplates.reload()` return `Promise<void>`?**
   - What we know: `useWorkspaces.reload()` was made to return `Promise<void>` as a Phase 13 prerequisite (STATE.md line 44). `useTemplates` follows the same pattern but was not explicitly mentioned.
   - What's unclear: Whether `useTemplates.ts` already returns a Promise or is fire-and-forget.
   - Recommendation: Read `src/tui/dashboard/hooks/useTemplates.ts` before coding the post-create cursor placement. If it doesn't return a Promise, the plan should include making it return one (small change).

2. **Batch remove: sequential confirms or single dialog?**
   - What we know: CONTEXT.md defers batch remove dialog to future; "start with sequential" is noted.
   - What's unclear: Whether the plan should implement sequential confirms (one ConfirmDialog per selected repo, looping) or simply ignore multi-select for remove (remove only the focused repo regardless of selection).
   - Recommendation: Implement focused-repo-only remove. If `reposSelected.size > 1`, the `[r] Remove` option in the menu still removes only the focused repo. This is the simplest safe behavior and defers batch remove complexity.

3. **`confirmContext` extension vs. dedicated path for repo removal**
   - What we know: `confirmContext` is `"workspace" | "template"`, used in `executeConfirmed()` to branch behavior. Adding `"repo"` is one option; a dedicated `executeRemoveRepo()` function is another.
   - Recommendation: Use a dedicated `executeRemoveRepo()` that bypasses the `confirmContext` system entirely. The existing `ConfirmDialog` component's `onConfirm` callback can call `executeRemoveRepo()` directly when the view is `repo-remove-confirm`.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase read — `src/tui/dashboard/App.tsx` (full file, all relevant sections)
- Direct codebase read — `src/tui/dashboard/types.ts` (UIView union, Action union)
- Direct codebase read — `src/tui/dashboard/WizardView.tsx` (component API and patterns)
- Direct codebase read — `src/tui/dashboard/TemplateActionMenu.tsx` (reference pattern for RepoActionMenu)
- Direct codebase read — `src/tui/dashboard/WorkspaceRow.tsx` (canonical checkbox prefix)
- Direct codebase read — `src/tui/dashboard/RepoList.tsx` (current prefix logic)
- Direct codebase read — `src/tui/dashboard/TemplateList.tsx` (no selection, needs update)
- Direct codebase read — `src/tui/dashboard/RepoDetail.tsx` (reference computation already done)
- Direct codebase read — `src/tui/dashboard/ConfirmDialog.tsx` (reusable component API)
- Direct codebase read — `src/lib/config.ts` (templateExists, writeTemplate, readRegistry, writeRegistry)
- Direct codebase read — `src/commands/repo.ts` (CLI remove pattern)
- Direct codebase read — `tests/tui/dashboard/WizardView.test.tsx` (test patterns)
- Direct codebase read — `tests/tui/dashboard/ActionMenu.test.tsx` (test patterns)
- Direct codebase read — `.planning/phases/14-template-and-repo-management/14-CONTEXT.md`
- Direct codebase read — `.planning/phases/14-template-and-repo-management/14-UI-SPEC.md`
- Direct codebase read — `.planning/STATE.md`
- Direct codebase read — `.planning/REQUIREMENTS.md`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed present in codebase
- Architecture: HIGH — all patterns verified from actual source files with line references
- Pitfalls: HIGH — identified from direct reading of App.tsx control flow and existing component contracts
- Test patterns: HIGH — copied directly from working test files

**Research date:** 2026-03-21
**Valid until:** 2026-04-20 (stable codebase, no fast-moving dependencies)
