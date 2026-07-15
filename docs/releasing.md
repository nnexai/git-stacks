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

The command is validation-only. It does not tag or publish. After explicit approval, `npm run release:check -- --tag` may create the matching annotated tag. npm publication starts only when the matching GitHub Release is published; prereleases use the `next` dist-tag and stable releases use `latest`.

Internal packages must be published in dependency order: protocol, client/core, web, service, CLI, optional TUI, then the `git-stacks` facade. Inspect every generated tarball before publication. The default facade must resolve without Bun/OpenTUI.

To build the exact tarball set without publishing it:

```bash
npm run pack:release
```

The tarballs and their integrity manifest are written to the ignored `release/npm/` directory. The packaging command deliberately does not require or modify registry credentials.

## One-time trusted-publisher setup

Each npm package must authorize this repository's exact release workflow once. Run the following while authenticated as an npm package owner; npm may require a browser or 2FA confirmation:

```bash
for package in \
  @git-stacks/protocol @git-stacks/client @git-stacks/core \
  @git-stacks/web @git-stacks/service @git-stacks/cli \
  @git-stacks/tui git-stacks
do
  npm trust github "$package" \
    --repository nnexai/git-stacks \
    --file release-publish.yml \
    --allow-publish \
    --yes
done
```

This records `.github/workflows/release-publish.yml` as the trusted publisher. The workflow obtains short-lived npm credentials through GitHub OIDC; no `NPM_TOKEN` repository secret is used.

## Hosted matrix

`.github/workflows/node-runtime-matrix.yml` runs the build, Vitest, secure native Node integration tests, architecture/type/dependency checks, package/native-addon validation, SPDX license audit, and runtime vulnerability audit on Linux and macOS, x64 and arm64. The TUI has a separate Bun matrix so its runtime cannot mask default-package failures. A local Linux pass does not replace hosted macOS and arm64 evidence.

Pushing a `v*` tag starts `.github/workflows/release-artifacts.yml`. It verifies that the tag exactly matches the root package version, runs the complete RC gate, packs all eight npm artifacts, and uploads the tarballs plus integrity manifest for inspection. It does not publish or create a GitHub Release.

After that workflow passes, publish the matching GitHub prerelease or release. The `release: published` event starts `.github/workflows/release-publish.yml`, which checks out the immutable release tag, verifies the release/version/prerelease relationship, reruns the complete gate, repacks all artifacts, and publishes them in dependency order through npm trusted publishing. Existing versions are skipped only when their registry integrity and shasum exactly match the manifest, so a failed partial publication can be rerun safely.

The publish workflow must already exist on the repository's default branch before the GitHub Release is published. Once trusted publishing is configured, ordinary releases require no npm login, token rotation, or manual `npm publish` commands.

## Rollback

The final `0.20.0` commit/tag is the product rollback boundary. Do not reintroduce plaintext HTTP/SSE/WebSocket routes or dual CLI, service, transport, or PTY implementations as a runtime switch. Revert the `0.21` migration commit or publish a corrected RC instead.
