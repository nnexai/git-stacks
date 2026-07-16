import { describe, expect, test } from "@test/api"
import { readFileSync } from "node:fs"

const appSource = readFileSync(new URL("../../packages/web/src/app.ts", import.meta.url), "utf8")
const cssSource = readFileSync(new URL("../../packages/web/src/app.css", import.meta.url), "utf8")

describe("web reviewed forge creation", () => {
  test("keeps Resolve URL separate from explicit one-shot Create workspace", () => {
    for (const seam of [
      "createForgeReviewCoordinator",
      "forge.source.resolve",
      "workspace.create.reviewed",
      "Resolve forge URL",
      "GitHub pull request or GitLab merge request URL",
      "Resolving does not create a workspace",
      "Resolve URL",
      "Review workspace",
      "Source resolved",
      "Change URL",
      "Create workspace",
      "coordinator.enter()",
      "coordinator.create()",
    ]) expect(appSource).toContain(seam)
    expect(appSource).toMatch(/addEventListener\("keydown"[\s\S]{0,500}coordinator\.enter\(\)/)
    expect(appSource).not.toMatch(/addEventListener\("keydown"[\s\S]{0,500}coordinator\.create\(\)/)
  })

  test("renders immutable provider identity and every editable reviewed field", () => {
    for (const seam of [
      "state.anchor.source",
      "state.anchor.terminology",
      "workspace_name",
      "template_name",
      "matched_source_repository",
      "repository_included",
      "repository_branch",
      "expectedRevision",
      "operationId",
      "correct the draft",
    ]) expect(appSource).toContain(seam)
    expect(appSource).not.toMatch(/anchor\.(?:token|expectedRevision)\s*=/)
    expect(appSource).not.toMatch(/(?:gh|glab)\s+(?:pr|mr|api)/)
  })

  test("locks wide review layout to viewport-safe desktop 375 and 320 rules", () => {
    for (const seam of [
      ".forge-review",
      ".forge-step",
      ".forge-source-anchor",
      ".forge-review-footer",
      "position: sticky",
      "overflow-wrap: anywhere",
      "max-width: 100%",
      "@media (max-width: 640px)",
      "@media (max-width: 375px)",
      "@media (max-width: 320px)",
    ]) expect(cssSource).toContain(seam)
    expect(cssSource).toMatch(/\.modal[^}]*max-width:\s*100%/)
    expect(cssSource).toMatch(/\.forge-review[^}]*min-width:\s*0/)
  })

  test("renders explicit terminal recovery instead of trapping failed accepted operations", () => {
    for (const seam of ["terminal-error", "Back to review", "Change URL", "Close", "backToReview"]) {
      expect(appSource).toContain(seam)
    }
    const forgeSource = appSource.slice(appSource.indexOf("function showForgeCreation"), appSource.indexOf("async function showCreation"))
    expect(forgeSource).not.toContain("for (let attempt = 0; attempt < 300; attempt += 1)")
  })
})
