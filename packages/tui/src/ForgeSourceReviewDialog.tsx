/** @jsxImportSource @opentui/solid */

import { For, Match, Switch, createSignal, onMount } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import type { ForgeReviewCoordinator, ForgeReviewState } from "@git-stacks/client"

import { CenteredDialog } from "./CenteredDialog"

type Props = {
  coordinator: ForgeReviewCoordinator
  initialUrl?: string
  onAccepted: (operationId: string, workspaceName: string) => void
  onBack: () => void
}

type ReviewRow =
  | { key: "workspace"; kind: "workspace" }
  | { key: "template"; kind: "template" }
  | { key: "source"; kind: "source" }
  | { key: `included:${string}`; kind: "included"; repositoryId: string }
  | { key: `branch:${string}`; kind: "branch"; repositoryId: string }

type ReviewState = Exclude<ForgeReviewState, { phase: "resolve" }>

function compact(value: string, width: number): string {
  if (width >= 56 || value.length <= Math.max(12, width - 18)) return value
  const limit = Math.max(12, width - 19)
  return `${value.slice(0, limit)}…`
}

function reviewRows(current: ReviewState): ReviewRow[] {
  const rows: ReviewRow[] = [
    { key: "workspace", kind: "workspace" },
    { key: "template", kind: "template" },
    { key: "source", kind: "source" },
  ]
  const template = current.anchor.candidates.templates.find(({ name }) => name === current.draft.template_name)
  const modes = new Map(template?.repositories.map(({ repository_id, mode }) => [repository_id, mode]) ?? [])
  for (const repository of current.draft.repositories) {
    rows.push({ key: `included:${repository.repository_id}`, kind: "included", repositoryId: repository.repository_id })
    if (repository.included && modes.get(repository.repository_id) === "worktree") {
      rows.push({ key: `branch:${repository.repository_id}`, kind: "branch", repositoryId: repository.repository_id })
    }
  }
  return rows
}

export function ForgeSourceReviewDialog(props: Props) {
  const dimensions = useTerminalDimensions()
  const initialState = props.coordinator.state()
  const [url, setUrl] = createSignal(props.initialUrl ?? initialState.url)
  const [revision, setRevision] = createSignal(0)
  const [selectedKey, setSelectedKey] = createSignal<ReviewRow["key"]>("workspace")
  const [editing, setEditing] = createSignal(false)
  const [editValue, setEditValue] = createSignal("")
  const [creating, setCreating] = createSignal(false)
  const [resolveInputFocused, setResolveInputFocused] = createSignal(false)
  if (props.initialUrl && initialState.phase === "resolve" && initialState.url !== props.initialUrl) props.coordinator.setUrl(props.initialUrl)
  onMount(() => setTimeout(() => setResolveInputFocused(true), 0))

  const state = (): ForgeReviewState => { void revision(); return props.coordinator.state() }
  const refresh = () => setRevision((value) => value + 1)
  const tooSmall = () => dimensions().width < 40 || dimensions().height < 12
  const stacked = () => dimensions().width < 80
  const selectedRow = (current: ReviewState): ReviewRow => {
    const rows = reviewRows(current)
    return rows.find(({ key }) => key === selectedKey()) ?? rows[0]!
  }
  const selectedIndex = (current: ReviewState): number => reviewRows(current).findIndex(({ key }) => key === selectedRow(current).key)

  const editSelected = () => {
    const current = state()
    if (current.phase !== "review") return
    const selected = selectedRow(current)
    if (selected.kind === "workspace") {
      setEditValue(current.draft.workspace_name)
      setEditing(true)
      return
    }
    if (selected.kind === "branch") {
      const repository = current.draft.repositories.find(({ repository_id }) => repository_id === selected.repositoryId)
      setEditValue(repository?.branch.workspace_branch ?? "")
      setEditing(true)
      return
    }
    if (selected.kind === "template") {
      const templates = current.anchor.candidates.templates
      const index = templates.findIndex(({ name }) => name === current.draft.template_name)
      const next = templates[(index + 1) % templates.length]
      if (next) props.coordinator.edit({ kind: "template", name: next.name })
    } else if (selected.kind === "source") {
      const repositories = current.anchor.candidates.source_repositories
      const index = repositories.findIndex(({ repository_id }) => repository_id === current.draft.matched_source_repository_id)
      const next = repositories[(index + 1) % repositories.length]
      if (next) props.coordinator.edit({ kind: "matched_source_repository", repositoryId: next.repository_id })
    } else if (selected.kind === "included") {
      const repository = current.draft.repositories.find(({ repository_id }) => repository_id === selected.repositoryId)
      if (repository) props.coordinator.edit({ kind: "repository_included", repositoryId: repository.repository_id, included: !repository.included })
    }
    refresh()
  }

  const commitEdit = () => {
    const current = state()
    if (current.phase !== "review") return
    const selected = selectedRow(current)
    if (selected.kind === "workspace") props.coordinator.edit({ kind: "workspace_name", value: editValue() })
    if (selected.kind === "branch") {
      props.coordinator.edit({ kind: "repository_branch", repositoryId: selected.repositoryId, workspaceBranch: editValue() })
    }
    setEditing(false)
    refresh()
  }

  useKeyboard((key) => {
    if (tooSmall()) {
      if (key.name === "escape") props.onBack()
      return
    }
    const current = state()
    if (current.phase === "resolve") {
      if (key.name === "escape") { props.onBack(); return }
      if (key.name === "return" && !current.resolving) {
        props.coordinator.setUrl(url())
        void props.coordinator.enter().finally(refresh)
      }
      return
    }
    if (current.phase === "accepted") return
    if (editing()) {
      if (key.name === "escape") { setEditing(false); return }
      if (key.name === "return") commitEdit()
      return
    }
    if (key.name === "escape") { props.onBack(); return }
    if (key.name === "up" || key.name === "down") {
      const rows = reviewRows(current)
      const index = selectedIndex(current)
      const next = key.name === "up" ? Math.max(0, index - 1) : Math.min(rows.length - 1, index + 1)
      setSelectedKey(rows[next]!.key)
      return
    }
    if (key.name === "return") { editSelected(); return }
    if (key.name === "b") {
      props.coordinator.setUrl(current.url)
      setUrl(current.url)
      setSelectedKey("workspace")
      refresh()
      return
    }
    if (key.name === "c" && current.phase === "review" && current.validation.valid && !creating()) {
      setCreating(true)
      void props.coordinator.create().then((result) => {
        const accepted = result as { status?: string; operationId?: string }
        const next = props.coordinator.state()
        if (accepted.status === "accepted" && accepted.operationId && next.phase === "accepted") {
          props.onAccepted(accepted.operationId, next.draft.workspace_name)
        }
      }).catch(() => {}).finally(() => { setCreating(false); refresh() })
    }
  })

  return (
    <CenteredDialog
      title={tooSmall() ? "Workspace review" : state().phase === "resolve" ? "Resolve forge URL" : "Review workspace"}
      size={state().phase === "resolve" ? "medium" : "large"}
      height={tooSmall() ? dimensions().height - 2 : state().phase === "resolve" ? 12 : Math.min(stacked() ? 36 : 26, dimensions().height - 2)}
    >
      <Switch>
        <Match when={tooSmall()}>
          <>
            <text fg="yellow">Terminal is too small for workspace review. Resize to at least 40 × 12.</text>
            <text fg="gray">[Esc] Back</text>
          </>
        </Match>
        <Match when={!tooSmall() && state().phase === "resolve" ? state() as Extract<ForgeReviewState, { phase: "resolve" }> : undefined}>
          {(current) => <>
            <text fg="cyan">  1 Resolve URL  ·  2 Review workspace</text>
            <text fg="white">  Pull request or merge request URL</text>
            <input focused={resolveInputFocused()} value={url()} onInput={(value) => {
              const next = typeof value === "string" ? value : ""
              setUrl(next)
              props.coordinator.setUrl(next)
              refresh()
            }} />
            <text fg="gray">  Paste a full GitHub pull request or GitLab merge request URL.</text>
            {current().failure ? <text fg="red">  {current().failure?.message}</text> : null}
            <text fg="gray">  {current().resolving ? "Resolving change source…" : "[Enter] Resolve URL"}  [Esc] Back</text>
          </>}
        </Match>
        <Match when={!tooSmall() && state().phase !== "resolve" ? state() as ReviewState : undefined}>
          {(current) => {
            const source = () => current().anchor.source
            const terminology = () => current().anchor.terminology
            const rows = () => reviewRows(current())
            const selected = (key: ReviewRow["key"]) => selectedRow(current()).key === key
            const repositoryName = (repositoryId: string) => {
              const template = current().anchor.candidates.templates.find(({ name }) => name === current().draft.template_name)
              return template?.repositories.find(({ repository_id }) => repository_id === repositoryId)?.name ?? repositoryId
            }
            const validation = () => Object.values(current().validation.fields)[0]
            const failure = () => {
              const value = current()
              return value.phase === "review" ? value.failure : undefined
            }
            const field = (label: string, value: string, selectedField = false) => stacked() ? (
              <box flexDirection="column">
                <text fg={selectedField ? "cyan" : "white"}>  {selectedField ? ">" : " "} {label}</text>
                <text fg={selectedField ? "cyan" : "gray"}>      {value}</text>
              </box>
            ) : <text fg={selectedField ? "cyan" : "white"}>  {selectedField ? ">" : " "} {label}: {value}</text>
            return <>
              <text fg="cyan">  ✓ 1 Resolve URL  ·  2 Review workspace</text>
              <scrollbox flexGrow={1} scrollY scrollX={false} viewportCulling>
                <text fg="white">  {terminology().change} source</text>
                {field("Provider", terminology().provider)}
                {field("Repository", compact(source().target_repository, dimensions().width))}
                {field(terminology().source_branch, compact(source().source_branch, dimensions().width))}
                {field(terminology().target_branch, compact(source().target_branch, dimensions().width))}
                {field("Source repository", compact(source().source_repository, dimensions().width))}
                <text>{""}</text>
                {field("Workspace name", current().draft.workspace_name, selected("workspace"))}
                {editing() && selected("workspace") ? <input focused value={editValue()} onInput={(value) => setEditValue(typeof value === "string" ? value : "")} /> : null}
                {field("Template", current().draft.template_name, selected("template"))}
                {field("Matched source repository", current().draft.matched_source_repository_id, selected("source"))}
                <For each={rows().filter((row) => row.kind === "included" || row.kind === "branch")}>
                  {(row) => {
                    const repository = () => row.kind === "included" || row.kind === "branch"
                      ? current().draft.repositories.find(({ repository_id }) => repository_id === row.repositoryId)
                      : undefined
                    return row.kind === "included"
                      ? field(`Include ${repositoryName(row.repositoryId)}`, repository()?.included ? "included" : "excluded", selected(row.key))
                      : <>
                          {field(`Branch mapping · ${repositoryName(row.repositoryId)}`, `${repository()?.branch.base_branch ?? ""} ← ${repository()?.branch.workspace_branch ?? ""}`, selected(row.key))}
                          {editing() && selected(row.key) ? <input focused value={editValue()} onInput={(value) => setEditValue(typeof value === "string" ? value : "")} /> : null}
                        </>
                  }}
                </For>
              </scrollbox>
              {failure() ? <text fg="red">  {failure()?.message}</text> : validation() ? <text fg="red">  {validation()}</text> : null}
              <text fg="gray">  [Enter] Edit/select  {creating() ? "Creating workspace…" : current().validation.valid ? "[c] Create workspace" : "Create unavailable"}  [b] Change URL  [Esc] Back</text>
            </>
          }}
        </Match>
      </Switch>
    </CenteredDialog>
  )
}
