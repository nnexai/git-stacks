import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "fs"
import { delimiter, join } from "path"
import { installAgentIntegrations } from "./integration-manager"

const wrapperCommands = [
  { provider: "codex", command: "codex" },
  { provider: "copilot", command: "copilot-cli" },
  { provider: "copilot", command: "copilot" },
  { provider: "claude", command: "claude" },
  { provider: "opencode", command: "opencode" },
] as const

function shellQuote(value: string): string { return `'${value.replaceAll("'", `'\\''`)}'` }

/**
 * Prepare coding-agent command wrappers for service-owned terminal sessions.
 * User-level integrations provide richer lifecycle events when available;
 * wrappers remain the zero-preparation start/exit signal fallback.
 */
export function prepareTerminalAgentEnvironment(
  repoPath: string,
  workspaceName: string,
  basePath: string,
  wrapperDir: string,
  resolveExecutable: (command: string, path: string) => string | null = (command, path) => Bun.which(command, { PATH: path }),
  options: { installIntegrations?: boolean; integrationHome?: string } = {},
): Record<string, string> {
  // Provider integrations are user-level, app-owned assets. Never dirty a
  // workspace merely because the service opened a browser terminal.
  void repoPath
  mkdirSync(wrapperDir, { recursive: true, mode: 0o700 })
  const lookupPath = [...new Set(basePath.split(delimiter).filter((entry) => entry && entry !== wrapperDir))].join(delimiter)
  const report = options.installIntegrations ? installAgentIntegrations({ ...(options.integrationHome ? { home: options.integrationHome } : {}) }) : null
  const failedProviders = new Set(report?.providers.filter((entry) => entry.state === "failed").map((entry) => entry.provider) ?? wrapperCommands.map((entry) => entry.provider))
  for (const { provider, command } of wrapperCommands) {
    const executable = resolveExecutable(command, lookupPath)
    const target = join(wrapperDir, command)
    if (!executable || !failedProviders.has(provider)) { if (existsSync(target)) rmSync(target); continue }
    const publish = (state: "working" | "completed" | "failed") =>
      `git-stacks service signal publish --state ${state} --source ${provider} --workspace ${shellQuote(workspaceName)} --workspace-id "$GIT_STACKS_WORKSPACE_ID" --repository-id "$GIT_STACKS_REPOSITORY_ID" --surface-id "$GIT_STACKS_SURFACE_ID" --session-id "$GIT_STACKS_AGENT_SESSION_ID" --best-effort >/dev/null 2>&1 || true`
    const script = `#!/bin/sh\nGIT_STACKS_AGENT_SESSION_ID="${provider}-$$"\nexport GIT_STACKS_AGENT_SESSION_ID\n${publish("working")}\n${shellQuote(executable)} "$@"\nstatus=$?\nif [ "$status" -eq 0 ]; then\n  ${publish("completed")}\nelse\n  ${publish("failed")}\nfi\nexit "$status"\n`
    const temporary = `${target}.tmp-${process.pid}`
    writeFileSync(temporary, script, { mode: 0o700 })
    chmodSync(temporary, 0o700)
    renameSync(temporary, target)
  }
  const failed = report?.providers.filter((entry) => entry.state === "failed") ?? []
  return {
    PATH: `${wrapperDir}${delimiter}${lookupPath}`,
    GIT_STACKS_AGENT_SIGNALS: report ? (failed.length ? "hooks-degraded+process-fallback" : "hooks+osc") : "process",
    ...(report ? { GIT_STACKS_AGENT_INTEGRATION_HEALTH: failed.length ? failed.map((entry) => entry.provider).join(",") : "healthy" } : {}),
  }
}

