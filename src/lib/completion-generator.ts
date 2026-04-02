import { Command } from "commander"
import { integrations } from "./integrations/index"

type DynamicCompletion = "workspace" | "repo" | "template" | "shells" | "integration" | "choices"

// Convention map: argument name → completion type
// Commands whose first arg name matches a key auto-complete without any DYNAMIC_COMPLETIONS entry
const NAME_TO_COMPLETION_TYPE: Record<string, DynamicCompletion> = {
  workspace:   "workspace",
  template:    "template",
  repo:        "repo",
  shell:       "shells",
  integration: "integration",
}

const DYNAMIC_COMPLETIONS: Record<string, DynamicCompletion> = {
  // Override: arg name is [workspace-or-issue], not [workspace] — convention inference misses these
  "integration.github.issue.link":  "workspace",
  "integration.gitlab.issue.link":  "workspace",
  "integration.gitea.issue.link":   "workspace",
  "integration.jira.issue.link":    "workspace",
}

const OPTION_ENUMS: Record<string, string[]> = {
  "--strategy": ["rebase", "merge"],
  "--sort":     ["date", "name", "status"],
}

const FLAG_COMPLETIONS: Record<string, DynamicCompletion> = {
  "--workspace": "workspace",
}

// Per-command flag completions: key format is "commandPath:--flagName"
// Only flags where completion is non-obvious (e.g. --from on new command = template name)
// Do NOT add message.send:--from or message.clear:--from — those sender names are freeform
const COMMAND_FLAG_COMPLETIONS: Record<string, DynamicCompletion> = {
  "new:--from": "template",
}

function resolveFlagCompletion(commandPath: string, flagName: string): DynamicCompletion | undefined {
  return COMMAND_FLAG_COMPLETIONS[`${commandPath}:${flagName}`] ?? FLAG_COMPLETIONS[flagName]
}

interface OptionInfo {
  long: string
  description: string
  enumValues?: string[]
}

interface ArgCompletion {
  name: string
  type: DynamicCompletion
  required: boolean
  choices?: string[]
}

interface CommandNode {
  path: string
  name: string
  description: string
  options: OptionInfo[]
  subcommands: CommandNode[]
  argCompletions: ArgCompletion[]   // replaces: dynamic + firstArgRequired
}

/** Escape single quotes for embedding in single-quoted shell strings: ' -> '\'' */
function shellEscapeSingleQuote(s: string): string {
  return s.replace(/'/g, "'\\''")
}

function buildNode(cmd: Command, parentPath: string): CommandNode {
  const name = cmd.name()
  const path = parentPath ? `${parentPath}.${name}` : name
  const options = cmd.options
    .filter(opt => opt.long !== undefined && opt.long !== "--help" && opt.long !== "--version")
    .map(opt => ({
      long: opt.long!,
      description: opt.description,
      ...(opt.argChoices && opt.argChoices.length > 0 ? { enumValues: opt.argChoices as string[] } : {}),
    }))
  const subcommands = cmd.commands.map(sub => buildNode(sub, path))

  const firstArgOverride = DYNAMIC_COMPLETIONS[path]
  const argCompletions: ArgCompletion[] = cmd.registeredArguments.flatMap((arg, index) => {
    // Priority 1: path-based override (first arg only) per D-02
    if (index === 0 && firstArgOverride) {
      return [{ name: arg.name(), type: firstArgOverride, required: arg.required }]
    }
    // Priority 2: convention inference from arg name per D-01
    const inferred = NAME_TO_COMPLETION_TYPE[arg.name()]
    if (inferred) {
      return [{ name: arg.name(), type: inferred, required: arg.required }]
    }
    // Priority 3: Commander .argChoices extraction per D-04
    if (arg.argChoices && arg.argChoices.length > 0) {
      return [{ name: arg.name(), type: "choices" as DynamicCompletion, required: arg.required, choices: arg.argChoices }]
    }
    // Priority 4: no completion for this position
    return []
  })

  return { path, name, description: cmd.description(), options, subcommands, argCompletions }
}

function buildTree(program: Command): CommandNode[] {
  return program.commands.map(cmd => buildNode(cmd, ""))
}

// ─── Bash ────────────────────────────────────────────────────────────────────

function bashDynamicLookup(type: DynamicCompletion, indent: string, name: string, choices?: string[]): string {
  if (type === "workspace") {
    return (
      `${indent}local names\n` +
      `${indent}names=$(grep -h '^name:' "$HOME/.config/${name}/workspaces"/*.yml 2>/dev/null | sed 's/^name:[[:space:]]*//')\n` +
      `${indent}COMPREPLY=($(compgen -W "$names" -- "$cur"))\n`
    )
  }
  if (type === "repo") {
    return (
      `${indent}local names\n` +
      `${indent}names=$(grep '^- name:' "$HOME/.config/${name}/registry.yml" 2>/dev/null | sed 's/^- name: //')\n` +
      `${indent}COMPREPLY=($(compgen -W "$names" -- "$cur"))\n`
    )
  }
  if (type === "template") {
    return (
      `${indent}local names\n` +
      `${indent}names=$(grep -h '^name:' "$HOME/.config/${name}/templates"/*.yml 2>/dev/null | sed 's/^name:[[:space:]]*//')\n` +
      `${indent}COMPREPLY=($(compgen -W "$names" -- "$cur"))\n`
    )
  }
  if (type === "integration") {
    const ids = integrations.map(i => i.id).join(" ")
    return `${indent}COMPREPLY=($(compgen -W "${ids}" -- "$cur"))\n`
  }
  if (type === "choices" && choices) {
    return `${indent}COMPREPLY=($(compgen -W "${choices.join(" ")}" -- "$cur"))\n`
  }
  return ""
}

function bashCaseBodyRecursive(node: CommandNode, depth: number, name: string, indent: string): string {
  const { subcommands } = node
  const firstDynamic = node.argCompletions[0]?.type ?? null

  if (subcommands.length > 0) {
    const subcmdNames = subcommands.map(s => s.name).join(" ")

    // Check if any sub has its own subcommands (needs deeper nesting)
    const hasDeepSubs = subcommands.some(s => s.subcommands.length > 0)

    if (hasDeepSubs) {
      // Generate nested case statements for deeper nesting
      let out = `${indent}case "\${words[${depth}]}" in\n`
      for (const sub of subcommands) {
        const subFirstDynamic = sub.argCompletions[0]?.type ?? null
        if (sub.subcommands.length > 0) {
          out += `${indent}  ${sub.name})\n`
          out += bashCaseBodyRecursive(sub, depth + 1, name, indent + "    ")
          out += `${indent}    ;;\n`
        } else if (subFirstDynamic && subFirstDynamic !== "shells") {
          out += `${indent}  ${sub.name})\n`
          out += bashDynamicLookup(subFirstDynamic, indent + "    ", name, sub.argCompletions[0]?.choices)
          out += `${indent}    ;;\n`
        }
      }
      out += `${indent}  *)\n`
      out += `${indent}    COMPREPLY=($(compgen -W "${subcmdNames}" -- "$cur"))\n`
      out += `${indent}    ;;\n`
      out += `${indent}esac\n`
      return out
    }

    // Flat subcommands (no deeper nesting) — original behavior
    const byDynamic = new Map<DynamicCompletion, string[]>()
    for (const sub of subcommands) {
      const subFirstDynamic = sub.argCompletions[0]?.type ?? null
      if (subFirstDynamic && subFirstDynamic !== "shells") {
        if (!byDynamic.has(subFirstDynamic)) byDynamic.set(subFirstDynamic, [])
        byDynamic.get(subFirstDynamic)!.push(sub.name)
      }
    }
    let out = `${indent}if [[ \${COMP_CWORD} -eq ${depth} ]]; then\n`
    out += `${indent}  COMPREPLY=($(compgen -W "${subcmdNames}" -- "$cur"))\n`
    for (const [dynType, names] of byDynamic) {
      const pattern = names.length === 1 ? names[0] : `@(${names.join("|")})`
      out += `${indent}elif [[ \${COMP_CWORD} -eq ${depth + 1} ]] && [[ "\${words[${depth}]}" == ${pattern} ]]; then\n`
      out += bashDynamicLookup(dynType, indent + "  ", name)
    }
    out += `${indent}fi\n`
    return out
  }

  // Leaf node with dynamic completion
  if (firstDynamic && firstDynamic !== "shells") {
    return bashDynamicLookup(firstDynamic, indent, name, node.argCompletions[0]?.choices)
  }

  return ""
}

function bashCaseBody(node: CommandNode, name: string): string {
  const { subcommands, options } = node
  const dynamic = node.argCompletions[0]?.type ?? null
  const firstArgChoices = node.argCompletions[0]?.choices

  if (subcommands.length > 0) {
    return bashCaseBodyRecursive(node, 2, name, "      ")
  }

  if (dynamic === "shells") {
    return `      COMPREPLY=($(compgen -W "bash zsh fish" -- "$cur"))\n`
  }

  // Check for command-specific flag completions (COMMAND_FLAG_COMPLETIONS)
  const cmdFlagEntries = Object.entries(COMMAND_FLAG_COMPLETIONS)
    .filter(([key]) => key.startsWith(`${node.path}:`))

  if (dynamic && options.length > 0) {
    const flagsStr = options.map(o => o.long).join(" ")
    let out =
      `      if [[ "$cur" == -* ]]; then\n` +
      `        COMPREPLY=($(compgen -W "${flagsStr}" -- "$cur"))\n` +
      `      else\n`

    if (cmdFlagEntries.length > 0) {
      out += `        case "$prev" in\n`
      for (const [key, dynType] of cmdFlagEntries) {
        const flag = key.split(":")[1]
        out += `          "${flag}")\n`
        out += bashDynamicLookup(dynType, "            ", name)
        out += `            return 0\n`
        out += `            ;;\n`
      }
      out += `        esac\n`
    }

    // Multi-arg position dispatch (D-06)
    if (node.argCompletions.length > 1) {
      out += `        if [[ \${COMP_CWORD} -eq 2 ]]; then\n`
      out += bashDynamicLookup(dynamic, "          ", name, firstArgChoices)
      for (let i = 1; i < node.argCompletions.length; i++) {
        const ac = node.argCompletions[i]
        out += `        elif [[ \${COMP_CWORD} -eq ${i + 2} ]]; then\n`
        out += bashDynamicLookup(ac.type, "          ", name, ac.choices)
      }
      out += `        fi\n`
    } else {
      out += bashDynamicLookup(dynamic, "        ", name, firstArgChoices)
    }
    out += `      fi\n`
    return out
  }

  if (dynamic) {
    // Multi-arg position dispatch without flags (D-06)
    if (node.argCompletions.length > 1) {
      let out = `      if [[ \${COMP_CWORD} -eq 2 ]]; then\n`
      out += bashDynamicLookup(dynamic, "        ", name, firstArgChoices)
      for (let i = 1; i < node.argCompletions.length; i++) {
        const ac = node.argCompletions[i]
        out += `      elif [[ \${COMP_CWORD} -eq ${i + 2} ]]; then\n`
        out += bashDynamicLookup(ac.type, "        ", name, ac.choices)
      }
      out += `      fi\n`
      return out
    }
    return bashDynamicLookup(dynamic, "      ", name, firstArgChoices)
  }

  // No positional dynamic, but command has COMMAND_FLAG_COMPLETIONS entries
  // (e.g. `new --from` completes template names but `new` itself has no positional completion)
  if (cmdFlagEntries.length > 0) {
    const flagsStr = options.map(o => o.long).join(" ")
    let out = ""
    if (options.length > 0) {
      out += `      if [[ "$cur" == -* ]]; then\n`
      out += `        COMPREPLY=($(compgen -W "${flagsStr}" -- "$cur"))\n`
      out += `      else\n`
      out += `        case "$prev" in\n`
      for (const [key, dynType] of cmdFlagEntries) {
        const flag = key.split(":")[1]
        out += `          "${flag}")\n`
        out += bashDynamicLookup(dynType, "            ", name)
        out += `            return 0\n`
        out += `            ;;\n`
      }
      out += `        esac\n`
      out += `      fi\n`
    } else {
      out += `      case "$prev" in\n`
      for (const [key, dynType] of cmdFlagEntries) {
        const flag = key.split(":")[1]
        out += `        "${flag}")\n`
        out += bashDynamicLookup(dynType, "          ", name)
        out += `          return 0\n`
        out += `          ;;\n`
      }
      out += `      esac\n`
    }
    return out
  }

  return ""
}

export function generateBash(program: Command): string {
  const name = program.name()
  const id   = name.replace(/-/g, "_")
  const nodes = buildTree(program)
  const topLevelNames = nodes.map(n => n.name).join(" ")

  let out = ""
  out += `# bash completion for ${name}\n`
  out += `# Add to ~/.bashrc:  eval "$(${name} completion bash)"\n`
  out += "\n"
  out += `# Shell wrapper — enables \`${name} cd\` to change the current directory\n`
  out += `${name}() {\n`
  out += `  if [[ "$1" == "cd" ]]; then\n`
  out += `    local dir\n`
  out += `    dir=$(command ${name} "$@") && builtin cd "$dir"\n`
  out += `  else\n`
  out += `    command ${name} "$@"\n`
  out += `  fi\n`
  out += `}\n`
  out += "\n"
  out += `_${id}_complete() {\n`
  out += "  local cur prev words cword\n"
  out += "  COMPREPLY=()\n"
  out += '  cur="${COMP_WORDS[COMP_CWORD]}"\n'
  out += '  prev="${COMP_WORDS[COMP_CWORD-1]}"\n'
  out += '  words=("${COMP_WORDS[@]}")\n'
  out += "\n"
  // Emit OPTION_ENUMS and FLAG_COMPLETIONS prev-word detection (before top-level case)
  const enumEntries = Object.entries(OPTION_ENUMS)
  const flagEntries = Object.entries(FLAG_COMPLETIONS)
  if (enumEntries.length > 0 || flagEntries.length > 0) {
    out += '  case "$prev" in\n'
    for (const [flag, values] of enumEntries) {
      out += `    "${flag}")\n`
      out += `      COMPREPLY=($(compgen -W "${values.join(" ")}" -- "$cur"))\n`
      out += `      return 0\n`
      out += `      ;;\n`
    }
    for (const [flag, dynType] of flagEntries) {
      out += `    "${flag}")\n`
      out += bashDynamicLookup(dynType, "      ", name)
      out += `      return 0\n`
      out += `      ;;\n`
    }
    out += "  esac\n"
    out += "\n"
  }
  out += "  if [[ ${COMP_CWORD} -eq 1 ]]; then\n"
  out += `    COMPREPLY=($(compgen -W "${topLevelNames}" -- "$cur"))\n`
  out += "    return 0\n"
  out += "  fi\n"
  out += "\n"
  out += '  case "${words[1]}" in\n'

  for (const node of nodes) {
    const body = bashCaseBody(node, name)
    if (!body) continue
    out += `    ${node.name})\n`
    out += body
    out += "      return 0\n"
    out += "      ;;\n"
  }

  out += "  esac\n"
  out += "}\n"
  out += `complete -F _${id}_complete ${name}\n`

  return out
}

// ─── Zsh ─────────────────────────────────────────────────────────────────────

/** Returns the _arguments spec string for a single option, honoring OPTION_ENUMS, FLAG_COMPLETIONS, and COMMAND_FLAG_COMPLETIONS. */
function zshOptionSpec(opt: OptionInfo, id: string, commandPath = ""): string {
  const flagName = opt.long  // e.g., "--strategy"
  const enumValues = OPTION_ENUMS[flagName]
  const flagDynamic = resolveFlagCompletion(commandPath, flagName)
  if (enumValues) {
    const valName = flagName.slice(2) // "strategy"
    return `'${opt.long}[${shellEscapeSingleQuote(opt.description)}]:${valName}:(${enumValues.join(" ")})'`
  } else if (flagDynamic) {
    const helper = flagDynamic === "repo" ? `_${id}_repos`
      : flagDynamic === "template" ? `_${id}_templates`
      : flagDynamic === "integration" ? `_${id}_integrations`
      : `_${id}_workspaces`
    const valName = flagName.slice(2)
    return `'${opt.long}[${shellEscapeSingleQuote(opt.description)}]:${valName}:${helper}'`
  } else {
    return `'${opt.long}[${shellEscapeSingleQuote(opt.description)}]'`
  }
}

function zshCaseBody(node: CommandNode, id: string): string {
  const { subcommands, options } = node
  const dynamic = node.argCompletions[0]?.type ?? null
  const firstArgRequired = node.argCompletions[0]?.required ?? false

  if (subcommands.length > 0) {
    return `        _${id}_${node.name} ;;\n`
  }

  if (dynamic === "shells") {
    return `        _values 'shell' bash zsh fish ;;\n`
  }

  if (dynamic === "choices") {
    const choices = node.argCompletions[0]?.choices ?? []
    const pos = firstArgRequired ? ":" : "::"
    if (options.length > 0) {
      let out = `        _arguments \\\n`
      for (const opt of options) {
        out += `          ${zshOptionSpec(opt, id, node.path)} \\\n`
      }
      out += `          '${pos} :(${choices.join(" ")})'\n`
      out += `          ;;\n`
      return out
    }
    return `        _values 'choice' ${choices.join(" ")} ;;\n`
  }

  if (dynamic && options.length > 0) {
    const helper = dynamic === "repo" ? `_${id}_repos`
      : dynamic === "template" ? `_${id}_templates`
      : dynamic === "integration" ? `_${id}_integrations`
      : `_${id}_workspaces`

    // Multi-arg dispatch (D-06)
    if (node.argCompletions.length > 1) {
      let out = `        _arguments \\\n`
      for (const opt of options) {
        out += `          ${zshOptionSpec(opt, id, node.path)} \\\n`
      }
      out += `          '${firstArgRequired ? ":" : "::"} :${helper}' \\\n`
      for (let i = 1; i < node.argCompletions.length; i++) {
        const ac = node.argCompletions[i]
        const acHelper = ac.type === "repo" ? `_${id}_repos`
          : ac.type === "template" ? `_${id}_templates`
          : ac.type === "integration" ? `_${id}_integrations`
          : `_${id}_workspaces`
        const acPos = ac.required ? ":" : "::"
        out += `          '${acPos} :${acHelper}'`
        if (i < node.argCompletions.length - 1) out += " \\\n"
        else out += "\n"
      }
      out += `          ;;\n`
      return out
    }

    const pos = `'${firstArgRequired ? ":" : "::"} :${helper}'`
    let out = `        _arguments \\\n`
    for (const opt of options) {
      out += `          ${zshOptionSpec(opt, id, node.path)} \\\n`
    }
    out += `          ${pos}\n`
    out += `          ;;\n`
    return out
  }

  if (dynamic === "workspace") {
    // Multi-arg dispatch without options (D-06)
    if (node.argCompletions.length > 1) {
      let out = `        _arguments \\\n`
      out += `          '${firstArgRequired ? ":" : "::"} :_${id}_workspaces' \\\n`
      for (let i = 1; i < node.argCompletions.length; i++) {
        const ac = node.argCompletions[i]
        const acHelper = ac.type === "repo" ? `_${id}_repos`
          : ac.type === "template" ? `_${id}_templates`
          : ac.type === "integration" ? `_${id}_integrations`
          : `_${id}_workspaces`
        const acPos = ac.required ? ":" : "::"
        out += `          '${acPos} :${acHelper}'`
        if (i < node.argCompletions.length - 1) out += " \\\n"
        else out += "\n"
      }
      out += `          ;;\n`
      return out
    }
    return `        _${id}_workspaces ;;\n`
  }

  if (dynamic === "repo") {
    return `        _${id}_repos ;;\n`
  }

  if (dynamic === "template") {
    return `        _${id}_templates ;;\n`
  }

  if (dynamic === "integration") {
    return `        _${id}_integrations ;;\n`
  }

  // No positional dynamic, but command has options that are in OPTION_ENUMS or FLAG_COMPLETIONS
  // (e.g. `list --sort`) — emit _arguments with enum-aware specs
  const enumOpts = options.filter(o => OPTION_ENUMS[o.long] !== undefined || resolveFlagCompletion(node.path, o.long) !== undefined)
  if (enumOpts.length > 0) {
    let out = `        _arguments \\\n`
    for (const opt of options) {
      out += `          ${zshOptionSpec(opt, id, node.path)} \\\n`
    }
    out += `          ;;\n`
    return out
  }

  return ""
}

function generateZshSubcmdHelperRecursive(node: CommandNode, id: string, funcName: string): string {
  const subcmds = node.subcommands
  const byDynamic = new Map<DynamicCompletion, string[]>()
  for (const sub of subcmds) {
    const subFirstDynamic = sub.argCompletions[0]?.type ?? null
    if (subFirstDynamic && subFirstDynamic !== "shells") {
      if (!byDynamic.has(subFirstDynamic)) byDynamic.set(subFirstDynamic, [])
      byDynamic.get(subFirstDynamic)!.push(sub.name)
    }
  }

  let out = `${funcName}() {\n`
  out += `  if (( CURRENT == 2 )); then\n`
  out += `    local subcmds\n`
  out += `    subcmds=(\n`
  for (const sub of subcmds) {
    out += `      '${sub.name}:${shellEscapeSingleQuote(sub.description)}'\n`
  }
  out += `    )\n`
  out += `    _describe 'subcommand' subcmds\n`
  out += `  else\n`
  out += `    case $words[2] in\n`
  for (const sub of subcmds) {
    const subFirstDynamic = sub.argCompletions[0]?.type ?? null
    if (sub.subcommands.length > 0) {
      // Sub-node has its own subcommands — dispatch to a deeper recursive helper
      const subFuncName = `${funcName}_${sub.name}`
      out += `      ${sub.name})\n`
      out += `        CURRENT=$((CURRENT - 1))\n`
      out += `        words=(${sub.name} \${words[3,-1]})\n`
      out += `        ${subFuncName} ;;\n`
    } else if (sub.options.length > 0) {
      out += `      ${sub.name})\n`
      out += `        _arguments \\\n`
      for (const opt of sub.options) {
        out += `          ${zshOptionSpec(opt, id, sub.path)} \\\n`
      }
      out += `          ;;\n`
    } else if (subFirstDynamic && subFirstDynamic !== "shells") {
      const helper = subFirstDynamic === "repo" ? `_${id}_repos`
        : subFirstDynamic === "template" ? `_${id}_templates`
        : subFirstDynamic === "integration" ? `_${id}_integrations`
        : `_${id}_workspaces`
      out += `      ${sub.name})\n`
      out += `        ${helper} ;;\n`
    }
  }
  // Fallback: byDynamic grouping for subcommands without options (backward compat)
  for (const [dynType, names] of byDynamic) {
    const unhandled = names.filter(n => !subcmds.find(s => s.name === n && (s.options.length > 0 || s.subcommands.length > 0)))
    if (unhandled.length === 0) continue
    const helper = dynType === "repo" ? `_${id}_repos`
      : dynType === "template" ? `_${id}_templates`
      : dynType === "integration" ? `_${id}_integrations`
      : `_${id}_workspaces`
    out += `      ${unhandled.join("|")})\n`
    out += `        ${helper} ;;\n`
  }
  out += `    esac\n`
  out += `  fi\n`
  out += `}\n`

  // Recursively generate helpers for sub-nodes that have their own subcommands
  for (const sub of subcmds) {
    if (sub.subcommands.length > 0) {
      out += "\n"
      out += generateZshSubcmdHelperRecursive(sub, id, `${funcName}_${sub.name}`)
    }
  }

  return out
}

function generateZshSubcmdHelper(node: CommandNode, id: string): string {
  return generateZshSubcmdHelperRecursive(node, id, `_${id}_${node.name}`)
}

export function generateZsh(program: Command): string {
  const name = program.name()
  const id   = name.replace(/-/g, "_")
  const nodes = buildTree(program)

  let out = ""
  out += `#compdef ${name}\n`
  out += `# zsh completion for ${name}\n`
  out += `# Add to ~/.zshrc:  eval "$(${name} completion zsh)"\n`
  out += "\n"
  out += `# Shell wrapper — enables \`${name} cd\` to change the current directory\n`
  out += `${name}() {\n`
  out += `  if [[ "$1" == "cd" ]]; then\n`
  out += `    local dir\n`
  out += `    dir=$(command ${name} "$@") && builtin cd "$dir"\n`
  out += `  else\n`
  out += `    command ${name} "$@"\n`
  out += `  fi\n`
  out += `}\n`
  out += "\n"
  out += `_${id}() {\n`
  out += "  local context state line\n"
  out += "  typeset -A opt_args\n"
  out += "\n"
  out += "  _arguments -C \\\n"
  out += `    '1: :_${id}_top_commands' \\\n`
  out += "    '*:: :->subcmd'\n"
  out += "\n"
  out += "  case $state in\n"
  out += "    subcmd)\n"
  out += "      case $words[1] in\n"

  for (const node of nodes) {
    const body = zshCaseBody(node, id)
    if (!body) continue
    out += `        ${node.name})\n`
    out += body
  }

  out += "      esac\n"
  out += "      ;;\n"
  out += "  esac\n"
  out += "}\n"
  out += "\n"
  out += `_${id}_top_commands() {\n`
  out += "  local cmds\n"
  out += "  cmds=(\n"
  for (const node of nodes) {
    out += `    '${node.name}:${shellEscapeSingleQuote(node.description)}'\n`
  }
  out += "  )\n"
  out += "  _describe 'command' cmds\n"
  out += "}\n"
  out += "\n"
  out += `_${id}_workspaces() {\n`
  out += `  local ws_dir="$HOME/.config/${name}/workspaces"\n`
  out += `  local workspaces\n`
  out += `  workspaces=($(grep -h '^name:' "$ws_dir"/*.yml 2>/dev/null | sed 's/^name:[[:space:]]*//'))\n`
  out += `  _values 'workspace' $workspaces\n`
  out += `}\n`
  out += "\n"
  out += `_${id}_repos() {\n`
  out += `  local names\n`
  out += `  names=($(grep '^- name:' "$HOME/.config/${name}/registry.yml" 2>/dev/null | sed 's/^- name: //'))\n`
  out += `  _values 'repo' $names\n`
  out += `}\n`
  out += "\n"
  out += `_${id}_templates() {\n`
  out += `  local templates_dir="$HOME/.config/${name}/templates"\n`
  out += `  local templates\n`
  out += `  templates=($(grep -h '^name:' "$templates_dir"/*.yml 2>/dev/null | sed 's/^name:[[:space:]]*//'))\n`
  out += `  _values 'template' $templates\n`
  out += `}\n`
  out += "\n"
  out += `_${id}_integrations() {\n`
  out += `  _values 'integration' ${integrations.map(i => i.id).join(" ")}\n`
  out += `}\n`

  for (const node of nodes) {
    if (node.subcommands.length > 0) {
      out += "\n"
      out += generateZshSubcmdHelper(node, id)
    }
  }

  out += "\n"
  out += `_${id}\n`

  return out
}

// ─── Fish ────────────────────────────────────────────────────────────────────

function emitFishSubcommands(nodes: CommandNode[], ancestorChain: string[], name: string, id: string, lines: string[]): void {
  for (const node of nodes) {
    if (node.subcommands.length === 0) continue
    const subcmdNames = node.subcommands.map(s => s.name).join(" ")
    const chain = [...ancestorChain, node.name]

    // Build the condition for "we've seen all ancestors + this node, but not yet a sub-subcommand"
    const seenParts = chain.map(c => `__fish_seen_subcommand_from ${c}`).join("; and ")
    const notSeen = `not __fish_seen_subcommand_from ${subcmdNames}`

    lines.push(`\n# ${chain.join(" ")} subcommands\n`)
    for (const sub of node.subcommands) {
      lines.push(`complete -c ${name} -f -n '${seenParts}; and ${notSeen}' \\\n`)
      lines.push(`  -a '${sub.name}' -d '${shellEscapeSingleQuote(sub.description)}'\n`)
    }

    // Flags for subcommands
    for (const sub of node.subcommands) {
      if (sub.options.length === 0) continue
      lines.push(`\n# Flags for ${chain.join(" ")} ${sub.name}\n`)
      for (const opt of sub.options) {
        const longName = opt.long.slice(2)
        lines.push(`complete -c ${name} -f -n '${seenParts}; and __fish_seen_subcommand_from ${sub.name}' -l ${longName} -d '${shellEscapeSingleQuote(opt.description)}'\n`)
      }
    }

    // Dynamic completions for leaf subcommands
    const dynHelper = (dynType: DynamicCompletion): string =>
      dynType === "repo" ? `__${id}_repos`
        : dynType === "template" ? `__${id}_templates`
        : dynType === "integration" ? `__${id}_integrations`
        : `__${id}_workspaces`

    const repoDynSubs = node.subcommands.filter(s => s.argCompletions[0]?.type === "repo" && s.subcommands.length === 0)
    if (repoDynSubs.length > 0) {
      lines.push(`\nfor cmd in ${repoDynSubs.map(s => s.name).join(" ")}\n`)
      lines.push(`  complete -c ${name} -f -n "${seenParts}; and __fish_seen_subcommand_from $cmd" \\\n`)
      lines.push(`    -a "(${dynHelper("repo")})"\n`)
      lines.push("end\n")
    }

    const templateDynSubs = node.subcommands.filter(s => s.argCompletions[0]?.type === "template" && s.subcommands.length === 0)
    if (templateDynSubs.length > 0) {
      lines.push(`\nfor cmd in ${templateDynSubs.map(s => s.name).join(" ")}\n`)
      lines.push(`  complete -c ${name} -f -n "${seenParts}; and __fish_seen_subcommand_from $cmd" \\\n`)
      lines.push(`    -a "(${dynHelper("template")})"\n`)
      lines.push("end\n")
    }

    const workspaceDynSubs = node.subcommands.filter(s => s.argCompletions[0]?.type === "workspace" && s.subcommands.length === 0)
    if (workspaceDynSubs.length > 0) {
      lines.push(`\nfor cmd in ${workspaceDynSubs.map(s => s.name).join(" ")}\n`)
      lines.push(`  complete -c ${name} -f -n "${seenParts}; and __fish_seen_subcommand_from $cmd" \\\n`)
      lines.push(`    -a "(${dynHelper("workspace")})"\n`)
      lines.push("end\n")
    }

    // Recurse into sub-nodes that have their own subcommands
    emitFishSubcommands(node.subcommands, chain, name, id, lines)
  }
}

export function generateFish(program: Command): string {
  const name = program.name()
  const id   = name.replace(/-/g, "_")
  const nodes = buildTree(program)
  const allTopNames = nodes.map(n => n.name).join(" ")

  let out = ""
  out += `# fish completion for ${name}\n`
  out += `# Add to ~/.config/fish/config.fish:  ${name} completion fish | source\n`
  out += "\n"
  out += `# Shell wrapper — enables \`${name} cd\` to change the current directory\n`
  out += `function ${name}\n`
  out += `  if test (count $argv) -ge 1; and test "$argv[1]" = "cd"\n`
  out += `    set -l dir (command ${name} $argv)\n`
  out += "    and cd $dir\n"
  out += "  else\n"
  out += `    command ${name} $argv\n`
  out += "  end\n"
  out += "end\n"
  out += "\n"
  out += `function __${id}_workspaces\n`
  out += `  set -l ws_dir "$HOME/.config/${name}/workspaces"\n`
  out += "  if test -d $ws_dir\n"
  out += `    grep -h '^name:' "$ws_dir"/*.yml 2>/dev/null | sed 's/^name:[[:space:]]*//' \n`
  out += "  end\n"
  out += "end\n"
  out += "\n"
  out += `function __${id}_repos\n`
  out += `  set -l reg "$HOME/.config/${name}/registry.yml"\n`
  out += "  if test -f $reg\n"
  out += "    grep '^- name:' $reg | sed 's/^- name: //'\n"
  out += "  end\n"
  out += "end\n"
  out += "\n"
  out += `function __${id}_templates\n`
  out += `  set -l templates_dir "$HOME/.config/${name}/templates"\n`
  out += "  if test -d $templates_dir\n"
  out += `    grep -h '^name:' "$templates_dir"/*.yml 2>/dev/null | sed 's/^name:[[:space:]]*//' \n`
  out += "  end\n"
  out += "end\n"
  out += "\n"
  out += `function __${id}_integrations\n`
  out += `  string split ' ' '${integrations.map(i => i.id).join(" ")}'\n`
  out += "end\n"
  out += "\n"
  out += `function __${id}_no_subcommand\n`
  out += `  not __fish_seen_subcommand_from ${allTopNames}\n`
  out += "end\n"
  out += "\n"
  out += "# Top-level completions\n"
  for (const node of nodes) {
    const namePadded = node.name.padEnd(10)
    out += `complete -c ${name} -f -n __${id}_no_subcommand -a ${namePadded} -d '${shellEscapeSingleQuote(node.description)}'\n`
  }

  // Workspace dynamic completions — group commands into for loop
  // Exclude multi-arg commands (they get individual position-aware completions below)
  const workspaceCmds = nodes.filter(n => n.argCompletions[0]?.type === "workspace" && n.argCompletions.length === 1).map(n => n.name)
  if (workspaceCmds.length > 0) {
    out += "\n# Workspace name completions\n"
    out += `for cmd in ${workspaceCmds.join(" ")}\n`
    out += `  complete -c ${name} -f -n "__fish_seen_subcommand_from $cmd" -a "(__${id}_workspaces)"\n`
    out += "end\n"
  }

  // Multi-arg commands: emit position-aware completions individually
  const multiArgTopNodes = nodes.filter(n => n.argCompletions.length > 1)
  for (const node of multiArgTopNodes) {
    const dynHelper = (dynType: DynamicCompletion): string =>
      dynType === "repo" ? `__${id}_repos`
        : dynType === "template" ? `__${id}_templates`
        : dynType === "integration" ? `__${id}_integrations`
        : `__${id}_workspaces`
    out += `\n# Position-aware completions for ${node.name}\n`
    out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${node.name}; and test (count (commandline -opc)) -eq 2' -a '(${dynHelper(node.argCompletions[0].type)})'\n`
    for (let i = 1; i < node.argCompletions.length; i++) {
      const ac = node.argCompletions[i]
      out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${node.name}; and test (count (commandline -opc)) -eq ${i + 2}' -a '(${dynHelper(ac.type)})'\n`
    }
  }

  // Per-command flags
  for (const node of nodes) {
    if (node.options.length === 0) continue
    out += `\n# Flags for ${node.name}\n`
    for (const opt of node.options) {
      const longName = opt.long.slice(2)  // strip "--"
      out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${node.name}' -l ${longName}  -d '${shellEscapeSingleQuote(opt.description)}'\n`
    }
  }

  // OPTION_ENUMS: emit complete directives with -ra for fixed-choice flag values
  const enumFlags = Object.entries(OPTION_ENUMS)
  if (enumFlags.length > 0) {
    out += "\n# Fixed-choice flag values\n"
    for (const [flag, values] of enumFlags) {
      const longName = flag.slice(2) // strip "--"
      // Find which top-level commands or subcommands use this flag
      for (const node of nodes) {
        if (node.options.some(o => o.long === flag)) {
          out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${node.name}' -l ${longName} -ra '${values.join(" ")}'\n`
        }
        for (const sub of node.subcommands) {
          if (sub.options.some(o => o.long === flag)) {
            out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${node.name}; and __fish_seen_subcommand_from ${sub.name}' -l ${longName} -ra '${values.join(" ")}'\n`
          }
        }
      }
    }
  }

  // FLAG_COMPLETIONS: emit complete directives with dynamic lookup for flag values (e.g. --workspace)
  const dynFlags = Object.entries(FLAG_COMPLETIONS)
  if (dynFlags.length > 0) {
    out += "\n# Dynamic flag-value completions\n"
    for (const [flag, dynType] of dynFlags) {
      const longName = flag.slice(2)
      const helperFn = dynType === "repo" ? `__${id}_repos`
        : dynType === "template" ? `__${id}_templates`
        : `__${id}_workspaces`
      for (const node of nodes) {
        if (node.options.some(o => o.long === flag)) {
          out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${node.name}' -l ${longName} -ra "(${helperFn})"\n`
        }
        for (const sub of node.subcommands) {
          if (sub.options.some(o => o.long === flag)) {
            out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${node.name}; and __fish_seen_subcommand_from ${sub.name}' -l ${longName} -ra "(${helperFn})"\n`
          }
        }
      }
    }
  }

  // COMMAND_FLAG_COMPLETIONS: emit per-command flag-value completions
  const cmdFlagEntries = Object.entries(COMMAND_FLAG_COMPLETIONS)
  if (cmdFlagEntries.length > 0) {
    out += "\n# Per-command flag-value completions\n"
    for (const [key, dynType] of cmdFlagEntries) {
      const [cmdPath, flag] = key.split(":")
      const longName = flag.slice(2)  // strip "--"
      const helperFn = dynType === "repo" ? `__${id}_repos`
        : dynType === "template" ? `__${id}_templates`
        : `__${id}_workspaces`
      // cmdPath is a top-level command name (e.g. "new") — use __fish_seen_subcommand_from
      out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${cmdPath}' -l ${longName} -ra "(${helperFn})"\n`
    }
  }

  // Commands with subcommands — recursive helper for arbitrary depth
  const fishSubLines: string[] = []
  emitFishSubcommands(nodes, [], name, id, fishSubLines)
  out += fishSubLines.join("")

  // Shells completion
  const shellsNode = nodes.find(n => n.argCompletions[0]?.type === "shells")
  if (shellsNode) {
    out += `\n# Completion shell options\n`
    out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${shellsNode.name}' -a 'bash zsh fish'\n`
  }

  // Choices completions for top-level commands
  const choicesCmds = nodes.filter(n => n.argCompletions[0]?.type === "choices")
  for (const node of choicesCmds) {
    const choices = node.argCompletions[0]?.choices ?? []
    out += `\n# Choices for ${node.name}\n`
    out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${node.name}' -a '${choices.join(" ")}'\n`
  }

  return out
}
