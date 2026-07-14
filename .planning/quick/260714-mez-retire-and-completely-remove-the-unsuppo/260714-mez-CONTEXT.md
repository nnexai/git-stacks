# Quick Task 260714-mez: Retire the native client - Context

**Gathered:** 2026-07-14
**Status:** Ready for implementation

<domain>
## Task Boundary

Permanently retire the unsupported GTK/Zig/libghostty native client. Preserve its final state only through the annotated `native-client-final-2026-07-14` tag, remove its implementation and maintenance obligations from the active branch, and retain the TypeScript service capabilities required by the web client under generic names.

</domain>

<decisions>
## Implementation Decisions

### Retirement semantics
- This is a permanent product retirement, not a pause or an experimental support tier.
- The active branch must not retain dormant native code, build commands, tests, acceptance documents, delivery requirements, or future macOS obligations.
- Git history and the annotated archive tag are the sole preservation mechanism.

### Supported boundary
- The CLI, TUI, local TypeScript service, web client, browser terminals, workspace operations, and unified signals remain supported.
- TypeScript launch resolution and agent-environment preparation used by browser terminals remain, but must use generic terminal naming.
- The public native-launch endpoint and native-specific discovery capability are removed because the web terminal manager invokes the resolver inside the trusted service process.

### Repository clarity
- Active planning documents are rewritten around the local web client and service.
- Native-only phase artifacts are removed from the active planning tree; useful service and signal outcomes are summarized in current planning rather than retaining native-oriented plans.
- Remaining source, tests, docs, help, and package metadata must not imply that a native application is supported.

</decisions>

<specifics>
## Specific Ideas

- Archive tag: `native-client-final-2026-07-14`
- Primary maintenance reasons: patched Ghostty fork ownership, Zig/Ghostty compatibility, GTK packaging, and macOS build infrastructure.

</specifics>

