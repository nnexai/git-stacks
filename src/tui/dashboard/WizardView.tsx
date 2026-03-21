/** @jsxImportSource @opentui/solid */
import { createSignal, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { InlineInput } from "./InlineInput"

export type WizardStep<T> =
  | { kind: "text"; label: string; key: keyof T & string; prefill?: (data: Partial<T>) => string; validate?: (v: string) => string | undefined }
  | { kind: "confirm"; buildMessage: (data: Partial<T>) => string }

type Props<T extends Record<string, unknown>> = {
  steps: WizardStep<T>[]
  onComplete: (data: T) => void
  onCancel: () => void
}

export function WizardView<T extends Record<string, unknown>>(props: Props<T>) {
  const [stepIndex, setStepIndex] = createSignal(0)
  const [data, setData] = createSignal<Partial<T>>({} as Partial<T>)
  const [validationError, setValidationError] = createSignal<string | undefined>(undefined)
  const [inputFocused, setInputFocused] = createSignal(false)

  // Defer initial focus so mount keypress doesn't leak into input
  setTimeout(() => setInputFocused(true), 0)

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
    setData(prev => ({ ...prev, [key]: value } as Partial<T>))

    const nextIndex = stepIndex() + 1
    if (nextIndex < props.steps.length) {
      setStepIndex(nextIndex)
      // Deferred focus: prevent the Enter keypress from leaking into the next input
      setInputFocused(false)
      setTimeout(() => setInputFocused(true), 0)
    } else {
      props.onComplete(data() as T)
    }
  }

  function handleTextCancel() {
    setValidationError(undefined)
    if (stepIndex() > 0) {
      setStepIndex(prev => prev - 1)
      // Deferred focus for back-navigation
      setInputFocused(false)
      setTimeout(() => setInputFocused(true), 0)
    } else {
      props.onCancel()
    }
  }

  // Keyboard handler for confirm step
  useKeyboard((key) => {
    const step = props.steps[stepIndex()]
    if (!step || step.kind !== "confirm") return

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
  })

  return (
    <box flexDirection="column" paddingTop={1} paddingLeft={2}>
      {(() => {
        const step = props.steps[stepIndex()]
        if (!step) return null

        if (step.kind === "text") {
          const prefillValue = step.prefill ? step.prefill(data()) : ""
          return (
            <>
              <InlineInput
                label={step.label}
                prefill={prefillValue}
                onConfirm={handleTextConfirm}
                onCancel={handleTextCancel}
                focused={inputFocused()}
              />
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
  )
}
