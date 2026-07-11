---
spike: 007
name: reusable-linux-surface-extraction
type: comparison
validates: "Given upstream Ghostty's embedded runtime, when the Limux fork is compared to its base, then Linux rendered-surface support is a bounded upstreamable adapter rather than an application-sized extraction"
verdict: PARTIAL
related: [005, 006, 004b]
tags: [ghostty, linux, api, upstream, fork]
---

# Spike 007: Reusable Linux Surface Extraction

## What This Validates

Whether the Linux embedded surface can plausibly be maintained or upstreamed without carrying Ghostty's full GTK application as a downstream fork.

## Research

The Limux fork does not export Ghostty's private GTK widget. It extends the existing embedded runtime so a host-provided current OpenGL context is a supported platform payload.

Against its upstream merge base, the two central changes are approximately:

- `include/ghostty.h`: 89 patch lines in the inspected diff.
- `src/apprt/embedded.zig`: 298 patch lines in the inspected diff.

Not every line is required for the basic Linux rendered surface. The fork also carries manual-I/O, selection, clipboard-format, display re-realization, and resize fixes needed by cmux/Limux products.

## How to Run

```bash
bash .planning/spikes/007-reusable-linux-surface-extraction/probe.sh
```

## Investigation Trail

1. Compared Limux fork commit `81ab8ffa...` against upstream merge base `a3aa9fa1...`.
2. The key platform change adds `PlatformTag.linux`, a reserved Linux C payload, and host-current-context semantics.
3. Lifecycle additions cover Linux main-thread drawing, zero-size suppression, GL unrealize/re-realize, and embedded surface size/draw calls.
4. Limux also carries product-driven APIs and fixes. Its fork was 2,069 upstream commits behind current main at inspection time, which demonstrates real rebase cost.
5. No accepted upstream Linux embedded-surface API or active upstream PR was found during the survey.

## Results

**PARTIAL.** The code delta is bounded enough to maintain as a pinned patch series and plausible to propose upstream. However, upstream acceptance is unproven, the C API is not versioned, and the existing Limux fork demonstrates meaningful drift. The implementation plan must include an automated upstream rebase/ABI audit and should collaborate with Limux/cmux rather than create a third independent fork.
