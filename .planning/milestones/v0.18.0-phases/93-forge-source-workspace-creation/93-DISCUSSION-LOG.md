# Phase 93: Forge Source Workspace Creation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-16T11:29:10+02:00
**Phase:** 93-forge-source-workspace-creation
**Areas discussed:** todo folding, CLI contract, workspace creation behavior, metadata persistence and labels, failure UX

---

## Todo Folding

| Option | Description | Selected |
|--------|-------------|----------|
| Fold `Create workspace from forge source` | Include `git-stacks new --source`, matched worktree fetch/checkout, metadata persistence, and clear failures. | ✓ |
| Fold nothing | Leave all matches deferred. | |

**User's choice:** Fold the implementation slice.
**Notes:** Other todo matches were deferred as unrelated or future scope.

---

## CLI Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Require `--template` | Source identifies repo/change; template defines workspace shape. | ✓ |
| Infer template | Infer when exactly one template contains the repo. | |
| One-repo workspace | Allow no template and create one repo only. | |

**User's choice:** Require `--template`.
**Notes:** User selected `--repo <name>` for ambiguous matches, full forge URLs only, provider shorthand as a later nice-to-have, and `--dry-run` preview mode.

---

## Workspace Creation Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Fetch before worktree creation | Resolve/fetch source into main clone, then create worktree branch from fetched ref using existing logic. | ✓ |
| Fetch/reset after worktree creation | Create normal branch first, then mutate worktree. | |
| Provider-specific path | Custom provider checkout flow. | |

**User's choice:** Fetch before worktree creation.
**Notes:** User selected normal template branch rules for non-source repos, sanitizing invalid branch names where possible, normal workspace collision behavior, source branch name as workspace branch, and v0.17.2-aligned local branch reuse.

---

## Metadata Persistence and Labels

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated workspace `source` block | Normalized provenance in workspace YAML. | ✓ |
| `settings.integrations.<forge>.source` | Store alongside integration data. | |
| Minimal source URL | Store URL only. | |

**User's choice:** Dedicated workspace `source` block.
**Notes:** User asked what already existed; we verified registry has only a coarse `forge` enum and workspaces use `settings.integrations` for issue links/settings. User selected no auto-labels and editable-but-validated YAML metadata.

---

## Failure UX

| Option | Description | Selected |
|--------|-------------|----------|
| Fail before creating anything | Resolver/auth/CLI/parse failures stop before YAML/worktree side effects. | ✓ |
| Create normal workspace and warn | Ignore failed source. | |
| Prompt fallback | Ask interactively. | |

**User's choice:** Fail before creating anything.
**Notes:** User selected cleanup of temporary fetched refs on rollback, provider-specific fetch failure guidance, and implementation of GitLab, Gitea, and GitHub source creation paths while respecting live-testing restrictions.

---

## the agent's Discretion

- Planner may choose exact schema field names for `WorkspaceSchema.source` as long as the normalized provenance fields are preserved.
- Planner may choose exact ref namespace for temporary/internal fetched refs and cleanup mechanics.

## Deferred Ideas

- Provider shorthand such as `gitlab:123`.
- Auto-labels for review/source workspaces.
- Dashboard UI.
