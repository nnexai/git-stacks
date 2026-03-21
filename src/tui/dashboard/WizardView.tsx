/** @jsxImportSource @opentui/solid */
import { createSignal, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { CenteredDialog } from "./CenteredDialog"

export type WizardStep<T> =
  | { kind: "text"; label: string; key: keyof T & string; prefill?: (data: Partial<T>) => string; validate?: (v: string) => string | undefined }
  | { kind: "confirm"; buildMessage: (data: Partial<T>) => string }

type Props<T extends Record<string, unknown>> = {
  steps: WizardStep<T>[]
  onComplete: (data: T) => void
  onCancel: () => void
  title?: string
}

export function WizardView<T extends Record<string, unknown>>(props: Props<T>) {
  const [stepIndex, setStepIndex] = createSignal(0)
  const [data, setData] = createSignal({} as Partial<T>)
  const [validationError, setValidationError] = createSignal<string | undefined>(undefined)
  // Deferred focus pattern: input starts focused; on step transitions, set to false then
  // defer to true via setTimeout(0) to prevent the triggering keypress from leaking
  // into the new step's input (per CLAUDE.md keyboard isolation rules)
  const [inputFocused, setInputFocused] = createSignal(true)

  function handleTextConfirm(value: string) {
    const step = props.steps[stepIndex()]
    if (step.kind !== "text") return

    if (step.validate) {
      const err = step.validate(value)
      if (err) {
        setValidationError(err)
        return
      }
    }

    setValidationError(undefined)
    const key = step.key as keyof T
    const nextData = { ...data(), [key]: value } as Partial<T>
    setData(() => nextData)

    const nextIndex = stepIndex() + 1
    if (nextIndex < props.steps.length) {
      // Deferred focus: prevent Enter keypress from leaking into the next input
      setInputFocused(false)
      setStepIndex(nextIndex)
      setTimeout(() => setInputFocused(true), 0)
    } else {
      props.onComplete(nextData as T)
    }
  }

  function handleTextCancel() {
    setValidationError(undefined)
    if (stepIndex() > 0) {
      // Deferred focus for back-navigation
      setInputFocused(false)
      setStepIndex(prev => prev - 1)
      setTimeout(() => setInputFocused(true), 0)
    } else {
      props.onCancel()
    }
  }

  // Keyboard handler for text and confirm steps
  useKeyboard((key) => {
    const step = props.steps[stepIndex()]
    if (!step) return

    // Text step: handle escape (InlineInput no longer provides this)
    if (step.kind === "text") {
      if (key.name === "escape") {
        handleTextCancel()
        return
      }
      return // Let input handle all other keys
    }

    // Confirm step
    if (step.kind === "confirm") {
      if (key.name === "y") {
        props.onComplete(data() as T)
        return
      }
      if (key.name === "escape") {
        if (stepIndex() > 0) {
          setStepIndex(prev => prev - 1)
        } else {
          props.onCancel()
        }
        return
      }
    }
  })

  return (
    <CenteredDialog title={props.title ?? "Wizard"} size="medium">
      <box flexDirection="column" paddingTop={1} paddingLeft={1}>
        {(() => {
          const step = props.steps[stepIndex()]
          if (!step) return null

          if (step.kind === "text") {
            const prefillValue = step.prefill ? step.prefill(data()) : ""
            return (
              <>
                <box flexDirection="row" paddingLeft={1}>
                  <text fg="cyan">  {step.label}: </text>
                  <input
                    value={prefillValue}
                    focused={inputFocused()}
                    onSubmit={(v) => handleTextConfirm(v as string)}
                  />
                </box>
                <Show when={!!validationError()}>
                  <text fg="red">  {validationError()}</text>
                </Show>
              </>
            )
          }

          if (step.kind === "confirm") {
            return (
              <box flexDirection="column">
                <text fg="yellow">  {step.buildMessage(data())}</text>
                <text fg="gray">{"\n"}  [y] Create  [Esc] Back</text>
              </box>
            )
          }

          return null
        })()}
      </box>
    </CenteredDialog>
  )
}
