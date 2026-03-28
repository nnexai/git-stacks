# Phase 37: Agent Path Discovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 37-Agent Path Discovery
**Areas discussed:** Output format details, Filtering options

---

## Output format details

### Prefix delimiter

| Option | Description | Selected |
|--------|-------------|----------|
| Space-separated | `--add-dir /home/user/path` -- standard CLI convention, works with xargs | ✓ |
| Equals-separated | `--add-dir=/home/user/path` -- single token, no quoting needed | |
| You decide | Claude picks based on agent CLI conventions | |

**User's choice:** Space-separated
**Notes:** Standard CLI convention, matches xargs and shell expansion patterns.

### Path quoting

| Option | Description | Selected |
|--------|-------------|----------|
| No quoting | Raw paths, caller handles quoting, works with xargs -d'\n' | ✓ |
| Shell-quote when needed | Paths with spaces wrapped in single quotes | |
| NUL-delimited (--print0) | Optional --print0 flag like find(1) | |

**User's choice:** No quoting
**Notes:** Matches how git outputs paths. Simpler for programmatic consumption.

### JSON output

| Option | Description | Selected |
|--------|-------------|----------|
| No JSON flag | Keep minimal -- agents use git-stacks list --json for structured data | ✓ |
| Add --json flag | Outputs [{name, path, mode},...] | |

**User's choice:** No JSON flag
**Notes:** Avoids overlap with existing list command.

---

## Filtering options

### Mode filter

| Option | Description | Selected |
|--------|-------------|----------|
| No filter | Output all repos, agents typically want all paths | |
| --filter worktree\|trunk | Filter to only worktree or trunk repos | ✓ |
| You decide | Claude picks based on agent usage patterns | |

**User's choice:** --filter worktree|trunk
**Notes:** User specified `--filter` as the flag name (not `--mode`).

### Repo name filter

| Option | Description | Selected |
|--------|-------------|----------|
| No --repo flag | All repos emitted, agents can grep | ✓ |
| Add --repo <name> | Output only the named repo's path | |

**User's choice:** No --repo flag
**Notes:** Keep interface minimal.

---

## Claude's Discretion

- Exit code strategy
- Stderr warning format for skipped repos
- `--filter` application order relative to path resolution

## Deferred Ideas

None -- discussion stayed within phase scope
