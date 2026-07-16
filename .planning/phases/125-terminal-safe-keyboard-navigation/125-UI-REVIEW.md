# Phase 125 — UI Review

**Audited:** 2026-07-16
**Baseline:** `125-UI-SPEC.md`
**Screenshots:** Not captured — no dev server responded on ports 3000, 5173, or 8080; live visual and physical-keyboard judgment remains a Phase 127 pre-tag UAT item
**Executable evidence:** `web-keyboard-overlays` and `web-keyboard-navigation` passed (22 tests)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Search, empty, loading, conflict, save, and attention copy matches the approved contract and stays user-facing. |
| 2. Visuals | 3/4 | The intended modal hierarchy and active-row treatment are present, but narrow-toolbar visibility cannot be established from the string-based harness. |
| 3. Color | 2/4 | Token use is disciplined, but the filled accent CTA and one light-theme warning treatment miss normal-text AA contrast. |
| 4. Typography | 2/4 | Overlay labels and metadata follow the contract, while Phase 125 action buttons inherit an undeclared browser-default size instead of the specified 14px control role. |
| 5. Spacing | 2/4 | Modal/list spacing is mostly coherent, but one new control breaks the 4px scale and the 320px topbar has no proven non-overflow layout. |
| 6. Experience Design | 1/4 | Repeated Enter/click can start the same configured command more than once, and listbox results become individual Tab stops despite the active-descendant contract. |

**Overall: 14/24**

---

## Severity-Ranked Findings

### BLOCKER

1. **Configured-command selection has no one-shot or busy latch.** `mountFuzzyOverlay()` calls `select()` for every Enter keydown without rejecting `event.repeat`, and each result remains clickable (`packages/web/src/overlay-controller.ts:241-269`). The app starts `createTerminal(command.id)` and closes the overlay only after the asynchronous create succeeds (`packages/web/src/app.ts:1271-1277`). A held Enter key or rapid double click can therefore issue multiple terminal-create service operations. Add a synchronous selection latch before invoking the callback, consume repeated Enter without selecting, mark the result region busy/disabled, and make pointer activation use the same latch.

### WARNING — High

2. **The active-descendant listbox also puts every result in the Tab order.** Results are native buttons with `role="option"` (`packages/web/src/overlay-controller.ts:241-251`), and the dialog trap includes every enabled button (`packages/web/src/overlay-controller.ts:55,84-95`). With many results, Tab walks every option even though the UI-SPEC requires the search input to retain DOM focus and result navigation to stay on `aria-activedescendant`. Render non-tabbable options or set `tabIndex = -1`; retain pointer activation and keep Tab limited to dialog controls.

3. **Narrow toolbar discoverability is asserted by CSS presence, not by a layout that guarantees visibility.** The 50px topbar keeps brand, Signals, five toolbar controls, and `Archived` on one non-wrapping flex row (`packages/web/src/app.ts:500`; `packages/web/src/app.css:25-31`). At 640px only `.wide` labels collapse; the brand and full `Archived` label remain and no 320px fallback exists (`packages/web/src/app.css:216-217`). The page itself clips overflow. Add a compact breakpoint that collapses non-critical labels/brand treatment or gives the toolbar an explicit safe layout, then verify 320px and 375px screenshots in Phase 127.

4. **Filled accent and light warning text do not meet normal-text AA contrast.** `#fff` on `#3584e4` is approximately 3.77:1, affecting the primary `Customize shortcuts` CTA through `.button.primary`; light-theme `#a95d00` on `#f2f2f4` is approximately 4.42:1 for 13px shortcut error copy (`packages/web/src/app.css:10-14,18,33,200-203`). Adjust the filled-action and warning token pair to at least 4.5:1 while preserving the approved semantic roles.

### WARNING — Medium

5. **Phase 125 control typography is not pinned to the declared 14px/650 role.** Global buttons inherit the page font without a size or weight, and the new toolbar/settings actions use `.button` (`packages/web/src/app.css:22,31`; `packages/web/src/overlay-controller.ts:508-518,539-543`). In a normal browser this resolves to a 16px regular default, outside the UI-SPEC's four-size/two-weight contract. Set the control role explicitly and keep key caps at 11px/650.

6. **Help always focuses `Customize shortcuts`.** `mountShortcutHelp()` makes the primary CTA the initial and repeated focus target (`packages/web/src/overlay-controller.ts:336-347`), while the UI-SPEC calls for invoker-aware focus and a safe close/content action when no prior invoker exists. Pass the invoking control/focus context into the renderer and choose the initial target according to the contract.

### WARNING — Low

7. **The alias-removal control breaks the declared 4px spacing scale.** `.shortcut-remove` introduces `3px 6px` padding (`packages/web/src/app.css:196`). Use a declared-scale combination such as `4px 8px` and confirm the resulting touch/click target remains adequate.

---

## Top 3 Priority Fixes

1. **Make configured-command activation one-shot** — prevents duplicate terminal/service creation from held Enter or rapid pointer activation.
2. **Remove result options from the Tab sequence** — restores the specified combobox/listbox active-descendant interaction and keeps large result sets navigable.
3. **Prove and repair the 320px/375px toolbar layout** — ensures `Next attention` and `Keyboard shortcuts` remain visibly reachable rather than merely present in the DOM.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- Search inputs and zero/no-match states use the exact approved strings (`packages/web/src/app.ts:1208-1212,1250-1254`).
- Shortcut loading, unsafe capture, conflict, saving, failure, and retry copy follows the contract and never exposes action IDs or service method names (`packages/web/src/overlay-controller.ts:370-381,423-456,520-533`).
- Action naming remains sentence case and verb-object oriented. `Unbound` is explicitly rendered rather than leaving a blank binding cell (`packages/web/src/overlay-controller.ts:310-319`).

### Pillar 2: Visuals (3/4)

- The singleton overlay retains the approved geometry and hierarchy: one backdrop, bordered panel, fixed header, scrollable body, and named close control (`packages/web/src/overlay-controller.ts:101-161`; `packages/web/src/app.css:154-160`).
- Search results provide a two-line hierarchy, one accent-backed active row, muted metadata, truncation, and full-value title text (`packages/web/src/overlay-controller.ts:239-254`; `packages/web/src/app.css:175-184`).
- Shortcut help/settings use grouped rows, key caps, capture highlighting, and inline state treatment (`packages/web/src/app.css:185-204`).
- Visual score is capped because no rendered screenshot was available and the narrow-toolbar structure has a credible clipping risk described above.

### Pillar 3: Color (2/4)

- Phase 125 uses the established semantic tokens instead of introducing arbitrary feature colors. Active selection uses accent, attention uses warning, and errors include text rather than relying on color alone (`packages/web/src/app.css:38,179,188,202-203`).
- WARNING: the approved/implemented `--accent` plus `--accent-text` pair is only about 3.77:1, below 4.5:1 for the CTA's normal-size text (`packages/web/src/app.css:10-11,33`).
- WARNING: the light-theme warning treatment is about 4.42:1 on the modal panel, narrowly below 4.5:1 for 13px text (`packages/web/src/app.css:18,200-203`).

### Pillar 4: Typography (2/4)

- Headings, result labels, metadata, key caps, and inline status copy use the specified 17/14/13/11px scale and regular/650 hierarchy (`packages/web/src/app.css:157,181-204`).
- WARNING: the new toolbar and settings action buttons inherit an unspecified user-agent size/weight from `button { font: inherit; }`, rather than declaring the 14px/650 control role (`packages/web/src/app.css:22,31`).

### Pillar 5: Spacing (2/4)

- Result rows, empty states, modal body, groups, and binding controls predominantly follow the 4/8/16/24/32px scale (`packages/web/src/app.css:158,175-200`).
- WARNING: `.shortcut-remove` uses undeclared 3px/6px padding (`packages/web/src/app.css:196`).
- WARNING: the narrow toolbar has no wrap/overflow/collapse strategy beyond hiding `.wide`, so the specified discoverability at the smallest supported widths remains unproven (`packages/web/src/app.css:217`).

### Pillar 6: Experience Design (1/4)

- BLOCKER: asynchronous command selection can be submitted multiple times before the overlay closes; the harness covers one Enter only and does not exercise `repeat` or double activation (`tests/service/web-keyboard-overlays.test.ts:196-220,231-251`).
- WARNING: listbox options are tabbable buttons and the focus trap includes them, contradicting the input-retained active-descendant interaction (`packages/web/src/overlay-controller.ts:55,84-95,241-251`).
- Positive evidence: the controller maintains one backdrop/listener, contains Escape/Tab, preserves the original return target, and blocks replacement of exclusive confirmations (`packages/web/src/overlay-controller.ts:70-170`; `tests/service/web-keyboard-overlays.test.ts:154-194`).
- Positive evidence: authoritative settings expose loading/error/retry, conflict-safe capture, per-row busy/failure feedback, reset, unbind, aliases, and response-only state replacement (`packages/web/src/overlay-controller.ts:360-564`).

---

## Evidence Boundary

The native-DOM harness establishes structure, event routing, copy, service intents, and focus-controller behavior. It does not render real xterm, compute CSS layout, prove contrast under browser/theme rendering, or validate physical keyboard/IME behavior. Desktop/narrow screenshots, real focus traversal, xterm pass-through, and human visual approval remain explicitly deferred to Phase 127 before tagging.

No `components.json` exists and the UI-SPEC lists no third-party blocks, so the registry safety audit is not applicable.

---

## Files Audited

- `.planning/phases/125-terminal-safe-keyboard-navigation/125-CONTEXT.md`
- `.planning/phases/125-terminal-safe-keyboard-navigation/125-UI-SPEC.md`
- `.planning/phases/125-terminal-safe-keyboard-navigation/125-01-PLAN.md` through `125-05-PLAN.md`
- `.planning/phases/125-terminal-safe-keyboard-navigation/125-01-SUMMARY.md` through `125-05-SUMMARY.md`
- `packages/web/src/app.ts`
- `packages/web/src/app.css`
- `packages/web/src/overlay-controller.ts`
- `packages/web/src/navigation.ts`
- `tests/service/web-keyboard-overlays.test.ts`
- `tests/service/web-keyboard-navigation.test.ts`
