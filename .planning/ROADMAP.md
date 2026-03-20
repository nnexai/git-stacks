# Roadmap: git-stacks

## Milestones

- **v1.0 → v0.2.0** (archived 2026-03-18) — Foundation, file ops, version command, destructive-op safety, Stack→Registry+Template model, UX/--json/doctor --fix/run --parallel, tech debt cleanup — 61/61 requirements, 7 phases, 21 plans. See [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)
- **v0.3.0** — Dashboard UI Overhaul — Phases 6-9 (in progress)

## Phases

<details>
<summary>v1.0 → v0.2.0 (Phases 1-5) — SHIPPED 2026-03-18</summary>

See [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md) for full archive.

</details>

### v0.3.0 Dashboard UI Overhaul

**Milestone Goal:** Transform the minimal OpenTUI dashboard into management central — full CRUD for all entities, a workspace notification system for AI agent hooks, and comprehensive shell completions.

**Phase Numbering:** Continues from v0.2.0 (phases 1-5 archived).

- [ ] **Phase 6: Message Store + CLI** - JSONL-backed message store with `git-stacks message send|list|clear` subcommand family
- [x] **Phase 7: Shell Completion Overhaul** - Full dynamic coverage for all commands, subcommand trees, and fixed enum flag values (completed 2026-03-19)
- [x] **Phase 8: Dashboard Tab Layout** - Tabbed Workspaces | Templates | Repos layout with split list+detail pane and prerequisite UIView/keyboard refactors (UAT gap closure in progress) (completed 2026-03-20)
- [ ] **Phase 9: IPC Push + Message Display** - Live Unix socket delivery into dashboard; message badges in workspace list and detail pane

## Phase Details

### Phase 6: Message Store + CLI
**Goal**: Agents and hooks can send workspace-scoped notifications that persist across TUI restarts and are queryable from the command line
**Depends on**: Nothing (no TUI or IPC dependencies)
**Requirements**: MSG-01, MSG-02, MSG-03, MSG-04, MSG-05, MSG-06, MSG-07, MSG-08, MSG-09, MSG-10
**Success Criteria** (what must be TRUE):
  1. User can run `git-stacks message send "text"` inside a workspace hook and see it written to `~/.config/git-stacks/messages/{workspace}.jsonl` without the TUI running
  2. User can run `git-stacks message list` to see all notifications for the current workspace, showing sender, text, and timestamp
  3. User can run `git-stacks message clear --from agent-name` and only that sender's messages are removed; other messages remain
  4. `git-stacks message send` exits 0 when the TUI is not running; the message is durable and survives TUI restart
  5. When the TUI is running, a sent message appears in the dashboard within one second without a manual `R` refresh
**Plans**: 3 plans
Plans:
- [ ] 06-01-PLAN.md — Path constant + JSONL message store library (src/lib/paths.ts + src/lib/messages.ts)
- [ ] 06-02-PLAN.md — message send|list|clear CLI command (src/commands/message.ts + register in src/index.ts)
- [ ] 06-03-PLAN.md — TUI Unix socket server (src/tui/dashboard/run.tsx + onIpcMessage export for Phase 9)

### Phase 7: Shell Completion Overhaul
**Goal**: Tab completion covers every command, subcommand, fixed-choice flag value, and dynamic entity name in the CLI surface
**Depends on**: Phase 6 (message command must exist before message completions are testable)
**Requirements**: CMPL-01, CMPL-02, CMPL-03, CMPL-04, CMPL-05, CMPL-06
**Success Criteria** (what must be TRUE):
  1. Typing `git-stacks sync my-feature --strategy <TAB>` completes to `rebase` and `merge`
  2. Typing `git-stacks message send <TAB>` completes with workspace names
  3. Typing `git-stacks template edit <TAB>` completes with template names, and `git-stacks repo remove <TAB>` completes with repo names
  4. All subcommand trees (`repo add|scan|list|remove`, `template new|edit|list|remove`, `message send|list|clear`) appear as completions
**Plans**: 1 plan
Plans:
- [ ] 07-01-PLAN.md — OPTION_ENUMS + FLAG_COMPLETIONS data tables, prev-word detection in bash/zsh/fish generators, message subcommand tree coverage

### Phase 8: Dashboard Tab Layout
**Goal**: The dashboard is a tabbed management interface with Workspaces, Templates, and Repos tabs — each with a side-by-side list and detail pane — and consistent keyboard navigation throughout
**Depends on**: Phase 6 (types and path constants established; not a hard runtime dependency but avoids type churn)
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09, DASH-10, DASH-11
**Success Criteria** (what must be TRUE):
  1. User presses `2` and lands on the Templates tab; cursor position and any filter on the Workspaces tab are preserved when pressing `1` to return
  2. User sees the list and detail pane side by side without pressing Enter — the detail pane updates as the cursor moves through the list
  3. User presses Enter on a workspace, selects "rename" from the action menu, completes it, and returns to the list without restarting the TUI
  4. User presses `e` on a template in the Templates tab, edits the YAML in `$EDITOR`, saves, and the list reflects the change after editor exit
  5. User presses `?` and sees a scrollable keybinding reference; pressing `Esc` closes it and returns to the previous view
**Plans**: 6 plans
Plans:
- [x] 08-01-PLAN.md — Types + data hooks (types.ts Tab/UIView/Action updates; useTemplates.ts; useRepos.ts)
- [x] 08-02-PLAN.md — Tab frame + split layout + workspace detail (App.tsx refactor; WorkspaceDetail.tsx; WorkspaceList height prop; retire DetailStatus.tsx)
- [x] 08-03-PLAN.md — Templates tab + Repos tab content (TemplateList, TemplateDetail, RepoList, RepoDetail; wire into App.tsx)
- [x] 08-04-PLAN.md — Action menus + inline input + help (InlineInput, HelpOverlay, TemplateActionMenu; full Esc back-chain; context-sensitive help bar)
- [x] 08-05-PLAN.md — UAT gap fix: two-box layout, Switch/Match tabs, borderless action menus, full-screen help, filter in help bar
- [ ] 08-06-PLAN.md — UAT gap closure: fix tab switching reactivity + rename view reset

### Phase 9: IPC Push + Message Display
**Goal**: Workspace notifications sent via `git-stacks message send` appear in the running dashboard in real time, visible as a preview in the workspace list row and as a full grouped history in the detail pane
**Depends on**: Phase 6 (JSONL store + message types), Phase 8 (stable tab+detail pane structure)
**Requirements**: MSG-11, MSG-12
**Success Criteria** (what must be TRUE):
  1. In the Workspaces tab list, a workspace that has active messages shows a preview with sender (if set), truncated text, and relative age without pressing any key
  2. With a workspace selected in the Workspaces tab, the detail pane shows all messages grouped by sender, with the most recent first per sender
  3. User presses `c` on a sender group in the detail pane and that sender's messages are cleared; other senders' messages remain
**Plans**: 3 plans
Plans:
- [x] 09-01-PLAN.md — Message utilities + useMessages hook + types (messageUtils.ts, useMessages.ts, types.ts update)
- [ ] 09-02-PLAN.md — WorkspaceRow preview + WorkspaceDetail inline message list + App.tsx wiring
- [ ] 09-03-PLAN.md — MessageOverlay full-screen component + m key handler + help updates

## Progress

**Execution Order:** 6 → 7 → 8 → 9

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 6. Message Store + CLI | v0.3.0 | 0/3 | Planned | - |
| 7. Shell Completion Overhaul | 1/1 | Complete   | 2026-03-19 | - |
| 8. Dashboard Tab Layout | 6/6 | Complete   | 2026-03-20 | - |
| 9. IPC Push + Message Display | v0.3.0 | 1/3 | Executing | - |
