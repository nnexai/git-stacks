# Stale Workspaces

The Stale Workspaces view is an advisory review surface for deciding what to inspect next. It explains evidence that a workspace may no longer be active; it does not decide that cleanup is safe. Nothing is changed automatically.

The feature is available in the browser client and the optional OpenTUI dashboard. There is no `git-stacks stale` CLI command in this release candidate.

## Qualification policy

The inactivity cutoff is fixed at 30 days. A workspace qualifies for the inactivity reason only when its authoritative activity time is strictly older than 30 days at evaluation time. Activity exactly 30 days old does not qualify.

A workspace enters **Cleanup candidates** only when at least one confirmed reason is present. The five reason codes are merged change, closed change, deleted remote branch, missing managed worktree, and inactivity. Provider-specific labels make the change reasons explicit:

| Confirmed reason | Meaning and timestamp |
|---|---|
| Pull request merged | A validated GitHub.com pull request is merged. `Merged` uses the provider event time. |
| Merge request merged | A validated GitLab.com merge request is merged. `Merged` uses the provider event time. |
| Pull request closed | A validated GitHub.com pull request is closed without merge. `Closed` uses the provider event time. |
| Merge request closed | A validated GitLab.com merge request is closed without merge. `Closed` uses the provider event time. |
| Remote branch missing | The configured branch was confirmed absent from `origin` for one named repository. `Confirmed missing` uses the observation time, not a fabricated deletion time. |
| Managed worktree missing | A managed worktree was confirmed missing for one named repository. `Confirmed missing` uses the observation time, not a fabricated removal time. |
| Inactive for *N* days | Authoritative `activity_at` is strictly beyond the fixed cutoff. `Last activity` uses that authoritative time. |

Open changes do not qualify. Repeated observations of the same reason for the same repository are deduplicated; distinct reason types and repository scopes remain visible.

Remote-branch and worktree evidence is repository-scoped. A missing branch or worktree in one repository never proves that the whole workspace is safe to archive or remove.

### Cautions are not reasons

The view can show these cautions separately:

- uncommitted work;
- local commits ahead of the tracked branch;
- workspace file drift;
- workspace notes.

Cautions neither qualify nor suppress a candidate. They are inspection context only.

## Candidate order and incomplete evidence

The service provides one transparent order; web and TUI do not recalculate or score it:

1. more confirmed reasons first;
2. stronger terminal evidence first: merged, closed, remote branch missing, then managed worktree missing;
3. mixed or terminal evidence before inactivity-only candidates;
4. oldest valid activity first;
5. normalized workspace name and stable workspace ID as deterministic tie-breakers.

The UI displays no rank number and no confidence or safety score. Ordering is a review aid, not a deletion recommendation.

A candidate may contain confirmed reasons and unknown evidence at the same time. The confirmed reasons keep it in the candidate list, while every failed or unavailable probe remains visible under **Unknown evidence**.

An unknown-only workspace appears under **Evaluation incomplete**, never among cleanup candidates. Unknown means the service could not establish the fact; it is not converted into confirmed absence, confirmed presence, or proof of staleness. Typical sanitized causes include invalid provenance, unsupported provider or host, missing provider tooling, authentication required, rate limiting, timeout, cancellation, provider unavailability, malformed or oversized output, a failed remote check, an inaccessible worktree, or unavailable activity.

Workspaces without forge source provenance still receive local activity, managed-worktree, remote-branch, and caution evaluation. Incomplete rows can always use Open, but this surface withholds cleanup actions until a confirmed stale reason exists.

## Refresh, cache, and revision behavior

Stale evaluation is lazy and revision-bound. Opening the view requests a separate service projection; the base workspace snapshot does not perform provider work, and there is no background polling.

Forge-status and remote-branch network outcomes stay in volatile service memory for five minutes. Explicit Refresh bypasses that cache and starts the same bounded evidence path. Local activity, worktree, and caution facts are rebuilt from the captured authoritative read model for every evaluation. Probe results are not written to workspace YAML or any durable client store, and restarting the service naturally clears the cache.

The active web overlay presents scoped `[R]` as **Refresh evidence**. It has no browser-global binding and does not intercept terminal input. A refresh already in flight ignores repeated refresh input rather than queuing another probe. The TUI uses `[r]` for the same shared action.

If the requested revision is stale, the service rejects the request before probing. The client reloads authoritative workspace state and retries once. Older or slower generations cannot replace a newer accepted result. A failed refresh retains the last successful response and its checked time; a first-load failure fabricates no rows.

## Web entry, focus, and shortcuts

The web toolbar places **Stale workspaces** next to **Archived**. At compact widths it remains available through the labelled toolbar control.

The canonical shortcut registry supplies the default entry bindings:

- macOS: `Ctrl+Command+S`;
- Linux: `Ctrl+Alt+Shift+S`.

The entry is rebindable or unbindable through shortcut settings and participates in collision validation. Repeating the entry shortcut refocuses the singleton overlay instead of opening another copy.

The overlay contains focus, supports Escape and a visible Close control, and restores the exact valid invoker or nested terminal input when cancelled. While xterm is focused, a matched registered application shortcut is consumed once; unmatched keys, AltGraph, IME/composition, dead keys, and non-US input continue to the PTY unchanged. The unmodified active-overlay `[R]` refresh key is intentionally not global and is not handled from xterm or editable controls.

## TUI entry, navigation, and size tiers

From the normal Workspaces view:

- `[s]` opens or refocuses Stale Workspaces;
- `↑`/`↓` or `j`/`k` moves without wrapping;
- Home/End jumps to the first or last row;
- PageUp/PageDown scrolls evidence detail;
- `[o]` or Enter runs Open workspace;
- `[a]` opens Workspace actions for a confirmed candidate only;
- `[r]` refreshes evidence;
- Escape returns to the originating workspace row.

The dedicated `UIView` owns these keys before dashboard navigation, dialogs, or input fields can receive them. Lifecycle confirmations and operations retain their existing key ownership, so stale-view keys do not leak through.

Layout adapts without changing policy:

- 80 columns or wider: candidate list and evidence detail are side by side;
- 56–79 columns: list and detail are stacked;
- below 56 columns: one full-width selected row and wrapped detail;
- below 40 × 12: a resize message and Escape are the only accepted actions.

## Canonical Open and lifecycle actions

The canonical Open action is the first inspection path. Archive, Remove, and Force Remove continue to use the existing service-owned lifecycle descriptors and confirmations. Stale evidence grants no lifecycle authority.

### Open

Open submits the existing one-shot durable operation. Web and TUI select or navigate to the workspace only after authoritative success. Failure leaves the stale row and evidence in place; reconnect observes a returned operation ID and never replays ambiguous intent.

### Archive

Archive uses the canonical no-confirmation descriptor, stops and confirms service-owned terminals before persisted mutation, and reconciles authoritative workspace state. The existing Undo archive action remains available. Unarchive restores the workspace but does not recreate stopped terminals.

### Remove

Remove uses the canonical confirmation and inventory of terminals, managed worktrees, workspace directory, and YAML definition. The safe action has initial focus. Terminal shutdown and the dirty-worktree guard run before deletion; stale revision, terminal failure, malformed state, and other non-dirty failures do not enable Force Remove.

### Force Remove

Force Remove is absent from the initial stale action menu. It can appear only after normal Remove returns a fresh typed `workspace_dirty` result for the current revision with terminals stopped and force explicitly allowed, followed by a fresh service inventory. The confirmation requires the exact, case-sensitive current workspace name and submits once. Branch, worktree, or stale evidence alone can never authorize it.

After any lifecycle terminal result, clients refresh normal workspace state and stale evidence once before settling the UI. If reconciliation fails, actions remain locked for Retry; the mutation is not replayed.

## Provider boundary

Change status is read-only and runs only from validated persisted provenance containing provider, canonical host, repository identity, change type, and positive change number.

Supported status lookup is limited to:

- GitHub.com pull requests: merged, closed, or open;
- GitLab.com merge requests: merged, closed, or open.

The implementation does not infer pull-request or merge-request identity from branch names or remotes, search a provider, create checkout refs, close or merge a change, comment, label, edit, or perform any provider mutation. Only validated persisted provenance can start the bounded argv-only status command.

Gitea change-status lookup is deferred and returns a sanitized unsupported-provider unknown. The separate existing Gitea integration and URL parsing do not imply stale-status support. Self-hosted GitHub/GitLab status is not claimed because this candidate has no explicit supported-host list or exact-candidate evidence for named hosts.

Missing `gh` or `glab`, authentication failures, rate limiting, timeouts, cancellation, malformed or oversized responses, and provider outages become finite sanitized unknown results. Raw command output, exceptions, arguments, credentials, or secret-bearing URLs are never projected to the clients.

## Configured shell and SSH-agent behavior

Commands, hooks, configured-command terminals, and ordinary browser PTYs use the user's configured Bash, zsh, or fish instead of substituting `/bin/sh` semantics.

- Bash runs as an interactive login shell with `--login -i`.
- zsh runs as an interactive login shell with `-l -i`.
- fish runs as an interactive login shell with `--login --interactive`.

Profile-defined aliases, functions, runtime-manager setup, quoting behavior, and `PATH` therefore match the supported configured shell. Configured non-PTY commands run their unchanged command after profile initialization and after the authoritative environment overlay is applied. Startup diagnostics are kept separate from command output, initialization is bounded, cancellation terminates the process group, and failures include a fixed recovery description.

For Bash, parent-exported `BASH_FUNC_*` entries are removed before startup so they cannot replace bootstrap primitives; functions defined normally by the user's login profile still work.

Trusted local launchers may refresh only `PATH` and `SSH_AUTH_SOCK` in volatile service memory. A refreshed `SSH_AUTH_SOCK` applies to future commands and PTYs, so `ssh-add` addresses the newly selected agent. A process that was already running keeps its original environment and agent connection. Clearing the socket removes it from future launches instead of falling back to a stale value. Raw `PATH`, `SSH_AUTH_SOCK`, keys, and `ssh-add` output are not persisted to YAML or projected to the browser.

## Migration and configuration boundary

There is no migration step for this feature. This release makes no YAML schema change, no identity model change, no threshold setting, no database, no ORM, no browser storage, and no persisted evidence cache.

Existing schema-version-1 workspace files remain valid. The fixed threshold is product policy, not a setting. Existing workspaces need no source metadata to receive local evidence; validated source provenance only enables the optional GitHub.com or GitLab.com status reason. A service restart discards the volatile network cache and rebuilds evidence on demand.

## Security and privacy boundary

The browser projection never receives machine paths, credentials, raw environment values, bearer material, provider argv, stdout, stderr, or raw exceptions. Browser product data does not use HTTP, SSE, WebSocket, cookies, or browser storage; it continues over the pinned authenticated WebTransport session.

The TUI consumes the trusted service contract and does not independently scan workspace YAML, Git repositories, provider CLIs, or lifecycle state. It may receive trusted machine state needed for its explicit handoffs, but it does not create a second stale policy or mutation authority.

Evaluation and Refresh are read-only. They never close terminals, write YAML, archive, remove, create worktrees, or mutate provider state.

## Deferred scope

The following are deliberately deferred:

- the CLI stale command is deferred;
- Gitea change-status parity is deferred;
- a configurable threshold is deferred;
- provider search, branch-name inference, and remote inference are deferred;
- background/global polling and a persisted evidence cache are deferred.

These deferrals keep the first release candidate conservative and explainable without silently expanding configuration, migration, provider, or cleanup authority.
