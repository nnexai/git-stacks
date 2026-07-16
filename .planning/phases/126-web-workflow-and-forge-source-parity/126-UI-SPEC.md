---
phase: 126
slug: web-workflow-and-forge-source-parity
status: approved
shadcn_initialized: false
preset: none
created: 2026-07-16
reviewed_at: 2026-07-16
---

# Phase 126 — UI Design Contract

> Visual and interaction contract for the imperative web client and SolidJS/OpenTUI dashboard. Generated through the `gsd-ui-phase` workflow and checked against its six design dimensions.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | Existing native web DOM/CSS and SolidJS/OpenTUI primitives; no new design system |
| Preset | not applicable |
| Component library | Native web controls plus existing singleton modal/context-menu seams; existing `CenteredDialog`, action-menu, detail, and progress components in TUI |
| Icon library | none; reuse existing text glyphs and inline monochrome SVGs with text/accessible labels |
| Font | Web: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; identifiers use the existing monospace stack. TUI uses terminal-native text. |

Phase 126 extends, rather than replaces, the established `.button`, `.modal-*`, `.context-menu*`, `.toast*`, `.field`, `.repository-picker`, and focus-visible patterns. Web dialogs participate in the Phase 125 singleton overlay controller. TUI work extends the established `ActionMenu`, `CenteredDialog`, `WorkspaceDetail`, and progress surfaces rather than creating a parallel dashboard shell.

### Established Visual Tokens

| Token | Dark value | Light value | Phase 126 use |
|-------|------------|-------------|---------------|
| `--bg` | `#0c0d0f` | `#fafafa` | Dominant application, form, and detail background |
| `--panel` | `#151619` | `#f2f2f4` | Modal, toolbar, and durable-operation surfaces |
| `--panel-2` | `#1c1e22` | `#ffffff` | Action rows, note/file cards, review groups, progress rows |
| `--panel-hover` | `#24262b` | `#e7e8eb` | Pointer hover only |
| `--line` | `#303238` | `#d3d4d8` | Borders and separators |
| `--text` | `#f0f0f1` | `#242529` | Primary labels and values |
| `--muted` | `#92969e` | `#696d75` | Metadata, explanations, disabled reasons |
| `--accent` | `#1c71d8` | `#1c71d8` | One primary CTA, selected action/result, active review step |
| `--success` | `#57c78b` | `#228b54` | Completed operations and healthy file status |
| `--warning` | `#ffad45` | `#995400` | Guards, drift, late cancellation, ambiguous/review-needed state |
| `--danger` | `#ff747f` | `#c83d4d` | Remove, force-remove, clear-notes, and hard failure |
| `--focus` | `#78aeed` | `#1c71d8` | Existing 2px `:focus-visible` ring |

OpenTUI maps the same semantics to `white`/`gray`, `cyan`, `green`, `yellow`, and `red`; color is always paired with state text and a marker such as `✓`, `!`, or `×`.

---

## Spacing Scale

Declared web values:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Inline icon/status gaps |
| sm | 8px | Compact row and button gaps |
| md | 16px | Form groups, cards, modal body spacing |
| lg | 24px | Empty states and section separation |
| xl | 32px | Compact control target and major group spacing |
| 2xl | 48px | Major vertical breaks |
| 3xl | 64px | Reserved page-level spacing |

Exceptions: preserve existing shell geometry—36px fields, 44px workspace rows, 7px/8px inherited control radii, 12px modal radius, 9vh modal offset, and `min(620px, calc(100vw - 28px))` default modal width. These are established component dimensions, not additions to the spacing scale. OpenTUI uses whole terminal cells and the current component padding model.

---

## Typography

Phase 126 declares exactly four web sizes and two weights. Existing brand/provider marks retain their current special weights.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Metadata / status | 11px | 400 | 1.4 |
| Body / explanation | 13px | 400 | 1.45 |
| Label / control | 14px | 650 | 1.3 |
| Heading | 17px | 650 | 1.2 |

Operation IDs are never the visible heading. Repository names, branches, logical file targets, and typed confirmation values use the existing monospace stack at the Metadata or Body size. TUI preserves its single terminal font and expresses hierarchy with color, indentation, borders, and spacing rather than simulated font sizes.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--bg)` | Application field, terminal-adjacent space, inputs, long detail regions |
| Secondary (30%) | `var(--panel)` / `var(--panel-2)` | Menus, dialogs, review sections, notes/files, operation cards |
| Accent (10%) | `var(--accent)` | The current primary CTA, selected menu/result row, active forge-review step, selected repository |
| Destructive | `var(--danger)` | Remove, Force remove, Clear notes, and terminal operation failure only |

Accent reserved for: one primary action per surface, the active row/step, the existing selected workspace/repository state, and no other elements. Hover uses `--panel-hover`; focus uses `--focus`; progress uses semantic success/warning/danger colors. Disabled actions use muted text plus a written reason, never opacity alone. All accent-backed text uses `--accent-text`.

---

## Copywriting Contract

### Workspace Actions and Operations

| Element | Copy |
|---------|------|
| Workspace action entry | `Workspace actions` |
| No active workspace | `Select an active workspace to view its actions.` |
| Generic unavailable format | `{Action} unavailable — {authoritative reason}.` |
| In-flight lock | `{Action} is already running for {workspace}.` |
| Accepted operation | `{Action} started for {workspace}.` |
| Reconnecting | `Reconnecting to {action} for {workspace}…` |
| Too-late cancellation | `{Action} is already finishing and can no longer be cancelled.` |
| Successful operation | `{Action} completed for {workspace}.` |
| Failed operation | `{Action} failed for {workspace}. {safe recovery guidance}` |
| Cancel CTA | `Cancel {action}` |
| Cancelled operation | `{Action} was cancelled. Authoritative workspace state has been refreshed.` |
| Refresh failure | `Workspace state could not be refreshed. Retry refresh before running another action.` |

Action labels are verb + object where ambiguity exists: `Rename workspace`, `Open workspace`, `Close workspace`, `Pin workspace`, `Unpin workspace`, `Sync workspace`, `Pull workspace`, `Push workspace`, `Merge workspace`, `View notes`, `View file status`, `Archive workspace`, `Unarchive workspace`, and `Remove workspace`. Do not expose action IDs, revisions, raw operation records, filesystem paths, hook output, or provider CLI commands.

### Confirmations

| Action | Title / body | Safe / primary actions |
|--------|--------------|------------------------|
| Archive | No confirmation; retain the established immediate reversible action and Undo affordance. | `Undo archive` |
| Remove | `Remove {workspace}?` followed by the established inventory of terminals, managed worktrees, workspace directory, and definition. | Initial focus `Keep workspace`; destructive `Remove workspace` |
| Force remove | `Force remove {workspace}?` plus named dirty repositories and `Type {workspace} to confirm irreversible removal.` | `Back`; destructive `Force remove {workspace}` enabled only on exact match |
| Merge | `Merge {workspace} into {target branch}?` plus the service-projected consequence. | Initial focus `Keep workspace`; primary `Merge workspace` |
| Clear notes | `Clear all notes for {workspace}? This permanently removes the workspace note history.` | Initial focus `Keep notes`; destructive `Clear workspace notes` |
| Other policy-confirmed action | `{Action} {workspace}?` plus the service-projected consequence and recovery boundary. | `Keep workspace`; `{Action} workspace` |

Pointer, context-menu, and keyboard invokers open the identical confirmation. A shortcut or repeated Enter can never accept a confirmation on the same event that opened it.

### Notes and File Status

| Element | Copy |
|---------|------|
| Notes heading | `Workspace notes` |
| Notes empty heading | `No workspace notes` |
| Notes empty body | `Add an operator note to keep workspace context here.` |
| Note input label | `New workspace note` |
| Note input hint | `Plain text only. Notes are stored by the service for this workspace.` |
| Note primary CTA | `Add note` |
| Notes loading | `Loading workspace notes…` |
| Notes load error | `Workspace notes could not be loaded. Retry without changing stored notes.` |
| Note add error | `The note was not added. Review the message and retry.` |
| Notes clear error | `Workspace notes were not cleared. Refresh the list before retrying.` |
| File heading | `Workspace file status` |
| File empty heading | `No configured workspace files` |
| File empty body | `This workspace has no configured copy, symlink, or sync targets.` |
| File loading | `Loading workspace file status…` |
| File error | `Workspace file status could not be loaded. Retry the service check.` |
| Healthy summary | `All configured workspace files are in sync.` |
| Attention summary | `{count} configured file {count, plural, one {target needs} other {targets need}} attention.` |

Use provider/repository identity and safe relative configured targets only. Never render a workspace root, `main_path`, `task_path`, absolute source/target path, raw filesystem error, or message containing a host path.

### Forge URL Creation

| Element | Copy |
|---------|------|
| Flow entry | `Create from pull or merge request` |
| Resolve title | `Resolve forge URL` |
| URL label | `GitHub pull request or GitLab merge request URL` |
| URL hint | `Paste a full supported web URL. Resolving does not create a workspace.` |
| Resolve CTA | `Resolve URL` |
| Resolving | `Resolving change source…` |
| Review title | `Review workspace` |
| Review intro | `Confirm the resolved source and edit the workspace plan before creation.` |
| Immutable source label | `{provider term} source` where GitHub uses `Pull request` and GitLab uses `Merge request` |
| Back action | `Change URL` |
| Create CTA | `Create workspace` |
| Creating | `Creating {workspace}…` |
| Unsupported URL | `This is not a supported GitHub pull request or GitLab merge request URL. Paste a full web URL.` |
| Unsupported host | `This forge host is not configured. Add the host to forge settings or use a configured URL.` |
| Authentication/tooling | `{Provider} access is unavailable. Authenticate the configured provider tool, then resolve again.` |
| Inaccessible/closed change | `This {pull request|merge request} is unavailable or closed. Open an accessible change and resolve again.` |
| No repository match | `No enabled worktree repository matches this source. Choose a compatible template or update repository metadata.` |
| Ambiguous match | `More than one repository matches this source. Choose the source repository, then resolve again.` |
| Expired review | `This review expired or the catalog changed. Resolve the URL again before creating.` |
| Invalid edited draft | `Review the highlighted workspace fields before creating.` |
| Create failure | `Workspace creation failed. Review the safe operation details, correct the draft when possible, or resolve again.` |

Provider terminology is never flattened: GitHub says pull request/head/base; GitLab says merge request/source/target. A successful resolution says `Source resolved` and never `Workspace created`.

---

## Canonical Action Surface

### One Descriptor, Every Invoker

- The canonical action model supplies stable action ID, label, availability, written disabled reason, confirmation policy, pending/progress state, cancellability, and exactly one execution callback.
- The supported set is Archive/Unarchive, Remove/Force remove, Rename, Open/Close, Pin/Unpin, Sync, Pull, Push, Merge, View/Add/Clear notes, View file status, and Cancel operation.
- Web workspace rows, visible pin and scope controls, context menus, existing optional keyboard dispatch, and TUI action/menu keys resolve the same descriptor. Renderers may group or omit an irrelevant action, but they must not create another callback.
- An unavailable but relevant action remains visible. Web menu rows use `aria-disabled="true"`, remain focusable, show the reason beneath or beside the label, and announce it on attempted activation without transport. TUI rows remain in place, render muted, append `({reason})`, and announce the same reason without transport.
- The action is locked synchronously on the first accepted pointer/key event. Repeated Enter, rapid clicks, and key repeat cannot submit twice. While a conflicting workspace operation runs, affected descriptors update from authoritative operation state.
- Browser/TUI text never interprets raw error strings to decide availability or recovery. Typed service reasons select the written copy above.

### Web Placement and Hierarchy

- Keep the active terminal as the main-screen focal point. The selected workspace/repository scopebar gains one visible `Workspace actions` button and an adjacent compact operation-status chip when an operation exists. Existing row pin control remains the direct high-frequency Pin/Unpin invoker.
- Right-clicking a workspace row opens the same actions grouped as `Workspace`, `Git`, `Details`, and `Lifecycle`. The scope menu uses the same group/order. Destructive lifecycle rows are last and separated.
- `Workspace`: Open/Close, Rename, Pin/Unpin. `Git`: Sync, Pull, Push, Merge. `Details`: Workspace notes, Workspace file status. `Lifecycle`: Archive or Unarchive, Remove workspace. Force remove appears only in the typed dirty-worktree recovery state.
- No generic command palette is introduced and no Phase 126 action receives a new default global shortcut. Existing bound shortcuts are optional invokers only.
- Archived Workspaces remains minimal: identity, archived time, and Unarchive only. It does not inherit normal action groups.

### TUI Placement and Hierarchy

- Extend `ActionMenu` in stable groups without rebinding established action keys where avoidable. Add Pull, Pin/Unpin, Notes, and File status; display each disabled reason inline. The first available row is selected; Up/Down skip no rows so reasons remain discoverable, while Enter/letter activation on an unavailable row only reports the reason.
- Workspace detail keeps read-only note and file summaries. Activating Notes opens a dedicated list/add/clear view; File status opens a scrollable sanitized detail view. Pin/Unpin stays a direct action.
- Action menus preserve `[Esc] Back`; confirmation screens use explicit safe/destructive key hints. The footer always reflects the currently visible actions and never advertises unavailable hidden behavior.

---

## Durable Operation and Cancellation Contract

### Web

- Before an operation ID is returned, the invoking row/button shows `{Action}…`, sets `aria-busy="true"`, and disables duplicate intent. Once accepted, the durable operation ID—not the original request—drives all later rendering.
- Extend the existing bottom-right toast region with persistent operation cards. A running card names action and workspace, shows current safe stage, optional repository rows, and `Cancel {action}` only while service state says `cancellable: true`. It never steals terminal focus.
- Stack at most three cards; `View {count} more operations` opens a singleton `Workspace operations` dialog. Running cards never auto-dismiss. Completed/failed/cancelled cards remain until acknowledged or reconciled by a documented session policy.
- During connection loss, retain the known operation card with `Reconnecting…`, disable Cancel, and resume observation by operation ID. Never resubmit. After every terminal outcome, refresh the authoritative snapshot before re-enabling conflicting actions.
- If Cancel is accepted, label the control `Cancelling…` and send once. If service reports committed/non-cancellable/finished, preserve progress and show the exact too-late copy; never claim rollback.
- Stage changes use a polite live region with coalescing; failure uses `role="alert"`. Repository rows are visual detail, not repeated live announcements.

### OpenTUI

- Replace per-action progress variations with one operation frame that names action/workspace, safe stage, repository rows, and terminal state. `[c] Cancel {action}` appears only while cancellable; otherwise show `Finishing current step — cancellation unavailable`.
- Operation views consume all unrelated keys. Repeated `c` submits once and changes the hint to `Cancelling…`. Escape does not abandon a running durable operation; it may return to the dashboard only when observation continues through a visible status marker.
- Reconnect restores the known operation by ID and renders `Reconnecting…`; it never repeats the mutation. Success, failure, and cancellation remain readable until acknowledgement and authoritative selection refresh.
- At narrow terminal heights, keep heading, current stage, Cancel/status hint, and final result visible; scroll or tail repository detail and report omitted-row count.

---

## Notes and Path-Free File Detail

### Notes

- Notes render newest-first with timestamp and wrapped plain text. The heading carries the authoritative count. Zero, one, and many notes use the same list geometry.
- Web uses one singleton `Workspace notes — {workspace}` dialog. The list is the first content region; `New workspace note` is a multiline native text field below it; `Add note` is the sole accent CTA. Adding disables only the composer, preserves the existing list, then replaces it with the refreshed authoritative list.
- TUI uses a large `CenteredDialog`: newest-first list, `[a] Add note`, `[x] Clear notes`, `[Esc] Back`. Add opens a contained text input; submitting once starts the mutation and returns to the refreshed list on success.
- Empty/whitespace, over-limit, or invalid UTF-8 input is rejected inline without transport. Do not create authors, tags, edit/delete controls, search, or browser-local drafts.
- Clear opens the exact confirmation above from either client. On failure, retain or reload the authoritative list; never optimistically show zero.

### File Status

- File status is lazy: opening its detail first shows the loading copy, then one workspace group followed by repository groups. Each group has a count summary and rows with logical target, type (`copy`, `symlink`, `sync`), state, severity marker, and sanitized recovery text.
- Render the shared states verbatim: healthy/in-sync, `missing`, `pullable`, `pushable`, `diverged`, and `error`. State text and icon accompany color.
- Web uses `Workspace file status — {workspace}` in the singleton dialog; groups collapse only through explicit labelled buttons and default open when attention exists. TUI uses a scrollable large dialog and the same group order.
- Long logical targets wrap or ellipsize with an accessible/full safe value. No client exposes or reconstructs host paths, raw warnings, roots, or source/target filesystem locations.
- Loading/error retry is local to the read surface and does not block unrelated workspace actions.

---

## Forge URL Resolve → Review → Create

### Shared State Machine

1. `Resolve URL`: collect one full URL and call the service resolver. Enter invokes only `Resolve URL`.
2. `Review workspace`: display immutable provider/change identity plus editable workspace plan. No creation occurs on arrival or on the Enter event that completed resolution.
3. `Create workspace`: explicit submit sends the review token, revision, and complete edited draft once; accepted work moves to the normal durable creation progress surface.

Changing the URL invalidates the old draft/token. Expired/stale resolution returns to Resolve with the URL preserved. An editable validation failure remains on Review with fields and safe provider identity intact. A successful create closes the review only after authoritative snapshot reconciliation and selects the created workspace.

### Web Layout

- The existing Create Workspace surface gains two entry choices: `From template or repositories` and `From pull or merge request`. The latter opens a wide form in the same singleton overlay controller.
- The header includes a two-step indicator, `1 Resolve URL` and `2 Review workspace`; only the current/completed step uses accent. Creation progress is operation state, not a fake third completed form step.
- Resolve contains the URL label, hint, one field, inline error region, `Close`, and primary `Resolve URL`. While resolving, keep the URL visible, disable submit, set `aria-busy`, and show `Resolving change source…`.
- Review starts with a non-editable source anchor card: provider logo/text, pull/merge request number and title when safely projected, canonical repository identity, source/head branch, target/base branch, and fork/source repository when applicable. Never render credentials, CLI output, fetch commands, or paths.
- Editable groups follow: Workspace name; Template; Included repositories; Matched source repository; Branch mapping per included worktree repository. Changed fields show validation beside the field. Immutable change metadata remains visible while the form scrolls.
- Footer order is `Change URL`, `Close`, `Create workspace`. `Create workspace` is the sole accent CTA and remains unavailable with a written reason until the complete draft is valid. A failed create preserves Review when the token remains usable.

### OpenTUI Layout

- Add `Create from PR/MR URL` to the existing create entry surface. Resolve uses a medium `CenteredDialog` with one focused URL input, `[Enter] Resolve URL`, `[Esc] Back`.
- Review uses a large scrollable dialog. At width 80 or more, source labels and values may share rows; below 80, every label/value and editable field stacks vertically. Below 56 columns, truncate only immutable repository/branch display with ellipsis while retaining the full safe value in the editable input or scrollable detail.
- Source anchor appears first, editable sections follow in the same order as web, and the footer is `[Enter] Edit/select`, `[c] Create workspace`, `[b] Change URL`, `[Esc] Back`. Creation is enabled only when validation passes; the `c` event is one-shot and cannot leak into progress.
- Pickers and validation stay inside the review dialog. Returning from a picker restores its originating row. Narrow heights keep the title, current section, error, and footer visible while the body scrolls.

---

## Focus, Keyboard, Pointer, and Overlay Rules

- Web context menus use roving focus, ArrowUp/ArrowDown, Home/End, Enter/Space, Escape, and type-to-letter where already supported. Pointer and keyboard activation call the same descriptor. Opening a confirmation consumes the triggering event before focus moves.
- Every web dialog is labelled, modal, focus-contained, Escape/visible-close accessible, and owned by the Phase 125 singleton controller. Confirmation/editor/forge review/note composer surfaces are exclusive; unrelated global actions report unavailable and do not replace them.
- Opening from xterm records the terminal return target. Close/cancel/success restores that terminal when valid, then the current terminal, then the invoker. Replacing one compatible overlay preserves the original return target and never focuses document body.
- Dialog focus starts at the first unresolved field (Resolve URL, note composer when adding, first invalid Review field) or the safe cancel action for destructive confirmation. Result/detail lists do not become hundreds of Tab stops; use roving focus or active-descendant patterns where applicable.
- Web icon-only controls retain `aria-label`, `title`, and the 2px focus ring. Disabled reasons are associated with `aria-describedby`; dynamic counts/states use polite live regions. Errors focus their summary only after submission, then allow navigation to the first invalid field.
- OpenTUI inputs consume typing, Enter, and Escape without leaking into app-level handlers. Menus/dialogs consume their documented keys, restore the originating row on Back, and never allow a held key to submit an operation twice.

---

## Responsive and Overflow Contract

### Web Desktop, 375px, and 320px

- At desktop widths, action/detail dialogs may use `min(720px, calc(100vw - 32px))` for forge review and operation/file detail; ordinary confirmations retain the 620px frame. Body height remains bounded and scrollable with a sticky header/footer.
- At 640px and below, editable two-column rows stack, action groups remain full-width, and operation cards span `calc(100vw - 16px)`. Labels stay visible; icon-only conversion is allowed only for existing toolbar controls with an accessible name.
- At 375px, the review source anchor and operation repository rows become one column; modal padding uses 16px, groups use 8px gaps, and footer actions wrap with the primary action on its own full-width row when necessary.
- At 320px, no page or modal creates horizontal scroll. The modal uses 8px side inset, fields/buttons use available width, long safe identities wrap, context menus clamp inside the viewport, and the operation card uses 8px inset. Exact-name force confirmation and `Create workspace` remain visible without zoom.
- Workspace sidebar behavior remains the existing application behavior; Phase 126 does not hide required actions behind a desktop-only hover. Pin/Unpin remains keyboard/touch discoverable at narrow widths.

### OpenTUI Narrow Layouts

- Dialog width remains clamped to terminal width minus four cells. At fewer than 80 columns, group metadata stacks; at fewer than 56 columns, secondary descriptions truncate before action labels or disabled reasons.
- At short heights, headers and key hints stay fixed; scroll list/detail bodies. Preserve at least one content row and report omitted progress rows.
- A too-small terminal shows `Terminal is too small for workspace review. Resize to at least 40 × 12.` and allows Back; it never renders overlapping fields or accepts blind Create.

---

## UI Considerations

Applicable state considerations resolved: 8 covered, 0 backstop, 0 unresolved. The six named surfaces—canonical action menus, durable operations, notes, file status, forge Resolve, and forge Review—cover form, list-collection, nav, interactive-control, and static-content kinds.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | Action scope; notes; file groups; operation list; forge editable selections | ✅ covered | Surfaces retain their frame and render the documented contextual empty copy and next step; unavailable actions remain visible with reasons rather than disappearing. |
| loading | Registry/action state; notes/files; URL resolution; creation; reconnect | ✅ covered | Each read/submit has a named busy state, keeps stable context visible, uses `aria-busy`/TUI status, and blocks duplicate intent without displaying fabricated defaults. |
| error | Actions; cancellation; notes/files; resolve/review/create | ✅ covered | Typed failures select actionable safe copy, preserve correct editable state, avoid raw/path-bearing detail, and always offer Retry, Refresh, Change URL, or field correction as appropriate. |
| populated | Menus; notes; file groups; progress rows; source review | ✅ covered | Typical data uses the specified grouping/order, one active/primary focal point, provider terminology, and authoritative counts/state. |
| partial | Disabled capability; partial repository progress; missing forge fields; sanitized file detail | ✅ covered | Missing data is explicitly labelled or omitted without inventing authority; operation/review surfaces retain available safe rows and identify what must be refreshed or corrected. |
| overflow | Menus/dialogs; notes; file detail; progress; review form | ✅ covered | Web bodies scroll within bounded frames, TUI bodies scroll/tail, headers/footers stay visible, and 320px/narrow-terminal rules prevent clipped primary actions. |
| zero-one-many | Notes; file entries/groups; operations; repository selections | ✅ covered | Zero uses documented empty copy, one retains complete labels, and many use stable grouping, counts, bounded stacking, and scrolling. |
| long-text | Workspace/repository/branch/note/action/error/logical-target copy | ✅ covered | User note text and explanations wrap; safe identities truncate only with full accessible/scrollable value; no raw path is revealed as overflow detail. |

### Accessibility and Open UX Coverage

- Web uses native labelled controls, `role="dialog"`/`aria-modal`, menu/list semantics, `aria-disabled`, `aria-describedby`, `aria-busy`, polite status, and alert errors. Status never relies on color alone; focus order follows visual order.
- TUI provides equivalent text labels, semantic markers, selected-row cursor, explicit key hints, and readable failure/progress retention. Mouse support, where OpenTUI already provides it, calls the same action as keyboard activation.
- Light/dark/system themes use existing variables. Motion is unnecessary; the existing reduced-motion rule covers any retained progress animation.
- Service reconnect is explicit, not optimistic. There is no offline mutation queue, browser-local operation replay, or browser-local note/forge authority.

---

## Phase 127 Live-UAT Boundary

Phase 126 must supply deterministic protocol/service/client tests, DOM/browser harnesses, OpenTUI rendering/key harnesses, responsive source assertions, and path-redaction tests. It must not claim the milestone's human approval from those checks alone.

Phase 127 retains the consolidated pre-tag verification of:

- real browser screenshots at desktop, 375px, and 320px in light/dark themes;
- physical keyboard, pointer, singleton-overlay focus restoration, and real xterm pass-through;
- live service reconnect/progress/cancellation behavior;
- interactive OpenTUI desktop and narrow-terminal layout/key behavior;
- hosted GitHub/GitLab authentication, resolution, review, creation, and safe failure receipts on supported hosts;
- cross-client copy, disabled-reason, progress, confirmation, and result parity.

No tag, publish, push, or release-candidate claim occurs until that Phase 127 manual gate is approved.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable — `components.json` is absent and Phase 126 preserves native DOM/CSS and OpenTUI; confirmed 2026-07-16 |
| third-party registries | none | not applicable — no registry code enters this phase |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — all CTAs, states, confirmations, and recovery paths are action-specific
- [x] Dimension 2 Visuals: PASS — focal points, grouping, hierarchy, and responsive behavior are explicit for both clients
- [x] Dimension 3 Color: PASS — 60/30/10 contract and semantic reservations are explicit
- [x] Dimension 4 Typography: PASS — four sizes and two weights only
- [x] Dimension 5 Spacing: PASS — declared spacing uses the standard 4px scale; established geometry is explicitly scoped
- [x] Dimension 6 Registry Safety: PASS — no external component registry is used

**Approval:** approved 2026-07-16
