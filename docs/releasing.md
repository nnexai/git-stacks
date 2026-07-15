# Release candidate procedure

## Preconditions

- Use Node.js 24 and the npm version declared in `packageManager`.
- Install from the committed lockfile with `npm ci`.
- Ensure every workspace and the root facade use the same `-rc.N` version.
- Add the matching changelog entry before validation.
- Keep the worktree clean except for the intended release commit.

## Local validation

```bash
npm run release:check
```

This builds Node packages and the optional TUI, type-checks all workspaces, runs architecture, Node runtime, and complete compatibility suites, audits production licenses and default runtime vulnerabilities, verifies required native prebuilds, and runs `npm pack --dry-run` for the root plus every package.

The command is validation-only. It does not tag or publish. After explicit approval, `npm run release:check -- --tag` may create the matching annotated tag. Publishing remains a separate manual action and should use the `next` dist-tag for a release candidate.

Internal packages must be published in dependency order: protocol, client/core, web, service, CLI, optional TUI, then the `git-stacks` facade. Inspect every generated tarball before publication. The default facade must resolve without Bun/OpenTUI.

## Hosted matrix

`.github/workflows/node-runtime-matrix.yml` runs the Node checks on Linux and macOS, x64 and arm64. The TUI has a separate Bun job so its runtime cannot mask default-package failures. A local Linux pass does not replace the hosted macOS jobs.

## Rollback

The final `0.20.0` commit/tag is the product rollback boundary. Do not reintroduce dual CLI, service, transport, or PTY implementations as a runtime switch. Revert the `0.21` migration commit or publish a corrected RC instead.
