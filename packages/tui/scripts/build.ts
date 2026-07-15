import solidPlugin from "@opentui/solid/bun-plugin"

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "bun",
  external: ["@git-stacks/*", "@opentui/*", "solid-js"],
  plugins: [solidPlugin],
  sourcemap: "external",
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
