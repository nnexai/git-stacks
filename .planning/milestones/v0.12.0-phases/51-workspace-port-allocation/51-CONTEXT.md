# Phase 51: Workspace Port Allocation - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Workspaces and templates can declare named ports (`ports: Record<string, number | null>`). On `git-stacks open`, null ports are auto-allocated from a global contiguous pool and injected as environment variables via `mergeEnv()`. Allocation is collision-free, race-safe (filesystem lock), and stable across repeated opens. Fixed/shared ports that don't need collision management belong in `env:`, not `ports:`.

</domain>

<decisions>
## Implementation Decisions

### Port declaration UX
- **D-01:** Wizard uses a single comma-separated text prompt: "Port names (comma-separated, leave empty to skip):" — user types `PORT,DEBUG_PORT,HMR_PORT` or hits enter to skip. Written as `ports: { PORT: ~, DEBUG_PORT: ~, HMR_PORT: ~ }` in workspace YAML.
- **D-02:** Pinning allowed — `ports: { PORT: 3000, DEBUG_PORT: ~ }`. Pinned ports (explicit numbers) skip auto-allocation but ARE collision-checked against other workspaces. Pinning makes sense at workspace level; templates should generally use `~` since multiple workspaces derive from them.
- **D-03:** Adding ports post-creation: user edits workspace YAML to add new port names with `~` values, then runs `git-stacks open`. Allocator picks up new null ports. No dedicated command needed.

### Conflict & collision behavior
- **D-04:** Template + workspace same port name: workspace wins (overrides template value). Consistent with env last-wins pattern from template composition.
- **D-05:** Port env-name collision: if a port name collides with a key in `env:` or `env_file`, `open` errors with a clear message identifying the conflict. No silent overwriting.
- **D-06:** Reopen conflict (resolved port now used by another workspace): ERROR with message suggesting `--reallocate`. User must opt-in to reallocation. This protects scripts/configs that hardcoded port numbers.
- **D-07:** `--reallocate` flag reallocates ONLY the conflicting ports, not all ports. Non-conflicting resolved ports remain stable.
- **D-08:** Shared/well-known ports (e.g., always port 3000): use `env: { PORT: "3000" }` instead of `ports:`. `env:` values are NOT collision-checked. `ports:` is for managed allocation; `env:` is for unmanaged fixed values. This cleanly solves the "template with pinned port creating multiple workspaces" problem — move the pin to `env:`.

### Stability vs reallocation
- **D-09:** Re-open with resolved ports: keep existing numbers if conflict-free. No reallocation unless conflicts detected.
- **D-10:** Global range change (range_start/range_end moved): treat out-of-range resolved ports the same as conflicts — error with `--reallocate` suggestion. Consistent with conflict behavior.
- **D-11:** No dedicated `--reallocate-all` flag. To force full reset: user edits YAML to set ports back to `~`, then re-opens. Consistent with the edit-and-reopen pattern.

### Template port inheritance
- **D-12:** Ports are snapshot at workspace creation time. Template changes after creation don't flow into existing workspaces. Consistent with how repos/hooks work today.
- **D-13:** Contiguous allocation spans ONLY auto-allocated (null) ports. Pinned ports live wherever the user put them, outside the contiguous block. Auto-allocated ports get a contiguous block from the global pool.

### Claude's Discretion
- Filesystem lock implementation details (timeout, stale lock detection, retry behavior)
- fsync addition to existing `writeYaml` (already does tmp+rename, needs fsync before rename per PORT-WRITE-01)
- Exact error message formatting for port conflicts and out-of-range errors
- Whether `doctor` should check for port conflicts across workspaces
- Port allocation algorithm internals (first-fit scan of sorted taken ranges)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema (primary modification targets)
- `src/lib/config.ts` lines 72-97 — `TemplateSchema`: add optional `ports: Record<string, number | null>`
- `src/lib/config.ts` lines 139-156 — `WorkspaceSchema`: add optional `ports: Record<string, number | null>`
- `src/lib/config.ts` lines 158-163 — `GlobalConfigSchema`: add `ports: { range_start, range_end }` with defaults

### Port allocation (new code)
- `src/lib/workspace-ops.ts` lines 107-111 — `mergeEnv()`: injection point for resolved ports as env vars
- `src/lib/workspace-ops.ts` lines 113-125 — `buildBaseEnv()`: calls `mergeEnv()`, where ports merge in
- `src/lib/config.ts` lines 184-189 — `writeYaml()`: already atomic (tmp+rename), needs fsync addition
- `src/lib/config.ts` lines 266-269 — `writeWorkspace()`: writes workspace YAML (port writeback target)
- `src/lib/config.ts` lines 271-284 — `listWorkspaces()`: scan all workspaces (for building taken-ports set)

### Wizard (port prompt)
- `src/tui/workspace-wizard.ts` — workspace creation wizard; add comma-separated port name prompt

### Template composition
- `src/lib/composition.ts` lines 89, 228 — `mergeEnvVars()`: env merge precedence; port merge should follow same pattern (workspace wins)

### Lock file
- `src/lib/paths.ts` — add PORTS_LOCK_FILE constant (`~/.config/git-stacks/.ports.lock`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `writeYaml()` already does atomic tmp+rename — just needs fsync before rename
- `mergeEnv()` / `buildBaseEnv()` / `buildRepoEnv()` — existing env injection chain, ports plug in at `mergeEnv`
- `listWorkspaces()` — scans all workspace YAMLs, reuse for building taken-port set
- Template composition `mergeEnvVars()` — precedence pattern to follow for port merge

### Established Patterns
- Zod schemas with `.optional()` and `.default()` — ports field follows same pattern
- `readYaml()` / `writeYaml()` — all config I/O centralized in config.ts
- Error-as-result pattern `{ ok: true } | { ok: false; error: string }` — use for allocation results
- `UPPER_SNAKE_CASE` path constants in `paths.ts` — add `PORTS_LOCK_FILE`

### Integration Points
- `openWorkspace()` in workspace-ops.ts — call port allocator before `mergeEnv()` / hook execution
- `removeWorkspace()` — no special port cleanup needed (ports stored in workspace YAML which is deleted)
- Workspace creation flows (new, clone, wizard) — snapshot template ports into workspace at creation time
- `--reallocate` flag on `open` command in `src/commands/workspace.ts`

</code_context>

<specifics>
## Specific Ideas

- Pinned ports in templates are a foot-gun (second workspace errors) — consider a `doctor` warning when templates have pinned ports, suggesting `env:` instead
- Port names are used as-is for env vars — no prefix, no transformation. `ports: { PORT: 12400 }` becomes `PORT=12400`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 51-workspace-port-allocation*
*Context gathered: 2026-04-01*
