import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const clientRoots = ["packages/web/src", "packages/tui/src"]
const disclosureRoots = ["packages/protocol/src/web.ts", "packages/web/src"]
const allowedTuiCoreImports = new Set([
  "@git-stacks/core/config",
  "@git-stacks/core/integrations",
  "@git-stacks/core/integrations/types",
  "@git-stacks/core/labels",
  "@git-stacks/core/workspace-command",
  "@git-stacks/core/workspace-git",
])
const runtimeHandoffFiles = new Set([
  "packages/tui/src/editor-handoff.ts",
  "packages/tui/src/index.ts",
  "packages/tui/src/terminal-handoff.ts",
])
const forbiddenCoreAuthority = /\b(?:writeWorkspace|removeWorkspace|deleteWorkspace|archiveWorkspace|unarchiveWorkspace|writeGlobalConfig|writeTemplate|addWorkspaceNote|clearWorkspaceNotes|applyFileOpsForWorkspace|resolveWorkspaceSource|runGit|execGit)\b/
const importPattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["']([^"']+)["']/g

async function sourceFiles(path) {
  const absolute = join(root, path)
  if (/\.[cm]?[jt]sx?$/.test(path)) return [absolute]
  const files = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const candidate = join(directory, entry.name)
      if (entry.isDirectory()) await visit(candidate)
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(candidate)
    }
  }
  await visit(absolute)
  return files
}

function authorityViolations(file, source) {
  const violations = []
  const isWeb = file.startsWith("packages/web/")
  const isTui = file.startsWith("packages/tui/")

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1]
    if (isWeb && (specifier.startsWith("@git-stacks/core") || specifier.startsWith("@git-stacks/service"))) {
      violations.push("browser client imported trusted machine authority")
    }
    if (isTui && specifier.startsWith("@git-stacks/core") && !allowedTuiCoreImports.has(specifier)) {
      violations.push(`TUI imported non-presentation core authority: ${specifier}`)
    }
    if (isTui && specifier.startsWith("@git-stacks/service") && specifier !== "@git-stacks/service/client") {
      violations.push(`TUI bypassed the trusted service client: ${specifier}`)
    }
    if (isTui && /^(?:node:|bun$|bun:)/.test(specifier) && !runtimeHandoffFiles.has(file)) {
      violations.push(`TUI runtime access escaped an explicit handoff: ${specifier}`)
    }
  }

  if (isTui && forbiddenCoreAuthority.test(source)) {
    violations.push("TUI imported core mutation authority instead of a service capability")
  }
  if (isTui && /\b(?:process\.(?:env|cwd|exit|argv)|Bun\.(?:spawn|file|write))\b/.test(source) && !runtimeHandoffFiles.has(file)) {
    violations.push("TUI runtime authority escaped an explicit handoff")
  }
  if ((isWeb || isTui) && /\b(?:gh\s+pr\s+checkout|glab\s+mr\s+checkout|glab\s+mr\s+view\s+https?:\/\/)/i.test(source)) {
    violations.push("client attempted a provider command")
  }
  if ((isWeb || isTui) && /(?:refs\/(?:pull|merge-requests)\/[^\s"']+(?:\/head)?|git\s+(?:fetch\s+origin|checkout\s+(?:FETCH_HEAD|origin\/)))/i.test(source)) {
    violations.push("client synthesized or fetched a provider source ref")
  }
  return violations
}

function disclosureViolations(file, source) {
  const violations = []
  const forbiddenProperty = /(?:^|[,{;\n]\s*)(main_path|task_path|workspace_root|absolute_path|raw_environment|credentials?|bearer_token|provider_token|access_token|private_key|ssh_auth_sock)\s*[?:]/gm
  for (const match of source.matchAll(forbiddenProperty)) {
    violations.push(`${file} exposes forbidden browser field ${match[1]}`)
  }
  return violations
}

const hostileAuthorityFixtures = [
  ["packages/web/src/hostile.ts", 'import { writeWorkspace } from "@git-stacks/core/config"'],
  ["packages/web/src/hostile.ts", 'import { startService } from "@git-stacks/service"'],
  ["packages/tui/src/hostile.ts", 'import { writeWorkspace } from "@git-stacks/core/config"'],
  ["packages/tui/src/hostile.ts", 'import { removeWorkspace } from "@git-stacks/core/workspace"'],
  ["packages/tui/src/hostile.ts", 'import { applyFileOpsForWorkspace } from "@git-stacks/core/files"'],
  ["packages/tui/src/hostile.ts", 'import { resolveForgeSource } from "@git-stacks/core/workspace-source"'],
  ["packages/tui/src/hostile.ts", 'import { authority } from "@git-stacks/service"'],
  ["packages/tui/src/hostile.ts", 'import { readFileSync } from "node:fs"'],
  ["packages/tui/src/hostile.ts", 'const config = process.env'],
  ["packages/web/src/hostile.ts", 'const command = "gh pr checkout 42"'],
  ["packages/web/src/hostile.ts", 'const command = "glab mr view https://gitlab.example.com/acme/repo/-/merge_requests/42"'],
  ["packages/tui/src/hostile.ts", 'const source = "refs/merge-requests/42/head"'],
  ["packages/web/src/hostile.ts", 'const command = "git fetch origin pull/42/head"'],
]

for (const [file, source] of hostileAuthorityFixtures) {
  test(`rejects hostile client authority fixture: ${source}`, () => {
    assert.notDeepEqual(authorityViolations(file, source), [])
  })
}

test("real browser and TUI sources retain no client-side machine authority", async () => {
  const failures = []
  for (const sourceRoot of clientRoots) {
    for (const file of await sourceFiles(sourceRoot)) {
      const repositoryPath = relative(root, file)
      const source = await readFile(file, "utf8")
      failures.push(...authorityViolations(repositoryPath, source).map((message) => `${repositoryPath}: ${message}`))
    }
  }
  assert.deepEqual(failures, [])
})

for (const property of ["main_path", "task_path", "workspace_root", "absolute_path", "raw_environment", "credentials", "bearer_token", "provider_token", "access_token", "private_key", "ssh_auth_sock"]) {
  test(`rejects hostile browser disclosure fixture: ${property}`, () => {
    assert.notDeepEqual(disclosureViolations("packages/protocol/src/web.ts", `const projection: { ${property}?: string } = {}`), [])
  })
}

test("browser schemas and sources retain a path- and secret-minimising projection", async () => {
  const failures = []
  for (const sourceRoot of disclosureRoots) {
    for (const file of await sourceFiles(sourceRoot)) {
      const repositoryPath = relative(root, file)
      const source = await readFile(file, "utf8")
      failures.push(...disclosureViolations(repositoryPath, source))
    }
  }
  assert.deepEqual(failures, [])
})
