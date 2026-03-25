---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/tui/dashboard/RepoActionMenu.tsx
  - package.json
  - CHANGELOG.md
autonomous: true
must_haves:
  truths:
    - "RepoActionMenu renders each shortcut key exactly once per menu item"
    - "Dynamic selection count still appears in labels when repos are selected"
    - "package.json version is 0.9.1"
    - "CHANGELOG.md has an unreleased 0.9.1 section documenting the fix"
  artifacts:
    - path: "src/tui/dashboard/RepoActionMenu.tsx"
      provides: "Fixed menu rendering without doubled shortcuts"
    - path: "package.json"
      provides: "Version 0.9.1"
    - path: "CHANGELOG.md"
      provides: "0.9.1 release notes"
  key_links: []
---

<objective>
Fix the TUI RepoActionMenu showing doubled keyboard shortcuts (e.g., `[r] [r] Remove`) and bump version to v0.9.1.

Purpose: The `getLabel()` functions embed `[key]` prefixes in their return values, but the JSX render template also prepends `[{item.key}]`, causing duplication.
Output: Clean menu display, version bump, changelog entry.
</objective>

<execution_context>
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/workflows/execute-plan.md
@/home/nnex/dev/prj/git-stacks/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/tui/dashboard/RepoActionMenu.tsx
@src/tui/dashboard/ActionMenu.tsx (reference — correct pattern with plain `label` strings)
@src/tui/dashboard/TemplateActionMenu.tsx (reference — correct pattern with plain `label` strings)
@package.json
@CHANGELOG.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix doubled shortcuts in RepoActionMenu</name>
  <files>src/tui/dashboard/RepoActionMenu.tsx</files>
  <action>
Remove the `[key]` prefix from all three label functions so they return plain text, consistent with ActionMenu.tsx and TemplateActionMenu.tsx. The JSX template already renders `[{item.key}]` before the label.

Specifically change:
- `wsLabel`: `"[w] Create workspace (N repos)"` -> `"Create workspace (N repos)"` and `"[w] Create workspace"` -> `"Create workspace"`
- `tplLabel`: `"[t] Create template (N repos)"` -> `"Create template (N repos)"` and `"[t] Create template"` -> `"Create template"`
- `removeLabel`: `"[r] Remove (N)"` -> `"Remove (N)"` and `"[r] Remove"` -> `"Remove"`

Do NOT change the JSX template — the `[{item.key}]` rendering there is correct and matches the pattern used by ActionMenu.tsx and TemplateActionMenu.tsx.
  </action>
  <verify>
    <automated>bun run typecheck</automated>
  </verify>
  <done>Each menu item renders shortcut key exactly once (e.g., `[r] Remove` not `[r] [r] Remove`). Dynamic selection counts still appear.</done>
</task>

<task type="auto">
  <name>Task 2: Bump version to 0.9.1 and update changelog</name>
  <files>package.json, CHANGELOG.md</files>
  <action>
1. In `package.json`, change `"version": "0.9.0"` to `"version": "0.9.1"`.

2. In `CHANGELOG.md`, add a new section ABOVE the `## [0.9.0]` entry:

```
## [0.9.1] — 2026-03-25

### Fixed

- **TUI repo action menu** — keyboard shortcuts no longer appear doubled in the repo context menu (e.g., `[r] [r] Remove` now correctly shows `[r] Remove`).

---
```
  </action>
  <verify>
    <automated>grep '"version": "0.9.1"' package.json && grep '## \[0.9.1\]' CHANGELOG.md</automated>
  </verify>
  <done>package.json shows version 0.9.1, CHANGELOG.md has a 0.9.1 section with the fix documented.</done>
</task>

</tasks>

<verification>
- `bun run typecheck` passes with no errors
- Visual inspection: RepoActionMenu label functions return plain text without `[key]` prefix
- package.json version is 0.9.1
- CHANGELOG.md documents the fix under 0.9.1
</verification>

<success_criteria>
- RepoActionMenu.tsx label functions no longer include `[key]` prefixes
- JSX template unchanged (still renders `[{item.key}]` before label)
- Version bumped to 0.9.1 in package.json
- CHANGELOG.md has 0.9.1 section documenting the fix
- Typecheck passes clean
</success_criteria>

<output>
After completion, create `.planning/quick/260325-mrf-fix-tui-enter-menu-showing-shortcuts-twi/260325-mrf-SUMMARY.md`
</output>
