# Deferred Items

## Out-of-scope typecheck failures after Plan 01

- **Found during:** Post-wave gate after `82.1-01`
- **Command:** `bun run test && bun run typecheck`
- **Status:** `bun run test` passed; `bun run typecheck` failed.
- **Files:** `tests/commands/repo-add.test.ts`, `tests/tui/workspace-clone.test.ts`
- **Reason deferred:** These files were not modified by Plan 01 and the failures are outside the current task scope.
- **Error summary:**
  - `tests/commands/repo-add.test.ts`: mock return types infer `never[]` and prompt-call tuple indexing is not type-safe.
  - `tests/tui/workspace-clone.test.ts`: predicate type narrows to `"source" | "dest"` where `"source"` is expected.
