---
spike: 016
name: node-pty-runtime
type: standard
validates: "Given the service terminal policy, when Bun.Terminal is replaced by Node and node-pty, then interactive I/O, resize, EOF exit, detached retention, bounded high-volume output, and process-tree cleanup remain viable on supported platforms"
verdict: PARTIAL
related: [010, 014]
tags: [node, terminal, pty, macos, linux, dependencies]
---

# Spike 016: Node PTY Runtime

## What This Validates

Given the existing service-owned terminal policy, when `Bun.Terminal` is replaced by Node.js and `node-pty`, then the service can retain the terminal behaviors that matter to git-stacks without making the browser own shell state.

## Research

| Approach | Tool | Pros | Cons | Status |
|---|---|---|---|---|
| Established Node PTY binding | [`microsoft/node-pty`](https://github.com/microsoft/node-pty) | Microsoft-maintained, MIT, used by VS Code, Linux/macOS support, resize and process lifecycle API | Native addon; stable 1.1.0 lacks Linux prebuilds | Selected with release gate |
| Keep Bun PTY in a sidecar | `Bun.Terminal` | Already proven by the current service | Defeats the Node-default service distribution and leaves two runtimes in the machine authority | Rejected |
| Pure Node implementation | Node standard library | No native dependency | Node does not expose a standard pseudoterminal API | Not feasible |

`node-pty` 1.1.0 is the current stable release. Its package contains prebuilt binaries for macOS arm64/x64 and Windows, but not Linux; installation compiled `pty.node` locally on this Fedora host. The current Microsoft 1.2.0 beta line adds Linux x64 and arm64 prebuilds alongside macOS arm64/x64 and Windows. The retained probe therefore targets `1.2.0-beta.14` to validate the intended no-compiler distribution shape, but a beta is not yet an acceptable production default.

Both lines are MIT licensed. `npm audit` reported no known vulnerabilities in the probe dependency tree. npm also explicitly reports `node-pty`'s install and postinstall scripts; production packaging must review and allow these scripts deliberately rather than relying on an implicit package-manager default.

## How to Run

```bash
cd .planning/spikes/016-node-pty-runtime
npm install
npm run check
```

## What to Expect

The probe prints a structured JSON report and exits nonzero if interactive I/O, resize, Ctrl-D exit, detached output retention, bounded high-volume output, or POSIX process-group cleanup fails.

## Observability

The report includes timestamped check events, terminal and child process IDs, byte counts, retention size, duration, and process RSS. It contains only synthetic terminal output.

## Investigation Trail

- Selected `node-pty` for the first probe because it is the established Node PTY binding used by VS Code and supports Linux and macOS.
- Stable 1.1.0 passed the Linux behavior probe after compiling a local native addon, but its tarball contains no Linux prebuild.
- The first interactive probe used the user's Fish shell and appeared stuck while Fish queried terminal capabilities. That was not a PTY resize failure: the harness had no terminal emulator attached to answer Fish's control-sequence queries. The deterministic behavior test now uses Bash; production must preserve the current browser/xterm response path during shell startup and while reconnecting.
- `1.2.0-beta.14` installed its bundled Linux x64 prebuild and passed under Node 20.20.2, 22.23.1, and 26.5.0.
- The probe exercised interactive input, a resize from 80x24 to 132x43, normal `exit`, Ctrl-D EOF, browser-detached output retention, 16 MiB synthetic output with a 1 MiB ring, and POSIX process-group cleanup including a sleeping child.
- A representative high-volume run delivered 17,764,111 bytes in under one second, retained exactly 1 MiB, and peaked around 160 MiB RSS from a roughly 59 MiB baseline. The temporary concatenation-based probe intentionally favors clarity over production allocation efficiency; the real ring buffer should retain the current chunked implementation.

## Results

**PARTIAL** — replacing `Bun.Terminal` with `node-pty` is behaviorally feasible, and the current beta demonstrates the required prebuilt Linux x64/arm64 plus macOS x64/arm64 distribution shape. The migration should not ship against stable 1.1.0 if the goal is installation without a compiler, and should not adopt a beta dependency merely to gain Linux prebuilds.

The release gate is either a stable Microsoft `node-pty` release carrying the four required Unix prebuilds, or a consciously maintained git-stacks binary distribution process with equivalent provenance, signing, Node ABI coverage, and Linux/macOS CI. Actual macOS arm64 and x64 runtime tests remain mandatory; package contents and upstream support are evidence of feasibility, not host validation.

The service terminal core should gain a narrow PTY adapter (`write`, `resize`, `kill`, `onData`, `onExit`, `pid`) before the runtime cutover. Replay, visibility, attachment backpressure, signal filtering, and session durability stay above that adapter and must not be reimplemented inside a Node-specific manager.
