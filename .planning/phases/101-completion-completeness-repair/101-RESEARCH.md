# Phase 101: Completion Completeness Repair - Research

**Researched:** 2026-05-25  
**Domain:** CLI shell completion generation and regression gating  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Command Coverage Boundary
- **D-01:** Audit the full current Commander command tree, not only a hand-picked list of recently reported gaps.
- **D-02:** Close any bash, zsh, or fish completion gaps found for top-level commands, nested subcommands, options, enum values, and supported dynamic positional arguments.
- **D-03:** Pay explicit attention to recent and adjacent command families called out by the roadmap: `files`, `command`, `notes`, forge/source-adjacent commands, manager/support surfaces, and existing workspace/template/repo/integration surfaces.
- **D-04:** Keep Phase 101 narrowly focused on completion coverage. Do not broaden this phase into new command behavior, new workspace actions, or todo implementation.

### Dynamic Value Behavior
- **D-05:** Preserve prior completion fixes while repairing coverage: no repeated already-satisfied positional args, no parent flag leakage, fixed enum choices stay scoped correctly, and optional positional args stay position-aware.
- **D-06:** Workspace, template, repo, manual command, integration, fixed enum, and optional positional completions should remain position-aware where the current command signature allows it.
- **D-07:** The implementation may keep convention-based inference plus targeted overrides or replace it with a broader inventory, but the result must be checked against the live command tree rather than maintained only by memory.

### Regression Gate
- **D-08:** A machine-readable inventory from the live Commander tree, or an equivalent live command inventory, is required as the primary regression gate.
- **D-09:** Tests must compare generated completion coverage against that live inventory so future command additions cannot silently ship without bash/zsh/fish completion entries.
- **D-10:** Focused assertions should still cover dynamic completion behavior and shell-specific edge cases, but they are secondary to the live inventory gate.

### the agent's Discretion
- The planner may choose the exact inventory shape, helper extraction, and test-file split.
- The planner may decide whether to parse generated completion output directly or expose an internal structured completion model, as long as the live command tree remains the source of truth.
- The exact depth of shell-specific simulation is left to planning judgment after the live inventory gate is designed; generator-output assertions are acceptable where real-shell simulation would be brittle or environment-dependent.

### Deferred Ideas (OUT OF SCOPE)
### Reviewed Todos (not folded)
- **Improve TUI dashboard experience** (`.planning/todos/pending/2026-05-15-improve-tui-dashboard-experience.md`) — Reviewed by matcher but not folded; dashboard behavior is out of scope for completion repair.
- **Add manual workspace commands** (`.planning/todos/pending/2026-05-15-add-manual-workspace-commands.md`) — Not folded; Phase 101 should verify completions for the shipped `command` surface only.
- **Add workspace notes** (`.planning/todos/pending/2026-05-15-add-workspace-notes.md`) — Not folded; Phase 101 should verify completions for the shipped `notes` surface only.
- **Add workspace stale view** (`.planning/todos/pending/2026-05-15-add-workspace-stale-view.md`) — Not folded; stale-workspace advisory behavior is out of scope.
- **Create workspace from forge source** (`.planning/todos/pending/2026-05-15-create-workspace-from-forge-source.md`) — Not folded; Phase 101 should verify completions for shipped forge/source-adjacent command surfaces only.
- **Improve template composition understanding** (`.planning/todos/pending/2026-05-15-improve-template-composition-understanding.md`) — Not folded; template composition ergonomics are out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COMP-01 | Shell completions cover the current command tree, including v0.18/v0.19 command families and nested subcommands. | Live inventory gate via Commander tree + shell output parity checks. |
| COMP-02 | Dynamic completions remain position-aware and avoid repeated already-satisfied positional args. | Preserve existing arity/position regression tests and extend to new surfaces. |
| COMP-03 | Focused bash/zsh/fish regression coverage catches missing completion entries before release. | Add inventory drift tests and wire to existing `bun run test` + `bun run verify`. |
</phase_requirements>

## Summary

`src/lib/completion-generator.ts` already builds completion output from a Commander-derived tree (`buildTree()`/`buildNode()`), supports nested subcommands, scoped option enums, convention inference, and explicit dynamic overrides. [VERIFIED: codebase grep]  
Primary planning risk is not generator capability, but incomplete regression gating against the *live* command tree as command families evolve. [VERIFIED: codebase grep]

Current tests are strong on focused behavior (parent flag leakage, optional positional handling, enum choices, multi-arg dispatch), and they include real-program completion audits. [VERIFIED: codebase grep]  
However, existing real-program top-level command assertions are stale relative to the current command surface (`notes`, `files`, `command`, etc.), which is exactly the drift mode this phase must eliminate. [VERIFIED: codebase grep]

**Primary recommendation:** Add a single canonical live command inventory (from Commander program assembly) and assert bash/zsh/fish completion coverage against it in automated tests and verify gates. [VERIFIED: codebase grep]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Build canonical CLI command inventory | API / Backend (CLI core) | — | Commander program registration in `src/index.ts` is the source of truth for CLI surface. [VERIFIED: codebase grep] |
| Generate bash/zsh/fish completions | API / Backend (CLI core) | — | `src/lib/completion-generator.ts` generates shell scripts from Commander tree metadata. [VERIFIED: codebase grep] |
| Dynamic positional/flag value inference | API / Backend (CLI core) | Database / Storage | Logic is in generator maps; runtime values are read from config files (`workspaces`, `templates`, `registry.yml`). [VERIFIED: codebase grep] |
| Regression drift detection before release | API / Backend (verification scripts) | — | `scripts/verify.ts` + `scripts/verify-gates.ts` are the existing release gate path. [VERIFIED: codebase grep] |

## Project Constraints (from AGENTS.md)

No `AGENTS.md` file exists at repo root, so no additional project-level agent constraints were discovered. [VERIFIED: codebase grep]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `commander` | `^14.0.3` | CLI command tree + argument/option metadata | Completion generation depends on Commander command/argument structure. [VERIFIED: codebase grep] |
| `bun` | `1.3.14` | Runtime/test execution | Repo scripts and tests are Bun-native (`bun run ...`). [VERIFIED: codebase grep] |
| TypeScript | `^6.0.2` | Implementation language | Existing completion generator/tests are TypeScript. [VERIFIED: codebase grep] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js | `v26.0.0` | CLI toolchain compatibility | Use for auxiliary tooling where Bun shell-outs or scripts depend on Node ecosystem behavior. [VERIFIED: codebase grep] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct output-string assertions only | Structured inventory comparison first, then shell-focused assertions | Inventory comparison catches command drift earlier and with lower brittleness. [VERIFIED: codebase grep] |

**Installation:**
```bash
# No new packages required for Phase 101.
```

## Package Legitimacy Audit

Not required: Phase 101 can be implemented with existing repository dependencies and no new package installs. [VERIFIED: codebase grep]

## Architecture Patterns

### System Architecture Diagram

```text
Commander registration (src/index.ts)
        |
        v
createCompletionCommand(program)
        |
        v
completion-generator buildTree/buildNode
        |
        +--> bash emitter
        +--> zsh emitter
        +--> fish emitter
        |
        v
completion scripts consumed by shells
        |
        v
tests (unit + real-program audits) + verify gates
```

### Recommended Project Structure
```text
src/
├── index.ts                     # Live Commander command tree assembly
├── commands/completion.ts       # Public completion command wiring
└── lib/completion-generator.ts  # Tree extraction + shell emitters
tests/
├── lib/completion-generator.test.ts      # Generator behavior + real-program audits
└── commands/support-readonly.test.ts     # CLI-level completion command smoke
scripts/
└── verify-gates.ts              # Release-gate drift checks
```

### Pattern 1: Live Tree as Completion Source of Truth
**What:** Build completion coverage expectations from the same Commander tree used by the CLI. [VERIFIED: codebase grep]  
**When to use:** Always, especially when command families evolve (`files`, `command`, `notes`, integration/provider trees). [VERIFIED: codebase grep]  
**Example:**
```typescript
// Source: scripts/verify-gates.ts + src/index.ts
const program = new Command()
registerWorkspaceCommands(program)
program.addCommand(filesCommand)
program.addCommand(commandCommand)
program.addCommand(notesCommand)
program.addCommand(createCompletionCommand(program))
```

### Pattern 2: Position-Aware Completion Dispatch
**What:** Dispatch completion by argument position/arity; do not re-suggest satisfied slots. [VERIFIED: codebase grep]  
**When to use:** Commands with optional positional args and multi-arg paths (`run <workspace> [repo]`, `cd <workspace> [repo]`). [VERIFIED: codebase grep]

### Anti-Patterns to Avoid
- **Static hand-maintained command lists:** They drift from Commander tree and miss new subcommands. [VERIFIED: codebase grep]
- **Global flag enum completion blocks:** Causes parent flag leakage into unrelated nested commands. [VERIFIED: codebase grep]
- **Full-output shell snapshots as primary gate:** Too brittle; keep invariant-focused assertions + inventory parity. [VERIFIED: codebase grep]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Manual command inventory | Separate YAML/JSON maintained by hand | Commander-derived inventory helper | Avoids drift and duplicate truth sources. [VERIFIED: codebase grep] |
| Parsing shell syntax deeply for every test | Full shell parser harness | Targeted invariant assertions + live inventory parity | Lower brittleness, still catches regressions. [VERIFIED: codebase grep] |
| Dynamic integration ID registry for tests | Hardcoded copied list | `integrations` source used by generator | Keeps completion IDs aligned with runtime integration set. [VERIFIED: codebase grep] |

**Key insight:** The core issue is integrity between command registration and completion output, not shell syntax generation capability. [VERIFIED: codebase grep]

## Common Pitfalls

### Pitfall 1: Real command surface changes without completion parity tests
**What goes wrong:** New families (`notes`, `files`, `command`) appear in live CLI but parity assertions remain anchored to older lists. [VERIFIED: codebase grep]  
**Why it happens:** Real-program tests assert partial command markers rather than full live inventory mapping. [VERIFIED: codebase grep]  
**How to avoid:** Generate expected paths from Commander tree and compare against shell outputs. [VERIFIED: codebase grep]  
**Warning signs:** Top-level completion string contains commands absent from test expected lists. [VERIFIED: codebase grep]

### Pitfall 2: Flag completion leakage across command scopes
**What goes wrong:** Parent options/enum values leak into nested subcommands. [VERIFIED: codebase grep]  
**Why it happens:** Global `$prev` completion handling without command-path scoping. [VERIFIED: codebase grep]  
**How to avoid:** Keep enum and command-flag completion scoped by command path (`resolveFlagCompletion`). [VERIFIED: codebase grep]  
**Warning signs:** Nested integration commands showing unrelated enum options. [VERIFIED: codebase grep]

## Code Examples

### Machine-readable command surface extraction
```typescript
// Source: scripts/verify-gates.ts
function collectCommandPaths(command: Command, parents: string[] = []): string[] {
  const paths: string[] = []
  for (const child of command.commands) {
    const path = [...parents, child.name()]
    if (child.commands.length === 0) paths.push(path.join(" "))
    else paths.push(...collectCommandPaths(child, path))
  }
  return paths
}
```

### Completion wiring through live program
```typescript
// Source: src/index.ts
program.addCommand(filesCommand)
program.addCommand(commandCommand)
program.addCommand(notesCommand)
program.addCommand(createCompletionCommand(program)) // register last
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Partial/stable marker checks for completion surfaces | Real-program audits plus detailed invariant tests | Already present before Phase 101, but needs stricter live inventory parity now | Better regression confidence once parity gate is enforced. [VERIFIED: codebase grep] |

**Deprecated/outdated:**
- Maintaining expected completion command lists by memory only is outdated for this phase goal. [VERIFIED: codebase grep]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Existing `scripts/verify-gates.ts` should be extended (not replaced) for completion drift checks. [ASSUMED] | Architecture Patterns | Medium: planner might choose a separate gate command. |

## Open Questions (RESOLVED)

1. **Should `buildTree()` be exported or should tests compare via completion output parsing only?**
   - What we know: `buildTree()` is internal today; tests already parse generated scripts and run real CLI completion output. [VERIFIED: codebase grep]
   - Resolution: Do not export internal `buildTree()` as the primary public/test surface. Phase 101 plans instead create a shared live CLI program builder plus `collectCommandPaths()`/completion-audit helpers, then compare generated bash, zsh, and fish output against that live inventory. This keeps the Commander tree as the source of truth while avoiding a brittle dependency on generator internals.
   - Planned in: `101-01-PLAN.md` Task 1 and `101-02-PLAN.md` Task 1.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Test + verify commands | ✓ | 1.3.14 | — |
| Node.js | Tooling/runtime compatibility | ✓ | v26.0.0 | — |
| npm | Package metadata/ops tooling | ✓ | 11.12.1 | — |
| ripgrep | Fast source auditing | ✓ | 15.1.0 | Use `grep` |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test runner (custom split runner) |
| Config file | `scripts/test-runner.ts` |
| Quick run command | `bun run test -- tests/lib/completion-generator.test.ts` |
| Full suite command | `bun run verify` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMP-01 | Command tree parity across bash/zsh/fish includes v0.18/v0.19 families and nested subcommands | integration + unit | `bun run test -- tests/lib/completion-generator.test.ts` | ✅ |
| COMP-02 | Position-aware dynamic completion, optional positional handling, no repeated satisfied args, no parent leakage | unit | `bun run test -- tests/lib/completion-generator.test.ts` | ✅ |
| COMP-03 | Regression drift guard against live Commander inventory | unit/script gate | `bun run test -- tests/lib/completion-generator.test.ts && bun run verify:gates` | ✅ (extend coverage) |

### Sampling Rate
- **Per task commit:** `bun run test -- tests/lib/completion-generator.test.ts`
- **Per wave merge:** `bun run test`
- **Phase gate:** `bun run verify`

### Wave 0 Gaps
- [ ] Add explicit inventory-parity assertion that fails when live command additions are missing from completion expectations (likely in `tests/lib/completion-generator.test.ts` or `tests/lib/verify-gates.test.ts`).
- [ ] Ensure parity covers `files`, `command`, `notes`, and provider/source-adjacent nested paths from the live tree.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A for local shell completion generation |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A |
| V5 Input Validation | yes | Commander argument/option parsing and enum `choices()` constraints |
| V6 Cryptography | no | N/A |

### Known Threat Patterns for CLI completion stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shell injection in generated scripts | Tampering | Keep generated fragments from controlled command metadata and fixed helper templates; avoid unsanitized user content in script literals. [VERIFIED: codebase grep] |
| Path/data leakage through completion lookup | Information Disclosure | Restrict lookups to expected config files (`~/.config/...`) and avoid broad filesystem traversal. [VERIFIED: codebase grep] |

## Sources

### Primary (HIGH confidence)
- `src/lib/completion-generator.ts` - command tree extraction, dynamic completions, bash/zsh/fish emitters.
- `src/index.ts` - live Commander tree assembly and completion command registration order.
- `src/commands/completion.ts` - shell completion command entrypoint.
- `src/commands/files.ts`, `src/commands/command.ts`, `src/commands/notes.ts`, `src/commands/integration.ts`, `src/commands/workspace.ts` - v0.18/v0.19 command-family surfaces.
- `tests/lib/completion-generator.test.ts` - focused regressions + real-program completion audits.
- `tests/commands/support-readonly.test.ts` - completion command smoke tests.
- `scripts/verify.ts`, `scripts/verify-gates.ts`, `scripts/test-runner.ts` - release-gate and test execution wiring.
- `.planning/phases/101-completion-completeness-repair/101-CONTEXT.md` - locked decisions and scope boundaries.
- `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/config.json` - phase goals/requirements/state and validation/security toggles.

### Secondary (MEDIUM confidence)
- None.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - directly verified from `package.json` and local runtime versions.
- Architecture: HIGH - derived from current source structure and completion execution path.
- Pitfalls: HIGH - grounded in existing tests and known regression classes in repo.

**Research date:** 2026-05-25  
**Valid until:** 2026-06-24
