# Stack Research

**Domain:** Native desktop workspace client with embedded terminal surfaces
**Researched:** 2026-07-11
**Confidence:** HIGH for the host toolkits and service stack; MEDIUM for full libghostty embedding because its public API is explicitly pre-1.0 and still changing

## Recommendation in One Sentence

Keep the existing Bun/TypeScript workspace engine behind a versioned localhost HTTP/JSON + SSE service, build a small shared Zig application-model/terminal-adapter library with an opaque C ABI, implement Linux first in Zig against GTK4/libadwaita and libghostty's Zig module, and prove macOS with SwiftUI/AppKit importing that C ABI.

## Recommended Stack

### Core Technologies

| Technology | Version / pin | Purpose | Why Recommended |
|------------|---------------|---------|-----------------|
| Bun | Existing repo runtime; keep the lockfile/runtime pin (Bun 1.3 generation) | Authoritative git-stacks service process | Reuses the production workspace engine instead of porting YAML, Git, environment, and lifecycle policy. `Bun.serve` supports streaming responses and Unix sockets, but use loopback TCP for the first cross-platform transport so both Swift `URLSession` and Linux HTTP clients work without platform-specific socket adapters. |
| TypeScript | Existing `6.0.2` | Service handlers, DTOs, progress, and event production | This is the repository's implementation language and preserves the CLI/TUI as peers of the new service rather than replacing them. |
| Zod | Existing `4.3.6` | Runtime validation and versioned wire schemas | The native boundary must reject malformed or incompatible requests. Derive JSON Schema/OpenAPI artifacts from the canonical service schemas rather than hand-maintaining a second contract. |
| Zig | `0.15.2` for the Ghostty 1.3.x pin | Shared application model, C ABI, and libghostty adapter | Ghostty 1.3.x is guaranteed against Zig 0.15.2, and its Linux GUI compiles the Zig libghostty module directly. Zig can expose a narrow, ownership-explicit C ABI that Swift and C-compatible GTK code can consume. |
| libghostty | Exact upstream commit, initially the `v1.3.1` commit `22efb0be…`; no semver range | Terminal core, renderer, PTY surfaces | Ghostty 1.3.1 is the current stable desktop release, but libghostty has no independently tagged release and its API signatures remain in flux. An exact commit plus a repo-owned adapter is mandatory. Upgrade only through an explicit compatibility spike. |
| GTK | `>=4.14,<5` | Linux application/widget toolkit | Matches Ghostty 1.3's supported floor and provides the event, accessibility, focus, clipboard, and native rendering integration a real terminal surface needs. Do not target whatever happens to be the newest GTK API if it raises the distro floor. |
| libadwaita | `>=1.5,<2` | Linux application shell and GNOME-native navigation | Matches Ghostty 1.3's floor and supplies modern application/window/navigation patterns. Keep the terminal surface a GTK widget owned by the adapter; libadwaita should own surrounding chrome only. |
| Swift / SwiftUI | Xcode toolchain for macOS 13 during the 1.3.1 proof | macOS shell, navigation, and state presentation | Ghostty's own macOS app validates this native combination. SwiftUI is appropriate for the shell while terminal rendering/input remains an AppKit view. Ghostty 1.4 is expected to raise its floor to macOS 14, so a later libghostty upgrade may force the same decision. |
| AppKit | Platform SDK paired with Xcode | Terminal host view, focus, keyboard/IME, clipboard, Metal layer lifecycle | `NSViewRepresentable` is Apple's supported bridge for hosting an `NSView` in SwiftUI and provides explicit create/update/teardown hooks. This is a better boundary than trying to implement a terminal renderer as a pure SwiftUI view. |

### Supporting Libraries and Protocols

| Library / protocol | Version | Purpose | When to Use |
|--------------------|---------|---------|-------------|
| HTTP/1.1 over `127.0.0.1` | Versioned `/v1` API | Queries and bounded mutations | Use JSON request/response DTOs, an ephemeral port, a per-launch bearer token, and strict origin/host checks. Bind loopback only. Do not expose the service to the LAN. |
| Server-Sent Events | `/v1/events` | Progress and structured agent-attention stream | Use for one-way ordered events, replay IDs, heartbeats, and reconnect. It is simpler than WebSocket for a client that sends mutations through ordinary HTTP requests. Disable Bun's per-request idle timeout for this stream. |
| OpenAPI 3.1 / JSON Schema | Generated artifact, checked in | Language-neutral wire contract and fixtures | Generate from the TypeScript/Zod source of truth and use it for contract tests and native DTO generation or validation. Do not make generated native DTOs the shared behavioral model. |
| libsoup | `3.x` | Linux HTTP and SSE client | Integrates naturally with GLib's main loop. Keep it below a transport interface so protocol fixtures can be tested without GTK. |
| Foundation `URLSession` | macOS platform SDK | macOS HTTP and SSE client | Suitable for the architectural proof over loopback HTTP; parse SSE incrementally from response bytes and reconnect using event IDs. |
| GLib/GIO | Version implied by GTK 4.14 | Linux main loop, actions, settings, process integration | Marshal all UI/model notifications onto the main context. Never invoke GTK from libghostty or network worker threads. |
| Meson | Current distro-supported release | Linux native shell build/packaging | Use as the outer Linux build only if it can invoke a pinned Zig build reproducibly; otherwise use Zig as the top-level build. Avoid maintaining two independent dependency graphs. |
| Swift Package Manager / Xcode project | Current Xcode | macOS proof build | Import the adapter through a module map/XCFramework or a statically linked library with generated header. Keep the proof intentionally thin. |

### Development and Verification Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Zig build system | Build libghostty, the shared model, adapter, and C header | Treat the Ghostty source commit and Zig compiler as a compatibility pair. Record both in a lock/manifest. |
| `pkg-config` | Resolve GTK4, libadwaita, and libsoup on Linux | CI should test the declared minimums (GTK 4.14, libadwaita 1.5), not only a rolling distro. |
| Bun test | Service schema, authorization, cancellation, progress, and replay tests | Add golden JSON fixtures that are consumed by Zig and Swift tests too. |
| AddressSanitizer / Valgrind where supported | C ABI lifetime and callback verification | Exercise create/destroy, tab churn, callbacks after teardown, resize storms, and service reconnects. |
| Sysprof and Instruments | UI/render performance and leak investigation | Profile frame pacing and terminal churn on real GTK/OpenGL and AppKit/Metal paths before expanding to splits. |

## Boundary Design Implied by the Stack

The stack should have three independently testable seams:

1. **Service contract (TypeScript):** workspace facts and mutations only. It resolves workspace/repository paths, environment, ports, named commands, progress, and attention targets. It never owns PTYs or terminal tabs.
2. **Shared native model (Zig with C ABI):** consumes versioned DTOs and emits deterministic model actions. Export opaque handles, explicit retain/release or create/destroy calls, copied strings/slices with documented lifetime, and callback registration/unregistration. Do not expose Zig structs in the ABI.
3. **Platform terminal adapter:** owns libghostty objects and translates GTK or AppKit lifecycle/input/rendering into the pinned upstream API. Neither frontend calls raw libghostty symbols outside this adapter.

The first compatibility deliverable must be a two-platform adapter spike: one interactive GTK surface and one `NSViewRepresentable`-hosted AppKit surface, each proving input, resize/DPI, clipboard, IME, teardown, and a command launched with a service-resolved `cwd` and environment. Do not build workspace navigation on top until this passes.

## Installation / Build Shape

```bash
# Existing service dependencies remain owned by the repository lockfile.
bun install --frozen-lockfile

# Linux native development floor (package names vary by distribution).
# Required capabilities: zig 0.15.2, gtk4 >= 4.14, libadwaita >= 1.5,
# libsoup 3, pkg-config, gettext, and a C toolchain.

# Build the pinned native core and adapter.
zig build -Doptimize=Debug

# Run service and native contract fixtures independently of the GUI.
bun test
zig build test
```

Do not install `libghostty` from an unversioned system package and do not follow its `main` branch in normal builds. Vendor it as a locked source dependency or use a reproducibly fetched commit with its checksum.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Zig shared model + opaque C ABI | Duplicate Swift and Linux application models | Only if the shared model collapses to trivial generated DTOs with no state transitions. For persistent tabs, attention routing, and lifecycle, duplication will drift. |
| Zig GTK frontend using the libghostty Zig module | C/Rust GTK app calling the current C embedding API | Reconsider after libghostty publishes a stable, platform-complete C release. At 1.3.1 the header itself describes the embedding API as undocumented and primarily consumed by macOS. |
| SwiftUI shell + AppKit terminal view | Pure AppKit application | Use pure AppKit if SwiftUI focus/layout behavior blocks correct terminal interaction; the proof should preserve this escape hatch. |
| Loopback HTTP/JSON + SSE | Unix-domain-socket-only HTTP | Prefer UDS later for Linux hardening if both native transports are implemented. It is not the first common denominator because Foundation does not provide a direct URLSession UDS transport. |
| SSE for events | WebSocket | Use WebSocket only if later requirements need high-frequency bidirectional messages on one connection. Current mutations remain ordinary HTTP and events are server-to-client. |
| Service-owned workspace semantics | Native YAML parsing or CLI screen scraping | Never for this milestone. CLI output is presentation-oriented and direct YAML access creates a second mutation engine. |
| libghostty | VTE/`GtkTerminal`, xterm.js, or a homegrown VT renderer | Use VTE only as a temporary diagnostic fallback if the libghostty GTK adapter is proven infeasible. Using a different terminal engine defeats the milestone's compatibility proof; xterm.js adds a browser runtime; a custom renderer repeats the failed complexity identified by the PTY spike. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| A floating libghostty dependency or Ghostty `main` | libghostty has no tagged standalone version and explicitly allows API churn | Pin one commit and isolate it behind compile-time adapter tests. |
| Assuming the current C embedding header is a ready-made Linux widget API | The 1.3.1 header says it is not a general-purpose documented embedding API and identifies the macOS app as its consumer; the Linux app compiles the Zig module directly | Use the Zig module for Linux and prove the GTK host adapter before roadmap expansion. |
| GTK 3, Libhandy, `GtkTreeView`, or old dialog APIs | They are legacy/deprecated paths and create immediate migration work | GTK4 list models/views and libadwaita 1.5 APIs. |
| Electron/Tauri/webview for the native client | Adds a browser/web rendering layer without helping the libghostty GTK/AppKit integration and weakens platform-native input/focus behavior | GTK4/libadwaita on Linux and SwiftUI/AppKit on macOS. |
| Bun FFI directly from both GUIs into the workspace engine | Couples native lifetime/thread rules to JavaScript runtime internals and bypasses a versioned machine contract | A separate Bun service with validated DTOs. |
| Exposing raw pointers, Zig enums, allocator-owned slices, or callbacks without teardown rules across the C boundary | ABI/layout and lifetime changes will become crashes rather than compiler errors | Opaque handles, fixed-width values, explicit ownership, status/error objects, and adapter-controlled callbacks. |
| Persisting terminal state in git-stacks YAML | Violates the authoritative-engine boundary and mixes client session concerns with workspace configuration | Client-owned state storage keyed by stable workspace/repository IDs. |

## Stack Patterns by Variant

**Linux first usable slice:**

- Compile the native client in Zig, import the exact libghostty Zig module, and call GTK4/libadwaita through the same generation/binding strategy proven by Ghostty.
- Put workspace navigation around one adapter-owned terminal widget before implementing multiple tabs and splits.
- Target GTK 4.14 and libadwaita 1.5 APIs even when developing on newer GNOME releases.

**macOS architectural proof:**

- Import only the shared C header and terminal adapter into Swift.
- Host the terminal `NSView` through `NSViewRepresentable`; use a coordinator for callbacks and `dismantleNSView` for deterministic teardown.
- Validate the shared service/model contract and one real terminal surface; defer parity, restoration polish, and native window/tab behaviors.

**If libghostty publishes a stable standalone release before implementation:**

- Re-evaluate the pin and its C API, but upgrade only after the same GTK/AppKit compatibility suite passes.
- Preserve the adapter even if the upstream API stabilizes; it is still the product's boundary for configuration and lifecycle policy.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Ghostty/libghostty at `v1.3.1` commit | Zig `0.15.2` | Ghostty guarantees each release against a specific Zig version; newer or older compilers may fail. |
| Ghostty 1.3.x Linux path | GTK `>=4.14`, libadwaita `>=1.5` | These are the official 1.3 system floors. Develop against the floor and test newer GTK renderers separately. |
| Ghostty 1.3.x macOS | macOS `>=13` | 1.3 is the last line supporting macOS 13; planned 1.4 tip/release work raises the floor to macOS 14. |
| Shared C ABI | Swift and GTK/Zig callers | Freeze an application-owned ABI version independent of libghostty's version. ABI compatibility tests should compile both consumers against the installed/generated header. |
| Bun SSE endpoint | Bun server idle timeout | Explicitly disable the request timeout for the event stream and send heartbeats; the documented default can terminate quiet streams. |

## Confidence and Open Risks

| Finding | Confidence | Evidence / implication |
|---------|------------|------------------------|
| GTK4/libadwaita and SwiftUI/AppKit are the correct native shells | HIGH | Official Ghostty and platform documentation use these exact platform stacks. |
| Bun/TypeScript should remain the workspace service | HIGH | It is the current production engine; Bun officially supports streaming HTTP and local sockets. |
| Zig is the correct shared/adaptation layer | HIGH | It matches libghostty's primary module and can generate a C-compatible boundary. |
| A complete Linux libghostty embedding can be delivered without upstream changes | MEDIUM | The Zig module is described as full-featured and Ghostty's Linux GUI uses it, but the standalone C embedding surface is still work in progress. The first phase must prove this empirically. |
| One identical binary-level terminal API can be used unchanged on Linux and macOS | LOW; do not assume | Current upstream integration paths differ. Share the product model and product-owned ABI, but allow platform-specific libghostty adapters underneath. |

## Sources

- [Ghostty 1.3.0 release notes](https://ghostty.org/docs/install/release-notes/1-3-0) — current libghostty status, standalone Zig module, work-in-progress C API, GTK/libadwaita floors, macOS support policy. **HIGH confidence (official primary source).**
- [Ghostty release index](https://ghostty.org/docs/install/release-notes) — verified 1.3.1 as the current published stable release on 2026-07-11. **HIGH confidence.**
- [Ghostty repository](https://github.com/ghostty-org/ghostty) — verified current tags, the `v1.3.1` commit, examples, C header warnings, and the 0.15.2 Zig requirement. **HIGH confidence (official source repository).**
- [Ghostty build documentation](https://ghostty.org/docs/install/build) — exact Zig pairing and Linux build dependencies. **HIGH confidence.**
- [Ghostty Linux support policy](https://ghostty.org/docs/linux) — supported GTK and libadwaita minimums. **HIGH confidence.**
- [About Ghostty](https://ghostty.org/docs/about) — confirms Swift/AppKit/SwiftUI on macOS and Zig/GTK4 on Linux, with libghostty still unstable. **HIGH confidence.**
- [Bun server documentation](https://bun.sh/docs/runtime/http/server) — streaming responses, Unix sockets, server lifecycle, and timeout behavior. **HIGH confidence.**
- [Bun Unix-socket fetch documentation](https://bun.sh/docs/guides/http/fetch-unix) — confirms Bun client support while informing the transport alternative. **HIGH confidence.**
- [GTK4 documentation](https://docs.gtk.org/gtk4/) and [GTK drawing model](https://docs.gtk.org/gtk4/drawing-model.html) — current widget/rendering model and deprecated API boundaries. **HIGH confidence.**
- [GNOME 49 developer notes](https://release.gnome.org/49/developers/) — current stable GTK 4.20/libadwaita 1.8 context; intentionally not selected as the minimum deployment floor. **HIGH confidence.**
- [Apple `NSViewRepresentable`](https://developer.apple.com/documentation/swiftui/nsviewrepresentable) — supported AppKit-in-SwiftUI creation, coordination, layout, and teardown lifecycle. **HIGH confidence.**

---
*Stack research for: git-stacks v0.20.0 Native Workspace Client*
*Researched: 2026-07-11*
