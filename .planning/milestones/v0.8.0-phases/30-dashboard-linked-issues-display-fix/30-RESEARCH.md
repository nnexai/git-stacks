# Phase 30: Dashboard Linked Issues Display Fix - Research

**Researched:** 2026-03-24
**Domain:** SolidJS TUI dashboard component (WorkspaceDetail.tsx), workspace config data model
**Confidence:** HIGH

## Summary

Phase 30 is a focused bug fix in a single component (`WorkspaceDetail.tsx`). The bug is on lines 130-132 where the config summary for enabled integrations uses a fallback chain `ws().settings?.integrations?.[id] ?? globalConfig.integrations[id]`, which causes global Jira configuration (like `open_cmd`) to appear on every workspace detail pane as if it were a linked issue. The fix adds a dedicated "Linked Issues" section that reads exclusively from workspace settings and filters the `issue` key out of the config summary display.

The four tracker integrations are `github`, `gitlab`, `gitea`, and `jira` -- identified by their `id` field in the integration registry. There is no formal "tracker type" concept in the codebase; the tracker IDs must be hardcoded as a constant array. The `issue-utils.ts` module already contains the `resolveIssueRef()` function that correctly extracts issue IDs from workspace settings, though the dashboard component does not need its file-I/O-based approach -- it already has the workspace object in memory.

**Primary recommendation:** Modify `WorkspaceDetail.tsx` to (1) add a "Linked Issues" section that reads `ws().settings?.integrations?.[trackerId]?.issue` for each tracker ID, showing it only when at least one issue exists, and (2) filter `issue` from the config summary `extras` in the Integrations section.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Add a separate "Linked Issues" section below the Integrations section -- only shows workspace-level `issue` fields from `ws().settings?.integrations?.[trackerId]?.issue`
- Omit the "Linked Issues" section entirely when no workspace has any linked issues -- no visual noise
- Show all 4 tracker integrations (github, gitlab, gitea, jira) consistently when any has a linked issue
- Remove the `issue` key from the integration config summary display -- it belongs exclusively in the new "Linked Issues" section, not mixed into integration config
- Keep the global config fallback for non-issue fields (open_cmd, session_name, etc.) -- that's correct behavior for integration configuration

### Claude's Discretion
- Exact visual formatting of the "Linked Issues" section (icons, padding, colors)
- Whether to group by tracker type or show flat list

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUG-01 | Dashboard displays per-workspace linked issues instead of falling back to global Jira config | Bug root cause identified at lines 130-132 of WorkspaceDetail.tsx; fix involves filtering `issue` from config summary and adding dedicated section |

</phase_requirements>

## Standard Stack

No new libraries required. This phase modifies existing code using the current stack.

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SolidJS | 1.9.11 | Reactive component rendering | Dashboard TUI framework |
| @opentui/solid | 0.1.87 | Terminal UI components | Provides `<text>`, `<box>`, `<Show>`, `<For>` |
| bun:test | built-in | Test framework | All existing tests use bun:test |

## Architecture Patterns

### Bug Root Cause Analysis

The bug is at `WorkspaceDetail.tsx:130-132`:

```typescript
const rawConfig = (ws().settings?.integrations?.[integration.id]
  ?? globalConfig.integrations[integration.id]
  ?? {}) as Record<string, unknown>
```

This fallback chain means: if the workspace has no settings for an integration, it falls back to the **global** config for that integration. When a user has configured Jira globally with `{ enabled: true, open_cmd: "jira open $ISSUE_ID" }`, every workspace displays `(open_cmd: jira open $ISSUE_ID)` in the config summary -- even workspaces with no Jira issue linked.

The problem is twofold:
1. The `issue` key (which is workspace-specific) gets displayed in the same config summary line as general config keys (which are legitimately global)
2. The global config fallback causes non-issue global config to appear on every workspace

### Fix Architecture

**Change 1: Filter `issue` from config summary (line 133)**

Add `issue` to the filter predicate on line 133:
```typescript
.filter(([k]) => k !== "enabled" && k !== "issue")
```

This removes `issue` from the inline config display for all integrations, since linked issues will have their own dedicated section.

**Change 2: Add "Linked Issues" section after Integrations**

Define a constant for tracker integration IDs:
```typescript
const TRACKER_IDS = ["github", "gitlab", "gitea", "jira"] as const
```

Create a computed list of linked issues from workspace settings only (never global config):
```typescript
const linkedIssues = createMemo(() => {
  const results: { trackerId: string; issueId: string }[] = []
  for (const id of TRACKER_IDS) {
    const trackerConfig = ws().settings?.integrations?.[id] as Record<string, unknown> | undefined
    const issue = trackerConfig?.issue
    if (issue !== undefined && issue !== null) {
      results.push({ trackerId: id, issueId: String(issue) })
    }
  }
  return results
})
```

Render the section only when there is at least one linked issue:
```tsx
<Show when={linkedIssues().length > 0}>
  <text>{""}</text>
  <text fg="white">  Linked Issues:</text>
  <For each={linkedIssues()}>
    {(item) => (
      <text fg="cyan">    {item.trackerId.padEnd(10)}  {item.issueId}</text>
    )}
  </For>
</Show>
```

### Component Structure (current vs. proposed)

Current WorkspaceDetail sections:
```
Branch: feat/test
Created: 2026-01-01

Repos:
  [repo list]

Messages (N):
  [message list]

Integrations:          <-- issue key leaks into config summary here
  [integration list]
```

Proposed WorkspaceDetail sections:
```
Branch: feat/test
Created: 2026-01-01

Repos:
  [repo list]

Messages (N):
  [message list]

Integrations:          <-- issue key filtered OUT of config summary
  [integration list]

Linked Issues:         <-- NEW section, only when issues exist
  github      #42
  jira        PROJ-123
```

### Data Access Pattern

The workspace object is already available in the component via `ws()`. Issue data lives at `ws().settings?.integrations?.[trackerId]?.issue`. The `issue-utils.ts` module does the same extraction but through file I/O (`readWorkspace`). Since the dashboard already has the workspace in memory, it should access the data directly from `ws()` -- no need to import `issue-utils.ts`.

### Tracker Integration IDs

The four tracker integrations and their IDs:
| Integration | ID | Issue ID Format | Example |
|-------------|------|----------------|---------|
| GitHub | `github` | Numeric string | `42` |
| GitLab | `gitlab` | Numeric string | `15` |
| Gitea | `gitea` | Numeric string | `7` |
| Jira | `jira` | Project-key format | `PROJ-123` |

All four use the same storage pattern: `settings.integrations.<id>.issue = "<issueId>"`.

There is no `isTracker` property on the `Integration` interface. The tracker IDs must be hardcoded. This is acceptable because the tracker list is stable and matches the four forge/issue integrations registered in `src/lib/integrations/index.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Issue ID extraction from workspace | New extraction utility | Direct property access `ws().settings?.integrations?.[id]?.issue` | Workspace object already in scope; `issue-utils.ts` does file I/O |
| Config value formatting | Custom formatter | Existing `formatConfigValue()` from `configUtils.ts` | Already handles all edge cases |

## Common Pitfalls

### Pitfall 1: Global Config Fallback Persisting
**What goes wrong:** The fix filters `issue` from config summary but forgets to also suppress global config values from appearing in the summary for non-issue keys
**Why it happens:** The fallback chain `ws().settings ?? globalConfig` is correct for non-issue config keys (like `cmd`, `open_cmd`, `session_name`)
**How to avoid:** Only filter `issue` from the extras display; the global fallback for non-issue keys is intentional and correct behavior
**Warning signs:** Global `open_cmd` disappears from the detail pane

### Pitfall 2: Showing Empty "Linked Issues" Section
**What goes wrong:** The "Linked Issues:" header appears even when no issues are linked, adding visual noise
**Why it happens:** Using `<For>` without a conditional `<Show>` wrapper
**How to avoid:** Wrap the entire section in `<Show when={linkedIssues().length > 0}>` per the locked decision
**Warning signs:** Empty "Linked Issues:" header on workspaces with no linked issues

### Pitfall 3: Reading From Global Config for Issues
**What goes wrong:** The linked issues section falls back to global config, reproducing the original bug in the new section
**Why it happens:** Copy-pasting the existing fallback pattern
**How to avoid:** The linked issues section must ONLY read from `ws().settings?.integrations?.[id]?.issue` -- never from `globalConfig`
**Warning signs:** All workspaces show the same issue IDs

### Pitfall 4: OpenTUI Nested Text
**What goes wrong:** Wrapping `<text>` inside `<text>` causes OpenTUI crash
**Why it happens:** OpenTUI does not support nested text elements (documented in project memory)
**How to avoid:** Use sibling `<text>` elements within `<box flexDirection="row">` for inline layouts
**Warning signs:** Runtime crash in TUI rendering

## Code Examples

### Current Bug Location (lines 128-138 of WorkspaceDetail.tsx)
```typescript
// Config summary for enabled integrations (D-11)
let configSummary = ""
if (enabled) {
  const rawConfig = (ws().settings?.integrations?.[integration.id]
    ?? globalConfig.integrations[integration.id]  // BUG: falls back to global
    ?? {}) as Record<string, unknown>
  const extras = Object.entries(rawConfig)
    .filter(([k]) => k !== "enabled")  // BUG: does not filter "issue"
    .map(([k, v]) => `${k}: ${formatConfigValue(v)}`)
    .join(", ")
  if (extras) configSummary = `(${extras})`
}
```

### Fix: Filter Issue From Config Summary (line 133)
```typescript
.filter(([k]) => k !== "enabled" && k !== "issue")
```

### Fix: Linked Issues Section (after Integrations `<For>`)
```tsx
const TRACKER_IDS = ["github", "gitlab", "gitea", "jira"] as const

// Inside the component, as a createMemo:
const linkedIssues = createMemo(() => {
  const results: { trackerId: string; issueId: string }[] = []
  for (const id of TRACKER_IDS) {
    const trackerConfig = ws().settings?.integrations?.[id] as
      Record<string, unknown> | undefined
    const issue = trackerConfig?.issue
    if (issue !== undefined && issue !== null) {
      results.push({ trackerId: id, issueId: String(issue) })
    }
  }
  return results
})

// In the JSX, after the Integrations </For>:
<Show when={linkedIssues().length > 0}>
  <text>{""}</text>
  <text fg="white">  Linked Issues:</text>
  <For each={linkedIssues()}>
    {(item) => (
      <text fg="cyan">    {item.trackerId.padEnd(10)}  {item.issueId}</text>
    )}
  </For>
</Show>
```

### Existing Test Pattern (WorkspaceDetail.test.tsx)
```tsx
// Uses testRender from @opentui/solid + captureCharFrame() for snapshot assertions
const { captureCharFrame, renderOnce } = await testRender(
  () => <WorkspaceDetail entry={entry as any} messages={[]} tick={0} />
)
await renderOnce()
const frame = captureCharFrame()
expect(frame).toContain("expected text")
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | bunfig.toml |
| Quick run command | `bun test tests/tui/dashboard/WorkspaceDetail.test.tsx` |
| Full suite command | `bun test tests/` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUG-01a | Workspace with linked issue shows issue ID in Linked Issues section | unit (TUI render) | `bun test tests/tui/dashboard/WorkspaceDetail.test.tsx` | Exists but needs new test cases |
| BUG-01b | Workspace without linked issues omits Linked Issues section | unit (TUI render) | `bun test tests/tui/dashboard/WorkspaceDetail.test.tsx` | Exists but needs new test cases |
| BUG-01c | Issue key filtered from integration config summary | unit (TUI render) | `bun test tests/tui/dashboard/WorkspaceDetail.test.tsx` | Exists but needs new test cases |

### Sampling Rate
- **Per task commit:** `bun test tests/tui/dashboard/WorkspaceDetail.test.tsx`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None -- existing test file `tests/tui/dashboard/WorkspaceDetail.test.tsx` provides the infrastructure. New test cases will be added to this file. The mock module setup already handles config isolation and integration mocking. The mock integrations array needs to be extended to include tracker integrations (github, gitlab, gitea, jira) for the new tests.

## Implementation Notes

### Files to Modify
1. **`src/tui/dashboard/WorkspaceDetail.tsx`** -- the only production file that needs changes:
   - Add `TRACKER_IDS` constant
   - Add `linkedIssues` createMemo
   - Add `<Show>` + `<For>` JSX for the Linked Issues section
   - Add `&& k !== "issue"` to the config summary filter on line 133

2. **`tests/tui/dashboard/WorkspaceDetail.test.tsx`** -- add new test cases:
   - Test: workspace with linked jira issue shows it in Linked Issues section
   - Test: workspace with no linked issues does not show "Linked Issues:" header
   - Test: config summary does not include `issue` key
   - Update mock integrations to include at least one tracker ID (e.g., `jira`)

### Mock Integration Setup for Tests
The existing test mocks only include `vscode`, `intellij`, `tmux`, and `niri`. For the new Linked Issues tests, the mock integrations array does NOT need tracker integrations because the Linked Issues section iterates over the hardcoded `TRACKER_IDS` constant, not over the `integrations` array. The section reads directly from `ws().settings?.integrations?.[id]?.issue`.

However, if we want to verify that the `issue` key is filtered from the config summary of a tracker integration that happens to be in the `integrations` array, we would need to add a tracker mock to the mocked integrations. This is optional since the filter applies to ALL integrations equally.

## Sources

### Primary (HIGH confidence)
- `src/tui/dashboard/WorkspaceDetail.tsx` -- direct code inspection of bug location
- `src/lib/integrations/issue-utils.ts` -- data access pattern for issue resolution
- `src/lib/integrations/index.ts` -- integration registry (9 integrations, 4 trackers)
- `src/lib/config.ts` -- WorkspaceSchema, WorkspaceSettingsSchema
- `src/lib/integrations/github.ts`, `gitlab.ts`, `gitea.ts`, `jira.ts` -- tracker integration implementations
- `tests/tui/dashboard/WorkspaceDetail.test.tsx` -- existing test patterns and mock setup

### Secondary (MEDIUM confidence)
- Project memory file `feedback_opentui_no_nested_text.md` -- OpenTUI nested text restriction

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, uses existing project stack
- Architecture: HIGH -- single file change with clear bug location and fix
- Pitfalls: HIGH -- based on direct code inspection and known OpenTUI constraints

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- no external dependencies that change)
