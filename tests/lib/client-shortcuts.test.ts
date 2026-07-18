import { describe, expect, test } from "vitest"

import {
  WEB_SCOPED_SHORTCUT_ACTION_METADATA,
  WEB_SHORTCUT_ACTION_METADATA,
  bindingKey,
  defaultShortcutSettings,
  findShortcutConflict,
  formatShortcutBinding,
  matchScopedShortcutEvent,
  matchShortcutEvent,
  validateShortcutSettings,
  type ShortcutKeyEvent,
} from "@git-stacks/client"
import type { WebShortcutBinding, WebShortcutPlatform, WebShortcutSettings } from "@git-stacks/protocol"

const event = (code: string, overrides: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent => ({
  type: "keydown",
  code,
  key: code.slice(3).toLowerCase(),
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...overrides,
})

const binding = (code: string, overrides: Partial<WebShortcutBinding> = {}): WebShortcutBinding => ({
  code,
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
  ...overrides,
})

const primaryCodes = ["KeyK", "KeyP", "KeyN", "KeyT", "KeyW", "KeyJ", "KeyL", "KeyA", "KeyS"]

describe("client shortcut semantics", () => {
  test.each([
    ["macos", { ctrl: true, alt: false, shift: false, meta: true }],
    ["linux", { ctrl: true, alt: true, shift: true, meta: false }],
  ] as const)("builds the exact safe %s defaults", (platform, modifiers) => {
    const settings = defaultShortcutSettings(platform)

    expect(settings.platform).toBe(platform)
    expect(settings.bindings.map(({ action_id }) => action_id)).toEqual(WEB_SHORTCUT_ACTION_METADATA.map(({ actionId }) => actionId))
    expect(settings.bindings.map(({ primary }) => primary?.code)).toEqual(primaryCodes)
    expect(settings.bindings.every(({ primary }) => primary && Object.entries(modifiers).every(([key, value]) => primary[key as keyof typeof modifiers] === value))).toBe(true)
    expect(settings.bindings.every(({ aliases }) => aliases.length === 0)).toBe(true)
  })

  test.each(["macos", "linux"] as WebShortcutPlatform[])("matches %s by logical key with exact modifiers", (platform) => {
    const settings = defaultShortcutSettings(platform)
    const modifiers = platform === "macos"
      ? { ctrlKey: true, metaKey: true }
      : { ctrlKey: true, altKey: true, shiftKey: true }

    expect(matchShortcutEvent(event("KeyK", { ...modifiers, key: "k" }), settings)).toMatchObject({
      handled: true,
      actionId: "workspace.switch",
      source: "primary",
    })
    // Colemak-DH produces the logical N from the physical key normally named K.
    expect(matchShortcutEvent(event("KeyK", { ...modifiers, key: "n" }), settings)).toMatchObject({
      handled: true,
      actionId: "workspace.new",
    })
    expect(matchShortcutEvent(event("KeyK", { ...modifiers, key: "k", ...(platform === "macos" ? { altKey: true } : { metaKey: true }) }), settings)).toEqual({ handled: false, reason: "unmatched" })
  })

  test("matches persisted Key bindings by logical event key", () => {
    const persisted = { bindings: [{
      action_id: "workspace.switch" as const,
      primary: binding("KeyR", { ctrl: true }),
      aliases: [],
    }] }
    // Colemak-DH produces logical R from a different physical key, but stored bindings remain KeyR.
    expect(matchShortcutEvent(event("KeyP", { key: "r", ctrlKey: true }), persisted)).toMatchObject({
      handled: true,
      actionId: "workspace.switch",
      binding: { code: "KeyR", ctrl: true },
    })
  })

  test("rejects non-keydown, composition, AltGraph, malformed, unsafe, and unmatched input", () => {
    const defaults = defaultShortcutSettings("linux")
    const safe = { ctrlKey: true, altKey: true, shiftKey: true }
    const rejected: Array<[ShortcutKeyEvent, string]> = [
      [event("KeyK", { ...safe, type: "keyup" }), "not-keydown"],
      [event("KeyK", { ...safe, isComposing: true }), "composing"],
      [event("KeyK", { ...safe, key: "Process" }), "composing"],
      [event("KeyK", { ...safe, key: "Dead" }), "composing"],
      [event("KeyK", { ...safe, getModifierState: (name) => name === "AltGraph" }), "alt-graph"],
      [event("Digit1", { ...safe }), "invalid-code"],
      [event("KeyZ", safe), "unmatched"],
    ]

    for (const [input, reason] of rejected) expect(matchShortcutEvent(input, defaults)).toEqual({ handled: false, reason })

    const unsafe: WebShortcutSettings = {
      ...defaults,
      bindings: defaults.bindings.map((entry, index) => index === 0
        ? { ...entry, primary: binding("KeyK") }
        : entry),
    }
    expect(matchShortcutEvent(event("KeyK"), unsafe)).toEqual({ handled: false, reason: "unsafe-binding" })
  })

  test("supports opt-in familiar aliases without shipping them by default", () => {
    const defaults = defaultShortcutSettings("linux")
    const withAliases: WebShortcutSettings = {
      ...defaults,
      bindings: defaults.bindings.map((entry) => {
        if (entry.action_id === "workspace.switch") return { ...entry, aliases: [binding("KeyK", { ctrl: true })] }
        if (entry.action_id === "commands.open") return { ...entry, aliases: [binding("KeyP", { ctrl: true, shift: true })] }
        return entry
      }),
    }

    expect(matchShortcutEvent(event("KeyK", { ctrlKey: true }), defaults)).toEqual({ handled: false, reason: "unmatched" })
    expect(matchShortcutEvent(event("KeyP", { ctrlKey: true, shiftKey: true }), defaults)).toEqual({ handled: false, reason: "unmatched" })
    expect(matchShortcutEvent(event("KeyK", { ctrlKey: true }), withAliases)).toMatchObject({ handled: true, actionId: "workspace.switch", source: "alias" })
    expect(matchShortcutEvent(event("KeyP", { ctrlKey: true, shiftKey: true }), withAliases)).toMatchObject({ handled: true, actionId: "commands.open", source: "alias" })
  })

  test("keeps stale entry global and refresh active-view scoped", () => {
    expect(WEB_SHORTCUT_ACTION_METADATA.find(({ actionId }) => actionId === "workspace.stale")).toMatchObject({
      label: "Open stale workspaces",
      category: "workspace",
      defaultCode: "KeyS",
      tuiKey: "s",
    })
    const scoped = WEB_SCOPED_SHORTCUT_ACTION_METADATA[0]
    expect(scoped).toEqual({
      actionId: "workspace.stale.refresh",
      scope: "stale-view",
      label: "Refresh evidence",
      accessibilityText: "Refresh stale workspace evidence",
      web: { code: "KeyR", label: "R" },
      tui: { key: "r" },
    })

    const refresh = event("KeyR")
    expect(matchScopedShortcutEvent(refresh, "stale-view")).toEqual({
      handled: true,
      actionId: "workspace.stale.refresh",
      metadata: scoped,
    })
    expect(matchScopedShortcutEvent(event("KeyP", { key: "r" }), "stale-view")).toEqual({
      handled: true,
      actionId: "workspace.stale.refresh",
      metadata: scoped,
    })
    expect(matchScopedShortcutEvent(event("KeyR", { key: "p" }), "stale-view")).toEqual({ handled: false, reason: "unmatched" })
    expect(matchScopedShortcutEvent(refresh, undefined)).toEqual({ handled: false, reason: "inactive-scope" })
    for (const guarded of [
      event("KeyR", { repeat: true }),
      event("KeyR", { isComposing: true }),
      event("KeyR", { key: "Process" }),
      event("KeyR", { key: "Dead" }),
      event("KeyR", { getModifierState: (name) => name === "AltGraph" }),
      event("KeyR", { ctrlKey: true }),
    ]) {
      expect(matchScopedShortcutEvent(guarded, "stale-view")).toMatchObject({ handled: false })
    }

    const global = defaultShortcutSettings("linux")
    expect(global.bindings.map(({ action_id }) => action_id)).not.toContain("workspace.stale.refresh")
    expect(matchShortcutEvent(refresh, global)).toEqual({ handled: false, reason: "unmatched" })
  })

  test("reports complete primary and alias ownership for conflicts", () => {
    const defaults = defaultShortcutSettings("linux")
    const candidate = defaults.bindings[0]!.primary!
    expect(findShortcutConflict(defaults.bindings, candidate, "commands.open")).toMatchObject({
      ownerActionId: "workspace.switch",
      ownerLabel: "Switch workspace",
      ownerSource: "primary",
    })

    const ctrlK = binding("KeyK", { ctrl: true })
    const withAlias = defaults.bindings.map((entry) => entry.action_id === "workspace.switch" ? { ...entry, aliases: [ctrlK] } : entry)
    expect(findShortcutConflict(withAlias, ctrlK, "commands.open")).toMatchObject({
      ownerActionId: "workspace.switch",
      ownerLabel: "Switch workspace",
      ownerSource: "alias",
      aliasIndex: 0,
    })

    expect(validateShortcutSettings({ ...defaults, bindings: withAlias })).toEqual({ valid: true })
    const duplicate = defaults.bindings.map((entry) => entry.action_id === "commands.open" ? { ...entry, aliases: [candidate] } : entry)
    expect(validateShortcutSettings({ ...defaults, bindings: duplicate })).toMatchObject({
      valid: false,
      conflict: { ownerActionId: "workspace.switch", conflictingActionId: "commands.open" },
    })
  })

  test("normalizes keys and formats platform-specific labels", () => {
    expect(bindingKey(binding("KeyK", { ctrl: true, alt: true, shift: true }))).toBe("KeyK:1110")
    expect(formatShortcutBinding(binding("KeyK", { ctrl: true, meta: true }), "macos")).toBe("Control+Command+K")
    expect(formatShortcutBinding(binding("KeyP", { ctrl: true, alt: true, shift: true }), "linux")).toBe("Ctrl+Alt+Shift+P")
  })
})
