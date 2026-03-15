import * as p from "@clack/prompts"
import { existsSync } from "fs"
import { readStack, writeStack, stackExists, expandHome } from "../lib/config"
import { safeText } from "./utils"
import type { RepoType } from "../lib/config"
import { promptSingleRepo } from "./stack-wizard"
import { scanForRepos } from "../lib/detect"
import { getCurrentBranch } from "../lib/git"

const TYPE_OPTIONS = [
  { value: "java" as RepoType, label: "Java" },
  { value: "typescript" as RepoType, label: "TypeScript" },
  { value: "other" as RepoType, label: "Other" },
]

const MODE_OPTIONS = [
  { value: "worktree" as const, label: "Worktree", hint: "create a branch" },
  { value: "trunk" as const, label: "Trunk", hint: "reference main clone as context" },
]

export async function runStackEdit(name: string) {
  if (!stackExists(name)) {
    console.error(`Stack '${name}' not found.`)
    process.exit(1)
  }

  p.intro(`Edit stack: ${name}`)
  const stack = readStack(name)

  while (true) {
    const repoNames = stack.repos.map((r) => r.name).join(", ")
    p.log.step(
      `${stack.repos.length} repo(s): ${repoNames || "none"}` +
        (stack.description ? `\n  ${stack.description}` : "")
    )

    const actionRaw = await p.select({
      message: "What to do?",
      options: [
        { value: "add-manual", label: "Add repo", hint: "enter path manually" },
        { value: "add-scan", label: "Add repos from directory", hint: "scan and pick" },
        { value: "remove", label: "Remove repos" },
        { value: "edit-repo", label: "Edit a repo", hint: "type, mode, path" },
        { value: "hooks", label: "Edit stack hooks", hint: "post_create / pre_remove" },
        { value: "repo-files", label: "Edit repo file ops", hint: "copy / symlink on worktree create" },
        { value: "description", label: "Change description" },
        { value: "done", label: "Done" },
      ],
    })
    if (p.isCancel(actionRaw) || actionRaw === "done") break

    switch (actionRaw as string) {
      case "add-manual": {
        const repo = await promptSingleRepo()
        if (repo) {
          if (stack.repos.some((r) => r.name === repo.name)) {
            p.log.warn(`Repo '${repo.name}' already in stack — skipped.`)
          } else {
            stack.repos.push(repo)
            p.log.success(`Added ${repo.name}`)
          }
        }
        break
      }

      case "add-scan": {
        const dirRaw = await safeText({
          message: "Directory to scan",
          placeholder: "~/workspaces/main",
          validate: (v) => {
            const val = (v as string | undefined)?.trim()
            if (!val) return "Required"
            if (!existsSync(expandHome(val))) return `Directory does not exist: ${expandHome(val)}`
          },
        })
        if (p.isCancel(dirRaw)) break
        const dir = expandHome((dirRaw as string).trim())

        const spinner = p.spinner()
        spinner.start("Scanning")
        const found = scanForRepos(dir)
        spinner.stop(`Found ${found.length} repo(s)`)

        if (found.length === 0) {
          p.log.warn("No git repos found in that directory.")
          break
        }

        const existing = new Set(stack.repos.map((r) => r.name))
        const available = found.filter((r) => !existing.has(r.name))

        if (available.length === 0) {
          p.log.warn("All repos in that directory are already in this stack.")
          break
        }

        const pickedRaw = await p.multiselect({
          message: "Select repos to add",
          options: available.map((r) => ({
            value: r.name,
            label: r.name,
            hint: r.detectedType,
          })),
          required: false,
        })
        if (p.isCancel(pickedRaw)) break
        const picked = pickedRaw as string[]

        for (const repoName of picked) {
          const discovered = available.find((r) => r.name === repoName)!

          const typeRaw = await p.select({
            message: `${repoName} — type`,
            options: TYPE_OPTIONS,
            initialValue: discovered.detectedType,
          })
          if (p.isCancel(typeRaw)) continue

          const modeRaw = await p.select({
            message: `${repoName} — default mode`,
            options: MODE_OPTIONS,
            initialValue: "worktree" as const,
          })
          if (p.isCancel(modeRaw)) continue

          const currentBranch = await getCurrentBranch(discovered.path).catch(() => "main")
          const branchRaw = await safeText({
            message: `${repoName} — default base branch`,
            fallbackValue: currentBranch,
            validate: (v) => (v.trim() ? undefined : "Required"),
          })
          if (p.isCancel(branchRaw)) continue

          stack.repos.push({
            name: repoName,
            path: discovered.path,
            type: typeRaw as RepoType,
            default_mode: modeRaw as "trunk" | "worktree",
            default_branch: (branchRaw as string).trim(),
          })
          p.log.success(`Added ${repoName}`)
        }
        break
      }

      case "remove": {
        if (stack.repos.length === 0) {
          p.log.warn("No repos to remove.")
          break
        }
        const toRemoveRaw = await p.multiselect({
          message: "Select repos to remove",
          options: stack.repos.map((r) => ({
            value: r.name,
            label: r.name,
            hint: `${r.type} · ${r.default_mode}`,
          })),
          required: false,
        })
        if (p.isCancel(toRemoveRaw)) break
        const toRemove = new Set(toRemoveRaw as string[])
        const removed = stack.repos.filter((r) => toRemove.has(r.name))
        stack.repos = stack.repos.filter((r) => !toRemove.has(r.name))
        for (const r of removed) p.log.success(`Removed ${r.name}`)
        break
      }

      case "edit-repo": {
        if (stack.repos.length === 0) {
          p.log.warn("No repos to edit.")
          break
        }
        const repoNameRaw = await p.select({
          message: "Select repo to edit",
          options: stack.repos.map((r) => ({
            value: r.name,
            label: r.name,
            hint: `${r.type} · ${r.default_mode}`,
          })),
        })
        if (p.isCancel(repoNameRaw)) break
        const repoName = repoNameRaw as string
        const repo = stack.repos.find((r) => r.name === repoName)!

        const fieldRaw = await p.select({
          message: `Edit ${repoName}`,
          options: [
            { value: "type", label: "Type", hint: `current: ${repo.type}` },
            { value: "mode", label: "Default mode", hint: `current: ${repo.default_mode}` },
            { value: "branch", label: "Default base branch", hint: `current: ${repo.default_branch ?? "main"}` },
            { value: "path", label: "Path", hint: repo.path },
          ],
        })
        if (p.isCancel(fieldRaw)) break

        if (fieldRaw === "type") {
          const typeRaw = await p.select({
            message: "New type",
            options: TYPE_OPTIONS,
            initialValue: repo.type,
          })
          if (!p.isCancel(typeRaw)) repo.type = typeRaw as RepoType
        } else if (fieldRaw === "mode") {
          const modeRaw = await p.select({
            message: "New default mode",
            options: MODE_OPTIONS,
            initialValue: repo.default_mode,
          })
          if (!p.isCancel(modeRaw)) repo.default_mode = modeRaw as "trunk" | "worktree"
        } else if (fieldRaw === "branch") {
          const branchRaw = await safeText({
            message: "New default base branch",
            fallbackValue: repo.default_branch ?? "main",
            validate: (v) => (v.trim() ? undefined : "Required"),
          })
          if (!p.isCancel(branchRaw)) repo.default_branch = (branchRaw as string).trim()
        } else if (fieldRaw === "path") {
          const pathRaw = await safeText({
            message: "New path",
            fallbackValue: repo.path,
            validate: (v) => {
              const expanded = expandHome(v.trim())
              if (!existsSync(expanded)) return `Path does not exist: ${expanded}`
            },
          })
          if (!p.isCancel(pathRaw)) repo.path = expandHome((pathRaw as string).trim())
        }
        p.log.success(`Updated ${repoName}`)
        break
      }

      case "hooks": {
        const phaseRaw = await p.select({
          message: "Edit hooks for phase",
          options: [
            {
              value: "post_create" as const,
              label: "post_create",
              hint: `current: ${stack.hooks?.post_create?.length ?? 0} command(s)`,
            },
            {
              value: "pre_remove" as const,
              label: "pre_remove",
              hint: `current: ${stack.hooks?.pre_remove?.length ?? 0} command(s)`,
            },
          ],
        })
        if (p.isCancel(phaseRaw)) break
        const phase = phaseRaw as "post_create" | "pre_remove"

        const existing = stack.hooks?.[phase] ?? []
        if (existing.length > 0) {
          p.log.info(
            `Current commands:\n${existing.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}`
          )
        }

        const hooksAction = await p.select({
          message: `${phase} — action`,
          options: [
            { value: "add", label: "Add command" },
            { value: "clear", label: "Clear all" },
            { value: "cancel", label: "Cancel" },
          ],
        })
        if (p.isCancel(hooksAction) || hooksAction === "cancel") break

        if (hooksAction === "clear") {
          if (!stack.hooks) stack.hooks = {}
          stack.hooks[phase] = []
          p.log.success(`Cleared ${phase} hooks`)
        } else if (hooksAction === "add") {
          const cmdRaw = await safeText({
            message: `Add ${phase} command`,
            placeholder: "echo $WS_WORKSPACE",
            validate: (v) => (v.trim() ? undefined : "Required"),
          })
          if (!p.isCancel(cmdRaw) && cmdRaw) {
            if (!stack.hooks) stack.hooks = {}
            if (!stack.hooks[phase]) stack.hooks[phase] = []
            stack.hooks[phase]!.push((cmdRaw as string).trim())
            p.log.success("Added command")
          }
        }
        break
      }

      case "repo-files": {
        if (stack.repos.length === 0) {
          p.log.warn("No repos to edit.")
          break
        }
        const repoNameRaw = await p.select({
          message: "Select repo",
          options: stack.repos.map((r) => ({
            value: r.name,
            label: r.name,
            hint: `${r.type} · ${r.default_mode}`,
          })),
        })
        if (p.isCancel(repoNameRaw)) break
        const repoName = repoNameRaw as string
        const repo = stack.repos.find((r) => r.name === repoName)!

        const opRaw = await p.select({
          message: `${repoName} — file operation`,
          options: [
            {
              value: "copy" as const,
              label: "copy",
              hint: `current: ${repo.files?.copy?.length ?? 0} file(s)`,
            },
            {
              value: "symlink" as const,
              label: "symlink",
              hint: `current: ${repo.files?.symlink?.length ?? 0} file(s)`,
            },
          ],
        })
        if (p.isCancel(opRaw)) break
        const op = opRaw as "copy" | "symlink"

        const existingFiles = repo.files?.[op] ?? []
        if (existingFiles.length > 0) {
          p.log.info(
            `Current files:\n${existingFiles.map((f, i) => `  ${i + 1}. ${f}`).join("\n")}`
          )
        }

        const filesAction = await p.select({
          message: `${op} — action`,
          options: [
            { value: "add", label: "Add file path" },
            { value: "clear", label: "Clear all" },
            { value: "cancel", label: "Cancel" },
          ],
        })
        if (p.isCancel(filesAction) || filesAction === "cancel") break

        if (filesAction === "clear") {
          if (!repo.files) repo.files = {}
          repo.files[op] = []
          p.log.success(`Cleared ${op} files`)
        } else if (filesAction === "add") {
          const pathRaw = await safeText({
            message: `Add file to ${op}`,
            placeholder: ".env",
            validate: (v) => (v.trim() ? undefined : "Required"),
          })
          if (!p.isCancel(pathRaw) && pathRaw) {
            if (!repo.files) repo.files = {}
            if (!repo.files[op]) repo.files[op] = []
            repo.files[op]!.push((pathRaw as string).trim())
            p.log.success("Added file")
          }
        }
        break
      }

      case "description": {
        const descRaw = await safeText({
          message: "Description",
          fallbackValue: stack.description || undefined,
        })
        if (!p.isCancel(descRaw)) {
          stack.description = (descRaw as string).trim() || undefined
        }
        break
      }

    }

    writeStack(stack)
    p.log.success("Saved")
  }

  p.outro(`Stack '${name}' updated.`)
}
