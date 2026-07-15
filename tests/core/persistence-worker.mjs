import { readFileSync } from "node:fs"
import { atomicReplaceSync, withMutationLeaseSync } from "../../packages/core/dist/persistence.js"

const [path, iterationsText] = process.argv.slice(2)
const iterations = Number(iterationsText)
for (let index = 0; index < iterations; index += 1) {
  withMutationLeaseSync(path, () => {
    const value = JSON.parse(readFileSync(path, "utf8"))
    atomicReplaceSync(path, `${JSON.stringify({ ...value, count: value.count + 1 })}\n`)
  })
}
