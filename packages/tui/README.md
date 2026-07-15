# @git-stacks/tui

The optional Bun/OpenTUI terminal dashboard for git-stacks. Install it separately to provide the `git-stacks-tui` executable used by `git-stacks manage`. It renders trusted service state through the official directly trusted-leaf TLS 1.3 client, does not import the native WebTransport addon, and is not part of the default Node.js package graph.

From the repository root, use `npm run tui:build` and `npm run test:tui`. TUI test files run in separate Bun processes; the default Node/Vitest coverage report intentionally excludes this package.
