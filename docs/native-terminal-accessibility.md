# Native Terminal Accessibility Evidence and Contract

Status: NOT YET OBSERVED

The widget inherits the supported Ghostty `font-family` and `font-size` subset described in `native-terminal-acceptance.md`; accessibility observations must be made using the resolved font reported by readiness evidence. Other Ghostty configuration remains unsupported.

This D-16 contract must describe only behavior observed on the exact pinned stack. Cell-level screen-reader output remains **unsupported/unverified** unless the attached inspection demonstrates otherwise. Misleading claims or broken core focus/input behavior fail acceptance.

## Observation identity

- Observer:
- Date:
- Distro/session/compositor:
- GTK/libadwaita versions:
- Assistive technology and version:
- Accessibility inspection tool and version:
- Locale and IME:
- Ghostty peeled commit/build identifier:

## Inspection procedure

1. Launch the exact production terminal with `bun run native:run` in the real graphical session recorded above.
2. Inspect the GTK accessibility tree with Accerciser, GTK Inspector, or the named equivalent.
3. Navigate into and away from the terminal using keyboard and assistive technology.
4. Exercise IME preedit/commit, selection, both clipboard paths, and visible focus.
5. Record exposed roles, labels, actions, state changes, spoken output, and gaps below.

## Observed semantics

Use `PASS`, `FAIL`, or `UNSUPPORTED/UNVERIFIED`; attach evidence for every claim.

| Contract area | Result | Exact observed semantics / artifact |
| --- | --- | --- |
| Focus enters, leaves, and is reported truthfully | | |
| Labels, roles, states, and actions | | |
| Keyboard and IME remain functional with AT enabled | | |
| Selection and clipboard operations | | |
| Visible focus indication | | |
| Cell-level screen-reader output | UNSUPPORTED/UNVERIFIED until observed | |

## Known limitations

- Upstream/native limitation observed:
- User impact:
- Workaround, if verified:
- Tracking reference:

## Failure rules and sign-off

- [ ] No claim exceeds the attached observation.
- [ ] Core focus, keyboard, and IME behavior works; otherwise the run is FAIL.
- [ ] Unsupported cell-level semantics are stated explicitly.
- Overall result: [ ] PASS [ ] FAIL
- Observer signature/reference:
