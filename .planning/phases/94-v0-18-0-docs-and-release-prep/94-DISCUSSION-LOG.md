# Phase 94: v0.18.0 Docs and Release Prep - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-16T11:55:16+02:00
**Phase:** 94-v0-18-0-docs-and-release-prep
**Areas discussed:** Todo folding, release note tone and structure, README placement and examples, forge validation wording, release gate scope, release candidate packaging

---

## Todo Folding

| Option | Description | Selected |
|--------|-------------|----------|
| None | Keep Phase 94 focused on docs and release notes only. | ✓ |
| Forge source only | Fold `Create workspace from forge source` because it directly affects v0.18.0 release notes. | |
| Let me pick | List all matched todos for exact selection. | |

**User's choice:** None.
**Notes:** Pending todos were reviewed but not folded into Phase 94.

---

## Release Note Tone and Structure

| Option | Description | Selected |
|--------|-------------|----------|
| User workflow summary | Lead with syncing private/project files into workspaces and creating workspaces from forge changes, with short behavior notes. | ✓ |
| Feature-by-feature reference | Use detailed sections for `files.sync`, `files status|pull|push`, and `new --source`. | |
| Conservative patch-style notes | Keep it brief and focus on exact commands added. | |

**User's choice:** User workflow summary.
**Notes:** User clarified: keep it usage/user focused.

---

## Forge Validation Wording

| Option | Description | Selected |
|--------|-------------|----------|
| Brief confidence note | Mention GitLab-first, with Gitea/GitHub contract support and documented live-validation limits. | |
| Dedicated limitations subsection | Add a clear validation-limits paragraph under v0.18.0. | |
| Keep limits in README only | Changelog stays concise; detailed caveats live in docs. | |
| Mark non-stable / early support | Make clear forge source support is available but not fully stable for provider/auth/self-hosted/fork edge cases. | ✓ |

**User's choice:** Mark the forge integration/source support as non-stable, then prefer softer wording.
**Notes:** Final wording direction is "early support" rather than a harsh warning label, while still naming provider auth, self-hosted instances, and fork refs as cases needing manual verification.

---

## README Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Workspaces section | Add near `git-stacks new`, where workspace creation is explained. | ✓ |
| New Forge Sources subsection | Dedicated subsection under Workspaces with examples and caveats. | |
| Integrations section | Place near GitLab/Gitea/GitHub integration docs. | |

**User's choice:** Workspaces section.
**Notes:** Source creation should read as a normal workspace creation workflow.

---

## README Example Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Short practical example | One command example plus compact notes about `--template`, optional `--repo`, and early forge support. | ✓ |
| Full walkthrough | Include config, repo metadata, template, command, source block, and failure examples. | |
| Minimal mention | Add only command syntax and point users to release notes. | |

**User's choice:** Short practical example.
**Notes:** Include `--template` required and `--repo` for ambiguity.

---

## Release Gate Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Docs plus focused smoke | Verify README/changelog match CLI help and run focused local smoke for file sync plus `new --source --dry-run` where available. | ✓ |
| Full local gates only | Run typecheck, focused tests, and verify:gates; skip manual smoke beyond docs review. | |
| Broader release rehearsal | Include package version, changelog, README, focused tests, full gates, and manual smoke commands. | |

**User's choice:** Docs plus focused smoke.
**Notes:** Smoke should include file sync behavior and source dry-run checks where the implemented CLI supports them.

---

## Release Candidate Packaging

| Option | Description | Selected |
|--------|-------------|----------|
| `0.18.0-rc.1` | Set `package.json` to `0.18.0-rc.1` and tag as `v0.18.0-rc.1`, ready for `bun publish`. | ✓ |
| `0.18.0-rc.0` | Start at `rc.0` and tag `v0.18.0-rc.0`. | |
| Decide during execution | Context says release candidate first; planner picks exact prerelease number. | |

**User's choice:** `0.18.0-rc.1`.
**Notes:** Phase 94 should prepare release-candidate package state first, not final `0.18.0`.

---

## the agent's Discretion

- Exact README section placement inside the Workspaces area can follow the surrounding doc structure.
- Exact changelog headings can follow existing `CHANGELOG.md` conventions.

## Deferred Ideas

- Final `0.18.0` release publish/tag after RC validation.
- Provider shorthand for forge sources.
- Auto-labeling forge-source workspaces.
- Broad TUI dashboard improvements.
