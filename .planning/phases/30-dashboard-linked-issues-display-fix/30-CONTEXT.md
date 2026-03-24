# Phase 30: Dashboard Linked Issues Display Fix - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the workspace detail pane in the TUI dashboard to show per-workspace linked issue IDs correctly. Currently the config summary falls back to global integration config, causing global Jira settings to appear as "linked issues" on every workspace. After this fix, linked issues are displayed in a dedicated section reading exclusively from workspace settings.

</domain>

<decisions>
## Implementation Decisions

### Display Approach
- Add a separate "Linked Issues" section below the Integrations section — only shows workspace-level `issue` fields from `ws().settings?.integrations?.[trackerId]?.issue`
- Omit the "Linked Issues" section entirely when no workspace has any linked issues — no visual noise
- Show all 4 tracker integrations (github, gitlab, gitea, jira) consistently when any has a linked issue

### Config Summary Fix
- Remove the `issue` key from the integration config summary display — it belongs exclusively in the new "Linked Issues" section, not mixed into integration config
- Keep the global config fallback for non-issue fields (open_cmd, session_name, etc.) — that's correct behavior for integration configuration

### Claude's Discretion
- Exact visual formatting of the "Linked Issues" section (icons, padding, colors)
- Whether to group by tracker type or show flat list

</decisions>

<code_context>
## Existing Code Insights

### Bug Location
- `src/tui/dashboard/WorkspaceDetail.tsx:130-132` — config summary falls back from `ws().settings?.integrations?.[id]` to `globalConfig.integrations[id]`, causing global Jira `issue` field to appear on all workspaces

### Reusable Assets
- `issue-utils.ts` — `resolveIssueRef()` function already knows how to extract issue IDs from workspace settings
- `integrations` array from `src/lib/integrations/index.ts` — iterates all registered integrations
- `formatConfigValue()` from `src/tui/dashboard/configUtils.ts` — existing config value formatter

### Integration Points
- `WorkspaceDetail.tsx` — the only file that needs modification for the display fix
- Workspace YAML `settings.integrations.<id>.issue` — source of truth for linked issues

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard bug fix with clear success criteria from ROADMAP.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
