# Pitfalls Research

**Domain:** CLI workspace manager — multi-agent workspace tooling (v0.10.0)
**Researched:** 2026-03-25
**Confidence:** HIGH (all pitfalls grounded in direct codebase reads of `src/lib/config.ts`, `src/lib/git.ts`, `src/lib/workspace-ops.ts`, `src/tui/dashboard/hooks/useWorkspaces.ts`, and the existing YAML schema)

---

## Critical Pitfalls

### Pitfall 1: Template Composition Schema Change Breaks Existing YAML on Read

**What goes wrong:**
Adding `includes: z.array(z.string()).optional()` to `TemplateSchema` in `src/lib/config.ts` is safe by itself. The danger is if `includes` is added as a required field (no `.optional()`) or if any downstream code tries to read `template.includes` without guarding for `undefined`. Existing template YAML files have no `includes` key — if the Zod schema makes the field required (even accidentally), every `readTemplate()` call against existing user files throws a Zod parse error: "required field missing at includes."

A subtler form: if the composition resolver function throws when `includes` is `undefined` (e.g., `template.includes.map(...)` without a null-guard), every command that touches templates crashes for all existing users.

**Why it happens:**
New features are added by editing `TemplateSchema` incrementally without running existing-config regression tests. The `TemplateSchema.safeParse()` path is used in `listTemplates()` for resilient scanning, but `readTemplate()` uses `.parse()` which throws. If an existing template file fails the upgraded schema, `readTemplate()` throws and the user's workspace cannot be opened or recreated.

**How to avoid:**
- Always add new template schema fields with `.optional()` and no `.default()` unless the field has a safe default that applies to all existing configs.
- Add a unit test: parse an existing-format YAML fixture through the new schema and verify it succeeds without the new field present.
- Guard all access to the new field: `template.includes?.map(...)` not `template.includes.map(...)`.
- Run `bun test tests/lib/config.test.ts` before any schema change ships.

**Warning signs:**
- `TemplateSchema` edit that adds a field without `.optional()` or `.default()`
- Composition resolver that destructures `includes` without optional chaining
- No test fixture covering an old-format template YAML through the new schema

**Phase to address:**
Template composition schema and resolver — first action in that phase, before any resolver logic is written.

---

### Pitfall 2: `git pull` in a Worktree Requires the Branch to Have Upstream Tracking

**What goes wrong:**
A worktree's branch may not have upstream tracking configured if it was created before `ensureUpstreamTracking()` was wired (v0.8.0), or if the workspace was imported/cloned from another machine. Running `git pull` inside a worktree without upstream tracking configured returns:

```
There is no tracking information for the current branch.
```

The `git pull` exits non-zero. If `git-stacks pull` iterates repos and aborts on first error, the remaining repos in the workspace are not pulled. If it silently swallows the error, the user believes the pull succeeded but repos are stale.

**Why it happens:**
`git pull` without `--set-upstream` or without prior tracking configured uses the default merge strategy on the tracked branch. When there is no tracking, git has no upstream to pull from and fails. This is distinct from repos in trunk mode — trunk repos have a default_branch in the registry and can be pulled with `git pull origin <default_branch>` explicitly.

**How to avoid:**
In the `git-stacks pull` implementation, for each worktree-mode repo:
1. Check `hasUpstreamTracking()` (already in `src/lib/git.ts` line 132). If tracking is absent, call `ensureUpstreamTracking()` first.
2. Use explicit `git pull origin <branch>` rather than bare `git pull` — this works regardless of tracking state.
3. For trunk-mode repos: pull with `git pull origin <default_branch>` using the registry's `default_branch` field.
4. Report per-repo status clearly: pulled / skipped (not a worktree) / failed (dirty) / failed (no remote).

**Warning signs:**
- `git pull` implemented as bare `$ git -C ${path} pull` without specifying remote and branch
- No call to `hasUpstreamTracking()` or `ensureUpstreamTracking()` before pull
- Pull loop that aborts on first error instead of collecting per-repo results
- Test only covers the happy path (tracking already configured)

**Phase to address:**
`git-stacks pull` command — tracking guard must be part of the pull implementation, not a separate phase.

---

### Pitfall 3: `git pull --rebase` on a Dirty Worktree Leaves a Partially-Applied Rebase State

**What goes wrong:**
If `git-stacks pull` uses `--rebase` strategy (consistent with `git-stacks sync`) and a worktree has uncommitted changes, `git pull --rebase` starts, hits a conflict or dirty state, and exits non-zero. Git leaves the repo in `REBASE_HEAD` state — a partially applied rebase. The user now has to run `git rebase --abort` manually. If git-stacks does not auto-abort on failure, the worktree is broken until the user manually recovers.

**Why it happens:**
`syncWorkspace()` in `workspace-ops.ts` (which already handles rebase) guards with `getDirtyWorktrees()` before proceeding. A naive `git-stacks pull` implementation may skip this guard because "it's just a pull, not a sync." But a rebase-based pull has the same dirty-worktree fragility.

**How to avoid:**
For `git-stacks pull`:
- Use `git pull --ff-only` as the default strategy. Fast-forward only: if remote has diverged and local has commits, it fails cleanly without a rebase state. The error is clear and safe.
- If a rebase pull option is desired, check `isRepoDirty()` first and skip that repo with a warning, consistent with how `syncWorkspace()` works.
- Never use `--rebase` without a pre-flight dirty check.
- Always auto-abort on rebase failure: the pattern in `rebaseBranch()` in `git.ts` (lines 171-180) is the correct template — call `git rebase --abort` on non-zero exit.

**Warning signs:**
- `git pull --rebase` without calling `isRepoDirty()` first
- No `git rebase --abort` on failure
- `git-stacks pull` implemented as a thin wrapper that does not check dirty state

**Phase to address:**
`git-stacks pull` command — dirty state guard is a prerequisite, not optional.

---

### Pitfall 4: `git-stacks env` Output Used in Shell Eval Without Escaping — Injection via Env Values

**What goes wrong:**
`git-stacks env --format shell` is designed to be eval'd: `eval "$(git-stacks env --format shell)"`. If a workspace env var value contains shell metacharacters (spaces, `$`, backticks, semicolons, newlines), the shell output is unescaped and the eval executes arbitrary code. Example: a workspace YAML contains `DATABASE_URL: "postgresql://host/db; rm -rf ~/workspaces"` — the shell format output would be:

```sh
export DATABASE_URL=postgresql://host/db; rm -rf ~/workspaces
```

When eval'd, the semicolon terminates the export command and the destructive command runs.

**Why it happens:**
Env var values come from YAML, which accepts arbitrary strings. The `--format shell` output must quote every value. The naive implementation `export ${key}=${value}` is unsafe for any value containing shell special characters. This is a known class of vulnerability in dotenv-style tools.

**How to avoid:**
For `--format shell`, always use single-quote wrapping with single-quote escaping: `export KEY='${value.replace(/'/g, "'\\''")}'`. This is the only safe approach for arbitrary values in shell output intended for eval.

For `--format dotenv`, use double-quote wrapping with escaping of `$`, `\`, and `"` characters: `KEY="${escaped_value}"`. Do NOT output raw values without quoting.

For `--format json`, use `JSON.stringify()` on the entire output object — this handles all special characters correctly by design.

The GS_* variables injected by git-stacks (workspace name, branch, path) are safe because they come from internal data. But user-defined env vars from YAML must be treated as untrusted strings.

**Warning signs:**
- Shell format output that uses `export KEY=VALUE` without quoting
- Template string like `\`export ${key}=${value}\`` in the implementation
- Tests that only use safe alphanumeric env values (do not exercise special characters)
- No test case with values containing spaces, `$`, backticks, or semicolons

**Phase to address:**
`git-stacks env` command — escaping must be correct on the first implementation; retrofitting it after users have scripts using the output is a breaking change.

---

### Pitfall 5: TUI Staleness Check Triggers a Network Fetch Per Repo on Every Focus Event

**What goes wrong:**
If the staleness indicator triggers `fetchOrigin()` for every repo every time the workspace is focused in the dashboard, with 3-5 repos per workspace and 10+ workspaces, the TUI hangs for several seconds every time the cursor moves. `fetchOrigin()` uses `fetch.timeout=30` — up to 30 seconds per repo in the worst case.

The `useWorkspaces` hook already fetches git status for all workspaces on initial load (via `getWorkspaceStatus()` which calls `isRepoDirty()` per repo). Adding a network fetch to that loop multiplies the initial load time by 5-10x.

**Why it happens:**
Staleness requires knowing how far behind `origin/<branch>` the local branch is. This requires either: (a) a remote fetch to update `refs/remotes/origin/*`, or (b) using stale cached remote refs. Developers implement (a) naively — fetch every time — because it is "correct." But in a TUI, correctness does not justify multi-second hangs on cursor movement.

**How to avoid:**
Use a time-gated fetch strategy:
- Fetch at most once per workspace per N minutes (5 minutes is a reasonable default). Cache the last-fetch timestamp per workspace in-memory in the TUI hook.
- On workspace focus (cursor move), check if the cache is stale. If stale, trigger a background fetch and update the indicator asynchronously. Do NOT block the TUI render.
- Use `getCommitsBehind()` (already in `src/lib/git.ts` line 193) against local `origin/<branch>` refs — this is a local git operation and fast. Only the fetch needs to be time-gated.
- Provide a manual refresh keybinding (e.g., `F5` or `r`) that forces a fetch regardless of the cache.
- The fetch should run in a non-blocking async call: fire the fetch, update the indicator signal when it resolves. The TUI remains responsive while the fetch is in-flight.

**Warning signs:**
- `fetchOrigin()` called synchronously before rendering the staleness badge
- `fetchOrigin()` called in `useWorkspaces.fetchStatuses()` alongside `getWorkspaceStatus()`
- No time-gate or cache on fetch frequency
- Staleness check that blocks the reactive update cycle

**Phase to address:**
TUI upstream staleness indicator — the fetch strategy must be decided before any TUI code is written. A wrong approach requires a complete rewrite.

---

### Pitfall 6: Template Composition Repo Union Uses Last-Wins Instead of Worktree-Wins

**What goes wrong:**
When composing templates via `includes:`, the same repo may appear in both the base template and an included template. The spec says "worktree wins over trunk" — a repo declared as `mode: worktree` in any included template should override a `mode: trunk` declaration in another. A naive merge implementation using last-wins (`Object.assign` or spread in declaration order) will use whichever definition appears last in the `includes` array, which may be trunk if the order is wrong.

Additionally, if two included templates both declare the same repo as `mode: worktree`, a naive union takes the first or last definition, silently discarding the other's `base_branch`, `branch_pattern`, or `hooks` overrides.

**Why it happens:**
The merge rule "worktree wins" requires an explicit priority check, not a simple spread. When iterating repos from `[...baseTemplate.repos, ...includedTemplate.repos]`, a `reduce` or `Map` dedup that uses the last occurrence will not implement the worktree-wins rule if the trunk declaration happens to appear last.

**How to avoid:**
Implement the union with an explicit priority function:

```typescript
function mergeRepoDeclarations(repos: TemplateRepo[]): TemplateRepo[] {
  const seen = new Map<string, TemplateRepo>()
  for (const repo of repos) {
    const existing = seen.get(repo.repo)
    if (!existing) {
      seen.set(repo.repo, repo)
    } else {
      // worktree always wins over trunk
      if (repo.mode === "worktree" && existing.mode === "trunk") {
        seen.set(repo.repo, repo)
      }
      // if both are worktree: keep the later definition (last-wins for same mode)
      else if (repo.mode === "worktree" && existing.mode === "worktree") {
        seen.set(repo.repo, repo)
      }
      // trunk never overwrites worktree
    }
  }
  return Array.from(seen.values())
}
```

**Warning signs:**
- Repo union implemented with `new Map()` where keys are repo names but values use simple last-wins spread
- No test case: include a template with `mode: trunk` that overlaps with a `mode: worktree` repo in the base template — verify worktree wins
- Composition logic that iterates includes in array order without explicit mode comparison

**Phase to address:**
Template composition resolver — the worktree-wins rule must be implemented and tested before the composition feature ships.

---

### Pitfall 7: Hook Concatenation During Template Composition Creates Double-Execution at Wrong Lifecycle Phase

**What goes wrong:**
Template composition concatenates hooks from multiple templates: `post_create: [...baseHooks, ...includedHooks]`. If the same hook command appears in both the base and included template (e.g., both run `npm install`), it runs twice — doubling dependency install time or causing race conditions if the hook writes shared state. More critically, if a hook is declared in `post_create` in one template and `post_open` in another, the composition merges them into their respective lifecycle arrays without cross-lifecycle deduplication. This is correct behavior, but it means hooks pile up across templates without the user being aware.

A related issue: workspace-level hooks (copied from the first/primary template during workspace creation in `workspace-ops.ts`) would need to be updated to reflect the composed hook arrays from all templates. Currently, `workspace.hooks` is set from a single template at creation time (see `workspace-wizard.ts` line 173). If composition is applied at workspace-creation time, the workspace YAML must persist the composed hook arrays, not the single-template hooks.

**Why it happens:**
The current workspace creation flow copies hooks from one template. Composition that merges hooks at workspace creation time requires the wizard/creation code to compute the merged hook array and write it to the workspace YAML. If this step is omitted, the workspace only runs one template's hooks, silently ignoring the rest.

**How to avoid:**
- At workspace creation with composed templates: compute the full merged hook arrays (concatenated per lifecycle phase), write them to `workspace.hooks` in the YAML.
- For duplicate commands within the same hook array: consider a dedup pass on exact-match strings (but do not dedup non-identical commands — order matters).
- Document in the template YAML that `includes:` hooks concatenate in declaration order.
- Provide a `--dry-run` output for `git-stacks new` that shows all hooks that will run, including composed sources.

**Warning signs:**
- Composition logic that sets `workspace.hooks` from only the first/primary template
- No dedup of identical hook commands in the same lifecycle phase
- Tests that verify hook execution count (should fire once per unique command per phase)

**Phase to address:**
Template composition resolver — hook merging must be computed and persisted at workspace creation time.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `git pull` without tracking check | Simpler implementation | Silently fails for non-tracked branches; user has no feedback | Never — always check tracking or use explicit remote/branch |
| Fetch on every staleness check | Always fresh data | TUI hangs for seconds per cursor move; unusable with slow network | Never — time-gate fetches |
| Shell format without quoting | Simpler string formatting | Arbitrary code execution when env values contain shell metacharacters | Never — always quote values |
| `template.includes` schema field without `.optional()` | Simpler schema definition | Parse failures for all existing user template YAML | Never — all new schema fields must be optional |
| Composition worktree-wins via last-wins array order | Simpler merge code | Trunk can silently override worktree depending on include order | Never — explicit priority check required |
| Copy hooks from first template only during composition | No change to workspace creation flow | Workspace misses hooks from included templates | Never — must merge all templates' hooks |
| JSON format using template strings | No extra dependency | Values with `"` or `\` break JSON syntax | Never — always use `JSON.stringify()` |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `git-stacks env --format shell` | `export KEY=VALUE` with raw value | `export KEY='${value.replace(/'/g, "'\\''")}' ` — single-quote wrap with escaped single quotes |
| `git-stacks env --format dotenv` | Emit raw values without quoting | Double-quote values, escape `$` and `\` inside; match what Node.js dotenv parsers expect |
| `git-stacks pull` on worktree repos | `git pull` with no remote/branch args | `git pull origin <branch>` explicitly, or set upstream first with `ensureUpstreamTracking()` |
| `git-stacks pull` on trunk repos | Pull from branch of same name | Pull from `registryEntry.default_branch` — trunk repos do not have a workspace branch |
| `git-stacks paths --prefix` | Output raw paths without quoting | Paths may contain spaces; always quote in shell format output; use JSON format for programmatic use |
| TUI staleness badge | Fetch inside the reactive render | Fetch in background async; update signal after fetch completes; never block render |
| Template composition circular includes | No cycle detection | A template that includes itself (directly or transitively) causes infinite recursion in the resolver |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `fetchOrigin()` per repo on workspace focus | TUI hangs 2-30 seconds per cursor move | Time-gate: at most one fetch per workspace per 5 minutes; use in-memory cache | Immediately with any network latency |
| `fetchOrigin()` added to `useWorkspaces.fetchStatuses()` | Initial dashboard load takes 30-60 seconds with 10 workspaces × 3 repos | Keep `fetchStatuses` local-only (dirty check, branch name); staleness check is separate | Immediately on load |
| Circular template include resolution | Infinite loop / stack overflow during `readTemplate()` | Detect cycles with a `Set<string>` of visited template names in the resolver | On any circular reference |
| `listTemplates()` + `readTemplate()` called N times in composition resolver for N includes | N²  disk reads for deep composition chains | Memoize by name within a single resolution call | With 5+ levels of template nesting |
| `getCommitsBehind()` called for every repo on every workspace list refresh | Dashboard list refresh takes seconds | Call `getCommitsBehind()` only after a fetch has occurred; cache results until next fetch | Immediately on a 3-repo workspace |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unquoted values in `--format shell` output | Arbitrary shell code execution when `eval`'d | Single-quote all values; escape embedded single quotes with `'\''` |
| Printing env vars in `--format json` with template strings | JSON syntax error or injection if value contains `"` | Always use `JSON.stringify()` for the full output object |
| Logging env var values in debug output | Secrets (tokens, passwords) appear in logs | Never log env var values; log key names only |
| `includes:` template resolver following symlinks or absolute paths | Path traversal to templates outside the config dir | Resolve template names against the TEMPLATES_DIR only; reject names containing `/` or `..` |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| `git-stacks pull` aborts on first failure and leaves remaining repos unpulled | User must re-run; no visibility into which repos succeeded | Collect per-repo results; pull all repos best-effort; report summary at end |
| `git-stacks env` with no workspace argument is ambiguous from root cwd | Error: "workspace required" with no hint | Auto-detect from CWD using `detectWorkspaceFromCwd()`; fall back to explicit error with example |
| `git-stacks paths` outputs absolute paths with no format option | Agent scripts must handle platform path differences | Support `--format json` for structured output; `--relative` for relative-to-cwd output |
| Staleness indicator shows stale numbers after user runs `git-stacks sync` | Badge shows "5 behind" even after successful sync | Invalidate the per-workspace staleness cache after `sync`, `pull`, or `new` operations |
| Template composition silently applies divergent hooks and env from included templates | User is surprised by extra behavior they didn't write | Show a composition summary when creating a workspace from a meta-template |

---

## "Looks Done But Isn't" Checklist

- [ ] **`git-stacks env --format shell` safety:** Test with a value containing a space, `$VAR`, backtick, and semicolon — verify the output is safely quoted and `eval "$(git-stacks env --format shell)"` does not interpret those characters
- [ ] **`git-stacks env --format dotenv`:** Verify the output is parseable by `dotenv` npm package and by the bash `set -a; source .env; set +a` pattern
- [ ] **`git-stacks pull` trunk repos:** Verify trunk-mode repos pull from `default_branch` in registry, not from the workspace branch
- [ ] **`git-stacks pull` missing tracking:** Verify pull succeeds for a worktree where `hasUpstreamTracking()` returns false — it should call `ensureUpstreamTracking()` or use explicit `git pull origin <branch>`
- [ ] **`git-stacks pull` dirty worktree:** Verify dirty repos are skipped with a clear warning, not silently failed or errored
- [ ] **Template composition backward compat:** Parse an existing template YAML with no `includes` field through the updated `TemplateSchema` — verify it succeeds without errors
- [ ] **Template composition circular includes:** Include a template that includes itself — verify the resolver detects the cycle and returns a clear error, not an infinite loop
- [ ] **Template composition worktree-wins:** Create a meta-template that includes template A (repo X as trunk) and template B (repo X as worktree) — verify the composed result has repo X as worktree
- [ ] **TUI staleness indicator non-blocking:** Verify the dashboard cursor remains responsive while a background fetch is in-flight — navigate between workspaces while fetch is pending
- [ ] **TUI staleness time-gate:** Verify that focusing the same workspace twice within 5 minutes does NOT trigger a second fetch
- [ ] **`git-stacks paths --prefix`:** Verify the prefix is correctly prepended and output is one-arg-per-line or shell-quoted for paths with spaces
- [ ] **`git-stacks env` GS_* injection:** Verify `GS_WORKSPACE_NAME`, `GS_WORKSPACE_BRANCH`, `GS_WORKSPACE_PATH` appear in output alongside user-defined env vars

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Schema change breaks existing template YAML | HIGH | Revert schema change; add `.optional()` to the new field; re-release; no migration file needed for optional fields |
| Shell env output causes eval injection | HIGH | Remove `--format shell` output from user scripts; audit for any executed malicious payloads; re-release with correct quoting |
| Pull leaves repo in REBASE_HEAD state | MEDIUM | Run `git rebase --abort` in the affected worktree; add auto-abort to pull implementation |
| Composition circular reference causes stack overflow | MEDIUM | Restart git-stacks; add cycle detection; re-release; existing workspace YAML is unaffected |
| TUI staleness causes hang on load | LOW | Press `q` to exit dashboard; revert staleness fetch to be background-only; re-release |
| Wrong worktree-wins merge silently creates trunk repos | MEDIUM | User re-runs `git-stacks new` after fix; existing workspaces created with wrong mode require `task_path` worktree recreation |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Schema change breaks existing YAML | Template composition — schema first | Unit test: parse existing template fixture through new schema without `includes` field |
| `git pull` fails without upstream tracking | `git-stacks pull` implementation | Unit test: mock `hasUpstreamTracking` returning false → verify `ensureUpstreamTracking` is called before pull |
| Rebase-based pull leaves REBASE_HEAD state | `git-stacks pull` implementation | Use `--ff-only` by default; unit test: dirty worktree → repo skipped with warning |
| Shell eval injection via unquoted env values | `git-stacks env` implementation | Unit test: value with `$`, space, semicolon → output is single-quoted with escaped inner quotes |
| TUI staleness triggers blocking fetch | TUI staleness indicator | Integration test: focus workspace → verify render completes before fetch resolves; fetch runs in background |
| Template composition worktree-wins | Template composition resolver | Unit test: two templates with same repo, different modes → composed result uses worktree mode |
| Hook concatenation not persisted to workspace YAML | Template composition + workspace creation | Unit test: workspace created from meta-template → `workspace.hooks.post_create` contains hooks from all included templates |
| Circular template includes | Template composition resolver | Unit test: circular reference → resolver returns error, does not stack overflow |

---

## Sources

- `src/lib/config.ts` lines 59-91 — `TemplateSchema` current structure; `includes` field not yet present (direct codebase read)
- `src/lib/git.ts` lines 132-168 — `hasUpstreamTracking()`, `ensureUpstreamTracking()` — available for pull implementation reuse
- `src/lib/git.ts` lines 193-201 — `getCommitsBehind()` — staleness count using local remote-tracking refs
- `src/lib/git.ts` line 111-113 — `fetchOrigin()` uses `fetch.timeout=30` — network operation; 30s worst case
- `src/lib/workspace-ops.ts` lines 106-136 — `mergeEnv()`, `buildBaseEnv()`, `writeEnvFiles()` — existing env merge pattern
- `src/lib/workspace-ops.ts` lines 991-1100 — `syncWorkspace()` — dirty check + rebase pattern to replicate in pull
- `src/tui/dashboard/hooks/useWorkspaces.ts` — `fetchStatuses()` batch pattern; where staleness must NOT be added
- `src/tui/workspace-wizard.ts` lines 173-177 — single-template hook/env copy; must be updated for composition
- git-scm docs: git pull without upstream tracking: https://git-scm.com/docs/git-pull
- git-scm docs: git worktree and shared remote refs: https://git-scm.com/docs/git-worktree
- Shell quoting for eval-safe output: https://mywiki.wooledge.org/Quotes
- Dotenv format quoting edge cases: https://github.com/symfony/symfony/issues/23306
- SolidJS timer/polling patterns: https://primitives.solidjs.community/package/timer/
- git rev-list count ahead/behind: https://brandonrozek.com/blog/ahead-behind-git/

---
*Pitfalls research for: v0.10.0 — multi-agent workspace tooling in git-stacks*
*Researched: 2026-03-25*
