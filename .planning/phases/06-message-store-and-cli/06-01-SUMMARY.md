---
plan: 06-01
phase: 06-message-store-and-cli
status: complete
completed: 2026-03-19
---

# Plan 06-01 Summary: Message Store Foundation

## What was built

- `src/lib/paths.ts`: Added `MESSAGES_DIR = join(WS_CONFIG_DIR, "messages")` export
- `src/lib/messages.ts`: JSONL store helpers + IPC push function
  - `MessageRecord` interface (workspace, text, from?, timestamp)
  - `appendMessage(ws, text, from?)` — O_APPEND write via node:fs/promises appendFile
  - `listMessages(ws)` — returns newest-first, [] when file absent
  - `clearMessages(ws, fromSender?)` — truncate all or filter by sender
  - `pushToSocket(record)` — best-effort Unix socket IPC, 50ms timeout, never throws
- `tests/lib/messages.test.ts`: 13 tests covering all behaviors

## Verification passed
- bun run typecheck: 0 errors
- bun test tests/lib/messages.test.ts: all tests pass
- bun test tests/: full suite clean

## Implementation notes

The test file uses static top-level imports (matching the established codebase pattern in
workspace-ops.test.ts and config.test.ts) with unique per-run workspace name prefixes
(`_msgtest-*`) to avoid cross-test interference. The afterEach hook removes only
`_msgtest-*` prefixed files from MESSAGES_DIR. This approach is required because Bun
caches modules across test files, so `paths.ts` constants (computed via `homedir()` at
load time) cannot be overridden by mutating `process.env.HOME` after the module is loaded.
