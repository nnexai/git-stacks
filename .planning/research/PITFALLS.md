# Pitfalls Research

**Domain:** CLI workspace manager — adding operation runner/rollback, config indexing, plugin contracts, template labels
**Researched:** 2026-04-05
**Confidence:** HIGH (based on direct codebase analysis + known patterns in this domain)

---

## Critical Pitfalls

### Pitfall 1: Rollback That Only Half-Undoes

**What goes wrong:**
An operation runner records compensating actions but applies them out of order, or applies them against state that was already mutated by later steps. Example: a workspace creation that creates a worktree, writes a YAML, and calls `post_create` hooks — if the rollback fires after hook failure, it deletes the YAML but leaves the worktree on disk. Or if rollback order is `[step1_undo, step2_undo, step3_undo]` instead of the required `[step3_undo, step2_undo, step1_undo]`, earlier undos depend on side effects that later undos already destroyed.

**Why it happens:**
Developers push compensating actions into a list in forward order, then iterate it forward instead of reversed. Git worktree creation, YAML writes, hook execution, and IDE session spawning all have different failure surfaces and must be undone in strict LIFO order.

**How to avoid:**
- Use a typed `CompensationStack` (not an array of plain strings): each entry is `{ label: string; undo: () => Promise<void> }`.
- Push entries with `stack.push()` immediately after each successful step, and always pop with `while (stack.length) await stack.pop()!.undo()`.
- Never register an undo that assumes a later step succeeded.
- Run undo steps in reverse (pop from end, not shift from front).
- Wrap each undo in a try/catch that logs but does not abort — a failing undo must not prevent subsequent undos from running.

**Warning signs:**
- Rollback function takes the `steps` array as a parameter and iterates with `for (const step of steps)`.
- Undo functions share mutable state (e.g., a `createdPaths` object mutated by multiple steps).
- Tests for rollback only cover the "last step fails" case, not "middle step fails".

**Phase to address:**
Operation runner phase (first phase of v0.17.0).

---

### Pitfall 2: Template Labels Not Copied at Creation Time

**What goes wrong:**
Template labels are stored on `Template.labels` but not snapshotted into the workspace YAML at creation time. The workspace inherits labels lazily by looking them up via its `template` field at runtime. When the template is later edited (labels added or removed), all historical workspaces retroactively gain or lose labels — violating the "workspace YAML is self-contained at creation" invariant that the entire system relies on.

**Why it happens:**
Template-to-workspace propagation feels "obvious" when the template field already links to the template. Developers reach for runtime resolution instead of copying, reasoning that it's DRY. The existing system already has this invariant for env, hooks, and repos — but labels are a new field, and the invariant must be explicitly applied to it.

**How to avoid:**
- In the workspace creation path, copy `template.labels ?? []` into `workspace.labels` before writing the YAML.
- Merge: if the user also specified labels at creation time, union them with the template labels.
- Treat label propagation identically to how `env` propagation is handled: deep-copy, not reference.
- Add a test that creates a workspace from a labeled template, then mutates the template's labels, and asserts that the workspace labels are unchanged.

**Warning signs:**
- Labels are resolved at read time via `readTemplate(ws.template)?.labels`.
- No label fields appear in the workspace YAML written during `git-stacks new`.
- The `WorkspaceSchema` has `labels` optional but nothing in the creation flow sets it from the template.

**Phase to address:**
Template labels phase (likely first or second phase of v0.17.0).

---

### Pitfall 3: Index Divergence from Disk Truth

**What goes wrong:**
An in-memory or on-disk index is populated by scanning YAML files, but the index is not updated on every write. A workspace is created (YAML written, index not updated), then an immediate `list` command reads from the stale index and omits the new workspace. Or conversely, a workspace is deleted (YAML removed) but the index still contains its entry — causing "workspace not found" errors when the index entry is acted upon.

**Why it happens:**
Index updates are added at the "obvious" write sites (create, remove) but missed at rename, update (YAML patch), and clone paths. The scan-based approach is self-healing (always reads current disk state); an index trades accuracy for speed and breaks in partial-update scenarios.

**How to avoid:**
- Make every `write*` function in `config.ts` the single update point — index write is part of the same atomic operation as the YAML write. Never update the index outside of the paired `read*/write*` functions.
- On index read, add a staleness check: compare the workspace YAML `mtime` against the index entry's recorded `mtime`. On mismatch, fall back to direct YAML parse and repair the index.
- Provide an explicit `rebuildIndex()` operation that `doctor --fix` can invoke.
- Design the index as an acceleration structure, not the source of truth: every index miss falls back to a YAML scan and backfills the index.

**Warning signs:**
- Index update logic appears in command handlers instead of in `config.ts` write functions.
- No `mtime` or content hash stored in index entries.
- Tests only cover the "index is warm" path; no tests for "index is empty, YAML exists".
- `doctor` has no index integrity check.

**Phase to address:**
Indexed config store phase. Needs a test proving index + scan produce identical results for all CRUD operations.

---

### Pitfall 4: Breaking the Integration Interface Without a Deprecation Path

**What goes wrong:**
A "plugin contract" phase adds required fields or renames methods on the `Integration` interface — `applies()` becomes required, `configurePrompt()` gets a new required parameter, a new `capabilities` field is added. All 10 existing plugins immediately fail to compile. The fix is a grep-and-add across 10 files. If done carelessly, plugins get stub implementations that silently misbehave rather than type errors that force correctness.

**Why it happens:**
TypeScript structural typing means adding required interface members breaks all implementations immediately. Developers underestimate how many plugins implement the interface and add required fields without checking each implementation.

**How to avoid:**
- Use optional fields with defaults in the runner. If a new field is required for correctness, add it as optional to the interface and enforce the invariant in `runner.ts` with an explicit `if (!integration.capabilities) throw ...` check on registration.
- When a method signature changes (e.g., new required parameter), prefer adding a new optional parameter over changing the existing signature. `open(ctx, artifact, bag, opts?: RunnerOpts)` instead of changing the third parameter.
- After adding any interface change, run `bun run typecheck` before committing. Add a "does every plugin still satisfy the interface" check.
- For genuine breaking changes, add a migration comment in the runner: `// TODO remove in v1.0: legacy plugins may omit X`.

**Warning signs:**
- `Integration` interface changes are in the same commit as plugin usage changes (masking the breakage surface).
- New required field added to `Integration` without checking all 10 plugin files compile.
- `configurePrompt` or `open` parameter count changes.

**Phase to address:**
Plugin contract / capability phase of v0.17.0.

---

### Pitfall 5: DI Container That Adds More Complexity Than It Removes

**What goes wrong:**
A dependency injection container is introduced to wire up `logger`, `git`, `config`, and `secrets` — but it requires all callers to import a container instance, wrap every function call in a `container.get(...)`, and add new types for each service. The refactor touches 30+ files for a benefit that existing patterns (mutable `_exec` objects, `useIsolatedConfig` helper) already achieve for testing. End result: more abstraction, same testability, harder to grep call sites.

**Why it happens:**
DI frameworks are familiar from server-side TypeScript. Developers apply them to CLI tools without accounting for the fact that CLI processes are short-lived and stateless — the "constructor injection" problem that DI solves (long-lived object graphs) does not exist in a CLI context.

**How to avoid:**
- Keep the existing `_exec` injectable pattern for subprocesses. Extend it only where a new subprocess-spawning module is added.
- For structured logging, use a simple module-level `logger` object with a replaceable `sink` function — not a DI container. `logger.sink = process.stderr.write.bind(process.stderr)` is enough; tests replace `logger.sink`.
- DI is acceptable at the `IntegrationContext` level (already exists) where the context is passed explicitly. Do not introduce a global container.
- If a function needs a new collaborator (e.g., a port allocator), pass it as a parameter with a sensible default: `function openWorkspace(ws, opts = { ports: defaultPortAllocator })`.

**Warning signs:**
- A `container.ts` or `di.ts` file is created.
- Existing `_exec` patterns are replaced with injected service objects across the codebase.
- `IntegrationContext` grows more than 2 new fields in a single phase.

**Phase to address:**
DI / structured logging phase. Scope to "add a `logger` object and wire it to the decomposed workspace modules" — not a full DI refactor.

---

### Pitfall 6: Rollback Triggering Hooks After Partial Failure

**What goes wrong:**
A workspace creation fails midway. The operation runner's rollback fires and removes the worktrees and YAML. However, `pre_create` hooks already ran (they ran before the git operations). The rollback does not know that hooks ran, so it does not run `pre_remove` hooks. The user's project is left in whatever state the `pre_create` hooks put it in (e.g., a database schema migration, a DNS entry, a Slack channel created). Alternatively, rollback tries to run `post_remove` hooks — but the workspace YAML no longer exists, so the hooks cannot resolve the workspace context.

**Why it happens:**
Hooks and git/YAML operations are treated as equivalent steps in the rollback ledger, but hooks are opaque shell commands that may have arbitrary external side effects. Rollback cannot undo what it cannot model.

**How to avoid:**
- Do not run `pre_create` hooks until after all git/YAML operations succeed. Then if git/YAML fails, hooks never ran and there is nothing to undo on the hooks side.
- If hooks must run early (e.g., to provision external resources), document clearly that the operation is not fully atomic past the hook boundary and provide user-facing warnings.
- The rollback runner should log "WARNING: pre_create hooks ran but cannot be automatically reversed. Manual cleanup may be required." rather than silently leaving the system in a partial state.
- Add `GS_ROLLBACK=1` env var to any compensating hooks that do run, so hook authors can detect the rollback scenario.

**Warning signs:**
- `runHooks("pre_create")` is called before `createWorktrees()` in the operation plan.
- Rollback function has a `runHooks("post_remove")` call.
- No test covers "pre_create hooks ran, then git op failed".

**Phase to address:**
Operation runner phase — define a clear hook/git ordering contract before writing any rollback code.

---

### Pitfall 7: Scan-to-Index Migration Silently Dropping Entries

**What goes wrong:**
The indexed config store writes an index file to `~/.config/git-stacks/index.json`. On first run after upgrade, the index is absent and the tool tries to build it by scanning. The scan uses the current `WorkspaceSchema` which has evolved since some users' YAML files were written. Old YAML files fail Zod validation (e.g., missing new required fields) and are silently excluded from the index. Those workspaces become invisible to the indexed path but visible to the scan path — so `git-stacks list` (indexed) shows fewer workspaces than `git-stacks status` (still scan-based). User data appears lost.

**Why it happens:**
Schema evolution without forward migration. The `schema_version` field exists in all workspace YAMLs but no migration functions are implemented — the comment in `config.ts` says "keyed by version" but the implementation is empty.

**How to avoid:**
- Build the index using `safeParse` with fallback: if strict parse fails, attempt a lenient parse with `.passthrough()` and include the entry with a `schema_version_mismatch: true` flag. The `doctor` command can then surface these entries.
- Never let an index build silently drop entries — always emit a warning to stderr for each parse failure.
- Test: corrupt one YAML in the test fixture, build the index, assert the other workspaces are still present and the corrupted one appears in a warnings list.
- Before switching any command from scan to index, confirm that `safeParse` failures are logged and handled gracefully.

**Warning signs:**
- Index build iterates YAML files and calls `WorkspaceSchema.parse()` (throwing) instead of `safeParse()`.
- No test exercises the "one bad YAML in a directory of good ones" scenario.
- `git-stacks doctor` has no index integrity section.

**Phase to address:**
Indexed config store phase. Migration safety must be validated before the index is used in any non-read-only path.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip rollback for read-only steps | Simpler ledger | No harm | Always — only track write steps |
| Use `any` in CompensationStack undo closures | Less boilerplate | Closures capture mutable vars, undo acts on wrong state | Never — capture immutable values at push time |
| Index-only mode (no fallback scan) | Faster reads | Data loss risk on partial write | Never in v0.x |
| Add optional interface fields for plugins | No immediate breakage | Stale defaults accumulate | Acceptable with explicit TODO to make required in v1.0 |
| Single global logger sink | Simple | Not TUI-safe if sink is stdout | Only if TUI silencing is applied before dashboard starts |
| Propagate labels by reference to template at runtime | DRY | Violates workspace self-containment invariant | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Git worktree rollback | Call `git worktree remove` without `--force` — fails if worktree has untracked files | Always use `--force` in rollback context; workspace creation failed, data loss is acceptable |
| tmux session rollback | Kill a non-existent session causes error that aborts the rollback chain | Check `tmux has-session -t name` before `kill-session`; swallow "not found" errors in undo |
| IDE artifact rollback | Delete `.code-workspace` but leave VSCode window open — next open creates a duplicate session | Log "cannot close VSCode window automatically" rather than silently deleting the artifact |
| YAML atomic write rollback | `renameSync(tmp, dst)` already ran — rollback must delete `dst`, not `tmp` | Track the final path at push-to-ledger time, not the tmp path |
| Plugin `commands()` registration | Registering commands inside `commands()` assumes Commander parent is set up — called before `program.parse()` | Always call `commands()` during command tree setup, not lazily |
| Index + scan race | Index is built, then a new workspace is created by a parallel process before index is written | Index file write must be atomic (tmp+rename), same as YAML writes |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Rebuilding index on every command | Startup latency grows linearly with workspace count | Build index once; invalidate only on writes; never scan in hot path | ~50 workspaces |
| Running `safeParse` on every YAML for every command | `list` takes 200ms with 30 workspaces | Index stores name → filepath + mtime; full parse done on demand | ~20 workspaces |
| Holding full `Workspace` objects in index | Index file as large as individual YAMLs combined | Index stores only name + filepath + mtime | ~100 workspaces |
| Running integration `applies()` during index build | Imports all 10 integration modules at startup | `applies()` is workspace-context check — never call at config-scan time | Immediate |
| Structured logger formatting every git op | Adds string overhead to every git call | Gate logging behind `GIT_STACKS_DEBUG` check before constructing log message | Imperceptible until git ops in a hot loop |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Labels copied from template without schema re-validation | Injected label bypasses `LabelSchema` regex if copied as raw string | Apply `LabelSchema.parse()` to each copied label at workspace creation time |
| Rollback log written to workspace YAML | Log may contain partial git output with credentials | Rollback log goes to stderr only, never persisted to YAML |
| Index file world-readable | Index exposes all workspace names and paths | Index written with same permissions as existing config files (user-only via umask) |
| Plugin `configurePrompt` persists raw user input | Plugin stores uncleaned input (e.g., API tokens) in `globalConfig.integrations[id]` | Plugin must apply its own Zod schema before persisting; runner does not sanitize plugin config |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Rollback silently succeeds with no output | User does not know if workspace was partially created or fully cleaned up | Print explicit "Creation failed — all changes rolled back." or "Creation failed — partial cleanup, manual action required." |
| Template labels silently discarded on conflict with workspace labels | User adds labels at creation time, template labels disappear | Always union template labels + user labels; deduplicate silently |
| Index rebuild on `doctor --fix` takes 5 seconds | User thinks the tool hung | Print "Rebuilding config index..." before starting, "Done." when finished |
| Plugin capability contract error printed as raw TypeScript | `TypeError: integration.capabilities is undefined` in production | Validate plugin registration at startup with plain-English error: "Integration 'X' is missing required capability declaration" |

---

## "Looks Done But Isn't" Checklist

- [ ] **Template label propagation:** Labels appear in workspace YAML at creation — verify by reading the written YAML file, not just the in-memory struct.
- [ ] **Rollback completeness:** Every step that writes to disk or spawns a process has a corresponding undo entry — verify by counting compensation entries against operation steps.
- [ ] **Rollback reversal order:** Undos run in reverse of registration — verify with a test that mocks each step and asserts undo call order is reversed.
- [ ] **Index fallback:** Deleting the index file and running `git-stacks list` produces identical output to the scan-based path — verify with a diff test.
- [ ] **Plugin compilation:** All 10 integration plugins compile after any `Integration` interface change — verify with `bun run typecheck` in CI.
- [ ] **Label schema enforcement:** Labels copied from templates are re-validated through `LabelSchema` — verify by placing an invalid label in a template fixture and asserting workspace creation fails with a clear error.
- [ ] **Rollback no-throw:** Each undo step is wrapped in try/catch — verify that if the second undo throws, the third undo still runs.
- [ ] **Index mtime check:** An index entry whose mtime differs from the current file mtime is not used — verify by writing a workspace YAML after the index is built and asserting the index re-reads the file.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Partial-order rollback left orphaned worktrees | MEDIUM | `git worktree list` in each registered repo, manually prune with `git worktree remove --force <path>` |
| Index diverged from disk | LOW | `git-stacks doctor --fix` triggers `rebuildIndex()` |
| Labels not propagated to existing workspaces | LOW | `git-stacks label add <workspace> <label>` per workspace; no batch command needed if labels are new |
| Plugin interface change broke a custom third-party plugin | MEDIUM | Plugin author must add the new field; document the change in CHANGELOG with before/after example |
| Template label with illegal characters in user's YAML | LOW | Schema validation on read will error; user edits the YAML directly |
| Rollback left YAML written but worktree absent | MEDIUM | `git-stacks doctor` detects missing worktrees; `doctor --fix` removes the orphaned YAML |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Rollback out-of-order | Operation runner (define CompensationStack type first) | Unit test: 3-step op, middle fails, assert undo call order is [3, 2, 1] |
| Labels not copied at creation | Template labels propagation | Integration test: create workspace from labeled template, mutate template, assert workspace labels unchanged |
| Index divergence | Indexed config store | Diff test: `listWorkspaces()` via index === `listWorkspaces()` via scan for all CRUD ops |
| Breaking plugin interface | Plugin contracts / capability phase | `bun run typecheck` passes with all 10 plugins after interface change |
| Over-engineered DI | DI + logging (scope-gate: only logger + 5 modules) | No `container.ts` file exists; `_exec` pattern unchanged |
| Hooks running before git ops | Operation runner | Test: pre_create mock hook ran, git op fails, assert post_remove hook NOT called |
| Index dropping Zod-invalid entries | Indexed config store (migration safety) | Test: one bad YAML in fixture, index build completes, warning emitted, other workspaces present |
| Label schema bypass | Template labels | Test: invalid label in template YAML, workspace creation returns Zod error |

---

## Sources

- Direct codebase analysis: `src/lib/config.ts`, `src/lib/integrations/types.ts`, `src/lib/labels.ts`, `.planning/PROJECT.md`
- Established invariants from CLAUDE.md: workspace YAML self-containment, atomic writes, `_exec` injectable pattern, scan-based lookup behavior
- Pattern: LIFO compensation stacks — standard in saga/transaction patterns for distributed systems, applicable to multi-step CLI ops
- Pattern: index-as-cache (not source of truth) — mtime-based invalidation is the simplest correct approach for a single-user CLI
- Known anti-pattern: DI containers in short-lived CLI processes (documented in many Go/Rust CLI codebases)

---
*Pitfalls research for: git-stacks v0.17.0 Engine Hardening & Template Labels*
*Researched: 2026-04-05*
