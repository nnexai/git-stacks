---
phase: 03-design-and-conditional-implementation
plan: 01
subsystem: config
tags: [zod, yaml, schemas, registry, template, workspace, completion]

requires: []
provides:
  - DESIGN-DECISION.md comparing Stack vs Registry+Template+Workspace across 3 workflows
  - RepoRegistryEntrySchema, RepoRegistrySchema with local-path-only registry (no URL per REPO-01 constraint)
  - TemplateRepoSchema, TemplateSchema with branch_pattern, base_branch, hooks, env, files, integrations
  - WorkspaceRepoSchema with repo field (replaces stack field)
  - WorkspaceSchema with optional template field
  - readRegistry, writeRegistry, listRegistryEntries I/O functions
  - templatePath, templateExists, readTemplate, writeTemplate, listTemplates I/O functions
  - expandBranchPattern helper for feature/<workspace-name> expansion
  - REGISTRY_FILE and TEMPLATES_DIR path constants
  - Doctor command using registry-based checks (findDeadRepoRefs, findDeadRegistryPaths)
  - Completion generator supporting repo and template dynamic completions
  - Stack infrastructure fully removed (commands, TUI wizards, schemas, I/O functions)
affects:
  - 03-02
  - 03-03
  - workspace-ops
  - workspace-wizard
  - all plans referencing WorkspaceRepoSchema

tech-stack:
  added: []
  patterns:
    - "RepoRegistryEntrySchema follows readYaml+writeYaml+Zod pattern from existing config.ts"
    - "Registry uses single flat file (registry.yml) not per-entry files — consistent with global config pattern"
    - "Templates use per-file storage (one per template) — consistent with workspaces pattern"
    - "expandBranchPattern is a pure string replace, no external template engine"
    - "listRegistryEntries delegates to readRegistry (single source of truth for error handling)"

key-files:
  created:
    - .planning/phases/03-design-and-conditional-implementation/DESIGN-DECISION.md
  modified:
    - src/lib/paths.ts
    - src/lib/config.ts
    - src/index.ts
    - src/commands/doctor.ts
    - src/lib/completion-generator.ts
    - tests/lib/config.test.ts
    - tests/lib/completion-generator.test.ts
  deleted:
    - src/commands/stack.ts
    - src/tui/stack-wizard.ts
    - src/tui/stack-edit.ts

key-decisions:
  - "Registry storage: single flat file registry.yml (not per-entry files) — simpler, atomic reads, consistent with config.yml pattern"
  - "REPO-01 constraint honored: url field NOT included in RepoRegistryEntrySchema — local paths only in Phase 3"
  - "WorkspaceRepoSchema: stack -> repo field (zerover, no migration shim)"
  - "WorkspaceSchema: template field is informational provenance, not a live link to template"
  - "Stack infrastructure: clean break — no compat shims, stack YAMLs orphaned without migration tooling"
  - "workspace-ops.ts and workspace-wizard.ts updates deferred to Plan 02 — they require architectural redesign of the full workspace creation flow"
  - "Completion generator: repo completions use grep on registry.yml, template completions use ls on templates/"

patterns-established:
  - "WorkspaceRepo now identifies its source by registry name (repo: string), not stack path"
  - "Branch pattern expansion: expandBranchPattern(pattern, workspaceName) in config.ts"
  - "Registry I/O: readRegistry() returns [] on missing file, logs error on parse failure"
  - "Template I/O: listTemplates() uses safeParse with warn-and-skip (CONF-01 pattern)"

requirements-completed: [DESIGN-01, DESIGN-02]

duration: 9min
completed: 2026-03-18
---

# Phase 3 Plan 01: Design Decision and Schema Foundation Summary

**Stack model eliminated, replaced by Registry+Template+Workspace: new Zod schemas, path constants, I/O functions, updated WorkspaceRepoSchema (stack->repo), design decision document, and all Stack infrastructure deleted**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-18T05:24:35Z
- **Completed:** 2026-03-18T05:33:42Z
- **Tasks:** 3
- **Files modified:** 10 (7 modified, 3 deleted, 1 created)

## Accomplishments
- Wrote DESIGN-DECISION.md documenting evaluation across 3 workflows (onboarding, feature branch creation, cross-machine sharing) with rationale for zerover clean break
- Added RepoRegistryEntrySchema, RepoRegistrySchema, TemplateRepoSchema, TemplateSchema with full I/O functions and expandBranchPattern helper
- Updated WorkspaceRepoSchema (stack -> repo) and WorkspaceSchema (added template field)
- Added REGISTRY_FILE and TEMPLATES_DIR path constants
- Deleted src/commands/stack.ts, src/tui/stack-wizard.ts, src/tui/stack-edit.ts and all StackSchema/Stack I/O exports
- Updated doctor.ts to use registry-based health checks instead of stack checks
- Updated completion-generator.ts to support repo and template dynamic completions
- Updated config.test.ts (26 tests pass) and completion-generator.test.ts (30 tests pass)

## Task Commits

1. **Task 1: Design decision doc + schema additions in config.ts and paths.ts** - `450c409` (feat)
2. **Task 2: Delete Stack files + update config.ts and index.ts** - `67a9376` (feat)
3. **Task 3: Update doctor.ts, completion-generator.ts, and tests** - `e66980c` (feat)

## Files Created/Modified
- `.planning/phases/03-design-and-conditional-implementation/DESIGN-DECISION.md` - 127-line design decision document fulfilling DESIGN-01 and DESIGN-02
- `src/lib/paths.ts` - Added REGISTRY_FILE and TEMPLATES_DIR constants
- `src/lib/config.ts` - Added new schemas and I/O functions; removed Stack schemas and I/O; updated WorkspaceRepoSchema and WorkspaceSchema
- `src/index.ts` - Removed stackCommand import and registration
- `src/commands/doctor.ts` - Replaced stack-based checks with registry-based checks
- `src/lib/completion-generator.ts` - Replaced "stack" dynamic type with "repo" and "template"
- `tests/lib/config.test.ts` - Removed Stack tests; added RepoRegistryEntrySchema, TemplateSchema, expandBranchPattern tests; updated WorkspaceRepoSchema fixtures
- `tests/lib/completion-generator.test.ts` - Replaced stackCmd with repoCmd/templateCmd in buildTestProgram(); updated all test expectations

## Decisions Made
- Registry uses single flat file `registry.yml` not per-entry files — simpler, consistent with `config.yml`
- REPO-01 constraint: no `url` field in RepoRegistryEntrySchema — local paths only per user decision
- `workspace-ops.ts` and `workspace-wizard.ts` updates deferred to Plan 02 — they require a full architectural rewrite of the workspace creation flow that is explicitly planned there
- HooksSchema (the old StackRepoSchema/StackSchema shared hooks schema) removed since it was no longer used
- Completion generator repo completions: `grep '^- name:' registry.yml` — works with single flat file format

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated completion-generator test buildTestProgram() to use repo/template commands**
- **Found during:** Task 3 (update completion-generator.ts)
- **Issue:** Test file used old `stackCmd` with `stack.edit`/`stack.show` entries mapped to "stack" dynamic type. After removing "stack" from DynamicCompletion, 4 tests failed because `@(edit|show)`, `__ws_stacks`, `_ws_stacks()` were no longer generated.
- **Fix:** Replaced `stackCmd` with `repoCmd` and `templateCmd` in `buildTestProgram()`. Updated test expectations to match new repo/template completion structure.
- **Files modified:** `tests/lib/completion-generator.test.ts`
- **Verification:** All 30 completion-generator tests pass
- **Committed in:** `e66980c` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug in test file)
**Impact on plan:** Test file update required to match schema changes — expected consequence of removing "stack" dynamic type.

## Issues Encountered

**workspace-ops.ts and workspace-wizard.ts import errors:** After deleting `readStack`/`listStacks` from `config.ts`, these two files still import the deleted exports, causing TypeScript compilation errors. This is an expected intermediate state — both files require architectural rewrites that are scoped to Plans 02 and 03 respectively:

- `workspace-ops.ts`: imports `readStack`, `Stack` — full rewrite needed to use registry-based resolution (Plan 02)
- `workspace-wizard.ts`: imports `listStacks`, uses Stack-coupled workspace creation flow (Plan 02-03)

The two test files specified in the plan's acceptance criteria (`config.test.ts` and `completion-generator.test.ts`) both pass. The `workspace-ops.test.ts` produces one runtime error due to the broken import chain, but this is expected until Plan 02 fixes workspace-ops.ts.

## Next Phase Readiness
- Schema foundation is complete — all subsequent plans can import new schemas
- DESIGN-01 and DESIGN-02 requirements fulfilled
- Plans 02-03 can now build `src/commands/repo.ts`, `src/commands/template.ts`, and update `workspace-ops.ts` and `workspace-wizard.ts`
- Stack YAMLs at `~/.config/git-stacks/stacks/` are orphaned — no migration needed per zerover decision

## Self-Check: PASSED

All created files verified present. All task commits verified in git log.

---
*Phase: 03-design-and-conditional-implementation*
*Completed: 2026-03-18*
