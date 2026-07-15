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

This builds Node packages and the optional TUI, type-checks all workspaces, runs the isolated Vitest suite, native Node runtime tests, optional per-file OpenTUI tests, V8 coverage and verification gates, audits production licenses and default runtime vulnerabilities, verifies required native prebuilds, and runs `npm pack --dry-run` for the root plus every package.

The command is validation-only. It does not tag or publish. After explicit approval, `npm run release:check -- --tag` may create the matching annotated tag. Publishing remains a separate manual action and should use the `next` dist-tag for a release candidate.

Internal packages must be published in dependency order: protocol, client/core, web, service, CLI, optional TUI, then the `git-stacks` facade. Inspect every generated tarball before publication. The default facade must resolve without Bun/OpenTUI.

To build the exact tarball set without publishing it:

```bash
npm run pack:release
```

The tarballs and their integrity manifest are written to the ignored `release/npm/` directory. npm authentication and ownership of the `@git-stacks` scope are external preconditions; the packaging command deliberately does not require or modify registry credentials.

## Hosted matrix

`.github/workflows/node-runtime-matrix.yml` runs the build, Vitest, secure native Node integration tests, architecture/type/dependency checks, package/native-addon validation, SPDX license audit, and runtime vulnerability audit on Linux and macOS, x64 and arm64. The TUI has a separate Bun matrix so its runtime cannot mask default-package failures. A local Linux pass does not replace hosted macOS and arm64 evidence.

Pushing a `v*` tag starts `.github/workflows/release-artifacts.yml`. It verifies that the tag exactly matches the root package version, runs the complete RC gate, packs all eight npm artifacts, and uploads the tarballs plus integrity manifest for inspection. It never publishes to npm or creates a GitHub release.

## Rollback

The final `0.20.0` commit/tag is the product rollback boundary. Do not reintroduce plaintext HTTP/SSE/WebSocket routes or dual CLI, service, transport, or PTY implementations as a runtime switch. Revert the `0.21` migration commit or publish a corrected RC instead.
