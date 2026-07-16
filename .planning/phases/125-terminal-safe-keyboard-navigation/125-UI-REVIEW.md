# Phase 125 — UI Review

**Audited:** 2026-07-16 (final independent re-audit after repairs through `96554191` and `fd12f7f6`)
**Baseline:** `125-UI-SPEC.md`
**Status:** Passed — automated UI contract complete; no blocker or source-level warning remains, with live Phase 127 evidence pending
**Screenshots:** Not captured — no dev server responded on ports 3000, 5173, or 8080
**Executable evidence:** `web-keyboard-overlays`, `web-keyboard-navigation`, and `web-shortcut-authority` passed (41 tests); `@git-stacks/web` typecheck and production web build passed

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Search, empty, loading, conflict, recovery, save, and attention copy remains specific, actionable, and free of internal IDs. |
| 2. Visuals | 3/4 | Modal hierarchy, active rows, busy state, and compact-toolbar geometry are implemented; rendered 320px/375px judgment remains a Phase 127 checkpoint. |
| 3. Color | 4/4 | The repaired accent and warning pairs exceed 4.5:1 while retaining semantic token use and non-color labels. |
| 4. Typography | 4/4 | Global actions, bare `Unbound` binding controls, labels, metadata, and key caps use the declared size/weight roles. |
| 5. Spacing | 4/4 | Alias controls, binding controls, and key caps now use scale-aligned 4px/8px geometry. |
| 6. Experience Design | 3/4 | One-shot activation, active-descendant Tab behavior, focus, replacement, stale recovery, and owner conflicts are executable; real xterm/physical-keyboard behavior remains Phase 127 UAT. |

**Overall: 22/24**

---

## Prior Finding Resolution

| Prior finding | Resolution | Evidence |
|---------------|------------|----------|
| Configured-command Enter/click could submit more than once | **Resolved** | Selection latches synchronously, marks the list busy, disables pointer rows, ignores repeated Enter, and unlocks after settlement (`packages/web/src/overlay-controller.ts:209-234,272-307`). The deferred-promise test sends Enter, repeated Enter, another Enter, and click and observes one callback (`tests/service/web-keyboard-overlays.test.ts:257`). |
| Listbox options were Tab stops | **Resolved** | Every option receives `tabindex="-1"`; the dialog selector excludes `-1`, while input focus retains `aria-activedescendant` (`packages/web/src/overlay-controller.ts:57,85-99,236-288`). The harness proves Tab moves from the combobox to the named close control (`tests/service/web-keyboard-overlays.test.ts:251`). |
| 320px/375px toolbar could clip | **Resolved in source; live check retained** | At 400px and below, brand copy collapses, Signals and all five toolbar actions become 32px controls, gaps shrink, and labels remain in `aria-label`/`title` (`packages/web/src/app.css:217-218`; `packages/web/src/app.ts:502`). The fixed compact footprint is approximately 257px including topbar padding/gaps, leaving 63px at 320px and 118px at 375px. Screenshot judgment remains Phase 127. |
| Filled accent and light warning text missed AA | **Resolved** | `#ffffff` on `#1c71d8` is 4.769:1; light `#995400` on `#f2f2f4` is 5.185:1 and on `#ffffff` is 5.797:1 (`packages/web/src/app.css:10-19`). The test computes WCAG relative luminance instead of asserting token strings (`tests/service/web-keyboard-overlays.test.ts:599-619`). |
| Phase 125 controls lacked 14px/650 typography | **Resolved** | `.button` and `.shortcut-binding-button` now both pin 14px/650/1.3, while nested key caps retain 11px/650 (`packages/web/src/app.css:31,192-194`; `tests/service/web-keyboard-overlays.test.ts:616-618`). |
| Help always focused `Customize shortcuts` | **Resolved** | Help chooses `Close help` when there is no invoker and the first content action when invoked from a valid prior focus context (`packages/web/src/overlay-controller.ts:370-388`; `packages/web/src/app.ts:1293-1311`). Both paths are executable (`tests/service/web-keyboard-overlays.test.ts:357`). |
| Alias removal used 3px/6px | **Resolved** | `.shortcut-remove` uses `4px 8px` and retains a 32px minimum height (`packages/web/src/app.css:196`; `tests/service/web-keyboard-overlays.test.ts:619`). |
| Key-cap padding used off-scale 3px/5px | **Resolved** | Key caps now use scale-aligned `4px 8px` padding while retaining 11px/650 monospace text and 22px minimum geometry (`packages/web/src/app.css:192`; `tests/service/web-keyboard-overlays.test.ts:618`). |

The related interaction repairs also hold: compatible shortcut surfaces replace each other while capture stays exclusive (`tests/service/web-keyboard-overlays.test.ts:198`); stale revisions reload authoritative settings before an explicit retry (`packages/web/src/navigation.ts:250-277`; `tests/service/web-keyboard-overlays.test.ts:439-470`); and a true owner collision keeps capture active, names the pre-existing owner inline, preserves bindings, and offers no retry loop (`packages/web/src/overlay-controller.ts:447-477`; `tests/service/web-keyboard-overlays.test.ts:473-504`).

---

## Final Finding Status

No blocker, high, medium, or low automated UI finding remains. The final source and executable pass closed both prior cleanup warnings and verified that owner conflicts are distinct from stale revisions: owner collisions stay inline without a retry action, while only stale revisions enter the refresh-and-retry path.

---

## Remaining Phase 127 Verification Checkpoints

1. **Capture desktop, 375px, and 320px browser screenshots** — confirm toolbar visibility, key-cap density, modal hierarchy, and theme rendering.
2. **Exercise real xterm focus and Tab traversal** — confirm overlay open/replacement/close behavior and PTY pass-through in the actual browser surface.
3. **Exercise physical non-US keyboard and IME/AltGraph input** — confirm the production event boundary matches the automated contract before tagging.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- Workspace and command search inputs, zero states, and no-match states retain the approved strings (`packages/web/src/app.ts:1213-1217,1255-1259`).
- Loading, unsafe capture, conflict, authoritative refresh, generic save failure, retry, saving, and success messages state the condition and recovery without service method names or stable IDs (`packages/web/src/overlay-controller.ts:411-423,431-477,480-535,598-606`).
- Action labels remain sentence case and verb-object oriented; `Unbound` is always explicit (`packages/web/src/overlay-controller.ts:316-368`).

### Pillar 2: Visuals (3/4)

- One modal frame retains the approved geometry, hierarchy, named close affordance, fixed header, and internally scrollable body (`packages/web/src/overlay-controller.ts:103-166`; `packages/web/src/app.css:154-160`).
- Results preserve the two-line hierarchy, one accent-backed active row, muted metadata, truncation, and full-value title (`packages/web/src/overlay-controller.ts:236-290`; `packages/web/src/app.css:175-184`).
- Busy selection is visually and semantically projected through `aria-busy`, disabled rows, and the existing disabled treatment (`packages/web/src/overlay-controller.ts:209-234`; `packages/web/src/app.css:37`).
- The compact breakpoint has sufficient deterministic fixed-width geometry in source, but this pillar remains capped at 3 because no rendered screenshot was available.

### Pillar 3: Color (4/4)

- The repaired token pairs exceed normal-text AA: accent/white 4.769:1, light warning/panel 5.185:1, light warning/panel-2 5.797:1, and dark warning/panel 9.749:1 (`packages/web/src/app.css:10-19`).
- Accent remains reserved for active selection, primary action, and capture; warnings remain warning-colored and include explanatory text (`packages/web/src/app.css:33,38,179,188,199,202-203`).
- The executable contrast test parses current CSS tokens and calculates sRGB relative luminance (`tests/service/web-keyboard-overlays.test.ts:599-619`).

### Pillar 4: Typography (4/4)

- The global Phase 125 action-control role now uses the declared 14px/650/1.3 values (`packages/web/src/app.css:31`).
- Bare `Unbound` controls now explicitly use 14px/650/1.3, while nested key caps retain the declared 11px/650 monospace role (`packages/web/src/app.css:192-194`).
- Headings, labels, body/status text, and metadata stay within the 17/14/13/11px and 650/400 contract (`packages/web/src/app.css:157,181-204`).

### Pillar 5: Spacing (4/4)

- Result rows, modal body, group spacing, setting rows, and binding controls predominantly use the declared 4/8/16/24/32px scale (`packages/web/src/app.css:158,175-200`).
- Alias removal, binding buttons, chord gaps, and key caps now use scale-aligned 4px/8px values (`packages/web/src/app.css:190-196`).
- Key caps preserve usable minimum geometry and semibold metadata text after the spacing repair (`packages/web/src/app.css:192`).

### Pillar 6: Experience Design (3/4)

- Async result activation is one-shot across held Enter, rapid Enter, and pointer activation; failure/settlement coherently unlocks the region (`packages/web/src/overlay-controller.ts:209-234,294-307`; `tests/service/web-keyboard-overlays.test.ts:257-294`).
- Search input retains DOM focus and list navigation stays on `aria-activedescendant`; result options are removed from Tab order while pointer interaction remains available (`packages/web/src/overlay-controller.ts:236-312`; `tests/service/web-keyboard-overlays.test.ts:251-254`).
- Compatible overlays replace in place, capture is dynamically exclusive, and help initial focus follows invoker context (`packages/web/src/overlay-controller.ts:103-175,370-388`).
- Stale revisions refresh authority before explicit retry, while owner collisions preserve the prior state, keep capture active, name the actual owner, and render no retry action (`packages/web/src/navigation.ts:162-184,250-277`; `packages/web/src/overlay-controller.ts:447-477`; `tests/service/web-keyboard-overlays.test.ts:439-504`).
- Automated evidence is comprehensive, but real xterm ownership, terminal focus restoration, physical non-US keys, composition/AltGraph, and narrow rendered layout remain Phase 127 human UAT; this boundary caps the score at 3 rather than representing those behaviors as visually approved.

---

## Evidence Boundary

The native-DOM harness establishes structure, event routing, one-shot mutation behavior, focus-controller policy, copy, and service intents. The CSS pass establishes token values and deterministic compact minimum geometry. It does not render real xterm, compute browser layout, validate physical keyboard/IME behavior, or supply human visual judgment.

Phase 127 must therefore retain desktop and 320px/375px screenshots, real Tab traversal, xterm pass-through, terminal focus restoration, and physical keyboard/IME checks before tagging. Those are verification checkpoints, not unresolved Phase 125 blocker/high defects.

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
- `packages/protocol/src/web.ts`
- `packages/service/src/secure/router.ts`
- `tests/service/web-keyboard-overlays.test.ts`
- `tests/service/web-keyboard-navigation.test.ts`
- `tests/service/web-shortcut-authority.test.ts`
