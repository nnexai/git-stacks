---
phase: 126-web-workflow-and-forge-source-parity
plan: "02"
subsystem: core
tags: [github, gitlab, argv, resolver, git, sha, worktree]

requires:
  - phase: 126-web-workflow-and-forge-source-parity
    provides: strict reviewed-source protocol vocabulary from Plan 01
provides:
  - Strict provider-backed GitHub PR and GitLab MR resolution with bounded argv execution
  - Authoritative registry/template matching and safe conflict-aware workspace suggestions
  - Real source-repository fetch and immutable-SHA private-ref preparation with rollback cleanup
affects: [126-04, reviewed-source, workspace-creation, forge-source]

tech-stack:
  added: []
  patterns: [injected argv runner, strict provider normalization, precedence-ranked matching, operation-private Git refs]

key-files:
  created:
    - packages/core/src/integrations/forge-source-resolver.ts
    - tests/lib/forge-source-resolver.test.ts
  modified:
    - packages/core/src/integrations/forge-source.ts
    - packages/core/src/workspace-source.ts
    - packages/core/src/index.ts
    - tests/lib/workspace-source.test.ts

key-decisions:
  - "Keep the broad historical forge URL parser for legacy Gitea CLI behavior while the reviewed flow uses a separate strict GitHub/GitLab host allowlist."
  - "Treat provider fetch coordinates as trusted core/service-only data and validate their host and repository identity again before passing them to Git."
  - "Hash operation identity into a private ref name and return an idempotent cleanup hook so the service transaction can remove it on success rollback or failure."

patterns-established:
  - "Provider commands are fixed argv arrays with explicit host, bounded output and timeout, no shell, and no credential arguments."
  - "Repository matching ranks explicit metadata above integration-host metadata above unique bounded remote inference."
  - "Reviewed source preparation fetches a real source ref from its real repository and compares the resolved full SHA before normal creation."

requirements-completed: [SOURCE-01, SOURCE-02, SOURCE-04]

coverage:
  - id: D1
    description: Provider-backed GitHub and GitLab source resolution with safe typed failures
    requirement: SOURCE-01
    verification:
      - kind: unit
        ref: tests/lib/forge-source-resolver.test.ts#provider-backed forge resolver
        status: pass
    human_judgment: false
  - id: D2
    description: Authoritative repository/template matching and safe editable name suggestions
    requirement: SOURCE-02
    verification:
      - kind: unit
        ref: tests/lib/forge-source-resolver.test.ts#authoritative source repository matching
        status: pass
      - kind: other
        ref: npm run test:deps
        status: pass
    human_judgment: false
  - id: D3
    description: Real source fetch with immutable-SHA verification and private-ref rollback cleanup
    requirement: SOURCE-04
    verification:
      - kind: unit
        ref: tests/lib/workspace-source.test.ts#trusted reviewed workspace source preparation
        status: pass
      - kind: other
        ref: npm run typecheck --workspace @git-stacks/core
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-07-16
status: complete
---

# Phase 126 Plan 02: Provider-Backed Forge Source Summary

**GitHub PR and GitLab MR resolution now produces real source repository, branch, ref, and immutable SHA authority for SHA-checked plain-Git workspace creation.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-16T19:33:00+02:00
- **Completed:** 2026-07-16T19:43:00+02:00
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added a core-owned injected runner and strict GitHub GraphQL/GitLab REST resolver with explicit self-hosted hostname selection, fork/source-project lookup, bounded execution, identity checks, and safe typed failures.
- Added authoritative target-repository matching across explicit forge metadata, integration host defaults, and unique bounded remote inference, with template/mode validation and normalized conflict-safe suggestions.
- Added operation-private plain-Git source preparation that fetches the real fork/source branch, verifies its full SHA, permits only exact-SHA branch reuse, and exposes idempotent rollback cleanup.

## Task Commits

1. **Task 1 RED: Provider resolver contract** - `c9522eea` (test)
2. **Task 1 GREEN: Provider source metadata** - `5a9b44ab` (feat)
3. **Task 2 RED: Source matching contract** - `1a9c590b` (test)
4. **Task 2 GREEN: Authoritative repository matching** - `54555679` (feat)
5. **Task 3 RED: SHA-safe source preparation** - `89e37082` (test)
6. **Task 3 GREEN: Immutable source preparation** - `ac420452` (feat)
7. **Security hardening: Provider identity and cleanup failures** - `00e37025` (fix)
8. **Legacy supported-source migration to the resolver** - `eed751bb` (fix)

## Files Created/Modified

- `packages/core/src/integrations/forge-source-resolver.ts` - Bounded runner, provider normalization, typed failure taxonomy, matcher, candidates, and name suggestion.
- `packages/core/src/integrations/forge-source.ts` - Strict reviewed-flow URL parsing alongside the legacy parser.
- `packages/core/src/workspace-source.ts` - Trusted real-ref/SHA preparation, private-ref cleanup, and existing CLI routing through provider resolution.
- `packages/core/src/index.ts` - Public core exports for the resolver contracts.
- `tests/lib/forge-source-resolver.test.ts` - URL, argv, self-hosted, fork, failure, matching, and suggestion evidence.
- `tests/lib/workspace-source.test.ts` - Real fetch, SHA mismatch, branch reuse/conflict, no-origin, and rollback cleanup evidence.

## Decisions Made

- The reviewed resolver accepts only GitHub pull-request and GitLab merge-request URLs whose host is built in or explicitly configured; Gitea remains on the existing legacy CLI path.
- Provider web identities and clone coordinates are cross-checked against the parsed host/repository before Git receives them, even though the complete trusted result never crosses the core/service boundary.
- Private refs contain a bounded hash rather than raw operation IDs, and cleanup is idempotent so service rollback may call it defensively.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Revalidate provider and fetch identity**
- **Found during:** Plan-level security review
- **Issue:** Structurally valid provider JSON could name a different target repository or inconsistent web/fetch coordinate.
- **Fix:** Added canonical change/repository identity checks and host/path validation for fetch coordinates.
- **Files modified:** `packages/core/src/integrations/forge-source-resolver.ts`, `packages/core/src/workspace-source.ts`
- **Verification:** Focused adversarial resolver/source suites pass.
- **Committed in:** `00e37025`

**2. [Rule 1 - Bug] Cleanup private refs when injected Git helpers throw**
- **Found during:** Plan-level rollback review
- **Issue:** Expected typed Git results cleaned refs, but an unexpected helper exception could bypass cleanup.
- **Fix:** Converted thrown fetch/resolve/branch checks into typed failures after idempotent private-ref cleanup.
- **Files modified:** `packages/core/src/workspace-source.ts`, `tests/lib/workspace-source.test.ts`
- **Verification:** Throwing-helper and cleanup-count tests pass.
- **Committed in:** `00e37025`

**3. [Rule 2 - Missing Critical] Route the existing GitHub/GitLab CLI source entrypoint through real provider resolution**
- **Found during:** Plan-level synthetic assumption scan
- **Issue:** The reviewed path was correct, but the existing supported-source wrapper still derived synthetic refs and assumed `origin` for GitHub/GitLab.
- **Fix:** Existing GitHub/GitLab source calls now resolve provider metadata then reuse the SHA-safe preparation path; only explicitly deferred legacy Gitea behavior remains outside this resolver.
- **Files modified:** `packages/core/src/workspace-source.ts`, `tests/lib/workspace-source.test.ts`
- **Verification:** Legacy-entrypoint test proves provider resolution and the real fork URL are used; CLI typecheck passes.
- **Committed in:** `eed751bb`

---

**Total deviations:** 3 auto-fixed (2 missing critical, 1 bug).
**Impact on plan:** All changes strengthen the planned trust boundary and rollback guarantee without adding client or protocol authority.

## Issues Encountered

- The isolated worktree had no dependency directory. A temporary symlink to the main worktree's installed dependencies was used for verification and removed before closeout.

## User Setup Required

None - provider authentication is intentionally exercised through injected tests in this plan; hosted authenticated validation remains Phase 127.

## Verification

- `./node_modules/.bin/vitest run tests/lib/workspace-source.test.ts tests/lib/forge-source-resolver.test.ts` - 2 files, 41 tests passed on the final implementation.
- Focused legacy parser plus resolver/source run - 3 files, 47 tests passed.
- `npm run typecheck --workspace @git-stacks/core` - passed.
- `npm run typecheck --workspace @git-stacks/cli` - passed.
- `npm run test:deps` - package architecture and cycles passed.
- Provider command scan found no shell execution, provider checkout command, or `glab mr view` use in the reviewed resolver/preparation path.

## Self-Check: PASSED

- All declared source and test artifacts exist.
- RED and GREEN task commits exist in plan history.
- All task acceptance criteria have executable passing coverage.
- Core remains a dependency leaf and imports no protocol/service/client module.

## Next Phase Readiness

Plan 04 can inject `resolveForgeChangeSource()`, retain the complete trusted result in its review token, use `matchForgeSourceRepository()` for authoritative candidates, and call `prepareReviewedWorkspaceSource()` before the normal YAML-last creation transaction.

---
*Phase: 126-web-workflow-and-forge-source-parity*
*Completed: 2026-07-16*
