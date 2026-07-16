import { Command } from "commander"

import { createHash } from "node:crypto"
import { closeSync, constants, fstatSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { WS_CONFIG_DIR } from "@git-stacks/core/paths"

async function serviceRuntime() {
  return import("@git-stacks/service")
}

export async function prepareManagedDashboardEnvironment(): Promise<void> {
  const { prepareLocalServiceEnvironment } = await import("@git-stacks/service/client")
  await prepareLocalServiceEnvironment()
}

export const serviceCommand = new Command("service")
  .description("Manage the local workspace service")

serviceCommand.command("start")
  .description("Start or discover the local service")
  .action(async () => {
    const { startManagedService } = await serviceRuntime()
    const service = await startManagedService()
    console.log(JSON.stringify({
      protocol: service.descriptor.protocol,
      pid: service.descriptor.pid,
      instance_id: service.descriptor.instance_id,
      service_id: service.descriptor.service_id,
      listener_epoch: service.descriptor.listener_epoch,
      webtransport_endpoint: service.descriptor.webtransport.endpoint,
      started_at: service.descriptor.started_at,
    }))
    if (!service.existing) await new Promise<void>((resolve) => {
      const stop = async () => { await service.stop(); resolve() }
      process.once("SIGINT", stop)
      process.once("SIGTERM", stop)
    })
  })

serviceCommand.command("status")
  .description("Print the protected local service descriptor")
  .action(async () => {
    const { readUsableServiceDescriptor } = await serviceRuntime()
    const descriptor = await readUsableServiceDescriptor()
    if (!descriptor) { console.error("git-stacks service is not running"); process.exitCode = 1; return }
    console.log(JSON.stringify({
      protocol: descriptor.protocol,
      pid: descriptor.pid,
      instance_id: descriptor.instance_id,
      service_id: descriptor.service_id,
      listener_epoch: descriptor.listener_epoch,
      webtransport_endpoint: descriptor.webtransport.endpoint,
      started_at: descriptor.started_at,
    }))
  })

async function stopLocalService(): Promise<boolean> {
  const { readServiceDescriptor } = await serviceRuntime()
  const descriptor = readServiceDescriptor()
  if (!descriptor) return false
  try { process.kill(descriptor.pid, "SIGTERM") } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
  }
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (!(await serviceRuntime()).readServiceDescriptor()) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error("Timed out waiting for the service to stop")
}

serviceCommand.command("stop")
  .description("Stop the local service and its service-owned shells gracefully")
  .action(async () => { console.log(await stopLocalService() ? "git-stacks service stopped" : "git-stacks service is not running") })

const exposeCommand = serviceCommand.command("expose").description("Configure the opt-in remote encrypted listener")
exposeCommand.command("enable")
  .requiredOption("--advertise <host>", "LAN host or IP paired clients will use")
  .option("--bind <ip>", "IP address to bind", "0.0.0.0")
  .option("--port <port>", "Stable UDP port used by paired clients", "41327")
  .action(async (options: { advertise: string; bind: string; port: string }) => {
    const serviceRoot = join(WS_CONFIG_DIR, "service")
    const port = Number(options.port)
    if (!Number.isInteger(port) || port < 1 || port > 65534) throw new Error("Remote base port must be between 1 and 65534; rollover also uses the next UDP port")
    const { configureRemoteExposure } = await serviceRuntime()
    await stopLocalService()
    const exposure = configureRemoteExposure(serviceRoot, { enabled: true, bindHost: options.bind, advertiseHost: options.advertise, port })
    console.log(JSON.stringify({ enabled: exposure.enabled, bind_host: exposure.bind_host, advertise_host: exposure.advertise_host, port: exposure.port }))
  })
exposeCommand.command("disable").action(async () => {
  const { configureRemoteExposure } = await serviceRuntime()
  await stopLocalService()
  configureRemoteExposure(join(WS_CONFIG_DIR, "service"), { enabled: false })
  console.log("Remote exposure disabled")
})
exposeCommand.command("status").action(async () => {
  const { readRemoteExposure } = await serviceRuntime()
  console.log(JSON.stringify(readRemoteExposure(join(WS_CONFIG_DIR, "service")) ?? { enabled: false }))
})

const remoteScopes = [
  "snapshot.read", "operation.write", "event.read", "signal.read", "signal.dismiss",
  "terminal.read", "terminal.write", "terminal.create", "terminal.close", "target.select",
] as const
const pairCommand = serviceCommand.command("pair").description("Create, accept, inspect, or revoke one-use remote pairing")
pairCommand.command("create")
  .requiredOption("--name <name>", "Name shown on the paired helper")
  .requiredOption("--output <file>", "New mode-0600 bundle file")
  .option("--scope <scope...>", "Authorized scope(s); defaults to the complete current client surface")
  .action(async (options: { name: string; output: string; scope?: string[] }) => {
    const { createRemotePairing, closeServiceClient } = await import("@git-stacks/service/client")
    try {
      const scopes = options.scope?.length ? options.scope : [...remoteScopes]
      const invalid = scopes.filter((scope) => !remoteScopes.includes(scope as typeof remoteScopes[number]))
      if (invalid.length) throw new Error(`Unknown remote scope: ${invalid.join(", ")}`)
      const bundle = await createRemotePairing(options.name, scopes as typeof remoteScopes[number][])
      const fd = openSync(options.output, "wx", 0o600)
      try { writeFileSync(fd, `${JSON.stringify(bundle, null, 2)}\n`, "utf8") } finally { closeSync(fd) }
      console.log(`Pairing bundle written to ${options.output}`)
      console.log(`Authority fingerprint: ${bundle.service_fingerprint}`)
      console.log(`Expires: ${bundle.expires_at}`)
    } finally { await closeServiceClient("pairing bundle created") }
  })
pairCommand.command("accept")
  .option("--file <file>", "Mode-0600 pairing bundle file; otherwise read stdin")
  .requiredOption("--confirm <fingerprint>", "Fingerprint verified through the separate pairing channel")
  .action(async (options: { file?: string; confirm: string }) => {
    let text: string
    if (options.file) {
      const fd = openSync(options.file, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const stat = fstatSync(fd)
        if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || (typeof process.getuid === "function" && stat.uid !== process.getuid())) {
          throw new Error("Pairing bundle must be an owner-controlled non-symlink mode-0600 file")
        }
        text = readFileSync(fd, "utf8")
      } finally { closeSync(fd) }
    } else text = readFileSync(0, "utf8")
    const value = JSON.parse(text) as { service_fingerprint?: unknown }
    if (value.service_fingerprint !== options.confirm) throw new Error("Confirmed fingerprint does not match the pairing bundle")
    const { acceptRemotePairing } = await import("@git-stacks/service/remote")
    const target = await acceptRemotePairing(join(WS_CONFIG_DIR, "service"), value)
    console.log(JSON.stringify({ target_id: target.id, name: target.name, service_id: target.service_id, fingerprint: target.fingerprint }))
  })
pairCommand.command("list").action(async () => {
  const { listPairedHelpers, closeServiceClient } = await import("@git-stacks/service/client")
  try { console.log(JSON.stringify(await listPairedHelpers())) } finally { await closeServiceClient("pair list complete") }
})
pairCommand.command("revoke")
  .argument("<helper-id>")
  .action(async (helperId: string) => {
    const { revokePairedHelper, closeServiceClient } = await import("@git-stacks/service/client")
    try { console.log(JSON.stringify({ revoked: await revokePairedHelper(helperId) })) } finally { await closeServiceClient("pair revoke complete") }
  })

const targetsCommand = serviceCommand.command("targets").description("Inspect helper-owned paired targets")
targetsCommand.command("list").action(async () => {
  const { listRemoteTargets, closeServiceClient } = await import("@git-stacks/service/client")
  try { console.log(JSON.stringify(await listRemoteTargets())) } finally { await closeServiceClient("target list complete") }
})
targetsCommand.command("remove").argument("<target-id>").action(async (targetId: string) => {
  const { removeRemoteTarget, closeServiceClient } = await import("@git-stacks/service/client")
  try { console.log(JSON.stringify({ removed: await removeRemoteTarget(targetId) })) } finally { await closeServiceClient("target removal complete") }
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
    const { fetchCoreState, publishSignalToService, closeServiceClient } = await import("@git-stacks/service/client")
    let workspaceId = options.workspaceId?.trim()
    if (!workspaceId) {
      const state = await fetchCoreState(abortSignal)
      workspaceId = state.workspaces.find((entry) => entry.definition.name === options.workspace)?.projection.id
      if (!workspaceId) throw new Error(`workspace '${options.workspace}' was not found by the local service`)
    }
    const repositoryId = options.repositoryId?.trim() || undefined
    const surfaceId = options.surfaceId?.trim() || undefined
    const kind = options.kind ?? "activity"
    const source = ["other", "codex", "claude", "copilot", "opencode", "automation", "acp", "user"].includes(options.source)
      ? options.source as "other" | "codex" | "claude" | "copilot" | "opencode" | "automation" | "acp" | "user"
      : "other"
    if (kind === "activity" && (!repositoryId || !surfaceId)) throw new Error("activity signals require repository and surface identity")
    if (kind === "notification" && !options.title) throw new Error("notification signals require --title")
    const identity = `${kind}:${source}:${workspaceId}:${repositoryId ?? ""}:${surfaceId ?? ""}:${options.sessionId ?? ""}:${options.title ?? ""}`
    const id = kind === "activity"
      ? `sig_${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`
      : `sig_${crypto.randomUUID().replaceAll("-", "")}`
    const occurredAt = new Date().toISOString()
    if (kind === "activity") {
      const requestedState = options.state ?? "working"
      const state = ["failed", "working", "waiting", "completed", "idle"].includes(requestedState)
        ? requestedState as "failed" | "working" | "waiting" | "completed" | "idle"
        : "working"
      await publishSignalToService({
        version: 1, kind, id, state,
        session_id: options.sessionId ?? process.env.GIT_STACKS_SESSION_ID ?? `session-${process.pid}`,
        surface_id: surfaceId!, repository_id: repositoryId!, source, workspace_id: workspaceId,
        title: options.title ?? stateTitle(source, state),
        ...(options.detail ? { detail: options.detail } : {}), occurred_at: occurredAt,
      }, abortSignal)
    } else {
      await publishSignalToService({
        version: 1, kind, id, source, workspace_id: workspaceId, title: options.title!,
        ...(repositoryId ? { repository_id: repositoryId } : {}),
        ...(options.detail ? { detail: options.detail } : {}), occurred_at: occurredAt,
      }, abortSignal)
    }
    await closeServiceClient("signal published")
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
