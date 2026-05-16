# Forge Source Resolver Design

## Provider research

GitLab-first research uses official documentation because `glab` is not installed locally.

Reference commands:
- `glab mr view <iid> --output json`
- `glab mr checkout <id|branch|url>`
- `gh pr view <number|url|branch> --json number,url,baseRefName,headRefName,headRepository,headRepositoryOwner,isCrossRepository`
- `gh pr checkout <number|url|branch>`
- `tea pulls --fields index,url,base,head --output json`
- `tea pulls checkout <pull index>`

## Validation limits

- `glab` was not installed locally, so GitLab command behavior is constrained to official docs.
- `gh` was not installed locally, so GitHub command behavior is constrained to official docs.
- `tea 0.14.0` help output was validated locally, but authenticated Tea validation was blocked by token refresh.

Provider checkout commands are not internal checkout implementation.
Provider checkout commands are research references only.

## Self-hosted instance config

Self-hosted instance identity is represented at integration defaults and repo-level overrides.

Integration-level defaults (optional):
- `integrations.gitlab.base_url`
- `integrations.gitea.base_url`
- `integrations.github.base_url`

Repo-level override metadata (optional):
- `forge_metadata.forge`
- `forge_metadata.base_url`
- `forge_metadata.repo_path`

Existing integration config objects such as `{ enabled: true }` remain valid.

## Resolver contract

Resolver output is a typed success/failure union.

Success shape includes:
- `forge` (`gitlab`, `github`, `gitea`)
- `changeType` (`mr` for GitLab, `pr` for GitHub/Gitea)
- `changeNumber`
- `baseUrl`
- `repoPath`
- `webUrl`
- source/head fields (`source.branch`, `source.ref`)
- target/base fields (`target.branch`)
- matched registry repo information
- typed confidence metadata

Failure shape includes typed reasons such as:
- `unsupported_forge`
- `url_parse_failed`
- `repo_not_matched`
- `ambiguous_repo`
- `template_repo_missing`
- `not_worktree_mode`
- `cli_unavailable`
- `auth_required`

No label suggestion fields are included in this phase.

## Repo matching

Matching precedence order is:
1. repo-level forge metadata
2. integration-level base URL config
3. URL/remote inference only when it yields one enabled matching repo

Resolver must fail clearly with typed errors for:
- `repo_not_matched`
- `ambiguous_repo`
- `template_repo_missing`
- `not_worktree_mode`

## Fetch and checkout strategy

Internal checkout strategy uses plain Git fetch and existing git-stacks worktree creation logic.

Provider checkout references:
- `glab mr checkout <id|branch|url>`
- `gh pr checkout <number|url|branch>`
- `tea pulls checkout <pull index>`

These commands are documentation references only and are not used as internal checkout execution.

## Phase 93 handoff

Phase 93 should fetch the exact source ref with plain Git before calling `createWorkspace()`.

Handoff constraints:
- Use the forge source branch name as the workspace branch name.
- Reuse an existing local branch only when it points to the same source/ref metadata.
- Fail with `branch_conflict` when the local branch name points at different source metadata.
- Keep trunk and dir repos unsupported for this path; fail with `not_worktree_mode`.

Fetch source details should use provider metadata fields when available:
- GitHub `headRepository`/`headRepositoryOwner` and `headRefName`.
- GitLab source project fields and source branch/ref fields.
- Gitea `head` fields for source repo/ref details.

Provider checkout commands remain research references and are not internal checkout implementation.
