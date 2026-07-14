import { Command } from "commander"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { WS_CONFIG_DIR } from "../lib/paths"
import { readOfficialClientCredential } from "../lib/service/credentials"
import { readServiceDescriptor, readUsableServiceDescriptor, startManagedService } from "../service/main"

export const serviceCommand = new Command("service")
  .description("Manage the local workspace service")

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
  .action(async () => {
    const descriptor = await readUsableServiceDescriptor()
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

type SignalPublishOptions = { kind?: "activity" | "notification"; state?: string; source: string; workspace: string; workspaceId?: string; repositoryId?: string; surfaceId?: string; sessionId?: string; title?: string; detail?: string }
type PublishOutcome = { ok: true } | { ok: false; error: Error }

async function publishSignal(options: SignalPublishOptions, abortSignal: AbortSignal): Promise<PublishOutcome> {
  try {
    const descriptor = readServiceDescriptor()
    if (!descriptor) throw new Error("git-stacks service is not running")
    const serviceRoot = join(WS_CONFIG_DIR, "service")
    const credential = readOfficialClientCredential(descriptor.credential_lookup, { serviceRoot })
    if (!credential) throw new Error("git-stacks service credential is unavailable")
    const headers = { authorization: `Bearer ${credential.token}`, "content-type": "application/json" }
    let workspaceId = options.workspaceId?.trim()
    if (!workspaceId) {
      const snapshotResponse = await fetch(new URL("/v1/snapshot", descriptor.endpoint), { headers, signal: abortSignal })
      if (!snapshotResponse.ok) throw new Error(`workspace identity resolution failed (${snapshotResponse.status})`)
      const envelope = await snapshotResponse.json() as { data?: Array<{ workspace?: { id?: string; name?: string } }> }
      workspaceId = envelope.data?.find((entry) => entry.workspace?.name === options.workspace)?.workspace?.id
      if (!workspaceId) throw new Error(`workspace '${options.workspace}' was not found by the local service`)
    }
    const repositoryId = options.repositoryId?.trim() || undefined
    const surfaceId = options.surfaceId?.trim() || undefined
    const kind = options.kind ?? "activity"
    if (kind === "activity" && (!repositoryId || !surfaceId)) throw new Error("activity signals require repository and surface identity")
    if (kind === "notification" && !options.title) throw new Error("notification signals require --title")
    const identity = `${kind}:${options.source}:${workspaceId}:${repositoryId ?? ""}:${surfaceId ?? ""}:${options.sessionId ?? ""}:${options.title ?? ""}`
    const id = kind === "activity"
      ? `sig_${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`
      : `sig_${crypto.randomUUID().replaceAll("-", "")}`
    const response = await fetch(new URL("/v1/signals", descriptor.endpoint), {
      method: "POST", headers, signal: abortSignal,
      body: JSON.stringify({
        version: 1, kind, id, ...(kind === "activity" ? { state: options.state ?? "working", session_id: options.sessionId ?? process.env.GIT_STACKS_SESSION_ID ?? `session-${process.pid}`, surface_id: surfaceId, repository_id: repositoryId } : {}), source: options.source, workspace_id: workspaceId,
        ...(repositoryId ? { repository_id: repositoryId } : {}),
        ...(kind === "notification" && options.title ? { title: options.title } : {}),
        ...(kind === "activity" ? { title: options.title ?? stateTitle(options.source, options.state ?? "working") } : {}),
        ...(options.detail ? { detail: options.detail } : {}), occurred_at: new Date().toISOString(),
      }),
    })
    if (!response.ok) throw new Error(`signal publication failed (${response.status})`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

const signalCommand = serviceCommand.command("signal")
  .description("Publish provider-neutral workspace signals")

signalCommand.command("publish")
  .option("--kind <kind>", "activity or notification", "activity")
  .option("--state <state>")
  .requiredOption("--source <source>")
  .requiredOption("--workspace <name>")
  .option("--workspace-id <id>")
  .option("--repository-id <id>")
  .option("--surface-id <id>")
  .option("--session-id <id>")
  .option("--title <title>")
  .option("--detail <detail>")
  .option("--best-effort", "Silently ignore publication failures")
  .action(async (options: SignalPublishOptions & { bestEffort?: boolean }) => {
    const controller = new AbortController()
    const configured = Number.parseInt(process.env.GIT_STACKS_SIGNAL_TIMEOUT_MS ?? "1500", 10)
    const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : 1500
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    timer.unref?.()
    try {
      const outcome = await publishSignal(options, controller.signal)
      if (!outcome.ok && !options.bestEffort) throw outcome.error
    } finally {
      clearTimeout(timer)
    }
  })
