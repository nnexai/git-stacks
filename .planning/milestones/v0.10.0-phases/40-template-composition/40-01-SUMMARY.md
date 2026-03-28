---
phase: 40-template-composition
plan: 01
subsystem: config
tags: [zod, yaml, template, composition]

requires: []
provides:
  - TemplateSchema includes field for template composition
  - composeTemplates() merge engine with defined precedence rules
  - CircularIncludesError and MissingTemplateError error classes
affects: [40-02, workspace-wizard, template-wizard]

tech-stack:
  added: []
  patterns:
    - Template composition via ordered merge with worktree-wins repo precedence
    - 1-level include depth limit with nested-includes warning

key-files:
  created:
    - src/lib/composition.ts
    - tests/lib/composition.test.ts
  modified:
    - src/lib/config.ts

key-decisions:
  - "Circular detection checks nested includes arrays even though they are not resolved (catches A->B->A cycles)"
  - "composeTemplates() returns a fully resolved template without an includes field"

patterns-established:
  - "Template merge order: included templates prepended, named templates appended, last has highest precedence"
  - "Repo mode precedence: worktree wins over trunk regardless of template order"

requirements-completed: [COMP-01, COMP-03, COMP-04, COMP-05, COMP-06, COMP-07]

duration: 8min
completed: 2026-03-26
---

# Plan 40-01: Schema Extension and Composition Engine Summary

**TemplateSchema extended with `includes` field; `composeTemplates()` merges repos (union, worktree wins), hooks (concatenated), env (last-wins), files, and integrations across templates**

## Performance

- **Duration:** 8 min
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Extended TemplateSchema with optional `includes: string[]` field (backward compatible)
- Implemented `composeTemplates()` with full merge rules: repo union with worktree mode precedence, hook concatenation in order, env last-wins per key, files concatenation, integrations deep merge
- Circular includes detection that catches both direct duplicates and nested reference cycles
- 1-level depth limit with stderr warning for nested includes
- 24 comprehensive unit tests covering all merge rules, edge cases, and error paths

## Task Commits

1. **Task 1: Schema extension + composeTemplates + tests** - `6ab2d6e` (feat)

## Files Created/Modified
- `src/lib/config.ts` - Added `includes: z.array(z.string()).optional()` to TemplateSchema
- `src/lib/composition.ts` - New module: `composeTemplates()`, `CircularIncludesError`, `MissingTemplateError`
- `tests/lib/composition.test.ts` - 24 tests covering repo union, mode precedence, hooks, env, files, integrations, circular detection, depth limit, backward compat

## Decisions Made
- Circular detection checks included templates' own includes arrays (without resolving them) to catch A->B->A cycles even with 1-level depth limit
- The composed template does not carry forward an `includes` field -- it is a fully resolved flat template

## Deviations from Plan

None - plan executed as specified. One minor fix needed: circular detection initially missed the nested-includes-back-reference case because 1-level limit meant nested includes were not resolved. Added a check on included templates' includes arrays against the seen set.

## Issues Encountered
None

## Next Phase Readiness
- `composeTemplates()` is ready for Plan 02 to wire into CLI and wizard
- All types check, all tests pass

---
*Phase: 40-template-composition*
*Completed: 2026-03-26*
