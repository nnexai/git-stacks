---
phase: 14-template-and-repo-management
verified: 2026-03-21T12:00:00Z
status: passed
score: 10/10 must-haves verified
gaps: []
human_verification:
  - test: "Create template from TUI end-to-end"
    expected: "Select repos on Repos tab, Enter -> [t] Create template, enter name, confirm, tab switches to Templates with cursor on new entry"
    why_human: "Full wizard flow with side effects (file written to ~/.config/git-stacks/templates/) cannot be verified in headless test"
  - test: "Repo remove blocked dialog display"
    expected: "When repo is referenced by template or workspace, RemoveBlockedView shows all referencing names and [Esc] returns to list"
    why_human: "Requires live registry with workspace and template YAML files referencing the target repo"
  - test: "Repo remove safe path end-to-end"
    expected: "ConfirmDialog shows repo name and path, confirm deletes from registry and reloads list"
    why_human: "Requires live registry, filesystem write, and list refresh to verify together"
---

# Phase 14: template-and-repo-management Verification Report

**Phase Goal:** Users can create a new template from the Templates tab and perform add/scan/remove actions on the Repos tab without leaving the TUI
**Verified:** 2026-03-21
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | UIView union includes wizard-create-template, repo-action-menu, and repo-remove-blocked variants | VERIFIED | `src/tui/dashboard/types.ts` lines 37-39 contain all three variants |
| 2 | RepoActionMenu renders three shortcut options and dispatches correct action strings on w/t/r keypresses | VERIFIED | `RepoActionMenu.tsx` has `useKeyboard` with w/t/r/escape handlers; 6 tests pass |
| 3 | RepoActionMenu shows selection-aware labels with repo count when selectionCount > 0 | VERIFIED | Reactive `wsLabel`/`tplLabel`/`removeLabel` functions use `props.selectionCount > 0` branch |
| 4 | RemoveBlockedView lists referencing templates and workspaces and calls onBack on Escape | VERIFIED | `RemoveBlockedView.tsx` uses `For` over `refTemplates`/`refWorkspaces`; 5 tests pass |
| 5 | Pressing Enter on a repo row opens RepoActionMenu | VERIFIED | `App.tsx` line 940-944: `if (tab() === "repos") { if (len > 0) setView({ view: "repo-action-menu", index: cursor() }); return }` |
| 6 | Template create wizard (name+confirm) creates template and switches to Templates tab with cursor on new entry | VERIFIED | `executeCreateTemplate` at line 592 calls `writeTemplate`, then `reloadTemplates().then(() => findIndex(...))`; `setTab("templates")` follows |
| 7 | Pressing r in RepoActionMenu routes to blocked view or ConfirmDialog based on references | VERIFIED | `handleRepoAction` lines 455-464: checks `refTemplates`/`refWorkspaces` and routes accordingly |
| 8 | Templates tab supports Space multi-select | VERIFIED | `App.tsx` line 971-980: `if (key.name === "space" && tab() === "templates")` block mirrors workspaces and repos |
| 9 | Help bars for Templates and Repos tabs match D-14/D-15 canonical text (no "n Create" on repos) | VERIFIED | `helpBarText` memo lines 173-175; repos fallback does not contain "n Create"; both have "Enter Actions  Space Select" |
| 10 | All new UIView variants have keyboard isolation guards | VERIFIED | `App.tsx` lines 891-893: guards for wizard-create-template, repo-action-menu, repo-remove-blocked |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/tui/dashboard/types.ts` | UIView union with three new variants | VERIFIED | Lines 37-39: wizard-create-template, repo-action-menu, repo-remove-blocked |
| `src/tui/dashboard/RepoActionMenu.tsx` | Action menu component for repos tab | VERIFIED | Full implementation, exports `RepoActionMenu`, 43 lines |
| `src/tui/dashboard/RemoveBlockedView.tsx` | Read-only blocked removal view | VERIFIED | Full implementation, exports `RemoveBlockedView`, 31 lines |
| `src/tui/dashboard/RepoList.tsx` | Checkbox-style prefix for repo rows | VERIFIED | `prefix()` function uses `>[x]` pattern at lines 42-46 |
| `src/tui/dashboard/TemplateList.tsx` | Checkbox-style prefix + selected prop | VERIFIED | `selected?: Set<number>` prop at line 10; `isSelected()` at line 36; `prefix()` at 37-41 |
| `src/tui/dashboard/hooks/useTemplates.ts` | reload() returns Promise<void> | VERIFIED | `async function reload(): Promise<void>` at line 7 |
| `src/tui/dashboard/App.tsx` | Full wiring of all phase 14 components | VERIFIED | Imports, signals, handlers, render blocks, guards all present |
| `tests/tui/dashboard/RepoActionMenu.test.tsx` | Component tests for RepoActionMenu | VERIFIED | 6 tests, all pass |
| `tests/tui/dashboard/RemoveBlockedView.test.tsx` | Component tests for RemoveBlockedView | VERIFIED | 5 tests, all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `App.tsx` | `RepoActionMenu.tsx` | `import { RepoActionMenu }` + render block at line 1249 | WIRED | Line 24: import present; lines 1249-1256: Show block with onAction={handleRepoAction} |
| `App.tsx` | `RemoveBlockedView.tsx` | `import { RemoveBlockedView }` + render block at line 1259 | WIRED | Line 25: import present; lines 1259-1273: Show block passing computed refs |
| `App.tsx` | `WizardView.tsx` | wizard-create-template Show block at line 1234 | WIRED | Lines 1234-1246: Show block calls `buildCreateTemplateSteps`, passes to WizardView |
| `App.tsx` | `src/lib/config.ts` | `writeTemplate` in `executeCreateTemplate` | WIRED | Line 36: `writeTemplate` in import; line 601: `writeTemplate(template)` call |
| `App.tsx` | `src/lib/config.ts` | `writeRegistry` in repo remove confirm handler | WIRED | Line 36: `writeRegistry` in import; line 1152: `writeRegistry(updated)` call |
| `TemplateList.tsx` | `App.tsx` | `selected={templatesSelected()}` prop wiring | WIRED | App.tsx line 1069: `selected={templatesSelected()}` passed to TemplateList |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| C-04 | 14-03 | User can create a new template from the Templates tab (n key) without exiting to CLI | SATISFIED | Template create flow wired via RepoActionMenu [t] action; D-02 changed entry point from Templates `n` key to Repos tab action menu — this is the implemented design, and the requirement's intent (create template in TUI) is fully met |
| R-01 | 14-01, 14-02, 14-03 | User can open an action menu from the Repos tab (Enter on a repo row opens actions) | SATISFIED | `App.tsx` Enter handler routes repos to `repo-action-menu`; RepoActionMenu renders three options; selection-aware labels working |
| R-02 | Not in any plan | User can add a repo to the registry from within the TUI | DOCUMENTED DEFERRAL | CONTEXT.md D-19 and deferred section: "requires path input / file explorer component"; REQUIREMENTS.md marks as Pending for Phase 14 |
| R-03 | Not in any plan | User can trigger a repo directory scan from within the TUI | DOCUMENTED DEFERRAL | CONTEXT.md D-20 and deferred section: "requires path input for scan directory"; REQUIREMENTS.md marks as Pending for Phase 14 |
| R-04 | 14-01, 14-03 | User can remove a repo from the registry from within the TUI (ConfirmDialog showing which workspaces reference it) | SATISFIED | `handleRepoAction("remove")` checks references; blocked path shows RemoveBlockedView; safe path shows ConfirmDialog and calls `writeRegistry` |

**Note on R-02 and R-03:** Both requirements are explicitly deferred by design decisions D-19 and D-20 in `14-CONTEXT.md`. The phase CONTEXT.md documents the deferral rationale ("requires path input / file explorer component" and "requires path input for scan directory"). REQUIREMENTS.md correctly records their status as Pending. These are not gaps — they are intentional deferred scope, clearly documented in the phase's design decisions.

**Note on C-04:** The requirement text says "Templates tab (n key)" but design decision D-02 explicitly moved template creation to the Repos tab action menu to parallel how workspace creation works (from where source data lives). The requirement intent — create a template without leaving the TUI — is fully achieved. The entry point change was a deliberate design decision, not an omission.

### Anti-Patterns Found

No blocking anti-patterns found. Scan of phase 14 files:

- `src/tui/dashboard/RepoActionMenu.tsx` — no TODOs, no empty returns, full implementation
- `src/tui/dashboard/RemoveBlockedView.tsx` — no TODOs, no placeholders, uses `For` with real data from props
- `src/tui/dashboard/RepoList.tsx` — checkbox prefix is real logic, not hardcoded string
- `src/tui/dashboard/TemplateList.tsx` — `isSelected()` memo wired to `props.selected?.has()`, defaults correctly
- `src/tui/dashboard/hooks/useTemplates.ts` — `async reload()` calls real `listTemplates()`, not stub
- `src/tui/dashboard/App.tsx` — `executeCreateTemplate` calls `writeTemplate` + `reloadTemplates`; no `console.log`-only stubs; no empty handlers

**EventTarget memory leak warnings** in test output are a known OpenTUI test harness artifact (multiple `testRender` calls in same process), not a code issue. All 258 tests pass.

### Human Verification Required

**1. Create template from TUI (end-to-end)**

**Test:** Run `bun run dev manage`, navigate to Repos tab, select one or more repos with Space, press Enter, press `t`, enter a template name, confirm.
**Expected:** New template YAML file created in `~/.config/git-stacks/templates/`, app switches to Templates tab, cursor lands on the new entry.
**Why human:** WizardView state machine, filesystem write, reactive reload, and tab/cursor placement must all work together; headless tests cover each piece independently but not the complete flow.

**2. Repo remove blocked dialog**

**Test:** Run `bun run dev manage`, navigate to Repos tab, press Enter on a repo that is referenced by at least one template or workspace, press `r`.
**Expected:** RemoveBlockedView appears listing all referencing templates/workspaces with instructions to remove references first.
**Why human:** Requires a live config directory with cross-referencing YAML files.

**3. Repo remove safe path**

**Test:** Navigate to a repo with no referencing templates or workspaces, press Enter, press `r`, confirm with `y`.
**Expected:** ConfirmDialog shows repo name and path, pressing `y` removes from registry and reloads the list (entry disappears).
**Why human:** Requires live registry, filesystem write verification, and reactive list refresh.

### Gaps Summary

No gaps. All automated checks passed:
- All 9 source artifacts exist and are substantive implementations (not stubs)
- All 6 key links verified (import present + render site or call site present)
- C-04, R-01, R-04 requirements satisfied by codebase evidence
- R-02 and R-03 correctly documented as deferred per CONTEXT.md D-19/D-20
- No n-key handler on Repos tab (removed per D-03)
- No `setConfirmContext("repo")` extension (uses dedicated `repoRemoveTarget` signal)
- TypeScript compiles clean (0 errors)
- Full test suite: 258 pass, 0 fail

---

_Verified: 2026-03-21_
_Verifier: Claude (gsd-verifier)_
