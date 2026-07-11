---
spike: 004a
name: upstream-linux-embedding-api
type: comparison
validates: "Given current upstream Ghostty, when its supported public embedding APIs are inspected and compiled on Linux, then a third-party GTK host can create a rendered terminal surface without a fork"
verdict: INVALIDATED
related: [001, 002]
tags: [ghostty, linux, gtk, embedding]
---

# Spike 004a: Upstream Linux Embedding API

## What This Validates

Whether moving from pinned Ghostty 1.3.1 to current upstream would provide a supported public Linux equivalent of the macOS/iOS `ghostty_surface_*` embedding API.

## Research

Upstream documentation now describes cross-platform libghostty embedding as complete, but the shipped cross-platform layer is `libghostty-vt`: terminal parsing/state plus renderer state. The consumer supplies windowing, font shaping, GPU drawing, clipboard, IME, and process integration. The official [Ghostling example](https://github.com/ghostty-org/ghostling) demonstrates this with Raylib and a consumer-owned 2D renderer. Ghostty's [1.3 release notes](https://ghostty.org/docs/install/release-notes/1-3-0) also say the standalone Zig module is full-featured while its release/API lifecycle remains separate and not yet versioned.

| Approach | Pros | Cons | Status |
|---|---|---|---|
| Full `ghostty_surface_*` C ABI | Existing input/render callbacks and Ghostty renderer | Current Linux platform tag is absent | Rejected |
| `libghostty-vt` Zig/C API | Public, cross-platform, intended for embedders | Host must implement GTK rendering and platform behavior | Supported, but different architecture |
| Current upstream GTK application modules | Complete Linux behavior | Internal source integration, not public embedding API | Evaluated in 004b |

## How to Run

```bash
git clone --depth 1 https://github.com/ghostty-org/ghostty.git /tmp/ghostty-upstream-research
rg -n "PlatformTag|UnsupportedPlatform|ghostty_platform_" \
  /tmp/ghostty-upstream-research/include/ghostty.h \
  /tmp/ghostty-upstream-research/src/apprt/embedded.zig
```

## What to Expect

The full surface configuration exposes only macOS `NSView` and iOS `UIView` payloads. Linux initialization remains unsupported. Cross-platform examples live under the VT API and require a consumer renderer.

## Investigation Trail

- Inspected upstream main at `53bd14fecfd68c6c0ab64d37b5943247299e2b40` (2026-07-10).
- Confirmed the public full-surface C union still contains only macOS and iOS.
- Confirmed `embedded.zig` still returns `error.UnsupportedPlatform` for those tags on non-Darwin targets.
- Confirmed upstream examples are VT/state examples; no official GTK full-surface embedding example exists.
- Separated the marketing-level cross-platform claim from the actual API boundary: it applies to `libghostty-vt`, not the rendered `ghostty_surface_*` API Phase 105 targeted.

## Results

**INVALIDATED.** Updating the Ghostty pin does not produce a public rendered Linux/GTK surface API. Current upstream offers a viable but architecturally different primitive: `libghostty-vt` with a product-owned renderer and platform integration.

