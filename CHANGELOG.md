# Changelog

All notable changes to `git-stacks` are documented here.

---

## Unreleased

---

## [0.22.0-rc.5] - 2026-07-20

### Fixed

- Interactive Bash and zsh terminals now wait for startup output to settle before injecting the private environment bootstrap, preventing macOS zsh from exiting during line-editor initialization.
- Private Bash bootstrap commands are suppressed from terminal output while preserving profile diagnostics and the configured environment.
- macOS terminal shutdown now terminates owned descendants that interactive job control moved outside the shell leader's process group.

### Validation

- Required Bash, zsh, and Fish shell-host tests and the complete Node/TUI/package matrix pass on Linux, Apple silicon macOS, and Intel macOS runners.

### Release Candidate

This candidate contains the cross-shell PTY initialization and cleanup fixes verified after rc.4.

0.22.0-rc.5 / v0.22.0-rc.5; npm prerelease publication uses next

---

## [0.22.0-rc.4] - 2026-07-18

### Validation

- TUI launcher integration fixtures now explicitly bootstrap the built CLI artifact, so clean runners do not depend on a globally installed `git-stacks` executable.

### Release Candidate

This candidate carries the rc.3 fixes after rc.3's hosted artifact gate exposed the TUI fixture's global-CLI assumption. No rc.3 GitHub release or npm publication occurred.

0.22.0-rc.4 / v0.22.0-rc.4; npm prerelease publication uses next

---

## [0.22.0-rc.3] - 2026-07-18

### Validation

- The real-Fish pre-attachment regression now uses a deterministic prompt sentinel across Fish 3.x and 4.x instead of depending on Fish 4.x OSC-133 prompt markers.

### Release Candidate

This candidate carries the rc.2 terminal, TUI, and browser-attention fixes after rc.2's hosted artifact gate exposed a version-specific Fish test assumption. No rc.2 GitHub release or npm publication occurred.

0.22.0-rc.3 / v0.22.0-rc.3; npm prerelease publication uses next

---

## [0.22.0-rc.2] - 2026-07-18

### Fixed

- Fish terminals now receive a bounded Primary Device Attributes response during pre-attachment startup, avoiding the ten-second capability-query timeout while preserving the browser terminal as the long-lived responder.
- Service-owned terminal initialization and shutdown now handle invalid working directories, process groups, and failure notification promptly without leaving shells or configured commands stuck.
- The optional TUI removes multiple selected workspaces serially against fresh revisions and restores terminal state promptly when quitting, including after completed commands or launcher failures.
- Browser agent activity treats `completed` as attention, keeps `working` presence visible, acknowledges completed/waiting/failed state only when the exact terminal is activated, and returns the post-ack projection immediately.

### Changed

- Browser terminal tabs and aggregated workspace rows share deduplicated provider symbols; tabs no longer display a numeric attention badge.

### Release Candidate

This follow-up candidate fixes Fish PTY startup, TUI lifecycle and batch-removal regressions, and browser agent-attention behavior found during rc.1 testing.

0.22.0-rc.2 / v0.22.0-rc.2; npm prerelease publication uses next

---

## [0.22.0-rc.1] - 2026-07-17

### Added

- Browser and optional TUI clients now provide one revision-bound Stale Workspaces review surface. A workspace becomes a cleanup candidate only from confirmed merged/closed change status, repository-scoped missing remote branch, missing managed worktree, or activity strictly older than the fixed 30-day cutoff; unknown-only evaluations remain separate.
- Read-only GitHub.com pull-request and GitLab.com merge-request status can contribute evidence when the workspace has validated persisted provenance. Provider failures stay sanitized and unknown; Gitea status, self-hosted status claims, provider search/inference, mutation, and background polling remain outside this candidate.
- Canonical shortcut metadata now exposes the web stale-view entry and scoped refresh plus TUI entry, navigation, Open, action, refresh, and focus-return behavior, including responsive and too-small terminal layouts.

### Changed

- The prior web/TUI workflow parity work now shares revisioned service projections, service-owned action descriptors and confirmations, one-shot operations, and authoritative reconciliation for workspace review and lifecycle flows.
- Configured commands, hooks, and service-owned PTYs preserve the login/interactive environment for configured Bash, zsh, or fish, including profile aliases, functions, runtime-manager `PATH` changes, and trusted volatile `PATH`/`SSH_AUTH_SOCK` refresh for future launches.
- The root facade and all seven workspace packages now use exact lockstep version and internal ranges for `0.22.0-rc.1`; the default install continues to exclude the optional TUI, Bun, and OpenTUI.

### Safety and migration

- Stale evidence is advisory, supplies no confidence or deletion-safety score, and grants no mutation authority. Open still waits for authoritative success; Archive and Remove retain canonical behavior; Force Remove remains available only after a fresh typed dirty-worktree result, confirmed terminal shutdown, explicit force allowance, and fresh exact-revision inventory.
- Failed or unavailable probes are not converted into evidence of absence, presence, or staleness. Network evidence uses only a five-minute volatile in-memory cache, and explicit Refresh bypasses it.
- No YAML schema, identity model, threshold setting, database, ORM, browser storage, or persisted evidence cache was added. Existing schema-version-1 workspaces require no migration or user configuration.
- Browser projections remain narrower than trusted service state, and the TUI consumes the trusted service contract rather than independently probing Git or providers.

### Release Candidate

This candidate closes the stale-workspace documentation and local validation boundary on top of the completed cross-client workflow parity work. Local deterministic validation does not claim hosted, authenticated-provider, live-service, physical-input, screenshot, interactive-TUI, human-approval, or release-authorization evidence.

0.22.0-rc.1 / v0.22.0-rc.1; npm prerelease publication uses next

---

## [0.21.0-rc.6] - 2026-07-15

### Fixed

- TUI batch operations now multiplex operation progress and dashboard invalidations over one durable event subscription per encrypted RPC session. Sequential clean, remove, merge, and other mutations no longer consume the server's bounded subscription capacity and fail after the fourth operation.
- Node-only Linux and macOS CI jobs no longer require optional Bun TUI build artifacts; TUI compiler and package validation remains enforced by the dedicated TUI and package-policy jobs.

### Release Candidate

This follow-up release candidate fixes event-subscription exhaustion during TUI batch operations and restores the intended Node/TUI CI boundary. The package version and GitHub prerelease tag are `0.21.0-rc.6` / `v0.21.0-rc.6`; npm publication uses the `next` dist-tag.

---

## [0.21.0-rc.5] - 2026-07-15

### Fixed

- Globally installed TUI launchers now explicitly preload OpenTUI's reactive Solid runtime before importing the dashboard. This removes the cross-platform root-level orphan-text crash even when the command is run outside the installed package directory.
- Local TUI transport verifies the descriptor's exact certificate leaf, hostname, TLS 1.3 session, and application ALPN directly, avoiding incompatible self-signed-CA handling between Bun and Node without weakening the pin.
- OpenTUI retains a renderer-level Ctrl+C emergency exit and now ties state and secure-client cleanup to renderer destruction, so a startup or render failure restores the terminal and terminates the process instead of trapping it in alternate-screen mode.
- Managed clients now tolerate successful concurrent service starters and allow enough time for protected-store recovery and secure-listener startup on larger workspace registries.

### Safety and distribution

- Published TUI artifacts are split into a preload launcher and compiler-plugin-built dashboard, with a package-level runtime probe that executes from an unrelated working directory.
- Publishing is now driven by a published GitHub Release through npm trusted publishing. The workflow uses short-lived GitHub OIDC credentials, verifies the full release gate, publishes packages in dependency order, and safely resumes a partially completed release without storing an npm token.
- Every published package declares the canonical GitHub repository for provenance verification.

### Release Candidate

This follow-up release candidate fixes global TUI runtime selection, terminal recovery, and service cold-start discovery, and introduces release-triggered trusted npm publishing. The package version and GitHub prerelease tag are `0.21.0-rc.5` / `v0.21.0-rc.5`; npm publication uses the `next` dist-tag.

---

## [0.21.0-rc.4] - 2026-07-15

### Fixed

- The optional TUI is now built with OpenTUI's required Solid compiler plugin. Published bundles no longer create orphan empty text nodes when conditional progress or workspace content renders.
- TUI service discovery now delegates service hosting to the separately installed Node CLI, while Node clients launch a dedicated service daemon. A bootstrap circuit breaker prevents an incorrectly resolved child from recursively spawning more clients.
- Empty workspace labels now resolve to `null` instead of becoming raw empty text beneath an OpenTUI layout box.

### Safety and distribution

- Package validation rejects TUI bundles built through the generic JSX runtime and requires the dedicated service daemon in the service tarball.
- Managed-service tests assert the exact Node and Bun launch commands and verify that a bootstrapped child cannot spawn recursively.

### Release Candidate

This follow-up release candidate fixes the optional TUI packaging and service-bootstrap failures. The package version and GitHub prerelease tag are `0.21.0-rc.4` / `v0.21.0-rc.4`; npm publication uses the `next` dist-tag.

---

## [0.21.0-rc.3] - 2026-07-15

### Fixed

- A stale, moved, inaccessible, or otherwise invalid Git worktree no longer aborts the aggregate service snapshot. The affected repository is projected as degraded while healthy repositories and workspaces remain available to browser and TUI clients.

### Release Candidate

This follow-up release candidate fixes the repository-status failure exposed by macOS testing. The package version and GitHub prerelease tag are `0.21.0-rc.3` / `v0.21.0-rc.3`; npm publication uses the `next` dist-tag.

---

## [0.21.0-rc.2] - 2026-07-15

### Fixed

- Secure RPC failures are now validated and bounded before transmission. Long platform or snapshot errors no longer violate the response schema and mask the original failure as `too_big maximum 500`.
- Browser startup now distinguishes an authentication failure from a workspace snapshot failure. A failed `terminal.list` restore is reported without discarding an otherwise usable workspace view.

### Release Candidate

This follow-up release candidate hardens diagnostics discovered during macOS testing. The package version and GitHub prerelease tag are `0.21.0-rc.2` / `v0.21.0-rc.2`; npm publication uses the `next` dist-tag.

---

## [0.21.0-rc.1] - 2026-07-15

### Security architecture

- Replaced the transitional HTTP/SSE/WebSocket service surface with carrier-neutral `git-stacks/2` frames over authenticated encryption. The service exposes no plaintext API, executable HTTP bootstrap, readiness route, or classified fallback.
- The browser is now a self-contained installed `file:` client with hashed CSP, ephemeral in-memory P-256 identity, owner-only launcher files that keep one-use grants out of process arguments, certificate-hash-pinned loopback WebTransport, renewable leases, and no browser product persistence.
- The optional TUI reaches only its local helper through directly trusted self-signed-leaf TLS 1.3, hostname verification, `git-stacks/2` ALPN, and one-use application authentication. It does not load the native WebTransport addon or install a CA.
- Added opt-in remote authorities: explicit bind configuration, out-of-band fingerprint confirmation, proof-before-commit one-use pairing, durable helper/service identities, scoped target records, signed monotonic certificate pin sets, helper process epochs, revocation, and helper-relayed browser/TUI sessions.
- Durable identities now prefer native macOS Keychain/Linux Secret Service storage with a protected fail-closed file fallback. Ten-day WebTransport leaves roll through signed current/next pins and overlapping consecutive-port listeners without replacing the paired identity.
- Terminal, snapshot, operation, event, signal, and dismissal traffic now share one encrypted router locally and remotely. Service-owned PTYs retain visible-only streaming, bounded replay, resize/title/focus behavior, process cleanup, and browser-close persistence.
- Added malformed-frame, wrong-pin, launch replay, protected-store, remote relay, browser replacement, terminal replay, strict browser-bundle, license, vulnerability, native-addon, and real Chrome `file:` client validation.

### Changed

- The default product now runs on Node.js 24: the CLI, shared domain core, local service, encrypted transport, browser build, terminal runtime, and release tooling no longer require Bun.
- Source is split into independently buildable `@git-stacks/protocol`, `client`, `core`, `cli`, `service`, `web`, and optional `tui` packages. The public `git-stacks` package is a small facade over the Node CLI.
- Ordinary CLI commands remain local and daemonless. They call the same core used by the service, while service filesystem reconciliation observes atomic CLI or editor writes without a refresh RPC.
- Interactive service transport uses the carrier-neutral secure session layer; browser terminals use exact-pinned `node-pty@1.2.0-beta.14`. Service terminal ownership, visible-only streaming, bounded replay, resize, reconnect, shell-exit cleanup, and process-tree shutdown behavior are preserved.
- The browser is a browser-only package built as a deterministic self-contained asset. Shared signal, priority, event, and presentation reduction lives in the client package instead of being duplicated by renderers.
- The OpenTUI dashboard is now the separately installed `@git-stacks/tui` Bun package. Bun and OpenTUI are absent from the default CLI/service/browser dependency graph.
- Runtime packages target modern Linux and macOS on x64 and arm64. CI has separate Node jobs for each platform/architecture runner and an isolated optional-TUI job.
- Unit and integration tests now run in isolated Vitest workers on Node, with direct V8 coverage. The Bun test runner, copied Istanbul instrumentation tree, coverage preload hooks, and their smoke tests were removed; Bun remains only for per-file OpenTUI tests.

### Fixed

- Browser launch now uses an owner-only generated copy of the self-contained client, keeping one-use authority out of URLs, history, process arguments, browser storage, and reusable installed assets. The CSP permits only the runtime style operations required by the terminal renderer while continuing to forbid inline scripts and dynamic evaluation.
- `git-stacks web` preflights the loopback WebTransport path and can recover a failed local HTTP/3 listener through the already authenticated machine channel without weakening certificate pinning or exposing a plaintext fallback.
- Terminal creation reuses the authoritative snapshot revision already delivered to the client instead of rescanning every workspace, removing the multi-second shell startup path while retaining conflict detection for stale revisions.
- Workspace creation bounds remote branch discovery with a hard process-tree timeout and avoids duplicate remote probes. The browser follows operation invalidations, guards against out-of-order snapshot responses, and shows newly created workspaces without a page refresh.
- Workspace and repository detection compare canonical filesystem paths, so macOS aliases such as `/tmp` and `/private/tmp` and equivalent symlinked paths resolve consistently.

### Safety and distribution

- Config and workspace persistence uses atomic replacement plus cross-process leases for concurrent read-modify-write operations.
- Package architecture gates reject forbidden cross-layer imports and Node/Bun imports in browser-safe packages.
- Release checks verify exact internal versions, required Linux/macOS `node-pty` prebuilds, production dependency licenses, default-runtime vulnerabilities, and dry-run tarball contents for every package.
- GitHub Actions builds and tests the default Node runtime on Linux and macOS x64/arm64, tests the optional Bun TUI separately, and turns a version tag into inspectable npm tarball artifacts only after the full RC gate passes.
- `node-pty` remains a deliberate exact-pinned beta dependency for this RC. Its native resize/replay/lifecycle behavior is covered by Node real-process tests and must pass the hosted platform matrix before release.
- RC validation no longer tags by default and never publishes. Tag creation requires an explicit `--tag`; package publication remains a separate approved action using the `next` dist-tag.

### Release Candidate

This is the first release candidate for v0.21.0. The package version and GitHub prerelease tag are `0.21.0-rc.1` / `v0.21.0-rc.1`. npm publication remains a separate approved action and must use the `next` dist-tag.

---

## [0.20.0-rc.1] - 2026-07-14

### Added

- An authenticated loopback service now owns revisioned workspace snapshots, typed operations, durable event replay, workspace-change monitoring, and provider-neutral signals for interactive clients.
- `git-stacks web` provides the supported graphical workspace client. It includes workspace navigation and actions, signal attention, persistent priorities, manual commands, and service-owned multi-tab browser terminals with resize, bounded replay, focus restoration, and reconnect support.
- Workspace `priority` is persisted in workspace YAML and applied within the same label and status groups used by the dashboards.
- User-level signal integrations are available for Codex, Claude Code, GitHub Copilot, and OpenCode through the opt-in `git-stacks hooks` lifecycle.

### Changed

- The Bun service is the shared machine-side core for both interactive clients. The TUI consumes the complete trusted `/v1/core` model through a typed client, while the browser receives a narrower path- and secret-minimizing projection.
- The TUI is now a thin presentation layer over service-owned state and mutations. It loads the complete workspace, template, repository, and integration model from the service, obtains files, notes, and signals through service endpoints, then follows server-sent invalidation and lifecycle events instead of independently rescanning the machine.
- Browser shell processes belong to the service rather than a page. Reloading or temporarily closing the browser can reconnect to a live terminal while its service process remains alive; ordinary exited shells are removed, while configured command tabs retain their final output.
- The unsupported GTK/Zig desktop experiment and its patched terminal dependency were retired and removed. Its final state is preserved by the `native-client-final-2026-07-14` archive tag.
- User-level Codex, Claude Code, GitHub Copilot, and OpenCode signal hooks are now strictly opt-in. `git-stacks hooks install <provider...>`, `update`, `uninstall <provider...>`, and `status` provide an ownership-safe lifecycle; normal service and terminal startup never modify provider configuration.
- The superseded project-local `git-stacks install --hooks` command and its separate hook-plugin implementation were removed. `git-stacks hooks` is the single supported coding-agent hook lifecycle.

### Fixed

- Workspace clone and template recreate now use transactional worktree handling: only resources created by the active operation are removed on failure, and moved local refs are restored when possible.
- `clean --gone` fails closed when remote branch discovery is unavailable; `pull` refuses worktrees on an unexpected or detached branch.
- Workspace recreation resolves the composed template and registry before mutation, preserves workspace identity/runtime metadata, and treats YAML write as the commit point.
- Environment/port identifiers are validated as shell-safe names; duplicate explicit ports are rejected or deterministically reallocated with `--reallocate`.
- TUI startup and refresh no longer show transiently empty source, issue, integration, template, or workspace sections; the service supplies complete data and the client owns only rendering and viewport state.
- TUI detail panes use adaptive list/detail sizing and native scrolling without issuing repeated filesystem or Git requests while navigating.
- Closing the TUI aborts its event stream and returns control immediately without tying the detached service lifetime to the dashboard process.
- Signal dismissal now applies consistently to notifications and activity, survives reconnects, and is cleared only when a newer lifecycle event with the same signal identity arrives.
- Browser terminal tab switching restores the correct terminal buffer and keyboard focus, and inactive tabs stop consuming streamed terminal output until visible again.
- Orphaned terminal activity is removed when its terminal no longer exists, and sidebar provider icons are deduplicated to the currently active provider set.

### Release Candidate

This is the first release candidate for v0.20.0. The package version and matching tag target are `0.20.0-rc.1` / `v0.20.0-rc.1`; final `0.20.0` tagging remains separate after RC validation.

---

## [0.19.0-rc.4] - 2026-05-25

### Fixed

**Manager command-output dialog sizing** - `git-stacks manage` now keeps command output dialogs fully visible within the current terminal size, clips long lines to the dialog width, and tails the newest output lines as command output grows.

### Release Candidate

This is a targeted follow-up release candidate for v0.19.0. The package version and matching tag target are `0.19.0-rc.4` / `v0.19.0-rc.4`; final `0.19.0` tagging remains separate after RC validation.

---

## [0.19.0-rc.3] - 2026-05-25

### Fixed

**Manager refresh re-reads config files** - `git-stacks manage` now invalidates its in-process workspace/template cache when refreshing the dashboard, so direct YAML edits and separate CLI changes are visible without restarting the TUI.

### Release Candidate

This is a targeted follow-up release candidate for v0.19.0. The package version and matching tag target are `0.19.0-rc.3` / `v0.19.0-rc.3`; final `0.19.0` tagging remains separate after RC validation.

---

## [0.19.0-rc.2] - 2026-05-25

### Fixed

**Manager command-output containment** - `git-stacks manage` now keeps noisy manual command output bounded inside the progress view, preserves recent stdout/stderr context, and returns cleanly to the workspace list after the command view closes.

**Completion completeness repair** - bash, zsh, and fish completion output now tracks the current command tree, including the v0.19.0 command families, and the release gate checks for completion coverage drift.

**Workspace-root auto-detection** - optional workspace commands such as `paths`, `env`, and `notes` now detect a workspace from the workspace root or a non-repo subdirectory before falling back to `GS_WORKSPACE_NAME`.

### Safety Notes

Dashboard rollback progress visibility is not part of this release candidate. It remains deferred backlog work and is not described as shipped behavior in `v0.19.0-rc.2`.

### Release Candidate

This is a follow-up release candidate for v0.19.0. The package version and matching tag target are `0.19.0-rc.2` / `v0.19.0-rc.2`; final `0.19.0` tagging remains separate after RC validation.

---

## [0.19.0-rc.1] — 2026-05-17

### Added

**Manual workspace commands** — templates and workspaces can now define named commands for repeatable operator actions that are triggered explicitly. `git-stacks command list` and `git-stacks command run` expose the resolved commands while reusing the same workspace environment, cwd/repo targeting, port, secret, and output handling used by the existing execution machinery.

**Workspace notes** — `git-stacks notes` stores lightweight append-only operator notes outside managed project repositories. Notes can be added, listed, cleared, and summarized in the dashboard without turning private working context into project files.

**Grounded dashboard control center** — `git-stacks manage` now has denser workspace rows, grouping modes, ordered detail sections, contextual footers, notes summaries, and file sync/config status based on the same model as `git-stacks files status`.

**Dashboard actions** — action menus now expose repo config editing, linked issue opening, and visible manual command execution. Disabled rows stay visible with clear reasons, one linked issue opens directly, multiple linked issues use a tracker picker, and command/issue failures stay in the progress view until keypress.

### Safety Notes

Manual commands are operator-authored actions and remain explicit manual triggers, not lifecycle hooks. Hidden `pre*` and `post*` command buckets stay implicit in the dashboard picker.

Dashboard rollback progress visibility is not part of this release candidate. It was explicitly excluded from Phase 99 and remains deferred as backlog work.

### Release Candidate

This is a release candidate for v0.19.0. The package version and matching tag target are `0.19.0-rc.1` / `v0.19.0-rc.1`; final `0.19.0` tagging remains separate after RC validation.

---

## [0.18.0-rc.1] — 2026-05-17

### Added

**Workspace file sync for private project context** — templates and workspaces can now use `files.sync` to materialize private files and directories into a workspace as ordinary files. This is intended for dotfiles, specs, planning notes, and agent configuration such as `.planning` and `.codex` content when symlinks are not accepted by local tools or agents.

**Explicit file drift commands** — `git-stacks files status|pull|push` lets you inspect source/target drift, pull source updates into workspace targets, and push workspace target edits back to the configured source. Normal `git-stacks open` stays conservative and does not silently sync local edits back; `files push` is the explicit sync-back path.

**Forge-source workspace creation** — `git-stacks new <name> --template <template> --source <forge-url>` can create a normal template-backed workspace from a forge change URL. The source URL must be a full forge web URL, and `--repo <name>` is available when multiple template repos could match the same change.

### Safety Notes

Default `files pull` and `files push` copy safe additions but refuse conflicts, overwrites, and destination-only deletes. Use `--dry-run` to preview planned changes, and use `--force` only when you want the destination mirrored to the selected direction, including deletes.

Forge-source creation is early support. GitLab merge request URLs are the primary path, with GitHub and Gitea pull request URL parsing in place, but provider authentication, self-hosted instances, and fork refs may still need manual verification in your environment.

### Release Candidate

This is a release candidate for v0.18.0. The package version and matching tag target are `0.18.0-rc.1` / `v0.18.0-rc.1`; final `0.18.0` tagging remains separate after RC validation.

---

## [0.17.2] — 2026-05-15

### Fixed

**Workspace creation now honors existing branch state** — creating a workspace for a branch that already exists locally now reuses that branch instead of trying to recreate it from the current checkout. If `origin/<branch>` exists, `git-stacks` also configures upstream tracking during worktree creation, matching the behavior developers expect from checking out an existing remote branch directly.

**Remote-backed workspace branches start from the right history** — when the requested workspace branch exists on `origin` but is not fetched locally yet, `git-stacks` fetches that branch-specific ref and creates the worktree from `origin/<branch>` instead of silently starting from the wrong base commit. Brand-new branches with no remote counterpart continue to create from the current repository `HEAD`.

---

## [0.17.1] — 2026-05-15

### Fixed

**Safer gone-branch cleanup** — `git-stacks clean --gone --dry-run` now stays preview-only. It reports workspaces whose upstream branch disappeared without entering the confirmation or removal path.

**Clearer JSON contract for workspace commands** — `git-stacks run --json` now rejects the unsupported non-parallel form instead of silently ignoring JSON output expectations. Use `git-stacks run --parallel --json` for machine-readable per-repo results.

**More reliable hook execution** — workspace lifecycle hooks now run through the explicit shell used by the execution environment, reducing surprises on systems where `sh` lookup behaves differently.

**Workspace and integration behavior got a broader regression pass** — create, clone, open, close, clean, remove, rename, merge, pull, sync, push, env, paths, labels, messages, repo/template flows, and integration command contracts were exercised against disposable local repos and isolated config. The shipped behavior is unchanged where it was already correct; the release is mostly about making those workflows safer to rely on.

### Changed

**Debug documentation now matches the shipped output** — README examples describe `GS_DEBUG` as the primary selector, keep `GIT_STACKS_DEBUG=1` as the legacy alias, and show the current key/value stderr shape with `op=... module=... msg=...`.

**Release confidence is higher without changing normal usage** — the verification and coverage work behind this release stays local to the repository. It does not add a hosted service, require CI, or change day-to-day `git-stacks` commands.

---

## [0.17.0] — 2026-04-06

### Added

**Template labels** — templates now have a full label workflow: `git-stacks template label add|remove|list|clear` manages labels directly on templates, `git-stacks template list --label <tag>` filters templates with the same exact-match AND semantics used for workspace labels, and template labels snapshot-forward into created workspaces so template defaults travel with the workspace from day one.

### Changed

**Workspace creation is more failure-safe** — multi-step workspace creation now rolls back already-completed work when a later step fails, reports rollback progress through the existing progress channel, and avoids leaving behind half-created workspace records after partial failures.

**Debug output is more targeted** — `GS_DEBUG=1` / `GS_DEBUG=true` enables structured stderr debug output across modules, while `GS_DEBUG=<module[,module]>` filters logs to specific areas such as `lifecycle`, `git`, `status`, `env`, or `yaml`. The legacy `GIT_STACKS_DEBUG=1` compatibility path still enables full debug output.

### Internal

**Core engine hardening for scale and maintainability** — template/workspace lookups now use an indexed config cache instead of repeated full scans, subprocess-heavy modules expose injectable seams for tighter tests, and integration optional behavior is enforced through narrow TypeScript interfaces and predicates without surfacing the reverted Phase 78.1 capability-list churn as a release-facing feature.

---

## [0.16.0] — 2026-04-05

### Added

**Debug output** — set `GIT_STACKS_DEBUG=1` to emit labeled timing and trace lines to `stderr` for workspace domain operations such as status collection, env assembly, lifecycle commands, git sync/push/pull flows, and YAML editing. Output uses stable labels like `[workspace-status] getWorkspaceListInfo: 12ms`, normal `stdout` remains unchanged, `--json` modes stay parseable, and `git-stacks manage` re-silences debug before the alternate-screen TUI starts.

### Changed

**Core workspace engine split** — the former `workspace-ops.ts` monolith is now decomposed into focused `workspace-env.ts`, `workspace-lifecycle.ts`, `workspace-status.ts`, `workspace-git.ts`, and `workspace-yaml.ts` modules with targeted unit coverage and a repo-native `madge` dependency gate (`bun run test:deps`). Public CLI behavior stays stable while the core engine becomes easier to test, reason about, and extend.

---

## [0.15.0] — 2026-04-05

### Added

**Dir repos** — non-git directories can now be registered and included in workspaces alongside regular git repos. `git-stacks repo add /some/plain/dir` registers a plain directory as a "dir" type repo, and `git-stacks repo scan` offers non-git directories for registration alongside detected git repos. Templates reference dir repos like any other repo; workspaces store them with `mode: "dir"` and `main_path` only — no worktree is created, no branch is set, and no git operations are attempted.

Dir repos are included in workspace lifecycle: `open` injects their paths into hook and env context, while `close`, `clean`, and `remove` complete without errors (nothing to delete). All git-aware commands — `push`, `pull`, `sync`, `merge`, ahead/behind tracking, and dirty-file detection — silently skip dir repos. `git-stacks status` shows dir repos with a `[dir]` label and no git metrics, `git-stacks list` handles workspaces containing only dir repos without aggregation errors, and the TUI dashboard renders a `[dir]` indicator with no git badges. `git-stacks doctor` skips git health checks for dir repos and instead validates that the referenced directory exists and is accessible.

---

## [0.14.0] — 2026-04-03

### Added

**Ahead/behind tracking** — `git-stacks list` now shows aggregated `↑N ↓N` indicators after each workspace branch, `git-stacks status` reports per-repo ahead/behind counts, and the dashboard surfaces the same data in workspace rows and details. FETCH_HEAD staleness older than 15 minutes is flagged instead of silently showing fresh-looking zeros.

**Push command** — `git-stacks push [workspace]` pushes all worktree repo branches to `origin` in parallel while skipping trunk repos. It supports `--force-with-lease`, `--force`, `--dry-run`, `--set-upstream`, and `--json`, returns non-zero when any repo fails, and the dashboard now exposes a matching push action with live per-repo progress.

**Labels** — workspaces can now be tagged with labels for filtering and grouping. `git-stacks label add/remove/list/clear <workspace>` manages labels directly, `git-stacks new --label <tag>` sets labels at creation time, `git-stacks list --label <tag>` filters with AND semantics, and the dashboard renders labels, matches them in `/` filtering, and can group workspaces by label.

**Secret references** — workspace and template env maps can now use `${{ resolver:path }}` references that resolve at open time without writing plaintext back to YAML. Built-in resolvers include `keychain`, `env`, and opt-in `cmd`; `git-stacks open --skip-secrets` bypasses resolution with empty-string substitution; and external resolver commands enforce a 10-second timeout. The `keychain` resolver uses `key=value` syntax for flexible attribute lookup (`${{ keychain:service=myapp,account=api-key }}`), supporting arbitrary attributes on Linux and up to 2 on macOS.

**Stash on sync** — `git-stacks sync --stash` now auto-stashes dirty worktree repos before sync and restores them in reverse order after. A pre-existing `git-stacks auto-stash` entry blocks another auto-stash, stash-pop failures preserve the stash and surface a recovery command, and the dashboard automatically enables stash mode when syncing dirty worktrees.

**Secrets config wizard** — `git-stacks config` now exposes resolver selection for the secrets subsystem so teams can keep `cmd` disabled by default while enabling only the resolvers they trust.

### Fixed

**Trunk repo status blind spot** — `git-stacks list` and `git-stacks status` now report dirty state, ahead/behind counts, and current branch for trunk-mode repos. Previously trunk repos were completely skipped — dirty changes went undetected, ahead/behind always showed `—`, and `--fetch` did not fetch their origins. Trunk repos compare `HEAD` against `origin/<current_branch>` (their tracking branch) and display unified `↑`/`↓` indicators identical to worktree repos.

### Changed

**Label schema** — `WorkspaceSchema` and `TemplateSchema` now support an optional `labels` field using the shared `^[A-Za-z0-9._:-]+$` validation rule, keeping existing YAML files backward compatible while allowing namespaced labels like `sprint:14`.

---

## [0.13.0] — 2026-04-02

### Added

**Env command** — `git-stacks env [workspace]` shows all merged environment variables that would be injected when opening a workspace. Includes GS_* injected vars, user-defined `env:` from workspace YAML, and resolved port vars. Supports `--format table` (default, human-readable columns), `--format shell` (`export KEY=value` lines, sourceable), `--format dotenv` (`KEY=value` lines), and `--format json` (JSON object). Auto-detects workspace from CWD when no argument is given. `--repo <name>` adds per-repo vars (GS_REPO_NAME, GS_REPO_PATH, GS_REPO_CLONE_PATH) to the output.

**Copilot hook support** — `git-stacks install --hooks` now supports GitHub Copilot alongside Claude Code. Use `--copilot` to install Copilot hooks (`.github/hooks/git-stacks.json`), `--claude` to install Claude Code hooks (existing behavior, now under an explicit flag), or both flags together to install both simultaneously. When neither flag is given, an interactive prompt lets you choose which hook set(s) to install. Copilot hooks provide notification parity with Claude Code hooks — session end, user prompt, and tool-use events are all mapped to `git-stacks message send` calls.

**Tmux config example** — `git-stacks integration tmux config example` now prints a practical YAML snippet showing the native `panes` array with direction, surfaces, and commands, replacing the previous minimal `enabled: true` example.

### Fixed

**Shell completion arity enforcement** — after all positional arguments are filled, pressing Tab no longer repeats workspace/template/repo completions. Only remaining unused flags are offered. Variadic args (`[command...]`) remain exempt. Fix applies to bash, zsh, and fish.

**Shell completion enum values** — flags with constrained values (e.g., `--format`, `--sort`, `--strategy`) now offer their valid values as Tab completions. Auto-detected from Commander.js `.choices()` calls; `OPTION_ENUMS` map serves as a fallback. Command definitions updated to use `.choices()` where option values are constrained.

**Shell completion flag leakage** — flags from `git-stacks list` (e.g., `--sort`, `--status`) no longer appear in completions for `git-stacks integration list`. Option enum completions are now scoped to the command path they belong to, not emitted globally.

**Worktree recreation crash with `~` paths** — `git-stacks open` crashed with an uncaught `ShellError` when `workspace_root` was configured as `~/workspaces/`. Node's `existsSync` doesn't expand `~`, so existing worktrees were misdetected as missing, and the re-add failed because the directory already existed. Paths containing `~` are now expanded to absolute paths at config read time via Zod schema transforms. Additionally, `createWorktree` now skips silently when the worktree already exists at the expected location, prunes stale git worktree entries before adding, and reports descriptive errors instead of raw shell exceptions.

**Doctor fix opens IDE windows** — `doctor --fix` spawned `git-stacks open` to recreate missing worktrees, which also launched VS Code and cmux sessions as side effects. Now passes `--no-ide --no-cmux` so the fix only recreates worktrees without triggering integrations.

**Test sandbox leaks** — vscode and intellij integration tests used `spyOn(Bun, "spawn")` which does not reliably intercept Bun's native spawn, causing real IDE windows to open during test runs. Both integrations now use injectable `_exec` objects (matching the established `_exec` pattern in tmux, niri, lifecycle, etc.) for reliable test isolation.

### Changed

**Conditional forge CLI checks in doctor** — `git-stacks doctor` now only checks for forge CLI binaries (`gh`, `glab`, `tea`) when the respective integration is configured with `enabled: true` in global config. Previously, all forge CLIs were checked unconditionally.

---

## [0.12.0] — 2026-03-29

### Changed

**BREAKING: Multi-workspace AeroSpace config** — the AeroSpace integration config now uses a `workspaces` array instead of a flat single-workspace format. Each entry independently configures its own AeroSpace workspace with layout, normalization, flatten, focus, and commands. This enables distributing windows across multiple AeroSpace workspaces from a single `git-stacks open` command.

**Migration example:**

```yaml
# Before (v0.11.x) — flat single-workspace config
settings:
  integrations:
    aerospace:
      workspace: "2"
      layout: h_tiles
      normalization: true
      flatten_before_open: true
      focus: true
      commands:
        - source: vscode
        - app: kitty
```

```yaml
# After (v0.12.0) — workspaces array
settings:
  integrations:
    aerospace:
      workspaces:
        - workspace: "2"
          layout: h_tiles
          normalization: true
          flatten_before_open: true
          focus: true
          commands:
            - source: vscode
            - app: kitty
```

### Added

**Multi-workspace support** — configure multiple AeroSpace workspace entries in a single integration config. Each entry in the `workspaces` array is processed sequentially: flatten, window movement, commands, and layout execute independently per entry. VSCode and IntelliJ windows from the artifact bag route to the first entry (`workspaces[0]`) only; subsequent entries receive only their own command-launched windows.

**Focus and duplicate validation** — at most one workspace entry may have `focus: true`; duplicate workspace names in the array produce a validation error. Errors use plain-English messages (e.g., `AeroSpace: multiple entries have focus: true (ws1, ws2) — at most one allowed`).

**Cross-entry snapshot isolation** — a shared `beforeSet` accumulates window IDs across all workspace entries, preventing a slow-launching app from one entry being incorrectly detected as a new window by a subsequent entry. `listWorkspaces()` is called exactly once before the loop to validate all target workspace names upfront.

**Integration config introspection** — `git-stacks integration list` shows a table of all integrations with their enabled state and order (`--json` for scripting). `git-stacks integration <id> config example` prints a YAML config snippet for the integration (available for aerospace, vscode, niri, tmux; others show a fallback message). `git-stacks integration <id> config show [workspace]` displays the resolved config for an integration with global, template, and workspace cascade (`--json` for scripting).

**Integration action commands** — `git-stacks integration aerospace focus <workspace>` focuses the AeroSpace workspace configured for a workspace (resolves `focus: true` entry or falls back to `workspaces[0]`). `git-stacks integration vscode open <workspace>` generates and opens the `.code-workspace` file for a workspace. Integrations can now declare a `commands()` method to register per-integration CLI subcommands.

**Convention-based completion inference** — shell completion generation now infers dynamic completion types from Commander.js argument names (`<workspace>`, `<template>`, `<repo>`, `<integration>`) instead of maintaining a manual 50-entry lookup table (reduced to 4 override entries). Also adds multi-position argument dispatch for commands with 2+ args (e.g., `run <workspace> [repo]`), `argChoices` extraction for `.choices()` arguments, and integration ID completion across bash/zsh/fish.

**Workspace port allocation** — templates and workspaces can declare named port slots (`ports: { PORT: ~, DEBUG_PORT: ~ }`) that are automatically allocated from a contiguous range when `git-stacks open` runs. Allocated port numbers are injected as environment variables into hooks and integration contexts via `mergeEnv`. Ports are freed implicitly when a workspace is removed.

Key details:
- Global config `ports.range_start` (default 10000) and `ports.range_end` (default 65000) control the allocation range
- `git-stacks open --reallocate` forces reallocation of conflicting ports
- Race-safe allocation via O_EXCL filesystem lockfile
- Atomic YAML writes with fsync-before-rename
- Port name prompt in workspace creation wizard (after description, before integration overrides)
- Template composition merges ports with last-wins precedence
- Conflict detection against env vars and env_file entries

### Changed

**Atomic config writes** — `writeYaml` now uses fsync-before-rename for crash-safe persistence (previously used direct `writeFileSync`).

### Internal

**Completion generator refactor** — `DYNAMIC_COMPLETIONS` lookup table replaced by convention-based inference from Commander.js argument names. `ArgCompletion` interface replaces `CommandNode.dynamic` + `firstArgRequired` fields.

---

## [0.11.1] — 2026-03-29

### Changed

- **Dependency upgrades** — updated all dependencies to latest versions: zod 3.25 → 4.3, commander 12.1 → 14.0, typescript 5.9 → 6.0, @clack/prompts 0.9 → 1.1, solid-js 1.9.11 → 1.9.12, yaml 2.8.2 → 2.8.3, @types/bun 1.3.10 → 1.3.11. @opentui/core+solid pinned at 0.1.87 (0.1.92 has a macOS-specific TUI crash).

### Fixed

- **Zod 4 migration** — updated all `z.record()` calls to the required two-argument form (`z.record(z.string(), valueSchema)`).
- **Commander 14 compatibility** — added `.allowExcessArguments(true)` to the `run` command to preserve passthrough behavior.
- **@clack/prompts 1.1 types** — added optional chaining in `validate` callbacks to handle `string | undefined` parameter type.
- **TUI git credential safety** — all network-hitting git commands (fetch, pull, ls-remote) now set `GIT_TERMINAL_PROMPT=0` to prevent credential prompts from corrupting the TUI terminal state.

---

## [0.11.0] — 2026-03-28

### Added

**AeroSpace shell wrappers** — typed async CLI wrappers for `aerospace` commands (`list-windows`, `list-workspaces`, `move-node-to-workspace`, `focus`, `layout`, `flatten-workspace-tree`) with injectable `_exec` for test isolation. Platform-gated: silently skips on non-macOS. `git-stacks doctor` reports `aerospace` binary availability as a warn-level check on macOS.

**AeroSpace integration plugin** — tier-3 integration (order 31, disabled by default) that detects newly opened windows via snapshot-delta and moves them to a configured AeroSpace workspace. Configure `settings.integrations.aerospace.workspace` in workspace or template YAML to set the target workspace. Validates the target workspace exists before attempting moves.

**AeroSpace layout control** — normalization-aware layout management for the target AeroSpace workspace. Set `layout` to `h_tiles`, `v_tiles`, `h_accordion`, or `v_accordion`. Enable `flatten_before_open` to reset nested containers before window placement. `normalization: true` (default) uses `flatten-workspace-tree` + `layout` commands; `normalization: false` uses `split`-based alternatives. `focus: true` switches to the target workspace after setup.

**AeroSpace app launching** — a `commands` array in AeroSpace integration config launches arbitrary apps whose windows are automatically detected via snapshot-delta and moved to the target workspace. Supports `app` (direct spawn), `command` (shell string), `source` (reuse prior integration windows), `repo` (resolves to task path for cwd), and environment variable expansion (`$GS_WORKSPACE_NAME`, `$GS_WORKSPACE_PATH`, etc.).

---

## [0.10.1] — 2026-03-28

### Security

- **Input validation** — workspace, template, and repo names are now validated against a strict `NameSchema` (`[A-Za-z0-9._-]+`). Names containing path separators (`/`, `\`), traversal sequences (`..`), or shell metacharacters (`;`, backticks, `$()`) are rejected at schema parse time and at CLI entry points.
- **Atomic config writes** — `writeYaml` now writes to a temporary file and renames, preventing config corruption from interrupted writes.
- **env_file path boundary** — `writeEnvFiles` rejects `env_file` values that resolve outside the repo root directory.
- **Doctor structured fixes** — `doctor --fix` no longer executes shell strings via `sh -c`. All fix operations use structured `FixOperation` objects dispatched to direct Bun APIs (`rmSync`, `spawnSync` with explicit argument arrays).
- **Shell path quoting** — tmux and niri integrations now single-quote all interpolated paths in `cd` commands, preventing breakage with spaces or special characters.

### Fixed

- **Snapshot test stability** — `WorkspaceRow` snapshot tests now freeze `Date.now` to produce deterministic output regardless of when they run.
- **Test command docs** — `CLAUDE.md` corrected from `bun test tests/` to `bun run test` with explanation of mock isolation.

---

## [0.10.0] — 2026-03-26

### Added

**Agent path discovery** — `git-stacks paths [workspace]` outputs one repo path per line to stdout, designed for piping into agent CLI tools. Pass `--prefix "--add-dir"` to prepend each path with a flag string (e.g., `--add-dir /home/user/workspaces/tasks/ws/api`). Supports `--filter worktree|trunk` to restrict output by repo mode. Autodetects workspace from current directory when no argument is given.

**Multi-repo pull** — `git-stacks pull [workspace]` pulls the latest commits for all repos in a workspace with a single command. Worktree repos pull their workspace branch; trunk repos pull their default branch. Uses `--ff-only` for safety — diverged branches fail fast with a clear message. Dirty repos are skipped with a warning and the command exits non-zero. Deduplicates fetches per unique clone path.

**TUI upstream staleness** — the dashboard workspace detail pane now shows an "N behind" badge per repo when upstream has newer commits. Staleness is fetched on workspace focus with a 5-minute TTL cache. Press `r` on a focused workspace to force-refresh. Network failures show a `?` badge without crashing the TUI.

**Template composition** — templates can declare `includes: [base, api]` to merge repos from other templates as building blocks. `git-stacks new --template api --template frontend` composes templates ad-hoc without requiring a saved meta-template. When the same repo appears in multiple templates, worktree mode wins over trunk. Hooks concatenate in include order with the top-level template's hooks running last. Circular includes are detected with a clear error.

---

## [0.9.1] — 2026-03-25

### Fixed

- **TUI repo action menu** — keyboard shortcuts no longer appear doubled in the repo context menu (e.g., `[r] [r] Remove` now correctly shows `[r] Remove`).
- **Fish/zsh shell completions** — descriptions containing apostrophes (e.g., "workspace's") no longer cause `complete: too many arguments` errors when sourcing completions.

---

## [0.9.0] — 2026-03-25

### Changed

**Name-based identity** — workspaces and templates are now looked up by the `name` field in their YAML config, not by filename. Existing configs work without changes (the `name` field defaults to the filename stem). `git-stacks doctor` detects and reports name/filename drift.

**Template rename cascade** — `git-stacks template rename` now updates all workspace YAML files that reference the renamed template. Supports `--dry-run` to preview changes before applying.

**Dynamic shell completion** — tab-completing workspace and template names now reads candidate values from YAML `name` fields instead of listing filenames. Works in bash, zsh, and fish.

**Shell completion coverage** — all integration subcommands (forge `pr create/open/status`, `issue link/unlink/open` for GitHub/GitLab/Gitea/Jira, `tmux attach`, `niri focus-workspace`) now have full tab-completion support in all three shells.

### Fixed

- **TUI dashboard integration display** — integrations that are globally disabled no longer appear in the workspace and template detail panes. Only integrations that are enabled or have an explicit per-workspace/template override are shown.

### Internal

- **Test isolation framework** — custom test runner separates unit tests (shared process) from integration tests (per-file isolated process). Mock factory pattern replaces partial mock.module exports. All cache-busting query-string imports and test-isolation-only DI objects removed from production code.

---

## [0.8.0] — 2026-03-24

### Added

**Upstream branch tracking** — worktree creation automatically detects existing upstream branches and sets up tracking, so `git push` and `git pull` work without `--set-upstream`. Uses local remote-tracking refs first (no extra network call); falls back to `git ls-remote` when local refs are stale. Wired into all creation flows: `git-stacks new`, `git-stacks clone`, TUI wizard, and `git-stacks open`.

**Workspace auto-detection from CWD** — issue commands on all four tracker integrations (Jira, GitHub, GitLab, Gitea) now auto-detect the current workspace when run from inside a worktree directory:
- `git-stacks integration jira issue link PROJ-123` — no `--workspace` needed when inside a worktree
- `git-stacks integration github issue open` — auto-detects workspace from CWD
- Explicit `<workspace>` argument still works (backward compatible)
- Clear error when run outside any known worktree

### Fixed

- **Dashboard linked issues display** — the workspace detail pane now shows a dedicated "Linked Issues" section that reads exclusively from workspace settings. Previously, global Jira config values leaked into the display when no per-workspace issue was linked.

### Known Issues

- **GitLab branch names with `/`** — `glab repo view --web` fails to URL-encode branch names containing `/` (e.g., `feature/my-feature`). This is a [glab CLI bug](https://gitlab.com/gitlab-org/cli/-/issues/948), fixed in [MR !1183](https://gitlab.com/gitlab-org/cli/-/merge_requests/1183) (Feb 2023). **Workaround:** update glab to v1.28+ (any version after Feb 2023).

---

## [0.7.1] — 2026-03-23

### Fixed

- **Published package fails with "Cannot find module @/tui/utils"** — replaced all `@/*` path alias imports in `src/` with relative paths. Bun does not resolve tsconfig path aliases from within `node_modules`, so the `@/*` shorthand only works in local development/test contexts. The 8 affected files in `src/commands/` and `src/lib/integrations/` now use `../tui/utils` or `../../tui/utils` respectively.

---

## [0.7.0] — 2026-03-22

### Breaking Changes

- **Hook env vars renamed from `WS_` to `GS_` prefix** — all injected environment variables now use the `GS_` (git-stacks) prefix with consistent suffix conventions:
  - `WS_WORKSPACE` -> `GS_WORKSPACE_NAME`
  - `WS_BRANCH` -> `GS_WORKSPACE_BRANCH`
  - `WS_TASKS_DIR` -> `GS_WORKSPACE_PATH`
  - `WS_TRIGGERED_BY` -> `GS_TRIGGERED_BY`
  - `WS_REPO_NAME` -> `GS_REPO_NAME`
  - `WS_REPO_PATH` -> `GS_REPO_PATH`
  - `WS_MAIN_PATH` -> `GS_REPO_CLONE_PATH`
  - `WS_MERGED_BRANCH` -> `GS_MERGED_BRANCH`
- `GS_TRIGGERED_BY` now injected into ALL lifecycle operations including `open` and `create` (previously only close/clean/remove/merge)

### Added

**`git-stacks close <name>`** — gracefully close a workspace's integration sessions (IDE windows, terminal multiplexers) without removing worktrees or config. Fires `pre_close` / `post_close` hooks. Available in CLI and TUI dashboard.

**Forge integrations (GitHub, GitLab, Gitea)** — create, view, and check status of PRs/MRs via forge CLIs:
- `git-stacks integration github pr create <workspace> [repo]` — create GitHub PR via `gh` CLI with correct base branch
- `git-stacks integration gitlab pr create <workspace> [repo]` — create GitLab MR via `glab` CLI (translates `pr` to `mr` internally)
- `git-stacks integration gitea pr create <workspace> [repo]` — create Gitea PR via `tea` CLI
- `pr open <workspace> [repo]` — print PR/MR URL to stdout; `--web` opens in browser
- `pr status <workspace> [repo]` — pass-through forge CLI status output
- `[repo]` auto-selected when workspace has exactly one worktree-mode repo; required when multiple

**Forge repo browse** — open the project homepage on GitHub/GitLab/Gitea directly from a workspace:
- `git-stacks integration github open <workspace> [repo]` — print repo URL; `--web` opens in browser (via `gh browse`)
- `git-stacks integration gitlab open <workspace> [repo]` — print repo URL; `--web` opens in browser (via `glab repo view`)
- `git-stacks integration gitea open <workspace> [repo]` — print repo URL; `--web` opens in browser (via `tea repos ls` JSON extraction)
- Works with both worktree and trunk mode repos (uses `main_path` for resolution)

**Forge field on repo registry** — repos can now have an optional `forge` field (`github`, `gitlab`, or `gitea`) in the registry. Existing configs without this field continue to work (backward compatible).

**Forge detection at registration** — `repo add` and `repo scan` detect forge from remote URL (github.com, gitlab.com) and CLI availability. Auto-selects when one forge matches; prompts when multiple match.

**Doctor forge CLI checks** — `git-stacks doctor` now checks availability of `gh`, `glab`, and `tea` CLIs with install links.

**Issue & task tracking integration (GitHub, GitLab, Gitea, Jira)** — link workspaces to issues and open them from CLI:
- `git-stacks integration <tracker> issue link <workspace> <issue-id>` — associate an issue with a workspace
- `git-stacks integration <tracker> issue unlink <workspace>` — remove the association
- `git-stacks integration <tracker> issue open <workspace>` — print issue URL to stdout; `--web` opens in browser (forge trackers)
- Supported trackers: `github` (via `gh issue view`), `gitlab` (via `glab issue view`), `gitea` (via `tea issues ls` JSON extraction), `jira` (via configurable command template)
- Issue references stored in workspace YAML under `settings.integrations.<tracker>.issue` — no schema migration needed
- Jira integration uses configurable `open_cmd` template (default: `jira open $ISSUE_ID`) — tool-agnostic via `$ISSUE_ID` env var substitution

**Jira integration plugin** — standalone integration for Jira issue tracking:
- `git-stacks integration jira issue link <workspace> <issue-key>` — link Jira issues like `PROJ-123`
- `git-stacks integration jira issue open <workspace>` — opens issue via configurable command
- Configure via `git-stacks config` — set custom `open_cmd` template (e.g. `xdg-open https://company.atlassian.net/browse/$ISSUE_ID`)
- `git-stacks doctor` checks `jira` CLI availability

**Per-command shell completion** — `git-stacks new --from <TAB>` now completes template names in bash, zsh, and fish. `close` and `edit` commands complete workspace names. Per-command flag completions are scoped correctly — `message send --from` remains freeform.

**`--yaml` editor flag** — 4 commands now accept `--yaml` to open the raw YAML config in `$EDITOR` (falls back to `$VISUAL`, then `vi`). Post-edit validation warns on Zod schema errors:
- `git-stacks edit <name> --yaml` — workspace YAML
- `git-stacks template edit <name> --yaml` — template YAML
- `git-stacks config --yaml` — global config
- `git-stacks repo --yaml` — repo registry

**Folder cleanup in clean/remove** — `clean` now removes the `tasks/{name}/` directory after worktree removal (with a second confirmation prompt; `--force` skips it). `remove` always deletes the folder. `remove --force` handles malformed/unparseable workspace YAML via name-based directory fallback.

**Dedicated lifecycle phases** — close, clean, remove, and merge now have their own hook pairs:
- `pre_close` / `post_close` — fired when closing integration sessions
- `pre_clean` / `post_clean` — fired when removing worktrees (config kept)
- `pre_merge` — fired before git merge operations (complements existing `post_merge`)
- `post_remove` — fired after workspace config deletion (complements existing `pre_remove`)
- Per-repo `pre_clean` hook — runs before each individual worktree removal

**Lifecycle cascade** — teardown operations compose in layers:
- `remove` calls `clean` which calls `close` — each layer fires its own hooks
- `merge` follows the full cascade: close → clean → merge-specific → remove
- `GS_TRIGGERED_BY` env var injected into all hooks (`open`, `create`, `close`, `clean`, `remove`, or `merge`) so hooks know which top-level operation initiated the cascade

### Changed

- `mergeWorkspace` refactored to full D-10 lifecycle order via cascade composition instead of inline teardown
- `cleanWorkspace` and `removeWorkspace` compose through inner `_executeClose` / `_executeClean` functions
- TUI dashboard passes `captured: true` for all lifecycle dispatches (close, clean, remove, merge) — prevents hook stdout from corrupting the OpenTUI screen
- `--gone` cleanup path in `git-stacks clean` now delegates to `removeWorkspace()` for full lifecycle coverage

### Fixed

- Niri column layout values now display correctly in TUI detail panes (previously showed `[object Object]`)

### Removed

- `runPreRemoveHooks` internal function — superseded by the cascade system; all callers migrated

---

## [0.6.0] — 2026-03-22

### Added

**Niri compositor integration** (for [niri](https://github.com/YaLTeR/niri) Wayland compositor users)
- Creates a dedicated named niri workspace per git-stacks workspace
- Moves windows from prior integrations (VSCode, IntelliJ) onto the named workspace automatically
- Declarative `columns` layout in workspace/template YAML:
  - `columns:` array — each column contains 1+ windows, ordered left-to-right
  - `width:` per column (e.g. `"50%"`, `"1280"`)
  - Three window types: `app:` (direct spawn), `command:` (shell spawn with cwd), `source:` (reuse prior integration window like vscode)
  - Multi-window columns stack automatically
  - `$GS_WORKSPACE_NAME`, `$GS_WORKSPACE_BRANCH`, `$GS_WORKSPACE_PATH` env var substitution in args/command/cwd
- Focus control: `focus: true` on a window keeps it focused after layout; `focus: true` on the niri config keeps the workspace focused (without it, switches back — no focus steal)
- Cleanup on workspace clean/remove
- Silently skips when niri is not running
- Disabled by default — enable via `git-stacks config`

**Integration helper commands**
- `git-stacks integration tmux attach <workspace>` — attach to a workspace's tmux session
- `git-stacks integration niri focus-workspace <workspace>` — focus a workspace's niri workspace

**Integration artifact pipeline**
- Integrations now pass artifacts (session names, window PIDs) to subsequent integrations — niri uses this to collect windows spawned by VSCode/IntelliJ/tmux
- Window ID detection is automatic — integrations don't need compositor-specific code

### Changed

- tmux `open()` no longer attaches/focuses the session — creates it detached so the user can attach via `git-stacks integration tmux attach` or niri commands config
- tmux session killed automatically on workspace clean/remove

### Fixed

- **Dashboard open dialog broken** — opening a workspace through the dashboard made the "press any key to continue" dialog unresponsive; keyboard input displayed as raw escape sequences instead of being handled by the TUI
- Niri column ordering now reliable — windows are spawned first, then arranged into columns in a second pass

---

## [0.5.1] — 2026-03-21

### Improved

- **Workspace list message layout**: moved repo counts (`Nwt Mtr`) to a fixed column after branch name (matching repo tab pattern), freeing remaining space for message previews
- **Message visibility**: message preview text now renders in white instead of gray, making it much more readable against the terminal background
- **Message age color**: age indicator is now always yellow when a message exists, providing consistent visual distinction

### Added

- **WorkspaceRow snapshot tests**: 8 snapshot tests covering focused/unfocused/selected rows, message preview, system messages, dirty repos, name truncation, and message truncation

---

## [0.5.0] — 2026-03-21

### Added

**Agent hook installer** (`git-stacks install --hooks`)
- Install AI agent framework hooks into the current directory's `.claude/settings.json`
- Hooks bridge Claude Code lifecycle events into git-stacks workspace notifications:
  - `Stop` — sends "Claude has finished and may need your attention"
  - `PreToolUse` (AskUserQuestion) — sends "Claude is asking a question — input needed"
  - `UserPromptSubmit` — clears notification (user is responding)
  - `PostToolUse` (AskUserQuestion) — clears notification
- Workspace auto-detection from cwd (path-based) or `GS_WORKSPACE_NAME` env var, with interactive fallback
- Multi-select for agent frameworks (extensible plugin system, Claude Code included)
- `git-stacks install --hooks --remove` to uninstall hooks
- Idempotent: running install twice updates hooks without duplication
- Merges into existing `.claude/settings.json` without disturbing other keys (permissions, etc.)

**Extensible agent hook plugin system** (`src/lib/agent-hooks/`)
- `AgentHookPlugin` interface for adding new agent framework integrations
- Plugin registry pattern: add a new file + register in `index.ts`
- Generates proper Claude Code nested hooks format (object keyed by event name with matcher groups)

**Test coverage improvements**
- 30 previously-TODO tests implemented across 6 test files (doctor-json, doctor-fix, status-json, sync-json, list-columns, run-parallel)
- Snapshot tests for 7 TUI dashboard components (CenteredDialog, StatusIndicator, BatchBar, ConfirmDialog, HelpOverlay, ProgressView, RepoDetail)

---

## [0.4.1] — 2026-03-21

### Fixed

- **Wizard input width**: text inputs in all wizard dialogs (create workspace, create template) now span the full dialog width via `flexGrow={1}` instead of showing only a few characters
- **Double-nested dialog**: wizard text steps no longer render `InlineInput` (which wraps in its own `CenteredDialog`), eliminating the double-nesting that clipped inputs to ~35% terminal width
- **Git worktree output bleed**: `git worktree add` output (commit messages) no longer bleeds into the TUI — commands now use `.quiet()`
- **Number keys in dialogs**: pressing 1/2/3 or `[`/`]` no longer switches tabs while a wizard, action menu, confirm dialog, or other overlay is active — dialog guards now block all navigation keys

### Added

- **Batch bar on all tabs**: templates and repos tabs now show a selection bar at the bottom of the list when items are selected, matching the workspaces tab pattern
- **Batch bar positioning**: selection bar anchored to bottom of list pane instead of appearing right after the last selected entry

---

## [0.4.0] — 2026-03-21

### Added

**TUI test infrastructure**
- Headless `testRender` + `mockInput` + `captureCharFrame` API for automated TUI testing — 311 tests across 38 files run in CI without a real terminal
- `GIT_STACKS_CONFIG_DIR` environment variable overrides config directory location for test isolation
- App-level integration tests covering tab switching, action menu dispatch, wizard entry/cancel, and sync progress flows

**Workspace sync** (`git-stacks manage` → Workspaces → `s`)
- Sync action in workspace action menu with per-repo progress display
- 30-second fetch timeout on unreachable remotes — TUI never hangs
- Sync summary showing repos synced, skipped, and failed
- Keyboard input blocked during sync to prevent double-dispatch

**Create workspace from TUI** (`git-stacks manage` → Templates → `w` or Repos → `n`)
- Multi-step wizard: select template → enter name → enter branch → summary/confirm
- Back-navigation (Escape goes to previous step) and full cancel
- After creation, cursor positions on the newly created workspace
- Ad-hoc creation from Repos tab with Space multi-select
- All wizard text fields use built-in `<input>` with cursor movement

**Template and repo management from TUI**
- `git-stacks manage` → Repos → Enter opens action menu with create workspace, create template, and remove options
- Template creation from selected repos via Repos tab action menu
- Repo remove with blocked-removal view (shows referencing workspaces/templates)
- Unified `>[x]` checkbox-style selection indicators across all three tabs

**Screen polish**
- Width-tiered help bar: progressive content at 50/65/80/100 column widths — always fits
- Workspace list rows show relative age (`3d`, `2h`, `5m`) instead of ISO date string
- Responsive column widths across all list views — no hard-coded character widths
- 30-second tick timer refreshes relative timestamps automatically

**CenteredDialog overlay architecture**
- All 11 dialog types (action menus, confirms, wizards, progress views, help, messages) render as centered overlays with dimmed background
- Three size variants: small (50%) for confirms/menus, medium (70%) for wizards/progress, large (90%) for help/messages
- Content behind overlays remains visible — split pane stays rendered underneath
- Arrow key + Enter cursor navigation in all action menus

**Integration overrides**
- `git-stacks template new` / `git-stacks template edit` prompt for per-integration overrides (enable/disable/configure per integration)
- `git-stacks new` / `git-stacks clone` prompt for per-workspace integration overrides with cascade-aware pre-selection
- `git-stacks edit <name>` — new command to modify workspace integration overrides post-creation
- Integration cascade: global → template → workspace; overrides stored conditionally in YAML (no key when user declines)
- TUI detail panes show resolved integration state with source annotations (`[global]`, `[template]`, `[workspace]`, `[skipped: no matching repos]`) and config values inline

**Prerequisites**
- `InlineInput` rewritten to wrap OpenTUI built-in `<input>` — gains cursor movement, selection, undo/redo for free
- `runHooksCaptured()` in `lifecycle.ts` — streams hook stdout/stderr via callback instead of `stdio: "inherit"`, preventing OpenTUI screen corruption

### Fixed

- InlineInput no longer uses hand-rolled `useKeyboard` character accumulation — all text fields use built-in `<input>` component
- Keyboard isolation: input-mode guard placed above all navigation handlers to prevent key leaks when `<input>` is focused
- Deferred focus pattern (`setTimeout(() => setFocused(true), 0)`) prevents trigger keypress from leaking into newly mounted inputs
- Bun `mock.module` cross-file cache collision resolved via query-parameter cache-busting

---

## [0.3.0] — 2026-03-20

### Added

**Workspace notification system**
- `git-stacks message send "<text>"` — send a notification to the current workspace (auto-detected via `GS_WORKSPACE_NAME`); use `--workspace <name>` to target explicitly
- `git-stacks message send --from <sender>` — tag message with a sender name (useful for per-agent granularity in hook scripts)
- `git-stacks message list [--workspace <name>]` — list active notifications showing sender, text, and timestamp; supports `--json`
- `git-stacks message clear [--workspace <name>] [--from <sender>]` — clear all messages or per-sender
- Messages are durable JSONL files at `~/.config/git-stacks/messages/{workspace}.jsonl`; survive TUI restarts
- `message send` exits 0 when the TUI is not running — IPC push is silently dropped, file write still succeeds

**Dashboard overhaul** (`git-stacks manage`)
- Tabbed layout: Workspaces | Templates | Repos — switch with `1`/`2`/`3` or `[`/`]`
- Split list + detail pane per tab — detail pane updates reactively as cursor moves; no Enter required
- Independent cursor position and filter state per tab
- Workspaces tab: full action menu (open, rename, merge, run, clean, remove, edit YAML in `$EDITOR`)
- Templates tab: edit in `$EDITOR`, clone, remove
- Repos tab: repo registry browser with disk health indicator (path exists vs missing)
- Persistent context-sensitive help bar; `?` opens scrollable keybinding reference overlay
- `Esc` navigates back consistently (action menu → list, overlay → split)

**IPC push message display**
- Workspace list rows show live notification preview — most recent sender, truncated text, relative age (e.g., "2m ago")
- Workspace detail pane shows notifications grouped by sender, newest first per sender
- `c` key clears a sender's messages from the detail pane
- `m` key opens full-screen MessageOverlay with grouped sender view, cursor navigation, and `c`-to-clear
- IPC socket status indicator (●/○) in help bar for socket health visibility
- 30-second tick timer refreshes relative timestamps automatically

**Shell completion overhaul**
- `--strategy` flag completes to `rebase | merge`
- `--sort` flag completes to `date | name | status`
- `--workspace` flag on all `message` subcommands completes with workspace names
- Full `message send|list|clear` subcommand tree coverage in bash, zsh, and fish
- All previously supported dynamic completions (workspace, template, repo names) preserved

### Fixed

- OpenTUI nested `<text>` crash in TemplateList/RepoList — root cause identified and eliminated; multi-colored row segments now use `<box flexDirection="row">` with sibling `<text>` elements
- Tab switching key-press freeze — resolved by height-based visibility pattern instead of DOM conditional swapping
- Batch selection keys (`Space`, etc.) no longer bleed across tabs — scoped to Workspaces tab only
- Rename view stays on progress on error; resets to list on success
- Relative time display in message previews updates without manual `R` refresh
- IPC socket stale detection: always unlinks on startup instead of Bun.connect probe (eliminates hang)

---

## [0.2.0] — 2026-03-18

### Changed (Breaking)

- **Stack model replaced by Registry + Template model** — existing `~/.config/git-stacks/stacks/` configs are not migrated. Run `git-stacks repo scan` and `git-stacks template new` to recreate.

### Added

- **Repo Registry** — `git-stacks repo add|scan|list|show|remove|rename` manages a flat list of local repos at `~/.config/git-stacks/registry.yml`
- **Templates** — `git-stacks template new|list|show|edit|clone|rename|remove` manages workspace recipes at `~/.config/git-stacks/templates/{name}.yml`
- File ops engine — copy/symlink with glob patterns at workspace-instance and per-repo levels; idempotent
- `git-stacks -V` shows `package.json` version + git hash + `-dirty` flag
- `--dry-run` / `--force` flags on `remove`, `clean`, `merge`, `rename`; external file warnings before teardown
- `--json` output on `status`, `doctor`, `sync`
- `doctor --fix` — auto-repairs drift between config and filesystem
- `run --parallel` — run commands across workspace repos concurrently
- `formatError` with actionable hints throughout CLI

### Fixed

- Atomic merge/remove/rename operations (no partial state on failure)
- `mergeNoFF` detached HEAD bug
- `openWorkspace()` lifecycle properly called when user chooses "open now?" during `new`
- Typed `Workspace` object in new workspace flow

---

## [0.1.x] — pre-v0.2.0

Initial Stack-model implementation. Replaced in v0.2.0.
