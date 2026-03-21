/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { SyncProgressView } from "../../../src/tui/dashboard/SyncProgressView"

type SyncRow = {
  repo: string
  status: "pending" | "fetching" | "rebasing" | "synced" | "skipped" | "failed"
  detail: string
  conflicts: string[]
}

const renderOpts = { kittyKeyboard: true }

describe("SyncProgressView", () => {
  test("renders pending rows with repo name", async () => {
    const rows: SyncRow[] = [{ repo: "repo-a", status: "pending", detail: "", conflicts: [] }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <SyncProgressView
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

  test("renders synced rows with repo name and detail text", async () => {
    const rows: SyncRow[] = [{ repo: "repo-a", status: "synced", detail: "+3 commits", conflicts: [] }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <SyncProgressView
          rows={rows}
          done={true}
          summary={{ text: "1 synced. Press any key to continue.", color: "green" }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("repo-a")
    expect(frame).toContain("+3 commits")
  })

  test("renders skipped rows with warning glyph and conflict file list", async () => {
    const rows: SyncRow[] = [
      {
        repo: "repo-b",
        status: "skipped",
        detail: "conflict: src/lib/git.ts",
        conflicts: ["src/index.ts"],
      },
    ]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <SyncProgressView
          rows={rows}
          done={true}
          summary={{ text: "0 synced, 1 skipped.", color: "yellow" }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("repo-b")
    expect(frame).toContain("conflict:")
    expect(frame).toContain("src/index.ts")
  })

  test("renders failed rows with failure detail", async () => {
    const rows: SyncRow[] = [
      { repo: "repo-c", status: "failed", detail: "fetch failed (timeout)", conflicts: [] },
    ]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <SyncProgressView
          rows={rows}
          done={true}
          summary={{ text: "0 synced, 0 skipped, 1 failed.", color: "red" }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("repo-c")
    expect(frame).toContain("fetch failed")
  })

  test("shows summary text when done is true", async () => {
    const rows: SyncRow[] = [{ repo: "repo-a", status: "synced", detail: "+1 commits", conflicts: [] }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <SyncProgressView
          rows={rows}
          done={true}
          summary={{ text: "1 synced. Press any key to continue.", color: "green" }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("1 synced. Press any key to continue.")
  })

  test("does not show summary text when done is false", async () => {
    const rows: SyncRow[] = [{ repo: "repo-a", status: "pending", detail: "", conflicts: [] }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <SyncProgressView
          rows={rows}
          done={false}
          summary={{ text: "1 synced. Press any key to continue.", color: "green" }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("Press any key")
  })

  test("shows Syncing... header when done is false", async () => {
    const rows: SyncRow[] = [{ repo: "repo-a", status: "pending", detail: "", conflicts: [] }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <SyncProgressView
          rows={rows}
          done={false}
          summary={{ text: "", color: "green" }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Syncing...")
  })

  test("does not show Syncing... header when done is true", async () => {
    const rows: SyncRow[] = [{ repo: "repo-a", status: "synced", detail: "+1 commits", conflicts: [] }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => (
        <SyncProgressView
          rows={rows}
          done={true}
          summary={{ text: "1 synced. Press any key to continue.", color: "green" }}
        />
      ),
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("Syncing...")
  })
})
