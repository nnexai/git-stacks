# Deferred Items

- **Phase 127 renderer boundary:** The full `phase127-cross-client-conformance` and stale-authority architecture suites retain expected RED assertions for `packages/web/src/stale-workspaces.ts`, `packages/tui/src/StaleWorkspacesView.tsx`, and active stale-view refresh routing. Those renderer integrations belong to Plans 127-07 and 127-08; Plan 127-06 leaves their contracts intact rather than adding placeholders or renderer authority early.
- **Pre-existing OpenTUI listener warning:** `tests/tui/dashboard/WorkspaceParity.test.tsx` passes all 16 tests but emits repeated `Possible EventTarget memory leak detected` warnings for `TerminalConsoleCache`. Plan 127-06 does not alter that cache or listener lifecycle.
