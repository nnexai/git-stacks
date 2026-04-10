# Phase 80: E2E CLI Harness and Living Inventory - Research

**Researched:** 2026-04-10
**Domain:** Bun-based real-process CLI testing and typed E2E coverage inventory
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Harness primitives
- **D-01:** Extend `tests/helpers.ts` with shared real-process CLI harness primitives instead of creating a separate E2E harness subsystem.
- **D-02:** Keep the shared layer small: a reusable `runCli`-style subprocess wrapper, isolated config/git env setup, and reusable fixture builders for disposable repo/template/workspace/config scenarios.
- **D-03:** Keep assertions in each test file. The shared layer provides execution and fixture setup, not a scenario DSL.

### Inventory source and scope
- **D-04:** The canonical inventory source is a typed TypeScript module checked into the repo.
- **D-05:** Inventory entries use stable flow-level IDs. A raw command/subcommand gets its own item only when it truly matches a standalone user flow.
- **D-06:** The inventory does not require a separate human-readable surface. The TypeScript source itself is the canonical artifact.
- **D-07:** Do not invest in hand-maintained prose or a parallel documentation layer for the inventory.

### Failure diagnostics
- **D-08:** Passing E2E scenarios stay quiet by default.
- **D-09:** Failing scenarios emit a rich failure bundle including argv, cwd, exit code, stdout, stderr, and relevant artifact paths.
- **D-10:** Failure diagnostics include only a curated, redacted env subset relevant to the scenario, not the full process environment.

### the agent's Discretion
- Exact helper names and the precise split between `tests/helpers.ts` and nearby test-support files, as long as the shared harness remains an extension of the existing helper layer rather than a separate subsystem.
- Exact inventory type shapes and any optional convenience rendering around the canonical TypeScript source.
- Exact formatting of the failure bundle and the helper boundaries for env redaction.

### Deferred Ideas (OUT OF SCOPE)
- Any optional report/export layer built on top of the canonical TypeScript inventory source.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| E2E-01 | Maintainer can inspect a living, machine-parseable inventory source of every non-TUI, non-integration command and library-backed user flow that must have E2E coverage. | Use one typed TypeScript inventory module under `tests/` with exported typed entries plus derived selectors for in-scope and excluded items. [VERIFIED: repo code] [VERIFIED: phase context] |
| E2E-02 | Maintainer can see explicit exclusions for TUI behavior and external integration functionality so the milestone scope cannot drift. | Model exclusions as first-class inventory entries with explicit `scopeStatus` and `rationale`, not comments or prose-only notes. [VERIFIED: requirements] [VERIFIED: state] |
| E2E-03 | Maintainer can compare the command inventory with the implemented E2E suite and identify any unmapped in-scope surface as tests are added. | Export `mappedTests` per item and a derived `getUnmappedInScopeItems()` helper or equivalent validator. [VERIFIED: requirements] |
| E2E-04 | Test author can run `git-stacks` as a real CLI process inside an isolated config home without touching the developer's real config. | Standardize the existing `Bun.spawnSync(["bun","run","src/index.ts", ...])` pattern and set `GIT_STACKS_CONFIG_DIR` plus isolated git HOME/config env in one helper. [VERIFIED: repo code] [VERIFIED: local runtime] |
| E2E-05 | Test author can create disposable git repo, template, workspace, and config fixtures for end-to-end scenarios by extending the existing `tests/helpers.ts` primitives. | Extend `tests/helpers.ts` instead of introducing a new subsystem; existing helpers already provide temp dirs, git env, file writes, and git repo creation. [VERIFIED: repo code] [VERIFIED: phase context] |
| E2E-06 | Test author can assert exit code, stdout, stderr, generated files, and persisted YAML for each E2E command invocation. | Return decoded stdout/stderr plus file-path metadata from `runCli`; keep assertions in the test files so YAML/file assertions stay scenario-local. [VERIFIED: repo code] [VERIFIED: phase context] |
| E2E-07 | Failed E2E assertions provide enough command, environment, stdout, and stderr context to debug the failing scenario quickly. | Return a preformatted failure bundle string/object with argv, cwd, exit code, stdout, stderr, curated env, and artifact paths; emit it only on failure. [VERIFIED: phase context] |
</phase_requirements>

## Summary

The repo already has the right execution substrate for Phase 80: `bun:test` is the project test framework, `scripts/test-runner.ts` already isolates `tests/commands/*` in separate Bun processes, and multiple command tests already spawn the real CLI entrypoint with isolated config directories and decoded stdout/stderr assertions. [VERIFIED: repo code] The planning focus should therefore be consolidation, not invention: extract a thin shared `runCli`/fixture layer out of the existing per-file wrappers and add a typed inventory module that later phases can update. [VERIFIED: repo code] [VERIFIED: phase context]

The biggest design constraint is scope discipline. The milestone is explicitly non-TUI and non-integration, but the CLI surface mixes pure local commands, editor-launching flows, interactive wizards, and integration-backed behavior. [VERIFIED: requirements] [VERIFIED: state] The inventory must therefore make exclusions explicit and machine-readable, or later gate work cannot reliably detect drift or missing mappings. [VERIFIED: requirements] [VERIFIED: state]

**Primary recommendation:** Put a typed inventory module under `tests/`, extend `tests/helpers.ts` with a small real-process `runCli` + fixture helper surface, and add one harness-focused command test plus one inventory-validation test as Phase 80’s proof points. [VERIFIED: repo code] [VERIFIED: phase context]

## Project Constraints (from copilot-instructions.md)

- Use GSD workflows only when explicitly invoked by the user. [VERIFIED: repo code]
- Treat `gsd-*` and `/gsd-*` as command invocations and use the matching GSD skill. [VERIFIED: repo code]
- Prefer a matching custom agent when a GSD command says to spawn a subagent. [VERIFIED: repo code]
- After completing a GSD command or deliverable, offer the next step to the user. [VERIFIED: repo code]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime | 1.3.10 | Executes TypeScript directly and provides `bun:test`, `Bun.spawnSync`, and `Bun.spawn`. [VERIFIED: local environment] | The whole project runs on Bun with no build step. [VERIFIED: repo code] |
| bun:test | bundled with Bun 1.3.10 | Test framework and assertions. [VERIFIED: repo code] | Already used project-wide and documented as the required runner API. [VERIFIED: repo code] |
| `scripts/test-runner.ts` | repo-local | Isolates `tests/commands/*` into per-file subprocesses. [VERIFIED: repo code] | Phase 80 must fit this architecture instead of replacing it. [VERIFIED: repo code] [VERIFIED: phase context] |
| TypeScript | 6.0.2 | Typed inventory source and helper APIs. [VERIFIED: npm registry] | The inventory requirement is explicitly a typed TypeScript module. [VERIFIED: phase context] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Commander | 14.0.3 | Existing command tree; useful as the source surface being inventoried. [VERIFIED: npm registry] [VERIFIED: repo code] | Use existing command definitions to enumerate flows and exclusions. [VERIFIED: repo code] |
| YAML | 2.8.3 | Read/assert persisted YAML side effects already used by the app. [VERIFIED: npm registry] [VERIFIED: repo code] | Use when E2E tests validate written config/workspace/template files. [VERIFIED: requirements] |
| `tests/helpers.ts` | repo-local | Temp dirs, cleanup, file writers, isolated git env, real repo builders, and mock factories. [VERIFIED: repo code] | Extend this file first; only split internals out if it becomes crowded. [VERIFIED: phase context] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shared `runCli` helper over current patterns | Keep one-off spawn wrappers in every test file | Faster short-term, but duplicates env isolation, decoding, and diagnostics logic. [VERIFIED: repo code] |
| Typed TypeScript inventory module | JSON/YAML or Markdown inventory | JSON/YAML cannot encode repo-local helper functions/derived selectors as ergonomically, and Markdown cannot serve as the canonical machine-parseable source required by Phase 80. [VERIFIED: requirements] [VERIFIED: phase context] |
| `Bun.spawnSync` for short CLI assertions | `Bun.spawn` everywhere | Async streaming is useful for interactive/stdin-heavy cases, but most Phase 80 scenarios are short command invocations where sync execution simplifies assertions. [VERIFIED: local runtime] [VERIFIED: repo code] |

**Installation:** None — use the existing project stack. [VERIFIED: repo code]

**Version verification:** [VERIFIED: npm registry]
- `commander` → `14.0.3` (published 2026-01-31T01:47:17.592Z)
- `yaml` → `2.8.3` (published 2026-03-21T10:37:06.001Z)
- `zod` → `4.3.6` (published 2026-01-22T19:14:35.382Z)
- `typescript` → `6.0.2` (published 2026-03-23T16:14:45.521Z)
- `@types/bun` → `1.3.12` (published 2026-04-10T18:46:38.904Z)

## Architecture Patterns

### Recommended Project Structure

```text
tests/
├── helpers.ts                 # public shared CLI + fixture helpers
├── e2e-inventory.ts           # canonical typed machine-parseable inventory
├── lib/
│   └── e2e-inventory.test.ts  # validates unique IDs / scope / mappings
└── commands/
    └── e2e-harness.test.ts    # proves real-process isolation + diagnostics
```

`tests/` is the right home for the inventory because `tsconfig.json` already includes `tests/**/*.ts` for typecheck, while `package.json` publishes `src` but not `tests`, so the inventory stays test-only and out of the shipped package. [VERIFIED: repo code]

### Pattern 1: Thin `runCli` Helper

**What:** A small helper that wraps the already-established `Bun.spawnSync(["bun","run","src/index.ts", ...])` pattern, decodes stdout/stderr, and captures curated diagnostics. [VERIFIED: repo code] [VERIFIED: local runtime]

**When to use:** Every `tests/commands/*` E2E-style file that runs the real CLI. [VERIFIED: repo code]

**Example:**
```typescript
// Source: tests/commands/template-list.test.ts + tests/commands/status-json.test.ts [VERIFIED: repo code]
import { join } from "path"
import { getTestGitEnv } from "../helpers"

const PROJECT_ROOT = join(import.meta.dir, "../..")

export function runCli(
  baseDir: string,
  argv: string[],
  opts: {
    cwd?: string
    configDir?: string
    env?: Record<string, string>
    artifactPaths?: string[]
  } = {}
) {
  const env = {
    ...getTestGitEnv(baseDir),
    ...opts.env,
    GIT_STACKS_CONFIG_DIR: opts.configDir ?? join(baseDir, "config"),
  }

  const result = Bun.spawnSync(["bun", "run", "src/index.ts", ...argv], {
    cwd: opts.cwd ?? PROJECT_ROOT,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  })

  const stdout = new TextDecoder().decode(result.stdout)
  const stderr = new TextDecoder().decode(result.stderr)

  return {
    argv,
    cwd: opts.cwd ?? PROJECT_ROOT,
    envPreview: {
      HOME: env.HOME,
      XDG_CONFIG_HOME: env.XDG_CONFIG_HOME,
      GIT_CONFIG_GLOBAL: env.GIT_CONFIG_GLOBAL,
      GIT_STACKS_CONFIG_DIR: env.GIT_STACKS_CONFIG_DIR,
    },
    stdout,
    stderr,
    exitCode: result.exitCode ?? 0,
    artifactPaths: opts.artifactPaths ?? [],
  }
}
```

### Pattern 2: Fixture Builders Stay in `tests/helpers.ts`

**What:** Reuse `makeTmpDir`, `cleanup`, `touch`, `write`, `makeGitRepo`, `getTestGitEnv`, and `applyTestGitEnv` as the base API, then add only missing builders for repo/template/workspace/config fixtures. [VERIFIED: repo code]

**When to use:** Whenever a new E2E file needs a disposable repo, workspace YAML, template YAML, registry entry, or isolated config tree. [VERIFIED: requirements]

**Recommended helper boundary:** Keep public test-facing helpers exported from `tests/helpers.ts`; if implementation detail grows, hide private builders in a sibling support file and re-export only the stable surface from `tests/helpers.ts`.

### Pattern 3: Inventory as Data + Derived Selectors

**What:** Export a readonly inventory array plus derived selectors/validators so later phases and local gates can answer “what is in scope, excluded, covered, or unmapped?” without parsing prose. [VERIFIED: requirements] [VERIFIED: state]

**When to use:** Immediately in Phase 80; later phases should only update entries and `mappedTests`, not invent new inventory shapes. [VERIFIED: phase context]

**Example:**
```typescript
// New canonical artifact. Source of required fields: E2E-01..03 + Phase 80 decisions. [VERIFIED: requirements] [VERIFIED: phase context]
export type E2EScopeStatus = "in-scope" | "excluded"
export type E2EFlowType = "command" | "user-flow" | "flag-flow"

export type E2EInventoryItem = {
  id: string
  flowType: E2EFlowType
  name: string
  commands: readonly string[]
  scopeStatus: E2EScopeStatus
  mappedTests: readonly string[]
  rationale: string
}

export const E2E_INVENTORY: readonly E2EInventoryItem[] = [
  {
    id: "workspace.status",
    flowType: "command",
    name: "workspace status",
    commands: ["status", "status --json", "status --fetch"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/status-json.test.ts"],
    rationale: "Core non-TUI workspace visibility flow.",
  },
  {
    id: "tui.manage",
    flowType: "command",
    name: "manage dashboard",
    commands: ["manage"],
    scopeStatus: "excluded",
    mappedTests: [],
    rationale: "TUI behavior is explicitly out of scope for v0.17.1.",
  },
] as const

export function getUnmappedInScopeItems(items = E2E_INVENTORY) {
  return items.filter((item) => item.scopeStatus === "in-scope" && item.mappedTests.length === 0)
}
```

### Anti-Patterns to Avoid

- **Separate E2E subsystem:** The project already has an isolation model and helper layer; a parallel harness adds maintenance surface and fights locked decisions. [VERIFIED: phase context] [VERIFIED: repo code]
- **Scenario DSL assertions:** Keep setup/execution shared, but keep assertions local so tests remain readable and flow-specific. [VERIFIED: phase context]
- **Prose-only inventory:** It cannot satisfy machine-parseable mapping and local gate needs. [VERIFIED: requirements]
- **Full env dumps in failures:** They violate the locked redaction constraint and risk leaking secrets from the developer shell. [VERIFIED: phase context]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI process harness | A new mini test framework or DSL | A thin `runCli` wrapper over `Bun.spawnSync` in `tests/helpers.ts` | The repo already uses this exact subprocess pattern successfully in command tests. [VERIFIED: repo code] |
| Test isolation | Ad-hoc per-test env mutation | Existing git env helpers plus `GIT_STACKS_CONFIG_DIR` override | Existing helpers already isolate HOME, XDG config, git config, and prompt behavior. [VERIFIED: repo code] |
| Coverage inventory source | Markdown tables or a parallel docs page | Typed TypeScript module with derived selectors | Phase 80 requires machine-readable IDs, scope, mappings, and rationale in the canonical source. [VERIFIED: requirements] [VERIFIED: phase context] |
| Coverage-gap detection | String-parsing help output or test filenames only | Inventory entries with `mappedTests` and `getUnmappedInScopeItems()` | Help output cannot encode rationale, exclusions, or stable flow IDs. [VERIFIED: requirements] [VERIFIED: repo code] |

**Key insight:** Phase 80 should standardize existing working patterns, not introduce new runtime, runner, or inventory machinery. [VERIFIED: repo code] [VERIFIED: phase context]

## Common Pitfalls

### Pitfall 1: Isolating config but not git state
**What goes wrong:** Tests stop touching `~/.config/git-stacks` but still inherit the developer’s global git config, prompts, or GPG settings. [VERIFIED: repo code]
**Why it happens:** `GIT_STACKS_CONFIG_DIR` only redirects app config; git isolation is handled separately by `getTestGitEnv` and `applyTestGitEnv`. [VERIFIED: repo code]
**How to avoid:** Build `runCli` env from `getTestGitEnv(baseDir)` first, then layer `GIT_STACKS_CONFIG_DIR` and any scenario-specific vars on top. [VERIFIED: repo code]
**Warning signs:** Tests pass on one machine but fail on another due to git identity, prompt, or signing behavior. [VERIFIED: repo code]

### Pitfall 2: Bypassing the custom test runner
**What goes wrong:** Running `bun test tests/` causes cross-file pollution from `mock.module()` and creates false failures. [VERIFIED: repo code]
**Why it happens:** The project intentionally isolates command and mock-heavy files in separate processes. [VERIFIED: repo code]
**How to avoid:** Use `bun run test`, `bun run test:integ`, or `bun test <single-file>` for targeted runs. [VERIFIED: repo code]
**Warning signs:** Unrelated tests fail only when the whole suite runs together. [VERIFIED: repo code]

### Pitfall 3: Import-time path capture
**What goes wrong:** Helpers or tests set isolation after modules importing `src/lib/paths.ts` have already been loaded, so the real config paths are baked in. [VERIFIED: repo code]
**Why it happens:** `paths.ts` exports constants evaluated at import time, and `useIsolatedConfig()` warns about this explicitly. [VERIFIED: repo code]
**How to avoid:** For in-process tests, call path-mocking helpers before dynamic imports; for subprocess tests, set env before spawning the process. [VERIFIED: repo code]
**Warning signs:** A test writes files under the developer’s real config tree or ignores the intended temp dir. [VERIFIED: repo code]

### Pitfall 4: Inventory entries that are too fine or too vague
**What goes wrong:** One item per flag explodes maintenance, while one item per command family hides unmapped risk. [VERIFIED: requirements] [VERIFIED: phase context]
**Why it happens:** The milestone needs flow-level IDs, not raw-command-only counting. [VERIFIED: phase context]
**How to avoid:** Use one item per independently meaningful user flow, and capture material variants in `commands` or a `variants` field unless they deserve their own flow. [VERIFIED: phase context]
**Warning signs:** Maintainers cannot tell whether `status --fetch`, `--json`, or editor/TUI exclusions are represented cleanly. [VERIFIED: requirements] [VERIFIED: roadmap]

### Pitfall 5: Noisy success output or over-broad failure logs
**What goes wrong:** Passing tests spam logs, or failing tests dump the entire environment. [VERIFIED: phase context]
**Why it happens:** Command wrappers often mix execution, assertion, and logging responsibilities. [VERIFIED: repo code]
**How to avoid:** Return structured results quietly; only format the bundle when a test decides it has failed, and only include an allowlisted env preview. [VERIFIED: phase context]
**Warning signs:** CI/local output becomes unreadable or secrets appear in failure output. [VERIFIED: phase context]

## Code Examples

Verified patterns from repo sources:

### Real CLI invocation with isolated config
```typescript
// Source: tests/commands/template-list.test.ts [VERIFIED: repo code]
const result = Bun.spawnSync(["bun", "run", "src/index.ts", "template", "list", ...args], {
  cwd: PROJECT_ROOT,
  env: { ...process.env, GIT_STACKS_CONFIG_DIR: cfgDir },
  stdio: ["pipe", "pipe", "pipe"],
})
```

### Real git fixture plus CLI JSON assertion
```typescript
// Source: tests/commands/status-json.test.ts [VERIFIED: repo code]
const { stdout } = runStatus(cfgDir, ["--json"])
const parsed = JSON.parse(stdout.trim())
expect(Array.isArray(parsed)).toBe(true)
expect(parsed[0]).toHaveProperty("name", "test-ws")
```

### Existing helper primitives to extend
```typescript
// Source: tests/helpers.ts [VERIFIED: repo code]
export function makeTmpDir(prefix = "ws-test"): string { /* ... */ }
export function cleanup(dir: string) { /* ... */ }
export function write(base: string, rel: string, content: string) { /* ... */ }
export function makeGitRepo(base: string, name = "repo"): string { /* ... */ }
export function getTestGitEnv(baseDir: string): NodeJS.ProcessEnv { /* ... */ }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shared-process `bun test tests/` for everything | Custom runner isolates `tests/commands/*`, TUI integration tests, and mock-heavy files into subprocesses. [VERIFIED: repo code] | Already present in current repo state. [VERIFIED: repo code] | Phase 80 should plug into the existing isolation model, not replace it. [VERIFIED: repo code] |
| Per-file bespoke CLI spawn wrappers | Consolidate into a thin shared helper while keeping assertions local. [VERIFIED: repo code] [VERIFIED: phase context] | Phase 80 target state. [VERIFIED: phase context] | Reduces duplicated env setup/decoding and standardizes diagnostics. [VERIFIED: repo code] |
| Human-readable inventory expectations | Canonical typed TypeScript inventory with no parallel prose requirement. [VERIFIED: phase context] [VERIFIED: state] | Locked on 2026-04-10 in Phase 80 context/state. [VERIFIED: phase context] [VERIFIED: state] | Later mapping and local gates can consume the same artifact directly. [VERIFIED: requirements] |

**Deprecated/outdated:**
- Treating the inventory as a documentation artifact first is outdated for this milestone. [VERIFIED: phase context] [VERIFIED: state]
- Designing a separate E2E harness subsystem is outdated for this phase. [VERIFIED: phase context]

## Assumptions Log

All claims in this research were verified in this session from repo code, local runtime checks, roadmap/requirements artifacts, or npm registry metadata. [VERIFIED: repo code] [VERIFIED: local runtime] [VERIFIED: npm registry]

## Open Questions

1. **What exact file path should own the canonical inventory module?**
   - What we know: It should be typed TypeScript, repo-owned, and test-only. [VERIFIED: phase context] [VERIFIED: repo code]
   - What's unclear: `tests/e2e-inventory.ts` versus a nearby support path such as `tests/commands/e2e-inventory.ts`.
   - Recommendation: Prefer `tests/e2e-inventory.ts` unless the planner wants tighter co-location with `tests/commands/`. The important constraint is that the public artifact lives under `tests/` and remains outside the published package. [VERIFIED: repo code]

2. **Should Phase 80 add a validator helper, a validator test, or both?**
   - What we know: Later phases and local gates must detect duplicate IDs and unmapped in-scope items reliably. [VERIFIED: requirements]
   - What's unclear: Whether validation should happen at module import time, in a dedicated unit test, or both.
   - Recommendation: Add both a pure validator function and a small unit test that exercises it. The function is reusable by later gates; the test catches regressions early. [VERIFIED: requirements]

3. **What env keys belong in the curated failure bundle allowlist?**
   - What we know: The bundle must include relevant env context but not the full environment. [VERIFIED: phase context]
   - What's unclear: The exact allowlist.
   - Recommendation: Lock an explicit allowlist in the plan and keep it narrow: config-path variables, git-isolation variables, PATH, and any scenario-specific vars the test deliberately injects.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Test runner, real CLI subprocess execution | ✓ [VERIFIED: local environment] | 1.3.10 [VERIFIED: local environment] | None — blocking if missing |
| Git | Real repo fixtures and CLI startup version check | ✓ [VERIFIED: local environment] | 2.53.0 [VERIFIED: local environment] | None — blocking if missing |
| Node.js | npm registry verification and repo tooling | ✓ [VERIFIED: local environment] | v25.9.0 [VERIFIED: local environment] | None needed for normal Bun test execution |
| npm | Package version verification | ✓ [VERIFIED: local environment] | 11.12.1 [VERIFIED: local environment] | None needed during implementation if versions are already pinned |

**Missing dependencies with no fallback:**
- None. [VERIFIED: local environment]

**Missing dependencies with fallback:**
- None. [VERIFIED: local environment]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` on Bun 1.3.10. [VERIFIED: repo code] [VERIFIED: local environment] |
| Config file | `bunfig.toml`. [VERIFIED: repo code] |
| Quick run command | `bun test tests/commands/e2e-harness.test.ts -x` once the Phase 80 file exists. [VERIFIED: repo code] |
| Full suite command | `bun run test && bun run typecheck`. [VERIFIED: repo code] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| E2E-01 | Typed inventory exists and is machine-parseable | unit | `bun test tests/lib/e2e-inventory.test.ts -x` | ❌ Wave 0 |
| E2E-02 | Explicit exclusions are represented in data | unit | `bun test tests/lib/e2e-inventory.test.ts -x` | ❌ Wave 0 |
| E2E-03 | Unmapped in-scope items are detectable | unit | `bun test tests/lib/e2e-inventory.test.ts -x` | ❌ Wave 0 |
| E2E-04 | CLI runs in isolated config/git home | integration | `bun test tests/commands/e2e-harness.test.ts -x` | ❌ Wave 0 |
| E2E-05 | Fixture builders create disposable repo/template/workspace/config setups | integration | `bun test tests/commands/e2e-harness.test.ts -x` | ❌ Wave 0 |
| E2E-06 | Tests can assert exit code/stdout/stderr/files/YAML | integration | `bun test tests/commands/e2e-harness.test.ts -x` | ❌ Wave 0 |
| E2E-07 | Failures expose a rich redacted debug bundle | integration | `bun test tests/commands/e2e-harness.test.ts -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/e2e-inventory.test.ts -x && bun test tests/commands/e2e-harness.test.ts -x`
- **Per wave merge:** `bun run test:integ && bun run typecheck`
- **Phase gate:** `bun run test && bun run typecheck`

### Wave 0 Gaps
- [ ] `tests/e2e-inventory.ts` — canonical typed inventory module
- [ ] `tests/lib/e2e-inventory.test.ts` — unique IDs / exclusions / unmapped selector coverage
- [ ] `tests/commands/e2e-harness.test.ts` — real-process harness and diagnostics coverage
- [ ] Shared helper exports in `tests/helpers.ts` for `runCli` and reusable config/template/workspace fixture builders

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no [VERIFIED: repo code] | — |
| V3 Session Management | no [VERIFIED: repo code] | — |
| V4 Access Control | no [VERIFIED: repo code] | — |
| V5 Input Validation | yes [VERIFIED: repo code] | Reuse existing schema/name validation and keep test fixture names/path inputs explicit. [VERIFIED: repo code] |
| V6 Cryptography | no [VERIFIED: repo code] | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Accidental mutation of developer config/home | Tampering | Force isolated `HOME`, `XDG_CONFIG_HOME`, `GIT_CONFIG_GLOBAL`, and `GIT_STACKS_CONFIG_DIR` in the harness env. [VERIFIED: repo code] |
| Secret leakage in failure diagnostics | Information Disclosure | Use an explicit env allowlist and never dump `process.env` wholesale. [VERIFIED: phase context] |
| Command/path confusion from cwd-sensitive tests | Tampering | Capture explicit `cwd` in harness results and assert file/YAML side effects from known temp paths. [VERIFIED: repo code] |
| Shell injection by ad-hoc command assembly in tests | Tampering | Spawn the CLI with argv arrays; only use shell execution when the product flow itself requires it. [VERIFIED: repo code] [VERIFIED: local runtime] |

## Sources

### Primary (HIGH confidence)
- Repo audit: `tests/helpers.ts`, `scripts/test-runner.ts`, `tests/commands/template-list.test.ts`, `tests/commands/status-json.test.ts`, `tests/commands/env.test.ts`, `src/index.ts`, `src/lib/paths.ts`, `src/commands/*.ts`, `package.json`, `tsconfig.json`, `bunfig.toml`, `CLAUDE.md`, `.planning/codebase/TESTING.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/phases/80-e2e-cli-harness-and-living-inventory/80-CONTEXT.md`
- Local runtime verification: `bun --version`, `git --version`, `node --version`, `npm --version`, `bun -e 'Bun.spawnSync(...)'`
- npm registry verification: `npm view commander version`, `npm view yaml version`, `npm view zod version`, `npm view typescript version`, `npm view @types/bun version`, plus `npm view <pkg> time --json`

### Secondary (MEDIUM confidence)
- None.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified from repo configuration, local runtime, and npm registry. [VERIFIED: repo code] [VERIFIED: local runtime] [VERIFIED: npm registry]
- Architecture: HIGH - verified from existing command tests, helper layer, and test runner source. [VERIFIED: repo code]
- Pitfalls: HIGH - verified from repo constraints (`mock.module` isolation, import-time paths, git env helpers) and locked Phase 80 decisions. [VERIFIED: repo code] [VERIFIED: phase context]

**Research date:** 2026-04-10
**Valid until:** 2026-04-17
