# Phase 26: Autocompletion & Editor Polish - Research

**Researched:** 2026-03-22
**Domain:** Shell completion generator internals, $EDITOR spawning, filesystem cleanup, Commander.js flags
**Confidence:** HIGH — all findings are from direct source inspection; no external library dependencies introduced

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Shell Completion: `--from` targeting**
- D-01: Add per-command flag completion override table (`COMMAND_FLAG_COMPLETIONS`) alongside global `FLAG_COMPLETIONS`. Per-command is checked first, global is fallback. Key format: `"command:--flag"` (e.g., `"new:--from": "template"`).
- D-02: `new --from` completes template names only. Shell default filesystem completion handles paths naturally when user types `./`, `~/`, or `/`.
- D-03: No completion for `message send --from` or `message clear --from` — sender names are freeform.

**Shell Completion: Missing commands**
- D-04: Add `close` to `DYNAMIC_COMPLETIONS` map with type `"workspace"` — it was added in Phase 21 but never registered for completion.

**Editor command: `--yaml` flag**
- D-05: Add `--yaml` flag to existing commands rather than new standalone commands:
  - `git-stacks edit <name> --yaml` — opens workspace YAML
  - `git-stacks template edit <name> --yaml` — opens template YAML
  - `git-stacks config --yaml` — opens config.yml
  - `git-stacks repo --yaml` — opens registry.yml
- D-06: After $EDITOR closes, validate the file against its Zod schema and warn if invalid. Reuse existing `editWorkspaceYaml()` pattern from `workspace-ops.ts`.
- D-07: Don't print the file path before opening — editors clear the screen so it wouldn't be visible.

**Clean: workspace folder removal**
- D-08: `clean` now also deletes the `tasks/{name}/` directory after worktree removal. This is a behavior change from current (which leaves the directory).
- D-09: Without `--force`: separate confirmation prompt AFTER worktree removal — "Delete workspace folder tasks/{name}/?" as a second prompt (first prompt is existing "Remove all worktrees?" confirmation).
- D-10: With `--force`: both confirmations skipped, folder deleted automatically.

**Remove: full cleanup**
- D-11: `remove` now also deletes the `tasks/{name}/` directory — full removal of worktrees, folder, and config YAML.
- D-12: `remove --force` with malformed/unparseable YAML: don't try to parse or do targeted worktree cleanup. Just `rm -rf` the `tasks/{name}/` directory (derived from workspace name by convention) and delete the YAML file. `doctor` handles orphaned worktree discovery.

**Lifecycle mental model (reinforced)**
- D-13: close < clean < remove. Close keeps everything. Clean removes worktrees + folder but keeps config and branches. Remove removes everything.

### Claude's Discretion
- Shell completion generator internals for per-command flag override lookup
- $EDITOR spawning mechanics (fallback to `vi` if unset, etc.)
- Zod validation error formatting for post-edit warnings
- How to derive `tasks/{name}/` path in the malformed-YAML codepath

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 26 has no formal IDs in REQUIREMENTS.md — requirements are captured as decisions in CONTEXT.md. All D-01 through D-13 decisions constitute the phase requirements.

| Decision | Description | Research Support |
|----------|-------------|------------------|
| D-01 | Add `COMMAND_FLAG_COMPLETIONS` table with per-command flag override | Architecture section: how to wire into all 3 generators |
| D-02 | `new --from` completes template names | Code examples: `FLAG_COMPLETIONS`/`COMMAND_FLAG_COMPLETIONS` pattern |
| D-03 | No completion for `message --from` | Enforced by NOT adding `"message.send:--from"` to the table |
| D-04 | Add `close` to `DYNAMIC_COMPLETIONS` | One-line change: `close: "workspace"` |
| D-05 | Add `--yaml` flag to 4 commands | Code examples: `Bun.spawn([editor, path], { stdio: "inherit" })` pattern |
| D-06 | Post-editor Zod validation with warning | `editWorkspaceYaml()` pattern extended to 3 more entities |
| D-07 | Don't print path before opening editor | No-op — just omit `console.log` |
| D-08 | `clean` deletes `tasks/{name}/` after worktree removal | `rmSync(dir, { recursive: true, force: true })` |
| D-09 | Second confirmation prompt in `clean` | Prompt added in command layer after `cleanWorkspace()` returns |
| D-10 | `--force` skips folder confirmation | Flag already threaded through; just add `rmSync` call in `cleanWorkspace` |
| D-11 | `remove` deletes `tasks/{name}/` directory | `rmSync` in `removeWorkspace()` after `unlinkSync(workspacePath)` |
| D-12 | `remove --force` with malformed YAML: name-based fallback | Path derived from `getTasksDir() + name`; no YAML parsing needed |
</phase_requirements>

---

## Summary

Phase 26 is a purely internal refactor against the existing codebase — no new external libraries. Research is therefore focused on: (1) the exact mechanics of `completion-generator.ts` so the `COMMAND_FLAG_COMPLETIONS` table is wired correctly into all three shell generators, (2) the established `$EDITOR` spawn pattern already present in `App.tsx:launchEditor()` and to be replicated in command-layer `--yaml` flags, (3) safe directory removal with `rmSync({ recursive: true, force: true })` from Node.js `fs` module (which Bun supports natively), and (4) the malformed-YAML fallback path for `remove --force`.

**Primary recommendation:** All changes are additive extensions of existing patterns. Copy `launchEditor()` from `App.tsx` into a shared helper in `workspace-ops.ts`. Add `COMMAND_FLAG_COMPLETIONS` alongside `FLAG_COMPLETIONS` with identical structural shape. Use `rmSync` (already used in `tests/helpers.ts`) for directory deletion in `cleanWorkspace` and `removeWorkspace`.

The dashboard `launchEditor()` function in `App.tsx` is the ground truth for the `$EDITOR` pattern (lines 359-395). It uses `process.env.VISUAL || process.env.EDITOR || "vi"` and `Bun.spawn([editor, path], { stdio: "inherit" })`. The command-layer `--yaml` implementation is simpler because it does not need to suspend/resume an OpenTUI renderer — it just awaits `proc.exited` then runs `validate()` and prints a warning to stderr if invalid.

---

## Standard Stack

### Core (no new dependencies)
| Library | Version | Purpose | Already Present |
|---------|---------|---------|-----------------|
| Node.js `fs.rmSync` | Bun built-in | Recursive directory deletion | Used in `tests/helpers.ts` |
| Bun `spawn` | Bun built-in | $EDITOR subprocess with inherited stdio | Used in `App.tsx:launchEditor()` |
| `zod` | 3.25.76 | Post-edit schema validation | Already in project |
| `yaml.parse` | 2.8.2 | Read file for validation | Already in project |

**No new npm packages required for this phase.**

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `rmSync({ recursive, force })` | Bun `$` shell `rm -rf` | `rmSync` is synchronous, no shell quoting risk, already used in tests — preferred |
| `process.env.VISUAL \|\| process.env.EDITOR` | `process.env.EDITOR` only | POSIX convention: VISUAL for full-screen editors, EDITOR for line editors; `App.tsx` already uses both — keep consistent |

---

## Architecture Patterns

### Pattern 1: COMMAND_FLAG_COMPLETIONS table (new, extends existing pattern)

**What:** A new static table `COMMAND_FLAG_COMPLETIONS: Record<string, DynamicCompletion>` parallel to `FLAG_COMPLETIONS`. Keys use `"command:--flag"` format. The generators check this first, then fall back to `FLAG_COMPLETIONS`.

**Where it goes:** `src/lib/completion-generator.ts`, alongside the existing tables at the top of the file.

**The lookup helper:**
```typescript
// Source: completion-generator.ts internal — new helper
function resolveFlagCompletion(
  commandPath: string,
  flagName: string
): DynamicCompletion | undefined {
  return COMMAND_FLAG_COMPLETIONS[`${commandPath}:${flagName}`] ?? FLAG_COMPLETIONS[flagName]
}
```

**Where the generators call it:**
- `zshOptionSpec(opt, id, commandPath)` — needs `commandPath` threaded in
- bash `prev-word case` block for `FLAG_COMPLETIONS` — add a parallel block for `COMMAND_FLAG_COMPLETIONS`
- fish `FLAG_COMPLETIONS` loop — add a parallel loop for `COMMAND_FLAG_COMPLETIONS`

**Complexity note for bash:** The current bash generator emits a single `case "$prev" in` block at the top for `FLAG_COMPLETIONS`. For `COMMAND_FLAG_COMPLETIONS`, the command context (`words[1]`) must also be checked. The cleanest approach is a nested check: inside the existing `case "$prev" in`, add per-command conditions.

Alternatively (simpler and consistent with how the rest of bash works): emit the `COMMAND_FLAG_COMPLETIONS` entries inside each command's `case "${words[1]}"` block alongside the positional dynamic lookup. This is more surgical.

**Recommended approach for bash:** In `bashCaseBody()`, after the existing `if [[ "$cur" == -* ]]` flag-listing path, add a `case "$prev" in` for command-specific flag completions. This keeps the per-command logic collocated.

### Pattern 2: $EDITOR spawn (established, replicate from App.tsx)

**What:** Spawn the user's preferred editor with inherited stdio, await exit, then validate.

**Ground truth implementation (App.tsx lines 359-394):**
```typescript
// Source: src/tui/dashboard/App.tsx:launchEditor()
const editor = process.env.VISUAL || process.env.EDITOR || "vi"
const proc = spawn([editor, path], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})
await proc.exited
```

**Command-layer adaptation (no TUI suspend needed):**
```typescript
// Pattern for src/commands/*.ts --yaml flag actions
async function openInEditor(path: string, validate: () => { ok: boolean; error?: string }): Promise<void> {
  const editor = process.env.VISUAL || process.env.EDITOR || "vi"
  const proc = Bun.spawn([editor, path], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited
  const result = validate()
  if (!result.ok) {
    console.error(`\nWarning: file has validation errors:\n${result.error}`)
  }
}
```

**Key differences from TUI version:**
- No `renderer.suspend()` / `renderer.resume()` — not in TUI context
- No re-edit loop on validation failure — just warn (simpler; users are in their terminal)
- `Bun.spawn` not the `spawn` import — in command layer, import is explicit

**Shared helper location:** Add `openYamlInEditor(path, validate)` to `src/lib/workspace-ops.ts` (next to the existing `editWorkspaceYaml()`). Command files import and call it. This keeps the pattern in one place.

### Pattern 3: editWorkspaceYaml() extended to 3 new entities

**Existing pattern (workspace-ops.ts:857-874):**
```typescript
// Source: src/lib/workspace-ops.ts:editWorkspaceYaml()
export function editWorkspaceYaml(name: string): {
  path: string
  validate: () => { ok: boolean; error?: string }
} {
  const path = workspacePath(name)
  return {
    path,
    validate: () => {
      try {
        const raw = readFileSync(path, "utf-8")
        WorkspaceSchema.parse(parse(raw))
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  }
}
```

**New equivalents to add to workspace-ops.ts:**
```typescript
// editTemplateYaml(name) — uses templatePath(name) + TemplateSchema.parse
// editGlobalConfigYaml() — uses GLOBAL_CONFIG_FILE + GlobalConfigSchema.parse
// editRegistryYaml() — uses REGISTRY_FILE + RepoRegistrySchema.parse
```

All four follow identical structure. `GLOBAL_CONFIG_FILE` and `REGISTRY_FILE` are direct path constants from `paths.ts`; no name argument needed.

### Pattern 4: Recursive directory removal

**What:** `rmSync(dir, { recursive: true, force: true })` from Node.js `fs`.

**Where used:** `tests/helpers.ts:cleanup()` already uses this exact call. The project proves it works with Bun.

**For cleanWorkspace:** Call after all `removeWorktree()` calls succeed:
```typescript
// After worktree loop in cleanWorkspace()
const wsDir = join(tasksDir, name)
if (existsSync(wsDir)) {
  rmSync(wsDir, { recursive: true, force: true })
  onProgress?.(`deleted folder  tasks/${name}/`)
}
```

**For removeWorkspace (normal path):** Call after `unlinkSync(workspacePath(name))`:
```typescript
const wsDir = join(tasksDir, name)
if (existsSync(wsDir)) {
  rmSync(wsDir, { recursive: true, force: true })
  onProgress?.(`deleted folder  tasks/${name}/`)
}
```

**For removeWorkspace (malformed YAML / --force fallback):** The workspace name is the only thing needed to derive the tasks dir path. This is safe because `workspacePath(name)` is already known to exist (it's the file the user passed). Use `getTasksDir(config.workspace_root)` — but if even `readGlobalConfig()` might fail, use the fallback: `process.env.HOME + /workspaces/tasks/` with a documented convention that it may not apply.

**Practical D-12 path:** In `removeWorkspace`, catch the YAML parse error at the top when `workspaceExists()` returns true but `readWorkspace()` throws. If `opts.force` is set, proceed with name-only cleanup:
```typescript
// Malformed YAML fallback in removeWorkspace
let workspace: Workspace | null = null
try {
  workspace = readWorkspace(name)
} catch (err) {
  if (!opts.force) {
    return { ok: false, error: `Cannot parse workspace YAML: ${err}. Use --force to remove anyway.` }
  }
  // Force path: name-only cleanup
}

if (workspace === null) {
  // Force path: skip worktree cleanup (git doctor can recover orphaned worktrees)
  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)
  const wsDir = join(tasksDir, name)
  if (existsSync(wsDir)) rmSync(wsDir, { recursive: true, force: true })
  unlinkSync(workspacePath(name))
  onProgress?.(`Workspace '${name}' force-removed (YAML was unparseable).`)
  return { ok: true }
}
// ... normal path continues
```

Note: `readGlobalConfig()` returns a default if config.yml is missing (it uses `readYaml` with a default schema), so this is safe to call even when workspace YAML is corrupt.

### Anti-Patterns to Avoid
- **Don't use `$` shell for rm:** The Bun `$` shell has quote-escaping complexity with dynamic paths. `rmSync` is synchronous, path-safe, and already in use in the project.
- **Don't add a new `edit-yaml` top-level command:** D-05 is explicit — add `--yaml` to existing commands.
- **Don't re-open the editor loop on CLI `--yaml`:** The TUI does this for UX reasons (renderer needs to stay clean). The CLI just warns and exits cleanly.
- **Don't try to `spawnSync`:** The project uses `Bun.spawn(...).exited` pattern with `await`. `spawnSync` would block the event loop and prevent any async cleanup.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recursive directory deletion | Custom recursive unlink | `rmSync(dir, { recursive: true, force: true })` | Already used in tests/helpers.ts; handles non-empty dirs, ignores missing (force: true) |
| Editor detection | Custom $EDITOR logic | `process.env.VISUAL \|\| process.env.EDITOR \|\| "vi"` | POSIX convention; `App.tsx:launchEditor()` already implements it |
| YAML validation after edit | Custom YAML parser | `Schema.parse(parse(readFileSync(path)))` | Zod + yaml library already in use; `editWorkspaceYaml().validate()` pattern |
| Per-command completion | Rewrite completion generator | Add `COMMAND_FLAG_COMPLETIONS` table + `resolveFlagCompletion()` helper | Generator already handles `FLAG_COMPLETIONS` the same way |

**Key insight:** Everything needed for this phase already exists in the codebase. The work is wiring, not building.

---

## Common Pitfalls

### Pitfall 1: Completion generator `commandPath` vs top-level command name

**What goes wrong:** The `DYNAMIC_COMPLETIONS` table uses dotted paths (`"template.edit"`) but the bash generator's `case "${words[1]}"` block only handles top-level command names. For `new --from`, the command path is `"new"` and the flag is `"--from"`, so the key is `"new:--from"`.

**Why it happens:** The existing `FLAG_COMPLETIONS` is a flat global table (no command scoping). Adding `COMMAND_FLAG_COMPLETIONS` requires threading the command path into `zshOptionSpec()` and the bash `prev-word` case block.

**How to avoid:** For `zshOptionSpec`, add a `commandPath` parameter (default `""`). For bash, add the command-specific flag lookups inside the per-command `case` body (after positional completion, before `fi`). For fish, add a loop analogous to the existing `FLAG_COMPLETIONS` loop but scoped per command.

**Warning signs:** Tests pass for global `FLAG_COMPLETIONS` (e.g. `--workspace`) but the new `--from` completion doesn't appear in generated output — check that `commandPath` is being passed correctly.

### Pitfall 2: `rmSync` import — `fs` vs `node:fs`

**What goes wrong:** `workspace-ops.ts` currently imports from `"fs"` (line 1). `rmSync` is in Node.js `fs` and Bun supports it. But `rmSync` is not yet imported in `workspace-ops.ts`.

**How to avoid:** Add `rmSync` to the existing import line:
```typescript
import { existsSync, unlinkSync, readFileSync, writeFileSync, lstatSync, rmSync } from "fs"
```

### Pitfall 3: `cleanWorkspace` folder deletion position — must be after worktree loop

**What goes wrong:** Deleting the `tasks/{name}/` directory BEFORE removing individual worktrees will cause `removeWorktree()` to fail because it reads `.git/worktrees/` from the main repo, which still references those paths. Deleting the directory does not clean up the git object DB entries.

**Why it happens:** Trying to optimize by "just nuke the whole folder". Git worktree bookkeeping lives in the main repo's `.git/worktrees/` directory, not in the worktree directory itself.

**How to avoid:** Keep the existing per-repo `removeWorktree()` loop, then delete the folder as a final step. The folder deletion is the same as what `doctor --fix` does (`rm -rf tasks/{name}`) — it's for the folder, not the git registration.

### Pitfall 4: Second confirmation prompt in `clean` — UX ordering matters

**What goes wrong:** D-09 says the second prompt ("Delete workspace folder?") appears AFTER worktree removal. If the order is: prompt1 → prompt2 → remove worktrees → remove folder, the user is confirming folder removal before they've seen what happened.

**Why it happens:** Conflating the two confirmation steps.

**How to avoid:** Order is: prompt1 ("Remove all worktrees?") → remove worktrees → prompt2 ("Delete workspace folder?") → remove folder. With `--force`, both skipped, both actions happen.

The second prompt happens in the command layer (`commands/workspace.ts`), not inside `cleanWorkspace()`. `cleanWorkspace()` gains an additional boolean in `opts` (`deleteFolder?: boolean`) and the command layer decides whether to pass it.

### Pitfall 5: `GlobalConfigSchema` — import it for `editGlobalConfigYaml`

**What goes wrong:** `editWorkspaceYaml` uses `WorkspaceSchema` which is already imported everywhere. `editGlobalConfigYaml` needs `GlobalConfigSchema` — check that it's exported from `config.ts`.

**How to avoid:** Verify `GlobalConfigSchema` is exported before adding the function. Quick check:
```
grep "export.*GlobalConfigSchema" src/lib/config.ts
```

### Pitfall 6: Fish completion for `COMMAND_FLAG_COMPLETIONS` — condition nesting

**What goes wrong:** In fish, `complete -c git-stacks -f -n '__fish_seen_subcommand_from new' -l from -ra "(...)` would match the `--from` flag for ANY word after `new`. This is correct for `new --from`, but the condition must NOT match inside `message send`.

**Why it happens:** Fish completion conditions use `__fish_seen_subcommand_from` which checks the entire command line for a word match — it's not positional. But `message send --from` is a sub-subcommand, so `__fish_seen_subcommand_from new` would never be true in that context (words[1] would be `message`). This is safe as long as `new` and `message` are distinct top-level commands.

**How to avoid:** No special action needed — naturally scoped because `new` is a top-level command and `message send` is under `message`.

---

## Code Examples

### Adding `COMMAND_FLAG_COMPLETIONS` to completion-generator.ts

```typescript
// Source: src/lib/completion-generator.ts — new table, add after FLAG_COMPLETIONS
const COMMAND_FLAG_COMPLETIONS: Record<string, DynamicCompletion> = {
  "new:--from": "template",
}
```

### Zsh: threading commandPath into zshOptionSpec

```typescript
// Modified signature — commandPath defaults to "" for backward compat
function zshOptionSpec(opt: OptionInfo, id: string, commandPath = ""): string {
  const flagName = opt.long
  const cmdFlagDynamic = COMMAND_FLAG_COMPLETIONS[`${commandPath}:${flagName}`]
  const enumValues = OPTION_ENUMS[flagName]
  const flagDynamic = cmdFlagDynamic ?? FLAG_COMPLETIONS[flagName]
  // ... rest unchanged
}
```

Call sites that already pass `(opt, id)` continue to work with the default `commandPath = ""`.

### Bash: command-level flag completion inside bashCaseBody

```typescript
// Inside bashCaseBody() for a command with dynamic + options:
// After the existing "if [[ "$cur" == -* ]]" flag listing block,
// add prev-word detection for command-specific flags:
const cmdFlagEntries = Object.entries(COMMAND_FLAG_COMPLETIONS)
  .filter(([key]) => key.startsWith(`${node.path}:`))
if (cmdFlagEntries.length > 0) {
  out += `      case "$prev" in\n`
  for (const [key, dynType] of cmdFlagEntries) {
    const flag = key.split(":")[1]
    out += `        "${flag}")\n`
    out += bashDynamicLookup(dynType, "          ", name)
    out += `          return 0\n`
    out += `          ;;\n`
  }
  out += `      esac\n`
}
```

### openYamlInEditor helper (new, in workspace-ops.ts)

```typescript
// Source: new function in src/lib/workspace-ops.ts (next to editWorkspaceYaml)
export async function openYamlInEditor(
  path: string,
  validate: () => { ok: boolean; error?: string }
): Promise<void> {
  const editor = process.env.VISUAL || process.env.EDITOR || "vi"
  const proc = Bun.spawn([editor, path], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited
  const result = validate()
  if (!result.ok) {
    console.error(`\nWarning: file has validation errors:\n${result.error}`)
  }
}
```

### editTemplateYaml (new, in workspace-ops.ts)

```typescript
// Source: mirrors editWorkspaceYaml() pattern exactly
export function editTemplateYaml(name: string): {
  path: string
  validate: () => { ok: boolean; error?: string }
} {
  const path = templatePath(name)
  return {
    path,
    validate: () => {
      try {
        const raw = readFileSync(path, "utf-8")
        TemplateSchema.parse(parse(raw))
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  }
}
```

### --yaml flag action in commands/workspace.ts

```typescript
// Inside the "edit <name>" command action:
if (opts.yaml) {
  const { path, validate } = editWorkspaceYaml(name)
  await openYamlInEditor(path, validate)
  return
}
// else: existing runWorkspaceEdit(name) TUI flow
```

### Folder removal in cleanWorkspace (workspace-ops.ts)

```typescript
// After the worktree removal loop and failure check:
const wsDir = join(tasksDir, name)
if (opts.deleteFolder && existsSync(wsDir)) {
  rmSync(wsDir, { recursive: true, force: true })
  onProgress?.(`deleted  tasks/${name}/`)
}
```

The `deleteFolder` flag is set by the command layer (true if `--force` or user confirmed second prompt).

### Malformed YAML fallback in removeWorkspace

```typescript
let workspace: Workspace | null = null
try {
  workspace = readWorkspace(name)
} catch (_parseErr) {
  if (!opts.force) {
    return {
      ok: false,
      error: `Cannot parse workspace YAML for '${name}'. Use --force to remove directory and config without worktree cleanup.`,
    }
  }
}

if (workspace === null) {
  // Force fallback: name-based directory removal only
  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)
  const wsDir = join(tasksDir, name)
  if (existsSync(wsDir)) {
    rmSync(wsDir, { recursive: true, force: true })
    onProgress?.(`deleted  tasks/${name}/ (force)`)
  }
  unlinkSync(workspacePath(name))
  onProgress?.(`Workspace '${name}' force-removed.`)
  return { ok: true }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `global FLAG_COMPLETIONS` only | `COMMAND_FLAG_COMPLETIONS` + `FLAG_COMPLETIONS` (per-command override) | Phase 26 | `new --from` completes templates without polluting global flag table |
| `clean` leaves `tasks/{name}/` | `clean` removes folder (with optional prompt) | Phase 26 | Lifecycle mental model: clean = no worktrees AND no folder |
| `remove` leaves `tasks/{name}/` | `remove` removes folder (always) | Phase 26 | Lifecycle mental model: remove = complete erasure |
| `remove --force` fails on malformed YAML | `remove --force` uses name-based fallback | Phase 26 | Stuck workspaces can always be cleared |
| No `close` in completion | `close` completes workspace names | Phase 26 | Closes the gap left by Phase 21 |

---

## Open Questions

1. **`GlobalConfigSchema` export**
   - What we know: `GlobalConfig` type is used throughout; `readGlobalConfig()` calls `readYaml(GLOBAL_CONFIG_FILE, GlobalConfigSchema)`.
   - What's unclear: Whether `GlobalConfigSchema` is named and exported from `config.ts` or only used inline.
   - Recommendation: Confirm with `grep "GlobalConfigSchema" src/lib/config.ts` before implementing `editGlobalConfigYaml`. If not exported, export it there.

2. **`cleanWorkspace` signature change (`deleteFolder?`)**
   - What we know: `cleanWorkspace(name, { force?, dryRun? })` is the current signature.
   - What's unclear: Whether to add `deleteFolder` to the opts object or handle folder deletion entirely in the command layer after `cleanWorkspace` returns.
   - Recommendation: Handle in command layer (post-`cleanWorkspace`) to avoid changing the function signature for the TUI which calls `cleanWorkspace` directly. The command adds a second prompt and calls `rmSync` itself. The TUI dashboard can add folder deletion in a follow-up.

3. **`editWorkspaceYaml` already used by TUI — avoid duplicate spawn logic**
   - What we know: `App.tsx:launchEditor()` calls `editWorkspaceYaml()` and spawns the editor itself (it can't use a shared async helper because it needs TUI suspend/resume).
   - What's unclear: Whether `openYamlInEditor` should live in workspace-ops.ts or a shared utility.
   - Recommendation: Put `openYamlInEditor` in `workspace-ops.ts`. The TUI's `launchEditor()` stays as-is (it needs TUI-specific behavior). The CLI commands import and call `openYamlInEditor`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Jest-compatible API) |
| Config file | none — `bun test tests/` |
| Quick run command | `bun test tests/lib/completion-generator.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-01/02 | `new --from` generates template completion in bash/zsh/fish | unit | `bun test tests/lib/completion-generator.test.ts` | Yes |
| D-03 | `message send --from` does NOT complete in any shell | unit | `bun test tests/lib/completion-generator.test.ts` | Yes |
| D-04 | `close` appears in workspace completions | unit | `bun test tests/lib/completion-generator.test.ts` | Yes |
| D-08/10 | `cleanWorkspace` with force deletes folder | unit | `bun test tests/lib/workspace-ops.test.ts` | Yes |
| D-11 | `removeWorkspace` deletes folder after YAML delete | unit | `bun test tests/lib/workspace-ops.test.ts` | Yes |
| D-12 | `removeWorkspace --force` succeeds with malformed YAML | unit | `bun test tests/lib/workspace-ops.test.ts` | Yes |
| D-05/06 | `--yaml` flag opens editor and warns on invalid YAML | unit (mock Bun.spawn) | `bun test tests/lib/workspace-ops.test.ts` | Yes |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/completion-generator.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

New tests needed in existing files:

- `tests/lib/completion-generator.test.ts` — add cases for:
  - `COMMAND_FLAG_COMPLETIONS`: `new --from` completes templates in bash/zsh/fish
  - `message send --from` does NOT complete in bash/zsh/fish
  - `close` appears in workspace completion list
- `tests/lib/workspace-ops.test.ts` — add cases for:
  - `cleanWorkspace` with `deleteFolder: true` removes the folder
  - `cleanWorkspace` with `deleteFolder: false` leaves the folder
  - `removeWorkspace` removes the folder after YAML delete
  - `removeWorkspace --force` with malformed YAML succeeds (uses fixture with corrupt YAML file)
  - `editTemplateYaml`, `editGlobalConfigYaml`, `editRegistryYaml` return correct paths and schemas

---

## Sources

### Primary (HIGH confidence)
- Direct source inspection of `src/lib/completion-generator.ts` — full file read; all tables and generators examined
- Direct source inspection of `src/tui/dashboard/App.tsx:launchEditor()` (lines 359-394) — $EDITOR pattern
- Direct source inspection of `src/lib/workspace-ops.ts:editWorkspaceYaml()` (lines 857-874) — validation pattern
- Direct source inspection of `src/lib/workspace-ops.ts:cleanWorkspace()` (lines 201-268) and `removeWorkspace()` (lines 315-384)
- Direct source inspection of `tests/helpers.ts:cleanup()` — `rmSync({ recursive, force })` usage
- Direct source inspection of `src/lib/paths.ts` — `getTasksDir()`, `GLOBAL_CONFIG_FILE`, `REGISTRY_FILE`
- Direct source inspection of `src/lib/config.ts` — `workspacePath()`, `templatePath()`, schemas

### Secondary (MEDIUM confidence)
- Bun `rmSync` support: confirmed by test file usage (`tests/helpers.ts` line 13)
- Bun `spawn` with inherited stdio: confirmed by `src/lib/integrations/vscode.ts` and `App.tsx`

---

## Metadata

**Confidence breakdown:**
- Shell completion generator changes: HIGH — full source read, tables and generators fully understood
- $EDITOR spawn pattern: HIGH — canonical implementation in App.tsx read and understood
- Filesystem cleanup (rmSync): HIGH — already in use in tests/helpers.ts
- Malformed YAML fallback: HIGH — `readGlobalConfig()` has safe default behavior verified in config.ts
- Validation warning pattern: HIGH — editWorkspaceYaml() is the reference

**Research date:** 2026-03-22
**Valid until:** Stable — no external dependencies; validity tied to codebase stability only
