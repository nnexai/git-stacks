---
created: 2026-05-15T20:39:05.857Z
title: Add workspace notes
area: tooling
resolves_phase: 126
files:
  - src/commands/workspace.ts
  - src/tui/dashboard/WorkspaceDetail.tsx
---

## Problem

`git-stacks` has workspace messages for notifications and GSD has `.planning` for project planning, but there is no lightweight operator memory for a workspace itself.

The user wants a place for short, durable notes such as why a workspace still exists, what is blocked, what an agent should know before entering it, or why it should not be cleaned yet. These notes should not become project repo content and should stay separate from GSD `.planning`.

## Solution

Explore a workspace notes surface stored in the git-stacks config/state area, not inside the managed project repo.

Potential CLI shape:

```bash
git-stacks notes add my-feature "Waiting on API schema decision"
git-stacks notes list my-feature
git-stacks notes show my-feature
git-stacks notes clear my-feature
```

Initial design preference:

- Make notes append-only at first rather than one editable document.
- Store small records, likely JSONL or YAML, keyed by workspace name.
- Include at least `created`, `workspace`, `text`, and optional lightweight tags.
- Keep notes as operator memory, not project planning artifacts.
- Later dashboard work can show latest note or note count in workspace detail.
- Stale/cleanup advisory views should surface note count/latest note before recommending action.
