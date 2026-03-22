import { Command } from "commander"
import { integrations } from "../lib/integrations/index"

export const integrationCommand = new Command("integration")
  .description("Integration helper commands")

for (const integration of integrations) {
  if (!integration.commands) continue
  const sub = new Command(integration.id).description(integration.hint)
  integration.commands(sub)
  integrationCommand.addCommand(sub)
}
