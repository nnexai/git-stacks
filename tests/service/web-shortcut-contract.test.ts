import { describe, expect, test } from "@test/api"
import {
  WEB_SHORTCUT_ACTION_IDS,
  WEB_SHORTCUT_MAX_ALIASES,
  WebShortcutActionIdSchema,
  WebShortcutBindingSchema,
  WebShortcutGetRequestSchema,
  WebShortcutMutationSchema,
  WebShortcutPlatformSchema,
  WebShortcutSettingsSchema,
} from "../../packages/protocol/src/web"
import {
  WEB_SHORTCUT_ACTION_METADATA,
  defaultShortcutSettings,
} from "../../packages/client/src/shortcuts"
import {
  WEB_SHORTCUT_ACTION_IDS as CORE_WEB_SHORTCUT_ACTION_IDS,
  WEB_SHORTCUT_DEFAULTS,
} from "../../packages/core/src/web-shortcuts"

const binding = (code: `Key${string}`, modifiers: Partial<Record<"ctrl" | "alt" | "shift" | "meta", boolean>> = {}) => ({
  code,
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
  ...modifiers,
})

const effectiveBindings = WEB_SHORTCUT_ACTION_IDS.map((actionId, index) => ({
  action_id: actionId,
  primary: binding(`Key${String.fromCharCode(65 + index)}`),
  aliases: [],
}))

describe("web shortcut protocol contract", () => {
  test("freezes the complete action and platform vocabulary", () => {
    expect(WEB_SHORTCUT_ACTION_IDS).toEqual([
      "workspace.switch",
      "commands.open",
      "workspace.new",
      "terminal.new",
      "terminal.close",
      "terminal.previous",
      "terminal.next",
      "attention.next",
    ])
    expect(WEB_SHORTCUT_ACTION_IDS).toHaveLength(8)
    for (const actionId of WEB_SHORTCUT_ACTION_IDS) {
      expect(WebShortcutActionIdSchema.parse(actionId)).toBe(actionId)
    }
    expect(WebShortcutActionIdSchema.safeParse("terminal.rename").success).toBe(false)
    expect(WebShortcutPlatformSchema.parse("macos")).toBe("macos")
    expect(WebShortcutPlatformSchema.parse("linux")).toBe("linux")
    expect(WebShortcutPlatformSchema.safeParse("windows").success).toBe(false)
  })

  test("keeps protocol inventory and core-owned defaults in literal agreement", () => {
    expect(CORE_WEB_SHORTCUT_ACTION_IDS).toEqual(WEB_SHORTCUT_ACTION_IDS)
    expect(WEB_SHORTCUT_ACTION_METADATA.map(({ actionId }) => actionId)).toEqual(WEB_SHORTCUT_ACTION_IDS)
    expect(Object.keys(WEB_SHORTCUT_DEFAULTS.macos)).toEqual(WEB_SHORTCUT_ACTION_IDS)
    expect(Object.keys(WEB_SHORTCUT_DEFAULTS.linux)).toEqual(WEB_SHORTCUT_ACTION_IDS)
    for (const platform of ["macos", "linux"] as const) {
      const client = Object.fromEntries(defaultShortcutSettings(platform).bindings.map((row) => [row.action_id, row.primary]))
      expect(client).toEqual(WEB_SHORTCUT_DEFAULTS[platform])
    }
  })

  test("accepts only normalized physical letter bindings", () => {
    expect(WebShortcutBindingSchema.parse(binding("KeyK", { ctrl: true, meta: true }))).toEqual(binding("KeyK", { ctrl: true, meta: true }))
    for (const invalid of [
      binding("Keya"),
      binding("Digit1"),
      binding("Enter"),
      { ...binding("KeyK"), ctrl: undefined },
      { ...binding("KeyK"), key: "k" },
    ]) expect(WebShortcutBindingSchema.safeParse(invalid).success).toBe(false)
  })

  test("requires a bounded, unique, complete effective inventory", () => {
    const settings = {
      platform: "linux",
      revision: "7",
      bindings: effectiveBindings.map((row, index) => index === 0
        ? { ...row, primary: null, aliases: [binding("KeyY", { ctrl: true })] }
        : row),
    }
    expect(WebShortcutSettingsSchema.parse(settings)).toEqual(settings)

    expect(WebShortcutSettingsSchema.safeParse({ ...settings, bindings: settings.bindings.slice(0, -1) }).success).toBe(false)
    expect(WebShortcutSettingsSchema.safeParse({ ...settings, bindings: [...settings.bindings.slice(0, -1), settings.bindings[0]] }).success).toBe(false)
    expect(WebShortcutSettingsSchema.safeParse({
      ...settings,
      bindings: settings.bindings.map((row, index) => index === 0
        ? { ...row, aliases: Array.from({ length: WEB_SHORTCUT_MAX_ALIASES + 1 }, (_, aliasIndex) => binding(`Key${String.fromCharCode(65 + aliasIndex)}`)) }
        : row),
    }).success).toBe(false)
    expect(WebShortcutSettingsSchema.safeParse({ ...settings, config: { workspace_root: "/secret" } }).success).toBe(false)
    expect(WebShortcutSettingsSchema.safeParse({ ...settings, environment: { TOKEN: "secret" } }).success).toBe(false)
  })

  test("defines a strict platform-scoped get request", () => {
    expect(WebShortcutGetRequestSchema.parse({ platform: "macos" })).toEqual({ platform: "macos" })
    expect(WebShortcutGetRequestSchema.safeParse({ platform: "macos", path: "/tmp/config.yml" }).success).toBe(false)
  })

  test("keeps set-primary, set-aliases, unbind, and reset distinct", () => {
    const common = { platform: "linux", action_id: "commands.open", expected_revision: "9" }
    expect(WebShortcutMutationSchema.parse({ ...common, intent: "set-primary", binding: binding("KeyP", { ctrl: true, alt: true, shift: true }) })).toEqual({
      ...common,
      intent: "set-primary",
      binding: binding("KeyP", { ctrl: true, alt: true, shift: true }),
    })
    expect(WebShortcutMutationSchema.parse({ ...common, intent: "set-aliases", aliases: [binding("KeyP", { ctrl: true, shift: true })] })).toEqual({
      ...common,
      intent: "set-aliases",
      aliases: [binding("KeyP", { ctrl: true, shift: true })],
    })
    expect(WebShortcutMutationSchema.parse({ ...common, intent: "unbind" })).toEqual({ ...common, intent: "unbind" })
    expect(WebShortcutMutationSchema.parse({ ...common, intent: "reset" })).toEqual({ ...common, intent: "reset" })
  })

  test("rejects hybrid, duplicate, oversized, and host-detail mutation bodies", () => {
    const common = { platform: "linux", action_id: "commands.open", expected_revision: "9" }
    const alias = binding("KeyP", { ctrl: true, shift: true })
    for (const invalid of [
      { ...common, intent: "set-primary", binding: alias, aliases: [] },
      { ...common, intent: "set-aliases", aliases: [alias, alias] },
      { ...common, intent: "set-aliases", aliases: Array.from({ length: WEB_SHORTCUT_MAX_ALIASES + 1 }, (_, index) => binding(`Key${String.fromCharCode(65 + index)}`)) },
      { ...common, intent: "unbind", binding: alias },
      { ...common, intent: "reset", aliases: [] },
      { ...common, intent: "set-primary", binding: alias, global_config: { workspace_root: "/secret" } },
      { ...common, intent: "set-primary", binding: alias, command: "rm -rf /" },
      { ...common, intent: "unknown" },
    ]) expect(WebShortcutMutationSchema.safeParse(invalid).success).toBe(false)
  })
})
