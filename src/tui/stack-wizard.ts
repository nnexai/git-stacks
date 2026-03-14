import * as p from "@clack/prompts"
import { existsSync } from "fs"
import { basename } from "path"
import { writeStack, stackExists, expandHome, readGlobalConfig } from "../lib/config"
import type { StackRepo, RepoType } from "../lib/config"
import { getMainDir } from "../lib/paths"
import { scanForRepos, detectRepoType } from "../lib/detect"
import { getCurrentBranch } from "../lib/git"
import { safeText } from "./utils"

export function cancel(): never {
  p.cancel("Cancelled.")
  process.exit(0)
}

const TYPE_OPTIONS = [
  { value: "java" as RepoType, label: "Java" },
  { value: "typescript" as RepoType, label: "TypeScript" },
  { value: "other" as RepoType, label: "Other" },
]

const MODE_OPTIONS = [
  { value: "worktree" as const, label: "Worktree", hint: "create a branch" },
  { value: "trunk" as const, label: "Trunk", hint: "reference main clone as context" },
]

// Prompt for a single repo's details. Returns null if the user cancels mid-way.
export async function promptSingleRepo(opts?: {
  initialName?: string
  initialPath?: string
  initialType?: RepoType
  initialMode?: "trunk" | "worktree"
  initialBranch?: string
}): Promise<StackRepo | null> {
  const repoNameRaw = await safeText({
    message: "Repo name",
    fallbackValue: opts?.initialName || undefined,
    validate: (v) => (v.trim() ? undefined : "Required"),
  })
  if (p.isCancel(repoNameRaw)) return null
  const repoName = (repoNameRaw as string).trim()

  const repoPathRaw = await safeText({
    message: "Path to main clone",
    fallbackValue: opts?.initialPath || undefined,
    placeholder: "~/workspaces/main/my-repo",
    validate: (v) => {
      const expanded = expandHome(v.trim())
      if (!existsSync(expanded)) return `Path does not exist: ${expanded}`
    },
  })
  if (p.isCancel(repoPathRaw)) return null
  const repoPath = expandHome((repoPathRaw as string).trim())

  // Auto-detect type and current branch from the repo path
  const detected = detectRepoType(repoPath)
  const currentBranch = await getCurrentBranch(repoPath).catch(() => "main")

  const typeRaw = await p.select({
    message: "Language / type",
    options: TYPE_OPTIONS,
    initialValue: opts?.initialType ?? detected,
  })
  if (p.isCancel(typeRaw)) return null

  const modeRaw = await p.select({
    message: "Default mode",
    options: MODE_OPTIONS,
    initialValue: opts?.initialMode ?? "worktree",
  })
  if (p.isCancel(modeRaw)) return null

  const defaultBranchRaw = await safeText({
    message: "Default base branch",
    fallbackValue: opts?.initialBranch ?? currentBranch,
    validate: (v) => (v.trim() ? undefined : "Required"),
  })
  if (p.isCancel(defaultBranchRaw)) return null

  return {
    name: repoName,
    path: repoPath,
    type: typeRaw as RepoType,
    default_mode: modeRaw as "trunk" | "worktree",
    default_branch: (defaultBranchRaw as string).trim(),
  }
}

export async function runStackNew() {
  p.intro("New stack")

  const nameRaw = await safeText({
    message: "Stack name",
    validate: (v) => {
      if (!v.trim()) return "Required"
      if (stackExists(v.trim())) return `Stack '${v.trim()}' already exists`
    },
  })
  if (p.isCancel(nameRaw)) cancel()
  const name = (nameRaw as string).trim()

  const descRaw = await safeText({ message: "Description (optional)" })
  if (p.isCancel(descRaw)) cancel()

  const repos: StackRepo[] = []

  while (true) {
    const addMore = await p.confirm({
      message: repos.length === 0 ? "Add a repo?" : "Add another repo?",
      initialValue: true,
    })
    if (p.isCancel(addMore) || !addMore) break

    const repo = await promptSingleRepo()
    if (!repo) break

    repos.push(repo)
    p.log.success(`Added ${repo.name}`)
  }

  if (repos.length === 0) {
    p.cancel("No repos added — stack not saved.")
    process.exit(0)
  }

  writeStack({ name, description: (descRaw as string).trim() || undefined, repos })
  p.outro(`Stack '${name}' saved with ${repos.length} repo(s).`)
}

export async function runStackInit(dirArg?: string) {
  p.intro("Initialize stack from directory")

  const config = readGlobalConfig()
  const defaultDir = getMainDir(config.workspace_root)

  let dir: string
  if (dirArg) {
    dir = expandHome(dirArg)
  } else {
    const dirRaw = await safeText({
      message: "Directory to scan",
      placeholder: defaultDir,
      validate: (v) => {
        const expanded = expandHome((v.trim() || defaultDir))
        if (!existsSync(expanded)) return `Directory does not exist: ${expanded}`
      },
    })
    if (p.isCancel(dirRaw)) cancel()
    dir = expandHome((dirRaw as string).trim() || defaultDir)
  }

  const spinner = p.spinner()
  spinner.start("Scanning for git repos")
  const found = scanForRepos(dir)
  spinner.stop(
    found.length === 0 ? "No git repos found" : `Found ${found.length} repo(s)`
  )

  if (found.length === 0) {
    p.cancel(`No git repos found in ${dir}`)
    process.exit(1)
  }

  // Select repos to include
  const selectedNamesRaw = await p.multiselect({
    message: "Select repos to include",
    options: found.map((r) => ({
      value: r.name,
      label: r.name,
      hint: r.detectedType,
    })),
    initialValues: found.map((r) => r.name),
    required: true,
  })
  if (p.isCancel(selectedNamesRaw)) cancel()
  const selectedNames = selectedNamesRaw as string[]
  const selected = found.filter((r) => selectedNames.includes(r.name))

  // Read current branch for each selected repo
  const branchSpinner = p.spinner()
  branchSpinner.start("Reading current branches")
  const branchMap = new Map<string, string>()
  for (const r of selected) {
    branchMap.set(r.name, await getCurrentBranch(r.path).catch(() => "main"))
  }
  branchSpinner.stop("Done")

  // Show detected types — offer to fix any that are wrong
  const typeLines = selected.map((r) => `  ${r.name.padEnd(32)} ${r.detectedType}`).join("\n")
  p.log.step(`Detected types:\n${typeLines}`)

  const toFixTypesRaw = await p.multiselect({
    message: "Fix type for any repos? (skip if all correct)",
    options: selected.map((r) => ({ value: r.name, label: r.name, hint: r.detectedType })),
    initialValues: [],
    required: false,
  })
  if (p.isCancel(toFixTypesRaw)) cancel()
  const toFixTypes = new Set(toFixTypesRaw as string[])

  const typeOverrides = new Map<string, RepoType>()
  for (const name of toFixTypes) {
    const current = selected.find((r) => r.name === name)!.detectedType
    const fixedRaw = await p.select({
      message: `${name} — correct type`,
      options: TYPE_OPTIONS,
      initialValue: current,
    })
    if (p.isCancel(fixedRaw)) cancel()
    typeOverrides.set(name, fixedRaw as RepoType)
  }

  // Show detected branches — offer to fix any that are wrong
  const branchLines = selected
    .map((r) => `  ${r.name.padEnd(32)} ${branchMap.get(r.name) ?? "main"}`)
    .join("\n")
  p.log.step(`Detected branches:\n${branchLines}`)

  const toFixBranchesRaw = await p.multiselect({
    message: "Fix branch for any repos? (skip if all correct)",
    options: selected.map((r) => ({
      value: r.name,
      label: r.name,
      hint: branchMap.get(r.name) ?? "main",
    })),
    initialValues: [],
    required: false,
  })
  if (p.isCancel(toFixBranchesRaw)) cancel()
  const toFixBranches = new Set(toFixBranchesRaw as string[])

  const branchOverrides = new Map<string, string>()
  for (const name of toFixBranches) {
    const current = branchMap.get(name) ?? "main"
    const fixedRaw = await safeText({
      message: `${name} — correct base branch`,
      fallbackValue: current,
      validate: (v) => (v.trim() ? undefined : "Required"),
    })
    if (p.isCancel(fixedRaw)) cancel()
    branchOverrides.set(name, (fixedRaw as string).trim())
  }

  // Default mode: global or per-repo
  const globalModeRaw = await p.select({
    message: "Default mode for all repos",
    options: [
      ...MODE_OPTIONS,
      { value: "per-repo" as const, label: "Set per repo", hint: "ask individually" },
    ],
  })
  if (p.isCancel(globalModeRaw)) cancel()
  const globalMode = globalModeRaw as "trunk" | "worktree" | "per-repo"

  const modeOverrides = new Map<string, "trunk" | "worktree">()
  if (globalMode === "per-repo") {
    for (const repo of selected) {
      const modeRaw = await p.select({
        message: `${repo.name} — mode`,
        options: MODE_OPTIONS,
        initialValue: "worktree" as const,
      })
      if (p.isCancel(modeRaw)) cancel()
      modeOverrides.set(repo.name, modeRaw as "trunk" | "worktree")
    }
  }

  // Stack name (suggest from dir name)
  const suggestedName = basename(dir)
  const nameRaw = await safeText({
    message: "Stack name",
    fallbackValue: suggestedName,
    validate: (v) => {
      if (!v.trim()) return "Required"
      if (stackExists(v.trim())) return `Stack '${v.trim()}' already exists`
    },
  })
  if (p.isCancel(nameRaw)) cancel()
  const name = (nameRaw as string).trim()

  const descRaw = await safeText({ message: "Description (optional)" })
  if (p.isCancel(descRaw)) cancel()

  const repos: StackRepo[] = selected.map((r) => ({
    name: r.name,
    path: r.path,
    type: typeOverrides.get(r.name) ?? r.detectedType,
    default_mode:
      globalMode === "per-repo" ? (modeOverrides.get(r.name) ?? "worktree") : globalMode,
    default_branch: branchOverrides.get(r.name) ?? branchMap.get(r.name) ?? "main",
  }))

  writeStack({ name, description: (descRaw as string).trim() || undefined, repos })
  p.outro(`Stack '${name}' initialized with ${repos.length} repo(s).`)
}
