# Deferred Items — Phase 24

## Pre-existing Issues Found During Execution

### TS6133: openTmuxSession declared but never read in tests/lib/tmux.test.ts

- **Found during:** Phase 24-02 Task 2
- **File:** tests/lib/tmux.test.ts line 17
- **Issue:** `openTmuxSession` is destructured from the module but never used in any test
- **Impact:** Pre-existing `bun run typecheck` warning (exit code 2)
- **Action required:** Remove `openTmuxSession` from the destructure on line 17 of tests/lib/tmux.test.ts
- **Out of scope:** Not caused by Phase 24-02 changes (import switching)
