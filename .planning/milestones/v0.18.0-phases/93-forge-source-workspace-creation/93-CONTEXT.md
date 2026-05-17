# Phase 93: Forge Source Workspace Creation - Context

**Gathered:** 2026-05-16T11:29:10+02:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 93 implements `git-stacks new <name> --template <template> --source <forge-url>` using the Phase 92 forge source resolver. The matched worktree repo starts from the forge source while the workspace remains a normal template-backed git-stacks workspace. This phase implements GitLab, Gitea, and GitHub source creation paths, but verification must respect live forge testing limits.

</domain>

<decisions>
## Implementation Decisions

### CLI Contract
- **D-01:** `--source` requires `--template`. The source identifies the repo/change; the template defines the workspace shape.
- **D-02:** Ambiguous repo matches use `--repo <name>` as the explicit override.
- **D-03:** Phase 93 accepts full forge web URLs only.
- **D-04:** Provider shorthand such as `gitlab:123` is a nice-to-have later when the forge base URL is known through central config or template/repo metadata, but it is not required in Phase 93.
- **D-05:** Add `--dry-run` / preview mode showing resolved source, matched repo, branch/ref, and planned workspace creation without writing workspace YAML or worktrees.

### Workspace Creation Behavior
- **D-06:** Fetch the forge source into the main clone before worktree creation, then create the matched repo worktree branch from that fetched source ref through existing git-stacks worktree logic.
- **D-07:** Non-source repos in the selected template use normal template branch rules.
- **D-08:** If the forge source branch name is invalid for local branch naming, sanitize using existing branch-name rules if available; otherwise fail clearly.
- **D-09:** Existing workspace name collisions behave exactly like normal `git-stacks new`.
- **D-10:** Workspace branch name uses the forge source branch name.
- **D-11:** Existing local branch handling aligns with the v0.17.2 behavior: reuse the local branch when it matches the same source/ref; otherwise fail clearly on mismatch.

### Metadata Persistence and Labels
- **D-12:** Add a dedicated `source` / provenance block on `WorkspaceSchema`.
- **D-13:** Do not store forge source provenance under `settings.integrations`.
- **D-14:** Persist normalized forge-source metadata: original URL, forge id, instance/base URL, change type/number, source/head branch/ref, target/base branch, matched repo, web URL, and fetched ref.
- **D-15:** Do not auto-label workspaces created from `--source`. Labels can remain manual or future behavior.
- **D-16:** Source metadata is visible/editable through existing workspace YAML edit flows, but commands must validate it and fail clearly if malformed.

### Failure UX and Validation Boundaries
- **D-17:** Resolver failures such as auth required, CLI unavailable, unsupported forge, or URL parse failure fail before creating workspace YAML or worktree side effects.
- **D-18:** If fetch succeeds for the source repo but later workspace creation fails, rollback cleans up temporary/internal fetched refs created only for this operation.
- **D-19:** Fork/external contributor fetch failures should provide actionable provider-specific guidance: name the forge/source that failed, mention auth/permission/fork access, and suggest checking URL or credentials.
- **D-20:** Implement GitLab, Gitea, and GitHub source creation paths.
- **D-21:** Verification must respect live testing limits: Gitea may use local `tea` validation where possible; GitLab and GitHub rely on official docs, injected executor tests, URL/resolver contract tests, and local Git fixtures rather than live authenticated `glab`/`gh` runs.
- **D-22:** Release/docs must not overstate live forge coverage.

### Folded Todos
- **Create workspace from forge source:** Folded into Phase 93 for the implementation slice: `git-stacks new --source`, matched worktree fetch/checkout, source metadata persistence, and clear failure behavior.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Scope
- `.planning/ROADMAP.md` — Phase 93 goal and success criteria.
- `.planning/REQUIREMENTS.md` — FSRC-01 and FSRC-04 through FSRC-07.
- `.planning/PROJECT.md` — v0.18.0 forge-source context and validation constraints.
- `.planning/todos/pending/2026-05-15-create-workspace-from-forge-source.md` — folded implementation todo.

### Upstream Phase Context and Plans
- `.planning/phases/92-forge-source-research-and-resolver-design/92-CONTEXT.md` — locked resolver, self-hosted config, repo matching, and fetch strategy decisions.
- `.planning/phases/92-forge-source-research-and-resolver-design/92-RESEARCH.md` — official `glab`/`gh`, Tea, and fetch strategy research.
- `.planning/phases/92-forge-source-research-and-resolver-design/92-01-PLAN.md` — forge source contract/config plan.
- `.planning/phases/92-forge-source-research-and-resolver-design/92-02-PLAN.md` — URL parsing/provider shape plan.
- `.planning/phases/92-forge-source-research-and-resolver-design/92-03-PLAN.md` — repo matching/failure semantics plan.
- `.planning/phases/92-forge-source-research-and-resolver-design/92-04-PLAN.md` — validation and documentation boundary plan.

### Existing Code
- `src/commands/workspace.ts` — `git-stacks new` command flow and non-interactive/template handling.
- `src/lib/workspace-lifecycle.ts` and `src/lib/workspace-ops.ts` — normal workspace/worktree creation logic and rollback behavior.
- `src/lib/git.ts` — worktree, branch, fetch, and local branch handling helpers.
- `src/lib/config.ts` — `WorkspaceSchema`, `RepoRegistryEntrySchema`, and YAML persistence.
- `src/lib/integrations/forge-utils.ts` — forge repo resolution and typed failure patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Normal `git-stacks new` / template-backed workspace creation should remain the main path; `--source` only changes the matched repo start point and source metadata.
- Existing v0.17.2 local branch reuse behavior is the behavioral precedent for branch collisions.
- Existing rollback patterns should clean up operation-created refs if later creation steps fail.
- Existing workspace YAML edit flow can expose the new `source` block; validation should guard malformed edits.

### Established Patterns
- Command-level behavior should be thin and delegate source resolution/fetch/creation helpers to `src/lib/`.
- Expected failures should be typed and user-actionable.
- Live forge behavior should be represented through injected executor tests and local Git fixtures when authenticated CLIs are unavailable.

### Integration Points
- Extend `git-stacks new` with `--source <forge-url>`, `--repo <name>`, and `--dry-run`.
- Add `WorkspaceSchema.source` with normalized forge provenance.
- Implement resolver-driven fetch into the main clone before worktree creation.
- Add tests for GitLab, Gitea, and GitHub source paths using resolver contracts, injected executors, and local Git fixtures.

</code_context>

<specifics>
## Specific Ideas

- A dedicated workspace source block is preferred over `settings.integrations.<forge>.source` because source creation provenance is not just integration settings.
- Example source block shape discussed:

```yaml
source:
  kind: forge
  forge: gitlab
  base_url: https://gitlab.example.com
  url: https://gitlab.example.com/org/repo/-/merge_requests/123
  change_type: mr
  change_number: "123"
  repo: api
  repo_path: org/repo
  source_branch: feature/x
  source_ref: refs/merge-requests/123/head
  target_branch: main
  fetched_ref: refs/git-stacks/sources/gitlab/123
```

- The phase should implement all three forge paths, but GitLab/GitHub live authenticated behavior should not be claimed as fully validated.

</specifics>

<deferred>
## Deferred Ideas

- Provider shorthand such as `gitlab:123` is deferred.
- Auto-labels for review/source workspaces are deferred.
- Broad dashboard UI remains deferred.

### Reviewed Todos (not folded)
- Improve TUI dashboard experience — deferred; not part of source creation implementation.
- Add manual workspace commands — deferred; separate command recipe capability.
- Add workspace notes — deferred; unrelated metadata capability.
- Add workspace stale view — deferred; separate advisory command.
- Improve template composition understanding — deferred; unrelated template UX capability.

</deferred>

---

*Phase: 93-forge-source-workspace-creation*
*Context gathered: 2026-05-16T11:29:10+02:00*
