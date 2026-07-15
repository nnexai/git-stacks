#!/usr/bin/env node
import { installPromptAdapter, type PromptAdapter } from "@git-stacks/core/prompt-capability"
import { prompts } from "./prompts.js"

installPromptAdapter(prompts as unknown as PromptAdapter)
await import("./main.js")
export {}
