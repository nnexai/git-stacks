import { Command } from "commander"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { WS_CONFIG_DIR } from "../lib/paths"
import { readOfficialClientCredential } from "../lib/service/credentials"
import { readServiceDescriptor, startManagedService } from "../service/main"

export const serviceCommand = new Command("service")
  .description("Manage the internal native-client service")

serviceCommand.command("start")
  .description("Start or discover the local service")
  .action(async () => {
    const service = await startManagedService()
    console.log(JSON.stringify(service.descriptor))
    if (!service.existing) await new Promise<void>((resolve) => {
      const stop = async () => { await service.stop(); resolve() }
      process.once("SIGINT", stop)
      process.once("SIGTERM", stop)
    })
  })

serviceCommand.command("status")
  .description("Print the protected local service descriptor")
  .action(() => {
    const descriptor = readServiceDescriptor()
    if (!descriptor) { console.error("git-stacks service is not running"); process.exitCode = 1; return }
    console.log(JSON.stringify(descriptor))
  })

const sourceLabel: Record<string, string> = { claude: "Claude", copilot: "GitHub Copilot", codex: "Codex", opencode: "OpenCode", other: "Agent" }
function stateTitle(source: string, state: string): string {
  const label = sourceLabel[source] ?? "Agent"
  if (state === "waiting") return `${label} needs your input`
  if (state === "failed") return `${label} encountered an error`
  if (state === "completed") return `${label} finished and may need your attention`
  if (state === "working") return `${label} is working`
  return `${label} is idle`
}

type AttentionPublishOptions = { state: string; source: string; workspace: string; workspaceId?: string; repositoryId?: string; surfaceId?: string; title?: string; detail?: string }
type PublishOutcome = { ok: true } | { ok: false; error: Error }

async function publishAttention(options: AttentionPublishOptions, signal: AbortSignal): Promise<PublishOutcome> {
  try {
    const descriptor = readServiceDescriptor()
    if (!descriptor) throw new Error("git-stacks service is not running")
    const serviceRoot = join(WS_CONFIG_DIR, "service")
    const credential = readOfficialClientCredential(descriptor.credential_lookup, { serviceRoot })
    if (!credential) throw new Error("git-stacks service credential is unavailable")
    const headers = { authorization: `Bearer ${credential.token}`, "content-type": "application/json" }
    let workspaceId = options.workspaceId?.trim()
    if (!workspaceId) {
      const snapshotResponse = await fetch(new URL("/v1/snapshot", descriptor.endpoint), { headers, signal })
      if (!snapshotResponse.ok) throw new Error(`workspace identity resolution failed (${snapshotResponse.status})`)
      const envelope = await snapshotResponse.json() as { data?: Array<{ workspace?: { id?: string; name?: string } }> }
      workspaceId = envelope.data?.find((entry) => entry.workspace?.name === options.workspace)?.workspace?.id
      if (!workspaceId) throw new Error(`workspace '${options.workspace}' was not found by the native service`)
    }
    const repositoryId = options.repositoryId?.trim() || undefined
    const surfaceId = options.surfaceId?.trim() || undefined
    const identity = `${options.source}:${workspaceId}:${repositoryId ?? ""}:${surfaceId ?? ""}`
    const id = `att_${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`
    const response = await fetch(new URL("/v1/attention", descriptor.endpoint), {
      method: "POST", headers, signal,
      body: JSON.stringify({
        id, state: options.state, source: options.source, workspace_id: workspaceId,
        ...(repositoryId ? { repository_id: repositoryId } : {}),
        ...(surfaceId ? { surface_id: surfaceId } : {}),
        title: options.title ?? stateTitle(options.source, options.state),
        ...(options.detail ? { detail: options.detail } : {}), occurred_at: new Date().toISOString(),
      }),
    })
    if (!response.ok) throw new Error(`attention publication failed (${response.status})`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

serviceCommand.command("attention")
  .description("Publish native workspace attention")
  .command("publish")
  .requiredOption("--state <state>")
  .requiredOption("--source <source>")
  .requiredOption("--workspace <name>")
  .option("--workspace-id <id>")
  .option("--repository-id <id>")
  .option("--surface-id <id>")
  .option("--title <title>")
  .option("--detail <detail>")
  .option("--best-effort", "Silently ignore publication failures")
  .action(async (options: AttentionPublishOptions & { bestEffort?: boolean }) => {
    const controller = new AbortController()
    const configured = Number.parseInt(process.env.GIT_STACKS_ATTENTION_TIMEOUT_MS ?? "1500", 10)
    const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : 1500
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    timer.unref?.()
    try {
      const outcome = await publishAttention(options, controller.signal)
      if (!outcome.ok && !options.bestEffort) throw outcome.error
    } finally {
      clearTimeout(timer)
    }
  })
