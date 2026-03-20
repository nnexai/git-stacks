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

## Cross-Milestone Trends

| Milestone | Phases | Plans | Days | Rework Plans |
|-----------|--------|-------|------|--------------|
| v0.2.0 Foundation | 7 | 21 | ~7 | ~3 |
| v0.3.0 Dashboard UI Overhaul | 4 | 13 | 2 | 2 |

**Trend:** Execution speed improved significantly (2 days vs ~7). TUI work is more discovery-heavy than CLI/lib work — expect 30–50% more plans when working against underdocumented renderer libraries.
