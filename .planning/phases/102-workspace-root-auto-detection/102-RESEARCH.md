# Phase 102: Workspace Root Auto-detection - Research

**Researched:** 2026-05-25
**Domain:** Workspace auto-detection and optional-workspace command resolution
**Confidence:** HIGH

## User Constraints

### Locked Decisions
## Implementation Decisions

### Workspace-root Match Semantics
- **D-01:** Workspace root detection should match the exact workspace root path and every subdirectory under it.
- **D-02:** Workspace detection is primary. Repo detection is secondary and should only be used by commands that need repo-specific behavior.
- **D-03:** Commands that only require a workspace should accept the workspace-root or workspace-subdirectory match even when no repo can be inferred.
- **D-04:** Commands that require a repo should resolve the workspace first, then resolve the repo from the current directory when possible and fail with command-appropriate guidance when repo identity is required but unavailable.
- **D-05:** Preserve existing deepest-repo matching for repo worktree paths. A nested repo/task path should remain more specific than a broad workspace-root match.
- **D-06:** Preserve existing trunk-skip and prefix-collision protections.

### Command Surface Coverage
- **D-07:** The planner/implementor may choose a representative set of user-facing optional-workspace commands to prove behavior end to end.
- **D-08:** Representative coverage should include at least three command surfaces that exercise different resolver shapes: a workspace-only command, a command with existing `GS_WORKSPACE_NAME` fallback behavior, and a repo-aware command where cwd can still matter after workspace detection.
- **D-09:** The implementation does not need an exhaustive subprocess test for every optional-workspace command if the shared resolver is directly tested and representative CLI tests prove the user-facing behavior.

### Resolver Consolidation
- **D-10:** Use the same style as the existing repo/workspace detection work. A shared helper/resolver is expected unless research finds a strong reason to keep a command-local wrapper.
- **D-11:** The documented resolution order is explicit workspace arg, cwd detection, then `GS_WORKSPACE_NAME` only for commands that already support that env fallback.
- **D-12:** Command-local wrappers may remain only as thin adapters around shared behavior for command-specific validation or error text.

### Edge-case Proof Depth
- **D-13:** Edge-case coverage should stay pragmatic and implementor-led. The phase should protect the known fragile cases, but it does not need a large matrix.
- **D-14:** At minimum, tests should preserve root/subdirectory matching, deepest repo matching, trunk/dir non-worktree behavior, missing worktree tolerance, and overlapping-prefix protection where these are touched by the resolver.
- **D-15:** Focused real-fixture subprocess tests are required for representative user-facing commands; direct unit tests can carry the broader resolver edge cases.

### the agent's Discretion
- The planner may choose the exact shared helper API and whether it lives in `workspace-status`, a new resolver module, or an existing command support module.
- The planner may choose the three representative command surfaces, with preference for commands that already expose different resolution behavior.
- The planner may decide the minimum edge-case matrix after inspecting current tests, as long as the decisions above and Phase 102 success criteria remain covered.

### Deferred Ideas (OUT OF SCOPE)
## Deferred Ideas

### Reviewed Todos (not folded)
- **Improve TUI dashboard experience** (`.planning/todos/pending/2026-05-15-improve-tui-dashboard-experience.md`) — Reviewed by matcher but not folded; dashboard behavior is out of scope for workspace-root detection.
- **Add manual workspace commands** (`.planning/todos/pending/2026-05-15-add-manual-workspace-commands.md`) — Not folded; Phase 102 should preserve shipped `command` resolver behavior without expanding manual command functionality.
- **Add workspace notes** (`.planning/todos/pending/2026-05-15-add-workspace-notes.md`) — Not folded; Phase 102 should preserve shipped `notes` resolver behavior without expanding notes functionality.
- **Add workspace stale view** (`.planning/todos/pending/2026-05-15-add-workspace-stale-view.md`) — Future advisory workflow; out of scope.
- **Create workspace from forge source** (`.planning/todos/pending/2026-05-15-create-workspace-from-forge-source.md`) — Already resolved by Phase 92 and out of scope.
- **Improve template composition understanding** (`.planning/todos/pending/2026-05-15-improve-template-composition-understanding.md`) — Future ergonomics/support idea; out of scope.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WDET-01 | Workspace auto-detection works when current dir is workspace root | Resolver currently matches repo `task_path` only; add workspace-root/subdir match in shared detector and unit coverage. [VERIFIED: codebase grep] |
| WDET-02 | Keep deepest match behavior and protections | Existing deepest-path, trunk-skip, and prefix-collision logic is in `detectWorkspaceFromCwd`; preserve and extend with workspace-root candidates. [VERIFIED: codebase grep] |
| WDET-03 | Shared documented resolution order for optional workspace args | Current command surfaces are inconsistent; standardize shared order (explicit arg -> cwd detection -> env fallback where already supported). [VERIFIED: codebase grep] |

## Summary

Phase 102 should be implemented as a shared resolver enhancement, not per-command one-offs. Today `detectWorkspaceFromCwd()` only matches worktree `task_path` entries, so cwd at the workspace root (or root subdir outside any repo task path) returns `no_match`. [VERIFIED: codebase grep]

The command layer already uses `detectWorkspaceFromCwd()` broadly (`workspace paths/env/pull/push`, `files`, `command`, `notes`, and integration issue helper), but fallback order differs by surface. Only `notes` currently has explicit env fallback (`GS_WORKSPACE_NAME`) after cwd detection; other optional-workspace surfaces fail immediately. [VERIFIED: codebase grep]

Testing baseline is strong for worktree-path behavior and wrapper commands, but no direct fixture proves workspace-root detection through user-facing commands yet. Phase 102 should extend unit edge coverage in detector tests and add focused subprocess tests for representative surfaces with workspace-root cwd. [VERIFIED: codebase grep]

**Primary recommendation:** Extend `detectWorkspaceFromCwd()` (or a shared resolver wrapper around it) to include workspace-root/subdir matches while keeping deepest-specific match priority, then route representative optional-workspace commands through one shared resolution order.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CWD -> workspace identity resolution | API / Backend (CLI core lib) | — | Pure CLI domain logic in `src/lib/workspace-status.ts`. [VERIFIED: codebase grep] |
| Optional workspace arg resolution order | API / Backend (CLI command adapters) | — | Command handlers own parse + fallback order. [VERIFIED: codebase grep] |
| Repo inference after workspace detection | API / Backend | — | `workspace env` currently applies repo overlay via cwd after workspace resolution. [VERIFIED: codebase grep] |
| User-facing contract verification | API / Backend test tier | — | Subprocess contract tests in `tests/commands/*` validate behavior. [VERIFIED: codebase grep] |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun | 1.3.14 | Runtime + test runner | Existing repo execution and scripts are Bun-based. [VERIFIED: codebase grep] |
| Commander | ^14.0.3 | CLI command tree and optional args | All command surfaces in scope are Commander commands. [VERIFIED: codebase grep] |
| TypeScript | ^6.0.2 | Source language and typing | Current resolver/commands/tests are TS. [VERIFIED: codebase grep] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| YAML | ^2.8.3 | Workspace config persistence | Used via config reads for workspace list/detection context. [VERIFIED: codebase grep] |
| Zod | ^4.3.6 | Input validation | Keep for workspace-name validation where relevant. [VERIFIED: codebase grep] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shared resolver in `workspace-status` | Command-local detection logic per command | Would duplicate fallback behavior and break WDET-03 consistency. [VERIFIED: codebase grep] |

**Installation:**
```bash
# No new packages required for Phase 102.
```

## Package Legitimacy Audit

No external packages are required for this phase; Package Legitimacy Gate is not applicable. [VERIFIED: codebase grep]

## Architecture Patterns

### System Architecture Diagram

```text
CLI command invocation
  -> Parse explicit [workspace] arg
     -> if provided: validate + use
     -> else: detect from cwd
         -> match repo task_path candidates
         -> match workspace-root/subdir candidates (Phase 102)
         -> choose deepest specific match
     -> if still missing and command supports env fallback: GS_WORKSPACE_NAME
  -> workspace-only command path OR repo-aware follow-up detection
  -> command execution
```

### Recommended Project Structure
```text
src/
├── lib/
│   ├── workspace-status.ts      # Shared cwd detection + matching policy
│   └── integrations/issue-utils.ts
└── commands/
    ├── workspace.ts             # paths/env/pull/push optional workspace surfaces
    ├── files.ts                 # files status/pull/push optional workspace surfaces
    ├── command.ts               # manual command optional workspace surfaces
    └── notes.ts                 # explicit->cwd->env fallback baseline
tests/
├── lib/detect-workspace-cwd.test.ts
└── commands/*.test.ts
```

### Pattern 1: Shared Optional Workspace Resolver
**What:** Single resolver function implementing explicit arg -> cwd detection -> optional env fallback policy.
**When to use:** Any command that currently accepts optional workspace and does not require new semantics.
**Example:**
```typescript
// Source: src/commands/notes.ts
function resolveWorkspace(explicitWorkspace?: string): string | null {
  if (explicitWorkspace) return explicitWorkspace
  const detected = detectWorkspaceFromCwd()
  if (detected.ok) return detected.workspace.name
  return process.env.GS_WORKSPACE_NAME ?? null
}
```

### Anti-Patterns to Avoid
- **Per-command fallback drift:** Re-implementing resolution order in each command causes inconsistent behavior (already present). Use one helper. [VERIFIED: codebase grep]
- **Repo-only messaging:** Error hints that say only “run inside a worktree” become incorrect once workspace-root detection is added. [VERIFIED: codebase grep]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Workspace matching precedence | New ad-hoc path matcher in each command | Existing `detectWorkspaceFromCwd()` logic extended for workspace roots | Current matcher already handles deepest match + collision guard. [VERIFIED: codebase grep] |
| Subprocess test harness | One-off shell scripts | `runCli()` + fixture helpers in `tests/helpers.ts` | Existing harness already standard for command contracts. [VERIFIED: codebase grep] |

**Key insight:** The complexity is policy consistency, not path comparison syntax; centralize policy and reuse established matcher/tests.

## Common Pitfalls

### Pitfall 1: Prefix collision regressions
**What goes wrong:** Workspace/repo path prefix matches resolve wrong workspace (`/tmp/a` vs `/tmp/ab`).
**Why it happens:** Naive `startsWith()` without separator boundary checks.
**How to avoid:** Preserve separator-aware boundary checks in matcher when adding workspace-root candidates.
**Warning signs:** Existing collision test fails in `detect-workspace-cwd.test.ts`. [VERIFIED: codebase grep]

### Pitfall 2: Breaking trunk/dir behavior
**What goes wrong:** Trunk repos start matching as workspace cwd identity when they should not.
**Why it happens:** New matching code forgets existing trunk-skip behavior.
**How to avoid:** Keep worktree-only repo matching and treat workspace-root match separately from repo-type semantics.
**Warning signs:** Trunk skip tests fail in `detect-workspace-cwd.test.ts`. [VERIFIED: codebase grep]

### Pitfall 3: Optional-workspace order drift
**What goes wrong:** Commands resolve different workspaces under same cwd/env inputs.
**Why it happens:** Multiple command-local resolvers with different fallback order.
**How to avoid:** Shared helper API plus representative subprocess assertions across `notes`, `files/command/workspace` surfaces.
**Warning signs:** Cross-command contract tests pass individually but disagree on precedence. [VERIFIED: codebase grep]

## Code Examples

### Existing detector baseline
```typescript
// Source: src/lib/workspace-status.ts
if (currentDir === resolvedTaskPath || currentDir.startsWith(resolvedTaskPath + "/")) {
  if (resolvedTaskPath.length > bestPathLen) {
    bestMatch = ws
    bestPathLen = resolvedTaskPath.length
  }
}
```

### Existing optional resolver with env fallback
```typescript
// Source: src/commands/notes.ts
if (explicitWorkspace) return explicitWorkspace
const detected = detectWorkspaceFromCwd()
if (detected.ok) return detected.workspace.name
return process.env.GS_WORKSPACE_NAME ?? null
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Worktree task-path-only cwd detection | Need workspace-root + subdir detection in same shared resolver | Phase 102 planned on 2026-05-25 | Enables optional-workspace commands from workspace root context. [VERIFIED: codebase grep] |
| Per-command fallback variety | Unified explicit->cwd->env (where already supported) | Required by WDET-03 | Prevents behavior drift between command families. [VERIFIED: codebase grep] |

**Deprecated/outdated:**
- Error guidance limited to “run from inside a worktree” for optional-workspace commands targeted by this phase. [VERIFIED: codebase grep]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ASVS category applicability is modeled for CLI context using project conventions rather than a formal external compliance mandate. [ASSUMED] | Security Domain | Low-medium; may over/under-scope formal security checklist language. |

## Open Questions (RESOLVED)

1. **Should integration issue helper (`resolveWorkspaceArg`) adopt env fallback?**
   - What we know: It currently does explicit arg -> cwd detection only. [VERIFIED: codebase grep]
   - Decision: Do not add `GS_WORKSPACE_NAME` fallback to integration issue helpers in Phase 102.
   - Rationale: WDET-03 requires `GS_WORKSPACE_NAME` only where a command already supports that env fallback. The integration issue helper is in scope for shared explicit-arg and cwd detection, but it should remain explicit arg -> cwd detection only.
   - Plan impact: `resolveWorkspaceArg()` may delegate to the shared optional-workspace helper with env fallback disabled, preserving current behavior while gaining workspace-root cwd detection.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| bun | test/verify commands | ✓ | 1.3.14 | — |
| node | helper scripts/tooling | ✓ | v26.0.0 | — |
| git | real-fixture CLI tests | ✓ | 2.54.0 | — |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test runner (`bun run scripts/test-runner.ts`) |
| Config file | `scripts/test-runner.ts` (custom runner), `package.json` scripts |
| Quick run command | `bun test tests/lib/detect-workspace-cwd.test.ts tests/commands/workspace-wrapper-edges.test.ts tests/commands/files.test.ts tests/commands/command.test.ts tests/commands/notes.test.ts` |
| Full suite command | `bun run verify` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WDET-01 | workspace-root cwd detection resolves workspace | unit + subprocess | `bun test tests/lib/detect-workspace-cwd.test.ts tests/commands/workspace-wrapper-edges.test.ts` | ✅ |
| WDET-02 | deepest-match/trunk/prefix/dir protections preserved | unit | `bun test tests/lib/detect-workspace-cwd.test.ts` | ✅ |
| WDET-03 | explicit arg -> cwd -> env (only supported commands) | subprocess | `bun test tests/commands/notes.test.ts tests/commands/files.test.ts tests/commands/command.test.ts tests/commands/workspace-wrapper-edges.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/detect-workspace-cwd.test.ts tests/commands/workspace-wrapper-edges.test.ts`
- **Per wave merge:** `bun run test`
- **Phase gate:** `bun run verify`

### Wave 0 Gaps
- [ ] Add detector tests for workspace-root exact path and non-repo subdirectory path (currently repo-task-path focused).
- [ ] Add representative CLI subprocess assertions that run from workspace root (not repo task path) for at least three command surfaces.
- [ ] Add overlap tests for workspace-root candidates with shared prefixes (parallel to current repo task-path collision coverage).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A for local CLI phase scope [ASSUMED] |
| V3 Session Management | no | N/A for local CLI phase scope [ASSUMED] |
| V4 Access Control | yes | Workspace existence checks before action (`workspaceExists`) [VERIFIED: codebase grep] |
| V5 Input Validation | yes | Name and argument validation via command parsing and schema checks (`NameSchema`) [VERIFIED: codebase grep] |
| V6 Cryptography | no | N/A for this phase; no crypto changes [VERIFIED: codebase grep] |

### Known Threat Patterns for CLI workspace resolver stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path confusion / prefix collision | Tampering | Separator-aware path boundary checks and deepest-match precedence. [VERIFIED: codebase grep] |
| Workspace spoof via nonexistent name | Spoofing | `workspaceExists` guard before command execution. [VERIFIED: codebase grep] |
| Ambiguous fallback source | Repudiation | Document and enforce deterministic resolution order in shared helper. [VERIFIED: codebase grep] |

## Sources

### Primary (HIGH confidence)
- `.planning/phases/102-workspace-root-auto-detection/102-CONTEXT.md` - locked decisions, scope, deferred items.
- `.planning/REQUIREMENTS.md` - WDET-01/02/03 definitions.
- `src/lib/workspace-status.ts` - current `detectWorkspaceFromCwd` behavior and constraints.
- `src/commands/workspace.ts` - optional workspace detection flows for paths/env/pull/push.
- `src/commands/files.ts`, `src/commands/command.ts`, `src/commands/notes.ts` - command-level resolver behaviors.
- `tests/lib/detect-workspace-cwd.test.ts` - detector edge-case baseline.
- `tests/commands/workspace-wrapper-edges.test.ts`, `tests/commands/files.test.ts`, `tests/commands/command.test.ts`, `tests/commands/notes.test.ts` - subprocess command contract baseline.
- `package.json`, `scripts/verify-gates.ts` - test and verification commands.

### Secondary (MEDIUM confidence)
- None.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - directly verified from `package.json` and current scripts.
- Architecture: HIGH - verified from current resolver and command code paths.
- Pitfalls: HIGH - backed by current tests and error contracts.

**Research date:** 2026-05-25
**Valid until:** 2026-06-24
