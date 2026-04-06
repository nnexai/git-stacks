# Project Direction

This note captures what I would change if I were restructuring `git-stacks` end to end, based on a quick pass through the current codebase.

I would not do a rewrite for the sake of it. The project already has a solid shape. The highest-leverage changes are structural and product-focused.

## 1. Extract A Real Core Engine

Right now [`src/lib/workspace-ops.ts`](./src/lib/workspace-ops.ts) is the center of gravity for git, files, env, hooks, ports, and integration orchestration.

I would split that into domain modules such as:

- `workspace-state`
- `git-ops`
- `env/secrets`
- `hooks`
- `execution`

Then both the CLI and TUI would become thin adapters over the same typed operations.

## 2. Add An Operation Runner With Rollback Semantics

This tool touches git worktrees, YAML config, ports, tmux/cmux, IDEs, and external CLIs.

Failures in the middle of commands like `open`, `merge`, `clean`, or `sync` should leave behind:

- a structured operation log
- explicit partial-success state
- a cleanup or rollback plan

The current approach is workable, but an explicit operation model would make the tool much safer at scale.

## 3. Replace Scan-Based Config Lookup With An Indexed Store

[`src/lib/config.ts`](./src/lib/config.ts) repeatedly scans YAML files by name. That is reasonable early on, but it becomes the wrong primitive once users have lots of repos, templates, and workspaces.

I would keep YAML as the source of truth if human-editable config remains a goal, but add an index/cache layer for:

- fast lookup
- consistency checks
- duplicate detection
- less repeated filesystem scanning

## 4. Make Integrations A First-Class Plugin Boundary

The current integration system in [`src/lib/integrations`](./src/lib/integrations) is already one of the stronger parts of the project.

I would push it further with:

- explicit capability contracts
- stronger artifact typing
- isolated failure handling
- a path toward third-party plugins

The long-term value of `git-stacks` is orchestration. The integration model should be one of the strongest parts of the architecture.

## 5. Improve Onboarding And The Happy Path

The low-level primitives are good, but the product should feel more like:

- "start work on a ticket"

and less like:

- "assemble several config layers correctly"

I would add a more opinionated guided flow, for example:

- `git-stacks init`
- `git-stacks task PROJ-123`

That flow could handle:

- repo scan
- template creation
- branch naming
- labels
- linked issue
- open
- push
- PR creation

## 6. Tighten Tests And Observability

The custom runner in [`scripts/test-runner.ts`](./scripts/test-runner.ts) exists for real reasons, but it also signals that the internal seams could be cleaner.

I would push harder on:

- dependency injection around shell, process, and filesystem boundaries
- structured logs for every external command
- command-level golden tests
- clearer debugging and failure traces

That would reduce fragility and make it easier to evolve the product without fear.

## Bottom Line

I would turn `git-stacks` from:

- a good Bun CLI with a lot of orchestration logic

into:

- a small local platform for multi-repo task environments

The product direction is already there. The main gap is making the core execution model more explicit, more durable, and easier to extend.
