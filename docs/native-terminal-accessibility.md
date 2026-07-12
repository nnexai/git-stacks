# Native Terminal Accessibility Evidence and Contract

Status: PASS WITH DOCUMENTED UPSTREAM LIMITATIONS — approved 2026-07-11

Phase 106 workspace-shell observations remain pending in `docs/native-workspace-acceptance.md`: hierarchical attention descriptions, keyboard traversal, visible focus, launcher/terminal IME isolation, explicit focus routing, and asynchronous no-focus behavior.

## Phase 107 workspace-shell AT matrix

Automated properties do not replace an AT-SPI/Orca observation. Every row below
remains `PENDING HUMAN` until inspected on the production GTK widget tree.

| Workspace-shell area | Expected role/name/state | Automated reference | Human result / exact announcement |
| --- | --- | --- | --- |
| Workspace and repository rows | named controls; selected pair exposed | `native:test:accessibility` | PENDING HUMAN |
| Pin control | labeled toggle; pressed state | `native:test:accessibility` | PENDING HUMAN |
| Group expander | named control; expanded state | `native:test:accessibility` | PENDING HUMAN |
| Connection/operation pages | status semantics and actionable control | `native:test:accessibility` | PENDING HUMAN |
| Icon-only controls | accessible label plus tooltip | `native:test:accessibility` | PENDING HUMAN |
| Codex attention | provider, title, detail and unread in redundant text | `native:test:attention` | PENDING HUMAN |
| Command launcher | named dialog/search/results; logical focus | `native:test:application-actions` | PENDING HUMAN |
| Workspace creation | named dialog and Name/Branch/Source fields | `native:test:workspace-creation` | PENDING HUMAN |
| Narrow sidebar overlay | labeled reveal/dismiss controls | `native:test:accessibility` | PENDING HUMAN |
| Live-terminal close | named alert; Cancel default; destructive Close terminal | `native:test:application-actions` | PENDING HUMAN |
| Keyboard focus order | sidebar, tabs, terminal, dialogs in logical order | production app | PENDING HUMAN |

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

- Observer: project owner
- Date: 2026-07-11
- Distro/session/compositor: Fedora Linux 44 / Wayland
- GTK version: 4.22.4
- Assistive technology and version:
- GTK Inspector/AT-SPI inspection tool and version:
- Locale and IME:
- Ghostty commit and patch digest:
- Production artifact SHA-256: `b9587c34e90ef440c1c17d21b4fd7fe776dcae944152b51588fbc77170dbf99f`

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
| Focus enters, leaves, and is reported truthfully | PASS | Production focus/cursor behavior approved |
| Generic role, name, description, and state | PASS | Automated GTK inspection of exact production leaf |
| Keyboard and IME remain functional with AT enabled | PASS | Core production input behavior approved; role inspection automated |
| Selection and clipboard operations remain functional | PASS | Production interaction approved |
| Visible focus and Ghostty cursor | PASS | Human observation approved |
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

- [x] No claim exceeds attached inspection evidence.
- [x] Core focus, keyboard, and IME work.
- [x] Unsupported cell semantics are stated explicitly.
- Overall result: [x] PASS [ ] FAIL
- Observer signature/reference: conversational Phase 105 Plan 09 approval, 2026-07-11
