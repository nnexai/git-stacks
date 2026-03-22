# Phase 26: Autocompletion & Editor Polish - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Bundle of CLI quality-of-life improvements: enhance shell autocompletion to complete `new --from <template-name>`, add `--yaml` flags to open YAML configs in $EDITOR, make `remove --force` resilient to malformed configs, and make `clean` remove the workspace folder after worktree cleanup. Also fix `close` missing from completion generator.

</domain>

<decisions>
## Implementation Decisions

### Shell Completion: `--from` targeting
- **D-01:** Add per-command flag completion override table (`COMMAND_FLAG_COMPLETIONS`) alongside global `FLAG_COMPLETIONS`. Per-command is checked first, global is fallback. Key format: `"command:--flag"` (e.g., `"new:--from": "template"`).
- **D-02:** `new --from` completes template names only. Shell default filesystem completion handles paths naturally when user types `./`, `~/`, or `/`.
- **D-03:** No completion for `message send --from` or `message clear --from` — sender names are freeform.

### Shell Completion: Missing commands
- **D-04:** Add `close` to `DYNAMIC_COMPLETIONS` map with type `"workspace"` — it was added in Phase 21 but never registered for completion.

### Editor command: `--yaml` flag
- **D-05:** Add `--yaml` flag to existing commands rather than new standalone commands:
  - `git-stacks edit <name> --yaml` — opens workspace YAML
  - `git-stacks template edit <name> --yaml` — opens template YAML
  - `git-stacks config --yaml` — opens config.yml
  - `git-stacks repo --yaml` — opens registry.yml
- **D-06:** After $EDITOR closes, validate the file against its Zod schema and warn if invalid. Reuse existing `editWorkspaceYaml()` pattern from `workspace-ops.ts`.
- **D-07:** Don't print the file path before opening — editors clear the screen so it wouldn't be visible.

### Clean: workspace folder removal
- **D-08:** `clean` now also deletes the `tasks/{name}/` directory after worktree removal. This is a behavior change from current (which leaves the directory).
- **D-09:** Without `--force`: separate confirmation prompt AFTER worktree removal — "Delete workspace folder tasks/{name}/?" as a second prompt (first prompt is existing "Remove all worktrees?" confirmation).
- **D-10:** With `--force`: both confirmations skipped, folder deleted automatically.

### Remove: full cleanup
- **D-11:** `remove` now also deletes the `tasks/{name}/` directory — full removal of worktrees, folder, and config YAML.
- **D-12:** `remove --force` with malformed/unparseable YAML: don't try to parse or do targeted worktree cleanup. Just `rm -rf` the `tasks/{name}/` directory (derived from workspace name by convention) and delete the YAML file. `doctor` handles orphaned worktree discovery.

### Lifecycle mental model (reinforced)
- **D-13:** close < clean < remove. Close keeps everything. Clean removes worktrees + folder but keeps config and branches. Remove removes everything.

### Claude's Discretion
- Shell completion generator internals for per-command flag override lookup
- $EDITOR spawning mechanics (fallback to `vi` if unset, etc.)
- Zod validation error formatting for post-edit warnings
- How to derive `tasks/{name}/` path in the malformed-YAML codepath

</decisions>

<specifics>
## Specific Ideas

- From user's original note: "remove --force of a workspace should delete the folder and configuration - even if the config is incomplete"
- From user's original note: "cleanup --force should try removing the workspace folder"
- The cascade should feel natural: close is lightest (sessions), clean is medium (files), remove is heaviest (everything)

</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements are fully captured in decisions above.

### Prior phase context
- `.planning/phases/21-workspace-close-command/21-CONTEXT.md` — Close command design, integration cleanup patterns
- `.planning/phases/25-dedicated-lifecycle-phases/25-CONTEXT.md` — Lifecycle cascade (close → clean → remove), hook ordering
- `.planning/notes/2026-03-18-enhance-autocompletion-complete-new.md` — Original user note with all 4 items

### Implementation references
- `src/lib/completion-generator.ts` — Current `DYNAMIC_COMPLETIONS`, `FLAG_COMPLETIONS`, `OPTION_ENUMS` tables; `generateBash`, `generateZsh`, `generateFish` functions
- `src/commands/workspace.ts` — `edit`, `remove`, `clean`, `close` command registrations; `--from` on `new`
- `src/commands/template.ts` — `template edit` command registration
- `src/commands/config.ts` — `config` and `config show` command registrations
- `src/lib/workspace-ops.ts` — `cleanWorkspace`, `removeWorkspace`, `editWorkspaceYaml` functions
- `src/lib/paths.ts` — `getTasksDir()` for deriving workspace folder path
- `src/lib/config.ts` — `workspacePath()`, `templatePath()`, Zod schemas for validation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `editWorkspaceYaml()` in `workspace-ops.ts:857` — returns `{ path, validate() }` pattern; model for template/config/registry equivalents
- `FLAG_COMPLETIONS` in `completion-generator.ts:35` — global flag-to-dynamic-type mapping; extend with per-command override
- `DYNAMIC_COMPLETIONS` in `completion-generator.ts:5` — command-to-dynamic-type mapping; just add `close: "workspace"`
- `workspacePath()`, `templatePath()` in `config.ts` — resolve YAML file paths for $EDITOR
- `GLOBAL_CONFIG_FILE`, `REGISTRY_FILE` in `paths.ts` — direct paths for config/registry $EDITOR opening

### Established Patterns
- All completion generators (bash/zsh/fish) read from the same static tables — changes to tables propagate to all shells
- `zshOptionSpec()` already handles `FLAG_COMPLETIONS` lookup — needs extension for per-command override
- Commands use `opts: { force?: boolean }` pattern consistently — no new flags needed

### Integration Points
- `src/lib/completion-generator.ts` — Add `COMMAND_FLAG_COMPLETIONS` table, add `close` to `DYNAMIC_COMPLETIONS`, update all three generators to check per-command first
- `src/commands/workspace.ts` — Add `--yaml` to `edit` and `close` to `DYNAMIC_COMPLETIONS`; update `clean` and `remove` to delete `tasks/{name}/`
- `src/commands/template.ts` — Add `--yaml` to `template edit`
- `src/commands/config.ts` — Add `--yaml` to `config`
- `src/commands/repo.ts` — Add `--yaml` to `repo` (opens registry.yml)
- `src/lib/workspace-ops.ts` — Update `cleanWorkspace` to remove folder; update `removeWorkspace` to remove folder and handle malformed YAML

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 26-autocompletion-editor-polish*
*Context gathered: 2026-03-22*
