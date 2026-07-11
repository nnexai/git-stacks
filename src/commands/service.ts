import { Command } from "commander"
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
