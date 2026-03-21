/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { RepoDetail } from "../../../../src/tui/dashboard/RepoDetail"
import type { Template, Workspace } from "../../../../src/lib/config"
import type { RepoEntry } from "../../../../src/tui/dashboard/hooks/useRepos"

const renderOpts = { kittyKeyboard: true }

const makeWorkspace = (name: string, repoName: string): Workspace => ({
  name,
  schema_version: "1",
  branch: "main",
  created: "2024-01-01T00:00:00.000Z",
  repos: [
    {
      name: repoName,
      repo: repoName,
      type: "typescript",
      mode: "worktree",
      main_path: `/home/user/workspaces/main/${repoName}`,
      task_path: `/home/user/workspaces/tasks/${name}/${repoName}`,
      files: {},
    },
  ],
  files: {},
})

const makeTemplate = (name: string, repoName: string): Template => ({
  name,
  schema_version: "1",
  repos: [{ repo: repoName, mode: "worktree" }],
  files: {},
})

describe("RepoDetail snapshots", () => {
  test("renders fallback when no entry is selected", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <RepoDetail
          entry={undefined}
          allTemplates={[]}
          allWorkspaces={[]}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })

  test("renders entry with template and workspace references", async () => {
    const entry: RepoEntry = {
      name: "api",
      schema_version: "1",
      local_path: "/home/user/repos/api",
      type: "typescript",
      default_branch: "main",
      diskExists: true,
    }
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <RepoDetail
          entry={entry}
          allTemplates={[makeTemplate("fullstack", "api")]}
          allWorkspaces={[makeWorkspace("feature-x", "api")]}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })

  test("renders entry missing from disk with no references", async () => {
    const entry: RepoEntry = {
      name: "legacy",
      schema_version: "1",
      local_path: "/old/legacy",
      type: "other",
      default_branch: "master",
      diskExists: false,
    }
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <RepoDetail
          entry={entry}
          allTemplates={[]}
          allWorkspaces={[]}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatchSnapshot()
  })
})
