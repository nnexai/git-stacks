# Phase 93: Forge Source Workspace Creation - Research

## RESEARCH COMPLETE

**Phase:** 93 - Forge Source Workspace Creation
**Date:** 2026-05-16
**Requirement IDs:** FSRC-01, FSRC-04, FSRC-05, FSRC-06, FSRC-07

## User Constraints

### Locked Decisions from CONTEXT.md

- D-01: `--source` requires `--template`. The source identifies the repo/change; the template defines the workspace shape.
- D-02: Ambiguous repo matches use `--repo <name>` as the explicit override.
- D-03: Phase 93 accepts full forge web URLs only.
- D-04: Provider shorthand such as `gitlab:123` is deferred.
- D-05: Add `--dry-run` / preview mode showing resolved source, matched repo, branch/ref, and planned workspace creation without writing workspace YAML or worktrees.
- D-06: Fetch the forge source into the main clone before worktree creation, then create the matched repo worktree branch from that fetched source ref through existing git-stacks worktree logic.
- D-07: Non-source repos in the selected template use normal template branch rules.
- D-08: If the forge source branch name is invalid for local branch naming, sanitize using existing branch-name rules if available; otherwise fail clearly.
- D-09: Existing workspace name collisions behave exactly like normal `git-stacks new`.
- D-10: Workspace branch name uses the forge source branch name.
- D-11: Existing local branch handling aligns with the v0.17.2 behavior: reuse the local branch when it matches the same source/ref; otherwise fail clearly on mismatch.
- D-12: Add a dedicated `source` / provenance block on `WorkspaceSchema`.
- D-13: Do not store forge source provenance under `settings.integrations`.
- D-14: Persist normalized forge-source metadata: original URL, forge id, instance/base URL, change type/number, source/head branch/ref, target/base branch, matched repo, web URL, and fetched ref.
- D-15: Do not auto-label workspaces created from `--source`. Labels can remain manual or future behavior.
- D-16: Source metadata is visible/editable through existing workspace YAML edit flows, but commands must validate it and fail clearly if malformed.
- D-17: Resolver failures fail before creating workspace YAML or worktree side effects.
- D-18: If fetch succeeds for the source repo but later workspace creation fails, rollback cleans up temporary/internal fetched refs created only for this operation.
- D-19: Fork/external contributor fetch failures provide provider-specific guidance.
- D-20: Implement GitLab, Gitea, and GitHub source creation paths.
- D-21: Verification must respect live testing limits: Gitea may use local `tea` validation where possible; GitLab and GitHub rely on official docs, injected executor tests, URL/resolver contract tests, and local Git fixtures rather than live authenticated `glab`/`gh` runs.
- D-22: Release/docs must not overstate live forge coverage.

### Deferred Ideas

- Provider shorthand such as `gitlab:123` is deferred.
- Auto-labels for review/source workspaces are deferred.
- Broad dashboard UI remains deferred.

## Standard Stack

- Use the existing Commander `new` command in `src/commands/workspace.ts` and delegate behavior to `runWorkspaceNew()` in `src/tui/workspace-wizard.ts`. [VERIFIED: codebase grep]
- Use existing workspace construction in `src/tui/workspace-wizard.ts` and `createWorkspace()` in `src/lib/workspace-lifecycle.ts`; do not create a separate provider checkout flow. [VERIFIED: codebase grep]
- Use plain Git operations in `src/lib/git.ts` for fetch/ref/worktree positioning. Existing `createWorktree()` already reuses local branches and can create from remote-tracking refs. [VERIFIED: codebase grep]
- Use Phase 92's planned `src/lib/integrations/forge-source.ts` contract for URL parsing, provider source metadata, repo matching, and typed failure reasons. [VERIFIED: Phase 92 plans]
- Extend `WorkspaceSchema` in `src/lib/config.ts` with a dedicated `source` block; do not place source provenance under `settings.integrations`. [VERIFIED: codebase grep + CONTEXT.md]
- Tests should use Bun test, injected seams, subprocess CLI fixtures, and local bare Git remotes from `tests/helpers.ts`; live `glab` and `gh` are not installed locally. [VERIFIED: local command checks]

## Official Provider Findings

- GitLab `glab mr view` accepts an id or branch and supports `--output json`; inherited `--repo` can use owner/repo, group/namespace/repo, full URL, or Git URL. [CITED: https://docs.gitlab.com/cli/mr/view/]
- GitLab `glab mr checkout` accepts an id, branch, or URL, including a full `/-/merge_requests/<id>` URL, but Phase 93 must not use it as internal checkout machinery. [CITED: https://docs.gitlab.com/cli/mr/checkout/]
- GitHub `gh pr view` accepts a number, URL, or branch and exposes JSON fields including `baseRefName`, `headRefName`, `headRepository`, `headRepositoryOwner`, `isCrossRepository`, `number`, `title`, and `url`. [CITED: https://cli.github.com/manual/gh_pr_view]
- Tea is the official Gitea CLI and supports multiple instances; local `tea 0.14.0` is installed. [CITED: https://about.gitea.com/products/tea/] [VERIFIED: local `tea --version`]
- Local `tea pulls --help` exposes `--fields`, `--repo`, `--remote`, `--login`, and `--output json`; `tea pulls checkout` exists but remains a research reference only. [VERIFIED: local `tea pulls --help`]

## Architecture Patterns

### CLI and Wizard Boundary

`src/commands/workspace.ts` should add `--source <forge-url>`, `--repo <name>`, and `--dry-run` to `new`. The command-level validation should reject `--source` without at least one `--template`, reject `--source` combined with `--from`, and pass the options through to `runWorkspaceNew()`.

`runWorkspaceNew()` should keep template composition as the only supported source workspace shape. The source path should run after template composition and repo materialization but before `createWorkspace()` writes YAML or creates worktrees.

### Source Creation Orchestration

Add a small source orchestration helper under `src/lib/`, for example `src/lib/workspace-source.ts`, that accepts the composed template repos, registry, workspace name, selected repo override, and source URL. It should:

1. call the Phase 92 forge source resolver;
2. fail on unsupported/missing/ambiguous/trunk/dir matches before side effects;
3. derive a sanitized branch from the source branch;
4. fetch the exact source ref into a namespaced internal ref in the matched repo's main clone;
5. prepare a `CreateWorkspaceInputs` object with the matched repo starting from the source ref and all other repos using normal branch creation;
6. provide a rollback cleanup callback for operation-created refs.

### Git Fetch Handoff

`src/lib/git.ts` should expose a focused helper such as `fetchForgeSourceRef(repoPath, source, fetchedRef)` and a helper for creating the source worktree branch from the fetched ref. This avoids provider CLI checkout and keeps Git behavior testable against local bare remotes.

Existing `createWorktree()` may need a source-ref parameter or companion helper; do not reset existing branches. If a local branch name exists, verify same source/ref metadata when available or fail with `branch_conflict`.

### Metadata Persistence

Extend `CreateWorkspaceInputs` with `source?: WorkspaceSource` and add `source` to the in-memory `workspaceObj` before `writeWorkspace()`. `WorkspaceSchema.source` should validate:

- `kind: "forge"`
- `forge: "gitlab" | "gitea" | "github"`
- `base_url`, `url`, `change_type`, `change_number`, `repo`, `repo_path`, `source_branch`, `source_ref`, `target_branch`, `web_url`, and `fetched_ref`
- optional provider title only when metadata exists

### Failure and Dry Run UX

Dry run must resolve source, match repo, sanitize branch, and print planned source details without fetch, worktree creation, YAML writes, hooks, file materialization, or integration generation.

Expected failures should use typed formatter functions and include explicit `--repo <name>` guidance for ambiguity. Fork/external fetch failures should name the provider/source and mention auth, credentials, URL, or fork access.

## Don't Hand-Roll

- Do not use provider CLI checkout commands (`glab mr checkout`, `gh pr checkout`, `tea pulls checkout`) as the implementation path. They are research references only. [VERIFIED: CONTEXT.md]
- Do not build a second workspace writer. Use `createWorkspace()` as the commit point so existing rollback and YAML persistence rules remain intact. [VERIFIED: codebase grep]
- Do not introduce live authenticated forge tests for GitLab or GitHub. Use official docs, injected resolver/executor tests, URL contract tests, and local Git fixtures. [VERIFIED: CONTEXT.md]
- Do not auto-label source workspaces in Phase 93. FSRC-07 conflicts with D-15; the plans should preserve existing template/manual label behavior and not add source labels. [VERIFIED: CONTEXT.md]

## Common Pitfalls

- **Requirement conflict:** FSRC-07 says auto-labels, but D-15 forbids auto-labeling in Phase 93. Plans must reference FSRC-07 only as "not implemented by locked decision D-15" and avoid adding labels.
- **Side effects before resolver failure:** source resolution and repo matching must finish before writing YAML, fetching refs, or creating worktrees.
- **Provider checkout drift:** provider CLIs may checkout into the current repo; Phase 93 must fetch refs and call existing git-stacks worktree logic instead.
- **Ambiguous repo matching:** multiple matching template repos must fail and mention `--repo <name>`.
- **Trunk/dir source repo:** source checkout applies only to worktree repos.
- **Branch collision:** existing local branches are reused only when they match the same source/ref; otherwise fail.
- **Rollback gap:** fetched internal refs created solely for source creation must be removed when later workspace creation fails.
- **Overstated validation:** docs and release notes must say GitLab/GitHub live auth coverage was not exercised locally.

## Validation Architecture

| Behavior | Test Type | Recommended Command |
|----------|-----------|---------------------|
| CLI rejects `--source` without `--template` | subprocess CLI | `bun test tests/commands/workspace-source.test.ts` |
| CLI dry-run reports source, repo, branch/ref, and writes no YAML/worktrees | subprocess CLI | `bun test tests/commands/workspace-source.test.ts` |
| GitLab/Gitea/GitHub source URL paths route through resolver contracts | unit/injected | `bun test tests/lib/workspace-source.test.ts tests/lib/integrations/forge-source.test.ts` |
| Ambiguous, missing, trunk, and dir repo matches fail with guidance | unit/subprocess | `bun test tests/lib/workspace-source.test.ts tests/commands/workspace-source.test.ts` |
| Matched worktree starts at fetched source ref while non-source repos use normal branch creation | local Git fixture | `bun test tests/commands/workspace-source-git.test.ts` |
| Workspace YAML persists dedicated `source` block | unit/subprocess | `bun test tests/lib/config.test.ts tests/commands/workspace-source.test.ts` |
| Fetch rollback removes internal refs on later create failure | unit/local Git fixture | `bun test tests/lib/workspace-source.test.ts tests/lib/workspace-lifecycle-create.test.ts` |
| Type safety | static | `bun run typecheck` |

## Project Constraints

- No `AGENTS.md` exists in the repo root. [VERIFIED: local read]
- Project-local GSD skills are installed under `.codex/skills/`; this plan-phase run uses `gsd-plan-phase` and its planner/checker contracts. [VERIFIED: local file list]
- The existing repo prefers focused Bun tests, local temp dirs, local bare Git remotes, and injected seams over brittle real external integration environments. [VERIFIED: tests/helpers.ts and prior phase planning artifacts]

## What Might Be Missed

- Phase 92 plans are not source files yet in the current checkout. Phase 93 execution must either run after Phase 92 implementation or include the missing resolver contract as an execution prerequisite.
- Exact GitLab/Gitea fork ref shapes may still need provider-specific executor tests because local live authenticated validation is unavailable.
- The roadmap still lists label auto-creation as success criteria, but the latest locked decision defers it. Verification should not treat missing auto-labels as a Phase 93 bug.
