---
status: passed
phase: 40-template-composition
verified: 2026-03-26
---

# Phase 40: Template Composition — Verification

## Phase Goal
Templates can declare composable building blocks via `includes:`, and users can compose templates ad-hoc on `git-stacks new`.

## Success Criteria Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Template YAML with `includes: [api, frontend]` merges repos from both referenced templates | PASS | Test "template with includes field resolves included templates" + wizard code paths resolve includes automatically |
| 2 | `git-stacks new --template api --template frontend` creates workspace with repos from both | PASS | `--template` repeatable flag in workspace.ts; test "multi-template composition simulating --template flag" |
| 3 | Same repo in multiple templates: worktree wins over trunk | PASS | Tests "worktree wins over trunk" and "worktree wins even if lower precedence template has it" |
| 4 | Hooks concatenate in include order, top-level last | PASS | Test "concatenates hooks in include order, top-level last" |
| 5 | Circular includes chain produces clear error | PASS | Test "circular includes (A includes B, B includes A) throws error with cycle path" |
| 6 | Existing templates without includes continue to work | PASS | Test "accepts template without includes field (backward compat)" + config.test.ts 41 tests pass |

## Requirements Traceability

| Requirement | Description | Status | Verification |
|-------------|-------------|--------|--------------|
| COMP-01 | Templates support includes field | PASS | TemplateSchema has `includes: z.array(z.string()).optional()` |
| COMP-02 | git-stacks new accepts multiple --template flags | PASS | Commander.js accumulator in workspace.ts |
| COMP-03 | Repos union, worktree wins over trunk | PASS | mergeRepos() in composition.ts; 2 tests |
| COMP-04 | Hooks concatenate in order, top-level last | PASS | mergeHooks() in composition.ts; 2 tests |
| COMP-05 | Env vars last-wins, top-level wins | PASS | mergeEnvVars() in composition.ts; 1 test |
| COMP-06 | Circular includes detection | PASS | CircularIncludesError thrown; 2 tests |
| COMP-07 | Backward compatibility | PASS | Optional field, schema parse test, 41 config tests pass |

## Automated Test Results

- `bun test tests/lib/composition.test.ts`: 28 pass, 0 fail
- `bun test tests/lib/config.test.ts`: 41 pass, 0 fail
- `bun run typecheck`: clean (no errors)

## Must-Haves Check

### Plan 01 Must-Haves
- [x] TemplateSchema accepts optional includes field containing array of template names
- [x] composeTemplates() merges repos as union with worktree mode winning over trunk
- [x] composeTemplates() concatenates hooks in include order with top-level last
- [x] composeTemplates() merges env vars with last-wins per key, top-level winning
- [x] Circular includes chains throw error with cycle path
- [x] Existing templates without includes field continue to parse correctly

### Plan 02 Must-Haves
- [x] `git-stacks new --template api --template frontend` creates workspace with repos from both
- [x] Interactive wizard resolves includes field when template is selected
- [x] --template and --from are mutually exclusive with clear error message

## Key Artifacts

- `src/lib/composition.ts` — composeTemplates(), CircularIncludesError, MissingTemplateError
- `src/lib/config.ts` — TemplateSchema with includes field
- `src/commands/workspace.ts` — --template repeatable flag
- `src/tui/workspace-wizard.ts` — composition integration in all 3 creation paths
- `tests/lib/composition.test.ts` — 28 tests

## Human Verification Items

None — all criteria are automated testable.
