# Quick Task 260406-tis Summary

**Template-based workspace creation now snapshots template labels in the shared creation path, so template labels persist for wizard and dashboard flows without caller-specific merging.**

## Accomplishments
- Centralized template-label propagation in `createWorkspace()` instead of relying on UI callers.
- Added shared regression tests covering composed-template labels, caller-label unioning, and deduplication.
- Removed redundant wizard-side ownership of template-label persistence.

## Files Modified
- `src/lib/workspace-lifecycle.ts` - resolves template labels via `composeTemplates()` when needed and unions them with caller labels exactly once.
- `src/tui/workspace-wizard.ts` - passes only user-entered labels into the shared creation path.
- `tests/lib/workspace-lifecycle-create.test.ts` - locks the shared contract for template-only labels, composed labels, and deduplicated unions.

## Validation
- `bun run typecheck`
- `bun test tests/lib/workspace-lifecycle-create.test.ts`
- `bun test tests/tui/workspace-wizard.test.ts`
- `bun test tests/tui/dashboard/integ-wizard.test.tsx`
- `bun run test`

## Notes
- No task commit was created in this session because the repository already had unrelated in-flight changes; `STATE.md` records this quick task as `uncommitted`.
