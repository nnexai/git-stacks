---
phase: 33-name-based-identity
verified: 2026-03-25T00:00:00Z
status: passed
score: 12/12 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 10/12
  gaps_closed:
    - "workspaceExists('bar') returns true when foo.yml contains name: bar (D-12 regression fixed)"
    - "All existing tests pass (backward compatible) — 60/60 workspace-ops tests now pass"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "git-stacks doctor drift report format"
    expected: "Running git-stacks doctor on a config with a drifted workspace (foo.yml containing name: bar) should print a warn entry with message containing \"name field 'bar' does not match filename 'foo.yml'\" and fix suggestion \"git-stacks rename bar bar\""
    why_human: "Doctor output rendering depends on the full CLI context including terminal width and formatting; can't assert rendered output without running the live binary against a real config."
---

# Phase 33: Name-Based Identity Verification Report

**Phase Goal:** Users can look up, operate on, and rename workspaces and templates using the `name` field in YAML — filename is an internal storage detail, not an exposed identity
**Verified:** 2026-03-25T00:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | workspaceExists('bar') returns true when foo.yml contains name: bar | ✓ VERIFIED | findWorkspaceFile scans all .yml files, matches on name field; workspaceExists delegates to it |
| 2  | readWorkspace('bar') returns workspace data from foo.yml with name: bar | ✓ VERIFIED | readWorkspace delegates to findWorkspaceFile; returns found.data |
| 3  | templateExists('bar') returns true when foo.yml contains name: bar | ✓ VERIFIED | findTemplateFile same pattern; templateExists delegates to it |
| 4  | readTemplate('bar') returns template data from foo.yml with name: bar | ✓ VERIFIED | readTemplate delegates to findTemplateFile |
| 5  | Duplicate YAML names log warning to stderr and return first match | ✓ VERIFIED | console.error emitted when matches.length > 1; test passes (config.test.ts) |
| 6  | listWorkspaces() and listTemplates() use direct file paths instead of workspacePath()/templatePath() | ✓ VERIFIED | join(WORKSPACES_DIR, f) used directly in both functions |
| 7  | git-stacks doctor reports when workspace name field differs from filename | ✓ VERIFIED | findWorkspaceNameDrift() implemented, wired into allIssues and wsIssuesByEntity |
| 8  | git-stacks doctor reports when template name field differs from filename | ✓ VERIFIED | findTemplateNameDrift() implemented, wired into allIssues and wsIssuesByEntity |
| 9  | renameWorkspace validates YAML name matches old arg before proceeding | ✓ VERIFIED | workspaceExists uses scan-based lookup, so validation is guaranteed by construction |
| 10 | renameTemplate renames template file and updates YAML name field | ✓ VERIFIED | renameTemplate writes new file with updated name, then deletes old with existsSync guard |
| 11 | renameTemplate updates all workspace YAML files that reference the old template name | ✓ VERIFIED | cascade: listWorkspaces() filtered by w.template === oldName, each updated via writeWorkspace |
| 12 | renameTemplate --dry-run reports changes without writing to disk | ✓ VERIFIED | dryRun branch emits via onProgress and returns without writing |
| 13 | renameTemplate returns error if old template not found | ✓ VERIFIED | templateExists(oldName) check returns { ok: false, error: "...not found." } |
| 14 | renameTemplate returns error if new template name already exists | ✓ VERIFIED | templateExists(newName) check returns { ok: false, error: "...already exists." } |
| 15 | git-stacks template rename <old> <new> delegates to renameTemplate in workspace-ops | ✓ VERIFIED | template.ts imports renameTemplate from ../lib/workspace-ops and calls it |
| 16 | git-stacks template rename supports --dry-run flag | ✓ VERIFIED | .option("--dry-run", ...) present; passes dryRun to renameTemplate |
| 17 | removeWorkspace still handles corrupt YAML files (D-12 backward compat) | ✓ VERIFIED | workspace-ops.ts line 424: fallback existsSync(workspacePath(name)) preserves D-12 path; 60/60 tests pass |

**Score:** 12/12 must-haves verified (gap closed — all truths pass)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/config.ts` | findWorkspaceFile scan helper | ✓ VERIFIED | Lines 187-206: non-exported, scans WORKSPACES_DIR, matches on name field |
| `src/lib/config.ts` | findTemplateFile scan helper | ✓ VERIFIED | Lines 210-229: non-exported, scans TEMPLATES_DIR, matches on name field |
| `src/lib/config.ts` | workspaceExists/readWorkspace/templateExists/readTemplate via scan | ✓ VERIFIED | All four delegate to scan helpers |
| `src/lib/config.ts` | listWorkspaces/listTemplates use direct paths | ✓ VERIFIED | join(WORKSPACES_DIR, f) and join(TEMPLATES_DIR, f) used directly |
| `src/commands/doctor.ts` | findWorkspaceNameDrift function | ✓ VERIFIED | Lines 154-174: scans WORKSPACES_DIR, compares name vs filename stem |
| `src/commands/doctor.ts` | findTemplateNameDrift function | ✓ VERIFIED | Lines 176-196: scans TEMPLATES_DIR, compares name vs filename stem |
| `src/commands/doctor.ts` | Drift wired into allIssues | ✓ VERIFIED | Lines 287-288: ...workspaceNameDrift and ...templateNameDrift in allIssues spread |
| `src/lib/workspace-ops.ts` | renameTemplate export | ✓ VERIFIED | Lines 929-975: full implementation with cascade and dry-run |
| `src/lib/workspace-ops.ts` | removeWorkspace D-12 fallback | ✓ VERIFIED | Line 424: `!workspaceExists(name) && !existsSync(workspacePath(name))` — both conditions required |
| `src/commands/template.ts` | template rename delegates to renameTemplate | ✓ VERIFIED | Lines 109-124: imports renameTemplate, calls with dryRun option |
| `tests/lib/config.test.ts` | scan-based lookup tests | ✓ VERIFIED | describe("scan-based lookup") with 7 tests; all 41 config tests pass |
| `tests/lib/config.test.ts` | doctor drift detection tests | ✓ VERIFIED | describe("doctor drift detection") with 3 tests |
| `tests/lib/workspace-ops.test.ts` | renameTemplate and D-12 tests | ✓ VERIFIED | 60 pass, 0 fail |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| config.ts:workspaceExists | config.ts:findWorkspaceFile | delegates | ✓ WIRED | return findWorkspaceFile(name) !== null |
| config.ts:readWorkspace | config.ts:findWorkspaceFile | delegates | ✓ WIRED | const found = findWorkspaceFile(name) |
| config.ts:templateExists | config.ts:findTemplateFile | delegates | ✓ WIRED | return findTemplateFile(name) !== null |
| config.ts:readTemplate | config.ts:findTemplateFile | delegates | ✓ WIRED | const found = findTemplateFile(name) |
| workspace-ops.ts:removeWorkspace | paths.ts:workspacePath | fallback existsSync | ✓ WIRED | Line 424: existsSync(workspacePath(name)) fallback preserves D-12 path |
| doctor.ts:findWorkspaceNameDrift | paths.ts:WORKSPACES_DIR | import | ✓ WIRED | Line 16: imports WORKSPACES_DIR and TEMPLATES_DIR from ../lib/paths |
| doctor.ts:findWorkspaceNameDrift | config.ts:WorkspaceSchema | import | ✓ WIRED | Lines 11-12: imports WorkspaceSchema, TemplateSchema |
| template.ts:rename | workspace-ops.ts:renameTemplate | import and call | ✓ WIRED | imports renameTemplate; calls renameTemplate(oldName, newName, {dryRun}, ...) |
| workspace-ops.ts:renameTemplate | config.ts:templateExists | scan-based lookup | ✓ WIRED | templateExists(oldName) and templateExists(newName) |
| workspace-ops.ts:renameTemplate | config.ts:listWorkspaces | cascade scan | ✓ WIRED | const workspaces = listWorkspaces() |

### Data-Flow Trace (Level 4)

Not applicable for this phase. All artifacts are library functions and CLI commands, not data-rendering components.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| config.test.ts: scan-based lookup | bun test tests/lib/config.test.ts | 41 pass, 0 fail | ✓ PASS |
| workspace-ops.test.ts: all tests incl. D-12 | bun test tests/lib/workspace-ops.test.ts | 60 pass, 0 fail | ✓ PASS |
| typecheck | bun run typecheck | exits 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| IDEN-01 | 33-01-PLAN.md | User can look up, open, remove, and list workspaces by the name field in YAML (not by filename) | ✓ SATISFIED | workspaceExists, readWorkspace, listWorkspaces all use scan-based lookup; D-12 fallback preserves corrupt-YAML removal; all tests pass |
| IDEN-02 | 33-01-PLAN.md | User can look up, edit, remove, and list templates by the name field in YAML (not by filename) | ✓ SATISFIED | templateExists, readTemplate, listTemplates all use scan-based lookup; tests pass |
| IDEN-03 | 33-02-PLAN.md | User can rename a workspace or template and have both the YAML name field and the filename updated atomically; no drift possible | ✓ SATISFIED | renameTemplate writes new file, cascades workspaces, deletes old; template rename CLI delegates to it with --dry-run support |

No orphaned requirements: REQUIREMENTS.md lists IDEN-04 assigned to Phase 35 (Pending) and IDEN-05 as deferred — neither is assigned to Phase 33.

### Anti-Patterns Found

None. The D-12 blocker anti-pattern from the initial verification was resolved by the fix at `src/lib/workspace-ops.ts` line 424.

### Human Verification Required

#### 1. Doctor drift output rendering

**Test:** Create a workspace YAML at `~/.config/git-stacks/workspaces/foo.yml` with `name: bar` (a drifted name), then run `git-stacks doctor`.
**Expected:** Output should contain a warning entry with message `name field 'bar' does not match filename 'foo.yml'` and fix suggestion `git-stacks rename bar bar`.
**Why human:** Doctor output is rendered in a terminal table with formatting and color; cannot reliably assert rendered output programmatically without running the live CLI.

### Gaps Summary

No gaps remain. The single gap from the initial verification — the D-12 corrupt-YAML regression in `removeWorkspace` — was closed by adding a filesystem-level fallback at line 424:

```
if (!workspaceExists(name) && !existsSync(workspacePath(name))) {
```

This preserves the original behavior: if the scan-based lookup fails (e.g., corrupt YAML) but the file physically exists on disk, the function proceeds to the try/catch parse block where `--force` allows name-based recovery. All 60 workspace-ops tests pass, 41 config tests pass, and typecheck is clean.

The core name-based identity goal is fully implemented: scan-based lookup, doctor drift detection, template rename with cascade, and backward-compatible removeWorkspace.

---

_Verified: 2026-03-25T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
