# Phase 46 Research: Release Prep

**Phase:** 46 — Release Prep (v0.11.0)
**Researched:** 2026-03-28
**Confidence:** HIGH — all source files read directly

---

## Summary

Phase 46 is documentation-and-version-only. Three files change: `package.json`, `CHANGELOG.md`, `README.md`. No code changes. The plan (46-01-PLAN.md) is already fully specified with exact content to insert — research confirms current file state and validates the plan's instructions.

---

## Topic 1: package.json version — already at 0.11.0

**Confidence: HIGH**

`package.json` line 3 already reads `"version": "0.11.0"`. No edit required. Task 1 in 46-01-PLAN.md is a verification-only step.

---

## Topic 2: CHANGELOG.md insertion point

**Confidence: HIGH**

Current structure (lines 1–12):
```
1  # Changelog
2
3  All notable changes...
4
5  ---
6
7  ## [0.10.1] — 2026-03-28
```

Insert the new `## [0.11.0]` section between line 5 (`---`) and line 7 (`## [0.10.1]`). The plan specifies inserting after the `---` separator on line 5 with a blank line before the new header.

**Format observed in prior entries:**
- Header: `## [version] — YYYY-MM-DD`
- Subsection: `### Added` / `### Security` / `### Fixed`
- Feature items: `**Bold Title** — 2-3 sentence description paragraph`
- Section separator: `---` before next version

The four features to cover (from phase contexts):
1. **AeroSpace shell wrappers** (Phase 43): typed async wrappers, injectable `_exec`, platform gate, doctor binary check
2. **AeroSpace integration plugin** (Phase 44): snapshot-delta window detection, workspace validation, tier-3 order 31, disabled by default
3. **AeroSpace layout control** (Phase 45): `layout` field (4 values), `normalization` flag, `flatten_before_open`, `focus` flag
4. **AeroSpace app launching** (Phase 45): `commands` array, `app`/`command`/`source`/`repo` modes, delta detection, variable expansion

**Important nuance from Phase 45 verification (SC2 note):** `normalization` is parsed but both paths use `setLayout` — there is no `split` command path. The CHANGELOG description should describe the config intent (normalization-aware) without claiming different runtime behaviors per flag. The plan's wording is accurate and safe.

---

## Topic 3: README.md integration table and section placement

**Confidence: HIGH**

**Integration table** (lines 239–248):
```
| 3 | niri | Arranges windows on a named niri workspace | — |
```
AeroSpace row inserts directly after niri (line 244). Before the tier-5 forge rows.

**Niri YAML example** ends at line 285 (closing triple-backtick). Line 287 starts `**Forge integrations**`.

AeroSpace documentation section inserts between line 285 and 287 — after niri YAML, before forge integrations.

**Pattern from niri section (lines 265–285):**
- Bold header with link: `**Niri integration** (for [niri](...) Wayland compositor users):`
- Bullet points for key behaviors
- YAML config example block
- No separate H3 heading — uses bold paragraph heading inline

**AeroSpace section must include these YAML fields** (per 46-CONTEXT.md D-02 and SC in roadmap):
- `workspace`, `layout`, `normalization`, `flatten_before_open`, `focus`, `commands`

The plan has a complete YAML example showing all six fields plus two command entries — this matches requirements exactly.

---

## Topic 4: Features shipped — what to document

**Confidence: HIGH**

### Phase 43 (shell wrappers)
- `src/lib/aerospace.ts` exports: `listWindows`, `listWorkspaces`, `moveNodeToWorkspace`, `focusWindow`, `setLayout`, `flattenWorkspaceTree`, `snapshotWindowIds`, `isAerospaceRunning`
- Injectable `_exec` pattern (same as niri, Phase 19 decision)
- `isAerospaceRunning()` platform-gates with `process.platform === "darwin"` first
- Doctor: warn-level check on macOS, silent on Linux

### Phase 44 (core integration plugin)
- File: `src/lib/integrations/aerospace.ts`
- Registered as `order: 31`, `enabledByDefault: false` in `index.ts`
- `open()`: gate → validate workspace → move bag windows
- `cleanup()`: explicit no-op (AeroSpace workspaces are user-managed)
- Config schema: `workspace` (string, required), `enabled` (boolean)

### Phase 45 (layout control + app launching)
- Config schema additions: `layout`, `normalization`, `flatten_before_open`, `focus`, `commands`
- Step sequence in `open()`: (1) flatten → (2) move bag windows → (3) run commands → (4) apply layout → (5) focus workspace
- `commands` schema: `app`, `command`, `source`, `repo`, `cwd`, `args`, `focus`
- Variable expansion: `$GS_WORKSPACE_NAME`, `$GS_WORKSPACE_BRANCH`, `$GS_WORKSPACE_PATH`
- Tests: 47 pass (integration) + 25 pass (wrappers), typecheck clean

---

## Topic 5: Verify/test steps

**Confidence: HIGH**

After edits, verify with:
```bash
grep '"version": "0.11.0"' package.json
grep "## \[0.11.0\]" CHANGELOG.md
grep "AeroSpace" README.md | wc -l   # expect ≥3
bun run typecheck                    # no code changes but validate nothing regressed
```

No test suite run required for documentation-only changes. Typecheck is a safety net only.

---

## Decisions for planner

| Topic | Decision | Confidence |
|-------|----------|------------|
| package.json | Already `0.11.0` — no edit needed | HIGH |
| CHANGELOG insertion | After `---` on line 5, before `## [0.10.1]` | HIGH |
| CHANGELOG normalization wording | Use "normalization-aware" without claiming different command paths (both use setLayout) | HIGH |
| README table row | After niri row, before tier-5 forge rows | HIGH |
| README section placement | After niri YAML block (line 285), before Forge integrations | HIGH |
| README section style | Bold paragraph heading + bullets + YAML example (matches niri pattern) | HIGH |
| Deferred features | Do NOT mention MULTI-01 / TOML-01 in CHANGELOG or README | MEDIUM |

---

## Pitfalls

1. **Do not double-insert** — package.json is already at 0.11.0; editing it would be a no-op change creating an unnecessary dirty commit.
2. **CHANGELOG order** — `## [0.11.0]` must appear ABOVE `## [0.10.1]`. The plan inserts after the `---` on line 5, which is correct.
3. **`normalization` behavior** — Phase 45 verification notes `normalization` is effectively a no-op placeholder (both paths use `setLayout`). Document the config intent, not the runtime branching behavior. The plan's wording handles this correctly.
4. **README niri section intact** — Only add after line 285; don't disturb the niri columns example or any content above it.
5. **No code files** — This phase touches only `package.json`, `CHANGELOG.md`, `README.md`. Any edit to `src/` files is out of scope.
