import { afterEach, beforeEach, describe, expect, test } from "@test/api"
import { existsSync, symlinkSync } from "fs"
import { join } from "path"
import { cleanup, makeTmpDir, mkdir, write } from "../helpers"
import { getWorkspaceFileStatusView } from "../../packages/core/src/workspace-file-status"
import type { Workspace } from "../../packages/core/src/config"

describe("workspace file status view", () => {
  let tmp: string

  beforeEach(() => {
    tmp = makeTmpDir("workspace-file-status")
  })

  afterEach(() => cleanup(tmp))

  function workspaceFor(wsRoot: string, repoTask = join(wsRoot, "api")): Workspace {
    return {
      name: "status-ws",
      branch: "feat/status",
      created: "2026-05-17",
      repos: [
        {
          name: "api",
          repo: "api",
          type: "typescript",
          mode: "worktree",
          main_path: join(tmp, "main-api"),
          task_path: repoTask,
          files: {
            copy: ["repo-copy.txt"],
            symlink: ["repo-link"],
            sync: [{ source: "repo-source", target: "repo-target" }],
          },
        },
        {
          name: "docs",
          repo: "docs",
          type: "other",
          mode: "dir",
          main_path: join(tmp, "docs"),
          files: {},
        },
      ],
      files: {
        copy: ["copy-present.txt", "copy-missing.txt"],
        symlink: ["link-present", "link-missing"],
        sync: [
          { source: "source", target: "target" },
          { source: "missing-source", target: "missing-target" },
          { source: "source", target: "../escape" },
        ],
      },
    } as Workspace
  }

  test("groups workspace and repo entries with section summaries", () => {
    const wsRoot = join(tmp, "ws")
    const repoMain = join(tmp, "main-api")
    const repoTask = join(wsRoot, "api")
    mkdir(tmp, "ws", "api")
    mkdir(tmp, "main-api")
    mkdir(tmp, "docs")
    write(wsRoot, "copy-present.txt", "copy\n")
    symlinkSync(join(wsRoot, "copy-present.txt"), join(wsRoot, "link-present"))
    write(wsRoot, "source/equal.txt", "same\n")
    write(wsRoot, "target/equal.txt", "same\n")
    write(wsRoot, "source/source-only.txt", "source\n")
    write(repoTask, "repo-copy.txt", "copy\n")
    symlinkSync(join(repoTask, "repo-copy.txt"), join(repoTask, "repo-link"))
    write(repoMain, "repo-source/source-only.txt", "repo\n")

    const view = getWorkspaceFileStatusView(workspaceFor(wsRoot, repoTask), wsRoot, { verbose: true })

    expect(view.workspace.name).toBe("status-ws")
    expect(view.workspace.entries.map((entry) => entry.target)).toEqual([
      "copy-present.txt",
      "copy-missing.txt",
      "link-present",
      "link-missing",
      "target",
      "missing-target",
      "../escape",
    ])
    expect(view.repos.map((repo) => [repo.name, repo.mode])).toEqual([
      ["api", "worktree"],
      ["docs", "dir"],
    ])
    expect(view.repos[0].root).toBe(repoTask)
    expect(view.workspace.summary.total).toBe(7)
    expect(view.repos[0].summary.total).toBe(3)
    expect(view.summary.sections).toBe(3)
    expect(view.summary.total).toBe(10)
  })

  test("preserves file states while adding severity and attention", () => {
    const wsRoot = join(tmp, "ws")
    mkdir(tmp, "ws")
    write(wsRoot, "copy-present.txt", "copy\n")
    symlinkSync(join(wsRoot, "copy-present.txt"), join(wsRoot, "link-present"))
    write(wsRoot, "source/equal.txt", "same\n")
    write(wsRoot, "target/equal.txt", "same\n")
    write(wsRoot, "source/source-only.txt", "source\n")
    write(wsRoot, "target/target-only.txt", "target\n")
    write(wsRoot, "source/differing.txt", "source\n")
    write(wsRoot, "target/differing.txt", "target\n")

    const view = getWorkspaceFileStatusView(workspaceFor(wsRoot), wsRoot, { verbose: true })
    const byTarget = new Map(view.workspace.entries.map((entry) => [entry.target, entry]))

    expect(byTarget.get("copy-present.txt")).toMatchObject({
      type: "copy",
      state: "materialized",
      severity: "ok",
      needsAttention: false,
    })
    expect(byTarget.get("copy-missing.txt")).toMatchObject({
      type: "copy",
      state: "missing",
      severity: "warning",
      needsAttention: true,
    })
    expect(byTarget.get("target")).toMatchObject({
      type: "sync",
      state: "diverged",
      severity: "error",
      needsAttention: true,
    })
    expect(view.workspace.summary.byState).toMatchObject({
      materialized: 2,
      missing: 2,
      diverged: 1,
      ok: 1,
      error: 1,
    })
    expect(view.workspace.summary.warnings).toBeGreaterThan(0)
    expect(view.workspace.summary.errors).toBeGreaterThan(0)
  })

  test("surfaces missing roots, missing sources, invalid targets, and drift details", () => {
    const wsRoot = join(tmp, "ws")
    mkdir(tmp, "ws")
    write(wsRoot, "source/source-only.txt", "source\n")

    const view = getWorkspaceFileStatusView(workspaceFor(wsRoot, join(wsRoot, "deleted-api")), wsRoot, { verbose: true })

    const missingSource = view.workspace.entries.find((entry) => entry.target === "missing-target")
    expect(missingSource?.details.warnings.join("\n")).toContain("Sync source not found")
    expect(missingSource).toMatchObject({ severity: "warning", needsAttention: true })
    const invalidTarget = view.workspace.entries.find((entry) => entry.target === "../escape")
    expect(invalidTarget).toMatchObject({ state: "error", severity: "error" })
    expect(invalidTarget?.details.errors.join("\n")).toContain("traversal")
    const drifted = view.workspace.entries.find((entry) => entry.target === "target")
    expect(drifted?.details.sync?.sourceOnly?.paths).toContain("source-only.txt")
    const repoSection = view.repos.find((repo) => repo.name === "api")
    expect(repoSection?.warnings.join("\n")).toContain("Repo root not found")
    expect(repoSection?.summary.warnings).toBeGreaterThan(0)
    expect(existsSync(join(wsRoot, "deleted-api"))).toBe(false)
  })
})
