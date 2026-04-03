# Quick Task: Fix useAlternateScreen TS Error - Research

**Researched:** 2026-04-03
**Domain:** OpenTUI API migration (@opentui/core 0.1.87 -> 0.1.96)
**Confidence:** HIGH

## Summary

The `useAlternateScreen` property was removed from `CliRendererConfig` between @opentui/core 0.1.87 and 0.1.96. It has been replaced by `screenMode: ScreenMode` where `ScreenMode = "alternate-screen" | "main-screen" | "split-footer"`.

**Primary recommendation:** Replace `useAlternateScreen: true` with `screenMode: "alternate-screen"` in `src/tui/dashboard/run.tsx` line 71.

## Findings

### The Error

```
src/tui/dashboard/run.tsx(71,5): error TS2353: Object literal may only specify known properties,
and 'useAlternateScreen' does not exist in type 'CliRenderer | CliRendererConfig'.
```

**Confidence:** HIGH -- verified by running `bun run typecheck`.

### Current CliRendererConfig (from node_modules/@opentui/core/renderer.d.ts)

The full `CliRendererConfig` interface no longer has `useAlternateScreen`. The relevant properties are:

```typescript
export interface CliRendererConfig {
    // ... other fields ...
    screenMode?: ScreenMode;        // <-- replaces useAlternateScreen
    exitOnCtrlC?: boolean;          // still present, used at line 70
    targetFps?: number;             // still present, used at line 69
    onDestroy?: () => void;         // still present, used at line 72
    // ... other fields ...
}

export type ScreenMode = "alternate-screen" | "main-screen" | "split-footer";
```

**Confidence:** HIGH -- read directly from `node_modules/@opentui/core/renderer.d.ts` lines 16-48.

### The Fix

In `src/tui/dashboard/run.tsx`, change line 71 from:

```typescript
useAlternateScreen: true,
```

to:

```typescript
screenMode: "alternate-screen",
```

No other properties in the `render()` call need changing -- `targetFps`, `exitOnCtrlC`, and `onDestroy` all still exist in `CliRendererConfig`.

### Package Versions

| Package | CLAUDE.md version | Installed version |
|---------|-------------------|-------------------|
| @opentui/core | 0.1.87 | 0.1.96 |
| @opentui/solid | 0.1.87 | 0.1.96 |

## Common Pitfalls

### Pitfall 1: Assuming boolean semantics

The old API was boolean (`useAlternateScreen: true/false`). The new API is a string enum. To disable alternate screen, use `screenMode: "main-screen"`, not `screenMode: false`.

## Project Constraints (from CLAUDE.md)

- Run `bun run typecheck` to verify the fix (not `tsc --noEmit` directly, though they're equivalent)
- Run `bun run test` (isolated test runner) to confirm no regressions
- No `any` types -- use the proper `ScreenMode` type if referencing it

## Sources

### Primary (HIGH confidence)
- `node_modules/@opentui/core/renderer.d.ts` lines 16-48 -- current `CliRendererConfig` type definition
- `node_modules/@opentui/core/renderer.d.ts` line 48 -- `ScreenMode` type definition
- `bun run typecheck` output -- confirms the exact error

## Metadata

**Confidence breakdown:**
- Root cause: HIGH -- verified from type definitions and typecheck output
- Fix: HIGH -- single property rename with verified replacement API
- Side effects: HIGH -- no other properties in the render call are affected

**Research date:** 2026-04-03
**Valid until:** Until next @opentui upgrade
