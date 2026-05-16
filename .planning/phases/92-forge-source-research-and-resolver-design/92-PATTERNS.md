# Phase 92: Forge Source Research and Resolver Design - Pattern Map

## PATTERN MAPPING COMPLETE

## Source Files and Roles

| File | Role | Existing Pattern To Reuse |
|------|------|---------------------------|
| `src/lib/integrations/forge-utils.ts` | Existing forge repo resolution, detection, typed errors | Extend typed result unions and user-facing failure formatting patterns rather than adding ad hoc strings |
| `src/lib/integrations/gitlab.ts` | Current GitLab command integration | Provider command wrappers use injected `_exec` seams and translate user command language to provider CLI language |
| `src/lib/integrations/github.ts` | Current GitHub command integration | Uses `gh pr view --json ... --jq ...` for metadata-like command output and keeps command execution behind `_exec` |
| `src/lib/integrations/gitea.ts` | Current Gitea command integration | Uses `runCapture()` for JSON output parsing and handles Tea-specific output fields |
| `src/lib/config.ts` | Registry, template, workspace, and global config schemas | Zod schemas with inferred exported types and backwards-compatible optional fields |
| `src/lib/git.ts` | Git subprocess helpers and branch/worktree policy | Bun `$`, `.quiet().nothrow()`, typed helper return values, `createWorktree()`, and upstream tracking helpers |
| `src/lib/workspace-lifecycle.ts` | Workspace creation orchestration | `createWorkspace()` takes already-resolved repos and branch, then uses existing Git worktree helpers |
| `tests/lib/integrations/forge-utils.test.ts` | Existing forge utility tests | Mock config/workspace seams and assert typed resolver errors |
| `tests/lib/config.test.ts` | Config schema regression tests | Parse valid YAML/config shapes and assert Zod rejections |
| `tests/lib/git-real-remote.test.ts` | Real Git fixture tests | Use local repos/bare remotes for branch/upstream behavior where needed |

## Data Flow

1. `git-stacks new --source <url>` (Phase 93) receives a GitLab MR, Gitea PR, or GitHub PR URL.
2. A pure source URL parser extracts `{ forge, baseUrl, repoPath, changeType, changeNumber, webUrl }`.
3. A metadata resolver fetches provider metadata through the enabled integration or injected executor seam.
4. Repo matching compares explicit registry forge metadata first, then integration-level base URL config, then URL/remote inference if unambiguous.
5. The matched worktree repo and normalized source metadata are handed to workspace creation.
6. Phase 93 fetches the exact source ref with plain Git before calling existing `createWorkspace()` with the source branch name.

## Code Excerpts To Preserve

### Existing Forge Result Union Style

`src/lib/integrations/forge-utils.ts` uses explicit success/error unions:

```ts
export type ForgeRepoResolution =
  | { ok: true; workspace: Workspace; repo: WorkspaceRepo; repoPath: string; baseBranch: string }

export type ForgeRepoResolutionError =
  | { ok: false; error: "workspace_not_found"; name: string }
  | { ok: false; error: "repo_required"; worktreeRepos: string[] }
```

The forge source resolver should follow this style with `ok: true` and typed `error` variants.

### Existing Integration Executor Seams

Each provider integration wraps subprocess execution in a module-local `_exec`. The new provider metadata code should keep that seam so tests do not require real `glab`, `gh`, or authenticated `tea`.

### Existing Worktree Creation Policy

`src/lib/git.ts` `createWorktree()` already reuses existing local branches, creates from `origin/<branch>` when available, or creates a new branch otherwise. Phase 93 should extend this with a pre-fetch source-ref step rather than introducing provider checkout commands.

## Landmines

- Do not make provider CLI checkout commands part of internal workspace checkout.
- Do not hardcode `gitlab.com`, `github.com`, or a single Gitea host as the only valid instance identity.
- Do not decide repo matches from slug alone when explicit repo-level forge metadata exists.
- Do not silently pick one repo when multiple template repos match the same source.
- Do not allow trunk or dir mode repos to pass as forge-source checkout targets.
- Do not add auto-label suggestions to the resolver output in this phase.
- Do not require live `glab`, `gh`, or authenticated `tea` in automated tests.

