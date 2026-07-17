import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { basename, join, relative, resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const importPattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["']([^"']+)["']/g
const staleProductionFiles = [
  "packages/client/src/stale-workspaces.ts",
  "packages/web/src/stale-workspaces.ts",
  "packages/tui/src/StaleWorkspacesView.tsx",
]
const allowedTuiCoreImports = new Set([
  "@git-stacks/core/config",
  "@git-stacks/core/integrations",
  "@git-stacks/core/integrations/types",
  "@git-stacks/core/labels",
  "@git-stacks/core/workspace-command",
  "@git-stacks/core/workspace-git",
])
const tuiRuntimeHandoffs = new Set([
  "packages/tui/src/editor-handoff.ts",
  "packages/tui/src/index.ts",
  "packages/tui/src/run.tsx",
  "packages/tui/src/terminal-handoff.ts",
])
const forbiddenStaleAuthority = /\b(?:classifyStaleWorkspaces|rankStaleWorkspaceCandidates|createStaleWorkspaceEvaluator|lookupForgeChangeStatus|observeRemoteBranchStatus|runGit|execGit|fetchRemote|archiveWorkspace|removeWorkspace|forceRemoveWorkspace|stopTerminal|writeWorkspace|writeWorkspaceYaml|discardWorktree)\b/
const forbiddenProviderOrGitCommand = /(?:\b(?:gh|glab)\s+(?:api|pr|mr)\b|\bgit\s+(?:branch|fetch|for-each-ref|ls-remote|merge-base|rev-parse|status)\b)/i
const forbiddenInference = /(?:\b(?:function|const|let|var)\s+(?:classify|rank|score|infer)[A-Za-z0-9_]*Stale|Date\.now\(\)[\s\S]{0,120}(?:30\s*\*\s*24|2_592_000_000)|\.sort\s*\([\s\S]{0,180}(?:confirmed_reasons|activity_at))/i
const forbiddenMutationCapability = /\b(?:archiveWorkspace|removeWorkspace|forceRemoveWorkspace|unarchiveWorkspace|stopTerminal|closeTerminal|discardWorktree|writeWorkspace|writeWorkspaceYaml|writeFile|rename|unlink|rm|mutateProvider|operationSubmit)\s*[?:,(]/
const forbiddenDisclosureProperty = /(?:^|[,{;\n]\s*)(main_path|task_path|workspace_root|absolute_path|raw_environment|environment|credentials?|bearer|bearer_token|provider_token|access_token|private_key|ssh_auth_sock|argv|stdout|stderr|raw_error|command)\s*[?:]/gm
const forbiddenStaleSchemaProperty = /(?:^|\n)\s*(?:path\s*:\s*z\.|(?:main_path|task_path|workspace_root|absolute_path|raw_environment|environment|env|credentials?|bearer|bearer_token|provider_token|access_token|private_key|ssh_auth_sock|argv|stdout|stderr|raw_error|command|score|confidence|safe_to_delete|safe_to_remove)\s*:)/gm

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

async function optionalSource(path) {
  try {
    return { path, source: await readFile(join(root, path), "utf8") }
  } catch (error) {
    if (error?.code === "ENOENT") return { path, error }
    throw error
  }
}

function imports(source) {
  return [...source.matchAll(importPattern)].map((match) => match[1])
}

function staleAuthorityViolations(file, source) {
  const violations = []
  const isWeb = file.startsWith("packages/web/")
  const isTui = file.startsWith("packages/tui/")
  const isStaleSurface = /(?:stale-workspaces|StaleWorkspaces)/.test(file)
  const isTuiRuntimeHandoff = tuiRuntimeHandoffs.has(file)

  for (const specifier of imports(source)) {
    if (isWeb && (specifier.startsWith("@git-stacks/core") || specifier.startsWith("@git-stacks/service"))) {
      violations.push(`browser imported trusted authority: ${specifier}`)
    }
    if (isWeb && /^(?:node:|bun$|bun:)/.test(specifier)) {
      violations.push(`browser imported runtime builtin: ${specifier}`)
    }
    if (isTui && specifier.startsWith("@git-stacks/core") && !allowedTuiCoreImports.has(specifier)) {
      violations.push(`TUI imported non-presentation core authority: ${specifier}`)
    }
    if (isTui && specifier.startsWith("@git-stacks/service") && specifier !== "@git-stacks/service/client") {
      violations.push(`TUI bypassed trusted service client: ${specifier}`)
    }
    if (isTui && /^(?:node:(?:fs|child_process|process)|bun$|bun:)/.test(specifier) && !isTuiRuntimeHandoff) {
      violations.push(`TUI imported filesystem/process authority: ${specifier}`)
    }
    if (isStaleSurface && /^(?:node:|bun$|bun:|@git-stacks\/core|@git-stacks\/service)/.test(specifier)) {
      violations.push(`stale renderer imported machine authority: ${specifier}`)
    }
  }

  if (isStaleSurface && forbiddenStaleAuthority.test(source)) {
    violations.push("stale renderer invoked policy, probe, or mutation authority")
  } else if ((isWeb || isTui) && /\b(?:classifyStaleWorkspaces|rankStaleWorkspaceCandidates|createStaleWorkspaceEvaluator|lookupForgeChangeStatus|observeRemoteBranchStatus)\b/.test(source)) {
    violations.push("client invoked stale policy or probe authority")
  }
  if (isStaleSurface && forbiddenProviderOrGitCommand.test(source)) {
    violations.push("stale renderer invoked provider or Git command text")
  }
  if (isStaleSurface && forbiddenInference.test(source)) {
    violations.push("stale renderer classified, ranked, scored, or inferred locally")
  }
  if (isWeb && /\b(?:process\.(?:env|cwd|argv)|Bun\.|Deno\.)/.test(source)) {
    violations.push("browser accessed process or runtime globals")
  }
  if (isTui && /\b(?:process\.(?:env|cwd|argv)|Bun\.(?:spawn|file|write))/.test(source) && !isTuiRuntimeHandoff) {
    violations.push("TUI process authority escaped a handoff")
  }
  return violations
}

function disclosureViolations(file, source) {
  const violations = []
  for (const match of source.matchAll(forbiddenDisclosureProperty)) {
    violations.push(`${file} exposes forbidden browser field ${match[1]}`)
  }
  return violations
}

function evaluatorViolations(source) {
  const violations = []
  for (const specifier of imports(source)) {
    if (/(?:workspace-lifecycle|workspace-actions|terminal|operation|config-writer|file-ops)/i.test(specifier)) {
      violations.push(`evaluator imported mutation-capable module: ${specifier}`)
    }
  }
  if (forbiddenMutationCapability.test(source)) violations.push("evaluator dependency shape exposes mutation capability")
  if (/\b(?:writeFile|rename|unlink|rm|spawn|execFile|exec)\s*\(/.test(source)) violations.push("evaluator performs filesystem or process mutation directly")
  return violations
}

function cliStaleViolations(file, source) {
  const violations = []
  if (/\.command\(\s*["']stale(?:\s|["'])/i.test(source)) violations.push(`${file} registers forbidden stale CLI command`)
  if (/commands[\\/]stale\.[cm]?[jt]s$/i.test(file)) violations.push(`${file} adds forbidden stale CLI module`)
  return violations
}

function globalRefreshViolations(file, source) {
  const violations = []
  if (/WEB_SHORTCUT_ACTION_IDS[\s\S]{0,1200}["']workspace\.stale\.refresh["']/.test(source)) {
    violations.push(`${file} placed stale refresh in browser-global action IDs`)
  }
  if (/actionMetadata[\s\S]{0,3000}["']workspace\.stale\.refresh["']/.test(source)) {
    violations.push(`${file} placed stale refresh in browser-global metadata`)
  }
  if (/(?:actionRegistrations|createWebActionRegistry|registerOverlayShortcutAction)[\s\S]{0,1200}["']workspace\.stale\.refresh["']/.test(source)) {
    violations.push(`${file} routed stale refresh through browser-global dispatch`)
  }
  if (/defaultShortcutSettings[\s\S]{0,2000}["']workspace\.stale\.refresh["']/.test(source)) {
    violations.push(`${file} persisted a browser-global stale refresh default`)
  }
  return violations
}

function deterministicClaimViolations(file, source) {
  const violations = []
  const claims = /\b(?:hosted evidence complete|authenticated evidence complete|physical browser verified|screenshot approved|interactive validation complete|human approved|release authorized)\b/gi
  for (const match of source.matchAll(claims)) violations.push(`${file} spoofs nondeterministic evidence: ${match[0]}`)
  return violations
}

const hostileAuthorityFixtures = [
  ["packages/web/src/stale-workspaces.ts", 'import { classifyStaleWorkspaces } from "@git-stacks/service/policy"'],
  ["packages/web/src/stale-workspaces.ts", 'import { readFileSync } from "node:fs"'],
  ["packages/web/src/stale-workspaces.ts", 'import { git } from "@git-stacks/core/git"'],
  ["packages/web/src/stale-workspaces.ts", 'const command = "gh api repos/acme/app/pulls/42"'],
  ["packages/tui/src/StaleWorkspacesView.tsx", 'import { removeWorkspace } from "@git-stacks/core/workspace"'],
  ["packages/tui/src/StaleWorkspacesView.tsx", 'import { spawn } from "node:child_process"'],
  ["packages/tui/src/StaleWorkspacesView.tsx", 'const command = "git ls-remote origin feature"'],
  ["packages/tui/src/StaleWorkspacesView.tsx", 'const rankStaleRows = (rows) => rows.sort((a, b) => b.confirmed_reasons.length - a.confirmed_reasons.length)'],
]

for (const [file, source] of hostileAuthorityFixtures) {
  test(`rejects hostile stale client authority fixture: ${basename(file)} — ${source}`, () => {
    assert.notDeepEqual(staleAuthorityViolations(file, source), [])
  })
}

for (const property of [
  "main_path",
  "task_path",
  "workspace_root",
  "absolute_path",
  "raw_environment",
  "credentials",
  "bearer_token",
  "argv",
  "stdout",
  "stderr",
  "raw_error",
  "command",
]) {
  test(`rejects hostile stale browser disclosure fixture: ${property}`, () => {
    assert.notDeepEqual(disclosureViolations("packages/protocol/src/web.ts", `const row: { ${property}?: string } = {}`), [])
  })
}

for (const source of [
  'const program = new Command().command("stale")',
  'workspace.command("stale --json")',
]) {
  test(`rejects hostile stale CLI fixture: ${source}`, () => {
    assert.notDeepEqual(cliStaleViolations("packages/cli/src/commands/stale.ts", source), [])
  })
}

for (const source of [
  'import { removeWorkspace } from "../workspace-lifecycle"',
  'const dependencies: { archiveWorkspace(): Promise<void> } = value',
  'const options = { writeWorkspaceYaml: async () => {} }',
]) {
  test(`rejects hostile evaluator mutation fixture: ${source}`, () => {
    assert.notDeepEqual(evaluatorViolations(source), [])
  })
}

for (const [file, source] of [
  ["packages/protocol/src/web.ts", 'export const WEB_SHORTCUT_ACTION_IDS = ["workspace.stale.refresh"]'],
  ["packages/client/src/shortcuts.ts", 'const actionMetadata = { "workspace.stale.refresh": { defaultCode: "KeyR" } }'],
  ["packages/web/src/app.ts", 'const actionRegistrations = { "workspace.stale.refresh": callback }'],
]) {
  test(`rejects hostile browser-global stale refresh fixture: ${basename(file)}`, () => {
    assert.notDeepEqual(globalRefreshViolations(file, source), [])
  })
}

for (const claim of [
  "Hosted evidence complete",
  "Authenticated evidence complete",
  "Physical browser verified",
  "Screenshot approved",
  "Interactive validation complete",
  "Human approved",
  "Release authorized",
]) {
  test(`rejects deterministic evidence spoofing: ${claim}`, () => {
    assert.notDeepEqual(deterministicClaimViolations("packages/web/src/stale-workspaces.ts", claim), [])
  })
}

test("real web and TUI sources retain no provider, Git, filesystem, process, local stale-policy, or mutation authority", async () => {
  const failures = []
  for (const sourceRoot of ["packages/web/src", "packages/tui/src"]) {
    for (const absolute of await sourceFiles(sourceRoot)) {
      const file = relative(root, absolute)
      const source = await readFile(absolute, "utf8")
      failures.push(...staleAuthorityViolations(file, source).map((message) => `${file}: ${message}`))
    }
  }
  assert.deepEqual(failures, [])
})

test("stale shared/web/TUI production modules exist and retain browser-safe dependency direction", async () => {
  const missing = []
  const failures = []
  for (const file of staleProductionFiles) {
    const loaded = await optionalSource(file)
    if (loaded.error) {
      missing.push(file)
      continue
    }
    failures.push(...staleAuthorityViolations(file, loaded.source).map((message) => `${file}: ${message}`))
  }
  assert.deepEqual(missing, [], `Phase 127 stale production modules are missing: ${missing.join(", ")}`)
  assert.deepEqual(failures, [])
})

test("stale evaluator dependencies are read-only and expose no archive, remove, terminal, worktree, YAML, provider, or operation mutation", async () => {
  const file = "packages/service/src/policy/stale-workspace-evaluator.ts"
  const loaded = await optionalSource(file)
  assert.equal(loaded.error, undefined, `Phase 127 evaluator module is missing: ${file}`)
  assert.deepEqual(evaluatorViolations(loaded.source), [])
})

test("browser stale schemas exist and expose no path, credential, argv, stdout, stderr, environment, score, or mutation fields", async () => {
  const protocol = await readFile(join(root, "packages/protocol/src/web.ts"), "utf8")
  const start = protocol.indexOf("WebStaleWorkspaceRequestSchema")
  assert.notEqual(start, -1, "Phase 127 protocol must export WebStaleWorkspaceRequestSchema")
  const endCandidates = [
    protocol.indexOf("WebPairingExchangeSchema", start),
    protocol.indexOf("WebSnapshotSchema", start),
  ].filter((index) => index > start)
  const end = endCandidates.length ? Math.min(...endCandidates) : protocol.length
  const staleSchemas = protocol.slice(start, end)
  const forbidden = [...staleSchemas.matchAll(forbiddenStaleSchemaProperty)].map((match) => match[0].trim())
  assert.deepEqual(forbidden, [])
})

test("browser-visible web and stale client source retain no forbidden disclosure property", async () => {
  const failures = []
  const roots = ["packages/web/src", "packages/client/src/stale-workspaces.ts"]
  for (const sourceRoot of roots) {
    let files
    if (sourceRoot.endsWith(".ts")) {
      const loaded = await optionalSource(sourceRoot)
      if (loaded.error) continue
      files = [join(root, sourceRoot)]
    } else {
      files = await sourceFiles(sourceRoot)
    }
    for (const absolute of files) {
      const file = relative(root, absolute)
      const source = await readFile(absolute, "utf8")
      failures.push(...disclosureViolations(file, source))
    }
  }
  assert.deepEqual(failures, [])
})

test("stale refresh exists only in the scoped registry and is absent from browser-global settings and routing", async () => {
  const files = [
    "packages/protocol/src/web.ts",
    "packages/core/src/config.ts",
    "packages/core/src/web-shortcuts.ts",
    "packages/client/src/shortcuts.ts",
    "packages/web/src/app.ts",
    "packages/web/src/navigation.ts",
  ]
  const failures = []
  let scopedDefinition = false
  let activeViewRouting = false
  for (const file of files) {
    const source = await readFile(join(root, file), "utf8")
    failures.push(...globalRefreshViolations(file, source))
    if (/SCOPED[\s\S]{0,1600}["']workspace\.stale\.refresh["']/.test(source)) scopedDefinition = true
    if (file.startsWith("packages/web/") && /workspace\.stale\.refresh[\s\S]{0,800}(?:activeSurface|stale-view|handleScoped)/.test(source)) activeViewRouting = true
  }
  assert.equal(scopedDefinition, true, "Phase 127 must define workspace.stale.refresh in a distinct scoped registry")
  assert.equal(activeViewRouting, true, "Phase 127 web must route refresh only while the stale view owns context")
  assert.deepEqual(failures, [])
})

test("daemonless CLI exposes no git-stacks stale command", async () => {
  const failures = []
  for (const absolute of await sourceFiles("packages/cli/src")) {
    const file = relative(root, absolute)
    const source = await readFile(absolute, "utf8")
    failures.push(...cliStaleViolations(file, source))
  }
  assert.deepEqual(failures, [])
})

test("package manifests preserve browser-safe direction and keep optional TUI authority out of default installation", async () => {
  const rootPackage = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
  const webPackage = JSON.parse(await readFile(join(root, "packages/web/package.json"), "utf8"))
  const clientPackage = JSON.parse(await readFile(join(root, "packages/client/package.json"), "utf8"))
  const defaultDependencies = Object.keys(rootPackage.dependencies ?? {})
  const webDependencies = Object.keys(webPackage.dependencies ?? {})
  const clientDependencies = Object.keys(clientPackage.dependencies ?? {})

  assert.equal(defaultDependencies.includes("@git-stacks/tui"), false)
  assert.equal(defaultDependencies.some((name) => /(?:bun|opentui)/i.test(name)), false)
  assert.equal(webDependencies.some((name) => name === "@git-stacks/core" || name === "@git-stacks/service" || name === "@git-stacks/tui"), false)
  assert.equal(clientDependencies.some((name) => name === "@git-stacks/core" || name === "@git-stacks/service" || name === "@git-stacks/tui"), false)
})

test("real deterministic stale surfaces make no hosted, authenticated, physical, visual, interactive, human, or release-authority claim", async () => {
  const failures = []
  for (const file of staleProductionFiles) {
    const loaded = await optionalSource(file)
    if (loaded.error) continue
    failures.push(...deterministicClaimViolations(file, loaded.source))
  }
  assert.deepEqual(failures, [])
})
