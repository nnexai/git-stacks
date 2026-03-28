# Feature Research — v0.11.0 AeroSpace Window Management Integration

**Domain:** CLI workspace manager — macOS tiling window manager integration (AeroSpace)
**Researched:** 2026-03-28
**Confidence:** HIGH (codebase inspection + direct CLI exploration notes in _references/aerospace.md)

---

## Context

Subsequent milestone on an existing codebase (v0.10.1 shipped 2026-03-28). This research covers
ONLY the new AeroSpace integration features. Existing functionality — integration plugin system,
`WindowDetector` interface, `ArtifactBag`, tier ordering, injectable `_exec` pattern — is assumed
stable and is the direct implementation substrate.

**Niri integration (`src/lib/integrations/niri.ts`) is the feature parity reference.** The AeroSpace
integration must match niri's capability shape while adapting for AeroSpace's fundamentally different
model: numbered/named workspaces (not dynamic), `window-id` as the operational handle (not niri
window ID), and normalization-sensitive layout commands.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume work from day one. Missing any of these makes the integration feel
incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| AeroSpace shell wrappers (`src/lib/aerospace.ts`) | Niri has `src/lib/niri.ts` with typed async wrappers + injectable `_exec`; AeroSpace must follow the same pattern for testability | MEDIUM | `list-windows --format`, `list-workspaces --format`, `move-node-to-workspace`, `layout`, `workspace`, `flatten-workspace-tree`; `--format` tab-delimited parsing; injectable `_exec.run` for test isolation |
| Integration plugin (`src/lib/integrations/aerospace.ts`) | Every integration in the codebase is a plugin; adding AeroSpace any other way breaks the pattern | MEDIUM | Tier-3 (order 30-39); `enabledByDefault: false`; `isEnabled()` via `resolveEnabled()`; `open()` returns null; macOS-only gate via binary check |
| Binary availability gate (`isAeroSpaceRunning()` / binary check) | Niri gates on `NIRI_SOCKET`; AeroSpace should gate on binary availability + process running; absence must be silent, not an error | LOW | `which aerospace` + process detection; return null from `open()` without error output when not available; clean silent gate |
| Target workspace configuration (`settings.integrations.aerospace.workspace`) | User must specify which AeroSpace workspace to send windows to; AeroSpace workspaces are numbered/named by user config — not auto-created | LOW | Zod schema field: `workspace: z.string()` (e.g. `"5"`, `"dev"`, `"work"`); workspace must already exist in AeroSpace config |
| Snapshot-delta window detection (`WindowDetector`) | Niri has `windowDetector` with `begin()`/`resolve()`; runner.ts calls it for all tier-1 artifacts; AeroSpace needs the same for its window IDs | MEDIUM | `begin()` calls `list-windows --format`, captures `Set<number>` of window-ids; `resolve()` polls with exponential backoff (same 10s timeout / 200ms initial as niri); returns new window-ids |
| Move new windows to target workspace | The core reason to use the integration: windows spawned by tier-1 integrations (vscode, intellij) should appear on the configured AeroSpace workspace | MEDIUM | Iterate `ArtifactBag`; for each `WindowArtifact` with `windowIds["aerospace"]`, call `move-node-to-workspace --window-id <id> <target>`; partial failure is acceptable (log warn, continue) |
| Doctor check for `aerospace` binary | All integration binaries are checked in `doctor.ts`; AeroSpace must appear in the binary list | LOW | Add `{ name: "aerospace", required: false, install: "https://nikitabobko.github.io/AeroSpace/guide" }` to binary list in `doctor.ts`; follow existing warn-level pattern |
| `cleanup()` on workspace close/remove | Niri has cleanup (unnames the workspace); AeroSpace has no named-workspace state to clean up, but cleanup hook must exist | LOW | AeroSpace cleanup is a no-op: the integration does not create AeroSpace workspaces (user-configured, numbered); implement `cleanup()` as async no-op returning void |

### Differentiators (Features Unique to AeroSpace)

Features that niri does not have, enabled by AeroSpace-specific CLI capabilities.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Normalization-aware layout control | AeroSpace's `split` is a no-op when `enable-normalization-flatten-containers = true`; using the right command matters; integration should detect normalization state and use `join-with`/`flatten-workspace-tree` vs `split` | HIGH | Two approaches: (1) read TOML directly (`~/.config/aerospace/aerospace.toml`) and inspect `enable-normalization-flatten-containers`; (2) user configures `normalization: true|false` in workspace YAML; approach (2) is simpler and does not require TOML parsing; document that `aerospace config --get` is unreliable for all keys |
| Root layout control via `layout` command | Set the workspace's root container layout (`h_tiles`, `v_tiles`, `h_accordion`, `v_accordion`) on open; niri has no equivalent root-layout concept | MEDIUM | Config field: `layout: z.enum(["h_tiles", "v_tiles", "h_accordion", "v_accordion"]).optional()`; issued after moving windows; scoped to `--workspace <target>` |
| `flatten-workspace-tree` normalization reset | Reset any nested container structure on the target workspace before placing windows; ensures clean state when re-opening a workspace | LOW | Optional config flag: `flatten_before_open: z.boolean().optional()`; call `aerospace flatten-workspace-tree --workspace <target>` before window placement; useful when user re-opens a workspace with leftover container nesting |
| `focus-workspace` subcommand | Bring an AeroSpace workspace to focus by workspace name; matches niri's `focus-workspace` subcommand under `git-stacks integration aerospace` | LOW | `aerospace workspace <id>` under the `commands()` subcommand hook; same pattern as niri's `focus-workspace [workspace]` subcommand |
| `commands` array for launching apps | Niri supports `commands` array in config; AeroSpace integration should support equivalent: launch arbitrary commands on the target workspace | MEDIUM | Config field: `commands: z.array(z.string()).optional()`; each command launched via `Bun.spawn`/`niriSpawnSh`-equivalent; snapshot-delta detects resulting windows; move to target workspace |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-creating AeroSpace workspaces | User wants integration to "just work" without pre-configuring | AeroSpace workspaces are defined in `~/.config/aerospace/aerospace.toml`; the CLI cannot create new workspaces at runtime — only move windows to existing ones; attempting to move to a non-existent workspace would fail silently or error | Validate target workspace exists via `list-workspaces --format` before moving; fail with clear error if not found; document that user must define the workspace in AeroSpace config |
| `split` for layout control when normalization is unknown | Seems like a natural layout primitive | When `enable-normalization-flatten-containers = true` (the common default), `split` exits with code 1 and a warning; using it silently fails; this is documented in _references/aerospace.md | Use `join-with` for local nesting, `layout` for root policy; expose `normalization` config field so user declares their AeroSpace config; or default to never using `split` |
| Multi-monitor window placement | User wants to send windows to a workspace on a specific monitor | `move-node-to-workspace` does not accept a monitor target; `move-workspace-to-monitor` requires multiple monitors; with a single monitor the command errors; single-monitor is the common case | Move windows to target workspace only; do not attempt monitor routing; document as a future enhancement when multi-monitor patterns are better understood |
| `reload-config` after window placement | Ensures AeroSpace config is fresh | `reload-config` on a live session disrupts all workspace state and window assignments; too high-impact for unattended automation | Trust AeroSpace's live state; do not reload config; if user changes AeroSpace config they should reload manually |
| Window decoration / title setting via AeroSpace | User wants IDE windows labeled per workspace | AeroSpace does not expose window title mutation; that is an OS-level capability | Leave titles to the IDE itself; tmux session naming handles terminal labeling |
| Reading AeroSpace config via `aerospace config --get` | Introspect normalization state programmatically | `aerospace config --get` does not reliably expose all TOML keys (confirmed in _references/aerospace.md); only some keys are accessible | Read `~/.config/aerospace/aerospace.toml` directly for TOML introspection, or require user to declare `normalization` in workspace YAML config |

---

## Feature Dependencies

```
[AeroSpace shell wrappers — src/lib/aerospace.ts]
    └──required by──> AeroSpace integration plugin (aerospace.ts)
    └──required by──> WindowDetector (begin/resolve use list-windows --format)
    └──pattern from──> src/lib/niri.ts (injectable _exec, Zod schemas, typed wrappers)

[WindowDetector — begin() / resolve()]
    └──required by──> runner.ts (calls begin() before open(), resolve() after for WindowArtifacts)
    └──required by──> move windows by ArtifactBag IDs
    └──uses──> list-windows --format (shell wrapper)
    └──interface from──> src/lib/integrations/types.ts WindowDetector

[AeroSpace integration plugin — src/lib/integrations/aerospace.ts]
    └──requires──> AeroSpace shell wrappers (aerospace.ts)
    └──requires──> WindowDetector (detect new windows)
    └──requires──> target workspace config (where to send windows)
    └──requires──> binary availability gate (silent skip when not present)
    └──registered in──> src/lib/integrations/index.ts
    └──follows pattern of──> src/lib/integrations/niri.ts

[Target workspace config — `settings.integrations.aerospace.workspace`]
    └──required by──> integration open() (which workspace to target)
    └──stored in──> workspace YAML + GlobalConfig integrations["aerospace"] map
    └──cascade from──> resolveEnabled() pattern in types.ts

[Normalization-aware layout — `normalization` config field]
    └──requires──> target workspace config (layout applied to target workspace)
    └──uses──> `layout` command (root policy) OR `join-with` (nested grouping)
    └──uses──> `flatten-workspace-tree` (reset before layout)
    └──requires──> user declaration OR TOML file read

[Doctor check — `aerospace` binary]
    └──independent——> no new dependencies; add entry to existing binary list in doctor.ts
    └──pattern from——> existing warn-level binary checks (gh, glab, tmux, niri)
```

### Dependency Notes

- **Shell wrappers are the foundation** — all other features depend on `src/lib/aerospace.ts`; build it first with injectable `_exec` and Zod-validated `--format` parsing.
- **WindowDetector is independent of layout** — detect windows first, move them, then apply layout; the ordering matters: layout commands issued before window placement will affect the pre-existing windows on that workspace.
- **Target workspace config is required by `open()`** — if not configured, `open()` should skip window placement entirely (no target = nothing to do); log a hint to configure.
- **Normalization-aware layout is the highest-risk feature** — it requires either TOML parsing or a user config field; the user config field approach is simpler and matches how niri columns are user-declared; default to safe commands (`layout` + `join-with`) that work regardless of normalization state; `flatten-workspace-tree` is always safe.
- **Doctor check is fully independent** — can be added in any phase; zero risk.

---

## MVP Definition

### Build First (foundation — all other features depend on this)

- [ ] AeroSpace shell wrappers (`src/lib/aerospace.ts`) — `listAeroSpaceWindows()`, `listAeroSpaceWorkspaces()`, `moveNodeToWorkspace()`, `aerospaceWorkspace()`, `isAeroSpaceRunning()`; `--format` tab-delimited parsing with Zod validation; injectable `_exec`; unit tests without AeroSpace binary; estimated MEDIUM effort
- [ ] Doctor check for `aerospace` binary — add to binary list in `doctor.ts`; one-liner addition; estimated LOW effort

### Build Second (core integration behavior)

- [ ] AeroSpace integration plugin with `WindowDetector` — `src/lib/integrations/aerospace.ts`; tier-3 (order 31 after niri at 30); binary gate; `begin()`/`resolve()` snapshot-delta detection; `open()` moves detected windows to target workspace; target workspace config schema; `cleanup()` no-op; register in `index.ts`; estimated MEDIUM effort

### Build Third (layout control)

- [ ] Root layout command (`layout` field in config) — apply `aerospace layout <value> --window-id` or scoped layout after window placement; schema: `layout: z.enum([...]).optional()`; estimated LOW effort
- [ ] Normalization-aware layout (`normalization` config field + `flatten_before_open`) — `flatten-workspace-tree --workspace <target>` for reset; `join-with` vs `split` selection; schema field `normalization: z.boolean().optional()`; estimated MEDIUM effort (TOML reading adds complexity if chosen over user config field)

### Release Prep

- [ ] Version bump v0.11.0, CHANGELOG, README — documents AeroSpace integration with config examples

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| AeroSpace shell wrappers | HIGH | MEDIUM | P1 — unblocks everything |
| WindowDetector (snapshot-delta) | HIGH | MEDIUM | P1 — core detection mechanism |
| Move windows to target workspace | HIGH | LOW (once wrappers exist) | P1 — main integration value |
| Target workspace config schema | HIGH | LOW | P1 — required for move |
| Binary availability gate | HIGH | LOW | P1 — silent skip is mandatory |
| Doctor check | MEDIUM | LOW | P1 — consistency with all other integrations |
| Root layout control (`layout` command) | MEDIUM | LOW | P2 — enhances placement |
| `flatten-workspace-tree` on open | MEDIUM | LOW | P2 — clean state on re-open |
| Normalization-aware layout | MEDIUM | MEDIUM | P2 — config field approach keeps cost bounded |
| `commands` array launch support | LOW | MEDIUM | P3 — niri feature parity; defer unless demanded |
| `focus-workspace` subcommand | LOW | LOW | P2 — trivial, good for UX |
| `cleanup()` | LOW | LOW | P1 — must exist for interface compliance; no-op |

**Priority key:**
- P1: Required for a functional integration — without these, the plugin does nothing useful
- P2: Enhances the integration to match niri feature parity
- P3: Nice to have; niri differentiator not yet established as expected behavior

---

## AeroSpace vs Niri: Feature Parity Map

| Capability | Niri | AeroSpace | Gap / Notes |
|------------|------|-----------|-------------|
| Binary/process gate | `NIRI_SOCKET` env var check | `which aerospace` + process check | Different gate mechanism; AeroSpace is always a binary not a socket |
| Workspace targeting | Name-based; creates new workspace dynamically | Numbered/named; must exist in TOML config | AeroSpace does not create workspaces; user must pre-configure |
| Window detection | `WindowDetector` with niri IPC | `WindowDetector` with `list-windows --format` polling | Same interface; different backend; polling vs event-driven |
| Move window to workspace | `niri msg action move-window-to-workspace` | `aerospace move-node-to-workspace --window-id <id> <ws>` | Equivalent capability; different CLI |
| Layout control | `columns` declarative array; `setWindowWidth`, `consumeOrExpelWindowLeft`, `moveColumnToIndex` | `layout h_tiles\|v_tiles\|h_accordion\|v_accordion`; `join-with`; `flatten-workspace-tree` | Different model: niri is pixel-width + stacking; AeroSpace is root-policy + container nesting |
| Cleanup | `unsetNiriWorkspaceName` — removes the dynamic name | No-op — AeroSpace workspaces are user-defined; nothing to clean | Structural difference; not a gap |
| `commands` array | Supported (spawn via niriSpawnSh) | Should support (spawn via Bun.spawn equivalent) | P3 — bring in if demanded |
| `focus` control | `focus: true` on workspace or window level | `aerospace workspace <id>` — summon target workspace | Equivalent; different command |
| Subcommand (`commands()`) | `focus-workspace [workspace]` | `focus-workspace [workspace]` | Identical UX |

---

## Implementation Correctness Notes

These are not edge cases to discover later — they are established facts from `_references/aerospace.md`
that must drive implementation choices.

### Use `--format`, not `--json`

`list-windows --json` returns only `app-name`, `window-id`, `window-title`. This is insufficient.
`list-windows --format` with the right template returns `window-id`, `app-bundle-id`, `app-name`,
`app-pid`, `workspace`, `window-layout`, `window-is-fullscreen`, `window-title`. The format approach
is the only viable option for the snapshot/delta detection and window identity tuple.

Recommended format string (verified against actual AeroSpace output):
```
%{window-id}\t%{app-bundle-id}\t%{app-name}\t%{app-pid}\t%{workspace}\t%{window-layout}\t%{window-is-fullscreen}\t%{window-title}
```

### `window-id` is the operational handle

Use `window-id` (integer) for all subsequent commands (`move-node-to-workspace`, `focus`, `fullscreen`).
`app-bundle-id` is the stable app identity for matching when multiple windows appear simultaneously.
`app-pid` is the process identity — use to correlate with `WindowArtifact.pid` from tier-1 integrations.

### `split` is often a no-op

When `enable-normalization-flatten-containers = true` (common default), `aerospace split` exits
with code 1 and a warning. Never use `split` in the integration. Use `layout` for root policy and
`join-with` for local nesting. `flatten-workspace-tree` is always safe and is the normalization reset.

### `aerospace config --get` is unreliable

Not all TOML keys are exposed. If normalization state introspection is needed, read the TOML file
directly at `~/.config/aerospace/aerospace.toml`. The safer approach: expose `normalization` as a
user config field in the workspace YAML and default to never using `split`.

### Target workspace must pre-exist

`move-node-to-workspace` succeeds only if the destination workspace ID is defined in AeroSpace's
TOML config. The integration must validate the target workspace exists via `list-workspaces` before
attempting window moves. If the target workspace does not exist, log a clear error and skip — do not
silently discard windows.

### Polling, not events

AeroSpace has no event subscription model (unlike niri's IPC). Window detection requires before/after
polling with exponential backoff. The same strategy documented in niri.ts (10s timeout, 200ms initial
delay, 2s max delay) applies directly. The `_sleep` injectable and `_listWindows` injectable
from `SnapshotOpts` pattern in `niri.ts` should be replicated for test isolation.

---

## Sources

- `_references/aerospace.md` — direct CLI exploration: `list-windows --format`, snapshot/delta,
  `split` normalization warning, `flatten-workspace-tree`, `layout`, `join-with`, `move-node-to-workspace`
  behavior; HIGH confidence (locally tested against AeroSpace 0.20.3-Beta)
- `src/lib/integrations/niri.ts` — feature parity reference; `WindowDetector`, column layout,
  `commands` array, `cleanup()`, `configurePrompt()`, `commands()` subcommand patterns; HIGH confidence
- `src/lib/integrations/types.ts` — `WindowDetector`, `DetectorSnapshot`, `ArtifactBag`, `Integration`
  interface; tier ordering comment; HIGH confidence
- `src/lib/integrations/runner.ts` — how `WindowDetector.begin()/resolve()` is called relative to
  `open()`; bag population; HIGH confidence
- `src/commands/doctor.ts` — binary check pattern (`checkBinary`, warn-level entries, install URL
  format); HIGH confidence
- `src/lib/niri.ts` — `NiriCommands` interface, `SnapshotOpts` injectable pattern, `_exec` mutable
  property for test isolation; HIGH confidence

---

*Feature research for: git-stacks v0.11.0 AeroSpace Window Management Integration*
*Researched: 2026-03-28*
