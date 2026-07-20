# Release candidate procedure

This procedure separates local candidate preparation, evidence collection, and release authority. A green local command is not permission to perform an outward release action.

## Candidate identity

For the current candidate:

- package version: `0.22.0-rc.6`;
- intended Git tag: `v0.22.0-rc.6`;
- npm prerelease dist-tag: `next`;
- changelog heading: `## [0.22.0-rc.6] - 2026-07-20`.

The root facade and all seven workspace packages must use that exact version, including every internal `@git-stacks/*` range and the corresponding root/workspace lockfile records. The tag is an expected identity only until separately authorized and created.

## Preconditions

- Use Node.js 24 and the npm version declared in `packageManager`.
- Install from the committed lockfile with `npm ci`.
- Ensure every workspace and the root facade use the same `-rc.N` version.
- Add the matching changelog entry before validation.
- Keep the worktree clean except for the intended candidate commits.
- Preserve every existing `.planning/phases` directory and every artifact within it throughout preparation, validation, and release commits.

Preserve all phase planning directories and artifacts. Release-prep commits must not delete or rewrite prior phase planning directories.

## Local validation-only gate

Run the ordinary aggregate suite first:

```bash
npm test
```

Run `npm run release:check` exactly without `--tag`.

```bash
npm run release:check
```

The release check builds Node packages and the optional TUI, type-checks all workspaces, runs the isolated Vitest suite, native Node runtime and conformance tests, architecture checks, optional per-file OpenTUI tests, V8 coverage and verification gates, audits production licenses and the default runtime graph, verifies required native prebuilds, and runs `npm pack --dry-run` for the root plus every package.

This command is validation-only. Without the explicit tag flag, it does not create a tag, push, publish a package, create a GitHub Release, or dispatch a release workflow. Capture tag refs before and after the command and require byte-identical output:

```bash
git for-each-ref --format='%(refname):%(objectname)' refs/tags > /tmp/git-stacks-tags.before
npm run release:check
git for-each-ref --format='%(refname):%(objectname)' refs/tags > /tmp/git-stacks-tags.after
cmp /tmp/git-stacks-tags.before /tmp/git-stacks-tags.after
```

The local receipt must also confirm that every pre-existing phase-planning directory and artifact remains present. A passing local gate proves only deterministic behavior available in that checkout and environment.

## Exact candidate SHA and evidence ledger

After manifests, lockfile, changelog, user documentation, and local validation receipts are committed, freeze one exact candidate SHA with `git rev-parse HEAD`. Every later receipt must name that immutable commit. A moving branch name, a later commit, or a result from another build cannot be substituted for the exact candidate SHA.

Record evidence classes separately. Never let one green class imply another:

| Evidence class | Required state at candidate freeze |
|---|---|
| Local deterministic evidence from `npm test`, validation-only `npm run release:check`, unchanged tag refs, and planning-tree preservation | PASS only when the recorded local commands exit zero for the exact candidate |
| Hosted Linux/macOS and x64/arm64 runtime receipts | PENDING until the exact-SHA hosted matrix completes |
| Authenticated GitHub.com pull-request and GitLab.com merge-request receipts | PENDING until exact-SHA provider fixtures or approved live receipts are recorded |
| Live-service behavior and reconnect/revision receipts | PENDING until exercised against the exact candidate |
| Physical browser and xterm keyboard/input behavior | PENDING until performed by an operator on the exact candidate |
| Responsive screenshot evidence at required browser widths | PENDING until captured and indexed to the exact candidate |
| Interactive OpenTUI behavior and terminal-size evidence | PENDING until exercised in a real terminal on the exact candidate |
| Human cross-client review and approval | PENDING until explicitly signed off for the exact candidate |
| Release authorization | PENDING until an authorized operator grants it separately |

Local deterministic evidence does not prove hosted runtime receipts, authenticated provider behavior, live-service behavior, physical browser/xterm input, responsive screenshots, interactive OpenTUI behavior, human cross-client approval, or release authorization.

Missing hosted/manual evidence stays pending and must not be described as passed.

## Candidate preparation stop

Do not run any release-only workflow, hosted dispatch, Git push, tag, package publish, or GitHub Release action.

Separate explicit authorization is required to create a tag, push Git refs, publish packages, create a GitHub Release, or dispatch a release-only workflow. Authorization for one action does not authorize the others, and candidate preparation or test success authorizes none of them.

Only after that separate approval may an operator use `npm run release:check -- --tag` to create the matching annotated tag. Tag creation still does not authorize a push, package publication, GitHub Release, or workflow dispatch.

## Tarball inspection without publication

Internal packages must be published in dependency order: protocol, client/core, web, service, CLI, optional TUI, then the `git-stacks` facade. The default facade must resolve without Bun or OpenTUI.

To build the exact tarball set without publishing it:

```bash
npm run pack:release
```

The tarballs and their integrity manifest are written to the ignored `release/npm/` directory. Inspect every generated tarball. The packaging command deliberately does not require or modify registry credentials and does not publish.

## One-time trusted-publisher setup

This is an independently authorized package-owner administration step, not part of local candidate preparation. Each npm package must authorize this repository's exact release workflow once. Run the following only while authenticated as an npm package owner and prepared to complete any browser or 2FA confirmation required by npm:

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

## Hosted workflows after authorization

`.github/workflows/node-runtime-matrix.yml` runs the build, Vitest, secure native Node integration tests, architecture/type/dependency checks, package/native-addon validation, SPDX license audit, and runtime vulnerability audit on Linux and macOS, x64 and arm64. The TUI has a separate Bun matrix so its runtime cannot mask default-package failures. A local Linux pass does not replace hosted macOS and arm64 evidence.

Pushing an authorized `v*` tag starts `.github/workflows/release-artifacts.yml`. It verifies that the tag exactly matches the root package version, runs the complete RC gate, packs all eight npm artifacts, and uploads the tarballs plus integrity manifest for inspection. It does not publish or create a GitHub Release.

After that exact-tag workflow passes and a separate release decision is made, publishing the matching GitHub prerelease or release emits the `release: published` event. `.github/workflows/release-publish.yml` then checks out the immutable release tag, verifies the release/version/prerelease relationship, reruns the complete gate, repacks all artifacts, and publishes them in dependency order through npm trusted publishing. Existing versions are skipped only when their registry integrity and shasum exactly match the manifest, so a failed partial publication can be rerun safely.

The publish workflow must already exist on the repository's default branch before the GitHub Release is published. Once trusted publishing is configured, ordinary releases require no npm login, token rotation, or manual `npm publish` commands.

## Rollback

The final `0.20.0` commit/tag is the product rollback boundary. Do not reintroduce plaintext HTTP/SSE/WebSocket routes or dual CLI, service, transport, or PTY implementations as a runtime switch. Revert the `0.21` migration commit or publish a corrected RC instead.
