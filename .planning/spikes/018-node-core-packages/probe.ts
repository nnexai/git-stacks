import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = mkdtempSync(join(tmpdir(), "git-stacks-node-core-"))
process.env.GIT_STACKS_CONFIG_DIR = root

const config = await import("../../../src/lib/config.ts")
const { matchesLabels } = await import("../../../src/lib/labels.ts")
const { setWorkspacePriorities } = await import("../../../src/lib/workspace-priorities.ts")
const { SignalState } = await import("../../../src/lib/service/signal-state.ts")
const presentation = await import("../../../src/lib/service/presentation.ts")
const { SignalSchema } = await import("../../../src/lib/service/contract.ts")

const workspace = {
  id: crypto.randomUUID(),
  name: "node-core",
  branch: "feature/node-core",
  created: new Date().toISOString(),
  repos: [],
  labels: ["architecture", "node"],
}

config.writeGlobalConfig({ workspace_root: join(root, "workspaces"), integrations: {}, ports: { range_start: 10000, range_end: 65000 } })
config.writeWorkspace(workspace)

const parsed = config.readWorkspace(workspace.name)
const listed = config.listWorkspacesUncached()
setWorkspacePriorities([{ workspace_id: workspace.id, priority: 25 }], {
  listWorkspaces: () => config.listWorkspacesUncached(),
  writeWorkspace: config.writeWorkspace,
})
const prioritized = config.readWorkspace(workspace.name)

const state = new SignalState()
const signal = SignalSchema.parse({
  version: 1,
  kind: "activity",
  id: `sig_${"a".repeat(16)}`,
  source: "codex",
  state: "working",
  workspace_id: workspace.id,
  repository_id: crypto.randomUUID(),
  surface_id: crypto.randomUUID(),
  session_id: "session-node",
  occurred_at: new Date().toISOString(),
})
state.apply({ sequence: "1", signal })
const projection = state.projection()

const yaml = readFileSync(config.workspaceFilePath(workspace.name), "utf8")
const report = {
  runtime: process.version,
  platform: `${process.platform}-${process.arch}`,
  passed:
    parsed.name === workspace.name
    && listed.length === 1
    && prioritized.priority === 25
    && matchesLabels(prioritized, ["architecture", "node"])
    && projection.signals.length === 1
    && presentation.providerName(projection.signals[0].source) === "Codex"
    && yaml.includes("priority: 25"),
  checks: {
    atomicYamlRoundTrip: parsed.name === workspace.name && yaml.includes("priority: 25"),
    localPriorityMutation: prioritized.priority === 25,
    labelFiltering: matchesLabels(prioritized, ["architecture", "node"]),
    sharedSignalReduction: projection.signals.length === 1,
    sharedPresentation: presentation.providerName(projection.signals[0].source),
  },
  bundle: "single ESM artifact targeting Node 24 LTS",
}

rmSync(root, { recursive: true, force: true })
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.passed ? 0 : 1
