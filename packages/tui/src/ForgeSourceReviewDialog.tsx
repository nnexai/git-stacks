/** @jsxImportSource @opentui/solid */

import { For, Match, Switch, createSignal } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import type { ForgeReviewCoordinator, ForgeReviewState } from "@git-stacks/client"

import { CenteredDialog } from "./CenteredDialog"

type Props = {
  coordinator: ForgeReviewCoordinator
  initialUrl?: string
  onAccepted: (operationId: string, workspaceName: string) => void
  onBack: () => void
}

type ReviewRow = "workspace" | "template" | "source" | "included" | "branch"
type ReviewState = Exclude<ForgeReviewState, { phase: "resolve" }>
const reviewRows: ReviewRow[] = ["workspace", "template", "source", "included", "branch"]

function compact(value: string, width: number): string {
  if (width >= 56 || value.length <= 24) return value
  return `${value.slice(0, 21)}…`
}

export function ForgeSourceReviewDialog(props: Props) {
  const dimensions = useTerminalDimensions()
  const initialState = props.coordinator.state()
  const [url, setUrl] = createSignal(props.initialUrl ?? initialState.url)
  const [revision, setRevision] = createSignal(0)
  const [cursor, setCursor] = createSignal(0)
  const [editing, setEditing] = createSignal(false)
  const [editValue, setEditValue] = createSignal("")
  const [creating, setCreating] = createSignal(false)
  if (props.initialUrl && initialState.phase === "resolve" && initialState.url !== props.initialUrl) props.coordinator.setUrl(props.initialUrl)

  const state = (): ForgeReviewState => { void revision(); return props.coordinator.state() }
  const refresh = () => setRevision((value) => value + 1)
  const tooSmall = () => dimensions().width < 40 || dimensions().height < 12

  const editSelected = () => {
    const current = state()
    if (current.phase !== "review") return
    const selected = reviewRows[cursor()]
    if (selected === "workspace") {
      setEditValue(current.draft.workspace_name)
      setEditing(true)
      return
    }
    if (selected === "branch") {
      const repository = current.draft.repositories.find(({ repository_id }) => repository_id === current.draft.matched_source_repository_id)
      setEditValue(repository?.branch.workspace_branch ?? "")
      setEditing(true)
      return
    }
    if (selected === "template") {
      const templates = current.anchor.candidates.templates
      const index = templates.findIndex(({ name }) => name === current.draft.template_name)
      const next = templates[(index + 1) % templates.length]
      if (next) props.coordinator.edit({ kind: "template", name: next.name })
    } else if (selected === "source") {
      const repositories = current.anchor.candidates.source_repositories
      const index = repositories.findIndex(({ repository_id }) => repository_id === current.draft.matched_source_repository_id)
      const next = repositories[(index + 1) % repositories.length]
      if (next) props.coordinator.edit({ kind: "matched_source_repository", repositoryId: next.repository_id })
    } else if (selected === "included") {
      const repository = current.draft.repositories.find(({ repository_id }) => repository_id === current.draft.matched_source_repository_id)
      if (repository) props.coordinator.edit({ kind: "repository_included", repositoryId: repository.repository_id, included: !repository.included })
    }
    refresh()
  }

  const commitEdit = () => {
    const current = state()
    if (current.phase !== "review") return
    const selected = reviewRows[cursor()]
    if (selected === "workspace") props.coordinator.edit({ kind: "workspace_name", value: editValue() })
    if (selected === "branch") {
      const repository = current.draft.repositories.find(({ repository_id }) => repository_id === current.draft.matched_source_repository_id)
      if (repository) props.coordinator.edit({ kind: "repository_branch", repositoryId: repository.repository_id, workspaceBranch: editValue() })
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
    if (key.name === "up") { setCursor((value) => Math.max(0, value - 1)); return }
    if (key.name === "down") { setCursor((value) => Math.min(reviewRows.length - 1, value + 1)); return }
    if (key.name === "return") { editSelected(); return }
    if (key.name === "b") {
      props.coordinator.setUrl(current.url)
      setUrl(current.url)
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
      height={tooSmall() ? dimensions().height - 2 : state().phase === "resolve" ? 12 : Math.min(24, dimensions().height - 2)}
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
            <input focused value={url()} onInput={(value) => {
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
            const matched = () => current().draft.repositories.find(({ repository_id }) => repository_id === current().draft.matched_source_repository_id)
            const row = (name: ReviewRow) => reviewRows.indexOf(name) === cursor() ? ">" : " "
            const validation = () => Object.values(current().validation.fields)[0]
            const failure = () => {
              const value = current()
              return value.phase === "review" ? value.failure : undefined
            }
            return <>
            <text fg="cyan">  ✓ 1 Resolve URL  ·  2 Review workspace</text>
            <scrollbox flexGrow={1} scrollY scrollX={false} viewportCulling>
              <text fg="white">  {terminology().change} source</text>
              <text fg="gray">    Provider: {terminology().provider}</text>
              <text fg="gray">    Repository: {compact(source().target_repository, dimensions().width)}</text>
              <text fg="gray">    {terminology().source_branch}: {compact(source().source_branch, dimensions().width)}</text>
              <text fg="gray">    {terminology().target_branch}: {compact(source().target_branch, dimensions().width)}</text>
              <text fg="gray">    Source repository: {compact(source().source_repository, dimensions().width)}</text>
              <text>{""}</text>
              <text fg={cursor() === 0 ? "cyan" : "white"}>  {row("workspace")} Workspace name: {current().draft.workspace_name}</text>
              {editing() && cursor() === 0 ? <input focused value={editValue()} onInput={(value) => setEditValue(typeof value === "string" ? value : "")} /> : null}
              <text fg={cursor() === 1 ? "cyan" : "white"}>  {row("template")} Template: {current().draft.template_name}</text>
              <text fg={cursor() === 2 ? "cyan" : "white"}>  {row("source")} Matched source repository: {current().draft.matched_source_repository_id}</text>
              <text fg={cursor() === 3 ? "cyan" : "white"}>  {row("included")} Included repositories: {current().draft.repositories.filter(({ included }) => included).length}/{current().draft.repositories.length}</text>
              <For each={current().draft.repositories}>
                {(repository) => <text fg="gray">      {repository.repository_id} · {repository.included ? "included" : "excluded"}</text>}
              </For>
              <text fg={cursor() === 4 ? "cyan" : "white"}>  {row("branch")} Branch mapping: {matched()?.branch.base_branch} ← {matched()?.branch.workspace_branch}</text>
              {editing() && cursor() === 4 ? <input focused value={editValue()} onInput={(value) => setEditValue(typeof value === "string" ? value : "")} /> : null}
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
