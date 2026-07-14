import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, extname, join, normalize, relative, resolve } from "node:path"
import ts from "typescript"

const root = resolve(import.meta.dirname, "../../..")
const sourceRoot = join(root, "src")

function filesBelow(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? filesBelow(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

const files = filesBelow(sourceRoot)
const byRelative = new Map(files.map((file) => [relative(root, file), file]))

function resolveRelative(from, specifier) {
  if (!specifier.startsWith(".")) return undefined
  const base = resolve(dirname(from), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (byRelative.has(relative(root, candidate))) return relative(root, candidate)
  }
}

function layer(file) {
  if (file === "src/index.ts" || file.startsWith("src/commands/") || /src\/lib\/(cli-program|completion-|version\.ts)/.test(file)) return "cli"
  if (file.startsWith("src/service/") || file.startsWith("src/lib/service/") && !/\/(contract|presentation|signal-state)\.ts$/.test(file)) return "service"
  if (/src\/lib\/service\/(contract|presentation|signal-state)\.ts$/.test(file)) return "protocol"
  if (file.startsWith("src/web-client/")) return "web"
  if (file.startsWith("src/tui/")) return "tui"
  return "core"
}

const modules = new Map()
for (const [file, absolute] of byRelative) {
  const sourceText = readFileSync(absolute, "utf8")
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, extname(file) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const imports = []
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const specifier = statement.moduleSpecifier.text
    imports.push({ specifier, target: resolveRelative(absolute, specifier), typeOnly: statement.importClause?.isTypeOnly === true })
  }
  modules.set(file, {
    file,
    layer: layer(file),
    directBun: /\bBun\.|from\s+["']bun["']/.test(sourceText),
    imports,
  })
}

const layerEdges = new Map()
for (const module of modules.values()) {
  for (const dependency of module.imports) {
    const targetLayer = dependency.target ? modules.get(dependency.target)?.layer : dependency.specifier === "bun" ? "bun-runtime" : dependency.specifier === "commander" ? "commander" : undefined
    if (!targetLayer || targetLayer === module.layer) continue
    const key = `${module.layer}->${targetLayer}`
    const values = layerEdges.get(key) ?? []
    values.push({ from: module.file, to: dependency.target ?? dependency.specifier, typeOnly: dependency.typeOnly })
    layerEdges.set(key, values)
  }
}

const unsafe = new Set([...modules.values()].filter((module) => module.directBun || module.imports.some((item) => item.specifier === "commander" || item.target?.startsWith("src/tui/"))).map((module) => module.file))
let changed = true
while (changed) {
  changed = false
  for (const module of modules.values()) {
    if (unsafe.has(module.file)) continue
    if (module.imports.some((item) => item.target && unsafe.has(item.target))) {
      unsafe.add(module.file)
      changed = true
    }
  }
}

const lib = [...modules.values()].filter((module) => module.file.startsWith("src/lib/"))
const report = {
  sourceFiles: modules.size,
  libFiles: lib.length,
  directBunFiles: lib.filter((module) => module.directBun).map((module) => module.file),
  transitivelyRuntimeOrUiCoupledLibFiles: lib.filter((module) => unsafe.has(module.file)).map((module) => module.file),
  portableLibFiles: lib.filter((module) => !unsafe.has(module.file)).map((module) => module.file),
  crossLayerEdges: Object.fromEntries([...layerEdges].sort(([left], [right]) => left.localeCompare(right))),
  boundaryViolations: {
    coreToTui: layerEdges.get("core->tui") ?? [],
    coreToCliFramework: layerEdges.get("core->commander") ?? [],
    serviceClientToConcreteService: modules.get("src/lib/service/client.ts")?.imports.filter((edge) => edge.target === "src/service/main.ts") ?? [],
    cliToTui: layerEdges.get("cli->tui") ?? [],
    protocolToCore: layerEdges.get("protocol->core") ?? [],
  },
}

console.log(JSON.stringify(report, null, 2))
