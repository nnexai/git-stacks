# Phase 87: Integration Contract and Source-Module Coverage - Patterns

**Mapped:** 2026-05-15
**Status:** Complete

## Source Surfaces

| Role | Source Files | Existing Tests | Notes |
|------|--------------|----------------|-------|
| Issue utility contracts | `src/lib/integrations/issue-utils.ts` | `tests/lib/integrations/issue-utils.test.ts` | Current test inlines source logic to defeat stale mocks; replace with real import against mocked config/status dependencies. |
| Forge utility contracts | `src/lib/integrations/forge-utils.ts` | `tests/lib/integrations/forge-utils.test.ts` | Current test inlines source logic; real source export already has injectable `_detect`. |
| Forge command contracts | `src/lib/integrations/github.ts`, `gitlab.ts`, `gitea.ts`, `jira.ts` | `tests/lib/integrations/github.test.ts`, `gitlab.test.ts`, `gitea.test.ts`, `jira.test.ts` | Existing command tests use `_exec` seams and Commander `exitOverride()`. |
| Session integrations | `src/lib/integrations/tmux.ts`, `cmux.ts` | `tests/lib/integrations/tmux.test.ts` | Add or extend `cmux` plugin-level tests and pane-layout contracts. |
| Window-manager integrations | `src/lib/integrations/niri.ts`, `aerospace.ts` | `tests/lib/integrations/niri.test.ts`, `aerospace.test.ts` | Existing tests mock helper libraries and artifact bags; extend missing config/skip/failure branches. |
| IDE integrations | `src/lib/integrations/vscode.ts`, `intellij.ts` | `tests/lib/vscode.test.ts`, `tests/lib/intellij.test.ts` | Add plugin-level integration tests under `tests/lib/integrations/` for `_exec.spawn`, applies, artifact, and safe no-artifact behavior. |

## Established Test Patterns

- Use `mock.module()` before dynamic imports, then import the module under test after mocks are registered.
- Use Commander `exitOverride()` and a temporary `process.exit` mock when testing command modules.
- Replace mutable `_exec` fields in `beforeEach()` and restore or reset them to avoid cross-test pollution.
- Use `useIsolatedConfig()`, `makeWorkspaceFixture()`, `writeRegistryFixture()`, and real workspace YAML where tests need source config reads.
- Use cache-busted dynamic imports only when necessary to avoid stale module cache after mocks.
- Run mock-heavy tests through the custom runner for suite-level validation.

## Concrete Interfaces

### `src/lib/integrations/issue-utils.ts`

- `resolveIssueRef(workspaceName: string, trackerId: string): IssueRefResolution`
- `linkIssue(workspaceName: string, trackerId: string, issueId: string): void`
- `unlinkIssue(workspaceName: string, trackerId: string): void`
- `formatIssueError(err: IssueRefResolutionError): string`
- `resolveWorkspaceArg(workspaceName: string | undefined, tracker: string, action: string): string`

### `src/lib/integrations/forge-utils.ts`

- `resolveForgeRepo(workspaceName: string, repoArg: string | undefined, forge: string): ForgeRepoResolution | ForgeRepoResolutionError`
- `resolveForgeRepoAnyMode(workspaceName: string, repoArg: string | undefined, forge: string): ForgeRepoResolution | ForgeRepoResolutionError`
- `resolveRepoCwd(): Promise<string | null>`
- `_detect.which(cmd)`, `_detect.gitRemoteUrl(repoPath)`, `_detect.teaPullsLs(repoPath)`
- `detectGitHubForge(repoPath)`, `detectGitLabForge(repoPath)`, `detectGiteaForge(repoPath)`, `detectForgeForRepo(repoPath)`, `detectForgeForRepoEnabled(repoPath, config)`
- `formatForgeError(err)`

## Landmines

- Do not inline source logic inside tests as the implementation under test.
- Do not run `bun test tests/` directly.
- Do not launch real `gh`, `glab`, `tea`, `jira`, `tmux`, `cmux`, `niri`, `aerospace`, `code`, `idea`, `open`, or `xdg-open`.
- Do not add CI requirements; this milestone uses local gates.
- Do not treat deferred `INTG-01` external-environment coverage as part of Phase 87.
