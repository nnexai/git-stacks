# Phase 107-01 Summary

## Delivered

- Projects workspace labels through the authenticated snapshot contract and decodes them in the native client.
- Renders pinned workspaces separately and groups remaining workspaces by collapsible label or repository sections.
- Uses direct rows for single-repository workspaces and explicit repository targets for multi-repository workspaces.
- Preserves and visibly highlights the selected workspace-repository pair.
- Uses Ghostty title events for live terminal titles, compacts long automatic titles, and supports pinned manual overrides.
- Applies native sidebar hierarchy, icons, spacing, hover/selection states, and active grouping controls.
- Publishes provider-specific, surface-addressed agent notifications through a real authenticated CLI/service path and shows unread sidebar badges.
- Guarantees null-terminated native launch environment identity values for hook routing.

## Verification

- `bun run native:verify` — passed.
- Repeated `bun run native:smoke-workspace` — passed after the initial observed race; three subsequent lifecycle runs and the final focused run passed.
- `bun run native:test:workspace-ui` — passed.
- `bun run typecheck` — passed.
- `bun run test:deps` — passed.
- `bun run verify:gates` — passed.
- `bun run test` — 769 unit tests passed; integration runner completed without a reported failure.
- Final post-UAT `bun run native:verify`, `bun run typecheck`, `bun run test:deps`, and `bun run verify:gates` — passed.

## Human acceptance

Human GTK UAT confirmed the final environment and notification flow looked correct after the selected-row, grouping, pinning, title-update, close-target, provider-copy, and identity-routing repairs.
