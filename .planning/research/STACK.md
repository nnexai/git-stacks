# Stack Research

**Domain:** Bun CLI tool — v0.14.0 Workflow Completion & Workspace UX (push, ahead/behind, labels, secrets, stash)
**Researched:** 2026-04-03
**Confidence:** HIGH (all patterns verified against existing codebase, Bun docs, and secret-tool CLIs)

---

## Scope

This document covers **only what is new or changed for v0.14.0**. The base stack (Bun runtime, TypeScript strict, Commander.js, SolidJS + OpenTUI, yaml, @clack/prompts, Zod v4) is unchanged and not re-researched. Prior STACK.md entries for AeroSpace, Zod schema patterns, and the `_exec` injectable pattern are also stable and not revisited.

**Five feature areas this milestone adds:**

1. `git-stacks push` — push workspace branches to remote
2. Ahead/behind tracking — `getCommitsAhead` mirror to existing `getCommitsBehind`
3. Labels / Grouping — schema-additive field on Workspace and Template
4. Secrets / Env Var References — pluggable resolver subsystem, external CLI tools
5. `--stash` on Sync — `stashPush` / `stashPop` git primitives

---

## Current Dependency Versions (from package.json — verified 2026-04-03)

| Package | Version | Notes |
|---------|---------|-------|
| zod | ^4.3.6 | Strict mode schemas; `.optional()` for additive fields |
| yaml | ^2.8.3 | YAML I/O unchanged |
| commander | ^14.0.3 | CLI framework; `--label`, `--stash`, `--force-with-lease` flags |
| @clack/prompts | ^1.2.0 | Interactive prompts for label input in workspace wizard |
| @opentui/core | ^0.1.96 | TUI dashboard; label tag rendering, group-by toggle |
| typescript | ^6.0.2 | Strict mode enforced throughout |
| bun | (runtime) | `$` shell, `Bun.spawn`, `Bun.file`, `existsSync` |

**No new npm dependencies are needed for any of the five features.**

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Bun `$` shell (`.quiet().nothrow()`) | runtime | All new git primitives: `pushBranch`, `stashPush`, `stashPop`, `getCommitsAhead` | Consistent with existing `pullFFOnly`, `getCommitsBehind`, `fetchOrigin` — same error-handling pattern; structured exit code checking without subprocess boilerplate |
| Bun `$` shell with env prefix | runtime | Secret resolver subprocess execution (`op`, `doppler`, `pass`, `cmd`) | `await $`OP_BIOMETRIC_UNLOCK_ENABLED=0 op read ${path}`.quiet().nothrow()` — env var prefix is the correct Bun Shell pattern for per-command environment injection (same as existing `GIT_TERMINAL_PROMPT=0` usage) |
| Zod v4 `.optional()` | ^4.3.6 | `labels` field on `WorkspaceSchema` and `TemplateSchema` | Zero-migration: existing workspace YAML files without `labels` parse with `undefined`; no `z.preprocess` needed |
| Zod v4 `z.string().regex(...)` | ^4.3.6 | Label character validation: `/^[A-Za-z0-9._:-]+$/` | Blocks path traversal and shell metacharacters at schema parse time; consistent with existing `NameSchema` pattern in `config.ts` |
| `fs.statSync` / `existsSync` | node:fs (Bun built-in) | Staleness check: mtime of `.git/FETCH_HEAD` vs 15-minute threshold | Already used in codebase (`existsSync` in `git.ts`); `statSync().mtimeMs` gives last-fetch timestamp without any new dependency |
| `Promise.all` | built-in | Parallel push across repos; parallel ahead/behind per repo | Existing pattern in `syncWorkspace` and `getWorkspaceListInfo`; repos are independent — no ordering constraint |

### Supporting Libraries

No new npm packages required. All capabilities fall within the existing Bun + Zod + yaml stack.

| Capability | Mechanism | Existing Parallel |
|------------|-----------|-------------------|
| Commit counting (ahead) | `git rev-list --count base..head` via `$` | `getCommitsBehind` uses `head..base` — mirror with swapped args |
| Push with force flags | `git push [-u] [--force\|--force-with-lease] origin <branch>` via `$` | `pullFFOnly` for error-parsing pattern |
| Stash push/pop | `git stash push --include-untracked` / `git stash pop` via `$` | Same `.quiet().nothrow()` + exit code check pattern |
| Secret availability check | `which op` / `which doppler` via `$` | Doctor checks use the same availability gate pattern |
| Label persistence | `labels: string[]` field in workspace YAML | Same `readWorkspace` / `writeWorkspace` YAML round-trip |
| Label filtering | Array `.every()` / `.some()` on `ws.labels` | Same filter pattern as existing `--template` and CWD detection |

---

## Feature-Specific Stack Decisions

### 1. Push (`git-stacks push`)

**Pattern:** Mirror `pullFFOnly` exactly. Parse `stderr` for structured failure reasons.

Key stderr substrings to detect in `pushBranch`:
- `"rejected"` + `"fetch first"` → non-fast-forward (remote has new commits)
- `"rejected"` + `"stale info"` → `--force-with-lease` rejection (remote advanced since last fetch)
- `"does not appear to be a git repository"` → no remote configured
- `"Authentication failed"` / `"Permission denied"` → auth failure

```typescript
// Error-parsing pattern — mirrors pullFFOnly
const stderr = result.stderr.toString()
if (stderr.includes("rejected") && stderr.includes("fetch first")) {
  return { ok: false, reason: "non-fast-forward: pull or use --force-with-lease" }
}
```

**Parallelism:** `Promise.all` across worktree repos. Trunk repos skip unconditionally. Dry-run computes `git rev-list --count origin/<branch>..HEAD` to report pending commit count without pushing.

**Confidence:** HIGH — pattern directly mirrored from `pullFFOnly` in `src/lib/git.ts:137-169`.

### 2. Ahead/Behind Tracking

**Pattern:** `getCommitsAhead` is a one-line mirror of `getCommitsBehind` with swapped range operands.

```typescript
// getCommitsBehind: head..base (commits base has that head doesn't)
// getCommitsAhead:  base..head (commits head has that base doesn't)
const result = await $`git -C ${repoPath} rev-list --count ${base}..${head}`.quiet().nothrow()
```

**Staleness detection:** Use `statSync` on `.git/FETCH_HEAD`. If `mtimeMs` is older than 15 minutes (900_000 ms) or the file does not exist, set `aheadBehindStale: true`. No new dependency.

```typescript
import { statSync, existsSync } from "fs"

function isFetchStale(repoPath: string): boolean {
  const fetchHead = join(repoPath, ".git", "FETCH_HEAD")
  if (!existsSync(fetchHead)) return true
  return (Date.now() - statSync(fetchHead).mtimeMs) > 900_000
}
```

**Confidence:** HIGH — `getCommitsBehind` already in `src/lib/git.ts:249-257`; `statSync` is Node.js API available in Bun runtime.

### 3. Labels / Grouping

**Schema addition — zero migration risk:**

```typescript
// In WorkspaceSchema and TemplateSchema — additive only
labels: z.array(
  z.string().regex(/^[A-Za-z0-9._:-]+$/, "Label may only contain letters, digits, dots, colons, hyphens, underscores")
).optional()
```

Existing workspace YAML files without `labels` parse as `undefined` — no migration scripts needed. The regex blocks shell metacharacters (`$`, `(`, `)`, `*`, `&`, etc.) consistent with the existing `NameSchema` security pattern.

**TUI grouped view:** Pure SolidJS derived signal — no new library. Group by label using `createMemo` over the flat workspace list. Workspaces with multiple labels appear in multiple groups. Unlabeled workspaces collect under a synthetic `[unlabeled]` group. Toggle state is a local `createSignal<boolean>`.

**Filter extension:** The existing `/` filter compares against `ws.name`. Extend to also check `ws.labels?.some(l => l.includes(filterText))`. The `label:` prefix strips the prefix and matches only labels.

**Confidence:** HIGH — schema pattern verified against existing `WorkspaceSchema` in `src/lib/config.ts`; Zod v4 `.optional()` behavior confirmed.

### 4. Secrets / Env Var References — Key Stack Decisions

This is the highest-complexity feature. The correct implementation choices:

**Subprocess model for external resolvers: Use Bun `$` shell, NOT `Bun.spawn`**

Rationale: All five resolvers need only stdout capture and exit code checking. `$`cmd`.quiet().nothrow()` provides exactly this with the same API as all other git operations. `Bun.spawn` with `ReadableStream` stdout requires async conversion and adds boilerplate. Reserve `Bun.spawn` for hook execution where `stdio: "inherit"` is needed.

**The TTY problem with `op read` (1Password CLI) — HIGH severity pitfall:**

The 1Password CLI is sensitive to whether stdin is a TTY. When spawned as a subprocess with piped stdin (which is what `$` does), `op` may hang waiting for a biometric prompt that can never appear on a non-TTY pipe. This is a known issue in the community (1Password Community discussion "1Password CLI is fussy about TTYs").

**Mitigation (must be implemented):**

1. Set `OP_BIOMETRIC_UNLOCK_ENABLED=0` in the subprocess environment. This forces `op` to fall back to service-account token authentication via `OP_SERVICE_ACCOUNT_TOKEN` env var instead of biometric.
2. Document clearly: personal-account `op read` in subprocess context requires either `OP_SERVICE_ACCOUNT_TOKEN` or `OP_SESSION_*` token set in the user's environment. If neither is present, `op` will fail (exit non-zero) rather than hang — which is the correct behavior for a CLI tool.
3. Detection: check `OP_SERVICE_ACCOUNT_TOKEN` or `OP_SESSION_*` env vars are set before attempting resolution; surface a helpful error if missing.

```typescript
// op resolver — correct subprocess invocation
const result = await $`OP_BIOMETRIC_UNLOCK_ENABLED=0 op read ${path}`.quiet().nothrow()
if (result.exitCode !== 0) {
  const err = result.stderr.toString().trim()
  if (err.includes("session") || err.includes("auth") || err.includes("sign in")) {
    throw new Error(`op: not authenticated. Set OP_SERVICE_ACCOUNT_TOKEN or run 'op signin'. ${err}`)
  }
  throw new Error(`op read failed (exit ${result.exitCode}): ${err}`)
}
return result.stdout.toString().trim()
```

**Doppler resolver:** Clean subprocess behavior. `doppler secrets get <KEY> --project <proj> --config <cfg> --plain` exits 0 on success, non-zero with error on stderr on failure. No TTY issues. Auth via `DOPPLER_TOKEN` env var (set by user's shell config).

**`pass` resolver:** Depends on `gpg-agent` passphrase caching. If the GPG passphrase is not cached, `pass show` will block on a pinentry prompt. Mitigation: document that `pass` resolver requires `gpg-agent` to have the passphrase cached (standard behavior after first unlock). The tool should detect hang risk by checking `GPG_AGENT_INFO` or `SSH_AUTH_SOCK` is set, and fall through to a clear error if not.

**`env` resolver:** Pure `process.env[path]` — no subprocess at all. Always safe. Return `""` with warning if env var not set (rather than throwing), since the variable may be intentionally empty.

**`cmd` resolver:** `sh -c ${path}` via `$`. Last-resort escape hatch. Must trim trailing newline from stdout.

**Tool availability check:** Use `which <tool>` via `$` with `.quiet().nothrow()`. Exit code 0 = available. This is the same pattern used in `doctor.ts` for forge CLI checks.

```typescript
async function isToolAvailable(tool: string): Promise<boolean> {
  const r = await $`which ${tool}`.quiet().nothrow()
  return r.exitCode === 0
}
```

**`resolveSecrets` is async and sequential per key, not parallel.** Secret resolution is I/O-bound and order-independent, but parallel subprocess spawning of 10+ `op read` calls would thrash the 1Password agent. Sequential resolution is safer and simpler. If performance is needed later, batch-per-resolver grouping is the right optimization.

**Confidence:** HIGH for `env` and `cmd` resolvers (pure Bun patterns). MEDIUM for `op` (TTY mitigation strategy derived from community reports + official OP_BIOMETRIC_UNLOCK_ENABLED env var). MEDIUM for `pass` (GPG agent caching requirement derived from multiple community sources). HIGH for `doppler` (standard CLI scripting behavior).

### 5. Auto-Stash on Sync

**No new patterns required.** `stashPush` and `stashPop` follow the exact same `.quiet().nothrow()` + exit code + stderr pattern as all other git primitives.

**Conflict detection in `stashPop`:** Parse `result.stdout` for `"CONFLICT"` substring. Git writes conflict markers to stdout (not stderr) during `stash pop`. Exit code 1 with `"CONFLICT"` in output = conflict. Exit code 1 without `"CONFLICT"` = other error.

```typescript
export async function stashPop(repoPath: string): Promise<{ ok: boolean; conflict?: boolean; error?: string }> {
  const result = await $`git -C ${repoPath} stash pop`.quiet().nothrow()
  if (result.exitCode === 0) return { ok: true }
  const out = result.stdout.toString() + result.stderr.toString()
  if (out.includes("CONFLICT")) return { ok: false, conflict: true, error: out.trim() }
  return { ok: false, conflict: false, error: result.stderr.toString().trim() }
}
```

**`--stash` flag incompatibility with `--dry-run`:** Enforce at Commander.js parse time with a mutual-exclusion check. Exit with error message, not exception.

**Confidence:** HIGH — pattern mirrors existing `mergeNoFF` failure handling; stash conflict output format is stable across git versions.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any new npm package | All five features are covered by existing Bun + Zod + yaml stack | Existing patterns |
| `node-keytar` or OS keychain library | Secret resolution is done by delegating to external CLIs (`op`, `doppler`, `pass`), not by reading the keychain directly | External CLI subprocess pattern |
| `Bun.spawn` with `ReadableStream` for secret CLIs | Requires async stream-to-string conversion; `$`cmd`.quiet().nothrow()` gives stdout as buffer with one API call | `$` shell with `.quiet().nothrow()` |
| `Bun.spawn` with `stdout: "pipe"` in tests | Known Bun issue #24690: `Bun.spawn` with `stdout: "pipe"` returns empty output inside `bun test` | Mock the resolver functions via injectable `_exec`-style pattern |
| `op inject` (batch template injection) | `op inject` is for template file processing; `resolveSecrets` resolves individual values already parsed from YAML — `op read` per-value is correct and matches the resolver interface | Per-value `op read` calls |
| Biometric PTY allocation (`terminal` option in `Bun.spawn`) | Adds complexity; requires POSIX only; correct fix is `OP_BIOMETRIC_UNLOCK_ENABLED=0` + service account token | `OP_BIOMETRIC_UNLOCK_ENABLED=0` env var |
| Global `process.env` mutation for resolver env vars | Leaks into the entire process; affects subsequent operations | Per-command env var prefix in `$` shell: `$`VAR=val cmd`` |
| Dynamic schema migration for labels | `labels` is purely additive with `.optional()` — no migration needed | `.optional()` on existing schemas |
| `git stash list --format` parsing for stash ref tracking | Feature spec only needs push/pop behavior; stash ref in `stashPush` return value is for logging only | Parse `stashPush` stdout for `"stash@{N}"` pattern from git output |

---

## Integration Points with Existing Architecture

| New Feature | Inserts Into | After / Before |
|-------------|--------------|----------------|
| `pushBranch` | `src/lib/git.ts` | After `pullFFOnly` — same file section, same pattern |
| `pushWorkspace` | `src/lib/workspace-ops.ts` | Alongside `syncWorkspace` — same file, `Promise.all` parallelism |
| `getCommitsAhead` | `src/lib/git.ts` | Immediately after `getCommitsBehind` (line 257) — one-liner mirror |
| `isFetchStale` | `src/lib/git.ts` or `workspace-ops.ts` | Helper used by `getWorkspaceListInfo` |
| `labels` field | `src/lib/config.ts` — `WorkspaceSchema` + `TemplateSchema` | Additive only; no change to read/write functions |
| `git-stacks label` command | `src/commands/workspace.ts` or new `src/commands/label.ts` | Registered in `src/index.ts` |
| `src/lib/secrets.ts` | New file | Called from `workspace-ops.ts:openWorkspace` after `mergeEnv()`, before `writeEnvFiles()` |
| `resolveSecrets()` call site | `src/lib/workspace-ops.ts:openWorkspace` (line ~842) | After `mergeEnv(wsWithPorts)`, before `writeEnvFiles(...)` |
| `stashPush`, `stashPop` | `src/lib/git.ts` | New section after existing stash-adjacent code |
| `--stash` option | `src/commands/workspace.ts:sync` + `merge` | Commander option registration; passed into `syncWorkspace` opts |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| External CLI subprocess for secrets (`op`, `doppler`, `pass`) | Native library bindings or direct API clients | External CLIs handle auth, credential storage, token refresh — reimplementing this is high complexity with no benefit; CLI delegation is the standard pattern for secret managers |
| `OP_BIOMETRIC_UNLOCK_ENABLED=0` + document service account requirement | Allocate a PTY for `op` subprocess | PTY allocation is POSIX-only, adds `Bun.Terminal()` dependency, still requires authenticated session; service account pattern is cleaner for automation |
| Sequential secret resolution | Parallel `Promise.all` for all secret refs | Parallel `op read` calls would spawn multiple authenticated requests to 1Password agent simultaneously; the agent serializes them anyway; parallel adds startup overhead with no throughput benefit for typical 5-10 env vars |
| `z.string().regex(...)` for label validation | Validation in command handler | Schema-level validation catches invalid labels from any code path (CLI, TUI wizard, YAML edit); consistent with `NameSchema` pattern |
| `statSync` mtime for fetch staleness | Store last-fetch timestamp in workspace YAML | `.git/FETCH_HEAD` mtime is already updated by every `git fetch` — no additional writes needed; workspace YAML would diverge from actual git state |
| `$`cmd`.stdout.toString().trim()` for secret output | `new Response(stdout).text()` | `$` shell returns buffered output directly; `Response` conversion is only needed for `Bun.spawn` ReadableStream stdout |

---

## Version Compatibility

| Component | Requires | Notes |
|-----------|----------|-------|
| `git stash push --include-untracked` | Git 2.13+ | Available in all supported Git versions (requirement is 2.24+) |
| `git rev-list --count base..head` | Git 1.7.5+ | Stable; same command as `getCommitsBehind` |
| `git push --force-with-lease` | Git 1.8.5+ | Stable |
| `OP_BIOMETRIC_UNLOCK_ENABLED` env var | 1Password CLI v2+ | Documented in official CLI docs; toggles biometric in CLI invocations |
| `doppler secrets get --plain` | Doppler CLI any recent | Stable flag; exits non-zero on missing secret by default |
| `statSync` | Node.js API (Bun built-in) | Available; `existsSync` already used in `git.ts` |
| `z.string().regex(...)` | Zod v4 | `.optional()` behavior unchanged from v3 |

---

## Installation

No new npm packages. All capabilities are within the existing dependency set.

```bash
# No new dependencies for v0.14.0
```

---

## Sources

- `/home/nnex/dev/prj/git-stacks/src/lib/git.ts` — `getCommitsBehind` (line 249), `pullFFOnly` (line 137), `fetchOrigin` (line 129), `existsSync` usage — direct file read (HIGH confidence)
- `/home/nnex/dev/prj/git-stacks/src/lib/workspace-ops.ts` — `mergeEnv` (line 108), `writeEnvFiles` (line 148), call site at line 842, `Promise.all` parallelism pattern — direct file read (HIGH confidence)
- `/home/nnex/dev/prj/git-stacks/package.json` — Confirmed `zod ^4.3.6`, `commander ^14.0.3`, `@clack/prompts ^1.2.0`, `bun` runtime — direct file read (HIGH confidence)
- `bun.com/docs/runtime/shell` — `$` shell `.quiet().nothrow()` API, per-command env var prefix syntax, stdout as buffer — official docs (HIGH confidence)
- `bun.com/reference/bun/spawn` — `Bun.spawn` ReadableStream stdout, `terminal` PTY option (POSIX-only) — official docs (HIGH confidence)
- `github.com/oven-sh/bun/issues/24690` — `Bun.spawn` with `stdout: 'pipe'` returns empty output inside `bun test` — known issue (MEDIUM confidence, issue tracker)
- `developer.1password.com/docs/cli/secrets-scripts/` — `op read` in scripting context; service account recommendation — official 1Password docs (MEDIUM confidence — full exit code spec not published)
- `1password.community/discussion/131365` — "1Password CLI is fussy about TTYs" — `op` hangs when stdin is not TTY and biometric is enabled; `OP_BIOMETRIC_UNLOCK_ENABLED=0` workaround — community discussion (MEDIUM confidence)
- `docs.doppler.com/docs/accessing-secrets` — `doppler secrets get <KEY> --plain` syntax; `--no-exit-on-missing-secret` flag confirming default non-zero exit on missing — official Doppler docs (HIGH confidence)
- `passwordstore.org` + `github.com/twpayne/chezmoi/issues/784` — `pass show` requires gpg-agent passphrase cache; `exit status 2` in SSH/non-interactive shells — official pass docs + chezmoi issue tracker (MEDIUM confidence)

---

*Stack research for: git-stacks v0.14.0 — push, ahead/behind, labels, secrets, stash*
*Researched: 2026-04-03*
