import type { Command } from "commander"
import { collectCommandPaths } from "./cli-program"
import { generateBash, generateFish, generateZsh } from "./completion-generator"

export type CompletionShell = "bash" | "zsh" | "fish"

export type ShellCompletionCoverage = {
  shell: CompletionShell
  checkedPaths: string[]
  missingPaths: string[]
}

export type CompletionCoverageReport = {
  ok: boolean
  paths: string[]
  shells: Record<CompletionShell, ShellCompletionCoverage>
}

function uniqSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

function words(path: string): string[] {
  return path.split(/\s+/).filter(Boolean)
}

function wordPattern(word: string): RegExp {
  return new RegExp(`(^|[^A-Za-z0-9_-])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_-]|$)`)
}

function hasWord(output: string, word: string): boolean {
  return wordPattern(word).test(output)
}

function hasAllWords(output: string, path: string): boolean {
  return words(path).every((word) => hasWord(output, word))
}

export function auditBashCompletionCoverage(output: string, paths: readonly string[]): ShellCompletionCoverage {
  const missingPaths = paths.filter((path) => {
    const tokens = words(path)
    if (tokens.length === 0) return false
    if (tokens.length === 1) {
      return !output.includes(`compgen -W`) || !hasWord(output, tokens[0])
    }
    return !output.includes(`${tokens[0]})`) || !hasAllWords(output, path)
  })

  return { shell: "bash", checkedPaths: [...paths], missingPaths }
}

export function auditZshCompletionCoverage(output: string, paths: readonly string[]): ShellCompletionCoverage {
  const missingPaths = paths.filter((path) => {
    const tokens = words(path)
    if (tokens.length === 0) return false
    if (tokens.length === 1) {
      return !output.includes(`'${tokens[0]}:`) && !output.includes(`${tokens[0]})`)
    }
    return !tokens.every((token) => output.includes(`_${token}`) || output.includes(`${token})`) || output.includes(`'${token}:`))
  })

  return { shell: "zsh", checkedPaths: [...paths], missingPaths }
}

export function auditFishCompletionCoverage(output: string, paths: readonly string[]): ShellCompletionCoverage {
  const missingPaths = paths.filter((path) => {
    const tokens = words(path)
    if (tokens.length === 0) return false
    if (tokens.length === 1) {
      return !output.includes(`-a ${tokens[0]}`) && !output.includes(`-a '${tokens[0]}'`)
    }
    const ancestors = tokens.slice(0, -1)
    const leaf = tokens[tokens.length - 1]
    return !ancestors.every((token) => output.includes(`__fish_seen_subcommand_from ${token}`)) ||
      (!output.includes(`-a '${leaf}'`) && !output.includes(`-a ${leaf}`))
  })

  return { shell: "fish", checkedPaths: [...paths], missingPaths }
}

export function auditCompletionCoverage(program: Command): CompletionCoverageReport {
  const paths = uniqSorted(collectCommandPaths(program))
  const bash = auditBashCompletionCoverage(generateBash(program), paths)
  const zsh = auditZshCompletionCoverage(generateZsh(program), paths)
  const fish = auditFishCompletionCoverage(generateFish(program), paths)

  return {
    ok: bash.missingPaths.length === 0 && zsh.missingPaths.length === 0 && fish.missingPaths.length === 0,
    paths,
    shells: { bash, zsh, fish },
  }
}
