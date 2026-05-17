# Phase 96: Workspace Notes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-17T14:42:35+02:00
**Phase:** 96-Workspace Notes
**Areas discussed:** CLI command shape, Storage and record format, Notes versus messages, TUI summary contract

---

## CLI Command Shape

| Option | Description | Selected |
|--------|-------------|----------|
| `git-stacks notes add|list|show|clear` | Plural top-level notes command. | yes |
| `git-stacks note add|list|show|clear` | Singular top-level command. | |
| `git-stacks workspace notes ...` | Nested under workspace. | |

**User's choice:** Use `git-stacks notes`.
**Notes:** Final surface removes `show`, so the command family is `notes add|list|clear`.

| Option | Description | Selected |
|--------|-------------|----------|
| Optional workspace with cwd detection | Workspace can be omitted when current directory identifies it. | yes |
| Workspace always required | Always pass workspace name. | |
| Optional only for reads | Require workspace for add and clear. | |

**User's choice:** Workspace optional through cwd detection.
**Notes:** Later discussion also included `GS_WORKSPACE_NAME` fallback for hook/manual-command contexts.

| Option | Description | Selected |
|--------|-------------|----------|
| `--tag <tag...>` | Store optional tags. | |
| No tags in Phase 96 | Store plain text only. | yes |
| Inline `#tag` parsing | Parse tags from note text. | |

**User's choice:** No tags in Phase 96.
**Notes:** Keep this slice narrow even though NOTE-02 allows optional tags.

| Option | Description | Selected |
|--------|-------------|----------|
| `list` compact, `show` full entries | Keep both read commands. | |
| `list` and `show` aliases | Redundant read commands. | |
| `show` latest only | Show only latest note. | |
| Remove `show` | Use `list` as the only read surface. | yes |

**User's choice:** Remove `show`; only `list` reads notes.
**Notes:** `list` should have a limit and a way to show all notes.

| Option | Description | Selected |
|--------|-------------|----------|
| Add `--limit <n>` with default | Latest-N default and way to show all. | yes |
| Always list all notes | Show every note every time. | |
| Latest note only by default | Too narrow for a notes command. | |

**User's choice:** Latest-N default with a way to show all.
**Notes:** Exact default value can be set during planning.

| Option | Description | Selected |
|--------|-------------|----------|
| Require `--force` | Non-interactive destructive clear only. | |
| Clear immediately | No confirmation. | |
| Confirm unless `--force` | Prompt interactively, allow forced non-interactive clear. | yes |

**User's choice:** Interactive confirmation unless `--force`.
**Notes:** Notes are more durable operator memory than notifications.

---

## Storage and Record Format

| Option | Description | Selected |
|--------|-------------|----------|
| JSONL per workspace | `notes/<workspace>.jsonl`. | yes |
| YAML per workspace | Human-editable structured file. | |
| One global JSONL file | All workspace notes in one file. | |

**User's choice:** JSONL per workspace.
**Notes:** Follows the append-only record model and the existing message storage style.

| Option | Description | Selected |
|--------|-------------|----------|
| `text`, `created` | Filename defines workspace. | yes |
| `workspace`, `text`, `created` | Self-contained but redundant. | |
| `id`, `text`, `created` | Future mutation identity. | |

**User's choice:** `text` and `created` only.
**Notes:** User pointed out workspace is already defined by the file path.

| Option | Description | Selected |
|--------|-------------|----------|
| Truncate file | Leave empty note file in place. | |
| Delete file | Remove workspace note file. | yes |
| Rename/archive file | Preserve cleared data elsewhere. | |

**User's choice:** Delete the per-workspace notes file on clear.
**Notes:** Empty and never-created both produce zero-summary.

| Option | Description | Selected |
|--------|-------------|----------|
| Fail clearly and do not mutate | Report corruption for list/add/clear. | yes |
| Skip malformed lines | Show valid notes only. | |
| Move malformed file aside | Auto-recover by renaming. | |

**User's choice:** Fail clearly and do not mutate.
**Notes:** Avoid hiding corruption or appending to a malformed store.

| Option | Description | Selected |
|--------|-------------|----------|
| Append oldest-to-newest, display newest-first | Natural JSONL append with useful display order. | yes |
| Append and display oldest-first | Chronological display. | |
| Store newest-first by rewriting | Poor fit for append-only. | |

**User's choice:** Append oldest-to-newest, display newest-first.

---

## Notes Versus Messages

| Option | Description | Selected |
|--------|-------------|----------|
| Separate concepts, shared storage pattern only | Notes are durable memory; messages are notifications. | yes |
| Treat notes as persistent messages | Reuse more message behavior. | |
| Replace messages with notes over time | Broader redesign. | |

**User's choice:** Separate concepts.
**Notes:** Notes can reuse JSONL/storage ideas but not message IPC or notification semantics.

| Option | Description | Selected |
|--------|-------------|----------|
| No socket push | TUI reads from storage later. | yes |
| Push note-added event | Live dashboard notification. | |
| Reuse socket conditionally | Hidden coupling to dashboard runtime. | |

**User's choice:** No socket push in Phase 96.

| Option | Description | Selected |
|--------|-------------|----------|
| Same workspace resolution fallback | Explicit workspace, cwd, then `GS_WORKSPACE_NAME`. | yes |
| Cwd detection only | No hook/manual-command fallback. | |
| Explicit workspace only from scripts | Require workspace in scripted contexts. | |

**User's choice:** Use the same workspace resolution fallback where appropriate.

| Option | Description | Selected |
|--------|-------------|----------|
| No sender/filter behavior | Plain text records only; clear all notes. | yes |
| Add author/from fields | More metadata like messages. | |
| Add text search/filter | Query notes. | |

**User's choice:** No sender, author, search, or filtering in Phase 96.

---

## TUI Summary Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Count plus latest note | Summary has count and latest note. | yes |
| Count only | Stable but less useful. | |
| Latest note only | Hides whether more notes exist. | |

**User's choice:** Count plus latest note.
**Notes:** Notes should appear only on the workspace details page in later TUI work.

| Option | Description | Selected |
|--------|-------------|----------|
| Reusable data helper only | Phase 98 owns dashboard placement. | yes |
| Add a tiny TUI component now | Crosses the phase boundary. | |
| No helper; CLI only | Risks duplicate parsing later. | |

**User's choice:** Reusable data helper only.

| Option | Description | Selected |
|--------|-------------|----------|
| Empty zero-summary, malformed error state | Distinguish no notes from corruption. | yes |
| Both return zero-summary | Hide corruption. | |
| Malformed throws only | Push error handling into callers. | |

**User's choice:** Empty or cleared notes return zero-summary; malformed notes return an error state.

---

## The Agent's Discretion

- Exact helper names, output formatting, and latest-N default are left to planning.

## Deferred Ideas

- Tags.
- `notes show`.
- Authors/senders, clear-by-sender, text search, and filtering.
- TUI rendering and dashboard placement.
- Stale/cleanup advisory use of notes.
