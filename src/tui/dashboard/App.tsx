/** @jsxImportSource @opentui/solid */
import { createSignal, createMemo, Show, Switch, Match } from "solid-js"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { spawn } from "bun"
import { useWorkspaces } from "./hooks/useWorkspaces"
import { useTemplates } from "./hooks/useTemplates"
import { useRepos } from "./hooks/useRepos"
import { useMessages } from "./hooks/useMessages"
import { socketStatus } from "./run"
import { WorkspaceList } from "./WorkspaceList"
import { WorkspaceDetail } from "./WorkspaceDetail"
import { TemplateList } from "./TemplateList"
import { TemplateDetail } from "./TemplateDetail"
import { RepoList } from "./RepoList"
import { RepoDetail } from "./RepoDetail"
import { ActionMenu } from "./ActionMenu"
import { ConfirmDialog } from "./ConfirmDialog"
import { ProgressView } from "./ProgressView"
import { BatchBar } from "./BatchBar"
import { InlineInput } from "./InlineInput"
import { HelpOverlay } from "./HelpOverlay"
import { MessageOverlay } from "./MessageOverlay"
import { TemplateActionMenu } from "./TemplateActionMenu"
import { RepoActionMenu } from "./RepoActionMenu"
import { RemoveBlockedView } from "./RemoveBlockedView"
import {
  cleanWorkspace,
  removeWorkspace,
  mergeWorkspace,
  openWorkspace,
  editWorkspaceYaml,
  renameWorkspace,
  syncWorkspace,
} from "../../lib/workspace-ops"
import type { SyncRow, SyncResult } from "../../lib/workspace-ops"
import { readTemplate, writeTemplate, templateExists, templatePath, readWorkspace, readRegistry, writeRegistry, readGlobalConfig, expandBranchPattern, workspaceExists, writeWorkspace, type WorkspaceRepo, type Workspace, type Template } from "../../lib/config"
import { SyncProgressView } from "./SyncProgressView"
import { WizardView, type WizardStep } from "./WizardView"
import { CreateProgressView, type CreateRow } from "./CreateProgressView"
import { createWorktree, removeWorktree } from "../../lib/git"
import { getTasksDir } from "../../lib/paths"
import { runHooksCaptured, type HookOutputLine } from "../../lib/lifecycle"
import { applyFileOpsForRepo, applyFileOpsForWorkspace } from "../../lib/files"
import { integrations, type IntegrationContext } from "../../lib/integrations"
import { join } from "path"
import { unlinkSync } from "fs"
import type { UIView, Action, Tab } from "./types"

export default function App() {
  const renderer = useRenderer()
  const dims = useTerminalDimensions()
  const { entries, loading, reload } = useWorkspaces()
  const { entries: templateEntries, reload: reloadTemplates } = useTemplates()
  const { entries: repoEntries, reload: reloadRepos } = useRepos()
  const { msgMap, tick, ipcCount, clearSender, reloadMessages } = useMessages()
  const [refreshFlash, setRefreshFlash] = createSignal("")

  const [view, setView] = createSignal<UIView>({ view: "list" })
  const [selected, setSelected] = createSignal<Set<number>>(new Set())
  const [reposSelected, setReposSelected] = createSignal<Set<number>>(new Set())
  const [templatesSelected, setTemplatesSelected] = createSignal<Set<number>>(new Set())
  const [progressLines, setProgressLines] = createSignal<string[]>([])
  const [progressDone, setProgressDone] = createSignal(false)
  const [helpOpen, setHelpOpen] = createSignal(false)
  const [messagesOpen, setMessagesOpen] = createSignal(false)
  const [messagesWorkspace, setMessagesWorkspace] = createSignal("")
  const [confirmContext, setConfirmContext] = createSignal<"workspace" | "template">("workspace")
  const [filterFocused, setFilterFocused] = createSignal(false)
  const [syncRows, setSyncRows] = createSignal<SyncRow[]>([])
  const [syncDone, setSyncDone] = createSignal(false)
  const [syncSummary, setSyncSummary] = createSignal<{ text: string; color: "green" | "yellow" | "red" }>({ text: "", color: "green" })
  const [createRows, setCreateRows] = createSignal<CreateRow[]>([])
  const [createDone, setCreateDone] = createSignal(false)
  const [createSummary, setCreateSummary] = createSignal<{ text: string; color: "green" | "yellow" | "red" }>({ text: "", color: "green" })
  const [repoRemoveTarget, setRepoRemoveTarget] = createSignal<string | null>(null)

  // Tab system
  const [tab, setTab] = createSignal<Tab>("workspaces")

  // Per-tab independent cursor/filter/filtering state
  const tabCursor = {
    workspaces: createSignal(0),
    templates: createSignal(0),
    repos: createSignal(0),
  } as const
  const tabFilter = {
    workspaces: createSignal(""),
    templates: createSignal(""),
    repos: createSignal(""),
  } as const
  const tabFiltering = {
    workspaces: createSignal(false),
    templates: createSignal(false),
    repos: createSignal(false),
  } as const

  // Active tab accessors
  const cursor = createMemo(() => tabCursor[tab()][0]())
  const setCursor = (v: number | ((prev: number) => number)) => tabCursor[tab()][1](v as any)
  const filter = createMemo(() => tabFilter[tab()][0]())
  const setFilter = (v: string | ((prev: string) => string)) => tabFilter[tab()][1](v as any)
  const filtering = createMemo(() => tabFiltering[tab()][0]())
  const setFiltering = (v: boolean) => tabFiltering[tab()][1](v)

  // List pane height estimate for scroll viewport
  const listHeight = createMemo(() => Math.max(6, Math.floor(dims().height * 0.6) - 2))

  // Tab title
  const tabTitle = createMemo(() => {
    const t = tab()
    const ws = t === "workspaces" ? "[1 Workspaces]" : "1 Workspaces"
    const tm = t === "templates" ? "[2 Templates]" : "2 Templates"
    const re = t === "repos" ? "[3 Repos]" : "3 Repos"
    return ` ${ws}  ${tm}  ${re} `
  })

  const filteredEntries = createMemo(() => {
    const f = tabFilter.workspaces[0]().toLowerCase()
    if (!f) return entries()
    return entries().filter((e) => e.workspace.name.toLowerCase().includes(f))
  })

  const filteredTemplates = createMemo(() => {
    const f = tabFilter.templates[0]().toLowerCase()
    if (!f) return templateEntries()
    return templateEntries().filter(t => t.name.toLowerCase().includes(f))
  })

  const filteredRepos = createMemo(() => {
    const f = tabFilter.repos[0]().toLowerCase()
    if (!f) return repoEntries()
    return repoEntries().filter(r => r.name.toLowerCase().includes(f) || r.local_path.toLowerCase().includes(f))
  })

  const currentEntry = createMemo(() => filteredEntries()[tabCursor.workspaces[0]()])
  const currentTemplate = createMemo(() => filteredTemplates()[tabCursor.templates[0]()])
  const currentRepo = createMemo(() => filteredRepos()[tabCursor.repos[0]()])

  const allWorkspaces = createMemo(() => entries().map(e => e.workspace))

  const selectedName = createMemo(() => {
    const t = tab()
    if (t === "workspaces") return currentEntry()?.workspace.name ?? ""
    if (t === "templates") return currentTemplate()?.name ?? ""
    if (t === "repos") return currentRepo()?.name ?? ""
    return ""
  })

  // Detail box title shows selected entity name (list view only)
  const detailBoxTitle = createMemo(() => {
    const name = selectedName()
    return name ? ` ${name} ` : ""
  })

  // Contextual title for ConfirmDialog
  const confirmTitle = createMemo(() => {
    const repoTarget = repoRemoveTarget()
    if (repoTarget) return repoTarget
    if (confirmContext() === "template") return filteredTemplates()[(view() as any).index]?.name ?? "Confirm"
    return filteredEntries()[(view() as any).index]?.workspace.name ?? "Confirm"
  })

  // Context-sensitive help bar text (width-tiered to fit 80-column terminals)
  const helpBarText = createMemo(() => {
    const w = dims().width
    const t = tab()
    const msgShortcut = t === "workspaces" ? "  m Messages" : ""

    if (w < 50) return "? Help  q Quit"
    const core = `Enter Actions  Space Select  / Filter${msgShortcut}  ? Help  q Quit`
    if (w < 65) return core
    if (w <= 80) return `r Refresh  ${core}`
    if (w < 100) return `1/2/3 Tabs  r Refresh  ${core}`
    return `\u2191\u2193/jk Navigate  1/2/3 Tabs  r Refresh  ${core}`
  })

  const inlineInputLabel = createMemo(() => {
    const v = view()
    if (v.view === "inline-input") return v.purpose === "rename" ? "New name" : "Clone as"
    return ""
  })

  function clampCursor() {
    const entriesList = tab() === "workspaces" ? filteredEntries()
      : tab() === "templates" ? filteredTemplates()
      : filteredRepos()
    setCursor(c => Math.min(c, Math.max(0, entriesList.length - 1)))
  }

  function buildSummary(result: SyncResult): { text: string; color: "green" | "yellow" | "red" } {
    const ns = result.synced.length
    const nsk = result.skipped.filter(s => s.reason.includes("conflict")).length
    const nf = result.skipped.length - nsk  // non-conflict skips are failures

    if (ns === 0 && nsk === 0 && nf === 0) {
      return { text: "Nothing to sync. Press any key to continue.", color: "green" }
    }
    if (nf > 0) {
      return { text: `${ns} synced, ${nsk} skipped, ${nf} failed. Press any key to continue.`, color: "red" }
    }
    if (nsk > 0) {
      return { text: `${ns} synced, ${nsk} skipped. Press any key to continue.`, color: "yellow" }
    }
    return { text: `${ns} synced. Press any key to continue.`, color: "green" }
  }

  async function handleRun(name: string) {
    if (!name) return
    setProgressLines([])
    setProgressDone(false)
    setView({ view: "progress", message: `Running ${name}...` })
    const proc = Bun.spawn(["git-stacks", "run", name], {
      stdout: "pipe",
      stderr: "inherit",
    })
    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        for (const line of text.split("\n")) {
          if (line) setProgressLines(prev => [...prev, line])
        }
      }
    } catch {}
    await proc.exited
    setProgressDone(true)
  }

  async function runAction(action: Action, index: number) {
    const entry = filteredEntries()[index]
    if (!entry) return
    const name = entry.workspace.name

    if (action === "rename") {
      setView({ view: "inline-input", index, purpose: "rename", prefill: name })
      return
    }

    if (action === "edit") {
      await launchEditor(name)
      return
    }

    if (action === "open") {
      setProgressLines([])
      setProgressDone(false)
      setView({ view: "progress", message: `Opening ${name}...` })
      const result = await openWorkspace(name, {}, (msg) =>
        setProgressLines((prev) => [...prev, msg])
      )
      if (!result.ok) setProgressLines((prev) => [...prev, `ERROR: ${result.error}`])
      setProgressDone(true)
      return
    }

    if (action === "sync") {
      setView({ view: "confirm", index, action: "sync" })
      return
    }

    // clean, remove, merge need confirmation
    setView({ view: "confirm", index, action })
  }

  async function executeConfirmed(action: Action, index: number, batch?: boolean) {
    if (confirmContext() === "template") {
      const tmpl = filteredTemplates()[index]
      if (tmpl) {
        try { unlinkSync(templatePath(tmpl.name)) } catch {}
        reloadTemplates()
      }
      setConfirmContext("workspace")
      setView({ view: "list" })
      return
    }

    const indicesToProcess = batch
      ? [...selected()]
      : [index]

    const names = indicesToProcess.map((i) => filteredEntries()[i]?.workspace.name).filter(Boolean)

    setProgressLines([])
    setProgressDone(false)
    setView({ view: "progress", message: `${action}: ${names.join(", ")}` })

    const onProgress = (msg: string) =>
      setProgressLines((prev) => [...prev, msg])

    for (const wsName of names) {
      if (!wsName) continue
      let result: { ok: boolean; error?: string }

      switch (action) {
        case "clean":
          result = await cleanWorkspace(wsName, { force: false }, onProgress)
          break
        case "remove":
          result = await removeWorkspace(wsName, { force: false }, onProgress)
          break
        case "merge":
          result = await mergeWorkspace(wsName, { force: false }, onProgress)
          break
        default:
          result = { ok: false, error: `Unknown action: ${action}` }
      }

      if (!result.ok) {
        onProgress(`ERROR [${wsName}]: ${result.error}`)
      }
    }

    if (batch) setSelected(new Set<number>())
    setProgressDone(true)
  }

  async function executeSync(name: string) {
    const ws = readWorkspace(name)
    const initialRows: SyncRow[] = ws.repos
      .filter(r => r.mode === "worktree")
      .map(r => ({ repo: r.name, status: "pending" as const, detail: "", conflicts: [] }))

    setSyncRows(initialRows)
    setSyncDone(false)
    setSyncSummary({ text: "", color: "green" })
    setView({ view: "sync-progress", message: `Syncing ${name}...` })

    const onProgress = (update: SyncRow) => {
      setSyncRows(prev => prev.map(r => r.repo === update.repo ? { ...r, ...update } : r))
    }

    try {
      const result = await syncWorkspace(name, { strategy: "rebase", bestEffort: true }, onProgress)
      setSyncSummary(buildSummary(result))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSyncSummary({ text: `Sync failed: ${msg}. Press any key to continue.`, color: "red" })
    }
    setSyncDone(true)
  }

  async function launchEditor(name: string) {
    const { path, validate } = editWorkspaceYaml(name)
    const editor = process.env.VISUAL || process.env.EDITOR || "vi"

    renderer.suspend()

    try {
      const proc = spawn([editor, path], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })
      await proc.exited

      const result = validate()
      if (!result.ok) {
        // Print error and wait for user to press enter before resuming
        process.stdout.write(`\nValidation error: ${result.error}\nPress Enter to re-edit, or Ctrl+C to discard changes...`)
        // Read a line from stdin
        const buf = Buffer.alloc(256)
        const { read } = await import("fs")
        await new Promise<void>((resolve) => {
          read(0, buf, 0, 256, null, () => resolve())
        })
        // Re-edit
        const proc2 = spawn([editor, path], {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        })
        await proc2.exited
      }
    } finally {
      renderer.resume()
      reload()
    }
  }

  async function handleInlineInputConfirm(value: string) {
    const v = view() as { view: "inline-input"; index: number; purpose: string; prefill: string }
    const trimmed = value.trim()
    if (!trimmed) { setView({ view: "list" }); return }

    if (v.purpose === "rename") {
      const oldName = filteredEntries()[v.index]?.workspace.name
      if (!oldName) { setView({ view: "list" }); return }
      setProgressLines([])
      setProgressDone(false)
      setView({ view: "progress", message: `Renaming ${oldName} → ${trimmed}...` })
      const result = await renameWorkspace(oldName, trimmed, {}, (msg) =>
        setProgressLines(prev => [...prev, msg])
      )
      if (!result.ok) {
        setProgressLines(prev => [...prev, `ERROR: ${result.error}`])
        setProgressDone(true)
      } else {
        setProgressDone(true)
        reload()
        setView({ view: "list" })
      }
      return
    }

    if (v.purpose === "clone-template") {
      const srcName = filteredTemplates()[v.index]?.name
      if (!srcName) { setView({ view: "list" }); return }
      try {
        const src = readTemplate(srcName)
        writeTemplate({ ...src, name: trimmed })
        reloadTemplates()
      } catch {}
      setView({ view: "list" })
      return
    }

    setView({ view: "list" })
  }

  function handleInlineInputCancel() {
    setView({ view: "list" })
  }

  async function handleRepoAction(action: "create-workspace" | "create-template" | "remove") {
    const v = view() as { view: "repo-action-menu"; index: number }
    const repo = filteredRepos()[v.index]
    if (!repo) { setView({ view: "list" }); return }

    // Compute effective repo list: multi-selected or just focused
    const selectedIndices = reposSelected()
    let repoNames: string[]
    if (selectedIndices.size > 0) {
      repoNames = [...selectedIndices].map(i => filteredRepos()[i]?.name).filter(Boolean) as string[]
    } else {
      repoNames = [repo.name]
    }

    if (action === "create-workspace") {
      setReposSelected(new Set<number>())
      setView({ view: "wizard-create-adhoc", source: "repos", repoNames })
      return
    }

    if (action === "create-template") {
      setReposSelected(new Set<number>())
      setView({ view: "wizard-create-template", source: "repos", repoNames })
      return
    }

    if (action === "remove") {
      // Remove operates on focused repo only (not batch)
      const refTemplates = templateEntries().filter(t => t.repos.some(r => r.repo === repo.name))
      const refWorkspaces = allWorkspaces().filter(ws => ws.repos.some(r => r.repo === repo.name))
      if (refTemplates.length > 0 || refWorkspaces.length > 0) {
        setView({ view: "repo-remove-blocked", repoName: repo.name })
      } else {
        setRepoRemoveTarget(repo.name)
        setView({ view: "confirm", index: v.index, action: "remove" })
      }
      return
    }
  }

  async function handleTemplateAction(action: "edit" | "clone" | "remove" | "create-workspace") {
    const v = view() as { view: "action-menu"; index: number }
    const template = filteredTemplates()[v.index]
    if (!template) { setView({ view: "list" }); return }
    const name = template.name

    if (action === "create-workspace") {
      setView({ view: "wizard-create", source: "template", templateIndex: v.index })
      return
    }

    if (action === "edit") {
      const editor = process.env.VISUAL || process.env.EDITOR || "vi"
      const path = templatePath(name)
      renderer.suspend()
      try {
        const proc = spawn([editor, path], { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
        await proc.exited
      } finally {
        renderer.resume()
        reloadTemplates()
        setView({ view: "list" })
      }
      return
    }

    if (action === "clone") {
      setView({ view: "inline-input", index: v.index, purpose: "clone-template", prefill: name + "-copy" })
      return
    }

    if (action === "remove") {
      setConfirmContext("template")
      setView({ view: "confirm", index: v.index, action: "remove" })
      return
    }
  }

  // Wizard types and helpers
  type CreateWizardData = { name: string; branch: string }
  type CreateTemplateData = { name: string }

  function buildTemplateWizardSteps(template: Template): WizardStep<CreateWizardData>[] {
    return [
      {
        kind: "text",
        label: "Workspace name",
        key: "name",
        validate: (v: string) => {
          if (!v.trim()) return "Required"
          if (workspaceExists(v.trim())) return `Workspace '${v.trim()}' already exists`
          return undefined
        },
      },
      {
        kind: "text",
        label: "Branch",
        key: "branch",
        prefill: (data: Partial<CreateWizardData>) => {
          const pattern = template.repos.find(r => r.branch_pattern)?.branch_pattern
          return pattern && data.name ? expandBranchPattern(pattern, data.name) : `feature/${data.name ?? ""}`
        },
        validate: (v: string) => (v.trim() ? undefined : "Required"),
      },
      {
        kind: "confirm",
        buildMessage: (data: Partial<CreateWizardData>) => {
          const repoLines = template.repos.map(r => `  ${r.repo} (${r.mode ?? "worktree"})`).join("\n")
          return `Template: ${template.name}\nBranch: ${data.branch}\nRepos:\n${repoLines}`
        },
      },
    ]
  }

  function buildCreateTemplateSteps(repoNames: string[]): WizardStep<CreateTemplateData>[] {
    return [
      {
        kind: "text" as const,
        label: "Template name",
        key: "name" as const,
        validate: (v: string) => {
          if (!v.trim()) return "Required"
          if (templateExists(v.trim())) return `Template "${v.trim()}" already exists`
          return undefined
        },
      },
      {
        kind: "confirm" as const,
        buildMessage: (data: Partial<CreateTemplateData>) => {
          const repoLines = repoNames.map(n => `  ${n} (worktree)`).join("\n")
          return `Create template "${data.name}" with ${repoNames.length} repos?\n${repoLines}`
        },
      },
    ]
  }

  function buildAdhocWizardSteps(repoNames: string[]): WizardStep<CreateWizardData>[] {
    return [
      {
        kind: "text",
        label: "Workspace name",
        key: "name",
        validate: (v: string) => {
          if (!v.trim()) return "Required"
          if (workspaceExists(v.trim())) return `Workspace '${v.trim()}' already exists`
          return undefined
        },
      },
      {
        kind: "text",
        label: "Branch",
        key: "branch",
        validate: (v: string) => (v.trim() ? undefined : "Required"),
      },
      {
        kind: "confirm",
        buildMessage: (data: Partial<CreateWizardData>) => {
          const repoLines = repoNames.map(n => `  ${n} (worktree)`).join("\n")
          return `Ad-hoc workspace\nBranch: ${data.branch}\nRepos:\n${repoLines}`
        },
      },
    ]
  }

  function executeCreateTemplate(data: CreateTemplateData, repoNames: string[]) {
    const template: Template = {
      name: data.name.trim(),
      schema_version: "1",
      repos: repoNames.map(name => ({
        repo: name,
        mode: "worktree" as const,
      })),
    }
    writeTemplate(template)
    reloadTemplates().then(() => {
      const idx = templateEntries().findIndex(t => t.name === data.name.trim())
      if (idx >= 0) tabCursor.templates[1](idx)
      setTab("templates")
      setView({ view: "list" })
    })
  }

  async function executeCreateWorkspace(
    data: CreateWizardData,
    template: Template | null,
    repoNames: string[] | null,
  ) {
    const wsName = data.name.trim()
    const branch = data.branch.trim()

    setCreateRows([])
    setCreateDone(false)
    setCreateSummary({ text: "", color: "green" })
    setView({ view: "create-progress", workspaceName: wsName })

    try {
      const config = readGlobalConfig()
      const tasksDir = getTasksDir(config.workspace_root)
      const registry = readRegistry()
      const registryMap = new Map(registry.map(r => [r.name, r]))

      // Build repos array
      let repos: WorkspaceRepo[]
      let wsHooks: Workspace["hooks"] | undefined
      let wsEnv: Record<string, string> | undefined
      let wsEnvFile: string | undefined
      let wsFiles: Workspace["files"]
      let wsIntegrationSettings: Record<string, unknown> | undefined
      let templateName: string | undefined

      if (template) {
        // Template-based flow
        templateName = template.name
        repos = []
        for (const tplRepo of template.repos) {
          const regEntry = registryMap.get(tplRepo.repo)
          if (!regEntry) continue  // skip missing registry entries silently
          const mode = tplRepo.mode ?? "worktree"
          const taskPath = mode === "worktree"
            ? join(tasksDir, wsName, regEntry.name)
            : regEntry.local_path
          repos.push({
            name: regEntry.name, repo: tplRepo.repo, type: regEntry.type, mode,
            main_path: regEntry.local_path, task_path: taskPath,
            base_branch: tplRepo.base_branch ?? regEntry.default_branch,
          })
        }
        wsHooks = template.hooks ? JSON.parse(JSON.stringify(template.hooks)) : undefined
        wsEnv = template.env ? { ...template.env } : undefined
        wsEnvFile = template.env_file
        wsFiles = template.files
        wsIntegrationSettings = template.integrations ? JSON.parse(JSON.stringify(template.integrations)) : undefined
      } else if (repoNames) {
        // Ad-hoc flow (per D-09: all worktree mode)
        repos = repoNames.map(name => {
          const regEntry = registryMap.get(name)!
          return {
            name: regEntry.name, repo: regEntry.name, type: regEntry.type,
            mode: "worktree" as const,
            main_path: regEntry.local_path,
            task_path: join(tasksDir, wsName, regEntry.name),
            base_branch: regEntry.default_branch,
          }
        })
      } else {
        throw new Error("No template or repos provided")
      }

      // Initialize progress rows
      const initialRows: CreateRow[] = repos.map(r => ({
        repo: r.name,
        status: r.mode === "trunk" ? "skipped" as const : "pending" as const,
        detail: r.mode === "trunk" ? "trunk mode" : "",
      }))
      setCreateRows(initialRows)

      const baseEnv = { WS_WORKSPACE: wsName, WS_BRANCH: branch, WS_TASKS_DIR: tasksDir }
      const worktreeRepos = repos.filter(r => r.mode === "worktree")

      // Pre-create hooks (D-17: abortOnFailure=false)
      if (wsHooks?.pre_create?.length) {
        for (const r of worktreeRepos) {
          setCreateRows(prev => prev.map(row => row.repo === r.name ? { ...row, status: "running-hooks", detail: "pre_create" } : row))
        }
        await runHooksCaptured(
          wsHooks.pre_create, tasksDir,
          { ...baseEnv },
          (_output: HookOutputLine) => {},
          false  // D-17: don't abort on hook failure
        )
        // Reset status to pending after pre_create hooks
        setCreateRows(prev => prev.map(row => row.status === "running-hooks" ? { ...row, status: "pending", detail: "" } : row))
      }

      // Create worktrees — track created for cleanup on failure (D-19)
      const createdWorktrees: { main_path: string; task_path: string }[] = []
      const wsDir = join(tasksDir, wsName)
      const { mkdirSync, existsSync } = await import("fs")
      if (!existsSync(wsDir)) mkdirSync(wsDir, { recursive: true })

      for (const repo of worktreeRepos) {
        setCreateRows(prev => prev.map(r => r.repo === repo.name ? { ...r, status: "creating-worktree", detail: "creating worktree..." } : r))
        try {
          await createWorktree(repo.main_path, repo.task_path, branch)
          createdWorktrees.push({ main_path: repo.main_path, task_path: repo.task_path })
          setCreateRows(prev => prev.map(r => r.repo === repo.name ? { ...r, status: "done", detail: "worktree created" } : r))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setCreateRows(prev => prev.map(r => r.repo === repo.name ? { ...r, status: "failed", detail: msg } : r))

          // D-19: cleanup already-created worktrees
          for (const created of createdWorktrees) {
            try { await removeWorktree(created.main_path, created.task_path) } catch {}
          }
          // Mark remaining as failed
          setCreateRows(prev => prev.map(r => r.status === "pending" ? { ...r, status: "failed", detail: "aborted" } : r))

          const nCreated = createdWorktrees.length
          setCreateSummary({ text: `Failed on ${repo.name}. ${nCreated} worktree(s) cleaned up. Press any key to continue.`, color: "red" })
          setCreateDone(true)
          return  // abort — don't write workspace YAML
        }
      }

      // File ops (per-repo)
      for (const wsRepo of repos.filter(r => r.mode === "worktree")) {
        if (!(wsRepo as any).files) continue
        const repoLike = { name: wsRepo.name, path: wsRepo.main_path, files: (wsRepo as any).files }
        applyFileOpsForRepo(repoLike, wsRepo)
      }

      // Workspace-instance file ops
      if (wsFiles) {
        const workspaceObj = { name: wsName, repos } as any
        applyFileOpsForWorkspace({ files: wsFiles }, workspaceObj, wsDir)
      }

      // Env files
      const envVars: Record<string, string> = wsEnv ? { ...wsEnv } : {}
      if (wsEnvFile && Object.keys(envVars).length > 0) {
        const { writeFileSync, lstatSync } = await import("fs")
        const content = Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n"
        for (const repo of worktreeRepos) {
          if (!existsSync(repo.task_path)) continue
          const targetPath = join(repo.task_path, wsEnvFile)
          try { if (lstatSync(targetPath).isSymbolicLink()) continue } catch {}
          writeFileSync(targetPath, content, "utf-8")
        }
      }

      // Post-create hooks (D-17: abortOnFailure=false)
      if (wsHooks?.post_create?.length) {
        await runHooksCaptured(
          wsHooks.post_create, wsDir,
          { ...baseEnv, ...envVars },
          (_output: HookOutputLine) => {},
          false
        )
      }

      // Build settings object
      const settingsIntegrations = wsIntegrationSettings && Object.keys(wsIntegrationSettings).length > 0
        ? { settings: { integrations: wsIntegrationSettings } }
        : {}

      // Save workspace YAML
      const workspaceObj: Workspace = {
        name: wsName,
        schema_version: "1",
        branch,
        created: new Date().toISOString().split("T")[0],
        ...(templateName ? { template: templateName } : {}),
        ...(wsHooks ? { hooks: wsHooks } : {}),
        repos,
        ...(wsEnv ? { env: wsEnv } : {}),
        ...(wsEnvFile ? { env_file: wsEnvFile } : {}),
        ...(wsFiles ? { files: wsFiles } : {}),
        ...settingsIntegrations,
      } as Workspace
      writeWorkspace(workspaceObj)

      // Generate integration artifacts
      const ctx: IntegrationContext = { workspace: workspaceObj, tasksDir, config }
      for (const integration of integrations) {
        if (!integration.isEnabled(ctx)) continue
        if (integration.applies && !integration.applies(workspaceObj)) continue
        integration.generate?.(ctx)
      }

      // Summary
      const nCreated = worktreeRepos.length
      const nSkipped = repos.filter(r => r.mode === "trunk").length
      const parts: string[] = []
      if (nCreated > 0) parts.push(`${nCreated} created`)
      if (nSkipped > 0) parts.push(`${nSkipped} trunk`)
      setCreateSummary({ text: `${parts.join(", ")}. Press any key to continue.`, color: "green" })
      setCreateDone(true)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCreateSummary({ text: `Error: ${msg}. Press any key to continue.`, color: "red" })
      setCreateDone(true)
    }
  }

  // Main keyboard handler
  useKeyboard((key) => {
    const v = view()

    // Help overlay toggle — must be at very top
    if (key.name === "?" && !filtering()) {
      if (helpOpen()) { setHelpOpen(false); return }
      setHelpOpen(true)
      return
    }
    if (helpOpen()) return  // block all other keys when help is open (HelpOverlay handles its own)

    // Message overlay guard — MessageOverlay handles its own keys
    if (messagesOpen()) return

    // Handle filter mode — must be before tab switching so 1/2/3/]/[ don't fire
    if (filtering()) {
      if (key.name === "escape") {
        setFilterFocused(false)
        setFiltering(false)
        setFilter("")
        clampCursor()
        return
      }
      if (key.name === "return") {
        setFilterFocused(false)
        setFiltering(false)
        clampCursor()
        return
      }
      return // <input> handles typing, backspace, cursor movement natively
    }

    // Tab switching
    if (key.name === "1") { setTab("workspaces"); setView({ view: "list" }); return }
    if (key.name === "2") { setTab("templates"); setView({ view: "list" }); return }
    if (key.name === "3") { setTab("repos"); setView({ view: "list" }); return }
    if (key.name === "]") {
      setTab(t => t === "workspaces" ? "templates" : t === "templates" ? "repos" : "workspaces")
      setView({ view: "list" })
      return
    }
    if (key.name === "[") {
      setTab(t => t === "workspaces" ? "repos" : t === "repos" ? "templates" : "workspaces")
      setView({ view: "list" })
      return
    }

    // Progress view — any key returns to list
    if (v.view === "progress" && progressDone()) {
      reload()
      setView({ view: "list" })
      clampCursor()
      return
    }

    if (v.view === "progress") return

    // Sync progress — any key returns to list when done
    if (v.view === "sync-progress" && syncDone()) {
      reload()
      setView({ view: "list" })
      clampCursor()
      return
    }
    if (v.view === "sync-progress") return  // block ALL keys during sync (D-11)

    // Confirm dialog
    if (v.view === "confirm") return // ConfirmDialog has its own keyboard handler

    // Action menu
    if (v.view === "action-menu") return // ActionMenu has its own keyboard handler

    // Inline input
    if (v.view === "inline-input") return

    // Wizard views — WizardView handles its own keyboard (escape, y, input)
    if (v.view === "wizard-create" || v.view === "wizard-create-adhoc") return
    if (v.view === "wizard-create-template") return  // WizardView handles its own keys
    if (v.view === "repo-action-menu") return         // RepoActionMenu handles its own keys
    if (v.view === "repo-remove-blocked") return      // RemoveBlockedView handles Esc

    // Create progress — any key returns to list when done (same pattern as sync-progress)
    if (v.view === "create-progress" && createDone()) {
      const wsName = (v as { view: "create-progress"; workspaceName: string }).workspaceName
      setTab("workspaces")
      reload().then(() => {
        const idx = entries().findIndex(e => e.workspace.name === wsName)
        if (idx >= 0) tabCursor.workspaces[1](idx)
        setView({ view: "list" })
      })
      return
    }
    if (v.view === "create-progress") return  // block all keys during creation

    // List view
    if (v.view === "list") {
      const activeEntries = tab() === "workspaces" ? filteredEntries()
        : tab() === "templates" ? filteredTemplates()
        : filteredRepos()
      const len = activeEntries.length

      if (key.name === "q") {
        renderer.destroy()
        return
      }
      if (key.name === "escape") {
        if (helpOpen()) { setHelpOpen(false); return }
        if (filtering()) { setFiltering(false); setFilter(""); clampCursor(); return }
        if (filter()) { setFilter(""); clampCursor(); return }
        if (selected().size > 0) { setSelected(() => new Set<number>()); return }
        if (reposSelected().size > 0) { setReposSelected(() => new Set<number>()); return }
        if (templatesSelected().size > 0) { setTemplatesSelected(() => new Set<number>()); return }
        // NO-OP at top-level list — do NOT call renderer.destroy()
        return
      }

      if (key.name === "up" || key.name === "k") {
        setCursor((i) => Math.max(0, i - 1))
        return
      }

      if (key.name === "down" || key.name === "j") {
        setCursor((i) => Math.min(len - 1, i + 1))
        return
      }

      if (key.name === "return") {
        if (tab() === "repos") {
          if (len > 0) setView({ view: "repo-action-menu", index: cursor() })
          return
        }
        if (len > 0) setView({ view: "action-menu", index: cursor() })
        return
      }

      if (key.name === "space" && tab() === "workspaces") {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(cursor())) next.delete(cursor())
          else next.add(cursor())
          return next
        })
        setCursor((i) => Math.min(len - 1, i + 1))
        return
      }

      if (key.name === "space" && tab() === "repos") {
        setReposSelected((prev) => {
          const next = new Set(prev)
          if (next.has(cursor())) next.delete(cursor())
          else next.add(cursor())
          return next
        })
        setCursor((i) => Math.min(len - 1, i + 1))
        return
      }

      if (key.name === "space" && tab() === "templates") {
        setTemplatesSelected((prev) => {
          const next = new Set(prev)
          if (next.has(cursor())) next.delete(cursor())
          else next.add(cursor())
          return next
        })
        setCursor((i) => Math.min(len - 1, i + 1))
        return
      }

      // Batch operations (workspaces only)
      if (tab() === "workspaces" && selected().size > 0) {
        if (key.name === "c") {
          setView({ view: "confirm", index: cursor(), action: "clean", batch: true })
          return
        }
        if (key.name === "r") {
          setView({ view: "confirm", index: cursor(), action: "remove", batch: true })
          return
        }
      }

      // Message overlay (workspaces tab only, not during batch selection)
      if (key.name === "m" && tab() === "workspaces" && selected().size === 0) {
        const name = currentEntry()?.workspace.name
        if (name) {
          setMessagesWorkspace(name)
          setMessagesOpen(true)
        }
        return
      }

      // Filter — defer focus so the `/` keypress doesn't leak into the input
      // If a filter is already active (indicator showing), re-enter edit mode preserving text
      if (key.name === "/") {
        setFiltering(true)
        if (!filter()) setFilter("")
        setFilterFocused(false)
        setTimeout(() => setFilterFocused(true), 0)
        return
      }

      // Refresh
      if (key.name === "r") {
        if (tab() === "templates") { reloadTemplates(); setRefreshFlash("Refreshed templates"); setTimeout(() => setRefreshFlash(""), 1500); return }
        if (tab() === "repos") { reloadRepos(); setRefreshFlash("Refreshed repos"); setTimeout(() => setRefreshFlash(""), 1500); return }
        reloadMessages()  // sync — setMsgMap fires before reload()
        reload()
        setRefreshFlash("Refreshed")
        setTimeout(() => setRefreshFlash(""), 1500)
        return
      }
    }
  })

  return (
    <box flexDirection="column" height="100%">
      {/* Help overlay replaces EVERYTHING when open */}
      <Show when={helpOpen()}>
        <HelpOverlay tab={tab()} onClose={() => setHelpOpen(false)} />
      </Show>

      {/* Message overlay replaces EVERYTHING when open */}
      <Show when={!helpOpen() && messagesOpen()}>
        <MessageOverlay
          workspaceName={messagesWorkspace()}
          messages={msgMap().get(messagesWorkspace()) ?? []}
          tick={tick()}
          onClose={() => setMessagesOpen(false)}
          onClearSender={(sender) => clearSender(messagesWorkspace(), sender)}
        />
        <box height={1}>
          <text fg="gray">  {"\u2191\u2193"}/jk Navigate groups  c Clear group  Esc Close</text>
        </box>
      </Show>

      {/* Action menus — full-screen CenteredDialog overlays */}
      <Show when={!helpOpen() && !messagesOpen() && view().view === "action-menu"}>
        <Switch>
          <Match when={tab() === "workspaces"}>
            <ActionMenu
              workspaceName={currentEntry()?.workspace.name ?? ""}
              onAction={(action) => runAction(action, (view() as any).index)}
              onCancel={() => setView({ view: "list" })}
              onRun={() => handleRun(selectedName())}
            />
          </Match>
          <Match when={tab() === "templates"}>
            <TemplateActionMenu
              templateName={currentTemplate()?.name ?? ""}
              onAction={handleTemplateAction}
              onCancel={() => setView({ view: "list" })}
            />
          </Match>
        </Switch>
      </Show>

      {/* Repo action menu — full-screen CenteredDialog overlay */}
      <Show when={!helpOpen() && !messagesOpen() && view().view === "repo-action-menu"}>
        <RepoActionMenu
          repoName={currentRepo()?.name ?? ""}
          selectionCount={reposSelected().size}
          onAction={handleRepoAction}
          onCancel={() => setView({ view: "list" })}
        />
      </Show>

      {/* Confirm dialog — full-screen CenteredDialog overlay */}
      <Show when={!helpOpen() && !messagesOpen() && view().view === "confirm"}>
        {(() => {
          const v = view() as { view: "confirm"; index: number; action: Action; batch?: boolean }
          const repoTarget = repoRemoveTarget()
          const label = repoTarget
            ? `Remove repo "${repoTarget}" (${filteredRepos()[v.index]?.local_path})?`
            : confirmContext() === "template"
            ? `${v.action} template '${filteredTemplates()[v.index]?.name}'?`
            : v.action === "sync"
            ? `Sync '${filteredEntries()[v.index]?.workspace.name}'? (rebase from upstream)`
            : v.batch
            ? `${v.action} ${selected().size} workspace(s)?`
            : `${v.action} '${filteredEntries()[v.index]?.workspace.name}'?`
          return (
            <ConfirmDialog
              title={confirmTitle()}
              message={label}
              onConfirm={() => {
                const repoTarget = repoRemoveTarget()
                if (repoTarget) {
                  const registry = readRegistry()
                  const updated = registry.filter(r => r.name !== repoTarget)
                  writeRegistry(updated)
                  reloadRepos()
                  setRepoRemoveTarget(null)
                  setView({ view: "list" })
                  clampCursor()
                  return
                }
                if (v.action === "sync") {
                  const entry = filteredEntries()[v.index]
                  if (entry) executeSync(entry.workspace.name)
                } else {
                  executeConfirmed(v.action, v.index, v.batch)
                }
              }}
              onCancel={() => { setRepoRemoveTarget(null); setView({ view: "list" }) }}
            />
          )
        })()}
      </Show>

      {/* Inline input — full-screen CenteredDialog overlay */}
      <Show when={!helpOpen() && !messagesOpen() && view().view === "inline-input"}>
        <InlineInput
          label={inlineInputLabel()}
          prefill={(view() as any).prefill ?? ""}
          onConfirm={handleInlineInputConfirm}
          onCancel={handleInlineInputCancel}
        />
      </Show>

      {/* Repo remove blocked — full-screen CenteredDialog overlay */}
      <Show when={!helpOpen() && !messagesOpen() && view().view === "repo-remove-blocked"}>
        {(() => {
          const v = view() as { view: "repo-remove-blocked"; repoName: string }
          const refTemplates = templateEntries().filter(t => t.repos.some(r => r.repo === v.repoName))
          const refWorkspaces = allWorkspaces().filter(ws => ws.repos.some(r => r.repo === v.repoName))
          return (
            <RemoveBlockedView
              repoName={v.repoName}
              refTemplates={refTemplates.map(t => ({ name: t.name }))}
              refWorkspaces={refWorkspaces.map(ws => ({ name: ws.name }))}
              onBack={() => setView({ view: "list" })}
            />
          )
        })()}
      </Show>

      {/* Medium dialog overlays — progress and wizard views */}
      <Show when={!helpOpen() && !messagesOpen() && view().view === "progress"}>
        <ProgressView
          title={(view() as any).message}
          lines={progressLines()}
          done={progressDone()}
        />
      </Show>

      <Show when={!helpOpen() && !messagesOpen() && view().view === "sync-progress"}>
        <SyncProgressView
          rows={syncRows()}
          done={syncDone()}
          summary={syncSummary()}
          title={(view() as any).message}
        />
      </Show>

      <Show when={!helpOpen() && !messagesOpen() && view().view === "wizard-create"}>
        {(() => {
          const v = view() as { view: "wizard-create"; templateIndex: number }
          const template = filteredTemplates()[v.templateIndex]
          if (!template) return null
          const tpl = readTemplate(template.name)
          const steps = buildTemplateWizardSteps(tpl)
          return (
            <WizardView
              title="Create Workspace"
              steps={steps}
              onComplete={(data) => executeCreateWorkspace(data as CreateWizardData, tpl, null)}
              onCancel={() => setView({ view: "list" })}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !messagesOpen() && view().view === "wizard-create-adhoc"}>
        {(() => {
          const v = view() as { view: "wizard-create-adhoc"; repoNames: string[] }
          const steps = buildAdhocWizardSteps(v.repoNames)
          return (
            <WizardView
              title="Create Workspace"
              steps={steps}
              onComplete={(data) => executeCreateWorkspace(data as CreateWizardData, null, v.repoNames)}
              onCancel={() => setView({ view: "list" })}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !messagesOpen() && view().view === "wizard-create-template"}>
        {(() => {
          const v = view() as { view: "wizard-create-template"; repoNames: string[] }
          const steps = buildCreateTemplateSteps(v.repoNames)
          return (
            <WizardView
              title="Create Template"
              steps={steps}
              onComplete={(data) => executeCreateTemplate(data as CreateTemplateData, v.repoNames)}
              onCancel={() => setView({ view: "list" })}
            />
          )
        })()}
      </Show>

      <Show when={!helpOpen() && !messagesOpen() && view().view === "create-progress"}>
        <CreateProgressView
          rows={createRows()}
          done={createDone()}
          summary={createSummary()}
          title={"Creating " + (view() as any).workspaceName + "..."}
        />
      </Show>

      <Show when={!helpOpen() && !messagesOpen()}>
        {/* TOP BOX: list pane with tab title in border */}
        <box border title={tabTitle()} flexDirection="column" flexGrow={3} minHeight={10}>
          <Switch>
            <Match when={tab() === "workspaces"}>
              <WorkspaceList
                entries={filteredEntries()}
                cursor={cursor()}
                selected={selected()}
                filter={filtering() ? filter() : ""}
                height={listHeight()}
                allMessages={msgMap()}
                tick={tick()}
              />
            </Match>
            <Match when={tab() === "templates"}>
              <TemplateList
                entries={filteredTemplates()}
                cursor={tabCursor.templates[0]()}
                filter={tabFiltering.templates[0]() ? tabFilter.templates[0]() : ""}
                height={listHeight()}
                selected={templatesSelected()}
              />
            </Match>
            <Match when={tab() === "repos"}>
              <RepoList
                entries={filteredRepos()}
                cursor={tabCursor.repos[0]()}
                filter={tabFiltering.repos[0]() ? tabFilter.repos[0]() : ""}
                height={listHeight()}
                selected={reposSelected()}
              />
            </Match>
          </Switch>
          {/* Batch bar INSIDE top box as footer row */}
          <Show when={view().view === "list" && tab() === "workspaces" && selected().size > 0}>
            <BatchBar count={selected().size} />
          </Show>
        </box>

        {/* BOTTOM BOX: detail pane for list view only */}
        <box border title={detailBoxTitle()} flexDirection="column" flexGrow={2} minHeight={10}>
          {/* List view — tab-specific detail */}
          <Show when={view().view === "list"}>
            <Switch>
              <Match when={tab() === "workspaces"}>
                <WorkspaceDetail entry={currentEntry()} messages={currentEntry() ? (msgMap().get(currentEntry()!.workspace.name) ?? []) : []} tick={tick()} />
              </Match>
              <Match when={tab() === "templates"}>
                <TemplateDetail template={currentTemplate()} />
              </Match>
              <Match when={tab() === "repos"}>
                <RepoDetail
                  entry={currentRepo()}
                  allTemplates={templateEntries()}
                  allWorkspaces={allWorkspaces()}
                />
              </Match>
            </Switch>
          </Show>
        </box>

        {/* HELP BAR / FILTER LINE — single box, no DOM swapping, no height toggling */}
        <box height={1} flexDirection="row" paddingLeft={1}>
          <text fg="cyan">{filtering() || filter() ? "filter: " : ""}</text>
          <input
            focused={filterFocused()}
            value={filter()}
            flexGrow={filtering() ? 1 : 0}
            width={filtering() ? undefined : 0}
            onInput={(v) => { setFilter(typeof v === "string" ? v : ""); clampCursor() }}
          />
          <text fg={!filtering() && filter() ? "cyan" : !filtering() && refreshFlash() ? "green" : "gray"}>
            {filtering() ? "" : filter() ? `"${filter()}" ` : refreshFlash() ? refreshFlash() : loading() ? "(loading statuses...)" : helpBarText()}
          </text>
          <text fg="gray">{!filtering() && filter() ? " / edit · esc clear" : ""}</text>
          <box flexGrow={filtering() ? 0 : 1} />
          <text fg={socketStatus === "bound" ? (ipcCount() > 0 ? "green" : "gray") : "red"}>{filtering() ? "" : socketStatus === "bound" ? "\u25cf" : "\u25cb"}{" "}</text>
        </box>
      </Show>

    </box>
  )
}
