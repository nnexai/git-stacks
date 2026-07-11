# Spike Conventions

Patterns and stack choices established across spike sessions.

## Stack

- Bun/TypeScript remains the orchestration and verification layer.
- Native terminal experiments use the repo-pinned Zig and Ghostty revisions.

## Structure

- Native feasibility claims must distinguish terminal-state APIs from rendered surface APIs.
- A human-verification checkpoint requires a runnable interface, not only synthetic lifecycle tests.

## Patterns

- Preserve git-stacks ownership of terminal processes unless a phase explicitly revises that contract.
- Prefer supported upstream module boundaries; importing private application runtimes requires an explicit architecture decision.
- Record exact upstream commit identities for time-sensitive API conclusions.

## Tools and Libraries

- `libghostty-vt` is the supported cross-platform embedding primitive as of upstream commit `53bd14fecfd68c6c0ab64d37b5943247299e2b40`.
- The full `ghostty_surface_*` embedding API is not a supported Linux/GTK surface boundary at that commit.
