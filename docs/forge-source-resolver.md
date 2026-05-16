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

GitLab URL shape for parsing:
- `https://gitlab.example.com/group/subgroup/api/-/merge_requests/42`

GitHub URL shape for parsing:
- `https://github.com/org/api/pull/17`

Gitea URL shape for parsing:
- `https://git.example.test/org/api/pulls/9`

## Validation limits

- `glab` was not installed locally, so GitLab command behavior is constrained to official docs.
- `gh` was not installed locally, so GitHub command behavior is constrained to official docs.
- `tea 0.14.0` help output was validated locally, but authenticated Tea validation was blocked by token refresh.

Provider checkout commands are not internal checkout implementation.
Provider checkout commands are research references only.

## Self-hosted instance config

GitLab and Gitea are self-hosted aware. Resolver metadata must preserve provider instance identity and base URL from the source URL origin.

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
- `cli_unavailable`
- `auth_required`

No label suggestion fields are included in this phase.

## Repo matching

Repo matching remains deterministic and explicit to avoid accidental cross-instance resolution.

## Fetch and checkout strategy

Internal checkout strategy uses plain Git fetch and existing git-stacks worktree creation logic.

Provider checkout references:
- `glab mr checkout <id|branch|url>`
- `gh pr checkout <number|url|branch>`
- `tea pulls checkout <pull index>`

These commands are documentation references only and are not used as internal checkout execution.
