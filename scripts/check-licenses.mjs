import { readFile } from "node:fs/promises"

const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"))
const allowed = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "ISC",
  "MIT",
])

const failures = []
const audited = []
function allowedExpression(expression) {
  const normalized = expression.replace(/[()]/g, "").trim()
  return normalized.split(/\s+OR\s+/).some((choice) => choice.split(/\s+AND\s+/).every((license) => allowed.has(license.trim())))
}
for (const [path, metadata] of Object.entries(lock.packages ?? {})) {
  if (!path || metadata.dev === true || metadata.link === true) continue
  const license = metadata.license
  const name = path.replace(/^.*node_modules\//, "")
  if (typeof license !== "string" || !allowedExpression(license)) {
    failures.push(`${name}@${metadata.version ?? "workspace"}: unsupported or missing license ${String(license)}`)
  } else {
    audited.push(`${name}@${metadata.version ?? "workspace"} (${license})`)
  }
}

if (failures.length > 0) {
  console.error("Production dependency license audit failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"))
  process.exit(1)
}

console.log(`Production dependency licenses: OK (${audited.length} package records)`)
