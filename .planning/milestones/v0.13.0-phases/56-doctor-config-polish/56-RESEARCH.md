# Phase 56: Doctor & Config Polish - Research

**Researched:** 2026-04-02
**Phase:** 56
**Requirements:** DOC-01, CFG-01

## Summary

Phase 56 has two small, self-contained changes with no architectural implications.

## DOC-01: Conditional Forge CLI Checks in Doctor

### Current State

`src/commands/doctor.ts` lines 317-348 check four forge CLIs unconditionally:
- `gh` (GitHub CLI)
- `glab` (GitLab CLI)
- `tea` (Gitea CLI)
- `jira` (Jira CLI)

Each check always runs and pushes a pass/warn issue into `binaryIssues[]`. Users who don't use GitHub see a warning about `gh` not being installed, which is noise.

### Integration-to-CLI Mapping

The forge integration IDs (from `src/lib/integrations/`) map to CLIs as follows:

| Integration ID | CLI binary | Integration file |
|---------------|-----------|-----------------|
| `github` | `gh` | `src/lib/integrations/github.ts` |
| `gitlab` | `glab` | `src/lib/integrations/gitlab.ts` |
| `gitea` | `tea` | `src/lib/integrations/gitea.ts` |
| `jira` | `jira` | `src/lib/integrations/jira.ts` |

### How to Check "Configured"

`readGlobalConfig()` is already called at line 275 as `const config = readGlobalConfig()`. The `config.integrations` is a `Record<string, unknown>` with default `{}`.

The `resolveEnabledGlobally()` function in `src/lib/integrations/types.ts` (lines 114-121) checks if an integration is enabled from global config only. It parses `config.integrations[id]` with `z.object({ enabled: z.boolean() })`. Returns `enabledByDefault` when no config entry exists.

For forge integrations, `enabledByDefault` is `false` (all four forge integrations have `enabledByDefault: false`). So:
- If `config.integrations.github` doesn't exist → not enabled → skip `gh` check
- If `config.integrations.github = { enabled: true }` → enabled → check `gh`
- If `config.integrations.github = { enabled: false }` → explicitly disabled → skip `gh` check

### Implementation Approach

Define a mapping array:
```ts
const forgeClis = [
  { integrationId: "github", binary: "gh", label: "gh (GitHub CLI)", install: "https://cli.github.com/", missingMsg: "not installed — GitHub PR commands unavailable" },
  { integrationId: "gitlab", binary: "glab", label: "glab (GitLab CLI)", install: "https://gitlab.com/gitlab-org/cli", missingMsg: "not installed — GitLab MR commands unavailable" },
  { integrationId: "gitea", binary: "tea", label: "tea (Gitea CLI)", install: "https://gitea.com/gitea/tea", missingMsg: "not installed — Gitea PR commands unavailable" },
  { integrationId: "jira", binary: "jira", label: "jira (Jira CLI)", install: "https://github.com/ankitpokhrel/jira-cli", missingMsg: "not installed — Jira issue commands will use configurable template fallback" },
]
```

Loop over it, skip if not enabled via `resolveEnabledGlobally()`, otherwise check binary and push issue.

Import `resolveEnabledGlobally` from `../lib/integrations/types`. This is already a dependency-safe import (types.ts has no side effects).

## CFG-01: Tmux configExample Enhancement

### Current State

`src/lib/integrations/tmux.ts` line 37-39:
```ts
configExample: `integrations:
  tmux:
    enabled: true`,
```

This only shows `enabled: true` — tells users nothing about the `panes` array which is the main value of the tmux integration.

### Pane Schema Shape

From `tmux.ts`:
- `paneSchema`: `{ direction?: "down"|"right"|"up"|"left", focus?: boolean, surfaces: Array<{ repo?: string, cwd?: string, command?: string }> }`
- The first pane with no `direction` is the "main" pane (uses the existing tmux pane)
- Subsequent panes with `direction` create splits

### Practical Example

A realistic dev setup showing:
1. Main pane (no direction) — editor
2. A right split — test runner
3. A down split — dev server

The `configExample` should be workspace-level config (under `settings.integrations.tmux`) since panes are workspace-specific. But the `configExample` field is used by `git-stacks integration tmux config example` which shows template/global config format. It should show the `panes` key under `integrations.tmux`.

## No Tests Required

Both changes are cosmetic/conditional — DOC-01 changes runtime behavior of doctor output, CFG-01 changes a static string. No new functions, no new modules, no regression risk.

## RESEARCH COMPLETE
