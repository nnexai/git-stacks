# Phase 106: Linux Workspace, Commands, and Attention - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the primary GTK4/libadwaita workspace experience: browse authoritative workspaces and repositories, keep independent workspace-repository terminal collections alive across navigation, launch service-resolved shells and existing named commands, and surface structured agent attention without automatic focus theft. This phase does not add workspace authoring breadth, a general command palette, terminal splits/search, packaging, or macOS parity.

</domain>

<decisions>
## Implementation Decisions

### Workspace and Repository Navigation
- **D-01:** Use a workspace-first sidebar with expandable repositories. A single-repository workspace collapses the repository level automatically while retaining subtle active-repository context.
- **D-02:** Default to a simple workspace list and provide optional grouping or sorting by labels and repository membership. Persist the selected organization mode across restarts.
- **D-03:** On open or reconnect, restore the last valid workspace and repository; use a predictable fallback when either identity no longer exists.
- **D-04:** Show pinned workspaces in a dedicated expandable section above the grouped or sorted remainder. Pins use persistent manual drag-and-drop order and newly pinned workspaces append.
- **D-05:** Pin and unpin from the workspace-row action menu. If a pinned workspace disappears from an authoritative snapshot, remove it from pins and show a one-time notice.

### Terminal Tabs and Ended Sessions
- **D-06:** Each exact workspace-repository pair owns an independent terminal-tab collection. Changing navigation swaps the visible collection without recreating or terminating live surfaces.
- **D-07:** Tabs use persistent manual order within their workspace-repository pair; new tabs append. Default titles derive from the launched shell or named command, and users may reorder or rename tabs.
- **D-08:** Restored ended tabs retain their original positions, show an explicit `Ended` state, and offer Relaunch. Relaunch follows Phase 105 lineage rules and creates a new surface identity.

### Shell and Named-Command Launching
- **D-09:** Put workspace/repository actions and integrations in a top-right contextual menu, including available actions such as Open in VS Code.
- **D-10:** A new shell can be opened by double-clicking empty tab-bar space, an application-menu action, or a keyboard shortcut.
- **D-11:** Named commands use a focused launcher overlay inspired by Supacode. It searches/autocompletes only existing configured commands valid for the selected workspace-repository pair; it is not a general command palette.
- **D-12:** The launcher shows recently used commands first and the remaining valid commands alphabetically. Commands with duplicate names remain independently selectable with explicit workspace or repository scope labels.
- **D-13:** Selecting a command launches it in a new tab using the authoritative service-resolved context. If resolution or startup fails, create no tab, keep the launcher available, and show a structured error.

### Attention Hierarchy and Focus Routing
- **D-14:** Tabs show direct unread counts. Repositories and workspaces show aggregated counts while retaining state/severity color through the hierarchy.
- **D-15:** Failed and waiting are highest-priority unread attention, completed is secondary unread attention, and working/idle are visible status only.
- **D-16:** Selecting an attention item marks that item read. Directly focusing its exact tab clears that tab's current items once the tab is visibly active. Merely opening a workspace or repository does not clear attention.
- **D-17:** Selecting attention focuses the exact surviving surface. If it is gone, route to the ended predecessor tab, then repository, then workspace, and explain why the live surface could not be focused.
- **D-18:** Attention never changes application focus or navigation automatically; all focus routing follows explicit user selection.

### the agent's Discretion
- Choose the concrete GTK widgets, responsive breakpoints, icons, colors, keyboard bindings, fallback selection order, notices, drag affordances, menu composition, launcher matching algorithm, recent-command retention limit, and structured error presentation while preserving the locked interaction semantics and Phase 105 accessibility contract.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and Phase Contracts
- `.planning/PROJECT.md` — Defines the v0.20.0 native-client boundary, Linux-first goal, authoritative engine, and deferred breadth.
- `.planning/REQUIREMENTS.md` — Defines LNX-01 through LNX-06 and ACT-01 through ACT-06, plus milestone exclusions.
- `.planning/ROADMAP.md` — Defines the Phase 106 goal, dependency on Phase 105, and five success criteria.
- `.planning/phases/104-workspace-service-and-event-contract/104-CONTEXT.md` — Locks service snapshots, identities, resolved launch contexts, structured attention, replay, and compatibility semantics.
- `.planning/phases/105-shared-native-model-and-terminal-foundation/105-CONTEXT.md` — Locks shared reducer behavior, restored-session truth, terminal ownership, surface lineage, and accessibility expectations.

### Existing Architecture Maps
- `.planning/codebase/STACK.md` — Documents the existing TypeScript/OpenTUI stack and native-toolchain boundary.
- `.planning/codebase/STRUCTURE.md` — Documents current workspace, command, message, integration, and UI module locations.
- `.planning/codebase/CONVENTIONS.md` — Defines validation, discriminated outcomes, adapter boundaries, and testing conventions.

### Interaction References
- `https://docs.supacode.sh/terminal` — Reference for workspace-bound terminal state, tab switching, and surface-linked notifications.
- `https://docs.supacode.sh/worktree/repo-configuration` — Reference for repeatable configured commands launched in dedicated terminal tabs.
- `https://docs.supacode.sh/keyboard-shortcuts` — Reference for application actions alongside Ghostty-owned terminal bindings.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 104 `/v1` aggregate snapshots and stable workspace/repository/command identities: authoritative navigation and launch inputs.
- Phase 104 resolved launch contexts and structured errors: required inputs for shell/command creation and failure presentation.
- Phase 104 ordered attention events and replay-gap recovery: source of status, unread aggregation, and focus targets.
- Phase 105 shared reducer, opaque ABI, persisted presentation metadata, surface lineage, and Linux libghostty host: foundation for GTK state and terminal collections.
- Existing named manual commands and integration actions: product capabilities consumed by the launcher and top-right contextual menu rather than redefined here.

### Established Patterns
- The Bun/TypeScript engine remains authoritative; native clients consume the service contract and never parse or mutate workspace YAML.
- Platform UI is an adapter over shared product-owned state, not a parallel workspace engine.
- Invalid, stale, incompatible, ended, or missing state remains explicit rather than silently coerced.
- Fallible operations use structured outcomes, and process ownership/liveness must remain truthful.

### Integration Points
- Bind GTK sidebar selection, grouping, sorting, pinning, and last selection to stable shared-model identities and local presentation state.
- Key tab collections by the exact workspace and repository identities while terminal lifetimes remain owned by the Phase 105 host.
- Request every shell or named-command launch through the Phase 104 resolved-context boundary before creating a terminal surface.
- Reduce attention events into workspace, repository, and surface aggregates, then route explicit selections through surviving-surface or lineage fallbacks.

</code_context>

<specifics>
## Specific Ideas

- Use Supacode as the interaction reference for per-worktree terminal continuity, repeatable command launching, and surface-linked notifications, adapted to git-stacks' workspace-first and multi-repository model.
- Keep the common one-repository workspace visually shallow.
- Empty tab-bar space should behave as a fast shell-creation target.
- The configured-command overlay should feel like autocomplete/selection over valid commands, not a general application command palette.

</specifics>

<deferred>
## Deferred Ideas

- General-purpose command palette — explicitly outside the milestone scope; Phase 106 provides only a configured-command launcher.
- Terminal splits, terminal search, and advanced layout persistence — deferred until after the tab-based vertical slice.

### Reviewed Todos (not folded)
- **Improve TUI dashboard experience** — applies to the existing OpenTUI dashboard, not the GTK native client.
- **Add manual workspace commands** — already shipped; Phase 106 consumes the existing command model.
- **Add workspace notes** — separate product capability outside this phase.
- **Add workspace stale view** — separate cleanup/advisory capability outside this phase.
- **Create workspace from forge source** — already shipped and unrelated to the native-client interaction slice.
- **Plan broader code quality improvement run** — separate planning stream unrelated to Phase 106.
- **Improve template composition understanding** — separate template UX capability.

</deferred>

---

*Phase: 106-linux-workspace-commands-and-attention*
*Context gathered: 2026-07-11*
