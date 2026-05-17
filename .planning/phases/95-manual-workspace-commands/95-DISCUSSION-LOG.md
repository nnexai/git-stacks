# Phase 95: Manual Workspace Commands - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-17T14:23:54+02:00
**Phase:** 95-Manual Workspace Commands
**Areas discussed:** YAML command shape, Template/workspace resolution, CLI surface and inspection, Execution and output semantics

---

## YAML Command Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Object only | Command entries use `command` plus optional metadata. | |
| Shorthand string plus object | Simple commands may be strings, complex commands objects. | |
| Array of command objects | Named commands become multi-step arrays. | |
| String-valued command map | Use `commands.<name>: <shell command>`. | yes |

**User's choice:** Reduce to a string-valued command map because the only required field is the shell command.
**Notes:** Commands can exist at workspace/template level and repo level. Cwd is implicit from location. Same names form an ordered group.

| Option | Description | Selected |
|--------|-------------|----------|
| Workspace first, then repos | Run workspace-level entry before matching repo-level entries in workspace repo order. | yes |
| Repos first, then workspace | Run repo entries before workspace entry. | |
| Require explicit level on duplicates | Force users to disambiguate. | |

**User's choice:** Workspace first, then repos in workspace repo order.
**Notes:** No `description`, `cwd`, `repo`, `scope`, or per-command `env` fields in Phase 95.

---

## Template/workspace Resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Copy into workspace | Template commands are copied into workspace YAML at creation/sync time. | yes |
| Dynamically resolve from template | Template edits affect existing workspaces at run time. | |
| Split behavior | Copy workspace-level commands but dynamically resolve repo-level commands. | |

**User's choice:** Copy commands into workspace YAML.
**Notes:** This matches existing snapshot behavior for template-derived workspace fields.

| Option | Description | Selected |
|--------|-------------|----------|
| Whole-group pre/post | Run all `pre<name>` entries, then all main entries, then all `post<name>` entries. | yes |
| Per-location pre/post | Run pre/main/post for workspace, then pre/main/post per repo. | |
| Workspace pre/post wraps repos | Workspace pre and post surround repo command execution. | |

**User's choice:** Whole-group pre/post.
**Notes:** The user suggested an npm-style convention. Within each bucket, workspace-level command runs first, then repo-level commands in workspace repo order.

| Option | Description | Selected |
|--------|-------------|----------|
| Last write wins | Workspace edits replace copied workspace-level command entries with the same name. | yes |
| Keep both | Preserve template and workspace entries. | |
| Error on duplicate names | Reject collisions. | |

**User's choice:** Last write wins in copied YAML.
**Notes:** Repo-level commands remain separate because they live on repo entries.

| Option | Description | Selected |
|--------|-------------|----------|
| Any named command is runnable | `pre<name>` and `post<name>` can be run directly. | yes |
| Hide lifecycle helpers | Pre/post commands cannot be run directly. | |
| Show but block direct run | Visible but not executable directly. | |

**User's choice:** Any named command is runnable.
**Notes:** `pre`/`post` are conventions around a base command, not hidden lifecycle-only helpers.

---

## CLI Surface and Inspection

| Option | Description | Selected |
|--------|-------------|----------|
| `git-stacks command list|show|run` | Separate top-level family. | yes |
| `git-stacks commands list|show|run` | Plural family. | |
| Extend `git-stacks run` | Reuse existing run command for named commands. | |

**User's choice:** `git-stacks command`.
**Notes:** Extending `git-stacks run` would conflict with existing `run <workspace> [repo]` behavior because the second positional already means repo.

| Option | Description | Selected |
|--------|-------------|----------|
| Optional workspace with cwd detection | Workspace can be omitted when current directory identifies it. | yes |
| Workspace always required | Always pass workspace name. | |
| Optional only for list | Require workspace for run. | |

**User's choice:** Optional workspace with cwd detection.
**Notes:** Support both `git-stacks command run verify` from inside a workspace/repo and `git-stacks command run my-ws verify` from anywhere.

| Option | Description | Selected |
|--------|-------------|----------|
| Main commands only by default | Hide `pre*` and `post*`, with `--all` to show them. | yes |
| All commands always | Always show convention commands too. | |
| Group by base command | Show base command with related pre/post entries. | |

**User's choice:** Main commands only by default, same for future TUI surfacing.
**Notes:** Add `--all` for full visibility.

| Option | Description | Selected |
|--------|-------------|----------|
| Separate `show` command | `show` displays the resolved execution plan. | |
| Replace show with `run --dry-run` | Dry-run displays the resolved execution plan. | yes |
| Both show and dry-run | Support both inspection paths. | |

**User's choice:** Replace `show` with `run --dry-run`.
**Notes:** Final CLI surface is `command list` and `command run`, with `run --dry-run` for inspection.

| Option | Description | Selected |
|--------|-------------|----------|
| No JSON in Phase 95 | Human-first output only. | yes |
| JSON for list and dry-run | Machine output for inspection only. | |
| JSON for list, dry-run, and real run | Full machine contract. | |

**User's choice:** No JSON output in Phase 95.
**Notes:** Defer machine-readable output until a later automation or TUI need.

---

## Execution and Output Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Stop on first failure | Exit with the failing command's status. | yes |
| Continue and report failures | Run all entries and summarize at end. | |
| Continue main entries only | Nuanced pre/post stop behavior. | |

**User's choice:** Stop on first failure.
**Notes:** Keeps pre/main/post semantics meaningful.

| Option | Description | Selected |
|--------|-------------|----------|
| Stream directly | Shell output inherits terminal directly. | yes |
| Capture and summarize | Buffer output and summarize. | |
| Capture failures only | Stream or capture depending on outcome. | |

**User's choice:** Stream output directly to the terminal.
**Notes:** Matches hooks and single-command `git-stacks run` behavior.

| Option | Description | Selected |
|--------|-------------|----------|
| Resolve secrets and add `--skip-secrets` | Default env matches workspace behavior with escape hatch. | yes |
| Resolve secrets without skip flag | Simpler surface. | |
| Do not resolve secrets | Avoid secret resolution for manual commands. | |

**User's choice:** Resolve env, secrets, and ports by default; add `--skip-secrets`.
**Notes:** Aligns with `open --skip-secrets`.

| Option | Description | Selected |
|--------|-------------|----------|
| No selective execution | Running a name runs the resolved group. | yes |
| Add `--repo <name>` | Run only one repo-level command. | |
| Add workspace-only and repo selectors | Full selective execution surface. | |

**User's choice:** No selective execution in Phase 95.
**Notes:** Users can define separate command names for narrower actions.

| Option | Description | Selected |
|--------|-------------|----------|
| `command:<name>` | Set `GS_TRIGGERED_BY` to the named command trigger. | yes |
| `command` | Use one generic manual-command trigger. | |
| `run` | Reuse ad hoc run naming. | |

**User's choice:** `GS_TRIGGERED_BY=command:<name>`.
**Notes:** Scripts can distinguish `command:verify` from lifecycle events and ad hoc `run`.

---

## The Agent's Discretion

- Exact helper names and module boundaries are left to the planner, provided the implementation reuses existing schema, composition, env, lifecycle, cwd detection, and CLI output patterns.

## Deferred Ideas

- JSON output for command inspection or execution.
- Selective command execution by repo or workspace-only.
- TUI surfacing beyond preserving the same list default later.
