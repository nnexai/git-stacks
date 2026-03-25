# Phase 34: Completion Audit & Forge/Issue Coverage - Research

**Researched:** 2026-03-25
**Domain:** Shell completion generation (bash/zsh/fish) for deeply nested CLI commands
**Confidence:** HIGH

## Summary

The completion generator (`src/lib/completion-generator.ts`) correctly handles 1-level nested subcommands (e.g., `repo.show`, `template.edit`, `message.send`) but fails to generate completions beyond level 2 for the `integration` command tree. Integration commands are 3-4 levels deep (`integration > github > pr > create`), and all three shell generators (bash, zsh, fish) stop at level 2 -- they only complete integration names (tmux, niri, github, etc.) but not their sub-subcommands.

The `buildNode()` function recursively walks the full Commander.js tree and builds a correct `CommandNode` tree at all depths. The gap is in the three shell-specific generators which assume a max nesting of 2 levels (top-level command + one level of subcommands).

**Primary recommendation:** Extend all three generators to handle arbitrary nesting depth for the `integration` subtree, and add `DYNAMIC_COMPLETIONS` entries for all integration commands that take workspace/repo positional arguments.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Walk the Commander.js tree programmatically (the completion generator already does this via `buildTree()`) and cross-reference with `DYNAMIC_COMPLETIONS` to identify gaps
- Document the audit as a markdown table in the phase SUMMARY showing each command path and its completion status
- Fix gaps found during the audit as part of the same phase
- Integration subcommands need `DYNAMIC_COMPLETIONS` entries for workspace/repo arguments
- The completion generator's `buildNode()` already walks nested commands -- the gap is in `DYNAMIC_COMPLETIONS` which lacks `integration.*` paths
- Add entries like `"integration.github.pr.create": "workspace"`, `"integration.github.issue.link": "workspace"` etc.

### Claude's Discretion
All remaining implementation choices (exact DYNAMIC_COMPLETIONS key format for nested integration commands, audit document layout, whether to add a test) are at Claude's discretion -- pure technical work following established patterns.

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

## Full Command Tree Audit

### Current DYNAMIC_COMPLETIONS Coverage

| Command Path | Dynamic Type | Status |
|---|---|---|
| `clone` | workspace | COVERED |
| `open` | workspace | COVERED |
| `close` | workspace | COVERED |
| `edit` | workspace | COVERED |
| `status` | workspace | COVERED |
| `clean` | workspace | COVERED |
| `remove` | workspace | COVERED |
| `merge` | workspace | COVERED |
| `rename` | workspace | COVERED |
| `run` | workspace | COVERED |
| `sync` | workspace | COVERED |
| `cd` | workspace | COVERED |
| `completion` | shells | COVERED |
| `repo.show` | repo | COVERED |
| `repo.remove` | repo | COVERED |
| `repo.rename` | repo | COVERED |
| `template.show` | template | COVERED |
| `template.edit` | template | COVERED |
| `template.clone` | template | COVERED |
| `template.rename` | template | COVERED |
| `template.remove` | template | COVERED |
| `message.send` | workspace | COVERED |
| `message.list` | workspace | COVERED |
| `message.clear` | workspace | COVERED |

### Commands Without Dynamic Completion (correct -- no positional args needing completion)

| Command Path | Reason |
|---|---|
| `new` | No positional completion (name is freeform), --from covered by COMMAND_FLAG_COMPLETIONS |
| `list` | No positional args |
| `config` | No positional args |
| `manage` | No positional args |
| `doctor` | No positional args |
| `install` | No positional args (interactive selection) |
| `repo` (parent) | Subcommands handled |
| `repo.add` | Path arg is filesystem (no dynamic) |
| `repo.scan` | Dir arg is filesystem (no dynamic) |
| `repo.list` | No positional args |
| `template` (parent) | Subcommands handled |
| `template.new` | Name is freeform |
| `template.list` | No positional args |

### MISSING: Integration Command Tree

These are the commands that exist in Commander.js but have NO completion coverage beyond level 2:

| Command Path | First Arg | Second Arg | Needs Dynamic |
|---|---|---|---|
| `integration.github.open` | [workspace] | [repo] | workspace |
| `integration.github.pr.create` | \<workspace\> | [repo] | workspace |
| `integration.github.pr.open` | \<workspace\> | [repo] | workspace |
| `integration.github.pr.status` | \<workspace\> | [repo] | workspace |
| `integration.github.issue.link` | [workspace-or-issue] | [issue-id] | workspace |
| `integration.github.issue.unlink` | [workspace] | -- | workspace |
| `integration.github.issue.open` | [workspace] | [repo] | workspace |
| `integration.gitlab.open` | [workspace] | [repo] | workspace |
| `integration.gitlab.pr.create` | \<workspace\> | [repo] | workspace |
| `integration.gitlab.pr.open` | \<workspace\> | [repo] | workspace |
| `integration.gitlab.pr.status` | \<workspace\> | [repo] | workspace |
| `integration.gitlab.issue.link` | [workspace-or-issue] | [issue-id] | workspace |
| `integration.gitlab.issue.unlink` | [workspace] | -- | workspace |
| `integration.gitlab.issue.open` | [workspace] | [repo] | workspace |
| `integration.gitea.open` | [workspace] | [repo] | workspace |
| `integration.gitea.pr.create` | \<workspace\> | [repo] | workspace |
| `integration.gitea.pr.open` | \<workspace\> | [repo] | workspace |
| `integration.gitea.pr.status` | \<workspace\> | [repo] | workspace |
| `integration.gitea.issue.link` | [workspace-or-issue] | [issue-id] | workspace |
| `integration.gitea.issue.unlink` | [workspace] | -- | workspace |
| `integration.gitea.issue.open` | [workspace] | [repo] | workspace |
| `integration.jira.issue.link` | [workspace-or-issue] | [issue-id] | workspace |
| `integration.jira.issue.unlink` | [workspace] | -- | workspace |
| `integration.jira.issue.open` | [workspace] | -- | workspace |
| `integration.niri.focus-workspace` | [workspace] | -- | workspace |
| `integration.tmux.attach` | [workspace] | -- | workspace |

**Total missing entries: 26 commands need DYNAMIC_COMPLETIONS entries.**

## Architecture Patterns

### The Depth Problem

The completion generators handle command nesting at these levels:

**Level 1** (top-level commands): All three generators handle this correctly.
- Bash: `case "${words[1]}" in`
- Zsh: `case $words[1] in`
- Fish: `__fish_seen_subcommand_from <name>`

**Level 2** (one level of subcommands, e.g., `repo show`, `template edit`): All three generators handle this correctly.
- Bash: `if [[ ${COMP_CWORD} -eq 2 ]]` for subcommand names, `elif [[ ${COMP_CWORD} -eq 3 ]]` for dynamic args
- Zsh: `generateZshSubcmdHelper()` creates `_git_stacks_<parent>()` helpers
- Fish: `# <parent> subcommands` section with `__fish_seen_subcommand_from <parent>; and not __fish_seen_subcommand_from ...`

**Level 3+** (integration > github > pr > create): NOT HANDLED by any generator.

### Root Cause Analysis

**Bash (`bashCaseBody`)**: When a node has subcommands, it emits `COMP_CWORD -eq 2` for subcommand names and `COMP_CWORD -eq 3` for dynamic args. This works for `repo show <name>` but not for `integration github pr create <workspace>` which needs COMP_CWORD values of 2, 3, 4, and 5.

**Zsh (`generateZshSubcmdHelper`)**: Creates ONE helper per parent with subcommands. The helper checks `CURRENT == 2` for subcommand names, then `case $words[2]` for the specific subcommand. If a sub-subcommand (e.g., `github`) ALSO has sub-subcommands (`pr`, `issue`, `open`), no recursive helper is generated. The current code at lines 482-487 only generates helpers for top-level nodes with subcommands.

**Fish**: The `# <parent> subcommands` section generates completions when parent is seen but no sub is seen. No mechanism for recursive sub-sub-subcommand listing.

### Recommended Fix Strategy

Rather than making the generators fully recursive (which would be a significant rewrite for uncertain future need), the practical approach is:

1. **Add DYNAMIC_COMPLETIONS entries** for all 26 missing integration commands (the locked decision from CONTEXT.md)

2. **Extend `generateZshSubcmdHelper`** to recurse: when a sub-node also has subcommands, generate a helper for it too. The current loop at lines 482-487 only iterates top-level nodes.

3. **Extend `bashCaseBody`** to handle deeper nesting. For the `integration` node, the current approach of using fixed COMP_CWORD offsets breaks down. The solution is to generate nested case statements for integration subcommands, or use a word-position-independent approach that counts from the subcommand.

4. **Extend fish generation** to emit multi-level `__fish_seen_subcommand_from` conditions (e.g., `__fish_seen_subcommand_from integration; and __fish_seen_subcommand_from github; and __fish_seen_subcommand_from pr; and not __fish_seen_subcommand_from create open status`).

### DYNAMIC_COMPLETIONS Entries Needed

Following the established dot-path convention:

```typescript
// GitHub
"integration.github.open":             "workspace",
"integration.github.pr.create":        "workspace",
"integration.github.pr.open":          "workspace",
"integration.github.pr.status":        "workspace",
"integration.github.issue.link":       "workspace",
"integration.github.issue.unlink":     "workspace",
"integration.github.issue.open":       "workspace",

// GitLab
"integration.gitlab.open":             "workspace",
"integration.gitlab.pr.create":        "workspace",
"integration.gitlab.pr.open":          "workspace",
"integration.gitlab.pr.status":        "workspace",
"integration.gitlab.issue.link":       "workspace",
"integration.gitlab.issue.unlink":     "workspace",
"integration.gitlab.issue.open":       "workspace",

// Gitea
"integration.gitea.open":              "workspace",
"integration.gitea.pr.create":         "workspace",
"integration.gitea.pr.open":           "workspace",
"integration.gitea.pr.status":         "workspace",
"integration.gitea.issue.link":        "workspace",
"integration.gitea.issue.unlink":      "workspace",
"integration.gitea.issue.open":        "workspace",

// Jira
"integration.jira.issue.link":         "workspace",
"integration.jira.issue.unlink":       "workspace",
"integration.jira.issue.open":         "workspace",

// Niri
"integration.niri.focus-workspace":    "workspace",

// Tmux
"integration.tmux.attach":             "workspace",
```

### Generator Extension Pattern

The key insight: `buildNode()` already builds the full recursive tree correctly. Each `CommandNode` has a `subcommands` array that can itself contain nodes with further subcommands. The fix is to make the shell generators consume this recursive structure.

**For bash**, the simplest approach is to change the integration case to use `words[]` array indexing rather than absolute `COMP_CWORD` positions. For example:

```bash
integration)
  case "${words[2]}" in
    github)
      case "${words[3]}" in
        pr)
          if [[ ${COMP_CWORD} -eq 4 ]]; then
            COMPREPLY=($(compgen -W "create open status" -- "$cur"))
          elif [[ ${COMP_CWORD} -eq 5 ]]; then
            # workspace lookup
          fi
          ;;
        issue)
          # similar
          ;;
        *)
          COMPREPLY=($(compgen -W "open pr issue" -- "$cur"))
          ;;
      esac
      ;;
    *)
      COMPREPLY=($(compgen -W "tmux niri github gitlab gitea jira" -- "$cur"))
      ;;
  esac
```

**For zsh**, generate recursive helpers: `_git_stacks_integration()` dispatches to `_git_stacks_integration_github()`, which dispatches to handle `pr`/`issue`/`open` subcommands.

**For fish**, emit recursive `__fish_seen_subcommand_from` conditions with multiple levels.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recursive command tree walking | Manual tree enumeration | `buildNode()`/`buildTree()` already does this | Commander.js tree is the source of truth |
| Integration command discovery | Hardcoded list of integration commands | Walk `integrationCommand.commands` at runtime | New integrations auto-discovered |

## Common Pitfalls

### Pitfall 1: COMP_CWORD Absolute Positioning
**What goes wrong:** Bash completion uses `COMP_CWORD -eq N` for absolute cursor position. Integration commands at depth 4-5 require COMP_CWORD values that don't match the 2-level assumption.
**Why it happens:** Current generator assumes max 2 levels of nesting.
**How to avoid:** Use relative word positions (`words[N]` where N is the known depth of the subcommand) instead of absolute COMP_CWORD checks.
**Warning signs:** Tab completion works for `git-stacks repo show` but not for `git-stacks integration github pr create`.

### Pitfall 2: Fish Subcommand Exclusion Lists
**What goes wrong:** Fish uses `not __fish_seen_subcommand_from <all-siblings>` to prevent completing subcommand names when one is already typed. With 4 levels, the exclusion list logic becomes complex.
**Why it happens:** Fish completions are stateless -- each `complete` directive is evaluated independently.
**How to avoid:** Build the `__fish_seen_subcommand_from` chain incrementally, one level at a time. For `pr create`, the condition should be: `__fish_seen_subcommand_from integration; and __fish_seen_subcommand_from github; and __fish_seen_subcommand_from pr; and not __fish_seen_subcommand_from create open status`.

### Pitfall 3: Zsh Empty Case Block
**What goes wrong:** Currently `_git_stacks_integration()` has an empty `case $words[2] in esac` block because integration subcommands (`github`, `gitlab`, etc.) don't have DYNAMIC_COMPLETIONS entries and their sub-subcommands aren't processed.
**Why it happens:** `generateZshSubcmdHelper` only checks `sub.options.length > 0` or `sub.dynamic` for single-depth subcommands.
**How to avoid:** Check if `sub.subcommands.length > 0` and recursively generate helpers.

### Pitfall 4: Test Program Must Include Integration Commands
**What goes wrong:** The test `buildTestProgram()` doesn't include integration commands, so new completion code may pass tests but fail on the real program.
**How to avoid:** Add integration-like nested command structure to `buildTestProgram()` in tests.

## Existing Test Infrastructure

**File:** `tests/lib/completion-generator.test.ts`
- Uses `bun:test` (describe/test/expect)
- Builds a test Commander.js program via `buildTestProgram()` (doesn't include integration commands)
- Tests all three generators: `generateBash`, `generateZsh`, `generateFish`
- Pattern: generate completion script as string, assert on substrings
- 35+ existing tests covering: top-level commands, subcommands, OPTION_ENUMS, FLAG_COMPLETIONS, COMMAND_FLAG_COMPLETIONS, close command, message subcommand tree

**Recommendation:** Add a nested integration-like command structure to `buildTestProgram()` and test that 3+ level completions work for all three shells.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built into Bun runtime) |
| Config file | None (bun:test is zero-config) |
| Quick run command | `bun test tests/lib/completion-generator.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUDIT-01 | All commands have completion coverage | unit | `bun test tests/lib/completion-generator.test.ts` | Existing, needs extension |
| PR-COMPL | pr subcommands complete in all shells | unit | `bun test tests/lib/completion-generator.test.ts` | Needs new tests |
| ISSUE-COMPL | issue subcommands complete in all shells | unit | `bun test tests/lib/completion-generator.test.ts` | Needs new tests |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/completion-generator.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Add nested integration commands (3-4 levels) to `buildTestProgram()` in `tests/lib/completion-generator.test.ts`
- [ ] Add test cases for bash/zsh/fish 3+ level completions
- [ ] Add test cases for DYNAMIC_COMPLETIONS at integration command paths

## Sources

### Primary (HIGH confidence)
- Direct code reading of `src/lib/completion-generator.ts` (670 lines)
- Direct code reading of all integration files: github.ts, gitlab.ts, gitea.ts, jira.ts, niri.ts, tmux.ts
- Direct code reading of `src/commands/integration.ts`
- Direct code reading of `src/index.ts` (full command registration)
- Actual completion output from `bun run src/index.ts completion bash/zsh/fish`

### Secondary (MEDIUM confidence)
- None needed -- all findings from direct code analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed; this is pure code modification
- Architecture: HIGH - Full understanding of all three generators and the gap
- Pitfalls: HIGH - Verified via actual completion output generation

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable -- completion generator changes rarely)
