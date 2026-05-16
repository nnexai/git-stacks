# Phase 90: Files Command Surface and Conflict Policy - Validation Strategy

**Generated:** 2026-05-16
**Status:** Ready for planning

## Validation Architecture

Phase 90 must be validated at both the library-policy layer and the command surface. The risky behavior is not command parsing; it is write/delete policy around two filesystem trees. Tests should therefore prove the core helpers directly and then smoke the CLI over real temp config/workspace fixtures.

## Validation Matrix

| Dimension | Evidence | Command |
|-----------|----------|---------|
| Status comparison | source-only, target-only, differing, equal counts for file and directory sync entries | `bun test tests/lib/files.test.ts` |
| Copy/symlink state | materialized/missing/error state for existing file op entry types | `bun test tests/lib/files.test.ts` |
| Safe defaults | pull refuses target-only/differing paths; push refuses source-only/differing paths | `bun test tests/lib/files.test.ts` |
| Delete policy | deletes never propagate without `--force`; force mirror deletes destination-only files | `bun test tests/lib/files.test.ts` |
| Dry-run safety | dry-run reports planned writes/deletes/refusals and leaves contents unchanged | `bun test tests/lib/files.test.ts tests/commands/files.test.ts` |
| Command surface | `git-stacks files status|pull|push [workspace]` exists and uses optional CWD workspace detection | `bun test tests/commands/files.test.ts` |
| Output readability | status shows compact counts by default; `--verbose` lists capped paths | `bun test tests/commands/files.test.ts` |
| Final project gates | strict types and project verification gates pass or record exact failure | `bun run typecheck && bun run verify:gates` |

## Required Focused Gate

Run this after all Phase 90 plans complete:

```bash
bun test tests/lib/files.test.ts tests/commands/files.test.ts
bun run typecheck
bun run verify:gates
```

If Phase 89 tests were changed while executing Phase 90, include the Phase 89 focused files in the same final run:

```bash
bun test tests/lib/config.test.ts tests/lib/composition.test.ts tests/lib/files.test.ts tests/lib/lifecycle-files-env-config-real-fixture.test.ts tests/lib/workspace-lifecycle-create.test.ts tests/lib/workspace-ops.test.ts tests/commands/files.test.ts
```

## Non-Goals

- No stable JSON or machine-readable output validation in Phase 90; that is Phase 91.
- No lifecycle auto-pull validation in Phase 90; manual `files pull` is the command contract.
- No full manifest or baseline validation; current tree comparison is the accepted model.

