import * as p from "@clack/prompts"

// ─── Prompts wrapper ─────────────────────────────────────────────────────────
// Mutable object re-exporting @clack/prompts functions. Tests can replace
// individual properties (e.g. prompts.confirm = mock(...)) instead of
// using mock.module("@clack/prompts").
export const prompts = {
  text: p.text,
  select: p.select,
  confirm: p.confirm,
  multiselect: p.multiselect,
  spinner: p.spinner,
  intro: p.intro,
  outro: p.outro,
  log: p.log,
  isCancel: p.isCancel,
  cancel: p.cancel,
  note: p.note,
  group: p.group,
  groupMultiselect: p.groupMultiselect,
}

export function cancel(): never {
  p.cancel("Cancelled.")
  process.exit(0)
}

// @clack/prompts p.text returns undefined (not "") when the user presses Enter
// on an empty field, regardless of initialValue. This wrapper normalises it.
//
// fallbackValue replaces the broken initialValue pattern:
//   - sets placeholder (renders synchronously as grey hint) if none provided
//   - sets defaultValue (applied on finalize when field is left empty)
//   - wraps validate so required-checks see the effective value
export async function safeText(
  opts: Parameters<typeof p.text>[0] & { fallbackValue?: string }
): Promise<string | symbol> {
  const { fallbackValue, ...textOpts } = opts

  if (fallbackValue) {
    if (!textOpts.placeholder) textOpts.placeholder = fallbackValue
    textOpts.defaultValue = fallbackValue
    if (textOpts.validate) {
      const orig = textOpts.validate
      textOpts.validate = (v) => orig(v || fallbackValue)
    }
  }

  const raw = await prompts.text(textOpts)
  if (typeof raw === "symbol") return raw
  return (raw as string | undefined) ?? fallbackValue ?? ""
}
