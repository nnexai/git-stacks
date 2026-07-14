import { Command } from "commander"
import {
  installAgentIntegrations,
  integrationStatus,
  INTEGRATION_PROVIDERS,
  type IntegrationProvider,
  type IntegrationReport,
  uninstallAgentIntegrations,
  updateAgentIntegrations,
} from "../lib/agent-hooks/integration-manager"

function printReport(report: IntegrationReport): void {
  console.log(JSON.stringify(report, null, 2))
  if (report.providers.some((entry) => entry.state === "failed")) process.exitCode = 1
}

function selectProviders(values: string[]): IntegrationProvider[] {
  const normalized = [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))]
  const invalid = normalized.filter((value) => value !== "all" && !(INTEGRATION_PROVIDERS as readonly string[]).includes(value))
  if (invalid.length) throw new Error(`unknown coding-agent integration${invalid.length === 1 ? "" : "s"}: ${invalid.join(", ")}; choose ${INTEGRATION_PROVIDERS.join(", ")}, or all`)
  if (normalized.includes("all")) return [...INTEGRATION_PROVIDERS]
  return normalized as IntegrationProvider[]
}

export const hooksCommand = new Command("hooks")
  .description("Manage opt-in coding-agent signal hooks")
  .action(() => printReport(integrationStatus()))

hooksCommand.command("status")
  .description("Show coding-agent hook health without changing files")
  .action(() => printReport(integrationStatus()))

hooksCommand.command("install")
  .description("Install git-stacks hooks for selected providers")
  .argument("<providers...>", `Providers: ${INTEGRATION_PROVIDERS.join(", ")}, or all`)
  .action((providers: string[]) => printReport(installAgentIntegrations({ providers: selectProviders(providers) })))

hooksCommand.command("update")
  .description("Update only git-stacks hooks that are already installed")
  .action(() => printReport(updateAgentIntegrations()))

hooksCommand.command("uninstall")
  .description("Uninstall git-stacks hooks for selected providers")
  .argument("<providers...>", `Providers: ${INTEGRATION_PROVIDERS.join(", ")}, or all`)
  .action((providers: string[]) => printReport(uninstallAgentIntegrations({ providers: selectProviders(providers) })))
