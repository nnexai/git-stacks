---
phase: 76-integration-plugin-capability-contracts
verified: 2026-04-06T04:10:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 76: Integration Plugin Capability Contracts Verification Report

**Phase Goal:** Every integration plugin declares its capabilities explicitly, the runner uses those declarations instead of duck-typing, and `integration list` exposes them
**Verified:** 2026-04-06T04:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                   | Status     | Evidence                                                                                                   |
|----|---------------------------------------------------------------------------------------------------------|------------|------------------------------------------------------------------------------------------------------------|
| 1  | `Integration` interface has a required `capabilities` field typed as `ReadonlySet<Capability>`          | VERIFIED   | `types.ts` line 67: `capabilities: ReadonlySet<Capability>` (non-optional, no `?`)                       |
| 2  | All 10 plugin files declare their capabilities via `capabilities: new Set<Capability>([...])`           | VERIFIED   | grep confirms all 10: vscode, intellij, cmux, tmux, niri, aerospace, github, gitlab, gitea, jira           |
| 3  | Runner gates generate/cleanup/applies/windowDetection via `.has()` instead of optional chaining        | VERIFIED   | 7 `capabilities.has()` calls in runner.ts; no optional chaining or property-existence checks remain        |
| 4  | `bun run typecheck` passes with zero errors                                                             | VERIFIED   | `tsc --noEmit` exits 0 (no output)                                                                         |
| 5  | Existing runner tests pass with updated fake integrations                                               | VERIFIED   | `bun test tests/lib/integrations/runner.test.ts` — 18 pass, 0 fail                                        |
| 6  | `integration list` table shows a Capabilities column with abbreviated tags                              | VERIFIED   | `TAG_MAP` defined; column header `Capabilities` present; `[...i.capabilities].map(c => TAG_MAP[c]).sort()` |
| 7  | `integration list --json` includes a `capabilities` array with full capability names per plugin         | VERIFIED   | `capabilities: [...i.capabilities]` in JSON branch of `integration.ts`                                     |
| 8  | Abbreviated tags are: gen, clean, cmd, cfg, win, apl                                                    | VERIFIED   | `TAG_MAP` maps all 6 Capability members to their abbreviated forms                                          |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                                          | Expected                                              | Status     | Details                                                                             |
|---------------------------------------------------|-------------------------------------------------------|------------|-------------------------------------------------------------------------------------|
| `src/lib/integrations/types.ts`                  | `Capability` type + `capabilities` field on interface | VERIFIED   | `export type Capability = ...` (6 members); `capabilities: ReadonlySet<Capability>` |
| `src/lib/integrations/runner.ts`                 | Capability-gated runner with `.has()` checks          | VERIFIED   | All 7 duck-typing sites replaced; no optional chaining on generate/cleanup/applies  |
| `tests/lib/integrations/runner.test.ts`          | Updated fakes with capabilities + new gating tests    | VERIFIED   | All fakes have `capabilities: new Set([...])`, cleanup describe block added         |
| `src/commands/integration.ts`                    | Capabilities column in table and JSON output          | VERIFIED   | `TAG_MAP`, Capabilities column header, `[...i.capabilities]` in JSON branch         |
| `tests/lib/integration-commands.test.ts`         | Tests for capabilities field and column in output     | VERIFIED   | 3 new tests: Set instance check, TAG_MAP presence, JSON capabilities array           |
| `src/lib/integrations/vscode.ts`                 | `capabilities: new Set<Capability>([...])`            | VERIFIED   | `capabilities: new Set<Capability>(['generate', 'commands', 'configExample'])`      |
| `src/lib/integrations/intellij.ts`               | `capabilities: new Set<Capability>([...])`            | VERIFIED   | `capabilities: new Set<Capability>(['generate', 'applies'])`                        |
| `src/lib/integrations/cmux.ts`                   | `capabilities: new Set<Capability>([])`               | VERIFIED   | `capabilities: new Set<Capability>([])`                                             |
| `src/lib/integrations/tmux.ts`                   | `capabilities: new Set<Capability>([...])`            | VERIFIED   | `capabilities: new Set<Capability>(['cleanup', 'commands', 'configExample'])`       |
| `src/lib/integrations/niri.ts`                   | `capabilities: new Set<Capability>([...])`            | VERIFIED   | `capabilities: new Set<Capability>(['cleanup', 'commands', 'configExample', 'windowDetection'])` |
| `src/lib/integrations/aerospace.ts`              | `capabilities: new Set<Capability>([...])`            | VERIFIED   | `capabilities: new Set<Capability>(['cleanup', 'commands', 'configExample', 'windowDetection'])` |
| `src/lib/integrations/github.ts`                 | `capabilities: new Set<Capability>([...])`            | VERIFIED   | `capabilities: new Set<Capability>(['commands'])`                                   |
| `src/lib/integrations/gitlab.ts`                 | `capabilities: new Set<Capability>([...])`            | VERIFIED   | `capabilities: new Set<Capability>(['commands'])`                                   |
| `src/lib/integrations/gitea.ts`                  | `capabilities: new Set<Capability>([...])`            | VERIFIED   | `capabilities: new Set<Capability>(['commands'])`                                   |
| `src/lib/integrations/jira.ts`                   | `capabilities: new Set<Capability>([...])`            | VERIFIED   | `capabilities: new Set<Capability>(['commands'])`                                   |

### Key Link Verification

| From                                         | To                                         | Via                                         | Status   | Details                                                                                           |
|----------------------------------------------|--------------------------------------------|---------------------------------------------|----------|---------------------------------------------------------------------------------------------------|
| `src/lib/integrations/types.ts`             | all 10 plugin files                        | `Capability` import + `capabilities` field  | WIRED    | All 10 plugins import `Capability` from `./types` and declare `capabilities: new Set<Capability>` |
| `src/lib/integrations/runner.ts`            | `src/lib/integrations/types.ts`            | `integration.capabilities.has()` calls      | WIRED    | 7 `.has()` calls across `runIntegrationGenerate`, `runIntegrations`, `runIntegrationCleanup`       |
| `src/commands/integration.ts`               | `src/lib/integrations/types.ts`            | reading `i.capabilities` on each plugin     | WIRED    | `[...i.capabilities].map(c => TAG_MAP[c] ?? c)` and `capabilities: [...i.capabilities]` in JSON  |

### Data-Flow Trace (Level 4)

Not applicable — this phase adds a metadata field (`capabilities`) to integration objects. There are no dynamic data sources, database queries, or user-facing data pipelines. The capabilities values are static declarations compiled into each plugin.

### Behavioral Spot-Checks

| Behavior                                           | Command                                                                                   | Result          | Status  |
|----------------------------------------------------|-------------------------------------------------------------------------------------------|-----------------|---------|
| `bun run typecheck` exits 0                        | `bun run typecheck`                                                                       | exit 0, no output | PASS  |
| runner.test.ts: 18 tests pass                      | `bun test tests/lib/integrations/runner.test.ts`                                          | 18 pass, 0 fail | PASS    |
| integration-commands.test.ts: 26 tests pass        | `bun test tests/lib/integration-commands.test.ts`                                         | 26 pass, 0 fail | PASS    |
| Full test suite: no regressions                    | `bun run test`                                                                            | 48/48 pass      | PASS    |
| Duck-typing removed from runner.ts                 | grep for `integration\.generate\?\.\(` and `if \(!integration\.cleanup\)` in runner.ts   | No matches      | PASS    |

### Requirements Coverage

| Requirement | Source Plan | Description                                                              | Status    | Evidence                                                                               |
|-------------|-------------|--------------------------------------------------------------------------|-----------|----------------------------------------------------------------------------------------|
| ENGN-07     | 76-01       | Each integration plugin declares its capabilities via a typed field      | SATISFIED | `capabilities: ReadonlySet<Capability>` required on `Integration`; all 10 plugins set  |
| ENGN-08     | 76-01       | Integration runner uses capability declarations instead of optional chaining | SATISFIED | 7 `capabilities.has()` calls in runner.ts; no duck-typed optional chaining remains   |
| ENGN-09     | 76-02       | `integration list` displays plugin capabilities                           | SATISFIED | Table column + abbreviated tags via `TAG_MAP`; JSON output includes full names         |

All three requirement IDs mapped to Phase 76 in REQUIREMENTS.md are satisfied. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | None found |

Scanned: `types.ts`, `runner.ts`, `integration.ts`, all 10 plugin files, and both test files. No TODOs, placeholder returns, empty stubs, or hardcoded empty data found in production code. The `runIntegrationCleanup` tests use `expect(true).toBe(true)` and `resolves.toBeUndefined()` — these are lightweight smoke tests verifying absence of crash, not stubs. Acceptable.

### Human Verification Required

None. All must-haves are verifiable programmatically.

### Gaps Summary

No gaps. Phase 76 goal is fully achieved.

- The `Capability` type with 6 members is exported from `types.ts`.
- The `Integration` interface has `capabilities: ReadonlySet<Capability>` as a required field (compiler-enforced).
- All 10 integration plugins declare their capability sets with the correct members per the plan spec.
- `runner.ts` has replaced all 6 duck-typing sites with `capabilities.has()` calls across its three exported functions.
- `integration list` table output includes the Capabilities column with abbreviated tags sorted alphabetically.
- `integration list --json` includes a `capabilities` array with full capability names.
- `bun run typecheck` passes with zero errors.
- All tests pass (48/48 in full suite).
- Commits `0cefee93`, `fa3ab7bc`, `265215a9` exist in the repository.

---

_Verified: 2026-04-06T04:10:00Z_
_Verifier: Claude (gsd-verifier)_
