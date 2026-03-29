# Feature Research — v0.12.0 Multi-Workspace AeroSpace

**Domain:** CLI workspace manager — AeroSpace integration multi-workspace extension
**Researched:** 2026-03-29
**Confidence:** HIGH (codebase inspection + AeroSpace docs + prior milestone artifacts)

---

## Context

This is a **subsequent milestone** research document. v0.11.0/v0.11.1 shipped a complete
single-target AeroSpace integration. This research covers ONLY the new features needed for
multi-workspace support — distributing windows across multiple named AeroSpace workspaces
from a single git-stacks workspace open.

**Existing foundation (do not re-research):**
- `src/lib/aerospace.ts` — typed async wrappers, `snapshotWindowIds()`, injectable `_exec`
- `src/lib/integrations/aerospace.ts` — tier-3 plugin (order 31), `open()` with all single-workspace logic
- `aerospaceConfigSchema` — flat `workspace`, `layout`, `normalization`, `flatten_before_open`, `focus`, `commands` fields
- `WindowDetector` interface — `begin()`/`resolve()` snapshot-delta via `listWindows()`

**AeroSpace workspace model (verified facts):**
- Workspaces are user-defined strings in `~/.config/aerospace/aerospace.toml`
- `move-node-to-workspace --window-id <id> <name>` moves a single window to a named workspace
- `list-workspaces --all` enumerates all defined workspaces; target must pre-exist
- Switching visible workspace: `aerospace workspace <name>`
- Layout and flatten commands operate on the currently focused workspace context (or via `--workspace` flag on `flatten-workspace-tree`)
- AeroSpace has no event system — only polling

**The natural developer multi-workspace pattern** (from AeroSpace community + i3/Sway traditions):
- Editor (VS Code / IntelliJ) on workspace "2" or "dev"
- Browser / documentation on workspace "3" or "web"
- Terminal / runner on workspace "1" or a named workspace
- Communication apps pinned permanently to their own workspace
- Feature-branch work = one set of AeroSpace workspaces for that feature; switch feature = switch workspace bundle

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume work if the feature is called "multi-workspace AeroSpace support."
Missing any of these makes the feature incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `workspaces` array schema replacing flat single-workspace config | The entire point of the milestone: array = multiple targets. A single-entry array is the migration path from v0.11.0 flat config. | MEDIUM | `workspaces: z.array(aerospaceWorkspaceEntrySchema).min(1)`; each entry is the full existing schema minus `enabled`. Backward-compat: detect flat config (has `workspace:` at top level) and treat as `workspaces: [flatConfig]` at parse time. |
| Per-entry independent configuration | Each workspace entry needs its own `workspace`, `layout`, `normalization`, `flatten_before_open`, `focus`, `commands` | LOW | Each entry is structurally identical to the existing flat config. Code path: iterate array, run the existing per-workspace logic in a loop. No new command types needed. |
| Sequential processing — iterate array in order | Determinism: user declares the order; git-stacks processes in declaration order. Iteration order defines which workspace gets set up first. | LOW | `for (const entry of parsedConfig.workspaces)` replaces single-workspace dispatch. Existing steps (flatten → move bag windows → launch commands → layout → focus) repeat per entry. |
| Validate all workspace names before processing | AeroSpace workspace must pre-exist. Validate the full array upfront before any moves; partial validation (fail mid-array) leaves windows stranded. | LOW | Call `listWorkspaces()` once; check all entries' `workspace` names against the result set. Report all missing names, skip processing (or skip only missing entries). |
| Unrouted tier-1 windows default to first workspace | Tier-1 bag windows (vscode, intellij) have no per-workspace routing directive in the array config. Without an explicit routing rule they would be orphaned. Defaulting to first entry is the least-surprise behavior. | LOW | In the bag-window move step: if a `source:` command entry in a later workspace claims the bag artifact, move it there; otherwise move to `entry[0].workspace`. Requires source-matching to short-circuit the default. |
| Focus validation — at most one entry may have `focus: true` | Multiple `focus: true` entries would focus workspaces sequentially, leaving focus on the last one rather than the one the user intended. Silent multi-focus is confusing. | LOW | Zod `superRefine` on the array: count `entry.focus === true`; if count > 1 emit a `ZodIssue` describing which entries conflict. Or runtime validation in `open()` with a `p.log.warn`. Runtime warn is simpler — schema stays clean. |

### Differentiators (Features This Milestone Adds Beyond the Obvious)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `source:` command routing across workspace entries | A bag artifact (e.g., vscode) can be explicitly routed to any workspace entry via a `source: "vscode"` command in that entry's `commands` array. Without this, all bag windows default to the first workspace. This enables "editor on ws 2, browser on ws 3" patterns. | LOW | Already implemented in v0.11.0 `source:` branch; no code change needed. The routing logic: if any entry's `commands` contains `source: "vscode"`, that entry claims the vscode artifact and moves it; first-entry default applies to unclaimed artifacts. Clarify this in docs. |
| Per-workspace layout control | Each workspace in the array gets its own `layout` declaration. This enables "h_tiles on the editor workspace, v_accordion on the terminal workspace" — matching how power users configure i3/sway. | LOW | Already supported by per-entry schema; no new code. Ensure the layout step in the loop uses `entry.workspace` when focusing a window to apply layout. |
| Per-workspace `flatten_before_open` | Different workspaces may have accumulated different container nesting states. Allowing per-entry flatten gives fine-grained control: reset the editor workspace but leave the terminal workspace as-is. | LOW | Already in existing code; loops naturally make this per-entry. |
| Backward-compatible config migration | Users with v0.11.0 configs (`workspace: "5"` at top level) automatically get a single-entry `workspaces` array without any YAML editing. Zero migration friction. | MEDIUM | Parser detects old shape: `if ("workspace" in rawConfig && !("workspaces" in rawConfig))` → wrap as `{ workspaces: [rawConfig] }`. This keeps the Zod schema clean (only new shape) while being forgiving at the parse boundary. |

### Anti-Features (Avoid These)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Parallel workspace processing | "Process all workspaces simultaneously for speed" | AeroSpace window placement depends on previous-step snapshots; parallel snapshotWindowIds calls for multiple entries would produce overlapping before/after sets, causing window misattribution across workspace entries | Sequential processing only. The latency of snapshot-delta polling (200ms–10s per command per entry) is acceptable for a workspace-open operation. |
| Dynamic workspace creation | "Create the AeroSpace workspace if it doesn't exist" | AeroSpace workspaces are defined in `~/.config/aerospace/aerospace.toml`; the CLI cannot add workspaces at runtime. Any attempt would require TOML patching + `aerospace reload-config`, which disrupts all live workspace state. | Validate upfront, fail with a clear error pointing to `.aerospace.toml`. |
| Workspace-to-monitor routing per entry | "Send editor workspace to built-in display, browser to external" | `move-node-to-workspace` has no monitor parameter; `workspace-to-monitor-force-assignment` is an AeroSpace TOML option, not a runtime command; attempting multi-monitor placement from git-stacks requires TOML patching + reload | Document as out of scope. Users configure `workspace-to-monitor-force-assignment` in their `.aerospace.toml` directly. |
| Per-entry global focus validation in Zod schema | Tempting to use `z.array().superRefine()` to enforce single-focus at schema parse time | Focus validation in Zod produces hard errors that break workspace open entirely, even if the user only wants a warning. A runtime warn is less disruptive. | Validate at runtime in `open()`: count `focus: true` entries; if > 1, emit `p.log.warn` and proceed (last-wins semantics). Document expected behavior. |
| Nested `workspaces` arrays (workspaces within workspaces) | "Group entries by feature" | Adds schema complexity, processing complexity, and breaks the mental model. Each git-stacks workspace maps to one flat array of AeroSpace workspaces. | Keep the array flat. If users need grouping they use separate git-stacks templates. |
| Per-repo window routing | "Send the vscode instance for repo A to workspace 2 and repo B's vscode to workspace 3" | git-stacks spawns IDE integrations workspace-wide, not per-repo. Tier-1 integrations do not expose per-repo window IDs — they return one bag artifact per integration. Routing at that granularity is below the current abstraction floor. | Use `commands` entries with `app:` or `command:` to launch per-repo tools explicitly and route them via the commands array in the target workspace entry. |

---

## Feature Dependencies

```
[Existing single-workspace open() logic]
    └──refactors into──> [Per-entry processing loop]
                             └──iterates──> [workspaces array (new schema)]
                             └──per entry runs──> [flatten → bag-move → commands → layout → focus]

[workspaces array schema (new)]
    └──replaces──> [flat aerospaceConfigSchema.workspace field]
    └──parsed from──> workspace YAML integrations["aerospace"]
    └──backward-compat via──> [flat-config detection wrapper at parse boundary]

[Unrouted bag windows → first entry default]
    └──requires──> [workspaces array (new)] — need to know which is first
    └──uses existing──> [bag window move step in open()]
    └──source: routing already works——> no change needed for explicit routing

[Focus validation (runtime warn)]
    └──requires──> [workspaces array (new)] — need to scan all entries
    └──independent of——> all other processing steps

[Per-entry validation (workspace name exists)]
    └──requires──> [listWorkspaces() result] — one call, checked for all entries
    └──gates——> [per-entry processing loop]
```

### Dependency Notes

- **Array schema is the prerequisite for everything.** All new features are enabled by the schema change; once the array shape is defined, the processing loop falls out naturally from existing single-entry code.
- **Backward-compat wrapper must be at the parse boundary** — before Zod sees the config, not inside Zod. This keeps the Zod schema clean and avoids a union schema that makes type inference painful.
- **Source routing needs no code change** — the existing `source:` branch in `open()` already routes bag artifacts to the commands entry that claims them. The default-to-first behavior is a policy addition in the bag-move fallback path.
- **Focus validation is independent** — it only reads `entry.focus` from each entry; does not affect any other step; can be added or removed without touching processing logic.
- **Single `listWorkspaces()` call upfront** — call once, validate all entries before the loop starts; prevents partial-state issues from mid-loop failures.

---

## MVP Definition

### Must Ship (v0.12.0 core)

- [ ] `workspaces` array schema + backward-compat flat-config detection — without this, no multi-workspace is possible
- [ ] Per-entry processing loop in `open()` — flat iteration of existing steps, one per array entry
- [ ] Unrouted bag windows default to first entry — prevents tier-1 (vscode, intellij) windows from being orphaned
- [ ] Upfront validation of all workspace names — prevents silent partial-setup failures
- [ ] Focus validation (runtime warn, last-wins) — prevents confusing multi-focus behavior

### Release Prep (required to close milestone)

- [ ] Version bump to v0.12.0, CHANGELOG entry, README update documenting new `workspaces` array config format with examples showing old flat config vs new array

### Defer to Later

- Multi-monitor workspace routing — requires AeroSpace TOML patching, too invasive for this milestone
- `git-stacks env` dump command — listed in PROJECT.md Active but not blocked on multi-workspace; separate feature
- Per-repo window routing — below current abstraction floor; no demand signal

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `workspaces` array schema | HIGH | MEDIUM | P1 — foundation |
| Backward-compat flat-config detection | HIGH | LOW | P1 — no migration friction |
| Per-entry processing loop | HIGH | LOW | P1 — loops the existing code |
| Upfront workspace name validation | HIGH | LOW | P1 — prevents silent failures |
| Unrouted bag windows → first entry | HIGH | LOW | P1 — tier-1 windows must land somewhere |
| Focus validation (warn + last-wins) | MEDIUM | LOW | P1 — correctness, low cost |
| Source routing (already works) | MEDIUM | NONE | P1 — document, no code change |
| Per-entry layout / flatten config | MEDIUM | NONE | P2 — falls out of loop naturally |
| README / CHANGELOG update | HIGH | LOW | P1 — release gate |

**Priority key:**
- P1: Required for a shippable v0.12.0
- P2: Emerges naturally from the loop refactor; zero additional effort
- P3: Not in this milestone

---

## Config Shape: Before and After

### v0.11.x (flat — still supported via backward-compat)

```yaml
settings:
  integrations:
    aerospace:
      enabled: true
      workspace: "5"
      layout: h_tiles
      focus: true
      commands:
        - source: vscode
```

### v0.12.0 (array — canonical new shape)

```yaml
settings:
  integrations:
    aerospace:
      enabled: true
      workspaces:
        - workspace: "2"
          layout: h_tiles
          commands:
            - source: vscode
        - workspace: "3"
          focus: true
          commands:
            - app: "Safari"
        - workspace: "1"
          commands:
            - command: "wezterm start"
              cwd: "$GS_WORKSPACE_PATH"
```

**Key behaviors visible in the example above:**
- `vscode` bag artifact routed explicitly to workspace "2" via `source: vscode`
- Safari launched fresh on workspace "3"; `focus: true` switches AeroSpace to workspace "3" after setup
- Terminal launched on workspace "1" with cwd expansion
- If vscode were not claimed by any entry's `source:` command, it would default to workspace "2" (first entry)

---

## Sources

- `src/lib/integrations/aerospace.ts` — existing `open()` logic; all single-workspace steps are the loop body for the new multi-entry implementation; HIGH confidence
- `src/lib/aerospace.ts` — typed wrappers; `listWorkspaces()` for name validation; `moveNodeToWorkspace()`; HIGH confidence
- `.planning/PROJECT.md` — v0.12.0 milestone target features; HIGH confidence
- AeroSpace official guide (https://nikitabobko.github.io/AeroSpace/guide) — workspace model, `on-window-detected`, `persistent-workspaces`, monitor assignment; MEDIUM confidence (docs current as of 2026-03-29)
- AeroSpace commands reference (https://nikitabobko.github.io/AeroSpace/commands) — `move-node-to-workspace`, `workspace`, `layout`, `flatten-workspace-tree`; MEDIUM confidence
- AeroSpace community discussion #756 (layout scripts) — pattern of sequential script-driven workspace setup; MEDIUM confidence
- i3/Sway community: editor on ws 2, browser on ws 3, terminal on ws 1 as the standard developer multi-workspace layout; MEDIUM confidence (widely documented pattern)
- `.planning/research/FEATURES.md` (v0.11.0) — prior research; anti-features still valid; HIGH confidence

---

*Feature research for: git-stacks v0.12.0 Multi-Workspace AeroSpace*
*Researched: 2026-03-29*
