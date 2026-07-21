# macOS PTY attach-first canary

The first canary proved that the interactive post-profile PTY handshake
introduced after `v0.21.0-rc.6` prevented a real macOS login zsh from reaching
the browser attachment boundary. This revision tests the authority-preserving
fix: publish the zsh session so xterm can answer startup queries, then let the
existing startup-file wrapper apply and verify the post-profile environment.

No bootstrap is injected into zsh terminal input. Configured command terminals
and other shells retain their existing initialization and execution paths.
This remains a canary until it passes on the affected Mac; it is not a release
candidate yet.

## Build on the Mac

```zsh
git clone --branch canary/macos-pty-handshake-bypass https://github.com/nnexai/git-stacks.git git-stacks-pty-canary
cd git-stacks-pty-canary
npm ci
npm run build:packages
```

If the checkout already exists, fetch and check out the canary branch instead
of cloning it again.

## Run the exact probe

Stop any installed service first:

```zsh
node packages/cli/dist/index.js service stop
```

Start the packaged browser client with redacted lifecycle diagnostics inherited
by the new service. Do not enable the earlier bypass flag:

```zsh
GIT_STACKS_CANARY_PTY_DIAGNOSTICS=1 \
node packages/cli/dist/index.js web
```

Verify that the prompt renders and run:

```zsh
printf 'CANARY_ROUNDTRIP_OK\n'
```

Then repeat after an explicit service restart:

```zsh
node packages/cli/dist/index.js service stop
GIT_STACKS_CANARY_PTY_DIAGNOSTICS=1 \
node packages/cli/dist/index.js web
```

The redacted lifecycle trace is written to:

```text
~/.config/git-stacks/service/pty-canary.jsonl
```

It contains only timestamps, a random per-terminal correlation ID, shell
family, lifecycle phase, bypass state, PID, and exit classification. It does
not record terminal input/output, environment values, paths, workspace names,
repository names, launch tokens, or credentials.

Return the initial and restart PASS/FAIL results plus the contents of that
JSONL file. Remove the checkout when testing is complete; no global package is
installed by this procedure.
