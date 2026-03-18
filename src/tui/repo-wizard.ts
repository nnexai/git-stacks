import * as p from "@clack/prompts"
import { cancel } from "./utils"
import { readRegistry, writeRegistry } from "../lib/config"
import { scanForRepos } from "../lib/detect"
import { getCurrentBranch } from "../lib/git"

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
