# Phase 96: Workspace Notes - Context

**Gathered:** 2026-05-17T14:42:35+02:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 96 adds lightweight operator notes for workspaces through a CLI and storage helper surface. Notes are durable workspace memory stored in git-stacks config/state, not in managed project repos and not in GSD `.planning`. This phase does not implement dashboard rendering, stale classification, cleanup recommendations, editable note documents, tags, authors, search, or JSON automation output.

</domain>

<decisions>
## Implementation Decisions

### CLI Command Shape
- **D-01:** Use `git-stacks notes add|list|clear`.
- **D-02:** Do not add `notes show`; `notes list` is the only read surface in Phase 96.
- **D-03:** Workspace is optional when it can be resolved. Resolution order should be explicit workspace argument, cwd detection, then `GS_WORKSPACE_NAME` for hook/manual-command contexts.
- **D-04:** `notes add [workspace] <text>` stores a plain-text note. Tags are out of scope for Phase 96.
- **D-05:** `notes list [workspace]` displays newest notes first with a sensible latest-N default and a way to show all notes.
- **D-06:** `notes clear [workspace]` uses interactive confirmation unless `--force` is passed.

### Storage and Record Format
- **D-07:** Store notes as JSONL per workspace, likely under `~/.config/git-stacks/notes/<workspace>.jsonl`.
- **D-08:** Each JSONL record stores only `text` and `created`; the workspace is defined by the per-workspace file path.
- **D-09:** Append records oldest-to-newest on disk.
- **D-10:** Display notes newest-first.
- **D-11:** `notes clear` deletes the per-workspace notes file rather than truncating it.
- **D-12:** Malformed JSONL fails clearly and does not mutate. `list`, `clear`, and `add` should report the parse problem instead of skipping bad lines or appending to a corrupt file.

### Notes Versus Messages
- **D-13:** Notes and messages are separate user-facing concepts.
- **D-14:** Notes may reuse the JSONL/storage style from messages, but not message IPC or notification semantics.
- **D-15:** `notes add` does not push anything to the dashboard socket in Phase 96.
- **D-16:** Do not add sender, author, clear-by-sender, text search, or filtering behavior in Phase 96.

### TUI Summary Contract
- **D-17:** Phase 96 should expose a reusable data helper for later TUI use, not a TUI component.
- **D-18:** The helper should expose a summary containing note `count` plus the latest note's `created` and `text`.
- **D-19:** Notes should appear only on the workspace details page in future TUI work, not as list-row badges or a dashboard-wide panel.
- **D-20:** Empty or cleared notes return a zero-summary. Malformed note storage returns an error state so later TUI work can surface a clear warning.

### The Agent's Discretion
- Planner may choose exact helper names and output formatting, but should keep the first implementation narrow: add/list/clear, per-workspace JSONL, plain text, no tags, no authors, no search, no IPC.

### Folded Todos
- **Add workspace notes** (`.planning/todos/pending/2026-05-15-add-workspace-notes.md`): The original seed requested short durable workspace memory such as why a workspace exists, what is blocked, or what an agent should know before entering it. Phase 96 folds the CLI/storage subset and defers TUI display to later phases.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Scope
- `.planning/PROJECT.md` - Current v0.19.0 milestone goal and workspace notes target feature.
- `.planning/REQUIREMENTS.md` - NOTE-01, NOTE-02, NOTE-03 context, and explicit out-of-scope boundaries.
- `.planning/ROADMAP.md` - Phase 96 goal and success criteria.
- `.planning/STATE.md` - Current phase state and milestone continuity.
- `.planning/todos/pending/2026-05-15-add-workspace-notes.md` - Folded todo seed and example CLI shape.

### Existing Implementation Patterns
- `src/lib/messages.ts` - Existing per-workspace JSONL append/list/clear behavior for workspace messages. Reuse storage lessons, not IPC semantics.
- `src/commands/message.ts` - Existing top-level command shape and workspace resolution style for workspace-scoped records.
- `src/lib/paths.ts` - Config directory constants and `GIT_STACKS_CONFIG_DIR` override pattern. Add a notes directory constant here or follow the same path pattern.

### Relevant Tests
- `tests/lib/messages.test.ts` - JSONL append, reverse listing, clear, and isolated config-dir patterns.
- `tests/commands/message.test.ts` - CLI behavior for workspace-scoped message commands.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/paths.ts`: Defines `WS_CONFIG_DIR` and `MESSAGES_DIR`; notes should use the same config-root and test-isolation model.
- `src/lib/messages.ts`: Provides a compact JSONL storage precedent, including append, list newest-first, clear, and synchronous list variants.
- `src/commands/message.ts`: Provides a small top-level command family with workspace-scoped add/list/clear-style behavior.
- Existing cwd detection helpers in `src/lib/env.ts` / workspace command code: Reuse for optional workspace resolution where possible.

### Established Patterns
- Workspace-scoped metadata lives under `~/.config/git-stacks/`, not in managed project repos.
- `GIT_STACKS_CONFIG_DIR` is the test isolation boundary for config-backed metadata.
- Messages use JSONL and reverse display order, but notes must remain separate from message IPC and notification semantics.
- Destructive low-friction commands sometimes clear without confirmation, but notes are more durable than messages and should confirm unless `--force`.

### Integration Points
- Add a `NOTES_DIR` path or equivalent notes path helper.
- Add a note storage module for append/list/clear/summary and malformed-store handling.
- Register `git-stacks notes` as a top-level command family.
- Future Phase 98 dashboard work should consume the Phase 96 summary helper and place notes only in workspace details.

</code_context>

<specifics>
## Specific Ideas

Example CLI:

```bash
git-stacks notes add my-feature "Waiting on API schema decision"
git-stacks notes add "Blocked on review"
git-stacks notes list my-feature
git-stacks notes list --all my-feature
git-stacks notes clear my-feature
git-stacks notes clear --force my-feature
```

Example JSONL record:

```json
{"text":"Waiting on API schema decision","created":"2026-05-17T12:42:35.000Z"}
```

Summary helper shape can be decided by planner, but should carry the equivalent of:

```ts
{
  count: number,
  latest: null | { created: string, text: string },
  error?: string
}
```

</specifics>

<deferred>
## Deferred Ideas

- Tags are deferred despite NOTE-02 mentioning optional lightweight tags.
- `notes show` is deferred/omitted; `list` is the only read surface for this phase.
- Authors/senders, clear-by-sender, text search, and filtering are deferred.
- Dashboard rendering is deferred to Phase 98. Phase 96 only exposes the data helper and summary contract.
- Stale/cleanup advisory use of notes remains deferred; this phase only makes notes available.

</deferred>

---

*Phase: 96-Workspace Notes*
*Context gathered: 2026-05-17T14:42:35+02:00*
