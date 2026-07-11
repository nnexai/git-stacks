---
spike: 004b
name: pinned-internal-gtk-integration
type: comparison
validates: "Given pinned Ghostty 1.3.1, when its internal GTK modules are consumed as source, then git-stacks can host a real terminal while retaining its existing adapter and exclusive process-ownership contract"
verdict: INVALIDATED
related: [004a]
tags: [ghostty, linux, gtk, zig]
---

# Spike 004b: Pinned Internal GTK Integration

## What This Validates

Whether Ghostty 1.3.1's internal GTK implementation is a narrow reusable widget that can replace the synthetic Phase 105 host without changing the ownership architecture.

## Research

The GTK implementation is complete and proven on Linux, but it is an internal application runtime rather than an exported downstream module. Its surface imports Ghostty application, configuration, core surface, generated GObject classes, Blueprint resources, and renderer/process internals. Ghostty's official [build documentation](https://ghostty.org/docs/install/build) confirms that Git checkouts require additional GTK build-time tooling and that the result is the complete Ghostty executable.

| Approach | Pros | Cons | Status |
|---|---|---|---|
| Import internal GTK surface only | Would reuse polished input/rendering | Not independently exposed; transitive graph is application-sized | Rejected |
| Consume the whole pinned GTK runtime | Exact renderer and interaction fidelity | Effectively embeds Ghostty's app architecture and ownership model | Technically possible, contract mismatch |
| Extract a reusable widget downstream | Cleaner host boundary | Becomes a maintained downstream patch/fork | Out of scope |

## How to Run

```bash
PINNED="$HOME/.cache/git-stacks/native/ghostty-332b2aefc6e72d363aa93ab6ecfc86eeeeb5ed28"
ZIG="$HOME/.cache/git-stacks/native/zig-linux-x86_64-0.15.2/zig"
cd "$PINNED"
"$ZIG" build -Dapp-runtime=gtk -Demit-exe=true \
  -Demit-terminfo=false -Demit-termcap=false -Demit-themes=false \
  -Demit-helpgen=false -Demit-docs=false --summary failures
```

## What to Expect

The build traverses almost the complete GTK application graph. In this environment it reached 171/198 steps before stopping because the Git-checkout-only `blueprint-compiler >= 0.16.0` tool was absent. This is evidence of the source-build boundary, not a libghostty or GTK runtime failure.

## Investigation Trail

- Counted 45 Zig files and 25 Blueprint/CSS/XML resources under the pinned GTK runtime, backed by 37 dependency declarations.
- Confirmed the official build exports `ghostty-vt` modules downstream, but does not export the GTK runtime as a module.
- Confirmed `src/Surface.zig` states that every surface creates and owns its PTY; it initializes `termio`, its IO thread, and child lifecycle internally.
- Confirmed the GTK surface holds and drives that core surface rather than accepting a git-stacks-owned PTY/process-group handle.
- Attempted the exact pinned GTK build. The build graph was valid through 171 steps and then failed closed on the documented Blueprint compiler prerequisite.
- Installing the missing tool would prove the complete upstream application builds, but would not resolve the ownership or reusable-widget boundary.

## Results

**INVALIDATED under the current Phase 105 contract.** Direct internal GTK integration is possible only by consuming Ghostty's application-sized private graph and accepting Ghostty's internal PTY/process ownership. It cannot preserve the existing adapter-only boundary and exclusive git-stacks process-group ownership without downstream modifications, which the user excluded as fork-like scope.

The useful pivot is the supported `libghostty-vt` API with a git-stacks-owned GTK renderer and PTY lifecycle. That retains ownership and avoids private GTK coupling, but it is a larger renderer implementation than Phase 105 planned.

