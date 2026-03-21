# Retrospective

Living document — one section per shipped milestone.

---

## Milestone: v0.3.0 — Dashboard UI Overhaul

**Shipped:** 2026-03-20
**Phases:** 4 (Phases 6–9) | **Plans:** 13 | **Commits:** ~60

### What Was Built

- JSONL-backed workspace notification store with `message send|list|clear` CLI and real-time IPC push via Unix socket
- Tabbed dashboard with split list+detail pane per tab (Workspaces | Templates | Repos)
- Full in-TUI CRUD for workspaces, templates, and repo registry
- IPC push message display — live previews in list rows, per-sender grouped history in detail pane, full-screen overlay
- Shell completion overhaul — OPTION_ENUMS + FLAG_COMPLETIONS tables with prev-word detection in all three shells

### What Worked

- **Phase sequencing was correct**: Phase 6 (message store) being first meant Phase 9 (IPC display) had stable types to build on — zero type churn across phases
- **TDD for shell completions**: RED commit (data tables + failing tests) then GREEN (implementation) kept the completion work clean and the 45-test suite caught regressions immediately
- **Separate concerns in SolidJS**: keeping `tab` signal independent of `UIView` meant the 6-plan Phase 8 progression was composable without rework
- **Planning docs paid off**: SUMMARY.md files with `key-decisions` frontmatter gave instant context for each new plan; no "where were we" time wasted between plans
- **gsd-tools CLI**: `roadmap analyze`, `summary-extract`, `milestone complete` saved significant orchestrator context vs manually parsing files

### What Was Inefficient

- **UAT gap loop in Phase 8**: Root cause of tab switching freeze required 2 extra plans (08-05 and 08-06) after initial UAT. The OpenTUI nested `<text>` constraint isn't in any docs — the investigation was from scratch. Documenting this upfront in the research phase would have eliminated ~1 plan.
- **REQUIREMENTS.md stale checkboxes**: MSG-01 through MSG-10 were never updated as Phase 6 completed; found during milestone completion. Checking off requirements immediately after each plan would prevent this.
- **ROADMAP.md progress table**: The progress table was not updated during execution, requiring manual correction at archive time. Either automate this or remove it in favor of phase directory status.
- **Phase 9 UAT**: Verification score was 17/17 but status stayed `human_needed` — a manual sign-off step that added friction without clear value since all automated checks passed.

### Patterns Established

- **OpenTUI row pattern**: `<box height={1} flexDirection="row" backgroundColor={focused ? "#333333" : undefined}>` with sibling `<text fg="color">` segments — never nest `<text>` inside `<text>`
- **SolidJS `<For>` reactivity**: use `const fn = () => expr` (function) not `const val = expr` (constant) for signal-dependent values inside `<For>` callbacks
- **Height-based tab visibility**: `height={tab() === X ? value : 0}` instead of `Switch/Match` for tabs — OpenTUI does not repaint when SolidJS swaps conditional DOM branches
- **IPC reactivity**: `new Map()` on every push (not mutate-in-place) — SolidJS requires reference change to trigger reactive updates
- **Bun.connect data handler**: write-only socket clients still require a `data()` no-op callback in the Bun socket API

### Key Lessons

1. **Document renderer constraints during research**: OpenTUI layout and rendering quirks (nested text, DOM swap repaint) are not in the library docs. Spike these in Phase Research, not during plan execution.
2. **Check requirements off as you go**: Phase 6 completed without updating REQUIREMENTS.md; caused confusion at milestone completion. Make requirement checkbox updates part of the plan execution gate.
3. **IPC on startup is fragile**: Always-unlink on startup is safer than probing with `Bun.connect` — the probe causes hangs when a stale socket file exists from a crash.
4. **SolidJS in a terminal renderer has subtleties**: The virtual DOM model doesn't fully apply when the underlying renderer only repaints on explicit layout changes. Test tab switching with multiple complete components before assuming it works.

### Cost Observations

- Model mix: primarily sonnet for execution, opus for planning (balanced profile)
- Sessions: 4-5 sessions across 2 days (2026-03-18 → 2026-03-20)
- Notable: Phase 8 required the most iterations (6 plans vs 1-3 for others) due to TUI renderer discovery

---

## Milestone: v0.4.0 — TUI Hardening & Polish

**Shipped:** 2026-03-21
**Phases:** 8 (Phases 10–15.2) | **Plans:** 21 | **Tasks:** 43

### What Was Built

- Headless TUI test infrastructure (`testRender` + `mockInput` + `captureCharFrame`) with `GIT_STACKS_CONFIG_DIR` isolation — 311 tests across 38 files
- InlineInput rewrite to built-in `<input>` wrapper with cursor movement; `runHooksCaptured()` for TUI-safe hook execution
- Workspace sync action with per-repo progress, 30s fetch timeout, and keyboard blocking
- Multi-step WizardView + CreateProgressView components powering workspace creation from Templates and Repos tabs
- Template creation from Repos tab, repo remove with blocked-reference detection, unified `>[x]` selection display
- Screen polish: width-tiered help bar, relative workspace ages, responsive column widths
- CenteredDialog overlay architecture for all 11 dialog types with three size variants
- Integration override cascade: per-template and per-workspace settings via CLI wizards, TUI detail pane display with source annotations

### What Worked

- **Single-day delivery**: 8 phases, 21 plans, 43 tasks executed in a single session — the GSD wave-based parallel execution maximized throughput
- **Component test infrastructure first**: Phase 10 establishing testRender before any feature work meant every subsequent phase had automated validation from the start
- **WizardView reusability**: The shared wizard component from Phase 13 was reused directly in Phase 14 (template create) — no rework or adaptation needed
- **CenteredDialog as late refinement**: Phase 15.1 wrapped all existing dialogs without modifying their internal logic — clean separation of layout from behavior
- **Parallel executor agents**: Wave 1 of Phase 15.2 ran two agents simultaneously (helper + dashboard display) — independent plans with no file conflicts

### What Was Inefficient

- **Bun mock.module cross-file contamination**: 4 test failures when running wizard-helpers.test.ts alongside workspace-wizard.test.ts. Root cause: bun caches mock.module globally and doesn't invalidate on re-registration. Required query-parameter cache-busting workaround (`import("path?unit-test")`)
- **ROADMAP.md progress table drift**: Phase 10 and 11 rows were missing the milestone column, requiring manual correction at milestone completion
- **Decimal phase plan checkbox tracking**: 15.2-02 checkbox not updated in ROADMAP.md despite SUMMARY.md existing — the `roadmap update-plan-progress` CLI doesn't handle all edge cases for inserted phases

### Patterns Established

- **Query-parameter cache-busting for bun mock.module**: `import("@/path?unit-test")` creates a separate module cache entry, bypassing stale mocks from other test files running in the same process
- **CenteredDialog three-tier sizing**: small (50%) for confirms/menus, medium (70%) for wizards/progress, large (90%) for help/messages — consistent visual hierarchy
- **Integration override cascade**: global → template → workspace with `promptIntegrationOverrides()` reusable helper; conditional YAML storage (no integrations key when user declines)
- **Deferred input focus**: `setTimeout(() => setFocused(true), 0)` prevents trigger keypress from leaking into newly mounted `<input>` fields

### Key Lessons

1. **Bun mock isolation is not test-file-scoped**: `mock.module` is process-global in bun. Tests that mock the same module must either use identical mock shapes or employ cache-busting. This is not documented and cost investigation time.
2. **Parallel agents need `--no-verify`**: Pre-commit hooks contend when multiple agents commit simultaneously. Post-wave hook validation is the correct pattern.
3. **testRender makes TUI refactoring safe**: The CenteredDialog migration (15.1) touched all 11 dialog types with zero regressions because every component had testRender-based assertions.

### Cost Observations

- Model mix: sonnet for execution, opus for orchestration (balanced profile)
- Sessions: 1 session, ~12 hours (2026-03-21 07:33 → 19:47)
- Notable: All 8 phases completed in a single session — the fastest milestone by wall-clock time

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Days | Rework Plans |
|-----------|--------|-------|------|--------------|
| v0.2.0 Foundation | 7 | 21 | ~7 | ~3 |
| v0.3.0 Dashboard UI Overhaul | 4 | 13 | 2 | 2 |
| v0.4.0 TUI Hardening & Polish | 8 | 21 | 1 | 0 |

**Trend:** Execution speed continues to improve dramatically (1 day for 8 phases). Zero rework plans in v0.4.0 — the test infrastructure from Phase 10 caught issues during execution rather than in verification. Parallel agent execution (Phase 15.2 Wave 1) reduced wall-clock time for independent plans.
