# Phase 6: Message Store + CLI — Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the JSONL-backed message store and `git-stacks message send|list|clear` subcommand family. No TUI changes — this phase is purely the persistence layer, CLI surface, and Unix socket IPC write path. Phase 9 handles TUI display.

</domain>

<decisions>
## Implementation Decisions

### Storage (already decided — from STATE.md)

- JSONL at `~/.config/git-stacks/messages/{workspace}.jsonl` — one file per workspace
- NOT a field on WorkspaceSchema — avoids concurrent write corruption from agents
- Single global Unix socket at `/tmp/git-stacks.sock` — not per-workspace; all messages carry a `workspace` field for routing

### message list output format (Area A)

- Human-readable: tabular columns — `sender`, `text`, `timestamp` — newest-first
- `--json` supported (follows Phase 4 pattern): array of message objects
- When no messages: print `No messages for '<workspace>'.` and exit 0; `--json` returns `[]`

### Workspace auto-detection (Area B)

- Auto-detect from `WS_WORKSPACE` env var (set by hook runner in `lifecycle.ts`)
- `--workspace <name>` flag overrides on all three subcommands (send, list, clear)
- When neither is present: exit 1 with formatted error:
  ```
  error: no workspace specified
    → use --workspace <name> or run inside a workspace hook
  ```
- No interactive prompt fallback — this command is designed to be scripted

### message clear safety model (Area C)

- Always force — no confirmation prompt; messages are low-stakes and idempotent
- No `--force` flag needed (nothing to skip)
- `clear` without `--from`: clears all messages for the workspace
- `clear --from <sender>`: removes only that sender's messages, others remain

### IPC failure behavior (Area D)

- IPC is best-effort — file write is the ground truth
- Socket write failures (ECONNREFUSED, timeout, any error): silently swallowed
- `message send` always exits 0 as long as the file write succeeded
- MSG-08 applies universally: exit 0 whether TUI is running or not

### Claude's Discretion

- JSONL append strategy: `Bun.file(...).write()` append-only — no locking needed; each message is one atomic line
- Stale socket detection (MSG-10): try connect, if ECONNREFUSED unlink and rebind
- Socket message format: JSON line `{ workspace, text, from?, timestamp }` matching JSONL record shape
- IPC write timeout: ~50ms — brief enough to not block hook execution
- `message list` column widths: sender padded to 16, timestamp to 20, remainder is text

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` MSG-01–MSG-10 — full message store + CLI requirements

### Prior phase patterns to follow
- `.planning/phases/04-ux-and-execution/04-CONTEXT.md` — `formatError(message, hint?)` helper; `--json` output pattern
- `src/commands/repo.ts` — subcommand registration pattern (`repoCommand.command(...)`)
- `src/lib/paths.ts` — all path constants live here; add `MESSAGES_DIR` here

</canonical_refs>

<code_context>
## Existing Code Insights

### Integration Points
- `src/index.ts` — register `messageCommand` alongside `repoCommand`, `templateCommand`
- `src/lib/paths.ts` — add `MESSAGES_DIR = join(WS_CONFIG_DIR, "messages")` constant
- `src/lib/config.ts` — no schema changes needed (JSONL is outside the YAML config system)
- `src/commands/` — new `message.ts` following `repo.ts` pattern
- `src/lib/lifecycle.ts` — `WS_WORKSPACE` env var is already injected into hook runs; `message send` reads it

### New Files Expected
- `src/commands/message.ts` — `send`, `list`, `clear` subcommands
- `src/lib/messages.ts` — JSONL read/write/append helpers + IPC push function

### Reusable Assets
- `formatError()` from Phase 4 (`src/lib/`) — use for workspace-not-found and no-workspace errors
- `WS_CONFIG_DIR` from `src/lib/paths.ts` — parent for new `messages/` directory
- `Bun.$` / `Bun.file` — use for file ops and socket connect attempt

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-message-store-and-cli*
*Context gathered: 2026-03-19*
