/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { readFileSync } from "fs"
import { testRender } from "@opentui/solid"
import { CreateProgressView, type CreateRow } from "../../../packages/tui/src/CreateProgressView"

const renderOpts = { kittyKeyboard: true }

describe("CreateProgressView", () => {
  test("renders pending rows with repo name", async () => {
    const rows: CreateRow[] = [{ repo: "repo-a", status: "pending", detail: "" }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <CreateProgressView
          rows={rows}
          done={false}
          summary={{ text: "", color: "green" }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("repo-a")
  })

  test("renders done rows with check mark glyph", async () => {
    const rows: CreateRow[] = [{ repo: "repo-b", status: "done", detail: "worktree created" }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <CreateProgressView
          rows={rows}
          done={true}
          summary={{ text: "1 created. Press any key to continue.", color: "green" }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("✓")
    expect(frame).toContain("repo-b")
  })

  test("shows summary text when done is true", async () => {
    const rows: CreateRow[] = [{ repo: "repo-a", status: "done", detail: "" }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <CreateProgressView
          rows={rows}
          done={true}
          summary={{ text: "2 created. Press any key to continue.", color: "green" }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("2 created. Press any key to continue.")
  })

  test("shows Creating... spinner header when done is false", async () => {
    const rows: CreateRow[] = [{ repo: "repo-a", status: "pending", detail: "" }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <CreateProgressView
          rows={rows}
          done={false}
          summary={{ text: "", color: "green" }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Creating")
  })

  test("does not add Phase 99 rollback file-operation rows", () => {
    const source = readFileSync("packages/tui/src/CreateProgressView.tsx", "utf8")
    expect(source).not.toContain("file-op")
    expect(source).not.toContain("workspace-file-op")
    expect(source).not.toContain("env-file")
    expect(source).not.toContain("rollback")
  })
})
