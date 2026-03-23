# Quick Task: Fix `@/tui/utils` path alias in published npm package

**Researched:** 2026-03-23
**Domain:** Bun runtime / TypeScript path aliases / npm publishing
**Confidence:** HIGH

## Summary

The `@/*` path alias (mapped to `./src/*` in `tsconfig.json`) works when running locally because Bun reads the project's `tsconfig.json` and resolves path mappings at runtime. However, when the package is published to npm and installed on another machine, Bun resolves `tsconfig.json` from the **consumer's project root** (or CWD), not from within `node_modules/git-stacks/`. The installed package does not even ship `tsconfig.json` (it is not in the `files` array). Even if it did, Bun does not look for tsconfig path mappings inside `node_modules` directories.

**Primary recommendation:** Replace all `@/*` imports in `src/` files with relative imports. Keep `@/*` in test files (they run locally with tsconfig and only use it for `type` imports that are erased at runtime).

## Root Cause Analysis

**Confidence: HIGH** (verified via Bun docs + GitHub issues + codebase inspection)

1. `package.json` declares `"bin": { "git-stacks": "./src/index.ts" }` -- Bun runs the TypeScript source directly from the installed location.
2. `tsconfig.json` defines `"paths": { "@/*": ["./src/*"] }` -- this is a compile-time/editor construct.
3. Bun resolves tsconfig paths by searching for `tsconfig.json` walking upward from the project root. Inside `node_modules/git-stacks/`, there is no `tsconfig.json` and Bun won't look for one there.
4. Result: `import { prompts as p } from "@/tui/utils"` fails with "Cannot find module" on the consuming machine.

## Scope of Change

**8 files** have active (non-comment) `@/` imports in `src/`. All import the same module: `@/tui/utils`.

### Files in `src/commands/` (5 files)
| File | Current Import | Relative Replacement |
|------|---------------|---------------------|
| `src/commands/doctor.ts` | `@/tui/utils` | `../tui/utils` |
| `src/commands/install.ts` | `@/tui/utils` | `../tui/utils` |
| `src/commands/repo.ts` | `@/tui/utils` | `../tui/utils` |
| `src/commands/template.ts` | `@/tui/utils` | `../tui/utils` |
| `src/commands/workspace.ts` | `@/tui/utils` | `../tui/utils` |

### Files in `src/lib/integrations/` (3 files)
| File | Current Import | Relative Replacement |
|------|---------------|---------------------|
| `src/lib/integrations/cmux.ts` | `@/tui/utils` | `../../tui/utils` |
| `src/lib/integrations/tmux.ts` | `@/tui/utils` | `../../tui/utils` |
| `src/lib/integrations/niri.ts` | `@/tui/utils` | `../../tui/utils` |

### Commented-out `@/` references (4 files -- NO CHANGE NEEDED)
These are in comments showing test import patterns, not active imports:
- `src/lib/lifecycle.ts` (comment)
- `src/lib/cmux.ts` (comment)
- `src/lib/tmux.ts` (comment)
- `src/lib/niri.ts` (comment)

### Test files (11 files -- NO CHANGE NEEDED)
Test files use `@/` only for `import type` statements (erased at runtime) and in comments. Tests always run locally where `tsconfig.json` is available.

## Alternative Approaches Considered

| Approach | Viable? | Tradeoff |
|----------|---------|----------|
| **Replace with relative imports** | YES (recommended) | Simple, zero dependencies, matches existing codebase pattern (most files already use relative imports) |
| Ship `tsconfig.json` in npm package | NO | Bun does not resolve tsconfig paths from within `node_modules`; confirmed by GitHub issue #21056 |
| Add a build step (bundle with Bun.build) | Overkill | The project explicitly has "no build step" as a design choice; would require major packaging changes |
| Use Node.js subpath imports (`#imports` in package.json) | Possible but unnecessary | Bun supports these, but requires package.json `imports` field and changes all import sites; more complex than relative paths |
| Use `bun-tsconfig-paths` plugin | NO | Plugin would need to be installed by the consumer, not the package author; wrong direction |

## Don't Hand-Roll

Not applicable -- this is a straightforward import rewrite.

## Common Pitfalls

### Pitfall 1: Forgetting to update commented references
**What goes wrong:** Comments showing `@/` import patterns for testing become misleading.
**How to avoid:** Leave comments as-is. They document the test import pattern (which uses `@/` with query-parameter cache busting) and those test imports still work locally.

### Pitfall 2: Breaking test mocks that target `@/tui/utils`
**What goes wrong:** Some tests mock `@/tui/utils` using `mock.module`. If production code no longer imports from `@/tui/utils`, the mock might not intercept correctly.
**How to avoid:** Tests already use `import("@/path?cache-bust")` for dynamic imports. The mock targets the module identity, not the import path. Verify tests pass after the change.

### Pitfall 3: Future contributors re-introducing `@/` in src/
**What goes wrong:** A new file is added with `@/` import and it breaks in the published package again.
**How to avoid:** Add a note to CLAUDE.md conventions or consider a simple lint check. The existing convention already says "Used in tests and deep-nested imports" -- update to say "Used in **tests only**".

## Validation

After making changes:
1. `bun run typecheck` -- confirms TypeScript still resolves the relative imports
2. `bun test tests/` -- confirms no test regressions
3. Simulate installed package: run `bun pack` and inspect the tarball to verify all imports resolve

## Project Constraints (from CLAUDE.md)

- **No build step** -- Bun executes TypeScript source directly (this rules out bundling as a fix)
- **`@/*` path alias** resolves to `./src/*` -- currently documented as usable in "tests and deep-nested imports"
- After fix, CLAUDE.md should be updated: `@/*` alias should be noted as **test-only** to prevent recurrence

## Sources

### Primary (HIGH confidence)
- [Bun: Re-map import paths](https://bun.com/docs/guides/runtime/tsconfig-paths) -- confirms Bun reads tsconfig paths at runtime
- [Bun: Module Resolution](https://bun.com/docs/runtime/module-resolution) -- documents resolution algorithm
- [GitHub Issue #21056: Bun should resolve tsconfig paths in imported modules](https://github.com/oven-sh/bun/issues/21056) -- confirms Bun does NOT resolve tsconfig paths from within dependency packages
- Codebase inspection: `package.json`, `tsconfig.json`, `bunfig.toml`, all `src/` files with `@/` imports

## Metadata

**Confidence breakdown:**
- Root cause: HIGH -- verified via docs, issues, and codebase
- Fix approach: HIGH -- relative imports are the universal solution; most of the codebase already uses them
- Scope: HIGH -- exhaustive grep confirms exactly 8 files with active `@/` imports

**Research date:** 2026-03-23
**Valid until:** Indefinite (fundamental module resolution behavior)
