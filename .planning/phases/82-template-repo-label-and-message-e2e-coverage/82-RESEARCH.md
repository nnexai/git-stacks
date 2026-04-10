# Phase 82: Template, Repo, Label, and Message E2E Coverage - Research

**Researched:** 2026-04-10
**Domain:** Bun CLI subprocess E2E coverage for non-workspace command families. [VERIFIED: repo code] [VERIFIED: phase context]
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

_Verbatim copy from `82-CONTEXT.md`. [VERIFIED: phase context]_

### Locked Decisions

### Repo registry scope
- **D-01:** Phase 82 should exclude `repo scan` and bring roadmap/scope into line with `REQUIREMENTS.md`; the Phase 80 inventory should keep `repo scan` as an explicit excluded item with rationale.
- **D-02:** Repo registry E2E should use separate git-repo and dir-repo scenario groups, with shared rename/list/show/remove assertions where behavior overlaps.
- **D-03:** `repo add` E2E should prove both the no-enabled-forge path and one enabled-single-match auto-detect path.
- **D-04:** The enabled-single-match repo path should use a stub `gh`/`glab` binary plus a matching remote URL and real isolated `config.yml` integration enablement; avoid `tea` and real forge auth in Phase 82 E2E.
- **D-05:** Representative repo failure cases like missing paths and duplicate names stay in Phase 82.1; Phase 82 stays focused on success paths and output contracts.
- **D-06:** Because `repo list`/`repo show` do not expose forge metadata, Phase 82 should prove forge persistence via `repo add` stdout plus persisted registry YAML while keeping `list`/`show` assertions on their current user-facing contracts.
- **D-07:** Dir-repo coverage should explicitly prove that dir repos skip forge detection and default to `main`, in addition to normal add/list/show/rename/remove behavior.
- **D-08:** Repo removal should use `--force` in Phase 82; prompt interaction stays out of scope here.
- **D-09:** Git-repo coverage should prove both auto-detected current branch and explicit `--branch` override behavior.

### Template coverage boundary
- **D-10:** Template label propagation should be proven through the new non-interactive create and clone paths from Phase 81.1.1.
- **D-11:** Template “create” coverage in Phase 82 means using `new --non-interactive` with pre-provided template data; it does not mean testing `template new` directly.
- **D-12:** Structure template coverage as separate template-command scenarios and template-consumption scenarios.
- **D-13:** Template composition should be proven through `new --non-interactive` with repeatable `--template`, asserting the resulting workspace snapshot and propagated labels/config.

### Workspace labels and messages
- **D-14:** Keep workspace labels and messages as separate focused contract suites.
- **D-15:** For workspace labels, extend the existing subprocess coverage only enough to close roadmap gaps and map it into the Phase 80 inventory source.
- **D-16:** Message coverage should be one focused contract suite covering `send`/`list`/`clear`, workspace resolution, sender metadata, JSONL persistence, and missing-workspace behavior.
- **D-17:** Ignore live socket delivery in Phase 82 and assert the durable CLI/file contract only.
- **D-18:** Add an explicit test/automation opt-out for socket push and use it in the message E2E suite so tests cannot touch a real local dashboard.

### Inventory mapping
- **D-19:** Keep flow-level inventory items and map them to one or more focused test files as needed.
- **D-20:** Record exclusions and partial-coverage rationale inline with the inventory item metadata, not in separate prose.
- **D-21:** Update inventory mappings incrementally as each suite lands or is extended.

### the agent's Discretion
- Exact test file boundaries, as long as the suite grouping stays aligned with the decisions above.
- Exact names and shape of the message socket opt-out seam, as long as it is explicit, automation-safe, and not a silent hidden test hook.
- Exact inventory metadata field names for mappings/exclusions, as long as the source stays machine-parseable and flow-level.

### Deferred Ideas (OUT OF SCOPE)
- Direct `repo scan` E2E coverage — excluded from this milestone scope and should remain explicitly documented as such in the inventory.
- Direct `template new` / other wizard-driven template UX coverage.
- Prompt-driven success/failure variants for repo removal and other representative error paths — Phase 82.1.
- Live dashboard socket delivery behavior for messages — TUI/integration-adjacent concern, not part of this phase’s durable CLI contract.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| E2E-09 | User-facing template flows need E2E coverage for create via fixtures/non-interactive path, list/show, clone/rename/remove, template composition, and template label behavior. [VERIFIED: requirements] | Split coverage into `template` command contracts plus template-backed `new --non-interactive` consumption/propagation scenarios. [VERIFIED: phase context] [VERIFIED: repo code] |
| E2E-10 | User-facing repo registry flows need E2E coverage for add/list/show/rename/remove across git and dir repos; `repo scan` is excluded. [VERIFIED: requirements] | Use separate git-repo and dir-repo suites, force no-prompt success paths, and prove forge persistence through `repo add` stdout plus `registry.yml`. [VERIFIED: phase context] [VERIFIED: repo code] |
| E2E-11 | User-facing workspace label and message flows need E2E coverage for add/remove/list/clear and send/list/clear behavior. [VERIFIED: requirements] | Extend `tests/commands/label.test.ts` for remaining label contracts and add one focused message CLI suite that asserts JSONL persistence and workspace resolution while bypassing socket delivery. [VERIFIED: phase context] [VERIFIED: repo code] |
</phase_requirements>

## Summary

The current repo already proves the basic subprocess pattern for command tests, but Phase 82 is still a large coverage gap: `tests/commands/` currently contains template list/label and workspace label suites, while repo registry, message CLI, template show/clone/rename/remove, and template-backed workspace consumption are not yet covered. [VERIFIED: repo code] Planning should therefore extend the Phase 80 harness style rather than inventing a new framework. [VERIFIED: 80-RESEARCH.md] [VERIFIED: phase context]

The two biggest planning risks are prerequisite drift and scope drift. The Phase 82 context assumes Phase 81.1 and 81.1.1 land first, but the current tree still lacks the non-interactive `new`/`clone` surface and still has `repo add` calling forge detection directly from `detectForgeForRepo()` without any visible global-enable filter in `src/commands/repo.ts`. [VERIFIED: phase context] [VERIFIED: repo code] The roadmap text is also stale for this phase because it still mentions `repo scan` and representative error cases, while the requirements and phase context exclude those from Phase 82. [VERIFIED: roadmap] [VERIFIED: requirements] [VERIFIED: phase context]

**Primary recommendation:** Plan Phase 82 as five focused deliverables—template commands, template consumption, repo registry, workspace labels, and messages—gated by prerequisite verification that the Phase 80 inventory/harness plus Phases 81.1 and 81.1.1 surfaces are present before implementation starts. [VERIFIED: phase context] [VERIFIED: repo code]

## Project Constraints (from copilot-instructions.md)

- Use GSD workflows only when explicitly invoked by the user. [VERIFIED: copilot-instructions.md]
- Treat `gsd-*` and `/gsd-*` as command invocations and use the matching GSD skill. [VERIFIED: copilot-instructions.md]
- Prefer a matching custom agent when a GSD command says to spawn a subagent. [VERIFIED: copilot-instructions.md]
- After completing a GSD command or deliverable, offer the next step to the user. [VERIFIED: copilot-instructions.md]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime | 1.3.10 | Executes the CLI directly and powers subprocess tests via `Bun.spawnSync`. [VERIFIED: local environment] [VERIFIED: repo code] | The project has no build step and already runs tests/CLI on Bun. [VERIFIED: package.json] [VERIFIED: CLAUDE.md] |
| `bun:test` | bundled with Bun 1.3.10 | Assertion and test API for all command suites. [VERIFIED: local environment] [VERIFIED: repo code] | Existing command and lib tests already use it. [VERIFIED: repo code] |
| `scripts/test-runner.ts` | repo-local | Keeps `tests/commands/*` isolated per file. [VERIFIED: repo code] | Command suites must fit the existing isolated-process architecture, not bypass it. [VERIFIED: 80-RESEARCH.md] [VERIFIED: phase context] |
| TypeScript | 6.0.2 | Test helpers, fixtures, and inventory mappings stay typed. [VERIFIED: npm registry] [VERIFIED: package.json] | The codebase and planned inventory source are TypeScript-first. [VERIFIED: repo code] [VERIFIED: 80-RESEARCH.md] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Commander | 14.0.3 | Defines the command tree under test. [VERIFIED: npm registry] [VERIFIED: package.json] | Use command definitions as the contract source for argv and output expectations. [VERIFIED: repo code] |
| YAML | 2.8.3 | Reads/writes `registry.yml`, template YAML, and workspace YAML. [VERIFIED: npm registry] [VERIFIED: repo code] | Assert persisted artifacts whenever CLI output omits hidden state like forge metadata. [VERIFIED: phase context] [VERIFIED: repo code] |
| `tests/helpers.ts` | repo-local | Existing temp-dir, git-env, isolated-config, and mock helpers. [VERIFIED: repo code] | Extend this file first for shared subprocess/env/bin-stub builders. [VERIFIED: 80-RESEARCH.md] [VERIFIED: phase context] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `tests/helpers.ts` + isolated command files | A second E2E framework or DSL | Faster to sketch, slower to maintain; Phase 80 explicitly chose extension over replacement. [VERIFIED: 80-RESEARCH.md] [VERIFIED: phase context] |
| Stub `gh`/`glab` plus matching remote URLs | Real forge auth or live hosted repos | Real auth adds flaky external dependencies and is explicitly excluded from this phase. [VERIFIED: phase context] [VERIFIED: requirements] |
| Durable file-contract assertions for messages | Spinning up/asserting a real dashboard socket | The phase explicitly excludes live socket behavior and only needs JSONL + CLI contracts. [VERIFIED: phase context] [VERIFIED: repo code] |

**Installation:**
```bash
bun install
```

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
├── helpers.ts                       # shared CLI/env/git/temp-bin helpers to extend [VERIFIED: repo code]
├── commands/
│   ├── template-commands.test.ts    # template list/show/clone/rename/remove + template label contracts [VERIFIED: phase context]
│   ├── template-consumption.test.ts # `new --non-interactive --from/--template` propagation/composition [VERIFIED: phase context]
│   ├── repo.test.ts                 # git-repo + dir-repo registry scenarios [VERIFIED: phase context]
│   ├── label.test.ts                # extend existing workspace label suite [VERIFIED: repo code]
│   └── message.test.ts              # send/list/clear durable contract suite [VERIFIED: phase context]
└── e2e-inventory.ts                 # Phase 80 mapping source when prerequisite is merged [VERIFIED: 80-RESEARCH.md]
```

`tests/e2e-inventory.ts` and a shared `runCli` helper are recommended by Phase 80 research, but neither is present in the current tree yet. [VERIFIED: 80-RESEARCH.md] [VERIFIED: repo code]

### Pattern 1: Focused subprocess suites, not one mega-journey
**What:** Keep one command-family contract per file: template commands, template consumption, repo registry, labels, and messages. [VERIFIED: phase context]
**When to use:** Always for Phase 82; existing `tests/commands/*.test.ts` files are already organized as focused command suites. [VERIFIED: repo code]
**Example:**
```typescript
// Source: tests/commands/template-list.test.ts [VERIFIED: repo code]
const result = Bun.spawnSync(["bun", "run", "src/index.ts", "template", "list", ...args], {
  cwd: PROJECT_ROOT,
  env: { ...process.env, GIT_STACKS_CONFIG_DIR: cfgDir },
  stdio: ["pipe", "pipe", "pipe"],
})
```

### Pattern 2: Split template command coverage from template consumption coverage
**What:** Cover `template list/show/clone/rename/remove/label` separately from template-backed workspace creation/clone behavior. [VERIFIED: phase context] [VERIFIED: requirements]
**When to use:** Any time the test needs to prove label propagation, composed templates, or workspace snapshot side effects; those belong in the consumption suite, not the pure template command suite. [VERIFIED: phase context]
**Example:**
```typescript
// Source: src/lib/workspace-lifecycle.ts [VERIFIED: repo code]
const templateLabels = inputs.templateLabels
  ?? (inputs.templateName ? (composeTemplates([inputs.templateName]).labels ?? []) : [])
const resolvedLabels = [...new Set([...(templateLabels ?? []), ...(inputs.labels ?? [])])]
```

### Pattern 3: Prove repo forge behavior through stdout + persisted registry YAML
**What:** Keep `repo list`/`repo show` assertions on their current user-facing output, and prove forge persistence through `repo add` output plus `registry.yml`. [VERIFIED: phase context] [VERIFIED: repo code]
**When to use:** For the enabled-single-match git-repo scenario, where forge state is not exposed by `list` or `show`. [VERIFIED: phase context]
**Example:**
```typescript
// Source: src/commands/repo.ts [VERIFIED: repo code]
const forgeSuggestions = await detectForgeForRepo(localPath)
if (forgeSuggestions.length === 1) {
  forge = forgeSuggestions[0]
  console.log(`  Detected forge: ${forge}`)
}
writeRegistry(registry)
console.log(`Registered '${name}' (${type}) at ${localPath} [${defaultBranch}]${forgeLabel}${dirLabel}`)
```

### Pattern 4: Put the message socket opt-out seam in `pushToSocket()`
**What:** Add one explicit automation-safe bypass at the `src/lib/messages.ts` socket boundary so every CLI path remains safe under test. [VERIFIED: repo code] [VERIFIED: phase context]
**When to use:** Before adding the message E2E suite; `message send` always calls `pushToSocket()` after appending JSONL today. [VERIFIED: repo code]
**Example:**
```typescript
// Source: src/commands/message.ts + src/lib/messages.ts [VERIFIED: repo code]
const record = await appendMessage(ws, text, opts.from)
await pushToSocket(record)
```

### Anti-Patterns to Avoid
- **Driving excluded prompts:** Do not automate `template new`, `repo scan`, or prompt-driven repo removal in this phase. [VERIFIED: requirements] [VERIFIED: phase context]
- **Real forge dependencies:** Do not rely on real `gh`/`glab` auth, hosted remotes, or `tea`. [VERIFIED: phase context]
- **Asserting forge metadata through the wrong surface:** `repo list` and `repo show` do not print forge metadata today. [VERIFIED: phase context] [VERIFIED: repo code]
- **Touching a real dashboard socket:** `pushToSocket()` currently targets `/tmp/git-stacks.sock` unconditionally. [VERIFIED: repo code]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI E2E harness | A new scenario DSL or runner | Existing `Bun.spawnSync` pattern + `tests/helpers.ts` + `scripts/test-runner.ts` [VERIFIED: repo code] | The repo already isolates `tests/commands/*` correctly; replacement adds risk without value. [VERIFIED: repo code] [VERIFIED: 80-RESEARCH.md] |
| Forge backends for repo tests | Real GitHub/GitLab/Gitea integration setup | Temp-bin `gh`/`glab` stubs plus matching git remote URLs and isolated config. [VERIFIED: phase context] [VERIFIED: repo code] | The command only needs CLI presence + remote URL detection for the Phase 82 success path. [VERIFIED: repo code] |
| Template merge logic in tests | Manual YAML composition in fixtures | Existing composition and workspace creation path via `--template`/template labels. [VERIFIED: repo code] [VERIFIED: phase context] | The product already defines precedence, label union, and dedupe order. [VERIFIED: repo code] |
| Message transport assertions | A real IPC server harness | JSONL file assertions plus one explicit socket opt-out seam. [VERIFIED: phase context] [VERIFIED: repo code] | Live socket delivery is out of scope; the durable file contract is the required user-facing behavior. [VERIFIED: phase context] |

**Key insight:** Phase 82 should prove existing CLI contracts with real filesystem/git state, not create new abstractions or external dependencies just to make tests possible. [VERIFIED: phase context] [VERIFIED: repo code]

## Common Pitfalls

### Pitfall 1: Planning from stale roadmap text instead of the locked phase scope
**What goes wrong:** Tasks include `repo scan`, failure matrices, or prompt automation because the roadmap Phase 82 section still mentions them. [VERIFIED: roadmap]
**Why it happens:** The roadmap text predates the locked context refinements. [VERIFIED: roadmap] [VERIFIED: phase context]
**How to avoid:** Treat `82-CONTEXT.md` plus `E2E-09..11` as the phase source of truth and leave `repo scan` / representative failures to inventory exclusions or Phase 82.1. [VERIFIED: requirements] [VERIFIED: phase context]
**Warning signs:** A draft plan includes `repo scan`, prompt removal flows without `--force`, or missing-workspace/error matrices as core success work. [VERIFIED: phase context]

### Pitfall 2: Ignoring prerequisite drift
**What goes wrong:** Phase 82 tasks assume shared inventory/harness helpers and non-interactive create/clone already exist, but the current tree does not show them yet. [VERIFIED: repo code]
**Why it happens:** The phase context assumes Phase 80, 81.1, and 81.1.1 land first, but this branch snapshot has not absorbed those changes. [VERIFIED: phase context] [VERIFIED: repo code]
**How to avoid:** Make prerequisite verification the first planning task; if missing, stop and route back to the prerequisite phase rather than smuggling that work into Phase 82. [VERIFIED: phase context]
**Warning signs:** No `tests/e2e-inventory.ts`, no shared `runCli`, no `--non-interactive` flags in `src/commands/workspace.ts`, or `repo add` still calling unrestricted forge detection. [VERIFIED: repo code]

### Pitfall 3: Brittle ordering assertions in template list tests
**What goes wrong:** Tests fail because they assume template row order instead of asserting presence/absence. [VERIFIED: repo code]
**Why it happens:** `template list` prints `listTemplates()` results and there is no explicit sort in `src/commands/template.ts`. [VERIFIED: repo code]
**How to avoid:** Assert inclusion/exclusion or parse named rows; only assert exact order where the command explicitly defines it. [VERIFIED: repo code]
**Warning signs:** Tests compare the whole stdout block for `template list` rather than checking key lines. [VERIFIED: repo code]

### Pitfall 4: Accidental repo-type drift in dir-repo fixtures
**What goes wrong:** A dir-repo scenario unexpectedly registers as `typescript` or `java` because the fixture contains `package.json` or `pom.xml`. [VERIFIED: repo code]
**Why it happens:** `detectRepoType()` classifies by sentinel files even when the path is a non-git directory. [VERIFIED: repo code]
**How to avoid:** Build dir fixtures intentionally: empty/neutral for `other`, or include sentinel files only when you explicitly want to prove type detection. [VERIFIED: repo code]
**Warning signs:** The test expects `(other)` but `repo add` prints `(typescript)` or `(java)`. [VERIFIED: repo code]

### Pitfall 5: Falling into repo-add prompt branches
**What goes wrong:** Repo tests hang or become flaky because `repo add` enters the select prompt path. [VERIFIED: repo code]
**Why it happens:** Git repos prompt when forge detection yields multiple matches or when prerequisite enablement filtering is absent. [VERIFIED: repo code] [VERIFIED: phase context]
**How to avoid:** Use only the no-enabled-forge path and the exact-one-enabled-match path, with controlled PATH, remote URL, and config fixtures. [VERIFIED: phase context]
**Warning signs:** Test output shows “Multiple forges detected” or “No forge detected — select one or skip”. [VERIFIED: repo code]

### Pitfall 6: Message tests touching a real local dashboard
**What goes wrong:** `message send` attempts `/tmp/git-stacks.sock` and can interfere with a real local dashboard session. [VERIFIED: repo code]
**Why it happens:** `message send` always calls `pushToSocket()` after `appendMessage()`, and `pushToSocket()` always targets the fixed Unix socket path today. [VERIFIED: repo code]
**How to avoid:** Add one explicit automation-safe bypass checked inside `pushToSocket()` before `Bun.connect()`, then set it in the message E2E suite. [VERIFIED: phase context] [VERIFIED: repo code]
**Warning signs:** A local dashboard starts receiving test messages, or tests become timing-sensitive around socket connection attempts. [VERIFIED: repo code]

### Pitfall 7: Forgetting that message order is newest-first
**What goes wrong:** CLI message assertions expect append order instead of list order. [VERIFIED: repo code]
**Why it happens:** `listMessages()` reverses parsed JSONL records before returning them. [VERIFIED: repo code]
**How to avoid:** Assert newest-first ordering for both table and JSON output. [VERIFIED: repo code]
**Warning signs:** A test expects `older` before `newer` in `message list`. [VERIFIED: repo code]

## Code Examples

Verified patterns from repo sources:

### Real CLI invocation with isolated config
```typescript
// Source: tests/commands/label.test.ts [VERIFIED: repo code]
const result = Bun.spawnSync(["bun", "run", "src/index.ts", "label", ...args], {
  cwd: PROJECT_ROOT,
  env: { ...process.env, GIT_STACKS_CONFIG_DIR: cfgDir },
  stdio: ["pipe", "pipe", "pipe"],
})
```

### Template label propagation and dedupe order
```typescript
// Source: src/lib/workspace-lifecycle.ts [VERIFIED: repo code]
const templateLabels = inputs.templateLabels
  ?? (inputs.templateName ? (composeTemplates([inputs.templateName]).labels ?? []) : [])
const resolvedLabels = [...new Set([...(templateLabels ?? []), ...(inputs.labels ?? [])])]
```

### Repo add success contract
```typescript
// Source: src/commands/repo.ts [VERIFIED: repo code]
const entry: RepoRegistryEntry = {
  name,
  schema_version: "1",
  local_path: localPath,
  default_branch: defaultBranch,
  type,
  forge,
  is_dir: isDir,
}
writeRegistry(registry)
console.log(`Registered '${name}' (${type}) at ${localPath} [${defaultBranch}]${forgeLabel}${dirLabel}`)
```

### Message storage contract
```typescript
// Source: src/lib/messages.ts [VERIFIED: repo code]
const line = JSON.stringify(record) + "\n"
await appendFile(messagePath(workspace), line, "utf8")

const lines = raw.trim().split("\n").filter(Boolean)
return lines.map((l) => JSON.parse(l) as MessageRecord).reverse()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Treat Phase 82 as `repo scan` + broad error coverage because roadmap text says so | Treat Phase 82 as success-path template/repo/label/message coverage, with `repo scan` and representative failures excluded/deferred. [VERIFIED: roadmap] [VERIFIED: requirements] [VERIFIED: phase context] | Locked in Phase 82 context on 2026-04-10. [VERIFIED: phase context] | Plans must align with context/requirements, not the stale roadmap wording. [VERIFIED: phase context] |
| Per-file bespoke spawn wrappers only | Consolidate on the Phase 80 harness style while keeping assertions local in each command suite. [VERIFIED: 80-RESEARCH.md] [VERIFIED: repo code] | Phase 80 research dated 2026-04-10. [VERIFIED: 80-RESEARCH.md] | Reduces repeated env/bin-stub setup across five Phase 82 suites. [VERIFIED: 80-RESEARCH.md] |
| Prompt-driven workspace create/clone as the only template-consumption path | Use the explicit non-interactive create/clone prerequisite from Phase 81.1.1 for Phase 82 template propagation tests. [VERIFIED: 81.1.1-CONTEXT.md] | Locked in Phase 81.1.1 context on 2026-04-10. [VERIFIED: 81.1.1-CONTEXT.md] | Phase 82 should not spend work on prompt-driving or alternative automation seams. [VERIFIED: phase context] |

**Deprecated/outdated:**
- Using roadmap success criteria alone as the planning source for this phase is outdated. [VERIFIED: roadmap] [VERIFIED: phase context]
- Treating live socket delivery as required message coverage for Phase 82 is outdated. [VERIFIED: phase context]

## Assumptions Log

All research claims below were verified from repo code, planning artifacts, local runtime checks, or npm registry metadata in this session. [VERIFIED: repo code] [VERIFIED: npm registry] [VERIFIED: local environment]

## Open Questions (RESOLVED)

1. **Will Phase 82 execute on a branch where Phase 80, 81.1, and 81.1.1 are already merged?**
   - What we know: The phase context assumes those prerequisites, but the current tree still lacks the expected inventory helper and non-interactive command surface. [VERIFIED: phase context] [VERIFIED: repo code]
   - What's unclear: Whether the planner should treat those as already satisfied or add an explicit preflight gate. [VERIFIED: phase context]
   - RESOLVED: Treat prerequisite verification as the first planning task. Phase 82 execution must check that the Phase 80 harness/inventory surface plus the 81.1 and 81.1.1 repo/non-interactive prerequisites are present before any new Phase 82 test work begins; if they are missing, the executor should stop and report the unmet prerequisite instead of absorbing that work into Phase 82. [VERIFIED: phase context]

2. **What exact name should the message socket opt-out seam use?**
   - What we know: The seam must be explicit, automation-safe, and checked at the socket boundary. [VERIFIED: phase context] [VERIFIED: repo code]
   - What's unclear: The precise env var/config name. [VERIFIED: phase context]
   - RESOLVED: Use `GIT_STACKS_DISABLE_MESSAGE_SOCKET=1` as the explicit automation-safe bypass, checked inside `src/lib/messages.ts:pushToSocket()` before `Bun.connect()`. This keeps the seam obvious, local to the socket boundary, and easy to set in subprocess test env without adding hidden command-layer conditionals. [VERIFIED: repo code] [VERIFIED: phase context]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Real CLI subprocess execution and `bun:test`. [VERIFIED: repo code] | ✓ [VERIFIED: local environment] | 1.3.10 [VERIFIED: local environment] | — |
| Git | Real repo fixtures, branch detection, and remote setup. [VERIFIED: repo code] | ✓ [VERIFIED: local environment] | 2.53.0 [VERIFIED: local environment] | — |
| Node.js | npm registry verification and repo tooling. [VERIFIED: local environment] | ✓ [VERIFIED: local environment] | v25.9.0 [VERIFIED: local environment] | — |
| npm | Version verification for stack recommendations. [VERIFIED: npm registry] | ✓ [VERIFIED: local environment] | 11.12.1 [VERIFIED: local environment] | — |
| `gh` | Enabled-single-match GitHub repo-add scenario. [VERIFIED: phase context] | ✗ [VERIFIED: local environment] | — | Use a temp-bin stub executable in test PATH. [VERIFIED: phase context] [VERIFIED: repo code] |
| `glab` | Enabled-single-match GitLab repo-add scenario. [VERIFIED: phase context] | ✗ [VERIFIED: local environment] | — | Use a temp-bin stub executable in test PATH. [VERIFIED: phase context] [VERIFIED: repo code] |

**Missing dependencies with no fallback:**
- None. [VERIFIED: local environment]

**Missing dependencies with fallback:**
- `gh`, `glab` — the locked phase strategy is to stub them, not install/authenticate them. [VERIFIED: phase context]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` on Bun 1.3.10. [VERIFIED: repo code] [VERIFIED: local environment] |
| Config file | `bunfig.toml`. [VERIFIED: repo code] |
| Quick run command | `bun run test:integ` or targeted `bun test tests/commands/<file>.test.ts -x`. [VERIFIED: package.json] [VERIFIED: CLAUDE.md] |
| Full suite command | `bun run test && bun run typecheck`. [VERIFIED: package.json] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| E2E-09 | Template command contracts plus template-backed create/composition/propagation. [VERIFIED: requirements] | integration | `bun test tests/commands/template-commands.test.ts -x && bun test tests/commands/template-consumption.test.ts -x` | ❌ Wave 0 [VERIFIED: repo code] |
| E2E-10 | Repo add/list/show/rename/remove across git and dir repos, with no-enabled-forge and enabled-single-match paths. [VERIFIED: requirements] [VERIFIED: phase context] | integration | `bun test tests/commands/repo.test.ts -x` | ❌ Wave 0 [VERIFIED: repo code] |
| E2E-11 | Workspace label add/remove/list/clear plus message send/list/clear contracts. [VERIFIED: requirements] | integration | `bun test tests/commands/label.test.ts -x && bun test tests/commands/message.test.ts -x` | ❌ Wave 0 (label exists partially; message suite absent) [VERIFIED: repo code] |

### Sampling Rate
- **Per task commit:** `bun test tests/commands/<touched-file>.test.ts -x`
- **Per wave merge:** `bun run test:integ && bun run typecheck` [VERIFIED: package.json]
- **Phase gate:** `bun run test && bun run typecheck` [VERIFIED: package.json]

### Wave 0 Gaps
- [ ] Extend `tests/helpers.ts` with a shared `runCli`/temp-bin stub/env helper surface if the Phase 80 prerequisite has not landed yet. [VERIFIED: 80-RESEARCH.md] [VERIFIED: repo code]
- [ ] `tests/commands/template-commands.test.ts` — template list/show/clone/rename/remove and template-label mapping. [VERIFIED: requirements] [VERIFIED: phase context]
- [ ] `tests/commands/template-consumption.test.ts` — `new --non-interactive --from` and repeatable `--template` propagation/composition. [VERIFIED: phase context]
- [ ] `tests/commands/repo.test.ts` — split git-repo vs dir-repo scenarios with registry YAML assertions. [VERIFIED: phase context]
- [ ] Extend `tests/commands/label.test.ts` for `clear`, missing-workspace/output contracts, and inventory mapping. [VERIFIED: phase context] [VERIFIED: repo code]
- [ ] `tests/commands/message.test.ts` — send/list/clear with socket opt-out and JSONL assertions. [VERIFIED: phase context] [VERIFIED: repo code]
- [ ] Update the Phase 80 inventory source with mappings/exclusions once the prerequisite inventory file exists on the implementation branch. [VERIFIED: phase context] [VERIFIED: 80-RESEARCH.md]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no [VERIFIED: repo code] | — |
| V3 Session Management | no [VERIFIED: repo code] | — |
| V4 Access Control | no [VERIFIED: repo code] | — |
| V5 Input Validation | yes [VERIFIED: repo code] | Reuse existing `NameSchema` and label validation; keep fixture names and argv explicit. [VERIFIED: repo code] |
| V6 Cryptography | no [VERIFIED: repo code] | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Accidental mutation of the developer’s real config/home | Tampering | Force `GIT_STACKS_CONFIG_DIR` plus isolated git env (`HOME`, `XDG_CONFIG_HOME`, `GIT_CONFIG_GLOBAL`, `GIT_TERMINAL_PROMPT`) in every subprocess fixture. [VERIFIED: repo code] |
| PATH confusion from fake forge binaries | Tampering | Use a dedicated temp-bin directory prepended only in child-process env for the repo suite. [VERIFIED: phase context] [VERIFIED: repo code] |
| Unintended IPC to a real local dashboard | Information Disclosure | Add an explicit socket opt-out seam in `pushToSocket()` and set it in tests. [VERIFIED: phase context] [VERIFIED: repo code] |
| Prompt hangs in automation | Denial of Service | Stay on no-prompt paths only (`--force`, no-match, or exact-one-match forge flows). [VERIFIED: phase context] [VERIFIED: repo code] |

## Sources

### Primary (HIGH confidence)
- Repo audit: `package.json`, `CLAUDE.md`, `bunfig.toml`, `scripts/test-runner.ts`, `tests/helpers.ts`, `tests/commands/template-list.test.ts`, `tests/commands/template-label.test.ts`, `tests/commands/label.test.ts`, `tests/lib/messages.test.ts`, `tests/lib/workspace-lifecycle-create.test.ts`, `tests/tui/workspace-wizard.test.ts`, `src/index.ts`, `src/commands/template.ts`, `src/commands/repo.ts`, `src/commands/label.ts`, `src/commands/message.ts`, `src/commands/workspace.ts`, `src/lib/messages.ts`, `src/lib/detect.ts`, `src/lib/config.ts`, `src/lib/composition.ts`, `src/lib/workspace-lifecycle.ts`, `src/lib/integrations/forge-utils.ts`, `src/lib/integrations/types.ts`, `src/lib/workspace-ops.ts`, `src/lib/paths.ts`, `src/tui/dashboard/run.tsx`. [VERIFIED: repo code]
- Planning artifacts: `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/config.json`, `.planning/phases/80-e2e-cli-harness-and-living-inventory/80-CONTEXT.md`, `.planning/phases/80-e2e-cli-harness-and-living-inventory/80-RESEARCH.md`, `.planning/phases/81-workspace-and-git-operation-e2e-coverage/81-CONTEXT.md`, `.planning/phases/81.1-repo-add-honors-enabled-forge-integrations/81.1-CONTEXT.md`, `.planning/phases/81.1.1-minimal-non-interactive-workspace-create-and-clone-variants/81.1.1-CONTEXT.md`, `.planning/phases/82-template-repo-label-and-message-e2e-coverage/82-CONTEXT.md`. [VERIFIED: phase context] [VERIFIED: requirements] [VERIFIED: roadmap] [VERIFIED: state]
- Local runtime verification: `bun --version`, `git --version`, `node --version`, `npm --version`, `command -v gh`, `command -v glab`, `tea --version`. [VERIFIED: local environment]
- npm registry verification: `npm view commander version/time`, `npm view yaml version/time`, `npm view zod version/time`, `npm view typescript version/time`, `npm view @types/bun version/time`. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- None.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified against `package.json`, local tool versions, and npm registry. [VERIFIED: package.json] [VERIFIED: local environment] [VERIFIED: npm registry]
- Architecture: MEDIUM - recommended structure is strongly constrained by repo patterns, but key prerequisites from Phases 80/81.1/81.1.1 are not present in the current tree snapshot yet. [VERIFIED: repo code] [VERIFIED: phase context]
- Pitfalls: HIGH - all listed failure modes are directly visible in current code, current tests, or locked phase constraints. [VERIFIED: repo code] [VERIFIED: phase context]

**Research date:** 2026-04-10
**Valid until:** 2026-05-10
