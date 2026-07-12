# Phase 107 — UI Review

**Audited:** 2026-07-12
**Baseline:** Abstract 6-pillar standards (no `UI-SPEC.md` exists for this phase)
**Screenshots:** Not captured. Phase 107 is a native GTK4/libadwaita surface, Playwright-MCP is unavailable, and the only browser server found (`localhost:5173`) is an unrelated Dynamite Deluxe app. A controlled X11 capture attempt could not safely enumerate the GTK window, so no whole-desktop capture was taken.
**Runtime evidence:** Current-tree `bun run native:smoke-workspace`, `bun run native:test:workspace-ui`, and `bun run native:test:accessibility` passed. The smoke proves that the production GTK surface renders and the lifecycle actions execute; it is not visual proof. The accessibility runner itself says human observations remain required (`scripts/verify-native.ts:583-607`).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | Connection and ended-terminal copy is specific, but search-empty, recovery, rename-reset, and user-facing error copy is unfinished. |
| 2. Visuals | 2/4 | The workspace-first hierarchy is present, but repeated row iconography, weak control semantics, and unlabeled icon controls keep the polish pass from reading as resolved. |
| 3. Color | 3/4 | Theme tokens and restrained accent use are strong; subtle alpha-only hover/group states still need contrast evidence. |
| 4. Typography | 3/4 | Libadwaita type classes keep the scale compact, but expander-level semibold styling risks flattening child-row hierarchy. |
| 5. Spacing | 2/4 | Individual values are plausible, but there is no coherent scale or implemented narrow-layout behavior despite a declared breakpoint contract. |
| 6. Experience Design | 2/4 | Lifecycle coverage is substantial, but accessibility semantics, keyboard launcher flow, destructive close protection, and recovery actions have notable gaps. |

**Overall: 14/24**

**Classification:** 0 BLOCKER findings, 20 WARNING findings, and 4 passing-evidence notes. No code-inspection finding proves that the main pointer-driven flow is impossible, but the missing visual capture and human accessibility evidence prevent a release-quality visual signoff from this audit alone.

---

## Top 3 Priority Fixes

1. **Make the workspace shell and command launcher semantically and keyboard complete** — Screen-reader and keyboard users cannot reliably infer the active grouping/pair or execute the launcher as a keyboard-first overlay — honor the requested accessible role, publish selected/pressed/current states, label the menu and new-tab icon buttons, attach attention text to the active rows, expose keyboard alternatives for pin/reorder, and add first-result selection plus Up/Down/Enter behavior.
2. **Protect live terminal work from accidental close** — Closing a live tab immediately terminates and removes it — intercept live close with an `AdwAlertDialog`/`AdwMessageDialog` confirmation (or an explicit safe preference) while keeping ended-tab removal immediate.
3. **Implement the adaptive and actionable state shell** — The sidebar and launcher are fixed-size, while empty/disconnected/error/search-zero states are bare or blank — wire the declared breakpoint to an adaptive split view, replace the connection label with actionable `AdwStatusPage` variants, and render command-search empty/no-match guidance.

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)

- **WARNING — Good state specificity is not paired with recovery guidance.** The model distinguishes loading, empty, disconnected, stale, incompatible, refresh-required, failure, and workspace states (`native/linux/workspace_view.zig:4`, `native/linux/workspace_view.zig:18-27`), and the rendered labels clearly name each condition (`native/linux/app.zig:672-683`). However, the UI renders those conditions as one label with no next step (`native/linux/app.zig:1645-1650`). “No workspaces configured,” “Refresh required before launching,” and “Workspace service failed” should each explain and expose the relevant action.
- **WARNING — Zero command results render as an unexplained blank list.** `refreshLauncher` clears the list and appends only collected matches; `count == 0` has no empty/no-match row (`native/linux/app.zig:540-566`). Add distinct copy for no commands configured in this scope and no matches for the current query.
- **WARNING — Internal error names reach the user.** Several launch paths pass `@errorName(err)` (`native/linux/app.zig:1272-1278`) into the literal `Launch failed: {s}` (`native/linux/app.zig:1334-1341`). Map known errors to plain-language cause and recovery copy, while retaining the technical code in logs or expandable details.
- **WARNING — Control language and manual-title behavior are inconsistent or undiscoverable.** The same action is called “New terminal” in one context and “New shell” in the header menu (`native/linux/app.zig:993-995`, `native/linux/app.zig:1611-1613`). The rename dialog gives no hint that submitting an empty title returns the tab to automatic Ghostty titles, even though that is the implemented contract (`native/linux/app.zig:1158-1166`). Standardize on one noun and add concise reset guidance.

### Pillar 2: Visuals (2/4)

- **PASSING EVIDENCE — The structural hierarchy is real.** Pinned content has a dedicated heading and grouped content uses expanders (`native/linux/app.zig:757-834`), selected rows and unread counts receive dedicated styling (`native/linux/app.zig:20-31`, `native/linux/app.zig:589-602`), and ended terminals get a centered, clearly separated action state (`native/linux/app.zig:856-873`). These are sound foundations.
- **WARNING — Every selectable pair uses the same branch glyph.** Direct single-repository workspace rows and nested repository targets both route through `appendPairButton`, which always installs `vcs-branch-symbolic` (`native/linux/app.zig:573-588`). Workspace identity, repository target, and pin state therefore depend mainly on nesting and labels. Use distinct workspace/repository glyph treatment, or omit redundant row icons where the grouping already supplies context.
- **WARNING — Active grouping is a CSS-only state on ordinary flat buttons.** “Labels” and “Repositories” are separate flat buttons (`native/linux/app.zig:1623-1635`); the active state is only a low-alpha background class (`native/linux/app.zig:22-24`, `native/linux/app.zig:638-645`). Use a native toggle/segmented pattern with both visual and semantic state.
- **WARNING — Icon-only control treatment is inconsistent.** The search icon has a tooltip and accessible label (`native/linux/app.zig:1603-1607`), while the header menu icon and tab-new icon are constructed without equivalent labels/tooltips (`native/linux/app.zig:1608-1616`, `native/linux/app.zig:930-932`). Apply the same affordance contract to every icon-only control.
- **WARNING — The header attention treatment exposes implementation vocabulary.** The bare header label prints the internal severity tag (`primary`, `secondary`, or `none`) in `Attention: N unread ({severity})` (`native/linux/app.zig:885-898`). Use user-facing severity language and a compact status component/icon whose hierarchy is verified alongside the header controls.

### Pillar 3: Color (3/4)

- **PASSING EVIDENCE — Palette construction is appropriately theme-native.** The product CSS contains no hexadecimal or RGB literals. It uses `@window_fg_color`, `@accent_color`, `@accent_bg_color`, and `@accent_fg_color`; accent is confined to the selected pair and unread badge (`native/linux/app.zig:20-31`). Ended-tab deletion delegates to libadwaita’s `destructive-action` class (`native/linux/app.zig:868-873`). This should adapt to light/dark system themes better than a fixed palette.
- **WARNING — Group and hover states rely on very close alpha values without captured contrast evidence.** Row hover uses foreground alpha `0.08`, the active group uses `0.12`, and selection uses accent alpha `0.24` (`native/linux/app.zig:24-27`). The selected row is likely distinct, but the hover/active-group difference is too subtle to approve without light, dark, and high-contrast captures. Prefer the native selected/toggle state or verify contrast in all three modes.

### Pillar 4: Typography (3/4)

- **PASSING EVIDENCE — The type inventory is compact and native.** The shell uses default body text plus libadwaita `caption-heading`, `title-4`, and `title-2` roles, with only two custom weights: 600 for expanders and 700 for badges (`native/linux/app.zig:28-31`, `native/linux/app.zig:622-628`, `native/linux/app.zig:760-763`, `native/linux/app.zig:860-862`). This avoids an uncontrolled type scale.
- **WARNING — Font weight is applied to the entire expander widget rather than its title.** `.git-stacks-sidebar expander { font-weight: 600; }` can inherit into the row content, flattening the distinction between group title and selectable children; only color is scoped to `expander > title` (`native/linux/app.zig:29-30`). Scope the weight to the expander title as well and leave child rows at body weight.
- **WARNING — The attention status competes at body style instead of having a deliberate compact status style.** It is inserted as an unstyled label at the header start (`native/linux/app.zig:1598-1602`). Give it a stable caption/status treatment, truncation policy, and tooltip so longer translated strings do not compete with window controls.

### Pillar 5: Spacing (2/4)

- **WARNING — The local rhythm is plausible but not tokenized.** The same compact sidebar mixes gaps/padding/margins of 1, 2, 4, 5, 6, 7, 8, 9, 10, and 12 pixels (`native/linux/app.zig:21-31`, `native/linux/app.zig:581`, `native/linux/app.zig:764`, `native/linux/app.zig:796`, `native/linux/app.zig:857`, `native/linux/app.zig:1620-1623`). Consolidate these around a small native spacing scale and document which values define section, row, and inline rhythm.
- **WARNING — Declared breakpoints are dead while fixed dimensions drive the shell.** `application.Breakpoint` declares 720/1080 thresholds (`native/linux/application.zig:7`), but the UI uses a 190-pixel sidebar minimum, a 220-pixel paned position with shrinking disabled, a 560×400 dialog, and a 520×360 child (`native/linux/app.zig:1620-1622`, `native/linux/app.zig:1668-1672`, `native/linux/app.zig:1680-1684`). Wire an `AdwBreakpoint`/`AdwOverlaySplitView` policy and let the launcher clamp to available size.
- **WARNING — The default window is only 800×480.** At that size, a non-shrinking 220-pixel sidebar plus terminal and header leaves little margin for large text or translated control labels (`native/linux/app.zig:2031-2033`). Verify minimum-size, 200% text scaling, and narrow-width behavior once adaptive layout is implemented.

### Pillar 6: Experience Design (2/4)

- **PASSING EVIDENCE — State and lifecycle coverage is a genuine strength.** Readiness-gated actions are disabled centrally (`native/linux/app.zig:656-670`); terminal launch shows a loading page (`native/linux/app.zig:1238-1245`); ended terminals expose relaunch/remove actions (`native/linux/app.zig:856-873`); and launcher close restores prior focus (`native/linux/app.zig:1347-1365`). The current isolated workspace smoke exercised create, search, select, rename, close, relaunch, pin, title updates, and pair isolation successfully.
- **WARNING — Requested accessible roles are silently discarded.** `setAccessible` ignores its `role` argument and updates only label/description (`native/linux/app.zig:535-538`). Therefore status/heading semantics requested at call sites are not established. Selected workspace and active grouping are likewise CSS classes only (`native/linux/app.zig:598-602`, `native/linux/app.zig:638-645`) with no checked/selected/current accessible property.
- **WARNING — The tested attention description is not attached to the active sidebar badge.** `attention_view.present` can produce icon/count/priority text (`native/linux/attention_view.zig:2-3`), and the test validates that model presentation (`native/tests/accessibility_test.zig:22-29`), but the active pair row directly builds a numeric badge from `model.aggregate` and never applies that description (`native/linux/app.zig:589-595`). Attach the redundant text to the button/badge and test the rendered widget tree, not only the model helper.
- **WARNING — The command launcher is not demonstrably keyboard-first.** Search input receives focus and the only custom key path handles Escape (`native/linux/app.zig:1347-1371`). Results launch through `row-activated`, but there is no first-result selection or explicit Up/Down/Enter bridge from the focused search entry (`native/linux/app.zig:1685-1707`). Add and test those paths, including zero results and disabled readiness.
- **WARNING — Live tab close is immediately destructive.** The close handler terminates a live terminal, removes it from the model, and finishes the close with no user confirmation (`native/linux/app.zig:1027-1058`). This is a high-impact accidental-input risk for long-running work.
- **WARNING — Non-ready states are informational dead ends.** All non-workspace states select the same connection-label child (`native/linux/app.zig:672-690`, `native/linux/app.zig:1645-1650`). Provide retry/refresh/configure/details actions as appropriate and keep stale read-only content available where the model permits it.
- **WARNING — Automated accessibility evidence is intentionally incomplete.** The focused check verifies evidence templates and a narrow terminal/attention model contract, then explicitly reports that human observations remain required (`scripts/verify-native.ts:583-607`; `native/tests/accessibility_test.zig:7-29`). A real keyboard and assistive-technology pass is still required for the workspace shell.

---

## Verification and Evidence Notes

- `bun run native:smoke-workspace` — passed against the current tree; production GTK lifecycle and action wiring exercised.
- `bun run native:test:workspace-ui` — passed; model/view behavior only, not pixel or widget-tree verification.
- `bun run native:test:accessibility` — passed; runner explicitly leaves human observations outstanding.
- Phase summary reports prior human GTK UAT (`107-01-SUMMARY.md:25-27`), but no screenshots or observation record were present for independent comparison in this audit.
- Screenshot storage guard created at `.planning/ui-reviews/.gitignore`; no screenshot was produced.

## Recommendation Inventory

- Priority fixes: 3
- Additional warning findings beyond the three priority themes: 17
- Follow-up evidence: light/dark/high-contrast screenshots at default and narrow widths; keyboard-only launcher/sidebar pass; screen-reader inspection of active pair, grouping, attention, connection status, and icon-only controls.

## Files Audited

- `.planning/phases/107-beautify-native-workspace-ui-and-finalize-sidebar-tab-and-te/107-01-SUMMARY.md`
- `.planning/phases/107-beautify-native-workspace-ui-and-finalize-sidebar-tab-and-te/107-01-PLAN.md`
- `.planning/phases/107-beautify-native-workspace-ui-and-finalize-sidebar-tab-and-te/107-CONTEXT.md`
- `native/linux/app.zig`
- `native/linux/workspace_view.zig`
- `native/linux/attention_view.zig`
- `native/linux/command_launcher.zig`
- `native/linux/application.zig`
- `native/tests/workspace_ui_test.zig`
- `native/tests/accessibility_test.zig`
- `native/linux/app_contract_test.zig`
- `scripts/verify-native.ts`
