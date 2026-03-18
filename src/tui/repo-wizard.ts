import * as p from "@clack/prompts"
import { existsSync } from "fs"
import { resolve, join, basename } from "path"
import { safeText, cancel } from "./utils"
import { readRegistry, writeRegistry, type RepoRegistryEntry } from "../lib/config"
import { expandHome } from "../lib/paths"
import { detectRepoType, scanForRepos } from "../lib/detect"
import { getCurrentBranch } from "../lib/git"

export async function runRepoAdd(pathArg?: string) {
  p.intro("Register repo")

  let rawPath: string
  if (pathArg) {
    rawPath = pathArg
  } else {
    const pathRaw = await safeText({
      message: "Path to git repo",
      validate: (v) => (!v.trim() ? "Required" : undefined),
    })
    if (p.isCancel(pathRaw)) cancel()
    rawPath = (pathRaw as string).trim()
  }

  const localPath = resolve(expandHome(rawPath))

  if (!existsSync(localPath)) {
    p.cancel(`Path does not exist: ${localPath}`)
    process.exit(1)
  }
  if (!existsSync(join(localPath, ".git"))) {
    p.cancel(`Not a git repository: ${localPath}`)
    process.exit(1)
  }

  const autoName = basename(localPath)
  const autoType = detectRepoType(localPath)
  const autoBranch = await getCurrentBranch(localPath)

  const registry = readRegistry()

  const nameRaw = await safeText({
    message: "Registry name",
    fallbackValue: autoName,
    validate: (v) => {
      if (!v.trim()) return "Required"
      if (registry.some((r) => r.name === v.trim())) return `'${v.trim()}' already registered`
    },
  })
  if (p.isCancel(nameRaw)) cancel()
  const name = (nameRaw as string).trim()

  const branchRaw = await safeText({
    message: "Default branch",
    fallbackValue: autoBranch,
    validate: (v) => (!v.trim() ? "Required" : undefined),
  })
  if (p.isCancel(branchRaw)) cancel()
  const defaultBranch = (branchRaw as string).trim()

  const entry: RepoRegistryEntry = {
    name,
    schema_version: "1",
    local_path: localPath,
    default_branch: defaultBranch,
    type: autoType,
  }

  registry.push(entry)
  writeRegistry(registry)

  p.outro(`Registered '${name}' (${autoType}) at ${localPath} [${defaultBranch}]`)
}

export async function runRepoScan(dir: string) {
  p.intro("Scan for repos")

  const spinner = p.spinner()
  spinner.start(`Scanning ${dir}`)

  const discovered = scanForRepos(dir)
  spinner.stop(`Found ${discovered.length} repo(s)`)

  if (discovered.length === 0) {
    p.log.warn("No git repos found in this directory.")
    p.outro("Done.")
    return
  }

  const registry = readRegistry()
  const registeredPaths = new Set(registry.map((r) => r.local_path))

  const newRepos = discovered.filter((d) => !registeredPaths.has(d.path))
  if (newRepos.length === 0) {
    p.log.info("All discovered repos are already registered.")
    p.outro("Done.")
    return
  }

  const selectedRaw = await p.multiselect({
    message: `Select repos to register (${newRepos.length} new)`,
    options: newRepos.map((r) => ({
      value: r.name,
      label: r.name,
      hint: `${r.detectedType} \u2014 ${r.path}`,
    })),
    required: false,
  })
  if (p.isCancel(selectedRaw)) cancel()
  const selectedNames = selectedRaw as string[]

  if (selectedNames.length === 0) {
    p.outro("No repos selected.")
    return
  }

  const registerSpinner = p.spinner()
  registerSpinner.start("Registering repos")

  for (const name of selectedNames) {
    const repo = newRepos.find((r) => r.name === name)!
    // Check for name collision
    let regName = repo.name
    if (registry.some((r) => r.name === regName)) {
      regName = `${regName}-${Date.now()}`
      p.log.warn(`Name collision: using '${regName}' instead of '${repo.name}'`)
    }
    const branch = await getCurrentBranch(repo.path).catch(() => "main")
    registry.push({
      name: regName,
      schema_version: "1",
      local_path: repo.path,
      default_branch: branch,
      type: repo.detectedType,
    })
    registerSpinner.message(`${regName}`)
  }

  writeRegistry(registry)
  registerSpinner.stop(`Registered ${selectedNames.length} repo(s)`)
  p.outro("Done.")
}
