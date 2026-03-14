import * as p from "@clack/prompts"

// @clack/prompts p.text returns undefined (not "") when the user presses Enter
// on an empty field, regardless of initialValue. This wrapper normalises it.
export async function safeText(opts: Parameters<typeof p.text>[0]): Promise<string | symbol> {
  const raw = await p.text(opts)
  if (typeof raw === "symbol") return raw
  return (raw as string | undefined) ?? ""
}
