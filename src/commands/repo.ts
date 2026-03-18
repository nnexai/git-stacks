import { Command } from "commander"
import { existsSync } from "fs"
import { resolve, basename, join } from "path"
import { readRegistry, writeRegistry, type RepoRegistryEntry } from "../lib/config"
import { expandHome } from "../lib/paths"
import { detectRepoType } from "../lib/detect"
import { getCurrentBranch } from "../lib/git"
import { runRepoAdd, runRepoScan } from "../tui/repo-wizard"

export const repoCommand = new Command("repo").description("Manage repo registry")

repoCommand
  .command("add <path>")
  .description("Register a local git repo in the registry")
  .option("--name <name>", "Override the auto-detected repo name")
  .option("--branch <branch>", "Set default branch (auto-detected if not specified)")
  .action(async (rawPath: string, opts: { name?: string; branch?: string }) => {
    const localPath = resolve(expandHome(rawPath))
    if (!existsSync(localPath)) {
      console.error(`Path does not exist: ${localPath}`)
      process.exit(1)
    }
    if (!existsSync(join(localPath, ".git"))) {
      console.error(`Not a git repository: ${localPath}`)
      process.exit(1)
    }
    const registry = readRegistry()
    const name = opts.name ?? basename(localPath)
    if (registry.some((r) => r.name === name)) {
      console.error(`Repo '${name}' already registered. Use a different --name or remove first.`)
      process.exit(1)
    }
    const type = detectRepoType(localPath)
    const defaultBranch = opts.branch ?? (await getCurrentBranch(localPath))
    const entry: RepoRegistryEntry = {
      name,
      schema_version: "1",
      local_path: localPath,
      default_branch: defaultBranch,
      type,
    }
    registry.push(entry)
    writeRegistry(registry)
    console.log(`Registered '${name}' (${type}) at ${localPath} [${defaultBranch}]`)
  })

repoCommand
  .command("scan <dir>")
  .description("Scan a directory for git repos and register them")
  .action(async (rawDir: string) => {
    const dir = resolve(expandHome(rawDir))
    if (!existsSync(dir)) {
      console.error(`Directory does not exist: ${dir}`)
      process.exit(1)
    }
    await runRepoScan(dir)
  })

repoCommand
  .command("list")
  .description("List all registered repos")
  .action(() => {
    const registry = readRegistry()
    if (registry.length === 0) {
      console.log("No repos registered. Run `ws repo add <path>` or `ws repo scan <dir>` to register.")
      return
    }
    console.log("")
    for (const entry of registry) {
      console.log(
        `  ${entry.name.padEnd(24)} ${entry.type.padEnd(12)} ${entry.default_branch.padEnd(12)} ${entry.local_path}`
      )
    }
  })

repoCommand
  .command("show <name>")
  .description("Show details of a registered repo")
  .action((name: string) => {
    const registry = readRegistry()
    const entry = registry.find((r) => r.name === name)
    if (!entry) {
      console.error(`Repo '${name}' not found in registry.`)
      process.exit(1)
    }
    console.log(`Name:           ${entry.name}`)
    console.log(`Local path:     ${entry.local_path}`)
    console.log(`Type:           ${entry.type}`)
    console.log(`Default branch: ${entry.default_branch}`)
    console.log(`Exists on disk: ${existsSync(entry.local_path) ? "yes" : "NO"}`)
  })

repoCommand
  .command("remove <name>")
  .description("Remove a repo from the registry")
  .option("--force", "Skip confirmation prompt")
  .action(async (name: string, opts: { force?: boolean }) => {
    const registry = readRegistry()
    const idx = registry.findIndex((r) => r.name === name)
    if (idx === -1) {
      console.error(`Repo '${name}' not found in registry.`)
      process.exit(1)
    }

    if (!opts.force) {
      const p = await import("@clack/prompts")
      const ok = await p.confirm({
        message: `Remove repo '${name}' from registry? (This does not delete any files.)`,
        initialValue: false,
      })
      if (p.isCancel(ok) || !ok) {
        console.log("Cancelled.")
        return
      }
    }

    registry.splice(idx, 1)
    writeRegistry(registry)
    console.log(`Removed '${name}' from registry.`)
  })

repoCommand
  .command("rename <old> <new>")
  .description("Rename a registered repo in the registry")
  .action((oldName: string, newName: string) => {
    const registry = readRegistry()
    const entry = registry.find((r) => r.name === oldName)
    if (!entry) {
      console.error(`Repo '${oldName}' not found in registry.`)
      process.exit(1)
    }
    if (registry.some((r) => r.name === newName)) {
      console.error(`Repo '${newName}' already exists in registry.`)
      process.exit(1)
    }
    entry.name = newName
    writeRegistry(registry)
    console.log(`Renamed '${oldName}' \u2192 '${newName}' in registry.`)
  })
