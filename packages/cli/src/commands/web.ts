import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { Command } from "commander"

import { spawn } from "@git-stacks/core/node-runtime"
import { createProtectedBrowserLauncher } from "../lib/browser-launcher"

const require = createRequire(import.meta.url)

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd.exe", "/c", "start", "", url] : ["xdg-open", url]
  const child = spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "ignore" })
  child.unref()
}

function packagedClientUrl(): URL {
  const packageRoot = dirname(require.resolve("@git-stacks/web/package.json"))
  return pathToFileURL(join(packageRoot, "dist", "git-stacks.html"))
}

export const webCommand = new Command("web")
  .description("Open the packaged browser client through encrypted WebTransport")
  .option("--no-open", "Create and print a protected one-use launcher without opening a browser")
  .option("--json", "Print machine-readable launch details")
  .option("--target <id>", "Open a paired remote target instead of the implicit local target")
  .action(async (options: { open: boolean; json?: boolean; target?: string }) => {
    const { ensureManagedServiceProcess, readUsableServiceDescriptor } = await import("@git-stacks/service")
    let descriptor = await ensureManagedServiceProcess()
    const { createBrowserLaunch, closeServiceClient, recoverLocalWebTransport } = await import("@git-stacks/service/client")
    const targetId = options.target ?? descriptor.service_id
    const probeLaunch = await createBrowserLaunch(targetId)
    try {
      const { verifyLocalBrowserTransport } = await import("@git-stacks/service/remote")
      await verifyLocalBrowserTransport(descriptor, probeLaunch)
    } catch {
      await recoverLocalWebTransport()
      const recovered = await readUsableServiceDescriptor()
      if (!recovered) throw new Error("The local service transport could not be recovered")
      descriptor = recovered
    }
    const browserLaunch = await createBrowserLaunch(targetId)
    const launch = {
      version: 1,
      endpoint: descriptor.webtransport.endpoint,
      certificate_hash: descriptor.webtransport.certificate_hash,
      token: browserLaunch.token,
      expires_at: browserLaunch.expiresAt,
      listener_epoch: descriptor.listener_epoch,
      target_id: browserLaunch.grant.targetId,
      build: "git-stacks-web/0.21",
    }
    const url = packagedClientUrl()
    url.hash = `launch=${Buffer.from(JSON.stringify(launch)).toString("base64url")}`
    const launcher = createProtectedBrowserLauncher(url)
    if (options.json) console.log(JSON.stringify({ launcher: launcher.toString(), expires_at: launch.expires_at, target_id: launch.target_id }))
    else if (options.open) console.log("git-stacks web: opened the secure packaged client")
    else console.log(`git-stacks web: ${launcher}`)
    if (options.open) openBrowser(launcher.toString())
    await closeServiceClient("browser launch issued")
  })
