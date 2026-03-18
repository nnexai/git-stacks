---
phase: 03-design-and-conditional-implementation
plan: 05
subsystem: tui
tags: [workspace, registry, template, wizard, cli]

# Dependency graph
requires:
  - phase: 03-01
    provides: Registry + Template schema in config.ts (readRegistry, readTemplate, expandBranchPattern, templateExists, listTemplates)
  - phase: 03-02
    provides: repo registry commands and writeRegistry
  - phase: 03-03
    provides: template wizard pattern (pickReposFromRegistry, template YAML format)
  - phase: 03-04
    provides: workspace-ops simplified to workspace-only (mergeEnv, writeEnvFiles without stack args)
provides:
  - workspace creation from template via --from <template-name>
  - workspace creation ad-hoc via registry picker
  - workspace creation from local path via --from <path> (auto-registers)
  - workspace clone preserves template field
  - open --recreate re-syncs workspace from template with diff display
  - workspace-wizard fully Registry+Template model; zero stack references
affects:
  - phase-04
  - integration testing

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "--from <source> routes to local-path or template based on filesystem check then templateExists()"
    - "Template config snapshotted into workspace YAML at creation time (hooks, env, env_file, files, integrations)"
    - "open --recreate diffs template vs workspace then applies with p.confirm unless --force"

key-files:
  created: []
  modified:
    - src/tui/workspace-wizard.ts
    - src/tui/workspace-clone.ts
    - src/commands/workspace.ts

key-decisions:
  - "--from routing: resolve to absolute path first; if existsSync + .git exists treat as local path, else check templateExists() — allows template names that look like paths to work correctly"
  - "Template config is deep-copied into workspace YAML at creation — workspace is self-contained and does not need template to be present at open time"
  - "open --recreate shows full diff (added repos, removed repos, hooks changed, env changed) before applying — users see exactly what will change"
  - "workspace-clone preserves template field via ...rest spread — cloned workspace retains provenance information"

patterns-established:
  - "Wizard 3-path creation: fromSource check (local-path vs template-name) > template+adhoc interactive menu"
  - "buildReposFromTemplate helper: template.repos -> WorkspaceRepo[] using registry map for path resolution"

requirements-completed: [TMPL-05]

# Metrics
duration: 3min
completed: 2026-03-18
---

# Phase 03 Plan 05: Workspace Creation Wizard (Registry+Template Model) Summary

**Workspace creation wizard rewritten for Registry+Template model with three creation paths (template, ad-hoc registry picker, local-path --from), template config snapshotting, and open --recreate for template re-sync with diff display**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-18T18:58:40Z
- **Completed:** 2026-03-18T19:01:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- workspace-wizard.ts fully rewritten: removed all stack references; supports three creation paths (--from template, --from local-path, ad-hoc registry picker)
- Template config (hooks, env, env_file, files, integrations) deep-copied into workspace YAML at creation time
- workspace-clone.ts cleaned up: preserves template field via ...rest spread, no stack references
- workspace.ts: `new` command gains `--from <source>` flag; `open` gains `--recreate` and `--force` flags
- open --recreate: computes diff against template (added/removed repos, hooks/env changes), shows summary, confirms unless --force
- All 142 tests pass after changes

## Task Commits

1. **Task 1: Rewrite workspace-wizard.ts and workspace-clone.ts** - `73604e9` (feat)
2. **Task 2: Update workspace.ts commands and verify tests** - `506ad2e` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/tui/workspace-wizard.ts` - Full rewrite: Registry+Template model, 3 creation paths, template snapshotting
- `src/tui/workspace-clone.ts` - Minor cleanup: confirmed no stack refs, template field preserved via spread
- `src/commands/workspace.ts` - Added --from to new; added --recreate + --force to open with diff+apply logic

## Decisions Made
- `--from` routing: resolve to absolute path, check for `.git` directory first (local path), then fall through to `templateExists()` — template names that coincidentally match path strings are handled correctly
- Template config snapshotted into workspace YAML at creation: workspace is self-contained and independent of template at open time
- `open --recreate` shows full diff before applying: users see exactly what repos were added/removed and whether hooks/env changed
- Clone preserves `template` field via `...rest` spread so cloned workspaces retain provenance

## Deviations from Plan

None - plan executed exactly as written. The test files (workspace-ops.test.ts, config.test.ts) were already updated in prior plans (03-01 through 03-04) to use the `repo:` field instead of `stack:`, so no test file changes were needed in this plan.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Registry+Template migration complete: all 5 plans in phase 03 done
- workspace-wizard, workspace-clone, template-wizard, repo commands, and workspace-ops all use Registry+Template model
- No stack references remain in functional code (only a comment in files.ts mentioning old type name for historical context)
- TMPL-05 fulfilled: clone preserves template provenance; users can re-sync from template via open --recreate

---
*Phase: 03-design-and-conditional-implementation*
*Completed: 2026-03-18*

## Self-Check: PASSED

- src/tui/workspace-wizard.ts: FOUND
- src/tui/workspace-clone.ts: FOUND
- src/commands/workspace.ts: FOUND
- 03-05-SUMMARY.md: FOUND
- commit 73604e9 (Task 1): FOUND
- commit 506ad2e (Task 2): FOUND
