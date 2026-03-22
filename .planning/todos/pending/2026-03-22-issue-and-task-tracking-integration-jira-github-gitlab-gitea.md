---
created: "2026-03-22T14:22:52.174Z"
title: Issue and task tracking integration (Jira, GitHub, GitLab, Gitea)
area: integrations
files:
  - src/lib/integrations/types.ts
  - src/lib/config.ts
---

## Problem

Phase 27 (Git Forge Integrations) was scoped to PR/MR commands only. Issue/task linking — associating workspaces with issues from GitHub Issues, GitLab Issues, Gitea Issues, and Jira — was explicitly deferred during discussion. This is a broader feature than just passing an issue number to a PR command; the user wants a unified model that covers multiple issue trackers including Jira (which is not a git forge).

## Solution (brainstormed 2026-03-22)

Design settled during brainstorm session:

**Architecture:** Issue trackers are integrations — same `Integration` interface as forges. GitHub/GitLab/Gitea forge integrations gain issue subcommands alongside PR subcommands. Jira is a standalone integration (no forge, just issues).

**Storage:** Issue references stored under `workspace.settings.integrations.<tracker-id>` (e.g., `{ github: { issue: 42 } }`, `{ jira: { issue: "PROJ-123" } }`). No new top-level WorkspaceSchema field needed.

**Shared command syntax (all trackers):**
- `git-stacks integration <tracker> issue link <workspace> <issue-id>`
- `git-stacks integration <tracker> issue unlink <workspace>`
- `git-stacks integration <tracker> issue open <workspace>` — URL + `--web`

**Linking is retroactive only** — via the `issue link` subcommand. No `--issue` flag on `git-stacks new` for now.

**Jira:** Assumes `jira-cli` (ankitpokhrel/jira-cli) is installed. Configurable command template with `$ISSUE_ID` env var placeholder for opening issues — tool-agnostic so users can wire up any CLI or browser URL.

**Forge trackers:** Use native CLIs (`gh issue view`, `glab issue view`, `tea issue view`) with `--web` flag.

**Scope:** Separate phase from phase 27 even though infrastructure overlaps. Forge PR commands ship first, issue commands added after.
