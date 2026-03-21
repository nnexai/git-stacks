---
phase: 09-ipc-push-message-display
plan: 03
subsystem: ui
tags: [solidjs, opentui, ipc, unix-socket, keyboard, overlay]

requires:
  - phase: 09-ipc-push-message-display/01
    provides: "messageUtils (groupBySender, formatAge, isStale), useMessages hook, UIView messages variant"
  - phase: 09-ipc-push-message-display/02
    provides: "WorkspaceRow message preview, WorkspaceDetail live message list, App.tsx hook wiring"
provides:
  - "MessageOverlay full-screen component with grouped sender display and cursor navigation"
  - "m key handler in App.tsx for opening message overlay"
  - "IPC socket status indicator in help bar"
  - "Live IPC push with socket data handler fix"
  - "Reactive timer refresh for relative time display"
  - "Synchronous message reload for R key"
affects: [dashboard, ipc]

tech-stack:
  added: []
  patterns:
    - "Reactive functions in <For> callbacks — const focused = () => expr instead of const focused = expr"
    - "Synchronous file reads (listMessagesSync) for immediate signal updates before concurrent re-renders"
    - "Tick signal pattern for periodic re-evaluation of time-dependent computed values"

key-files:
  created:
    - src/tui/dashboard/MessageOverlay.tsx
  modified:
    - src/tui/dashboard/App.tsx
    - src/tui/dashboard/HelpOverlay.tsx
    - src/tui/dashboard/hooks/useMessages.ts
    - src/tui/dashboard/run.tsx
    - src/tui/dashboard/WorkspaceDetail.tsx
    - src/tui/dashboard/WorkspaceRow.tsx
    - src/tui/dashboard/WorkspaceList.tsx
    - src/lib/messages.ts

key-decisions:
  - "Expose msgMap signal directly instead of opaque messagesFor function — ensures JSX transform creates reactive getters"
  - "Synchronous message reload (readFileSync) for R key — async loadAll caused race with concurrent reload()"
  - "30s tick timer both reloads JSONL files and bumps tick signal for time refresh"
  - "Always unlink stale socket on startup — eliminates hang-prone Bun.connect probe"
  - "Added data() no-op handler to pushToSocket client — required by Bun socket API"
  - "IPC status icon (filled/hollow circle) in help bar for socket health monitoring"
  - "Reduced detail pane messages from 10 to 3 — prevents overflow, full list via m overlay"

patterns-established:
  - "SolidJS <For> reactivity: use const fn = () => expr (function) not const val = expr (constant) for signal-dependent values in <For> callbacks"
  - "Bun.connect requires data callback even for write-only clients"
  - "OpenTUI provides lowercase key.name — never match uppercase characters"

requirements-completed: [MSG-12]

duration: 45min
completed: 2026-03-20
---

# Plan 03: MessageOverlay + IPC Fixes Summary

**Full-screen message overlay with grouped sender display, j/k navigation, per-sender clear, and 7 bug fixes for IPC, reactivity, and keyboard handling**

## Performance

- **Duration:** ~45 min (including iterative bug fixes with user testing)
- **Tasks:** 2/2 auto tasks + 1 human-verify checkpoint (passed after fixes)
- **Files modified:** 10

## Accomplishments
- MessageOverlay component with sender grouping, cursor navigation (j/k/arrows), c clear action
- Fixed IPC socket: missing data() handler in pushToSocket prevented all live messages
- Fixed R key: OpenTUI provides lowercase key names, "R" never matched
- Fixed SolidJS reactivity: opaque messagesFor function didn't create reactive JSX getters
- Fixed overlay navigation: const in <For> callback never re-evaluated
- Added 30s tick timer for message file reload and relative time refresh
- IPC status icon in help bar for socket health monitoring

## Task Commits

1. **Task 1: Create MessageOverlay component** - `3deb389`
2. **Task 2: Wire m key handler and update HelpOverlay** - `457d66c`

**Bug fix commits (from human-verify checkpoint):**
- `a55ed05` — Fix message reactivity, overlay navigation, detail overflow, timer
- `b6083d4` — Reactive timer refresh, socket stale handling, age updates
- `dda100f` — Synchronous message reload on R, debug indicators
- `588799d` — Fix R key (lowercase key names)
- `4364267` — Add missing data handler to pushToSocket client
- `e945ba9` — Replace debug text with IPC status icon

## Files Created/Modified
- `src/tui/dashboard/MessageOverlay.tsx` — Full-screen grouped message overlay with scroll viewport
- `src/tui/dashboard/App.tsx` — m key handler, messagesOpen signal, overlay rendering, IPC icon
- `src/tui/dashboard/HelpOverlay.tsx` — Added m=Messages key binding
- `src/tui/dashboard/hooks/useMessages.ts` — Exposed msgMap signal, sync reload, tick timer, ipcCount
- `src/tui/dashboard/run.tsx` — Simplified socket stale detection, socketStatus export
- `src/tui/dashboard/WorkspaceDetail.tsx` — Reactive age functions, reduced to 3 messages
- `src/tui/dashboard/WorkspaceRow.tsx` — tick prop for periodic time refresh
- `src/tui/dashboard/WorkspaceList.tsx` — allMessages Map prop instead of function
- `src/lib/messages.ts` — listMessagesSync, data() handler in pushToSocket, 500ms IPC timeout

## Decisions Made
- Exposed raw `msgMap` signal to ensure SolidJS/OpenTUI JSX transform creates reactive getters
- Used synchronous file reads for R key to avoid race with concurrent workspace reload
- Simplified socket stale detection to always-unlink (previous Bun.connect probe could hang)
- Added `data()` no-op to pushToSocket (Bun requires it for socket connect)

## Deviations from Plan

### Auto-fixed Issues

**1. OpenTUI lowercase key names**
- **Found during:** Human verification
- **Issue:** `key.name === "R"` never matched — OpenTUI provides "r" not "R"
- **Fix:** Changed to `key.name === "r"`

**2. SolidJS reactivity through opaque functions**
- **Found during:** Human verification
- **Issue:** `messagesFor` function passed as prop didn't create reactive JSX getters
- **Fix:** Exposed `msgMap` signal directly, read in JSX expressions

**3. Non-reactive <For> callback variables**
- **Found during:** Human verification
- **Issue:** `const focused = expr` in <For> callback evaluated once, never updated
- **Fix:** Changed to `const focused = () => expr` (reactive function)

**4. Missing Bun socket data handler**
- **Found during:** Human verification
- **Issue:** pushToSocket's Bun.connect missing required `data()` callback — silently dropped all IPC
- **Fix:** Added `data() {}` no-op handler

**5. Socket stale detection hang**
- **Found during:** Human verification (user killed terminals during freezes)
- **Issue:** Bun.connect probe had no timeout, could hang on stale socket files
- **Fix:** Simplified to always unlink + rebind

---

**Total deviations:** 5 auto-fixed during checkpoint verification
**Impact on plan:** All fixes necessary for correct functionality. Core feature (MessageOverlay) was implemented as planned; bugs were in integration layer.

## Issues Encountered
- OpenTUI's keyboard API returns lowercase key names — undocumented, discovered through user testing
- SolidJS <For> callbacks run once per item — signal-dependent values must be functions, not constants
- Bun Unix socket API requires data() handler even for write-only clients — undocumented requirement

## Next Phase Readiness
- MSG-11 and MSG-12 fully implemented and verified
- IPC push working end-to-end with socket status monitoring
- All existing tests pass (193/193)

---
*Phase: 09-ipc-push-message-display*
*Completed: 2026-03-20*
