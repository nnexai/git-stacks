# Phase 1: Foundation - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden the existing PoC into a trustworthy tool: corrupt configs handled gracefully, YAML schema upgrades never break existing user files, git operations have integration test coverage, prerequisite checks exist at startup, and four known atomicity bugs in destructive operations (merge, remove, clean, rename) are fixed.

Creating/improving new capabilities (dry-run, --force, design evaluation) is explicitly out of scope — that belongs to Phase 2 and Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Test infrastructure
- `makeGitRepo()` creates a local-only git repo: `git init`, configure `user.email`/`user.name`, create an initial commit on main. No remote or bare repo needed — worktree operations are purely local.
- `makeGitRepo()` is added to `tests/helpers.ts` alongside existing `makeTmpDir`, `cleanup`, `mkdir`, `touch`, `write` helpers.
- Git primitive tests go in `tests/lib/git.test.ts` (new file, mirrors `src/lib/git.ts`).
- Workspace lifecycle tests go in `tests/lib/workspace-ops.test.ts` (new file, mirrors `src/lib/workspace-ops.ts`).
- TEST-03 approach: full integration — set up real git repos + workspace YAML fixtures, call `workspace-ops` functions directly. This is the approach that catches the known partial-failure bugs.

### schema_version
- Add `schema_version: z.string().default('1')` to both `StackSchema` and `WorkspaceSchema` in `src/lib/config.ts`.
- Existing user YAML files without the field parse as version 1 via the default — no breakage.
- Document migration strategy as an inline comment in `config.ts` (no separate ADR doc).
- CONF-02 enforcement: add a schema shape test in `config.test.ts` that parses a minimal YAML (only currently-required fields present). Any new required field without a `.default()` breaks this test before CI passes.

### BUG-04 merge safety (mergeNoFF)
- Fix via temp worktree using detached HEAD: `git worktree add --detach <tmp-path> <base-branch-sha>`.
- Detached HEAD approach avoids the branch-already-in-use error when the base branch is checked out in another worktree.
- Run `mergeNoFF` in the temp worktree, then remove it. Main clone HEAD is never touched.

### Atomic destructive operations (BUG-01, BUG-02, BUG-03)
- All three fixes use the same collect-verify-execute pattern: collect all operations, verify pre-conditions, then execute. State (workspace YAML) is not permanently mutated until all operations succeed.
- `mergeWorkspace`: YAML deleted only after all repo merges succeed.
- `removeWorkspace`/`cleanWorkspace`: stage then commit — full operation succeeds or nothing is written.
- `renameWorkspace`: re-register via `git worktree remove` + `git worktree add` at new path, then rename YAML — not a bare filesystem rename.

### Error message format
- CONF-04: Write a small `formatZodError(err: ZodError): string` utility that produces field-path messages: `repos[0].path: expected string, got undefined`. Used in all YAML read functions where `.parse()` is called.
- PREREQ-01 install instruction: generic message only — `git >= 2.24 required. Visit https://git-scm.com to install.` No OS-specific platform detection.
- PREREQ-01 check location: on startup in `src/index.ts`, before any command runs. Fail fast with clear message.

### Claude's Discretion
- Exact structure of the `formatZodError` utility (standalone function vs helper class)
- `getCommitsBehind` implementation approach for TEST-02 (the function doesn't yet exist in `git.ts`)
- Specific temp path naming strategy for detached HEAD worktrees
- Order of prerequisite checks (git version vs integration binary checks)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — All Phase 1 requirements (PREREQ-01/02/03, TEST-01/02/03, CONF-01/02/03/04, BUG-01/02/03/04) with acceptance criteria

### Codebase patterns
- `.planning/codebase/TESTING.md` — Existing test patterns, helpers structure, what's currently tested vs gaps
- `.planning/codebase/CONVENTIONS.md` — Error handling patterns (discriminated unions, `.nothrow()`), naming conventions, module design

No external specs — requirements are fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/helpers.ts`: `makeTmpDir`, `cleanup`, `mkdir`, `touch`, `write` — extend with `makeGitRepo()` here
- `src/lib/config.ts`: `readYaml(path, schema)` uses `.parse()` — wrap with `.safeParse()` + `formatZodError` for CONF-01/04
- `tests/lib/config.test.ts`: existing schema round-trip tests — add minimal-YAML shape test here for CONF-02

### Established Patterns
- Tests use `process.env.HOME` redirect + dynamic import for config isolation — workspace-ops tests will need the same
- Error handling returns `{ ok: true } | { ok: false; error: string }` discriminated unions — bug fixes should use this pattern
- Shell ops use `.quiet().nothrow()` and check `.exitCode` — follow same pattern in new git.ts functions
- `beforeEach`/`afterEach` with `makeTmpDir`/`cleanup` for isolation — all new test files use this

### Integration Points
- `src/index.ts`: startup prerequisite check (PREREQ-01) goes here before command registration
- `src/lib/git.ts`: new functions `mergeNoFF` (fix temp-worktree approach), `getCommitsBehind`, and detached-HEAD worktree helpers
- `src/lib/workspace-ops.ts`: atomic pattern applied to `mergeWorkspace`, `removeWorkspace`, `cleanWorkspace`, `renameWorkspace`
- `src/lib/config.ts`: `schema_version` field added to both schemas; `readYaml` updated to use `formatZodError`

</code_context>

<specifics>
## Specific Ideas

- Detached HEAD worktree pattern for BUG-04: `git worktree add --detach <tmp-path> <base-sha>` then remove after merge. This is the key insight that avoids the branch-in-use problem.
- No specific requirements — open to standard approaches for everything else

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-17*
