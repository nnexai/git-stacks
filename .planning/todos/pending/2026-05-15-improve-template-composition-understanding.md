---
created: 2026-05-15T20:46:34.216Z
title: Improve template composition understanding
area: tooling
files:
  - src/lib/composition.ts
  - src/commands/template.ts
---

## Problem

Template composition can already express profile-like behavior by using empty or baseline templates and including them in more specific workspace templates. That may be enough to avoid adding a separate workspace `profiles` concept.

The weaker gap is ergonomics: when templates include other templates or are composed via repeated `--template`, it can be hard to understand what the resolved workspace recipe will contain and which template contributed each repo/env/file/hook/port/integration/label.

This is not currently a strong direction, but it is worth keeping as a possible supporting idea.

## Solution

Explore improving template composition understanding rather than adding profiles.

Possible surfaces:

```bash
git-stacks template preview app-feature
git-stacks template preview --template app --template with-gsd-files --template baseline-agent
git-stacks template explain app-feature
```

Potential outputs:

- Resolved repos, modes, branch patterns, env, files, hooks, integrations, ports, and labels.
- Source attribution showing which included template contributed each piece.
- Conflict/override notes for env/files/ports/integrations.
- A dry-run view before workspace creation.

Design preference:

- Keep this as a low-priority/weak idea.
- Prefer template layers/includes over introducing a separate `profiles` feature.
- Treat this as an ergonomics/support feature that could pair with `files.sync` or TUI improvements later.
