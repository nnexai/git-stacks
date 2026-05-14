export type E2EScopeStatus = "in-scope" | "excluded"
export type E2EFlowType = "command" | "user-flow" | "library-backed-flow"

export type E2EInventoryItem = {
  id: string
  family: "workspace" | "template" | "repo" | "label" | "message" | "support" | "exclude"
  flowType: E2EFlowType
  title: string
  commands: readonly string[]
  scopeStatus: E2EScopeStatus
  mappedTests: readonly string[]
  rationale: string
}

export type E2EInventoryValidation = {
  valid: boolean
  duplicateIds: string[]
  unmappedInScopeIds: string[]
}

export const E2E_INVENTORY: readonly E2EInventoryItem[] = [
  {
    id: "workspace.create.side-effects",
    family: "workspace",
    flowType: "user-flow",
    title: "Workspace create side effects",
    commands: ["new", "clone"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/template-consumption.test.ts"],
    rationale: "Template-backed workspace creation and clone side effects are covered through non-interactive fixtures.",
  },
  {
    id: "workspace.clone.side-effects",
    family: "workspace",
    flowType: "user-flow",
    title: "Workspace clone side effects",
    commands: ["clone"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/template-consumption.test.ts"],
    rationale: "Template-derived labels/config persistence through clone is covered by non-interactive subprocess fixtures.",
  },
  {
    id: "workspace.list",
    family: "workspace",
    flowType: "command",
    title: "Workspace list output and labels",
    commands: ["list", "list --json", "list --label"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/list-columns.test.ts"],
    rationale: "Workspace listing is core non-TUI visibility and already has baseline column coverage.",
  },
  {
    id: "workspace.status",
    family: "workspace",
    flowType: "command",
    title: "Workspace status output",
    commands: ["status", "status --json", "status --fetch"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/status-json.test.ts"],
    rationale: "Status JSON and fetch-aware status are core workspace inspection surfaces.",
  },
  {
    id: "workspace.run",
    family: "workspace",
    flowType: "command",
    title: "Workspace run command execution",
    commands: ["run", "run --parallel", "run --json"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/run-parallel.test.ts"],
    rationale: "Command execution across workspace repos is a high-risk shell boundary and already has parallel baseline coverage.",
  },
  {
    id: "workspace.paths",
    family: "workspace",
    flowType: "command",
    title: "Workspace path discovery",
    commands: ["paths", "cd"],
    scopeStatus: "in-scope",
    mappedTests: [],
    rationale: "Path and cd helpers depend on explicit cwd/path handling that v0.17.1 is meant to prove.",
  },
  {
    id: "workspace.env",
    family: "workspace",
    flowType: "command",
    title: "Workspace environment rendering",
    commands: ["env", "env --format json", "env --repo"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/env.test.ts"],
    rationale: "Environment rendering is covered by baseline subprocess tests and remains part of the E2E surface.",
  },
  {
    id: "workspace.git-operations",
    family: "workspace",
    flowType: "library-backed-flow",
    title: "Workspace git operations",
    commands: ["merge", "pull", "sync", "push", "clean", "close", "remove", "rename", "open --no-ide"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/sync-json.test.ts"],
    rationale: "Git operations cross process, cwd, and repository boundaries and need expanded real-repo coverage.",
  },
  {
    id: "template.commands",
    family: "template",
    flowType: "command",
    title: "Template command family",
    commands: ["template list", "template show", "template clone", "template rename", "template remove"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/template-list.test.ts", "tests/commands/template-commands.test.ts"],
    rationale: "Non-wizard template management is covered by the existing list baseline and the focused Phase 82 command suite.",
  },
  {
    id: "template.label.crud",
    family: "template",
    flowType: "command",
    title: "Template label CRUD",
    commands: ["template label add", "template label remove", "template label list", "template label clear"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/template-label.test.ts", "tests/commands/template-commands.test.ts"],
    rationale: "Template label behavior is directly testable without TUI prompts and is asserted in both the baseline and command-family suites.",
  },
  {
    id: "repo.git-registry",
    family: "repo",
    flowType: "command",
    title: "Git repo registry entries",
    commands: ["repo add", "repo list", "repo show", "repo remove", "repo rename"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/repo.test.ts"],
    rationale: "Git-backed registry behavior is covered with real repo fixtures and enabled-forge guard coverage.",
  },
  {
    id: "repo.dir-registry",
    family: "repo",
    flowType: "command",
    title: "Directory registry entries",
    commands: ["repo add", "repo list", "repo show", "repo remove", "repo rename"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/repo.test.ts"],
    rationale: "Directory registry mode is covered separately from git-backed repos in the repo subprocess suite.",
  },
  {
    id: "label.workspace-crud",
    family: "label",
    flowType: "command",
    title: "Workspace label CRUD",
    commands: ["label add", "label remove", "label list", "label clear"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/label.test.ts", "tests/commands/e2e-harness.test.ts"],
    rationale: "Workspace labels are a shipped non-TUI command surface with persisted YAML side effects and explicit add/remove/list/clear coverage.",
  },
  {
    id: "message.durable-cli",
    family: "message",
    flowType: "command",
    title: "Durable message CLI",
    commands: ["message send", "message list", "message clear"],
    scopeStatus: "in-scope",
    mappedTests: [],
    rationale: "Message files are durable command-side effects and socket delivery remains best-effort.",
  },
  {
    id: "support.config-show",
    family: "support",
    flowType: "command",
    title: "Config show",
    commands: ["config show"],
    scopeStatus: "in-scope",
    mappedTests: [],
    rationale: "Readonly config output is non-TUI support surface suitable for isolated config fixtures.",
  },
  {
    id: "support.doctor",
    family: "support",
    flowType: "command",
    title: "Doctor checks and fixes",
    commands: ["doctor", "doctor --json", "doctor --fix"],
    scopeStatus: "in-scope",
    mappedTests: ["tests/commands/doctor-json.test.ts", "tests/commands/doctor-fix.test.ts"],
    rationale: "Doctor has existing JSON and fix coverage that later phases can extend with harness fixtures.",
  },
  {
    id: "support.completion",
    family: "support",
    flowType: "command",
    title: "Shell completion generation",
    commands: ["completion bash", "completion zsh", "completion fish"],
    scopeStatus: "in-scope",
    mappedTests: [],
    rationale: "Completion output is deterministic support-command behavior and should track command tree shape.",
  },
  {
    id: "support.version",
    family: "support",
    flowType: "command",
    title: "Version output",
    commands: ["--version", "-V"],
    scopeStatus: "in-scope",
    mappedTests: [],
    rationale: "Version output is a release-prep support surface and part of local verification.",
  },
  {
    id: "support.install-noninteractive",
    family: "support",
    flowType: "command",
    title: "Install hooks non-interactive flags",
    commands: ["install --hooks --claude", "install --hooks --copilot", "install --hooks --remove"],
    scopeStatus: "in-scope",
    mappedTests: [],
    rationale: "Flag-driven hook installation can be exercised without prompt-driving and should remain mapped separately from interactive install prompts.",
  },
  {
    id: "support.integration-config",
    family: "support",
    flowType: "command",
    title: "Integration config inspection",
    commands: ["integration list", "integration <id> config show", "integration <id> config example"],
    scopeStatus: "in-scope",
    mappedTests: [],
    rationale: "Integration config inspection is local command output; external integration behavior remains excluded.",
  },
  {
    id: "exclude.tui.manage",
    family: "exclude",
    flowType: "command",
    title: "Interactive dashboard",
    commands: ["manage"],
    scopeStatus: "excluded",
    mappedTests: [],
    rationale: "Terminal UI behavior is explicitly out of scope for v0.17.1 E2E coverage.",
  },
  {
    id: "exclude.integration.behavior",
    family: "exclude",
    flowType: "library-backed-flow",
    title: "External integration behavior",
    commands: ["integration <id> <command>", "open"],
    scopeStatus: "excluded",
    mappedTests: [],
    rationale: "External integration behavior depends on tools outside the non-integration milestone boundary.",
  },
  {
    id: "exclude.editor.workspace-edit-yaml",
    family: "exclude",
    flowType: "command",
    title: "Workspace YAML editor launch",
    commands: ["edit --yaml"],
    scopeStatus: "excluded",
    mappedTests: [],
    rationale: "Editor-launching edit commands are explicitly out of scope for this milestone.",
  },
  {
    id: "exclude.editor.template-edit-yaml",
    family: "exclude",
    flowType: "command",
    title: "Template YAML editor launch",
    commands: ["template edit --yaml"],
    scopeStatus: "excluded",
    mappedTests: [],
    rationale: "Editor-launching template edit flows are intentionally excluded from E2E scope.",
  },
  {
    id: "exclude.editor.config-yaml",
    family: "exclude",
    flowType: "command",
    title: "Config YAML editor launch",
    commands: ["config --yaml"],
    scopeStatus: "excluded",
    mappedTests: [],
    rationale: "Opening an editor is outside the non-interactive E2E milestone boundary.",
  },
  {
    id: "exclude.editor.repo-yaml",
    family: "exclude",
    flowType: "command",
    title: "Registry YAML editor launch",
    commands: ["repo --yaml"],
    scopeStatus: "excluded",
    mappedTests: [],
    rationale: "Registry editor launching is excluded with the rest of editor-driven flows.",
  },
  {
    id: "exclude.audit.rollback-visibility",
    family: "exclude",
    flowType: "user-flow",
    title: "Dashboard rollback visibility audit gap",
    commands: ["manage"],
    scopeStatus: "excluded",
    mappedTests: [],
    rationale: "The v0.17.0 dashboard rollback visibility audit gap is TUI scope and remains backlog.",
  },
  {
    id: "exclude.wizard.repo-scan",
    family: "exclude",
    flowType: "user-flow",
    title: "Repo scan wizard",
    commands: ["repo scan"],
    scopeStatus: "excluded",
    mappedTests: [],
    rationale: "Wizard-driven repo scan behavior requires prompt-driving and is excluded from v0.17.1.",
  },
  {
    id: "exclude.wizard.template-new",
    family: "exclude",
    flowType: "user-flow",
    title: "Template creation wizard",
    commands: ["template new"],
    scopeStatus: "excluded",
    mappedTests: [],
    rationale: "Interactive template creation is tested indirectly through pre-built fixtures.",
  },
  {
    id: "exclude.wizard.template-edit",
    family: "exclude",
    flowType: "user-flow",
    title: "Template edit wizard",
    commands: ["template edit"],
    scopeStatus: "excluded",
    mappedTests: [],
    rationale: "Interactive template editing is excluded from this non-TUI E2E milestone.",
  },
  {
    id: "exclude.wizard.config",
    family: "exclude",
    flowType: "user-flow",
    title: "Config wizard",
    commands: ["config"],
    scopeStatus: "excluded",
    mappedTests: [],
    rationale: "Interactive config prompts are excluded while readonly config output remains in scope.",
  },
  {
    id: "exclude.prompt.install-hooks",
    family: "exclude",
    flowType: "user-flow",
    title: "Install hook prompt flow",
    commands: ["install --hooks"],
    scopeStatus: "excluded",
    mappedTests: [],
    rationale: "Prompt-driven hook installation is excluded; explicit non-interactive install flags remain in scope.",
  },
] as const

export function getInventoryItem(
  id: string,
  items: readonly E2EInventoryItem[] = E2E_INVENTORY
): E2EInventoryItem | undefined {
  return items.find((item) => item.id === id)
}

export function getInScopeItems(
  items: readonly E2EInventoryItem[] = E2E_INVENTORY
): E2EInventoryItem[] {
  return items.filter((item) => item.scopeStatus === "in-scope")
}

export function getExcludedItems(
  items: readonly E2EInventoryItem[] = E2E_INVENTORY
): E2EInventoryItem[] {
  return items.filter((item) => item.scopeStatus === "excluded")
}

export function getDuplicateInventoryIds(
  items: readonly E2EInventoryItem[] = E2E_INVENTORY
): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const item of items) {
    if (seen.has(item.id)) {
      duplicates.add(item.id)
    }
    seen.add(item.id)
  }

  return [...duplicates].sort()
}

export function getUnmappedInScopeItems(
  items: readonly E2EInventoryItem[] = E2E_INVENTORY
): E2EInventoryItem[] {
  return items.filter((item) => item.scopeStatus === "in-scope" && item.mappedTests.length === 0)
}

export function validateE2EInventory(
  items: readonly E2EInventoryItem[] = E2E_INVENTORY
): E2EInventoryValidation {
  const duplicateIds = getDuplicateInventoryIds(items)
  const unmappedInScopeIds = getUnmappedInScopeItems(items).map((item) => item.id).sort()

  return {
    valid: duplicateIds.length === 0,
    duplicateIds,
    unmappedInScopeIds,
  }
}
