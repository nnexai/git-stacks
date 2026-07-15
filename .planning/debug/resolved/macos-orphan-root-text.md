---
status: resolved
trigger: "On macOS and Linux, git-stacks TUI 0.21.0-rc.4 fails with Orphan text error: empty text must have a text parent, box-1 above text-node-1."
created: 2026-07-15
updated: 2026-07-15
---

# Symptoms

- Expected: `git-stacks` opens the optional OpenTUI dashboard after installing `@git-stacks/tui@next`.
- Actual: the renderer aborts immediately on macOS and Linux.
- Error: `Orphan text error: "" must have a <text> as a parent: box-1 above text-node-1`.
- Timeline: still present in the published `0.21.0-rc.4` package after the build-time Solid compiler fix.
- Reproduction: install the optional TUI globally with Bun, then run `git-stacks` outside the installed package directory.

# Root Cause

- A globally installed Bun bin executes from the caller's working directory, so the package-local `bunfig.toml` preload was not discovered. The external `solid-js` import then resolved to `solid-js/dist/server.js`; OpenTUI received a raw empty text node at the root box.
- Bun also does not accept a directly trusted self-signed leaf through Node's `ca` option. Service discovery therefore timed out in the TUI even after the renderer mounted, while the same descriptor was usable from Node.
- OpenTUI's `render()` promise resolves after mounting rather than after destruction. Cleanup ran too early, and Ctrl+C could restore the screen while leaving the process and secure event stream alive.

# Resolution

- Split the package into an unbundled launcher that awaits `@opentui/solid/preload` and a compiler-plugin-built dashboard bundle.
- Verify local TLS by exact DER leaf pin, hostname, TLS 1.3, and ALPN instead of relying on runtime-specific self-signed-CA behavior.
- Await the renderer's `onDestroy` lifecycle, abort state/event subscriptions, close the secure client, and retain renderer-level Ctrl+C cleanup.
- Allow managed service discovery to tolerate a successful competing starter and a bounded 30-second cold start.

# Verification

- The packaged launcher runtime probe passes from `/tmp`.
- Node security tests reject a changed certificate and wrong hostname and accept the exact pinned leaf.
- A Bun client successfully probes the live pinned local TLS listener.
- A real Linux TUI renders workspace, repository, file, and integration data; one Ctrl+C restores the terminal and exits code 0.
