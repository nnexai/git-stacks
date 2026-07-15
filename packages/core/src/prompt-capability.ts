export type PromptAdapter = {
  text(options: any): Promise<any>
  select(options: any): Promise<any>
  confirm(options: any): Promise<any>
  multiselect(options: any): Promise<any>
  spinner(options?: any): { start(message?: string): void; stop(message?: string): void; message(message: string): void }
  isCancel(value: unknown): boolean
  log: { info(message: string): void; warn(message: string): void; error(message: string): void; success(message: string): void }
}

function unavailable(name: string): never { throw new Error(`Interactive prompt capability '${name}' is unavailable`) }

export const prompts: PromptAdapter = {
  text: async () => unavailable("text"),
  select: async () => unavailable("select"),
  confirm: async () => unavailable("confirm"),
  multiselect: async () => unavailable("multiselect"),
  spinner: () => unavailable("spinner"),
  isCancel: () => false,
  log: {
    info: () => unavailable("log.info"), warn: () => unavailable("log.warn"),
    error: () => unavailable("log.error"), success: () => unavailable("log.success"),
  },
}

export function installPromptAdapter(adapter: PromptAdapter): void { Object.assign(prompts, adapter) }

export async function safeText(options: Record<string, any> & { fallbackValue?: string }): Promise<string | symbol> {
  const { fallbackValue, ...textOptions } = options
  if (fallbackValue) {
    textOptions.placeholder ??= fallbackValue
    textOptions.defaultValue = fallbackValue
    if (textOptions.validate) {
      const validate = textOptions.validate
      textOptions.validate = (value: string) => validate(value || fallbackValue)
    }
  }
  const raw = await prompts.text(textOptions)
  if (typeof raw === "symbol") return raw
  return raw ?? fallbackValue ?? ""
}
