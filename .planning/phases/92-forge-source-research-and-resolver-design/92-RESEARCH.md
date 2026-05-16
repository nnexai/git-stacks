# Phase 92: Forge Source Research and Resolver Design - Research

## RESEARCH COMPLETE

**Phase:** 92 - Forge Source Research and Resolver Design  
**Date:** 2026-05-16  
**Requirement IDs:** FSRC-02, FSRC-03, FSRC-08

## Executive Summary

Phase 92 should create the source resolver contract and the minimum pure parsing/matching code needed for Phase 93 to implement `git-stacks new --source <forge-url>` without depending on provider checkout commands. GitLab receives the deepest research because it is the first implementation target and `glab` is not installed locally. GitHub is researched from official `gh` docs. Gitea is shape-aware from Tea documentation and local `tea 0.14.0` help output, but live authenticated validation is blocked by a local Tea token refresh error.

The design should keep provider CLIs as metadata helpers only:

- GitLab: use `glab mr view --output json` or API fallback for MR metadata; do not use `glab mr checkout` internally.
- GitHub: use `gh pr view --json number,url,baseRefName,headRefName,headRepository,headRepositoryOwner,isCrossRepository` or API fallback for PR metadata; do not use `gh pr checkout` internally.
- Gitea: use `tea pulls --fields ... --output json` where possible; do not use `tea pulls checkout` internally.
- Checkout should remain plain Git fetch/worktree creation through existing `src/lib/git.ts` and `src/lib/workspace-lifecycle.ts` logic, extended in Phase 93 to fetch an exact source ref before creating the workspace.

## Official CLI Research

### GitLab `glab`

Official GitLab docs say `glab mr checkout` accepts an MR id, branch, or URL, supports `--branch`, and supports `--set-upstream-to`. The docs also show a full MR URL selector such as `https://gitlab.com/gitlab-org/cli/-/merge_requests/1234`. This confirms GitLab MR URL parsing must support `/-/merge_requests/<iid>` and nested group project paths.

Official `glab mr view` docs say it accepts an id or branch and supports `--output text|json`. It also accepts `-R, --repo` as `OWNER/REPO`, `GROUP/NAMESPACE/REPO`, full URL, or Git URL. For Phase 93, the safest metadata command shape is:

- `glab mr view <iid> --repo <base-url-or-group-path> --output json`

`glab` is not installed locally, so Phase 92 cannot verify its JSON field names or auth failure behavior live. Treat `glab` JSON shape as an integration boundary requiring injected executor tests and one manual/live validation note in Phase 93.

GitLab self-managed support matters. The official GitLab CLI overview says GitLab CLI works with GitLab.com, GitLab Dedicated, and GitLab Self-Managed and supports multiple authenticated instances. Therefore resolver design must preserve the instance/base URL and must not hardcode `gitlab.com`.

### GitHub `gh`

Official `gh pr view` docs say it accepts PR number, URL, or branch; supports `--json`; and exposes JSON fields including `baseRefName`, `headRefName`, `headRepository`, `headRepositoryOwner`, `isCrossRepository`, `number`, `state`, `title`, and `url`. Official `gh pr checkout` docs say it accepts number, URL, or branch, defaults the local branch to the head branch, and supports `-R, --repo <[HOST/]OWNER/REPO>`.

`gh` is not installed locally. Phase 92 should design and test URL parsing and contract normalization only; live `gh` command validation remains deferred.

GitHub source URLs use `/pull/<number>`. Self-hosted GitHub Enterprise can be represented by a host component in `--repo <HOST/OWNER/REPO>`, but GitHub support is follow-up depth for this phase.

### Gitea `tea`

Gitea's Tea page describes Tea as the official Gitea CLI, supports multiple Gitea instances, and shows `tea login add --name work --url https://git.example.com --token $TOKEN` plus `tea pulls checkout 128`.

Local validation:

- `tea --version` returns `0.14.0`.
- `tea pulls --help` says pulls manage and checkout pull requests and supports `--fields`, `--repo`, `--remote`, `--login`, and `--output simple|table|csv|tsv|yaml|json`.
- `tea pulls --help` lists fields: `index,state,author,author-id,url,title,body,mergeable,base,base-commit,head,diff,patch,created,updated,deadline,assignees,milestone,labels,comments,ci`.
- `tea pulls checkout --help` says checkout accepts `<pull index>`, supports `--branch`, and can use `--repo`, `--remote`, `--login`, and `--output`.
- One exploratory command tried to use local auth and failed with `Failed to refresh token: oauth2: "unauthorized_client" "unable to parse refresh token"`. Do not treat local Tea auth as usable for live validation in this phase.

Gitea URL parsing should accept `/pulls/<number>` as the primary web URL shape. Because Gitea is often self-hosted, the normalized source metadata must include `baseUrl` and `repoPath` rather than only `owner/repo`.

## Existing Code Patterns

### Current Forge Utilities

`src/lib/integrations/forge-utils.ts` already provides:

- `resolveForgeRepo()` and `resolveForgeRepoAnyMode()` for workspace repo selection.
- typed error unions for missing workspace, repo required, repo not found, not worktree mode, and forge mismatch.
- `detectGitHubForge()`, `detectGitLabForge()`, and `detectGiteaForge()`.
- `detectForgeForRepoEnabled()` that respects globally enabled integrations.
- `formatForgeError()` for clear user-facing failures.

The resolver contract should extend this pattern instead of creating an unrelated abstraction. The new source resolver should return a typed result union and keep expected failures explicit.

### Config Shape

`src/lib/config.ts` currently has:

- `GlobalConfigSchema.integrations` as `Record<string, unknown>`.
- `RepoRegistryEntrySchema.forge` as a simple optional enum.
- no typed forge base URL or repo-level forge metadata.

Phase 92 should introduce backwards-compatible typed shapes without breaking existing `{ enabled: true }` configs:

- top-level integration config can gain optional `base_url`.
- registry entries can gain optional `forge_metadata` for `{ forge, base_url, repo_path }`.
- existing `forge: gitlab|github|gitea` remains valid and continues to be the low-detail repo marker.

### Git Checkout Logic

`src/lib/git.ts` already has a useful local branch policy:

- `createWorktree()` reuses an existing local branch.
- if no local branch exists and `origin/<branch>` exists locally or remotely, it creates the worktree from the remote branch.
- `ensureUpstreamTracking()` sets upstream from a local or remote tracking ref when available.

For forge sources, Phase 93 should add a fetch-before-create step that fetches the exact provider source ref into a local remote-tracking or namespaced ref, then calls existing workspace creation with the normalized source branch name. If an existing local branch with that name points to a different source ref, fail clearly rather than resetting or overwriting.

## Resolver Contract Design

Recommended normalized success shape:

- `forge`: `gitlab | gitea | github`
- `changeType`: `mr | pr`
- `changeNumber`: number
- `baseUrl`: normalized instance URL, e.g. `https://gitlab.example.com`
- `repoPath`: provider repo path, e.g. `group/subgroup/project`
- `webUrl`: original or canonical change URL
- `source`: `{ repoPath, branch, ref, sha?, remoteUrl? }`
- `target`: `{ repoPath, branch, sha? }`
- `matchedRepo`: `{ registryName, templateRepoName, workspaceRepoMode, mainPath }`
- `metadataForWorkspace`: stable YAML-ready source metadata
- `confidence`: `url | cli | explicit-config`

Recommended failure reasons:

- `unsupported_forge`
- `url_parse_failed`
- `repo_not_matched`
- `ambiguous_repo`
- `template_repo_missing`
- `not_worktree_mode`
- `cli_unavailable`
- `auth_required`
- `metadata_unavailable`
- `branch_conflict`

Provider terminology must be preserved: GitLab user-facing text says MR / merge request; GitHub and Gitea say PR / pull request.

## URL Parsing Strategy

Parse web URLs with `URL`, not regular-expression-only string slicing. Provider-specific path rules:

| Forge | Primary change path | Repo path extraction |
|-------|---------------------|----------------------|
| GitLab | `/<group>/<project>/-/merge_requests/<iid>` | everything before `/-/merge_requests/` |
| GitHub | `/<owner>/<repo>/pull/<number>` | first two path segments |
| Gitea | `/<owner>/<repo>/pulls/<number>` | first two path segments for common cases; keep parser tolerant of nested org paths only if base URL config disambiguates |

Self-hosted GitLab and Gitea require explicit base URL matching. Without repo-level or integration-level `base_url`, the resolver can infer from the URL origin but cannot prove the source belongs to an enabled integration. Matching order should be:

1. explicit repo-level forge metadata on the registry repo;
2. integration-level `base_url`;
3. URL/remote inference only when it produces exactly one enabled forge/repo match.

## Validation Architecture

| Behavior | Test Type | Recommended Command |
|----------|-----------|---------------------|
| GitLab, GitHub, and Gitea URL parsing | Unit | `bun test tests/lib/integrations/forge-source.test.ts` |
| Self-hosted base URL normalization | Unit | `bun test tests/lib/integrations/forge-source.test.ts` |
| Resolver success/failure union shape | Unit | `bun test tests/lib/integrations/forge-source.test.ts` |
| Config schema accepts integration `base_url` and repo metadata | Unit | `bun test tests/lib/config.test.ts` |
| Existing forge config remains compatible | Unit | `bun test tests/lib/config.test.ts tests/lib/integrations/forge-utils.test.ts` |
| Plain Git handoff boundaries are documented | Source/docs assertion | `rg -n "provider CLI checkout|plain Git fetch|glab mr checkout|gh pr checkout|tea pulls checkout" docs .planning/phases/92-forge-source-research-and-resolver-design` |
| Type safety | Static | `bun run typecheck` |

## Risks and Constraints

- Do not use provider checkout commands as workspace checkout implementation; they are research references only.
- Do not assume GitLab.com or one Gitea host. Preserve `baseUrl`.
- Do not rely on live `glab` or `gh` in automated tests because neither is installed locally.
- Do not rely on live `tea` auth because local auth currently fails during token refresh.
- Do not add labels or automatic label suggestions to the resolver output.
- Do not support trunk/dir repos for forge source checkout in Phase 93; fail with a typed unsupported-mode error.
- Do not silently choose a repo when multiple template repos match the same forge source.

