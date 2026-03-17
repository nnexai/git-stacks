# Stack Research

**Domain:** Multi-repo workspace manager CLI tool
**Researched:** 2026-03-17
**Confidence:** HIGH (core stack verified against official docs and releases; TUI section MEDIUM due to OpenTUI's limited public documentation)

---

## Verdict on Current Stack

The current TypeScript + Bun + Commander.js + YAML + Zod stack is well-chosen and should be kept. No major rewrites are warranted. There are specific version upgrades and one component substitution (OpenTUI) to evaluate. Details below.

---

## Recommended Stack

### Core Technologies

| Technology | Recommended Version | Purpose | Why Recommended |
|------------|---------------------|---------|-----------------|
| Bun | 1.3.10 (current stable) | Runtime, package manager, test runner, shell scripting via `$` | Fastest startup for CLI tools (5ms vs Node 25ms); native TypeScript without build step; `$` shell API eliminates shelljs/execa dependency; built-in test runner; cross-platform compilation via `bun build --compile`. Confirmed current: bun/releases shows v1.3.10 released Feb 26, 2026. |
| TypeScript | 5.9.3 (current) | Type safety, IDE support, type-level correctness | Strict mode is non-negotiable for a config-heavy tool where incorrect schema inference causes silent data loss. TSX for TUI components. Already on latest. |
| Commander.js | 14.0.3 (stay on 14.x) | CLI command tree, argument parsing, option validation | Industry standard with 314M+ weekly downloads. v14 has groups of options/commands in help (useful for large CLIs). v15 is upcoming but requires Node v22+ and goes ESM-only — irrelevant to Bun users but not a reason to upgrade yet. Stay on 14.x; the Commander tree is also introspected for shell completion generation in this codebase, making it a structural dependency. |
| Zod | 3.25.76 (stay on v3) | Config schema validation, type inference for YAML | Zod v4 was released as a separate package with a migration layer (`zod/v4`). v3 is still maintained. The current schemas are deeply integrated into config.ts. Do not migrate to v4 in the near term — the schema-breaking risk to existing user configs (see PITFALLS.md) makes this a dedicated migration task, not an incidental upgrade. When migrating: v4 has stricter `.pick()`/`.omit()` and `.extend()` with refinements, which will require test coverage before switching. |
| yaml | 2.8.2 (current, stay on 2.x) | YAML read/write for stack/workspace/global config | The `yaml` npm package (eemeli/yaml) is the correct, full-spec YAML implementation. v2.8.2 is the latest stable. A v3.0.0 prerelease drops the default export and becomes ESM-only — monitor but do not upgrade until stable. js-yaml is the alternative but has had security issues and no full YAML 1.2 spec support. |

### TUI and Interactive Prompts

| Technology | Recommended Version | Purpose | Why Recommended |
|------------|---------------------|---------|-----------------|
| @clack/prompts | 1.1.0 (upgrade from 0.9.1) | Interactive prompts: text input, selects, confirmations, spinners | v1.0.0 went ESM-only and added autocomplete, progress bars, task logging, improved `cancel()`/`error()` spinner methods. v1.1.0 replaced `picocolors` with Node built-in `styleText` (fewer deps). The codebase already uses it correctly via `safeText()` wrapper. Upgrade is worthwhile for the new prompt types; requires reviewing ESM-only constraint (Bun handles ESM natively so no issue). |
| Ink (React for CLIs) | 5.x (evaluate for `git-stacks manage`) | Rich interactive TUI dashboard | Ink is the industry-standard TUI framework for Node/Bun CLIs: used by Anthropic Claude Code, Google Gemini CLI, GitHub Copilot CLI, Cloudflare Wrangler, Prisma. React + Yoga Flexbox layout, `useInput`/`usePaste` hooks, full component model. The current `git-stacks manage` dashboard uses OpenTUI/SolidJS — evaluate replacing with Ink (see Alternatives below). |
| OpenTUI + SolidJS | 0.1.87 (current, evaluate risk) | Interactive TUI dashboard (current implementation) | OpenTUI is at v0.1.87 with low npm download numbers and no public documentation site. SolidJS bindings are maintained by the same author. The core concepts (reactive terminal rendering) are sound, but the library is pre-1.0 with limited adoption and limited community support. Monitor actively. If blocking issues emerge in the dashboard, Ink is the migration target. |

### Development and Testing

| Technology | Recommended Version | Purpose | Why Recommended |
|------------|---------------------|---------|-----------------|
| bun:test | built-in (Bun 1.3.10) | Unit and integration test runner | Jest-compatible API (`describe`/`test`/`expect`), snapshot support, `test.each` parametrized tests, mock functions, `expectTypeOf` for type-level assertions. Zero additional dependencies. Already in use. Do not add Vitest or Jest — they add Node-ism overhead that conflicts with Bun's native APIs. |
| @types/bun | latest | Bun API type definitions (`$`, `spawn`, `Bun.file`) | Required for TypeScript to type-check Bun-specific APIs. Already in devDependencies. Keep on `latest`. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| opentui-spinner | 0.0.6 | Animated spinners in CLI output | Non-interactive progress indication (before/after TUI dashboard). Keep as-is unless OpenTUI is replaced. |
| chalk or picocolors | (not yet a dep) | Terminal color formatting for non-TUI output | Add if error messages, status output, or `doctor` output needs consistent color. `picocolors` is faster and zero-deps; `chalk` has more features. For this tool, picocolors is sufficient. @clack/prompts v1.1.0 now uses Node built-in `styleText` internally — consider using that for consistency. |

---

## Installation

```bash
# Keep current dependencies — no changes needed for core
bun install

# Upgrade @clack/prompts (breaking: ESM-only, Bun handles this)
bun add @clack/prompts@^1.1.0

# If adding color formatting for CLI output:
bun add picocolors
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Alternative is Better (and When) |
|----------|-------------|-------------|---------------------------------------|
| CLI framework | Commander.js 14.x | citty (unjs/citty 0.2.1) | citty has zero external dependencies, lazy sub-command loading (better for large CLIs), and auto-generated usage docs. Preferred IF: starting a new project and lazy loading matters. Not worth migrating from Commander — the completion generator introspects Commander's tree and that coupling is load-bearing. |
| CLI framework | Commander.js 14.x | oclif | oclif adds plugin architecture, hook system, auto-updater for large "platform CLIs" (Heroku/Salesforce-style). Overkill for this tool's scope — and its plugin system would conflict with the custom integration plugin pattern already built. |
| CLI framework | Commander.js 14.x | yargs | yargs has stronger middleware support. But Commander's strict mode (excess args cause errors) and help group support in v14 are a better fit for a tool where correctness matters. |
| TUI dashboard | Ink (React) | OpenTUI + SolidJS (current) | OpenTUI is pre-1.0 with low adoption. Ink is battle-tested, used by top-tier CLI tools (Claude Code, Gemini CLI), has an active community, and SolidJS experience transfers directly to Ink given the JSX model. Migrate if OpenTUI creates blockers. |
| TUI dashboard | Ink (React) | Blessed | Blessed is effectively unmaintained (last release 2019). Do not use. |
| Config format | YAML + Zod | TOML + @iarna/toml | TOML is the format used by mise, cargo, etc. — better for deeply nested configs with multiline strings. But switching breaks all existing user config files and gains nothing for this tool's schema complexity. YAML is correct here. |
| Config format | YAML + Zod | JSON | JSON lacks comments, requires strict syntax, and is less human-editable. YAML is the right call for developer-facing config files. |
| Runtime | Bun | Node.js + tsx | Node.js has broader hosting support, but git-stacks is a local developer tool, not a server. Bun's `$` shell API and fast startup are decisive advantages. Node would require `execa` or `shelljs` and a build step. |
| Schema validation | Zod 3.x | Zod 4.x | Zod v4 has improved performance and stricter APIs (no accidental refinement drops). Migrate when the existing schema test coverage is in place — see PITFALLS.md Pitfall 5. Do not rush: v3 is still maintained and the risk of silent breaking changes to user configs outweighs the v4 benefits until schema tests exist. |
| Prompts | @clack/prompts | Inquirer.js | Inquirer's modular rewrite (`@inquirer/prompts`) is comparable in quality but heavier. @clack/prompts is simpler and aesthetically cleaner for wizard-style flows. Keep @clack. |
| Test runner | bun:test | Vitest | Vitest is excellent but designed for Node/browser. In a Bun codebase, bun:test runs 2-3x faster and doesn't require configuration. Only switch if a specific Vitest feature (e.g., coverage provider) is needed. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Blessed / neo-blessed | Unmaintained since 2019, no TypeScript types, known bugs with modern terminals | Ink (React for CLIs) |
| shelljs | Deprecated by its own maintainers in favor of native shell APIs; no async support | Bun's `$` shell API (already in use) |
| execa | Adds a dependency for subprocess handling that Bun's `$` and `spawn` cover natively | Bun's `$` (shell interpolation) and `Bun.spawn()` (hook execution) |
| chalk 5.x | ESM-only — Bun handles ESM, but it's a heavy dependency for a few color calls | `picocolors` or Node built-in `styleText` |
| yup | Older, slower than Zod, less ergonomic TS inference, losing community momentum | Zod (already in use) |
| ts-node | Node-only TypeScript execution layer — completely redundant with Bun | Bun's native TypeScript execution |
| esbuild (standalone) | Bun bundles and compiles natively via `bun build --compile` | `bun build --compile` for distribution |
| jest | Requires Node, has complex configuration. bun:test is API-compatible and runs natively | bun:test (already in use) |
| Commander.js v15 (when released) | Requires Node v22+ runtime — irrelevant to Bun users, and ESM-only migration adds friction with no benefit | Stay on Commander.js 14.x until a specific v15 feature is needed |

---

## Stack Patterns by Variant

**For CLI commands (non-interactive output):**
- Use Commander.js command definitions in `src/commands/`
- Output via `console.log` / `console.error` with optional `picocolors` for color
- Return structured `{ ok: boolean, error?: string }` results from lib functions, not throw

**For interactive wizard flows (new workspace, new stack, config):**
- Use @clack/prompts v1.1.0 via `safeText()` wrapper
- Use `p.group()` for multi-step wizard flows
- Use `p.tasks()` (new in v1.0.0) for showing progress of multi-step operations

**For the TUI dashboard (`git-stacks manage`):**
- Current: OpenTUI + SolidJS. Keep for now; reassess if blocked.
- Migration target: Ink (React) if OpenTUI stability becomes an issue
- Pattern: render-on-demand, not continuous polling — use reactive state, not `setInterval`

**For distribution:**
- Current: npm publish with Bun shebang (`#!/usr/bin/env bun`) — requires users to have Bun installed
- Future option: `bun build --compile --bytecode` to produce standalone binaries (no Bun required for end users); add to CI for macOS arm64/x64 and Linux x64 targets
- Recommendation: add `bun build --compile` as a release artifact alongside the npm package once the tool reaches wider distribution

**For testing git operations:**
- Use `bun:test` with a `makeGitRepo(tmpDir)` helper (see PITFALLS.md Pitfall 6)
- Isolate config path via `process.env.HOME` redirect in `beforeEach` (existing pattern)
- Replace `process.env.HOME` mutation with dependency injection in `paths.ts` as a medium-term improvement

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @clack/prompts@^1.1.0 | Bun 1.3.x | ESM-only (v1.0.0+); Bun handles ESM natively, no issue. Review `safeText()` wrapper — in v1.x, empty text input behavior should be verified. |
| Commander.js@^14.0.3 | Bun 1.3.x, TypeScript 5.x | Dual CJS/ESM. v15 will be ESM-only and require Node 22+; not relevant to Bun runtime but hold off migration. |
| yaml@^2.8.2 | Bun 1.3.x | v3.0.0 prerelease drops default export — stay on 2.x until v3 stabilizes. |
| zod@^3.25.76 | Bun 1.3.x, TypeScript 5.x | v3 is still maintained. Zod v4 (`zod@^4.x`) is a separate package. Do not co-install both. Migrate deliberately after adding schema compatibility tests. |
| solid-js@^1.9.11 + @opentui/solid@^0.1.87 | Bun 1.3.x with `@opentui/solid/bun-plugin` preloaded | Plugin must be programmatically registered for global installs (already fixed in 0.1.3). Watch for OpenTUI breaking changes closely — pre-1.0 packages can have unstable APIs. |

---

## Key Stack Decisions Summary

| Decision | Status | Rationale |
|----------|--------|-----------|
| Bun as runtime | Keep, correct | Performance, native TS, `$` shell API, built-in test runner — all decisive for a CLI tool |
| Commander.js v14 | Keep, correct | Deep coupling with completion generator; large ecosystem; v14 has everything needed |
| Zod v3 | Keep, do not rush to v4 | Migration risk to existing user configs; wait for schema test coverage first |
| yaml v2.x | Keep | Stable, full-spec, v3 prerelease not ready |
| @clack/prompts | Upgrade to v1.1.0 | New prompt types (autocomplete, tasks) are valuable; ESM-only not an issue under Bun |
| OpenTUI + SolidJS | Monitor, evaluate Ink migration | Pre-1.0, low adoption — correct decision was pragmatic for PoC; production path likely via Ink |
| bun:test | Keep | Best test runner for Bun codebases; no additional deps |

---

## Sources

- Bun v1.3.10 release: https://github.com/oven-sh/bun/releases (current stable Feb 26, 2026) — HIGH confidence
- Bun compile docs: https://bun.sh/docs/bundler/executables — HIGH confidence (official)
- Commander.js v14.0.3 / v15.0.0-0 release notes: https://github.com/tj/commander.js/releases — HIGH confidence
- @clack/prompts v1.1.0 release notes: https://github.com/natemoo-re/clack/releases — HIGH confidence
- yaml v2.8.2 release notes: https://github.com/eemeli/yaml/releases — HIGH confidence
- Zod v4 breaking changes (pick/omit/extend on schemas with refinements): GitHub releases — MEDIUM confidence (specific version 4.3.6 confirmed; migration path inferred from release notes)
- citty v0.2.1: https://github.com/unjs/citty — HIGH confidence (repo verified)
- Ink adoption (Claude Code, Gemini CLI, GitHub Copilot, Wrangler): https://github.com/vadimdemedes/ink — HIGH confidence
- mise architecture (Rust, TOML): https://github.com/jdx/mise — HIGH confidence

---

*Stack research for: multi-repo workspace manager CLI (git-stacks)*
*Researched: 2026-03-17*
