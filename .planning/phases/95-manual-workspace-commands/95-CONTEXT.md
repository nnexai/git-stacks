# Phase 95: Manual Workspace Commands - Context

**Gathered:** 2026-05-17T14:23:54+02:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 95 adds named, manually triggered workspace commands that live in template and workspace YAML. Users can list commands and run a resolved command group explicitly. This phase does not add notes, TUI actions, stale cleanup, JSON automation output, or a broader web/forge opening surface.

</domain>

<decisions>
## Implementation Decisions

### YAML Command Shape
- **D-01:** Use a string-valued command map: `commands.<name>: <shell command>`.
- **D-02:** The same shape exists at template/workspace level and on each repo entry.
- **D-03:** Do not add `description`, `cwd`, `repo`, `scope`, `env`, or object-valued command entries in Phase 95.
- **D-04:** Location implies cwd: workspace-level commands run at the workspace root; repo-level commands run in that repo path.
- **D-05:** When the same command name exists at workspace and repo levels, running the command executes the workspace-level entry first, then matching repo-level entries in workspace repo order.

### Template and Workspace Resolution
- **D-06:** Template commands are copied into workspace YAML, not dynamically resolved from the template at run time.
- **D-07:** Command inheritance should follow existing copied/snapshotted template behavior for hooks, env, files, and ports.
- **D-08:** Command name collisions in copied YAML are last-write-wins. A workspace-level command edit replaces the copied workspace-level command. Repo-level commands remain separate because they live on repo entries.
- **D-09:** Support npm-style `pre<name>` and `post<name>` conventions for command groups.
- **D-10:** For `verify`, execution order is all resolved `preverify` entries, then all resolved `verify` entries, then all resolved `postverify` entries. Within each bucket, run workspace-level entry first, then repo-level entries in workspace repo order.
- **D-11:** `pre<name>` and `post<name>` entries are normal commands. Users may run them directly by name.

### CLI Surface and Inspection
- **D-12:** Expose manual commands through `git-stacks command`, not by extending existing `git-stacks run`.
- **D-13:** The Phase 95 surface is `git-stacks command list [workspace]` and `git-stacks command run [workspace] <command>`.
- **D-14:** Workspace can be omitted when it can be detected from cwd. Support `git-stacks command run verify` inside a workspace/repo and `git-stacks command run my-ws verify` from anywhere.
- **D-15:** `list` shows main commands by default and hides `pre*`/`post*` convention commands.
- **D-16:** Add `--all` to `list` so users can inspect hidden `pre*`/`post*` commands. Use the same default later when this command list is surfaced in the TUI.
- **D-17:** Do not add a separate `show` command. Use `git-stacks command run --dry-run [workspace] <command>` as the inspection path.
- **D-18:** `run --dry-run` displays the full resolved execution plan in actual run order, including bucket, workspace/repo level, cwd, and shell command. It does not execute shell.
- **D-19:** JSON output is out of scope for Phase 95.

### Execution and Output Semantics
- **D-20:** Running a command name runs the resolved group. Do not add selective `--repo` or `--workspace-only` execution in Phase 95.
- **D-21:** Execution stops on the first failed entry and exits with that command's status.
- **D-22:** Output streams directly to the terminal, like hooks and the current single-command `git-stacks run` behavior. Do not capture or summarize output in Phase 95.
- **D-23:** Manual commands resolve workspace env, secrets, and ports by default.
- **D-24:** Add `--skip-secrets` to manual command execution.
- **D-25:** Set `GS_TRIGGERED_BY=command:<name>` for manual command execution.

### The Agent's Discretion
- Planner may decide exact helper names and module boundaries, but should reuse existing schema, composition, env, lifecycle, cwd detection, and command-output patterns.

### Folded Todos
- **Add manual workspace commands** (`.planning/todos/pending/2026-05-15-add-manual-workspace-commands.md`): The original seed requested manually triggered template/workspace commands that reuse hook execution, cwd, environment, ports, and secrets machinery. Phase 95 folds this idea with a narrower string-map YAML shape and `git-stacks command list|run` CLI surface.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Scope
- `.planning/PROJECT.md` - Current v0.19.0 milestone goal and recent shipped context.
- `.planning/REQUIREMENTS.md` - WCMD-01 through WCMD-04 and out-of-scope boundaries.
- `.planning/ROADMAP.md` - Phase 95 goal and success criteria.
- `.planning/STATE.md` - Current phase state and milestone continuity.
- `.planning/todos/pending/2026-05-15-add-manual-workspace-commands.md` - Folded todo seed and example use cases.

### Existing Implementation Patterns
- `src/lib/config.ts` - Zod schemas for Template, Workspace, and WorkspaceRepo where command maps should be added.
- `src/lib/composition.ts` - Existing template merge behavior for copied/snapshotted fields.
- `src/lib/lifecycle.ts` - Existing shell execution with inherited or piped output and injectable executor seam.
- `src/lib/workspace-env.ts` - Workspace env, ports, repo env, and secret-resolution behavior to reuse.
- `src/commands/workspace.ts` - Existing `git-stacks run`, cwd detection-adjacent command patterns, and human output style.

### Relevant Tests
- `tests/commands/run-parallel.test.ts` - Current `git-stacks run` behavior and JSON/non-JSON output constraints.
- `tests/commands/workspace-execution-context.test.ts` - Hook env and cwd execution context expectations.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TemplateSchema`, `WorkspaceSchema`, and `WorkspaceRepoSchema` in `src/lib/config.ts`: Add the `commands` string map at template/workspace and repo levels.
- `composeTemplates()` in `src/lib/composition.ts`: Extend template composition so command maps follow the locked snapshot/copy behavior.
- `buildWorkspaceEnv()` and `buildRepoEnv()` in `src/lib/workspace-env.ts`: Reuse for env, ports, secrets, repo path, and `GS_TRIGGERED_BY` construction.
- `runHooks()` in `src/lib/lifecycle.ts`: Reuse or mirror the direct streaming subprocess behavior and failure propagation.
- `detectRepoFromCwd()` and existing workspace argument patterns: Use for optional workspace detection from cwd.

### Established Patterns
- YAML config uses Zod schemas as the single source of truth and validates on read.
- Template composition merges fields in deterministic order and produces a resolved template that is copied into workspace creation flows.
- Expected command failures are surfaced with clear CLI errors and non-zero process exits.
- Existing `git-stacks run` has an ambiguous second positional argument for repo, so manual commands need a separate `git-stacks command` family.

### Integration Points
- Add command registration near the existing workspace command family in `src/index.ts` / `src/commands`.
- Workspace creation and template-sync paths must copy command maps into workspace YAML consistently with hooks/env/files.
- Tests should cover schema parsing, template/workspace copy behavior, command resolution order, cwd/env/secrets, dry-run inspection, hidden pre/post list defaults, direct pre/post execution, and first-failure exit behavior.

</code_context>

<specifics>
## Specific Ideas

Example shape:

```yaml
commands:
  verify: bun run verify
  preverify: echo preparing
  postverify: echo done

repos:
  - name: api
    commands:
      verify: bun test
```

Example commands:

```bash
git-stacks command list my-ws
git-stacks command list --all my-ws
git-stacks command run --dry-run my-ws verify
git-stacks command run my-ws verify
git-stacks command run verify
```

</specifics>

<deferred>
## Deferred Ideas

- JSON output for command list, dry-run plans, or real run results is deferred until an automation or TUI need makes a machine-readable contract worth locking.
- Selective execution such as `--repo <name>` or `--workspace-only` is deferred. Phase 95 runs the resolved command group for the requested name.
- TUI surfacing is not implemented in Phase 95, but future TUI command lists should use the same main-command default and hide `pre*`/`post*` unless explicitly showing all.

</deferred>

---

*Phase: 95-Manual Workspace Commands*
*Context gathered: 2026-05-17T14:23:54+02:00*
