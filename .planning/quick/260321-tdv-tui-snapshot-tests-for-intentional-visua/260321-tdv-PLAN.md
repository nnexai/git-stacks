---
phase: quick-260321-tdv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/tui/dashboard/snapshots/CenteredDialog.snap.tsx
  - tests/tui/dashboard/snapshots/ConfirmDialog.snap.tsx
  - tests/tui/dashboard/snapshots/HelpOverlay.snap.tsx
  - tests/tui/dashboard/snapshots/StatusIndicator.snap.tsx
  - tests/tui/dashboard/snapshots/BatchBar.snap.tsx
  - tests/tui/dashboard/snapshots/ProgressView.snap.tsx
  - tests/tui/dashboard/snapshots/RepoDetail.snap.tsx
autonomous: true
requirements: [QUICK-TDV]

must_haves:
  truths:
    - "Snapshot tests capture the rendered char frame of each TUI component"
    - "Running bun test --update-snapshots regenerates snapshots on intentional changes"
    - "Unintentional visual regressions cause snapshot test failures"
  artifacts:
    - path: "tests/tui/dashboard/snapshots/CenteredDialog.snap.tsx"
      provides: "Snapshot test for CenteredDialog component"
    - path: "tests/tui/dashboard/snapshots/ConfirmDialog.snap.tsx"
      provides: "Snapshot test for ConfirmDialog component"
    - path: "tests/tui/dashboard/snapshots/HelpOverlay.snap.tsx"
      provides: "Snapshot test for HelpOverlay component"
    - path: "tests/tui/dashboard/snapshots/StatusIndicator.snap.tsx"
      provides: "Snapshot test for StatusIndicator component"
    - path: "tests/tui/dashboard/snapshots/BatchBar.snap.tsx"
      provides: "Snapshot test for BatchBar component"
    - path: "tests/tui/dashboard/snapshots/ProgressView.snap.tsx"
      provides: "Snapshot test for ProgressView component"
    - path: "tests/tui/dashboard/snapshots/RepoDetail.snap.tsx"
      provides: "Snapshot test for RepoDetail component"
  key_links:
    - from: "tests/tui/dashboard/snapshots/*.snap.tsx"
      to: "src/tui/dashboard/*.tsx"
      via: "testRender + captureCharFrame + toMatchSnapshot"
      pattern: "captureCharFrame.*toMatchSnapshot"
---

<objective>
Add snapshot tests for 7 untested TUI dashboard components to catch unintentional visual regressions.

Purpose: The dashboard has 25 components but only ~15 have tests. The untested ones (CenteredDialog, ConfirmDialog, HelpOverlay, StatusIndicator, BatchBar, ProgressView, RepoDetail) are purely visual — perfect snapshot candidates. When a future change alters their rendered output, the snapshot diff will make the change intentional and reviewable.

Output: 7 snapshot test files in `tests/tui/dashboard/snapshots/`, each using `testRender` + `captureCharFrame` + `toMatchSnapshot` from bun:test.
</objective>

<execution_context>
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/workflows/execute-plan.md
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@tests/tui/dashboard/ActionMenu.test.tsx (reference pattern for testRender + captureCharFrame)
@tests/tui/dashboard/RemoveBlockedView.test.tsx (reference pattern)
@src/tui/dashboard/CenteredDialog.tsx
@src/tui/dashboard/ConfirmDialog.tsx
@src/tui/dashboard/HelpOverlay.tsx
@src/tui/dashboard/StatusIndicator.tsx
@src/tui/dashboard/BatchBar.tsx
@src/tui/dashboard/ProgressView.tsx
@src/tui/dashboard/RepoDetail.tsx
@src/tui/dashboard/types.ts (for WorkspaceStatus, Tab types)

<interfaces>
<!-- Existing test pattern from ActionMenu.test.tsx -->
```tsx
/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
// ...
const { renderOnce, captureCharFrame } = await testRender(() => <Component {...props} />, renderOpts)
await renderOnce()
const frame = captureCharFrame()
expect(frame).toContain("expected text")
```

<!-- For snapshot testing, replace toContain with toMatchSnapshot -->
```tsx
expect(frame).toMatchSnapshot()
```

<!-- Key component interfaces -->
CenteredDialog: { title: string, size?: "small" | "medium" | "large", children: JSX.Element }
ConfirmDialog: { message: string, title?: string, onConfirm: () => void, onCancel: () => void }
HelpOverlay: { tab: Tab, onClose: () => void } // Tab = "workspaces" | "templates" | "repos"
StatusIndicator: { status: WorkspaceStatus } // WorkspaceStatus = { state: "pending" | "loading" | "loaded" | "error", ... }
BatchBar: { count: number, actions?: string }
ProgressView: { title: string, lines: string[], done: boolean }
RepoDetail: { entry: RepoEntry | undefined, allTemplates: Template[], allWorkspaces: Workspace[] }
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create snapshot tests for simple leaf components (CenteredDialog, StatusIndicator, BatchBar)</name>
  <files>
    tests/tui/dashboard/snapshots/CenteredDialog.snap.tsx
    tests/tui/dashboard/snapshots/StatusIndicator.snap.tsx
    tests/tui/dashboard/snapshots/BatchBar.snap.tsx
  </files>
  <action>
Create directory `tests/tui/dashboard/snapshots/`.

For each component, create a `.snap.tsx` test file following the established pattern from ActionMenu.test.tsx:
- Use `/** @jsxImportSource @opentui/solid */` pragma
- Import from `bun:test` and `@opentui/solid`
- Use `testRender` with `renderOnce()` + `captureCharFrame()` + `toMatchSnapshot()`
- Use `const renderOpts = { kittyKeyboard: true }` for consistency

**CenteredDialog.snap.tsx** — 2 snapshots:
1. Default size (small) with simple text children and title "Test Dialog"
2. Large size with title "Large Dialog" and multi-line children

**StatusIndicator.snap.tsx** — 4 snapshots (one per non-animated state):
1. `{ state: "pending" }` — shows gray dot
2. `{ state: "loaded", repos: [], hasMissing: false, hasDirty: false }` — green checkmark
3. `{ state: "loaded", repos: [], hasMissing: true, hasDirty: false }` — red X
4. `{ state: "error" }` — red exclamation
Note: Skip "loading" state — it uses animated spinner which is non-deterministic in snapshots.

**BatchBar.snap.tsx** — 2 snapshots:
1. Default actions: `{ count: 3 }` — shows "3 selected" with default action text
2. Custom actions: `{ count: 1, actions: "[d] Delete" }` — shows custom action text
  </action>
  <verify>
    <automated>bun test tests/tui/dashboard/snapshots/CenteredDialog.snap.tsx tests/tui/dashboard/snapshots/StatusIndicator.snap.tsx tests/tui/dashboard/snapshots/BatchBar.snap.tsx</automated>
  </verify>
  <done>8 snapshot tests pass, snapshot files generated in __snapshots__/ directory</done>
</task>

<task type="auto">
  <name>Task 2: Create snapshot tests for dialog/overlay components (ConfirmDialog, HelpOverlay, ProgressView)</name>
  <files>
    tests/tui/dashboard/snapshots/ConfirmDialog.snap.tsx
    tests/tui/dashboard/snapshots/HelpOverlay.snap.tsx
    tests/tui/dashboard/snapshots/ProgressView.snap.tsx
  </files>
  <action>
**ConfirmDialog.snap.tsx** — 2 snapshots:
1. Default title: `{ message: "Delete workspace?", onConfirm: noop, onCancel: noop }` — shows "Confirm" title, message, y/n options
2. Custom title: `{ message: "Are you sure?", title: "Remove Repo", onConfirm: noop, onCancel: noop }`

Note: ConfirmDialog uses `useKeyboard` internally. The testRender approach handles this — just render and snapshot, do not send key events.

**HelpOverlay.snap.tsx** — 1 snapshot:
1. `{ tab: "workspaces", onClose: noop }` — full keybinding reference text. This is the primary visual regression target since it has extensive static text content.

Note: HelpOverlay also uses `useKeyboard`. Same approach — render only, no key events needed for snapshot.

**ProgressView.snap.tsx** — 2 snapshots:
1. In-progress: `{ title: "Creating workspace", lines: ["Cloning repo-a", "Cloning repo-b"], done: false }` — shows spinner + working text + lines
2. Complete: `{ title: "Creating workspace", lines: ["Cloned repo-a", "Cloned repo-b"], done: true }` — shows lines + "Done" message

Note: The in-progress state uses `<spinner>` which may produce non-deterministic output. If the spinner frame varies between runs, skip the in-progress snapshot and only test the done state. Alternatively, take the snapshot and if it flakes on first run, replace with a `toContain("Working")` assertion instead of snapshot.
  </action>
  <verify>
    <automated>bun test tests/tui/dashboard/snapshots/ConfirmDialog.snap.tsx tests/tui/dashboard/snapshots/HelpOverlay.snap.tsx tests/tui/dashboard/snapshots/ProgressView.snap.tsx</automated>
  </verify>
  <done>5 snapshot tests pass (or 4 if spinner state is excluded), snapshot files generated</done>
</task>

<task type="auto">
  <name>Task 3: Create snapshot test for RepoDetail and verify all snapshots together</name>
  <files>
    tests/tui/dashboard/snapshots/RepoDetail.snap.tsx
  </files>
  <action>
**RepoDetail.snap.tsx** — 3 snapshots:
1. No entry (fallback): `{ entry: undefined, allTemplates: [], allWorkspaces: [] }` — shows "No repo selected"
2. Entry with references: `{ entry: { name: "api", local_path: "/home/user/repos/api", type: "node", default_branch: "main", diskExists: true }, allTemplates: [{ name: "fullstack", repos: [{ repo: "api" }] }], allWorkspaces: [{ name: "feature-x", repos: [{ repo: "api" }] }] }` — shows path, type, branch, green exists indicator, template and workspace references
3. Entry missing from disk: `{ entry: { name: "legacy", local_path: "/old/legacy", type: "other", default_branch: "master", diskExists: false }, allTemplates: [], allWorkspaces: [] }` — shows red missing indicator, "(not referenced)" text

Note: RepoEntry type must match what RepoDetail expects. Check `src/tui/dashboard/hooks/useRepos.ts` for the RepoEntry type shape and construct minimal valid fixtures.

After all 7 files are created, run the full snapshot suite to confirm everything passes together:
`bun test tests/tui/dashboard/snapshots/`

Then run the full test suite to confirm no regressions:
`bun test tests/`
  </action>
  <verify>
    <automated>bun test tests/tui/dashboard/snapshots/ && bun test tests/</automated>
  </verify>
  <done>All 7 snapshot test files pass (16+ total snapshot assertions). Full test suite still green. Snapshot files exist in __snapshots__/ directories.</done>
</task>

</tasks>

<verification>
1. `bun test tests/tui/dashboard/snapshots/` — all snapshot tests pass
2. `bun test tests/` — full suite still green (no regressions)
3. `ls tests/tui/dashboard/snapshots/__snapshots__/` — snapshot files exist
4. Modify a component's text (e.g., change "Confirm" to "Confirmed" in ConfirmDialog), run tests — snapshot test fails. Revert.
</verification>

<success_criteria>
- 7 new snapshot test files covering 7 previously untested TUI components
- 16+ individual snapshot assertions across all files
- All tests pass on first run (snapshots generated)
- Full test suite remains green
- Snapshot files committed alongside test files
</success_criteria>

<output>
After completion, create `.planning/quick/260321-tdv-tui-snapshot-tests-for-intentional-visua/260321-tdv-SUMMARY.md`
</output>
