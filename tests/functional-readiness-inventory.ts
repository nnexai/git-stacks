export type FunctionalReadinessCategory =
  | "covered"
  | "accepted-gap"
  | "deferred-external-environment"
  | "must-fix-before-release"

export type FunctionalReadinessPhase = "85" | "86" | "87" | "88"

export type FunctionalReadinessArea = {
  id: string
  phase: FunctionalReadinessPhase
  title: string
  category: FunctionalReadinessCategory
  sourceTargets: readonly string[]
  rationale: string
}

export const FUNCTIONAL_READINESS_AREAS: readonly FunctionalReadinessArea[] = [
  {
    id: "phase85.core-real-fixtures",
    phase: "85",
    title: "Core real-fixture workspace, git, lifecycle, files, env, secrets, ports, and config coverage",
    category: "covered",
    sourceTargets: [
      "packages/core/src/workspace-lifecycle.ts",
      "packages/core/src/workspace-git.ts",
      "packages/core/src/git.ts",
      "packages/core/src/lifecycle.ts",
      "packages/core/src/files.ts",
      "packages/core/src/env.ts",
      "packages/core/src/secrets.ts",
      "packages/core/src/ports.ts",
      "packages/core/src/config.ts",
    ],
    rationale:
      "Phase 85 hardened stable core behavior through real temp directories, isolated config, and local git fixtures.",
  },
  {
    id: "phase86.workspace-command-workflows",
    phase: "86",
    title: "Workspace command workflow coverage",
    category: "covered",
    sourceTargets: ["packages/cli/src/commands/workspace.ts", "packages/core/src/workspace-git.ts"],
    rationale:
      "Phase 86 added automation-safe CLI workflow coverage for recreate, cleanup, destructive safety, and wrappers.",
  },
  {
    id: "phase87.integration-source-contracts",
    phase: "87",
    title: "Integration contract and source-module coverage",
    category: "covered",
    sourceTargets: [
      "packages/core/src/integrations/issue-utils.ts",
      "packages/core/src/integrations/forge-utils.ts",
      "packages/core/src/integrations/github.ts",
      "packages/core/src/integrations/gitlab.ts",
      "packages/core/src/integrations/gitea.ts",
      "packages/core/src/integrations/jira.ts",
      "packages/core/src/integrations/tmux.ts",
      "packages/core/src/integrations/cmux.ts",
      "packages/core/src/integrations/niri.ts",
      "packages/core/src/integrations/aerospace.ts",
      "packages/core/src/integrations/vscode.ts",
      "packages/core/src/integrations/intellij.ts",
    ],
    rationale:
      "Phase 87 uses real source modules with injected executors while avoiding live external desktop and forge environments.",
  },
  {
    id: "accepted.representative-error-matrices",
    phase: "88",
    title: "Representative command error matrices",
    category: "accepted-gap",
    sourceTargets: [],
    rationale:
      "Representative failure cases are sufficient for this milestone; exhaustive cross-product matrices are intentionally not required.",
  },
  {
    id: "accepted.full-completion-snapshots",
    phase: "88",
    title: "Full shell completion golden snapshots",
    category: "accepted-gap",
    sourceTargets: [],
    rationale:
      "Shell completion invariant tests provide stable confidence without brittle full-output snapshots.",
  },
  {
    id: "deferred.broad-tui-rendering",
    phase: "88",
    title: "Broad TUI rendering behavior",
    category: "deferred-external-environment",
    sourceTargets: [],
    rationale:
      "Broad terminal rendering and dashboard rollback visibility are outside the v0.17.1 functional coverage boundary.",
  },
  {
    id: "deferred.live-forge-auth",
    phase: "88",
    title: "Live forge authentication and hosted forge behavior",
    category: "deferred-external-environment",
    sourceTargets: [],
    rationale:
      "Live GitHub, GitLab, Gitea, and Jira auth flows require external services and credentials; Phase 87 covers source contracts with injected executors.",
  },
  {
    id: "deferred.desktop-browser-ide-window-managers",
    phase: "88",
    title: "Real browser, IDE, terminal multiplexer, and window-manager launches",
    category: "deferred-external-environment",
    sourceTargets: [],
    rationale:
      "Real desktop launches are deferred while command construction, config parsing, and failure handling are covered through injected seams.",
  },
] as const

export function getFunctionalReadinessAreas(
  category?: FunctionalReadinessCategory,
  areas: readonly FunctionalReadinessArea[] = FUNCTIONAL_READINESS_AREAS
): FunctionalReadinessArea[] {
  return category ? areas.filter((area) => area.category === category) : [...areas]
}
