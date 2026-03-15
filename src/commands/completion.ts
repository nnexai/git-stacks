import { Command } from "commander"
import { generateBash, generateZsh, generateFish } from "../lib/completion-generator"

export function createCompletionCommand(program: Command): Command {
  return new Command("completion")
    .description("Generate shell completion scripts")
    .argument("[shell]", "Shell type: bash, zsh, or fish")
    .action((shell?: string) => {
      if (!shell) {
        console.log("Usage: ws completion [bash|zsh|fish]")
        console.log("\nAdd to your shell profile:")
        console.log('  bash:  eval "$(ws completion bash)"')
        console.log('  zsh:   eval "$(ws completion zsh)"')
        console.log("  fish:  ws completion fish | source")
        return
      }
      switch (shell) {
        case "bash": process.stdout.write(generateBash(program)); break
        case "zsh":  process.stdout.write(generateZsh(program));  break
        case "fish": process.stdout.write(generateFish(program)); break
        default:
          console.error(`Unknown shell '${shell}'. Supported: bash, zsh, fish`)
          process.exit(1)
      }
    })
}
