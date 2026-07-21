# macOS PTY direct-login-zsh canary

The earlier canaries proved that the interactive post-profile PTY handshake
introduced after `v0.21.0-rc.6` is the regression. Attach-first allowed the
wrapper to finish, but the affected zsh still never entered a working ZLE
command loop. This revision restores the known-good direct login-zsh launch:
the resolved environment is present at spawn, and zsh owns its real startup
files and terminal negotiation without a temporary `ZDOTDIR` chain.

No bootstrap or redraw byte is injected into zsh terminal input. Configured
command terminals and the existing bash/fish paths are unchanged. This canary
passed the affected-Mac prompt and command roundtrip plus the complete hosted
matrix and was promoted to the next release candidate.

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
