# Phase 103: v0.19.0 Final Release Validation - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 103 prepares the next v0.19.0 release candidate after the RC follow-up fixes. It updates release-facing artifacts, package metadata, and the final release handoff so the package can be published as `0.19.0-rc.2` with tag `v0.19.0-rc.2`. It also runs or defines the final validation gate for the already-planned RC follow-up scope: manager command-output containment, completion completeness, workspace-root auto-detection, and the existing canonical release gate.

This phase does not add new product behavior, reopen deferred dashboard rollback progress visibility, or fold unrelated pending todos into v0.19.0.

</domain>

<decisions>
## Implementation Decisions

### Release Artifact Wording
- **D-01:** Describe the Phase 100-102 work as normal RC follow-up fixes for defects that already existed. Avoid over-framing them as unusual, risky, or as new broad capabilities.
- **D-02:** Release-facing docs should clearly include manager command-output containment, completion completeness repair, and workspace-root auto-detection in the `0.19.0-rc.2` story.
- **D-03:** Keep dashboard rollback progress visibility explicitly deferred if release notes mention the dashboard boundary.
- **D-04:** Do not fold pending v0.19.0-adjacent todos into this phase; review them as out of scope.

### Verification Gate Shape
- **D-05:** The planner may choose the exact gate shape.
- **D-06:** The gate must prove the focused RC follow-up areas from Phases 100-102 plus the current canonical release gate.
- **D-07:** `bun run verify` remains an acceptable canonical gate if it covers the release requirements; otherwise the planner may add or use a stricter release script that sequences focused smoke checks, verification, and publish dry-run.

### RC.2 Package and Tag Handoff
- **D-08:** Bump package metadata to publishable prerelease version `0.19.0-rc.2`.
- **D-09:** The tag target for this phase is `v0.19.0-rc.2`, not final `v0.19.0`.
- **D-10:** The handoff should make it possible for the user to directly publish the RC.2 package after validation.
- **D-11:** Keep the final `0.19.0` tag/publish path separate from this phase; RC.2 is still part of the v0.19.0 release line, but it is not the final release.

### Failure and Caveat Policy
- **D-12:** Use a strict recommended failure policy: failures in Phase 100-103 scope or the canonical release gates block the RC.2 handoff.
- **D-13:** Unrelated pre-existing failures may be documented only with exact command output, scope evidence, and an explicit release decision.
- **D-14:** Do not silently mark a failed gate green or bury a release-relevant failure as a caveat.

### the agent's Discretion
- The planner may choose whether to extend the existing `scripts/release-rc-check.ts`, add a small RC.2-focused release script, or sequence commands manually in the plan.
- The planner may choose the focused smoke commands for manager output containment, completion generation, and workspace-root detection after inspecting the completed Phase 100-102 tests.
- The planner may choose the exact README/help update depth. User-facing release docs are required only where relevant to the shipped final RC behavior.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and Requirements
- `.planning/ROADMAP.md` — Phase 103 goal, dependency on Phase 102, success criteria, and single-plan release validation split.
- `.planning/REQUIREMENTS.md` — `REL-01` and `REL-02`, the locked final release readiness requirements.
- `.planning/PROJECT.md` — v0.19.0 RC follow-up context, current RC boundary, and user-facing release candidate framing.
- `.planning/STATE.md` — Current planning state and active milestone context; verify live state before mutating it because state helpers have drifted before.

### Prior Phase Context
- `.planning/phases/100-manager-tui-command-output-containment/100-CONTEXT.md` — Locked manager output containment behavior and dashboard boundary.
- `.planning/phases/101-completion-completeness-repair/101-CONTEXT.md` — Locked completion coverage and live command-tree regression gate expectations.
- `.planning/phases/102-workspace-root-auto-detection/102-CONTEXT.md` — Locked workspace-root detection semantics and representative coverage expectations.

### Release and Verification Surfaces
- `package.json` — Current package metadata, npm scripts, `verify`, `prepublishOnly`, and version field to bump to `0.19.0-rc.2`.
- `CHANGELOG.md` — User-facing release notes; currently contains `0.19.0-rc.1` and must add or update RC.2 wording.
- `README.md` — User-facing docs; update only where final RC behavior requires it.
- `scripts/release-rc-check.ts` — Existing RC verification script and tag handling for release candidate workflow.
- `scripts/verify.ts` — Canonical verification workflow invoked by `bun run verify`.
- `tests/commands/release-rc.test.ts` — Existing release-candidate smoke coverage.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/release-rc-check.ts` already validates RC package version shape, runs release smoke, runs `bun run verify`, performs `bun publish --dry-run`, and creates/checks the RC tag.
- `scripts/verify.ts`, `scripts/verify-prereqs.ts`, `scripts/verify-gates.ts`, and `scripts/functional-coverage-readiness.ts` define the current local release gate stack.
- `tests/commands/release-rc.test.ts` already maps release smoke coverage into the E2E inventory.
- `package.json` exposes `verify`, `verify:prereqs`, `verify:gates`, `verify:functional`, and `prepublishOnly`.

### Established Patterns
- Release notes should be user-facing and avoid maintainer-only verification detail unless the artifact is a planning/evidence doc.
- Existing GSD release work separates RC package/tag targets from final release tags.
- Broad test suites should run through the custom Bun runner or repo scripts, not raw `bun test tests/`.
- Verification failures must be recorded with exact evidence when they are accepted rather than fixed.

### Integration Points
- Phase 103 depends on Phase 102 being complete before final RC.2 validation can pass.
- The plan should inspect Phase 100-102 summaries/tests once available and select focused checks that directly exercise those repaired areas.
- `scripts/release-rc-check.ts` may need version/tag wording generalized from rc.1 assumptions to rc.2, depending on its current implementation.
- `CHANGELOG.md`, `package.json`, release smoke tests, and tag handoff must agree on `0.19.0-rc.2` / `v0.19.0-rc.2`.

</code_context>

<specifics>
## Specific Ideas

- User direction: release wording for these fixes "should not be a problem" because the phase is fixing issues that already existed; general fix wording is fine.
- User direction: verification gate shape is left to the planner.
- User direction: publish another RC first, with package metadata bumped and tag target `v0.19.0-rc.2`.
- User direction: use the recommended strict failure/caveat policy.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- **Improve TUI dashboard experience** (`.planning/todos/pending/2026-05-15-improve-tui-dashboard-experience.md`) — Reviewed by matcher but not folded; broad dashboard work is outside final release validation.
- **Add manual workspace commands** (`.planning/todos/pending/2026-05-15-add-manual-workspace-commands.md`) — Already shipped in the v0.19.0 line; Phase 103 only validates/release-documents existing behavior.
- **Add workspace notes** (`.planning/todos/pending/2026-05-15-add-workspace-notes.md`) — Already shipped in the v0.19.0 line; not new Phase 103 scope.
- **Add workspace stale view** (`.planning/todos/pending/2026-05-15-add-workspace-stale-view.md`) — Future advisory workflow; out of scope.
- **Create workspace from forge source** (`.planning/todos/pending/2026-05-15-create-workspace-from-forge-source.md`) — Already resolved by v0.18.0 work; out of scope.
- **Improve template composition understanding** (`.planning/todos/pending/2026-05-15-improve-template-composition-understanding.md`) — Future ergonomics/support idea; out of scope.

</deferred>

---

*Phase: 103-v0.19.0 Final Release Validation*
*Context gathered: 2026-05-25*
