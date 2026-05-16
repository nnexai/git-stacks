# Phase 92: Forge Source Research and Resolver Design - Context

**Gathered:** 2026-05-16T11:14:18+02:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 92 researches and designs forge-source workspace creation before implementation. It is GitLab-first, but must include enough Gitea and GitHub shape awareness to avoid a GitLab-only resolver contract. Phase 92 does not implement `git-stacks new --source`; Phase 93 implements workspace creation from the resolver.

</domain>

<decisions>
## Implementation Decisions

### Forge Priority and Validation Depth
- **D-01:** GitLab is the first implementation target and should receive the deepest research, using official `glab` documentation because `glab` is not installed locally.
- **D-02:** Gitea should be researched shape-aware and validated locally where possible because `tea` is installed on this machine (`tea 0.14.0`).
- **D-03:** GitHub should be researched shape-aware from official `gh` documentation because `gh` is not installed locally.
- **D-04:** GitLab and Gitea must be self-hosted aware. URL parsing must not assume `gitlab.com` or one fixed Gitea host.
- **D-05:** Phase 92 should design forge instance/base URL config at two levels: top-level integration defaults such as `integrations.gitlab.base_url` / `integrations.gitea.base_url`, and repo-level override metadata for repos on different self-hosted instances.
- **D-06:** Existing `{ enabled: true }` integration config remains valid. Resolver matching should prefer explicit repo-level forge metadata, then fall back to integration-level config and URL/remote inference.

### Resolver Output Contract
- **D-07:** Resolver success output should include forge id, instance/base URL, repo identity/path, change type, change number, source/head branch/ref, target/base branch, web URL, matched registry repo, and typed confidence/failure info.
- **D-08:** Provider terminology must be preserved for user-facing text and command mapping: GitLab uses `mr` / merge request; GitHub and Gitea use `pr` / pull request.
- **D-09:** Include both source/head branch/ref and target/base branch because checkout and workspace branch naming need both.
- **D-10:** Include normalized source metadata for later workspace YAML persistence.
- **D-11:** Do not include auto-label suggestions in the resolver output. Label behavior remains Phase 93 or later.
- **D-12:** Use a typed result union. Failures should have typed reasons such as `unsupported_forge`, `url_parse_failed`, `repo_not_matched`, `ambiguous_repo`, `cli_unavailable`, and `auth_required`.

### Repo Matching and Ambiguity
- **D-13:** Strongest match is explicit repo-level forge metadata: forge id, base URL/instance, and repo path/slug.
- **D-14:** Repo-level forge metadata overrides top-level integration defaults for self-hosted cases.
- **D-15:** If multiple template repos match the same forge source, fail as ambiguous and require explicit repo selection/override in Phase 93.
- **D-16:** Forge source checkout applies only to worktree repos. Trunk/dir matches fail with clear unsupported-mode errors.
- **D-17:** If the selected template does not include the source repo, fail clearly and suggest choosing a different template or adding that repo to the template.

### Fetch and Checkout Strategy Boundaries
- **D-18:** Phase 92 designs the fetch/checkout strategy; Phase 93 implements it.
- **D-19:** Preferred internal strategy is plain Git fetch/checkout through existing git-stacks workspace logic. Provider tooling is used to discover metadata, not as the workspace checkout mechanism.
- **D-20:** Provider CLI checkout commands such as `glab mr checkout`, `gh pr checkout`, and `tea pulls checkout` may be documented as research references, but they are not the preferred internal mechanism.
- **D-21:** Workspace branch name should use the forge source branch name.
- **D-22:** Existing local branch handling should align with the v0.17.2 behavior: reuse the local branch when it matches the same source/ref; otherwise fail clearly on mismatch.
- **D-23:** Resolver must identify fork/source project metadata where available, and Phase 93 should fetch the exact source ref without assuming same-repo branches.

### Folded Todos
- **Create workspace from forge source:** Folded into Phase 92 only for the research/design slice: GitLab-first source resolution, resolver contract, URL/ref/fetch strategy, repo matching, and validation boundaries. Implementation remains Phase 93.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Scope
- `.planning/ROADMAP.md` — Phase 92 goal, success criteria, and relationship to Phase 93.
- `.planning/REQUIREMENTS.md` — FSRC-02, FSRC-03, and FSRC-08.
- `.planning/PROJECT.md` — v0.18.0 forge-source milestone context.
- `.planning/todos/pending/2026-05-15-create-workspace-from-forge-source.md` — folded todo with original `git-stacks new --source <forge-url>` idea.

### Existing Code
- `src/lib/integrations/gitlab.ts` — current GitLab integration and existing `glab` command usage.
- `src/lib/integrations/gitea.ts` — current Gitea integration and `tea` command usage.
- `src/lib/integrations/github.ts` — current GitHub integration and `gh` command usage.
- `src/lib/integrations/forge-utils.ts` — current forge repo resolution, detection, and registry matching helpers.
- `src/lib/config.ts` — current `GlobalConfigSchema`, `RepoRegistryEntrySchema`, and forge metadata shape.

### External Research Targets
- Official GitLab CLI (`glab`) documentation for merge request URL/ref/checkout behavior.
- Official GitHub CLI (`gh`) documentation for pull request URL/ref/checkout behavior.
- Official Gitea Tea documentation plus local `tea 0.14.0` validation where auth/config permits.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/integrations/forge-utils.ts`: Existing `resolveForgeRepo`, `resolveForgeRepoAnyMode`, forge detection, and error formatting are the closest analogs for resolver failure unions and repo matching.
- `src/lib/config.ts`: `GlobalConfigSchema` currently allows `integrations: Record<string, unknown>` and `RepoRegistryEntrySchema` has only a simple `forge` enum. Phase 92 should design typed config for self-hosted base URLs and repo-level overrides.
- `src/lib/integrations/gitlab.ts`, `gitea.ts`, and `github.ts`: Existing integrations already separate provider command behavior and share common forge utility contracts.

### Established Patterns
- Forge integrations are disabled by default and enabled through top-level config.
- Existing forge repo resolution fails clearly for missing, ambiguous, wrong-forge, and unsupported-mode cases.
- Integration config can currently hold unknown provider-specific fields, but typed design is needed before relying on base URL semantics.

### Integration Points
- Design a normalized forge source resolver contract that Phase 93 can call before normal workspace creation.
- Extend registry/template matching design to account for self-hosted instance identity, repo path/slug, and repo-level overrides.
- Research plain Git ref fetch strategies that keep workspace creation on normal git-stacks branch/worktree paths.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly does not want provider CLI checkout to become a new internal checkout path. The point is fast workspace setup based on a different source, while internals still follow normal git-stacks workspace creation logic.
- Provider tooling is acceptable for metadata discovery and research, but Phase 93 should fetch and position refs through explicit Git operations.
- GitLab/Gitea self-hosted support means resolver design needs instance identity, not just forge enum.

</specifics>

<deferred>
## Deferred Ideas

- Actual `git-stacks new --source <forge-url>` implementation is Phase 93.
- Auto-label behavior is not locked by Phase 92.
- Equal-depth GitHub/Gitea implementation is deferred; Phase 92 only prevents a GitLab-only contract.

### Reviewed Todos (not folded)
- Add workspace notes — deferred; unrelated workspace metadata capability.
- Add workspace stale view — deferred; separate advisory workspace aging command.
- Improve template composition understanding — deferred; unrelated template UX capability.
- Add manual workspace commands — deferred; separate command recipe capability.
- Improve TUI dashboard experience — deferred; not part of forge source resolver design.

</deferred>

---

*Phase: 92-forge-source-research-and-resolver-design*
*Context gathered: 2026-05-16T11:14:18+02:00*
