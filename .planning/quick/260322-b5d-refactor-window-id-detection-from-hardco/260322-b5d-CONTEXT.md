# Quick Task 260322-b5d: Refactor window ID detection from hardcoded niri to a scalable integration-provided detection map - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Task Boundary

Refactor the window ID detection system so it's not hardcoded to niri. Integrations that can detect window IDs (like niri) provide a WindowDetector implementation. Integrations that create windows (vscode, intellij) call all available detectors. Results are stored in a generic map on WindowArtifact keyed by detector ID.

</domain>

<decisions>
## Implementation Decisions

### Detection API shape
- Two-phase `begin()/resolve()` interface on a `WindowDetector` type
- `begin()` captures pre-spawn state, returns an opaque `DetectorSnapshot`
- `resolve(snapshot, hints?)` diffs against snapshot, returns new window IDs
- `hints` parameter accepts optional `{ pid?: number, app_id?: string }` so detectors can filter precisely (e.g., niri matches by PID)
- Integrations optionally implement this interface — only WM integrations (niri, future hyprland/sway) would

### WindowArtifact map structure
- Replace `niriWindowIds?: number[]` with `windowIds?: Record<string, number[]>`
- Keyed by detector ID (e.g. `"niri"`)
- Consumers read their own key: `artifact.windowIds?.["niri"] ?? []`

### snapshotWindowIds ownership
- Each detector owns its own polling/detection logic internally
- No shared polling utility — `resolve()` is fully self-contained
- Niri's resolve() keeps the existing exponential backoff polling loop
- The current `snapshotWindowIds` function in `niri.ts` gets absorbed into the niri detector's `resolve()` method

</decisions>

<specifics>
## Specific Ideas

- The `WindowDetector` interface should be defined alongside `Integration` in `types.ts`
- Niri integration implements `WindowDetector` — other integrations (vscode, intellij) stop importing from `niri.ts` directly
- The integration runner collects available detectors, passes them to window-producing integrations via the existing `ArtifactBag` or a new parameter
- `DetectorSnapshot` is opaque to callers — niri's snapshot contains `Set<number>` of before-IDs, other WMs would have their own shape

</specifics>
