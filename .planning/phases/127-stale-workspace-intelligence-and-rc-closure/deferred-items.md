# Deferred Items

- **Plan 127-06 client presentation modules:** `tests/architecture/phase127-stale-authority.test.mjs` currently has two expected RED failures because `packages/client/src/stale-workspaces.ts`, `packages/web/src/stale-workspaces.ts`, `packages/tui/src/StaleWorkspacesView.tsx`, and the scoped `workspace.stale.refresh` registry entry are assigned to Plan 127-06. Plan 127-05 leaves these contracts intact rather than adding future client/UI authority early.
