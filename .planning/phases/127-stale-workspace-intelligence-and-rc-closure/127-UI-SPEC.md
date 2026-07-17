---
phase: 127
slug: stale-workspace-intelligence-and-rc-closure
status: draft
shadcn_initialized: false
preset: none
created: 2026-07-17
---

# Phase 127 — UI Design Contract

> Visual and interaction contract for the imperative web client and SolidJS/OpenTUI dashboard. All Phase 127 decisions in `127-CONTEXT.md` are locked; remaining details follow established Phase 125–126 conventions.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | Existing native web DOM/CSS and SolidJS/OpenTUI primitives; no new design system |
| Preset | not applicable |
| Component library | Web: native controls plus the existing singleton overlay, modal, menu, toast, and operation seams. TUI: existing `UIView`, bordered layout, `CenteredDialog`, canonical action menu, and operation views. |
| Icon library | none; reuse accessible text glyphs and existing inline monochrome SVG conventions |
| Font | Web: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; timestamps and bounded technical identities use the existing monospace stack. TUI uses terminal-native text. |

Phase 127 extends the current `.button`, `.modal-*`, `.archived-*`, `.detail-*`, `.context-menu*`, `.toast*`, focus-visible, responsive, and reduced-motion patterns. The web stale view is a singleton overlay adjacent to the existing Archived Workspaces entry. The TUI stale view is a dedicated `UIView`, not a minimal archived dialog and not a second dashboard shell.

No `components.json`, Tailwind configuration, Radix dependency, shadcn preset, or third-party registry is present. Do not initialize or add one for this phase.

### Established Visual Tokens

| Token | Dark value | Light value | Phase 127 use |
|-------|------------|-------------|---------------|
| `--bg` | `#0c0d0f` | `#fafafa` | Dominant application field, overlay input space, and long evidence regions |
| `--panel` | `#151619` | `#f2f2f4` | Overlay frame, TUI-equivalent bordered frame, sticky headers, action footers |
| `--panel-2` | `#1c1e22` | `#ffffff` | Candidate cards, incomplete-evaluation rows, reason groups |
| `--panel-hover` | `#24262b` | `#e7e8eb` | Pointer hover only |
| `--line` | `#303238` | `#d3d4d8` | Borders, section dividers, inactive reason chips |
| `--text` | `#f0f0f1` | `#242529` | Workspace names, reason labels, primary copy |
| `--muted` | `#92969e` | `#696d75` | Timestamps, unknown evidence, explanatory copy, disabled reasons |
| `--accent` | `#1c71d8` | `#1c71d8` | Refresh CTA, selected candidate, current direct action |
| `--success` | `#57c78b` | `#228b54` | Successful refresh/open/lifecycle result only |
| `--warning` | `#ffad45` | `#995400` | Confirmed stale markers and non-qualifying cautions |
| `--danger` | `#ff747f` | `#c83d4d` | Remove, Force Remove, and hard failure only |
| `--focus` | `#78aeed` | `#1c71d8` | Existing 2px `:focus-visible` ring |

OpenTUI maps the same semantics to `white`/`gray`, `cyan`, `green`, `yellow`, and `red`. Every semantic color is paired with explicit text and, where useful, `✓`, `!`, `?`, or `×`; color is never the only evidence or status carrier.

---

## Spacing Scale

Declared web values:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Inline marker, timestamp, and compact metadata gaps |
| sm | 8px | Reason rows, button groups, compact card groups |
| md | 16px | Candidate-card padding, modal body spacing, section gaps |
| lg | 24px | Empty/error-state padding and major section separation |
| xl | 32px | Existing compact control target and larger group break |
| 2xl | 48px | Major vertical breaks |
| 3xl | 64px | Reserved page-level spacing |

Exceptions: preserve existing shell geometry—32px compact buttons, 36px fields, 44px workspace-row geometry, inherited 7px/8px control radii, 12px modal radius, 9vh modal offset, and whole-cell OpenTUI spacing. The stale overlay may widen to `min(760px, calc(100vw - 28px))`; its height remains bounded by the existing `78vh` modal contract. New Phase 127 padding and gaps use multiples of 4 only.

---

## Typography

Phase 127 declares exactly four web sizes and two weights. Existing brand/provider marks retain their established special weights.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Metadata / timestamp | 11px | 400 | 1.4 |
| Body / evidence explanation | 13px | 400 | 1.45 |
| Label / control / candidate name | 14px | 650 | 1.3 |
| Overlay heading | 17px | 650 | 1.2 |

Workspace names use the Label role. Reason labels use Body `400`; section labels and counts use Label `650`. Exact UTC timestamps and bounded provider/repository identities may use the existing monospace stack at 11px or 13px. TUI preserves one terminal font and creates hierarchy through borders, indentation, markers, spacing, and semantic color rather than simulated sizes.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--bg)` | Application field, empty space, long evidence/detail regions |
| Secondary (30%) | `var(--panel)` / `var(--panel-2)` | Overlay, candidate cards, incomplete rows, action and status regions |
| Accent (10%) | `var(--accent)` | Primary `Refresh evidence` CTA, selected candidate, direct `Open workspace`, active menu row |
| Destructive | `var(--danger)` | `Remove workspace`, `Force Remove`, destructive confirmation, hard failure |

Accent reserved for: the one primary refresh action, the currently selected candidate, the currently focused/active direct action, and existing application selection. Confirmed stale reasons use warning plus text; unknown evidence uses muted text plus a `?` label; cautions use warning plus the literal heading `Cautions`. A merged change may not use success green inside stale evidence because green could falsely imply that cleanup is safe. Hover uses `--panel-hover`; focus uses `--focus`; disabled actions use muted text plus a written reason, never opacity alone.

---

## Copywriting Contract

### Core Surface Copy

| Element | Copy |
|---------|------|
| Surface title | `Stale Workspaces` |
| Intro | `Review confirmed reasons before opening, archiving, or removing a workspace. Nothing is changed automatically.` |
| Primary CTA | `Refresh evidence` |
| Refreshing | `Refreshing stale workspace evidence…` |
| Initial loading | `Loading stale workspace evidence…` |
| Candidate section | `Cleanup candidates` |
| Incomplete section | `Evaluation incomplete` |
| Last checked | `Evidence checked {relative time} · {exact UTC time}` |
| Candidate count | `{count} cleanup candidate` / `{count} cleanup candidates` |
| Incomplete count | `{count} incomplete evaluation` / `{count} incomplete evaluations` |
| Empty state heading | `No stale workspaces` |
| Empty state body | `No workspace currently has a confirmed stale reason. Refresh evidence to check again.` |
| No confirmed candidate with unknowns | `No confirmed stale workspaces. Some workspaces could not be fully evaluated.` |
| Error state | `Stale workspace evidence could not be loaded. Existing workspace state was not changed. Retry refresh.` |
| Failed refresh with retained data | `Stale evidence could not be refreshed. Showing results checked {relative time}.` |
| Revision recovery | `Workspace state changed. Reloading current workspaces before checking again…` |
| Direct action | `Open workspace` |
| Secondary actions | `Workspace actions` |
| Open pending | `Opening {workspace}…` |
| Open error | `Could not open {workspace}. The stale view was not changed. Refresh workspace state and try again.` |
| Incomplete-only action explanation | `Cleanup actions require at least one confirmed stale reason.` |

Sentence case is mandatory. Use `workspace`, not `project`, and `stale reason`, not `score`. Never display a numeric score, confidence percentage, inferred safety claim, or copy such as `Safe to delete`.

### Confirmed Reason Copy

| Reason code | Visible label | Timestamp treatment |
|-------------|---------------|---------------------|
| merged change | `{Pull request|Merge request} merged` | `Merged {relative time} · {exact UTC time}` from the provider event timestamp |
| closed change | `{Pull request|Merge request} closed` | `Closed {relative time} · {exact UTC time}` from the provider event timestamp |
| deleted remote branch | `Remote branch missing` | `Confirmed missing {relative time} · {exact UTC time}` from the observation timestamp |
| missing managed worktree | `Managed worktree missing` | `Confirmed missing {relative time} · {exact UTC time}` from the observation timestamp |
| inactivity | `Inactive for {days} days` | `Last activity {relative time} · {exact UTC time}` from authoritative `activity_at` |

GitHub uses `Pull request`, `head`, and `base`; GitLab uses `Merge request`, `source`, and `target`. Branch evidence names the repository scope, for example `Remote branch missing in api`, and never implies that a missing branch makes the whole workspace safe to remove.

### Unknown Evidence and Caution Copy

| Element | Copy |
|---------|------|
| Change unknown | `Change status unknown — {sanitized reason}.` |
| Branch unknown | `Remote branch status unknown for {repository} — {sanitized reason}.` |
| Worktree unknown | `Managed worktree status unknown for {repository} — {sanitized reason}.` |
| Activity unknown | `Last activity is unavailable.` |
| Unknown recovery | `Resolve provider access or service availability, then refresh evidence.` |
| Caution heading | `Cautions` |
| Caution explanation | `Cautions do not determine whether this workspace is stale.` |
| Dirty caution | `Uncommitted work is present.` |
| Ahead caution | `Local commits are ahead of the tracked branch.` |
| Drift caution | `Workspace file drift needs attention.` |
| Notes caution | `Workspace notes are present.` |

Sanitized reasons may name authentication required, rate limiting, unsupported provider/host, malformed source metadata, provider unavailable, or request failure. They may not include credentials, command output, environment values, host paths, remote URLs containing secrets, or raw exceptions.

### Lifecycle Confirmation Copy

Archive, Remove, and Force Remove reuse the Phase 123/126 canonical authority, inventory, focus defaults, exact-name requirements, return behavior, and one-shot submission semantics. Phase 127 explicitly replaces generic safe labels with the noun-bearing copy below in both clients.

| State | Web copy | TUI copy | Preserved behavior |
|-------|----------|----------|--------------------|
| Archive workspace | No confirmation; retain `Undo archive`. | No confirmation; retain `[u] Undo archive`. | Execute through the canonical descriptor, stop and confirm terminals, reconcile authoritative state, and expose the existing reversible Undo affordance. |
| Remove confirmation | Safe action `Keep workspace`; destructive action `Remove workspace`. | Safe hint `[n/Esc] Keep workspace`; destructive hint `[y] Remove workspace`. | Show `Remove {workspace}?` plus the established terminals, managed worktrees, workspace directory, and YAML definition inventory. Initial focus remains on the safe action. |
| Dirty-removal blocker | Safe action `Back to workspace actions`; conditional destructive action `Review Force Remove`. | Safe hint `[Esc] Back to workspace actions`; conditional destructive hint `[f] Review Force Remove`. | Name every blocking repository, preserve the typed dirty-worktree result, and expose Force Remove review only when the fresh service inventory authorizes it. |
| Force Remove confirmation | Safe action `Back to removal review`; destructive action `Force Remove {workspace}`. | Safe hint `[Esc] Back to removal review`; destructive hint `[Enter] Force Remove` only after an exact match. | Show `Type {workspace} to confirm irreversible removal.`, require the exact case-sensitive current name, retain the review state on mismatch, and submit once. |

No stale-view copy may weaken terminal shutdown, dirty-worktree, stale-revision, exact-name, or failure semantics. Detection never closes terminals, archives, removes, or modifies YAML by itself.

---

## Surface and Component Contract

### Entry and Shortcut Placement

- Add a visible web toolbar control labelled `Stale workspaces` immediately adjacent to `Archived` wherever the full label fits. At compact widths, retain the existing icon-sized toolbar treatment with `aria-label="Stale workspaces"` and `title="Stale workspaces"`; a `?`/clock-style monochrome glyph is decorative only. The control does not use warning color merely because candidates exist; warning may appear only as a written count badge when confirmed candidates are present.
- Add `Open stale workspaces` to keyboard help and shortcut settings through the canonical shortcut registry. Default web bindings are `Ctrl+Command+S` on macOS and `Ctrl+Alt+Shift+S` on Linux. The binding remains rebindable/unbindable and must pass existing collision validation and xterm pre-processing.
- Add context-scoped `Refresh stale evidence` to the same registry. Inside the stale view its presentation key is `R`; it has no browser-global default, avoiding browser reload and terminal interception. TUI presents the shared action as `[r] Refresh evidence`.
- Add `[s] Stale workspaces` to the TUI workspace-list help bar and `Keybindings` help wherever width permits; the width-tiered compact footer may use `[s] Stale`. The TUI renderer consumes the shared action metadata rather than defining a private label or callback.
- Repeated entry shortcuts refocus the existing stale view. Repeated refresh keys while a refresh is in flight do nothing and never queue another probe.

### Web Singleton Overlay

- Title: `Stale Workspaces`. Use the existing singleton overlay controller with `role="dialog"`, `aria-modal="true"`, contained Tab focus, Escape/visible close, backdrop behavior, and restoration to the exact valid invoker or terminal.
- Width is `min(760px, calc(100vw - 28px))`; maximum height is `78vh`. Header remains fixed. The body scrolls vertically and never horizontally.
- The body begins with the intro, a compact status row containing counts and last-checked time, and `Refresh evidence` as the sole primary accent CTA. If evidence is loading, the button remains present, disabled, labelled `Refreshing…`, and the body has `aria-busy="true"`.
- When opening with no cached response, render the loading state in place without replacing the overlay. When opening with a current volatile response, render it immediately and show its checked time. Explicit Refresh bypasses the cache.
- Initial focus is `Refresh evidence` when enabled, otherwise the visible Close button. Completion of loading or refresh never steals focus.
- Compatible overlays may replace the stale view, but exclusive lifecycle confirmations preserve the stale candidate and return target so Cancel returns to the same row and action control.

### Candidate List and Ranking

- Render candidates as one ordered list in service-provided rank order. The client never recomputes, filters, or scores them. Do not display rank numbers or a score; order itself communicates priority.
- Each candidate is a bordered `--panel-2` card with this fixed hierarchy:
  1. workspace name and `{count} confirmed reasons`;
  2. authoritative last-activity timestamp;
  3. `Confirmed reasons` list containing every positive reason and its timestamp;
  4. optional `Unknown evidence` list for failed probes that coexist with confirmed reasons;
  5. optional `Cautions` list, visually separated from reasons;
  6. direct `Open workspace` and secondary `Workspace actions` controls.
- Reason rows use a written marker and full reason label. Terminal evidence (merged/closed, deleted remote branch, missing worktree) appears before inactivity within a card. Distinct `merged` and `closed` labels are mandatory.
- Candidate names may ellipsize only in the card heading and must expose the full safe name through the accessible name/title. Reason and error copy wraps; it is never ellipsized.
- `Workspace actions` opens the current canonical service inventory for that workspace. Relevant unavailable Archive/Remove actions remain visible with their authoritative written reason. Missing, malformed, empty, stale, or wrong-subject inventories fail closed and expose no reconstructed lifecycle action.
- Force Remove never appears in the stale card menu. It may appear only after normal Remove returns the fresh typed dirty-worktree blocker and a new inventory authorizes it.

### Evaluation Incomplete Section

- Render `Evaluation incomplete` after cleanup candidates in a visually compact, separately labelled section. These rows never appear in the ranked candidate list and never increment the candidate count.
- Each row shows workspace name, every unknown evidence item, sanitized recovery text, last known activity when available, and direct `Open workspace`.
- Incomplete-only rows do not expose Archive, Remove, or Force Remove from this surface because they have no confirmed positive stale reason. They may still be opened for normal inspection.
- If candidates are empty but incomplete rows exist, render the `No confirmed stale workspaces` copy above the incomplete section. Do not render the all-clear `No stale workspaces` message.

### Loading, Refresh, Error, and Revision States

- First load: show the initial loading copy plus a stable reserved list region; no fabricated rows, cached defaults, or local probe results.
- Refresh with existing data: retain the complete last successful candidate/incomplete lists, mark the surface busy, disable refresh, and show `Refreshing stale workspace evidence…`. Do not clear or dim the evidence beyond the standard disabled action treatment.
- Refresh success: atomically replace both sections, checked time, counts, and candidate order from one response. Announce `{count} cleanup candidates; {count} incomplete evaluations.` through a polite live region.
- Refresh failure with prior data: retain prior data and checked time, show the failed-refresh banner and a `Retry refresh` action. The failure is not converted into per-workspace negative evidence.
- First-load failure: render the exact error-state copy and primary `Retry refresh`; no lifecycle actions exist until a valid response is accepted.
- Revision mismatch: discard the mismatched response, show the revision-recovery copy, reload authoritative workspace state, then retry the stale request once through the same generation-safe path. If the retry fails, use the first-load or retained-data error state as applicable.
- Older or slower responses never overwrite a newer refresh result. Web and TUI use monotonic request generations.
- Per-row Retry is omitted for this phase. All retries use the mandatory view-level Refresh path.

### Open and Lifecycle Interaction

- `Open workspace` invokes the existing canonical Open descriptor. It submits once and selects/navigates only after authoritative success.
- Web keeps the stale overlay visible and the row action busy while Open is pending. On success, close the overlay, select the authoritative workspace/repository, and focus the valid target. On failure, keep the overlay and row intact, restore the Open control, and render the documented inline error.
- TUI shows `Opening {workspace}…` in the dedicated view. On success, return to the normal Workspaces view with the authoritative workspace selected. On failure, return to the same stale row with the documented error.
- Archive and Remove invoke the exact Phase 123 lifecycle paths. They never inherit authority from stale evidence. Confirmation authority, inventory, focus defaults, progress, terminal shutdown, dirty blockers, Force Remove eligibility, return behavior, one-shot submission, and recovery remain unchanged; visible safe actions and TUI hints use the explicit noun-bearing labels in `Lifecycle Confirmation Copy`.
- After any lifecycle terminal state, refresh authoritative normal workspace state and stale evidence before settling presentation. A successful Archive/Remove removes or reclassifies the row according to the new authoritative response. Unrelated candidate selection remains stable when its stable ID still exists.
- If authoritative reconciliation fails after a terminal operation result, keep actions locked and show the existing Retry-refresh recovery. Never replay the lifecycle mutation.

---

## TUI Dedicated `UIView`

### Layout

- Opening Stale Workspaces replaces the normal split dashboard with a dedicated bordered `UIView`; the underlying list/detail panes do not remain visually active and cannot receive keys.
- At 80 columns or wider, use a two-pane layout: a candidate/incomplete list at approximately 38% width and selected-workspace evidence detail in the remaining width. The list pane shows workspace name, reason count or `incomplete`, and last activity. The detail pane shows every reason, timestamp, unknown, caution, and action hint.
- At 56–79 columns, stack the list above the detail pane. The list uses at most 40% of available height; detail scrolls independently.
- Below 56 columns, show one full-width selected row followed by its wrapped evidence detail. Preserve workspace name, reason labels, timestamps, and action hints before decorative separators.
- Below 40 × 12, render `Terminal is too small for Stale Workspaces. Resize to at least 40 × 12.` and `[Esc] Back`; do not accept Open, Refresh, Archive, or Remove blindly.

### Keyboard Contract

- `[s]` opens/refocuses Stale Workspaces from the normal workspace list.
- `↑/↓` and `j/k` move between candidate rows and incomplete rows without wrapping. `Home/End` jump to first/last. `PageUp/PageDown` scroll the selected evidence detail.
- `[r]` invokes the shared view-level `Refresh evidence` action. While refreshing, repeated `r` is ignored.
- `[o]` invokes `Open workspace` for either candidate or incomplete row. Enter also opens the selected workspace when no action menu is active.
- `[a]` opens `Workspace actions` only for a confirmed candidate. It renders the canonical lifecycle descriptors, preserving their existing keys and written disabled reasons. On an incomplete-only row, `[a]` announces the documented explanation and performs no transport.
- `[Esc]` closes the stale view and restores the originating workspace row. While a lifecycle confirmation or operation owns the UI, its existing key contract takes precedence and no stale-view key leaks through.
- The footer is width-tiered but never omits `Open`, `Refresh`, or `Back`. At wide widths: `↑↓/jk Navigate  o/Enter Open  a Actions  r Refresh evidence  Esc Back`. At narrow widths, use two footer lines before truncating labels.

### TUI Visual Semantics

- Selected row uses cyan plus `>`; confirmed reason markers use yellow `!`; unknown evidence uses gray/yellow `?`; hard errors use red `×`; successful refresh/open result uses green `✓` only with text.
- Candidate rows never use red merely because they are stale. Remove and Force Remove remain the only destructive red actions.
- Timestamps use exact UTC values in detail. Relative values may appear in the compact list when space allows. Observation times retain the words `Confirmed missing`; they are never presented as branch-deletion or worktree-removal event times.
- Long names truncate only in the compact list and remain fully readable in the detail pane. Reasons, cautions, unknown recovery text, and disabled reasons wrap or scroll; they are never dropped.

---

## Focus, Pointer, Accessibility, and State Rules

- Web candidate ranking uses semantic list/list-item structure. Candidate headings identify their action regions. Every timestamp uses `<time datetime="…">` with visible relative and exact UTC text.
- The refresh summary and result counts use one polite live region. Load failure and Open failure use an alert region without repeatedly announcing every reason row.
- Candidate cards are not giant click targets. `Open workspace`, `Workspace actions`, and menu items are native buttons with visible focus; pointer and keyboard activation call the same callback.
- Tab order follows visual order: Refresh, candidates in ranked order, each row's Open then Actions, incomplete rows' Open, Close. Do not create a Tab stop for static reason rows.
- The action menu uses existing roving/menu keyboard behavior. Unavailable actions remain focusable with `aria-disabled="true"`, a written reason, and no transport on activation.
- Focus never moves because a background response arrived. When a refreshed row disappears, move focus to the next row's equivalent action, then the previous row, then Refresh.
- Closing/cancelling restores the exact valid invoker or terminal. Successful Open intentionally moves to the newly authoritative workspace target instead of restoring the stale-view invoker.
- Light, dark, and system themes use current variables. No new animation is required. Existing `prefers-reduced-motion` behavior remains authoritative.
- The browser projection remains path-free and secret-free. Workspace IDs, revisions, provider command output, raw environment, credentials, bearer material, and unapproved launch context are never visible.

---

## Responsive and Overflow Contract

### Web Desktop, 375px, and 320px

- Desktop candidate cards use full-width evidence groups and right-aligned Open/Actions controls. The list scrolls inside the bounded overlay; the page never scrolls horizontally.
- At 640px and below, candidate heading metadata stacks beneath the workspace name, and row actions wrap under the evidence. No action is hover-only.
- At 375px, the overlay uses the existing 8px viewport inset, candidate cards use 16px padding, and `Open workspace` plus `Workspace actions` each remain at least one readable button row. Counts and last-checked time wrap rather than truncate.
- At 320px, the modal is full available width, reason rows use one column, exact timestamps wrap, and action buttons may become full-width. No card, menu, error, or confirmation creates horizontal scroll or clips the destructive/safe action pair.
- Long workspace/repository/branch names wrap in detail text or truncate only where the full accessible name remains available. Sanitized errors use `overflow-wrap: anywhere`.

### Zero, One, and Many

- Zero candidates and zero incomplete rows use the documented all-clear empty state.
- Zero candidates with one or more incomplete rows use the documented incomplete state and retain Refresh/Open.
- One candidate retains full card hierarchy; do not collapse it into a summary banner.
- Many candidates use service rank order, bounded internal scrolling, stable IDs, and focus preservation after refresh. Do not paginate in the first release candidate.

---

## Release and Verification Boundary

The UI contract includes live evidence requirements but does not create release controls or authorize release side effects.

- Browser review must capture Stale Workspaces in light and dark themes at desktop, 375px, and 320px for: initial loading, populated candidates, candidate plus unknown evidence/cautions, incomplete-only, zero/empty, retained-data refresh failure, first-load failure, and Remove confirmation return.
- Interactive browser review must exercise pointer, Tab/Shift+Tab, Escape, stale-entry shortcut with xterm focused, contained `R` refresh, repeated/held keys, menu navigation, Open success/failure, focus restoration, and responsive overflow.
- Interactive TUI review must exercise wide split, 56–79-column stacked, below-56 single-column, short-height scrolling, too-small fallback, generation-safe refresh, Open, canonical Archive/Remove confirmations, and incomplete-only action rejection.
- Cross-client review must compare candidate order, reason labels, merged-vs-closed terminology, timestamps, unknown/caution separation, counts, disabled reasons, Open result, lifecycle confirmations, and authoritative reconciliation from the same fixture.
- Phase 126's pending live browser/xterm, interactive OpenTUI, authenticated GitHub/GitLab, supported-host, operation reconnect/cancellation, responsive screenshot, and human parity evidence remains required. Deterministic tests and render harnesses do not substitute for those receipts.
- No UI action may tag, push, publish, create a GitHub Release, trigger tag-only release workflows, or claim `v0.22.0-rc.1` approval. Those remain separately authorized operator actions.

---

## UI Considerations

Applicable state considerations resolved: 8 covered, 0 backstop, 0 unresolved. The web singleton overlay, ranked candidate list, incomplete-evaluation section, action menus, and TUI dedicated view cover list-collection, nav, interactive-control, and static-content kinds.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | Candidate list; incomplete section; stale overlay/view | ✅ covered | Zero candidates and zero incomplete rows render the documented all-clear copy; zero candidates with incomplete rows use distinct non-all-clear copy and retain Refresh/Open. |
| loading | Initial projection; explicit refresh; Open; action inventory; revision recovery | ✅ covered | Every in-flight state has named copy, stable geometry, one-shot controls, generation guards, and no fabricated evidence or locally reconstructed actions. |
| error | First load; retained-data refresh; Open; action inventory; revision retry | ✅ covered | First-load errors expose Retry; refresh failures retain prior checked data; Open retains the row; inventories fail closed; revision mismatch reloads authoritative state before one retry. |
| populated | Ranked candidates; candidate detail; incomplete rows; TUI split view | ✅ covered | Normal data shows service order, every confirmed reason and timestamp, separately labelled unknowns/cautions, direct Open, and canonical lifecycle actions. |
| partial | Candidate with unknown evidence; incomplete-only evaluation; missing optional cautions/timestamps | ✅ covered | Confirmed candidates retain qualifying reasons while unknown probes remain explicit; unknown-only workspaces are separated and never ranked; missing data is not inferred. |
| overflow | Web overlay/cards/menus; TUI list/detail/footer; long identities and recovery text | ✅ covered | Web uses bounded vertical scrolling and responsive one-column reflow; TUI uses split/stack/single-column layouts and detail scrolling; required actions and labels remain visible. |
| zero-one-many | Candidate and incomplete collections; reason/unknown/caution lists | ✅ covered | Zero, one, and many states have explicit copy and stable card geometry; many items scroll without pagination or client reordering. |
| long-text | Workspace/repository names; reason labels; timestamps; safe provider errors; disabled reasons | ✅ covered | Headings may ellipsize only with a full accessible value; detail, error, reason, and recovery copy wraps or scrolls and never exposes raw paths or secrets. |

### Open UX and Accessibility Coverage

- Web uses labelled native controls, modal semantics, contained focus, list/menu semantics, `aria-busy`, `aria-disabled`, polite status, alert errors, and `<time>` elements. Status never relies on color alone.
- TUI provides equivalent selected-row markers, written reason/unknown/caution labels, explicit key hints, retained failures, and a too-small safe fallback.
- Refresh is explicit, not polling. There is no optimistic stale verdict, background/global probe, persisted cache, browser storage, or client-owned policy.
- The fixed 30-day threshold is explanatory product policy, not a user-editable field; no settings form, migration UI, or threshold copy is introduced.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable — `components.json` is absent and Phase 127 preserves native DOM/CSS and OpenTUI; confirmed 2026-07-17 |
| third-party registries | none | not applicable — no registry code enters this phase; confirmed 2026-07-17 |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
