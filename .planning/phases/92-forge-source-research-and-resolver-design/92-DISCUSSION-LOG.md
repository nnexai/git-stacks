# Phase 92: Forge Source Research and Resolver Design - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-16T11:14:18+02:00
**Phase:** 92-forge-source-research-and-resolver-design
**Areas discussed:** todo folding, forge priority and validation depth, resolver output contract, repo matching and ambiguity, fetch/checkout strategy boundaries

---

## Todo Folding

| Option | Description | Selected |
|--------|-------------|----------|
| Fold `Create workspace from forge source` | Include GitLab-first source resolution, resolver contract, URL/ref/fetch strategy, and validation boundaries. | ✓ |
| Fold nothing | Leave all matches deferred. | |

**User's choice:** Fold the research/design slice.
**Notes:** Actual workspace creation implementation stays Phase 93.

---

## Forge Priority and Validation Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Shape-aware non-GitLab support with self-hosted base URL design | GitLab-first; Gitea/GitHub researched enough to avoid GitLab-only assumptions. | ✓ |
| Equal depth for all forges | Research GitLab, GitHub, and Gitea equally. | |
| GitLab only | Ignore Gitea/GitHub until later. | |

**User's choice:** Shape-aware non-GitLab support, with added constraints.
**Notes:** User pointed out that Gitea and GitLab can be self-hosted and asked about base URL config. Current code has `integrations: Record<string, unknown>` but no typed base URL fields. User clarified that Gitea can be validated locally, while `glab` and `gh` need online research. Local checks found `tea 0.14.0` installed and no `glab`/`gh`.

---

## Resolver Output Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Full workspace-creation metadata | Include forge id, instance/base URL, repo identity, change type/number, source/head, target/base, web URL, matched repo, and typed failure info. | ✓ |
| Minimal checkout metadata | Repo, ref, and target branch only. | |
| Raw provider payload | Raw payload plus a few normalized fields. | |

**User's choice:** Full metadata.
**Notes:** User added that provider terminology must be correct: GitLab MR, GitHub/Gitea PR. User selected source/head and target/base branch metadata. User wanted normalized source metadata for workspace YAML but no auto-label suggestions.

---

## Repo Matching and Ambiguity

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit repo-level forge metadata | Match by forge id, base URL/instance, and repo path/slug. | ✓ |
| Registry repo name | Match source repo slug to registry name. | |
| Remote URL only | Match by remote URL string. | |

**User's choice:** Explicit repo-level forge metadata.
**Notes:** User selected ambiguity failure, unsupported trunk/dir failure, and clear failure when source repo is not in the selected template.

---

## Fetch and Checkout Strategy Boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Plain Git fetch/checkout through existing git-stacks logic | Provider tooling discovers metadata only; workspace creation remains normal and deterministic. | ✓ |
| Provider CLI checkout commands | Use `glab mr checkout`, `gh pr checkout`, or `tea pulls checkout`. | |
| Provider-specific choice | Let each provider choose independently. | |

**User's choice:** Plain Git fetch/checkout through existing git-stacks logic.
**Notes:** User rejected provider CLI checkout as a new internal checkout path. User selected forge source branch name as workspace branch and clarified that existing local branch handling should align with v0.17.2 behavior: reuse if it matches the same source/ref, fail clearly otherwise. User selected explicit fork/source project research.

---

## the agent's Discretion

- Planner/researcher may choose exact field names for the resolver contract as long as they preserve instance identity, provider terminology, branch/ref metadata, matched repo, and typed failures.
- Planner may decide whether typed base URL config lives directly in existing integration config objects or behind provider-specific schemas, while preserving current `{ enabled: true }`.

## Deferred Ideas

- Phase 93 implementation of `git-stacks new --source`.
- Auto-label application.
- Full equal-depth GitHub/Gitea implementation beyond contract-shape research.
