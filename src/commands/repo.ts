import { Command } from "commander"
import { existsSync } from "fs"
import { resolve, basename, join } from "path"
import { readRegistry, writeRegistry, readGlobalConfig, NameSchema, type RepoRegistryEntry } from "../lib/config"
import { expandHome } from "../lib/paths"
import { detectRepoType } from "../lib/detect"
import { getCurrentBranch } from "../lib/git"
import { runRepoScan } from "../tui/repo-wizard"
import { prompts as p } from "../tui/utils"
import { editRegistryYaml, openYamlInEditor } from "../lib/workspace-yaml"
import { detectForgeForRepoEnabled } from "../lib/integrations/forge-utils"

export const repoCommand = new Command("repo")
  .description("Manage repo registry")
  .option("--yaml", "Open registry.yml in $EDITOR")
  .action(async (opts: { yaml?: boolean }) => {
    if (opts.yaml) {
      const { path, validate } = editRegistryYaml()
      await openYamlInEditor(path, validate)
      return
    }
    repoCommand.help()
  })

repoCommand
  .command("add <path>")
  .description("Register a local git repo or directory in the registry")
  .option("--name <name>", "Override the auto-detected repo name")
  .option("--branch <branch>", "Set default branch (auto-detected if not specified)")
  .action(async (rawPath: string, opts: { name?: string; branch?: string }) => {
    const localPath = resolve(expandHome(rawPath))
    if (!existsSync(localPath)) {
      console.error(`Path does not exist: ${localPath}`)
      process.exit(1)
    }
    const isDir = !existsSync(join(localPath, ".git"))
    const registry = readRegistry()
    const name = opts.name ?? basename(localPath)
    const nameResult = NameSchema.safeParse(name)
    if (!nameResult.success) {
      console.error(`Invalid repo name '${name}': ${nameResult.error.issues[0]?.message}`)
      process.exit(1)
    }
    if (registry.some((r) => r.name === name)) {
      console.error(`Repo '${name}' already registered. Use a different --name or remove first.`)
      process.exit(1)
    }
    const type = detectRepoType(localPath)

    let defaultBranch: string
    let forge: "github" | "gitlab" | "gitea" | undefined

    if (isDir) {
      // Dir repos: no git operations, no forge detection
      defaultBranch = "main"
      forge = undefined
    } else {
      // Git repos: existing branch detection and forge logic
      defaultBranch = opts.branch ?? (await getCurrentBranch(localPath))

      // Detect forge from remote URL and CLI availability - only for globally enabled forges.
      const globalConfig = readGlobalConfig()
      const forgeSuggestions = await detectForgeForRepoEnabled(localPath, globalConfig)
      if (forgeSuggestions.length === 1) {
        // Exactly one enabled forge matched - auto-select.
        forge = forgeSuggestions[0]
        console.log(`  Detected forge: ${forge}`)
      } else if (forgeSuggestions.length > 1) {
        // Multiple enabled forges matched - prompt only among those matches plus None.
        const choice = await p.select({
          message: "Multiple forges detected — select one",
          options: [
            { value: "none", label: "None" },
            ...forgeSuggestions.map((f) => ({ value: f, label: f })),
          ],
        })
        if (p.isCancel(choice)) { console.log("Cancelled."); process.exit(0) }
        forge = choice === "none" ? undefined : (choice as "github" | "gitlab" | "gitea")
      } else {
        // No enabled forge matched - register without forge metadata and do not prompt.
        forge = undefined
      }
    }

    const entry: RepoRegistryEntry = {
      name,
      schema_version: "1",
      local_path: localPath,
      default_branch: defaultBranch,
      type,
      forge,
      is_dir: isDir,
    }
    registry.push(entry)
    writeRegistry(registry)
    const dirLabel = isDir ? " [dir]" : ""
    const forgeLabel = forge ? ` [forge: ${forge}]` : ""
    console.log(`Registered '${name}' (${type}) at ${localPath} [${defaultBranch}]${forgeLabel}${dirLabel}`)
  })

repoCommand
  .command("scan <dir>")
  .description("Scan a directory for repos and directories and register them")
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
      console.log("No repos registered. Run `git-stacks repo add <path>` or `git-stacks repo scan <dir>` to register.")
      return
    }
    console.log("")
    for (const entry of registry) {
      const dirLabel = entry.is_dir ? " [dir]" : ""
      console.log(
        `  ${entry.name.padEnd(24)} ${entry.type.padEnd(12)} ${entry.default_branch.padEnd(12)} ${entry.local_path}${dirLabel}`
      )
    }
  })

repoCommand
  .command("show <repo>")
  .description("Show details of a registered repo")
  .action((repo: string) => {
    const registry = readRegistry()
    const entry = registry.find((r) => r.name === repo)
    if (!entry) {
      console.error(`Repo '${repo}' not found in registry.`)
      process.exit(1)
    }
    console.log(`Name:           ${entry.name}`)
    console.log(`Local path:     ${entry.local_path}`)
    console.log(`Type:           ${entry.type}`)
    console.log(`Default branch: ${entry.default_branch}`)
    console.log(`Exists on disk: ${existsSync(entry.local_path) ? "yes" : "NO"}`)
    if (entry.is_dir) {
      console.log(`Dir mode:       yes`)
    }
  })

repoCommand
  .command("remove <repo>")
  .description("Remove a repo from the registry")
  .option("--force", "Skip confirmation prompt")
  .action(async (repo: string, opts: { force?: boolean }) => {
    const registry = readRegistry()
    const idx = registry.findIndex((r) => r.name === repo)
    if (idx === -1) {
      console.error(`Repo '${repo}' not found in registry.`)
      process.exit(1)
    }

    if (!opts.force) {
      const ok = await p.confirm({
        message: `Remove repo '${repo}' from registry? (This does not delete any files.)`,
        initialValue: false,
      })
      if (p.isCancel(ok) || !ok) {
        console.log("Cancelled.")
        return
      }
    }

    registry.splice(idx, 1)
    writeRegistry(registry)
    console.log(`Removed '${repo}' from registry.`)
  })

repoCommand
  .command("rename <repo> <new-name>")
  .description("Rename a registered repo in the registry")
  .action((repo: string, newName: string) => {
    const nameResult = NameSchema.safeParse(newName)
    if (!nameResult.success) {
      console.error(`Invalid repo name '${newName}': ${nameResult.error.issues[0]?.message}`)
      process.exit(1)
    }
    const registry = readRegistry()
    const entry = registry.find((r) => r.name === repo)
    if (!entry) {
      console.error(`Repo '${repo}' not found in registry.`)
      process.exit(1)
    }
    if (registry.some((r) => r.name === newName)) {
      console.error(`Repo '${newName}' already exists in registry.`)
      process.exit(1)
    }
    entry.name = newName
    writeRegistry(registry)
    console.log(`Renamed '${repo}' \u2192 '${newName}' in registry.`)
  })
