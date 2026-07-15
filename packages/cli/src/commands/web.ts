import { Command } from "commander"

import { spawn } from "@git-stacks/core/node-runtime"
import { join } from "node:path"
import { WS_CONFIG_DIR } from "@git-stacks/core/paths"
import { readOfficialClientCredential } from "@git-stacks/service"

type PairingEnvelope = { ok: true; data: { url: string; expires_at: string } } | { ok: false; error?: { message?: string } }

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd.exe", "/c", "start", "", url] : ["xdg-open", url]
  const child = spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "ignore" })
  child.unref()
}

export const webCommand = new Command("web")
  .description("Open the local browser workspace client")
  .option("--no-open", "Print the pairing URL without opening a browser")
  .option("--json", "Print machine-readable pairing details")
  .action(async (options: { open: boolean; json?: boolean }) => {
    const { startManagedService } = await import("@git-stacks/service")
    const service = await startManagedService()
    const serviceRoot = join(WS_CONFIG_DIR, "service")
    const credential = readOfficialClientCredential(service.descriptor.credential_lookup, { serviceRoot })
    if (!credential) {
      await service.stop()
      throw new Error("Official service credential is unavailable")
    }
    const response = await fetch(new URL("/v1/web-pairings", service.descriptor.endpoint), {
      method: "POST",
      headers: { authorization: `Bearer ${credential.token}`, "content-type": "application/json" },
      body: "{}",
    })
    const envelope = await response.json() as PairingEnvelope
    if (!response.ok || !envelope.ok) {
      await service.stop()
      throw new Error(envelope.ok ? `Pairing failed (${response.status})` : envelope.error?.message ?? `Pairing failed (${response.status})`)
    }
    if (options.json) console.log(JSON.stringify(envelope.data))
    else console.log(`git-stacks web: ${envelope.data.url}`)
    if (options.open) openBrowser(envelope.data.url)
    if (!service.existing) {
      await new Promise<void>((resolve) => {
        let stopping = false
        const stop = async () => {
          if (stopping) return
          stopping = true
          await service.stop()
          resolve()
        }
        process.once("SIGINT", stop)
        process.once("SIGTERM", stop)
      })
    }
  })
