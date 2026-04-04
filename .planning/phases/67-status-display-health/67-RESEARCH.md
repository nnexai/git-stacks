# Phase 67: Status, Display & Health - Research

**Researched:** 2026-04-04
**Domain:** CLI display formatting, TUI SolidJS components, doctor health checks
**Confidence:** HIGH

## Summary

Phase 67 is a pure display/health layer — the data layer from Phase 65 and 66 already returns
correct `mode: "dir"` values with zeroed git metrics. The work is threading that signal through
five integration points: CLI `status` command display, CLI `status --fetch` filter, `list` command
(already correct at the data layer), TUI `types.ts` union, TUI `WorkspaceRow` counts, TUI
`WorkspaceDetail` mode label, and `doctor` health check separation.

Every change is a surgical extension of an existing pattern: extending a ternary/switch from two
branches to three (`"trunk" | "worktree"` → `"trunk" | "worktree" | "dir"`). No new architecture
or external dependencies. The highest-risk item is the `findMissingMainClones` function in
`doctor.ts` which currently fires for ALL repo modes including dir — it must be filtered so dir
repos get their own `findInvalidDirRepos` check rather than a misleading "clone missing" message.

**Primary recommendation:** Extend all mode-discriminating switches/ternaries to include `"dir"`,
add `mode !== "dir"` guards where git ops are called, and introduce one new doctor check function
following the established discriminated-union `Issue` pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `status` and `list` CLI commands need display-layer changes only — data layer already correct
- **D-02:** `--fetch` code path in `status` command needs a dir repo filter to skip `fetchOrigin` on non-git dirs
- **D-03:** TUI `RepoStatus` type in `tui/dashboard/types.ts` must add `"dir"` to mode union
- **D-04:** `WorkspaceRow.tsx` needs to surface dir repo counts (currently invisible)
- **D-05:** `WorkspaceDetail.tsx` must render `[dir]` label instead of falling through to `[trunk]`
- **D-06:** Doctor needs a new dir-specific check validating directory existence and that path is actually a directory
- **D-07:** Doctor's existing git health checks already skip dir repos — HLTH-01 largely satisfied; needs explicit validation that no check accidentally runs git on dir repos

### Claude's Discretion
- Exact formatting of the `[dir]` label in CLI and TUI (color, styling)
- Whether dir repos show a dash or blank in ahead/behind/dirty columns
- How `WorkspaceRow` displays the dir count (separate badge, combined with trunk, etc.)

### Deferred Ideas (OUT OF SCOPE)
None — analysis stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DISP-01 | `git-stacks status` shows dir repos with "dir" label and no git metrics | workspace.ts:409 modeLabel ternary — extend to include `"dir"` case; `RepoStatus.mode: "dir"` already returned from workspace-ops.ts:332 |
| DISP-02 | `git-stacks list` includes workspaces with dir repos without git aggregation errors | `getWorkspaceListInfo` already filters dir repos from dirty/a-b loops; `list` display at workspace.ts:334 shows `repoCount` which already includes `dirCount` — no display change needed unless we want to expose `dirCount` separately |
| DISP-03 | TUI dashboard shows dir repos in workspace detail with "dir" indicator, no git badges | types.ts RepoStatus mode union + WorkspaceDetail.tsx:66 modeLabel ternary + WorkspaceRow.tsx:20-21 count derivations |
| HLTH-01 | `git-stacks doctor` skips git health checks for dir repos | `findMissingWorktrees` already gates on `mode === "worktree"` (doctor.ts:134); `findMissingMainClones` does NOT filter — needs `mode !== "dir"` guard (doctor.ts:152) |
| HLTH-02 | `git-stacks doctor` validates dir repo paths exist and are accessible directories | New `findInvalidDirRepos()` function using `existsSync` + `statSync().isDirectory()` check |
</phase_requirements>

---

## Standard Stack

No new dependencies. Phase uses existing project stack exclusively.

### Core (already installed)
| Library | Purpose | Relevant API |
|---------|---------|--------------|
| `fs` (Bun built-in) | Directory validation | `existsSync`, `statSync().isDirectory()` |
| SolidJS `solid-js` | TUI reactive rendering | `createMemo`, `For`, `Show` |
| `@opentui/solid` | Terminal rendering | `testRender`, `captureCharFrame` |
| `bun:test` | Test framework | `describe`, `test`, `expect` |

**Installation:** None required.

## Architecture Patterns

### Pattern 1: Mode-discriminating ternary extension
**What:** All mode labels use `repo.mode === "worktree" ? "[branch]" : "[trunk]"` — extend to a
three-branch expression.
**When to use:** Anywhere the current pattern exists.
**Example:**
```typescript
// Source: src/commands/workspace.ts:409 (current)
const modeLabel = repo.mode === "worktree" ? `[${repo.branch}]` : "[trunk]"

// Extended (DISP-01, DISP-03)
const modeLabel = repo.mode === "worktree"
  ? `[${repo.branch}]`
  : repo.mode === "dir"
    ? "[dir]"
    : "[trunk]"
```
[VERIFIED: src/commands/workspace.ts:409, src/tui/dashboard/WorkspaceDetail.tsx:66]

### Pattern 2: Mode filter guard before git operations
**What:** Add `r.mode !== "dir"` to array filters that feed git operations.
**When to use:** Any `.filter()` that feeds `fetchOrigin`, `isRepoDirty`, ahead/behind calls.
**Example:**
```typescript
// Source: src/commands/workspace.ts:362-363 (current — missing dir guard)
const allRepos = workspaces.flatMap(ws =>
  ws.repos.filter(r => existsSync(r.mode === "worktree" ? r.task_path : r.main_path))
)

// Fixed (D-02)
const allRepos = workspaces.flatMap(ws =>
  ws.repos.filter(r =>
    r.mode !== "dir" &&
    existsSync(r.mode === "worktree" ? r.task_path! : r.main_path)
  )
)
```
[VERIFIED: src/commands/workspace.ts:362-375]

### Pattern 3: Doctor issue function with discriminated union
**What:** New `findInvalidDirRepos()` follows the existing pattern of returning `Issue[]`.
**When to use:** Adding a new health check category.
**Example:**
```typescript
// Source: follows pattern from src/commands/doctor.ts:129-145 (findMissingWorktrees)
function findInvalidDirRepos(workspaces: Workspace[]): Issue[] {
  const issues: Issue[] = []
  for (const ws of workspaces) {
    for (const repo of ws.repos) {
      if (repo.mode !== "dir") continue
      if (!existsSync(repo.main_path)) {
        issues.push({
          icon: "fail",
          entity: ws.name,
          message: `dir repo '${repo.name}' path missing: ${repo.main_path}`,
          fix: { action: "info", message: `Check that directory exists: ${repo.main_path}` },
        })
      } else {
        // Verify it's actually a directory, not a file
        const stat = statSync(repo.main_path)
        if (!stat.isDirectory()) {
          issues.push({
            icon: "fail",
            entity: ws.name,
            message: `dir repo '${repo.name}' path is not a directory: ${repo.main_path}`,
          })
        }
      }
    }
  }
  return issues
}
```
[VERIFIED: src/commands/doctor.ts:129-163, pattern confirmed from existing check functions]

### Pattern 4: WorkspaceRow count derivation
**What:** `WorkspaceRow` derives `wtCount` and `trCount` directly from `ws().repos.filter(...)`.
Add `drCount` the same way, then include in `countsText`.
**When to use:** Adding a new repo mode to the list display.
**Example:**
```typescript
// Source: src/tui/dashboard/WorkspaceRow.tsx:20-21 (current)
const wtCount = () => ws().repos.filter((r) => r.mode === "worktree").length
const trCount = () => ws().repos.filter((r) => r.mode === "trunk").length

// Extended (D-04)
const drCount = () => ws().repos.filter((r) => r.mode === "dir").length

// countsText update — only show dir count when non-zero
const countsText = createMemo(() => {
  const dirty = dirtyCount()
  const dir = drCount()
  return `${wtCount()}wt ${trCount()}tr${dir > 0 ? ` ${dir}dir` : ""}${dirty > 0 ? ` ~${dirty}` : ""}`
})
```
[VERIFIED: src/tui/dashboard/WorkspaceRow.tsx:20-21, 39-43]

### Anti-Patterns to Avoid
- **Falling through to `[trunk]`:** The current `WorkspaceDetail.tsx:66` ternary
  `repo.mode === "worktree" ? ... : "[trunk]"` will render `[trunk]` for dir repos. This is the
  exact bug D-05 fixes — never leave the else branch as a catch-all when a third case exists.
- **Calling `fetchOrigin` on dirs:** dir repos have no `.git` directory; `git fetch` will exit
  non-zero and log noise. The `--fetch` filter at workspace.ts:363 has no `mode !== "dir"` guard
  and must be patched (D-02).
- **`findMissingMainClones` firing for dir repos:** This function reports missing main_path for ALL
  modes. Dir repos with missing paths should be caught by `findInvalidDirRepos`, not by the clone
  check which suggests `git-stacks repo show` as remediation (wrong message for a dir). Requires
  adding `repo.mode !== "dir"` guard to `findMissingMainClones`.
- **`hasMissing` in useWorkspaces.ts only counting worktree:** Line 88 `!r.exists && r.mode === "worktree"` means dir repos with missing paths won't flag `hasMissing`. Whether dir missing should set `hasMissing` is discretionary, but the planner should make an explicit choice.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Directory existence check | Custom fs wrapper | `existsSync` + `statSync().isDirectory()` | Already imported in `workspace-ops.ts`; `statSync` already imported in `git.ts` |
| Terminal color for `[dir]` label | Inline color codes | OpenTUI `fg` prop on `<text>` | Same pattern used for all existing labels |
| Mode counting in WorkspaceRow | New data fetch | Direct `.filter()` on `ws().repos` | Same reactive pattern as `wtCount`/`trCount` |

**Key insight:** Every piece of infrastructure exists. This phase is entirely extension, not
construction.

## Common Pitfalls

### Pitfall 1: `statSync` throws on missing path
**What goes wrong:** `statSync(path)` throws `ENOENT` if path doesn't exist — so `isDirectory()`
cannot be called without first checking existence.
**Why it happens:** `statSync` is not `existsSync`; they serve different purposes.
**How to avoid:** Two-step: check `existsSync` first, then call `statSync` only if path exists.
**Warning signs:** `Error: ENOENT: no such file or directory` in doctor output.

### Pitfall 2: `task_path` is optional for dir repos
**What goes wrong:** `repo.task_path` is `string | undefined` for dir repos (they have no worktree).
Accessing `r.task_path!` non-null assertion without an `r.mode !== "dir"` guard can produce
`undefined` passed to `existsSync`, which returns false silently or crashes downstream.
**Why it happens:** The current `--fetch` filter at workspace.ts:363 uses
`r.mode === "worktree" ? r.task_path : r.main_path` which works for trunk but for dir repos
`r.task_path` is undefined and `r.main_path` is the path — the path resolution is actually
correct, but the filter must also exclude dir repos from `fetchOrigin` entirely.
**How to avoid:** Add `r.mode !== "dir"` before any git operation filter.

### Pitfall 3: TUI type mismatch at compile time
**What goes wrong:** `tui/dashboard/types.ts` `RepoStatus.mode` is `"trunk" | "worktree"` — the
function `getWorkspaceStatus` returns `mode: "dir" as const` (workspace-ops.ts:333). Once TypeScript
sees data flow from workspace-ops into TUI components, `satisfies WorkspaceStatus` will reject the
`"dir"` value, or casting `as any` in WorkspaceDetail.tsx:62 will mask the type error.
**Why it happens:** Two parallel `RepoStatus` type definitions that diverged — workspace-ops.ts
already has `"dir"` but types.ts does not.
**How to avoid:** Add `"dir"` to the TUI `RepoStatus.mode` union in `tui/dashboard/types.ts` before
any component changes.
**Warning signs:** TypeScript error on `r.mode === "dir"` in WorkspaceDetail being unreachable.

### Pitfall 4: `useWorkspaces.ts` satisfies constraint
**What goes wrong:** Line 90 in `useWorkspaces.ts` uses `} satisfies WorkspaceStatus`. After the
type is updated to include `"dir"` in repos, the `satisfies` check will continue to pass but only
if the type definition is updated first.
**Why it happens:** Compile-time structural check.
**How to avoid:** Update `tui/dashboard/types.ts` as Wave 0 task.

### Pitfall 5: `findMissingMainClones` double-reporting
**What goes wrong:** A dir repo with a missing `main_path` triggers BOTH `findMissingMainClones`
(reporting "main_path missing: …" with a git remedy) AND `findInvalidDirRepos` (reporting "dir repo
path missing: …"). Users see two issues for one problem.
**Why it happens:** `findMissingMainClones` has no mode guard.
**How to avoid:** Add `repo.mode !== "dir"` guard to `findMissingMainClones` so dir repos route
exclusively to `findInvalidDirRepos`.

## Code Examples

Verified patterns from source:

### Existing: status display loop (workspace.ts:404-416)
```typescript
// Source: src/commands/workspace.ts:407-416 [VERIFIED]
for (const ws of workspaces) {
  const repos = await getWorkspaceStatus(ws)
  console.log(`\n  ${ws.name}  [${ws.branch}]  ${ws.created}`)
  for (const repo of repos) {
    const icon = !repo.exists ? "✗" : repo.dirty ? "~" : "✓"
    const modeLabel = repo.mode === "worktree" ? `[${repo.branch}]` : "[trunk]"
    // NEEDS: repo.mode === "dir" ? "[dir]" : ...
    const abParts: string[] = []
    if (repo.ahead > 0) abParts.push(`↑${repo.ahead}`)
    if (repo.behind > 0) abParts.push(`↓${repo.behind}`)
    const abStr = abParts.length > 0 ? `  ${abParts.join("  ")}` : ""
    console.log(`    ${icon}  ${repo.name.padEnd(28)} ${modeLabel}${abStr}`)
  }
}
```

### Existing: TUI WorkspaceDetail repo render (WorkspaceDetail.tsx:63-79)
```tsx
// Source: src/tui/dashboard/WorkspaceDetail.tsx:63-79 [VERIFIED]
{(repo: any) => {
  const icon = !repo.exists ? "✗" : repo.dirty ? "~" : "✓"
  const fg = !repo.exists ? "red" : repo.dirty ? "yellow" : "green"
  const modeLabel = repo.mode === "worktree" ? `[${repo.branch}]` : "[trunk]"
  // NEEDS: repo.mode === "dir" ? "[dir]" : "[trunk]"
  // NEEDS: dir repos skip ahead/behind badges entirely
  return (
    <box flexDirection="row" height={1}>
      <text fg={fg}>    {icon}  {repo.name.padEnd(28)} {modeLabel}</text>
      {repo.mode === "worktree" && repo.ahead > 0 && (...)}
      {repo.mode === "worktree" && repo.behind > 0 && (...)}
    </box>
  )
}}
```

### Existing: Doctor statSync import available in workspace-ops, not yet in doctor
```typescript
// statSync already imported in src/lib/git.ts:2 [VERIFIED]
import { existsSync, statSync } from "fs"

// doctor.ts currently only imports existsSync — add statSync [VERIFIED: doctor.ts:2]
import { existsSync, readdirSync, readFileSync, rmSync } from "fs"
// Needs: statSync added
```

### Existing: WorkspaceRow countsText pattern (WorkspaceRow.tsx:39-43)
```typescript
// Source: src/tui/dashboard/WorkspaceRow.tsx:39-43 [VERIFIED]
const countsText = createMemo(() => {
  const dirty = dirtyCount()
  return `${wtCount()}wt ${trCount()}tr${dirty > 0 ? ` ~${dirty}` : ""}`
})
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `mode: "trunk" \| "worktree"` | `mode: "trunk" \| "worktree" \| "dir"` (workspace-ops already) | TUI types.ts lags behind — must be updated |
| All repos run through git ops | Dir repos filtered from git ops (workspace-ops already filters) | CLI `--fetch` path has not been updated |

**Already correct (no change needed):**
- `workspace-ops.ts RepoStatus` already has `"dir"` in union
- `getWorkspaceStatus` already returns `mode: "dir"` with zeroed git metrics
- `getWorkspaceListInfo` already filters dir repos from dirty/ahead-behind loops
- `findMissingWorktrees` already gates on `mode === "worktree"`

**Still needs updating:**
- `tui/dashboard/types.ts RepoStatus.mode` — only `"trunk" | "worktree"`
- `WorkspaceDetail.tsx:66` — falls through to `[trunk]` for dir repos
- `WorkspaceRow.tsx:20-21` — no `drCount` derivation
- `workspace.ts:363` — `--fetch` path missing `mode !== "dir"` guard
- `doctor.ts:152` — `findMissingMainClones` missing `mode !== "dir"` guard
- `doctor.ts` — no `findInvalidDirRepos` function

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `hasMissing` in `useWorkspaces.ts:88` should also flag missing dir repos — discretionary call | Architecture Patterns / pitfall 4 | If left as worktree-only, dir repos with missing paths won't trigger the red status indicator in the TUI list row. Planner should decide. |
| A2 | `statSync` is safe to call (no TOCTOU race) for a health check that only reads | Code Examples | Benign for a diagnostic tool; acceptable pattern. |

**All other claims in this research were verified directly from source files.**

## Open Questions

1. **Should `hasMissing` in `useWorkspaces.ts` include dir repos?**
   - What we know: Currently `hasMissing: repos.some((r) => !r.exists && r.mode === "worktree")` — only worktree repos contribute to the missing indicator.
   - What's unclear: Whether a dir repo whose path has been deleted should be treated as "missing" in the TUI sense (red indicator).
   - Recommendation: Yes — extend to `!r.exists && (r.mode === "worktree" || r.mode === "dir")`. A missing directory path is just as broken as a missing worktree. The TUI `StatusIndicator` will then show red for workspaces with missing dir repos. This is consistent with HLTH-02.

2. **`list` display: should `dirCount` be shown separately or silently included in `repoCount`?**
   - What we know: `getWorkspaceListInfo` populates `dirCount` and `repoCount` already. The `list` display at workspace.ts:334 shows `${info.repoCount} repos` — dir repos are already counted.
   - What's unclear: Whether showing e.g. "3 repos" (which includes 1 dir) is sufficient for DISP-02, or whether explicit breakdown is needed.
   - Recommendation: DISP-02 only requires "no git aggregation errors" — the current data layer already satisfies this. The `list` display does not need changes to satisfy DISP-02. If the planner wants to expose dir count visually, that's Claude's discretion territory.

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code/display changes with no external dependencies beyond the project's own code and standard Bun runtime.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test |
| Config file | none (runner via `scripts/test-runner.ts`) |
| Quick run command | `bun run test` |
| Full suite command | `bun run test` |
| Type check command | `bun run typecheck` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISP-01 | `status` shows `[dir]` label for dir repos, no a/b columns | integration (CLI spawn) | `bun run src/index.ts status --json` with dir fixture | ❌ Wave 0 — new test in `tests/commands/status-json.test.ts` |
| DISP-01 | `status` human-readable output shows `[dir]` | integration (CLI spawn) | `bun run src/index.ts status` with dir fixture | ❌ Wave 0 |
| DISP-02 | `list` runs without error for workspace with dir repos | integration (CLI spawn) | `bun run src/index.ts list` with dir fixture | ❌ Wave 0 — extend `tests/commands/list-columns.test.ts` |
| DISP-03 | TUI `WorkspaceDetail` renders `[dir]` for dir repos | unit (testRender) | `bun test tests/tui/dashboard/WorkspaceDetail.test.tsx` | ❌ Wave 0 — new test cases in existing file |
| DISP-03 | TUI `WorkspaceRow` countsText includes dir count | unit (testRender/unit) | `bun test tests/tui/dashboard/` | ❌ Wave 0 |
| HLTH-01 | Doctor skips git checks for dir repos; `findMissingMainClones` excludes dir mode | unit | `bun test tests/commands/doctor-json.test.ts` with dir fixture | ❌ Wave 0 |
| HLTH-02 | Doctor reports issue for missing dir path; reports issue for path that is a file not dir | unit | `bun test tests/commands/doctor-json.test.ts` with dir fixture | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun run test` (full suite via custom runner for mock isolation)
- **Per wave merge:** `bun run test && bun run typecheck`
- **Phase gate:** Full suite green + typecheck clean before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] New test cases in `tests/commands/status-json.test.ts` — dir repo fixture, DISP-01
- [ ] New test cases in `tests/commands/list-columns.test.ts` — dir repo fixture, DISP-02
- [ ] New test cases in `tests/tui/dashboard/WorkspaceDetail.test.tsx` — dir mode label, DISP-03
- [ ] New test cases in `tests/commands/doctor-json.test.ts` — HLTH-01, HLTH-02
- [ ] Possibly new `WorkspaceRow` unit test for `drCount` / `countsText` — DISP-03 WorkspaceRow coverage
- [ ] `bun run typecheck` baseline must pass before and after type union extension in `types.ts`

## Security Domain

No authentication, session management, access control, cryptography, or untrusted input surfaces
are involved in this phase. All changes are read-only display formatting and filesystem existence
checks. ASVS categories do not apply.

## Sources

### Primary (HIGH confidence)
All findings verified by direct file inspection of the codebase in this session:

- `src/commands/workspace.ts:346-417` — `status` command display loop and `--fetch` path [VERIFIED]
- `src/commands/workspace.ts:284-343` — `list` command and display formatting [VERIFIED]
- `src/lib/workspace-ops.ts:62-78` — `WorkspaceListInfo` type including `dirCount` field [VERIFIED]
- `src/lib/workspace-ops.ts:95-172` — `getWorkspaceListInfo` dir repo filtering [VERIFIED]
- `src/lib/workspace-ops.ts:309-317` — `RepoStatus` type with `"dir"` in mode union [VERIFIED]
- `src/lib/workspace-ops.ts:329-358` — `getWorkspaceStatus` dir branch [VERIFIED]
- `src/commands/doctor.ts:129-163` — `findMissingWorktrees`, `findMissingMainClones` (no dir filter) [VERIFIED]
- `src/tui/dashboard/types.ts:3-11` — duplicate `RepoStatus` missing `"dir"` in union [VERIFIED]
- `src/tui/dashboard/WorkspaceDetail.tsx:63-79` — mode label ternary [VERIFIED]
- `src/tui/dashboard/WorkspaceRow.tsx:20-21,39-43` — count derivations and countsText [VERIFIED]
- `src/tui/dashboard/hooks/useWorkspaces.ts:88` — `hasMissing` worktree-only gate [VERIFIED]
- `tests/lib/workspace-ops.test.ts:2588-2633` — existing dir mode status tests [VERIFIED]
- `tests/commands/status-json.test.ts` — CLI integration test pattern [VERIFIED]
- `tests/commands/doctor-json.test.ts` — doctor integration test pattern [VERIFIED]
- `tests/tui/dashboard/WorkspaceDetail.test.tsx` — TUI component test pattern [VERIFIED]
- `.planning/config.json` — `nyquist_validation: true`, `ui_phase: true` [VERIFIED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — all patterns verified from existing code; changes are surgical extensions
- Pitfalls: HIGH — each pitfall is sourced from specific line numbers in verified source files
- Test patterns: HIGH — test file structures and helper patterns confirmed from existing files

**Research date:** 2026-04-04
**Valid until:** Phase is self-contained with stable internal APIs; valid until Phase 66 changes workspace-ops (unlikely to affect these surfaces)
