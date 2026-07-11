# Native Terminal Accessibility Evidence and Contract

Status: NOT YET OBSERVED

This D-16 contract describes the production Ghostty `GtkGLArea`, not the removed custom renderer. Automated inspection confirms only the GTK properties that the leaf actually exposes. Human GTK Inspector/AT-SPI/Orca evidence is required before stronger claims.

## Automated contract

| Area | Verified production behavior |
| --- | --- |
| GTK accessible role | `GENERIC` (the actual `GtkGLArea` role; it is not presented as a text widget) |
| Accessible name | `git-stacks Ghostty terminal` |
| Description | `Focusable embedded terminal surface` |
| Focus | GTK widget is focusable; focus events are forwarded to the matching Ghostty surface |
| Keyboard and IME | GTK key controllers and `GtkIMContext` forward input/preedit/commit to the matching Ghostty surface |
| Visible cursor/focus | Rendered by Ghostty and reserved for human visual observation |
| Accessible actions | unsupported/unverified; the GL leaf declares none |
| Cell text, caret, selection | unsupported/unverified; no `GtkAccessibleText` implementation is claimed |

The absence of cell text/caret/selection semantics is an upstream embedded-surface limitation, not a passing screen-reader claim. Broken focus, keyboard, or IME behavior remains a git-stacks regression and fails acceptance.

## Human observation identity

- Observer:
- Date:
- Distro/session/compositor:
- GTK version:
- Assistive technology and version:
- GTK Inspector/AT-SPI inspection tool and version:
- Locale and IME:
- Ghostty commit and patch digest:
- Production artifact SHA-256:

## Inspection procedure

1. Launch the exact production artifact with `bun run native:run`.
2. Inspect the focused leaf using GTK Inspector and an AT-SPI inspector.
3. Navigate into and away from it using keyboard and Orca where available.
4. Exercise typing, IME preedit/commit, selection, system clipboard, primary selection, and visible focus/cursor.
5. Record only observed roles, labels, states, actions, events, and spoken output.

## Observed semantics

Use `PASS`, `FAIL`, or `UNSUPPORTED/UNVERIFIED` and attach evidence.

| Contract area | Result | Exact observed semantics / artifact |
| --- | --- | --- |
| Focus enters, leaves, and is reported truthfully | | |
| Generic role, name, description, and state | | |
| Keyboard and IME remain functional with AT enabled | | |
| Selection and clipboard operations remain functional | | |
| Visible focus and Ghostty cursor | | |
| Accessible actions | UNSUPPORTED/UNVERIFIED until observed | |
| Cell-level text, caret, and selection | UNSUPPORTED/UNVERIFIED | No `GtkAccessibleText` implementation is exposed |
| Screen-reader terminal output | UNSUPPORTED/UNVERIFIED until observed | |

## Upstream gaps and regressions

- Upstream/native limitation observed:
- User impact:
- Verified workaround, if any:
- Tracking reference:
- Product regression observed (must be `none` to pass core input/focus):

## Sign-off

- [ ] No claim exceeds attached inspection evidence.
- [ ] Core focus, keyboard, and IME work with AT enabled.
- [ ] Unsupported cell semantics are stated explicitly.
- Overall result: [ ] PASS [ ] FAIL
- Observer signature/reference:
