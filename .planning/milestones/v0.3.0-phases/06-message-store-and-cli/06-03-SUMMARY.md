---
plan: 06-03
phase: 06-message-store-and-cli
status: complete
completed: 2026-03-19
---

# Plan 06-03 Summary: TUI Unix Socket Server

## What was built

- `src/tui/dashboard/run.tsx`: Extended with socket server lifecycle
  - `openSocketServer()`: Bun.listen on /tmp/git-stacks.sock with stale detection
  - Stale detection: probe with Bun.connect — ECONNREFUSED = stale, remove + rebind; alive = skip
  - `server.unref()` prevents socket from pinning event loop
  - Socket cleanup in `onDestroy` callback (not after `await render`)
  - `export let onIpcMessage` — mutable callback for Phase 9 to wire in

## Implementation notes

- Import path for `MessageRecord` is `../../lib/messages` (two levels up from `src/tui/dashboard/`), not `../lib/messages` as written in the plan template. The plan's interface section showed the correct module location (`src/lib/messages.ts`) and the corrected path resolves correctly.

## Verification passed
- bun run typecheck: 0 errors
- All grep checks: SOCKET_PATH, onDestroy, server.unref, onIpcMessage present
- bun test tests/: full suite clean (159 pass, 0 fail)
