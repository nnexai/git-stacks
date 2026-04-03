/** @jsxImportSource @opentui/solid */
import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { PushProgressView } from "../../../src/tui/dashboard/PushProgressView"

type PushRow = {
  repo: string
  status: "pending" | "pushing" | "pushed" | "skipped" | "failed"
  detail: string
}

const renderOpts = { kittyKeyboard: true }

describe("PushProgressView", () => {
  test("renders pending rows with repo name", async () => {
    const rows: PushRow[] = [{ repo: "repo-a", status: "pending", detail: "" }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => <PushProgressView rows={rows} done={false} summary={{ text: "", color: "green" }} />,
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("repo-a")
  })

  test("renders pushed rows with detail text", async () => {
    const rows: PushRow[] = [{ repo: "repo-a", status: "pushed", detail: "3 commits" }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => <PushProgressView rows={rows} done={true} summary={{ text: "1 pushed. Press any key to continue.", color: "green" }} />,
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("repo-a")
    expect(frame).toContain("3 commits")
  })

  test("renders skipped rows", async () => {
    const rows: PushRow[] = [{ repo: "repo-b", status: "skipped", detail: "trunk" }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => <PushProgressView rows={rows} done={true} summary={{ text: "1 skipped. Press any key to continue.", color: "yellow" }} />,
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("repo-b")
    expect(frame).toContain("trunk")
  })

  test("renders failed rows", async () => {
    const rows: PushRow[] = [{ repo: "repo-c", status: "failed", detail: "non-fast-forward" }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => <PushProgressView rows={rows} done={true} summary={{ text: "1 failed. Press any key to continue.", color: "red" }} />,
      renderOpts
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("repo-c")
    expect(frame).toContain("non-fast-forward")
  })

  test("shows summary text when done is true", async () => {
    const rows: PushRow[] = [{ repo: "repo-a", status: "pushed", detail: "1 commit" }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => <PushProgressView rows={rows} done={true} summary={{ text: "1 pushed. Press any key to continue.", color: "green" }} />,
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("1 pushed. Press any key to continue.")
  })

  test("does not show summary text when done is false", async () => {
    const rows: PushRow[] = [{ repo: "repo-a", status: "pending", detail: "" }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => <PushProgressView rows={rows} done={false} summary={{ text: "1 pushed. Press any key to continue.", color: "green" }} />,
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).not.toContain("Press any key")
  })

  test("shows Pushing... header when done is false", async () => {
    const rows: PushRow[] = [{ repo: "repo-a", status: "pending", detail: "" }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => <PushProgressView rows={rows} done={false} summary={{ text: "", color: "green" }} />,
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Pushing...")
  })

  test("does not show Pushing... header when done is true", async () => {
    const rows: PushRow[] = [{ repo: "repo-a", status: "pushed", detail: "1 commit" }]
    const { renderOnce, captureCharFrame } = await testRender(
      () => <PushProgressView rows={rows} done={true} summary={{ text: "1 pushed. Press any key to continue.", color: "green" }} />,
      renderOpts
    )
    await renderOnce()
    expect(captureCharFrame()).not.toContain("Pushing...")
  })
})
