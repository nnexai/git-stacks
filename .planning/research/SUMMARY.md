# Project Research Summary

**Project:** git-stacks v0.11.0 — AeroSpace Window Management Integration
**Domain:** macOS tiling window manager (AeroSpace) integration for a Bun CLI workspace manager
**Researched:** 2026-03-28
**Confidence:** HIGH

## Executive Summary

This milestone adds AeroSpace tiling window manager support to git-stacks, following the established niri integration pattern. AeroSpace is macOS-only, pre-1.0 beta software (v0.20.3-Beta) with a fundamentally different model from niri: workspaces are static (user-defined in `aerospace.toml`), window commands are CLI-only (no IPC socket), and output is tab-delimited text (not JSON). The entire feature fits cleanly into the existing integration plugin architecture — two new files (`src/lib/aerospace.ts` and `src/lib/integrations/aerospace.ts`), plus two one-line additions to existing files. No new npm dependencies are required; Bun's native `TOML.parse` covers the only non-standard parsing need.

The recommended approach mirrors niri exactly at the structural level: injectable `_exec` for test isolation, `WindowDetector` for snapshot-delta window detection, tier-3 plugin order (31, one above niri at 30), and the same before/launch/poll ordering for window detection. The key adaptations are: use `--format` TSV output instead of JSON, probe the `aerospace` binary for availability instead of checking `NIRI_SOCKET`, and treat workspaces as static targets rather than dynamically created. The most technically nuanced part is normalization-aware layout — defaulting to `join-with`/`flatten-workspace-tree` (which work regardless of normalization state) and exposing a `normalization` config field for users who need `split`.

The primary risks are all implementation-level behavioral traps: using `split` when normalization is enabled (silently fails for most users), parsing `--format` output with whitespace split instead of tab split (corrupts field positions), and omitting the `process.platform !== "darwin"` gate (crashes on Linux CI). Every pitfall has a clear prevention pattern with a test verification step. The implementation is low-risk overall because the architecture is fully established and each new component has a direct analog in the existing codebase.

## Key Findings

### Recommended Stack

No new dependencies are required for v0.11.0. All capabilities are covered by the existing stack (Bun runtime, TypeScript, Zod, Bun `$` shell) plus one Bun built-in that is already available. The niri integration established every pattern that AeroSpace needs — the stack question is purely about what AeroSpace-specific mechanics differ.

**Core technologies:**
- **Bun `$` shell**: All `aerospace` CLI invocations — same `.quiet().nothrow()` pattern as all other shell wrappers in the codebase
- **Zod 3.25.76**: Typed config schemas for the integration plugin — already installed, nothing new
- **`Bun.TOML.parse` (built-in)**: Read `~/.config/aerospace/aerospace.toml` if normalization auto-detection is implemented — native Bun API, confirmed in Bun 1.3.11 docs, zero new dependencies
- **Tab-split parsing (`splitFormatRow`)**: AeroSpace `--format` TSV output parsed with `String.split("\t")` — no CSV library needed; format string is code-controlled so field count is fixed at compile time

### Expected Features

**Must have (table stakes):**
- AeroSpace shell wrappers (`src/lib/aerospace.ts`) with injectable `_exec` — unblocks everything else
- Binary availability gate (`isAerospaceRunning()`) — macOS platform check + binary probe; silent return from `open()` when not running
- Integration plugin (`src/lib/integrations/aerospace.ts`) — tier-3 (order 31), `enabledByDefault: false`, registered in `index.ts`
- `WindowDetector` with snapshot-delta — `begin()`/`resolve()` using `list-windows --all --format`; exponential backoff; 10s timeout
- Move windows to target workspace — iterate `ArtifactBag`, call `move-node-to-workspace --window-id <id> <workspace>` for each detected window ID
- Target workspace config schema — `workspace: z.string()` (not `string | number`); workspace must pre-exist in user's `aerospace.toml`
- Doctor check for `aerospace` binary — warn-level, macOS-gated, links to AeroSpace install guide
- `cleanup()` no-op — required for `Integration` interface compliance; AeroSpace workspaces are user-managed

**Should have (differentiators):**
- Root layout control via `layout` config field — `z.enum(["h_tiles", "v_tiles", "h_accordion", "v_accordion"])`, applied after window placement
- Normalization-aware layout — `normalization: z.boolean()` config field (default `true`); use `flatten-workspace-tree` + `layout` when true, `split` alternatives when false
- `flatten_before_open` flag — call `flatten-workspace-tree --workspace <target>` before placement for clean re-open state
- `focus` config field — call `aerospace workspace <id>` to bring the workspace to screen after setup

**Defer (v2+):**
- `commands` array launch support — launch arbitrary apps on the AeroSpace workspace (niri feature parity, P3)
- Multi-monitor window routing — `move-node-to-monitor` errors on single-monitor setups; defer until multi-monitor patterns are established

### Architecture Approach

The feature slots into the existing integration plugin architecture without structural changes. Two new files are additive; two files receive one-line modifications each. The build is strictly layered: CLI wrappers first (independently testable), then the integration plugin that imports them, then the one-line registry addition, then the one-line doctor addition. `runner.ts` and `types.ts` are unchanged — the `WindowDetector` interface already supports multiple detectors, and runner.ts already iterates them.

**Major components:**
1. `src/lib/aerospace.ts` (NEW) — typed async CLI wrappers; `--format` TSV parser; injectable `_exec`; `isAerospaceRunning()` with platform gate
2. `src/lib/integrations/aerospace.ts` (NEW) — tier-3 plugin; `WindowDetector` implementation; `open()` orchestrates detection, workspace validation, window movement, layout application
3. `src/lib/integrations/index.ts` (MODIFIED, +1 line) — imports and registers `aerospaceIntegration`
4. `src/commands/doctor.ts` (MODIFIED, +1 entry) — macOS-gated binary check for `aerospace`

### Critical Pitfalls

1. **`split` used for layout control** — silently exits 1 for the majority of users who have `enable-normalization-flatten-containers = true` (the AeroSpace default). Never implement a `split` wrapper. Use `join-with` and `flatten-workspace-tree` exclusively.

2. **`--format` output parsed with whitespace split** — `app-name` and `window-title` can contain spaces; only the `\t` tab character is a valid field delimiter. Always split on `"\t"` and validate field count before positional access.

3. **Missing `process.platform !== "darwin"` gate in `isAerospaceRunning()`** — `aerospace` binary does not exist on Linux; CI test failures and false-positive doctor warnings result. The platform check must be the first condition, before any subprocess call.

4. **Snapshot-delta ordering race** — taking the "before" window list snapshot AFTER the app launch means fast-opening windows appear in the "before" set and are invisible to the delta. The snapshot must be taken strictly before `spawnFn()`. Add a call-order assertion test (modeled on `tests/lib/niri.test.ts` line 668).

5. **Bun test mock pollution** — `mock.module("@/lib/aerospace", ...)` from integration tests leaks into unit test files if not re-applied. Both `tests/lib/aerospace.test.ts` and `tests/lib/integrations/aerospace.test.ts` must be added to the isolation list in `scripts/test-runner.ts`.

6. **Workspace name type coercion** — config schema must use `z.string()` only (never `z.string().or(z.number())`); zero-padded names like `"05"` are corrupted by any `parseInt`/`Number()` call. Pass workspace names through as raw strings.

7. **`list-windows` without `--all`** — default scopes to the focused workspace only, which misses windows on other workspaces during setup. Every `listAerospaceWindows()` call must include `--all`.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: AeroSpace Shell Wrappers + Doctor Check

**Rationale:** All other features depend on `src/lib/aerospace.ts`. Building and testing the wrappers in isolation before the integration plugin validates the `_exec` mock pattern and `--format` parsing correctness independently. Doctor check is fully independent and bundled here as a low-cost addition.
**Delivers:** `src/lib/aerospace.ts` with full test coverage; `isAerospaceRunning()` with platform gate; `listAerospaceWindows()`, `listAerospaceWorkspaces()`, `moveNodeToWorkspace()`, `focusAerospaceWorkspace()`, `aerospaceLayout()`, `aerospaceFlattenWorkspaceTree()`; `snapshotAerospaceWindows()` with injectable `_sleep` and `_listWindows`; doctor binary check with macOS gate.
**Addresses:** Table-stakes features — shell wrappers, binary gate, doctor check
**Avoids:** Pitfalls 2, 3, 5, 6, 7 (tab parsing, platform gate, mock isolation, string types, `--all` flag)

### Phase 2: Core Integration Plugin

**Rationale:** With wrappers verified, the integration plugin can be built without uncertainty about the underlying CLI behavior. This phase delivers the working end-to-end flow: detect windows, validate workspace, move windows.
**Delivers:** `src/lib/integrations/aerospace.ts` with `WindowDetector`, `open()`, `cleanup()`, config schema, `resolveEnabled()` integration; registered in `index.ts`; integration test suite using `mock.module`.
**Addresses:** Table-stakes features — `WindowDetector`, window movement, target workspace config, `cleanup()` no-op
**Avoids:** Pitfalls 1, 4, 5 (no `split`, snapshot ordering, mock isolation)

### Phase 3: Layout Control + Normalization Handling

**Rationale:** Layout features build directly on the working integration plugin. Normalization is the highest-risk feature and benefits from isolated implementation after the core is stable and tested.
**Delivers:** `layout` config field; `normalization` config field (default `true`); `flatten_before_open` flag; `focus` config field; normalization-aware layout execution path.
**Addresses:** Differentiator features — layout control, normalization safety, workspace focus
**Avoids:** Pitfall 1 extended (no `split` even when `normalization=false`)

### Phase 4: Release Prep

**Rationale:** Version bump, changelog, and documentation always come last and are gated on feature completeness.
**Delivers:** v0.11.0 version bump, CHANGELOG entry, README section for AeroSpace integration with config YAML examples.

### Phase Ordering Rationale

- Shell wrappers must precede the integration plugin because the plugin directly imports from `aerospace.ts`. The dependency is hard.
- Layout control follows the core plugin because layout commands operate on windows that have already been moved — the ordering of detection → movement → layout is fundamental to correct behavior.
- Doctor check is independent but bundled in Phase 1 because it is a single-entry addition requiring no dependencies and the pattern is already established.
- Release prep is always last; no phase depends on it.

### Research Flags

No phase requires `/gsd:research-phase` during planning. All implementation details are fully resolved by this research.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Wrappers follow niri.ts exactly; `--format` parsing verified against live AeroSpace v0.20.3-Beta; all patterns confirmed
- **Phase 2:** Integration plugin mirrors niri.ts structure; runner.ts and types.ts unchanged; no unknowns
- **Phase 3:** Layout commands verified in `_references/aerospace.md`; user-config-field normalization approach is simpler than TOML auto-detection
- **Phase 4:** Standard release prep; follows established pattern

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified: Bun `$` confirmed in codebase; `Bun.TOML.parse` confirmed in official Bun 1.3.11 docs; zero new dependencies needed |
| Features | HIGH | Derived from direct code inspection of niri integration + live AeroSpace CLI exploration in `_references/aerospace.md`; `list-windows --format` field inventory confirmed against actual v0.20.3-Beta output |
| Architecture | HIGH | Based on direct code analysis of `niri.ts`, `integrations/niri.ts`, `integrations/types.ts`, `integrations/runner.ts`; all interfaces unchanged; additive changes only |
| Pitfalls | HIGH | Pitfalls grounded in observed CLI behavior (`split` exit 1 confirmed) and existing test file comments documenting Bun mock pollution issue; not inferred |

**Overall confidence:** HIGH

### Gaps to Address

- **TOML auto-detection path**: Normalization detection via `Bun.TOML.parse` is architecturally sound but is a secondary enhancement. The user-config-field approach (`normalization: true|false`) is the default implementation path; TOML file reading can be added later if users request it. No gap in the primary path.
- **AeroSpace pre-1.0 stability**: The project is beta-only (no stable releases). The `--format` fields and commands used are confirmed stable in v0.20.3-Beta, but a future breaking change could affect field names or command flags. Document the minimum version (`v0.20.x`) in the doctor check hint.
- **`commands` array support**: Deferred to v2+. Pattern is identical to niri's `commands` implementation — low risk when needed.

## Sources

### Primary (HIGH confidence)

- `_references/aerospace.md` — direct CLI exploration against AeroSpace v0.20.3-Beta; all command behaviors, field inventories, normalization findings, snapshot strategy verified
- `src/lib/niri.ts` — `_exec` injection pattern, `SnapshotOpts`, `snapshotWindowIds()` ordering
- `src/lib/integrations/niri.ts` — tier-3 plugin structure, `WindowDetector`, `ArtifactBag` consumption pattern
- `src/lib/integrations/types.ts` — `Integration`, `WindowDetector`, `DetectorSnapshot`, `ArtifactBag` interface contracts
- `src/lib/integrations/runner.ts` — multi-detector begin/open/resolve execution flow
- `src/commands/doctor.ts` — `checkBinary()`, `binaries` array, warn-level pattern
- `tests/lib/niri.test.ts` — mock re-application pattern (lines 1-20), call-order tracking test (lines 668-690)
- `bun.sh/guides/runtime/import-toml` — `Bun.TOML.parse` API confirmed for Bun 1.3.11

### Secondary (MEDIUM confidence)

- `github.com/nikitabobko/AeroSpace/releases` — v0.20.3-Beta as current version; v0.20.0 breaking change documented (`--stdin` flag for stdin-piped workspace names, not relevant to our implementation)
- `nikitabobko.github.io/AeroSpace/commands` — official command reference for `list-windows`, `list-workspaces`, `move-node-to-workspace --window-id` flags

---
*Research completed: 2026-03-28*
*Ready for roadmap: yes*
