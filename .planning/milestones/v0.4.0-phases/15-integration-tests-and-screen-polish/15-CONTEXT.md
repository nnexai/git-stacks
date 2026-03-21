# Phase 15: integration-tests-and-screen-polish — Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

App-level integration tests cover all major TUI flows end-to-end using testRender (no PTY). The TUI renders cleanly within 80 columns: help bar fits without truncation, workspace ages display as relative time, and column widths respond to terminal width. No new features — this is testing and polish of everything built in Phases 10-14.

</domain>

<decisions>
## Implementation Decisions

### Help bar condensation (UI-01)
- **D-01:** Tiered progressive dropping based on fixed terminal width breakpoints — wider terminals show more shortcuts, narrower terminals shed items in priority order
- **D-02:** Drop sequence (lowest priority shed first): `↑↓/jk Navigate` → `1/2/3 Tabs` → `r Refresh` → collapse to `? Help  q Quit`
- **D-03:** Fixed width tiers:
  - ≥ 100: Full bar (all shortcuts)
  - ≥ 80: Drop `↑↓/jk Navigate`
  - ≥ 65: Also drop `1/2/3 Tabs`
  - ≥ 50: Also drop `r Refresh`
  - < 50: `? Help  q Quit` only
- **D-04:** Workspaces tab adds `m Messages` to whichever tier is active; Templates/Repos tabs omit it

### Relative age display (UI-02)
- **D-05:** Reuse existing `formatAge()` from `messageUtils.ts` on workspace `created` field — display `3d`, `2h`, `5m` instead of ISO date `2026-03-20`
- **D-06:** Detail pane can keep the full date — relative age is for the list row only

### Responsive column widths (UI-03)
- **D-07:** Fixed columns stay fixed: prefix (`>[x]`), status indicators (wt/tr, dirty dot), type badges
- **D-08:** Growable columns: name, branch, path, message preview — these benefit from extra terminal width
- **D-09:** Minimum widths with `…` truncation: name min 10, branch gets remaining space after fixed columns
- **D-10:** Repo path truncates from left (`…/repo/path`) — right side is more meaningful
- **D-11:** Message preview disappears entirely on very narrow terminals (supplementary info, not critical)
- **D-12:** No proportional ratios — fixed columns first, name gets its minimum, branch/path get the rest

### Detail pane (responsive content, not columns)
- **D-13:** Detail pane columns stay fixed — single-entity view has sufficient space
- **D-14:** Long content (paths, branch names, repo lists) truncates with `…` rather than overflowing in narrow/portrait terminals
- **D-15:** Reflow label+value to vertical stacking where it helps readability in narrow panes — Claude's discretion on which fields benefit

### Integration test scope (T-05)
- **D-16:** Four test flows, one file per flow:
  1. Tab switching — press 1/2/3, assert correct tab renders
  2. Action menu → confirm → execute — Enter on workspace, pick action, confirm dialog
  3. Wizard entry → complete → cancel — wizard flow with back-nav via escape
  4. Sync progress flow — action menu → confirm → progress → done → return to list
- **D-17:** Mocking strategy: seed real config files via `GIT_STACKS_CONFIG_DIR` temp dir (registry, templates, workspaces YAML fixtures). Mock only git operations (`createWorktree`, `fetchOrigin`, etc.). Config isolation infra from Phase 10 already supports this.
- **D-18:** Assertion depth: assert view transitions AND side effects where fixture setup supports it (e.g. wizard writes workspace YAML → check file exists). Do not mock git deeply enough to verify git operations — just verify the UI flow completed.

### Claude's Discretion
- Which detail pane fields benefit from vertical stacking reflow vs simple truncation
- Column width allocation formula (how to distribute remaining space among growable columns)
- Test fixture data (workspace names, template configs, repo registry entries)
- Exact breakpoint behavior when help bar items are right at the boundary
- Whether `formatAge()` needs adaptation for `created` field (ISO date string vs timestamp)
- Progress spinner/indicator rendering in sync progress test assertions

</decisions>

<specifics>
## Specific Ideas

- Help bar tiers work like responsive CSS breakpoints — same concept, fixed thresholds
- "Portrait mode terminal" is a real use case — detail pane must not break when narrow
- Integration tests should feel like user stories: "I switch tabs, open an action menu, run a wizard, and get back to my list"
- Message preview already dynamically sizes — responsive columns just give it more room to work with

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Help bar
- `src/tui/dashboard/App.tsx` lines 168-176 — `helpBarText` createMemo (current implementation to replace)
- `src/tui/dashboard/App.tsx` lines 1285-1301 — Help bar render section (box + text elements)
- `src/tui/dashboard/HelpOverlay.tsx` — Full help overlay (not affected, but reference for complete keybinding list)

### Workspace age display
- `src/tui/dashboard/WorkspaceRow.tsx` line 65 — Current `{ws().created}` ISO date display
- `src/tui/dashboard/messageUtils.ts` lines 9-19 — `formatAge()` function to reuse

### Column widths (current hard-coded values to replace)
- `src/tui/dashboard/WorkspaceRow.tsx` — name `padEnd(22)`, branch `padEnd(32)`, message truncation logic
- `src/tui/dashboard/TemplateList.tsx` — name `padEnd(22)`
- `src/tui/dashboard/RepoList.tsx` — name `padEnd(24)`, type `padEnd(12)`, path truncation to 40 chars
- `src/tui/dashboard/WorkspaceDetail.tsx` — repo name `padEnd(28)` (detail pane, keep fixed)
- `src/tui/dashboard/TemplateDetail.tsx` — repo reference `padEnd(28)` (detail pane, keep fixed)

### Terminal dimensions
- `@opentui/solid` — `useTerminalDimensions()` returns `{ width, height }` reactively

### Test infrastructure
- `tests/tui/dashboard/*.test.tsx` — 8 existing unit tests showing testRender + mockInput + captureCharFrame pattern
- `tests/helpers.ts` — `makeTmpDir`, `makeGitRepo`, filesystem test utilities
- Phase 10 `GIT_STACKS_CONFIG_DIR` — config isolation for seeding test fixtures

### View state machine
- `src/tui/dashboard/types.ts` — `UIView` union (14 variants), `Action` union
- `src/tui/dashboard/App.tsx` lines 814-1025 — Full keyboard routing hierarchy

### Requirements
- `.planning/REQUIREMENTS.md` — T-05, UI-01, UI-02, UI-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `formatAge()` in `messageUtils.ts` — direct reuse for workspace created date
- `useTerminalDimensions()` — already imported in App.tsx and WorkspaceRow.tsx
- `GIT_STACKS_CONFIG_DIR` isolation — Phase 10 infra for seeding integration test fixtures
- `testRender` / `mockInput` / `captureCharFrame` — established test pattern across 8 existing test files

### Established Patterns
- Help bar as `createMemo` in App.tsx — swap from static string to tier-based function of `dims().width`
- `padEnd()` column widths — replace with computed widths from available terminal width
- Message preview truncation in WorkspaceRow — already responsive, model for other columns
- Height-based tab visibility (OpenTUI renderer limitation)
- Keyboard isolation guards for modal views

### Integration Points
- `helpBarText` memo — replace with width-aware tiered computation
- `WorkspaceRow` — replace `{ws().created}` with `formatAge()` call, replace `padEnd(22)`/`padEnd(32)` with computed widths
- `TemplateList` / `RepoList` — replace fixed `padEnd()` with computed widths
- New test files in `tests/tui/dashboard/` — one per integration flow

</code_context>

<deferred>
## Deferred Ideas

- T-03 partial (InlineInput cursor movement tests) — acknowledged in REQUIREMENTS.md, not part of Phase 15 scope
- T-07 snapshot baseline tests — deferred per REQUIREMENTS v2
- R-02/R-03 (repo add/scan from TUI) — deferred from Phase 14
- Batch sync from TUI (WS-05) — deferred per REQUIREMENTS

</deferred>

---

*Phase: 15-integration-tests-and-screen-polish*
*Context gathered: 2026-03-21*
