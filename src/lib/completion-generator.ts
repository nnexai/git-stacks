import { Command } from "commander"

type DynamicCompletion = "workspace" | "repo" | "template" | "shells"

const DYNAMIC_COMPLETIONS: Record<string, DynamicCompletion> = {
  clone:             "workspace",
  open:              "workspace",
  close:             "workspace",
  edit:              "workspace",
  status:            "workspace",
  clean:             "workspace",
  remove:            "workspace",
  merge:             "workspace",
  rename:            "workspace",
  run:               "workspace",
  sync:              "workspace",
  cd:                "workspace",
  "repo.show":       "repo",
  "repo.remove":     "repo",
  "repo.rename":     "repo",
  "template.show":   "template",
  "template.edit":   "template",
  "template.clone":  "template",
  "template.rename": "template",
  "template.remove": "template",
  completion:        "shells",
  "message.send":    "workspace",
  "message.list":    "workspace",
  "message.clear":   "workspace",

  // GitHub
  "integration.github.open":             "workspace",
  "integration.github.pr.create":        "workspace",
  "integration.github.pr.open":          "workspace",
  "integration.github.pr.status":        "workspace",
  "integration.github.issue.link":       "workspace",
  "integration.github.issue.unlink":     "workspace",
  "integration.github.issue.open":       "workspace",

  // GitLab
  "integration.gitlab.open":             "workspace",
  "integration.gitlab.pr.create":        "workspace",
  "integration.gitlab.pr.open":          "workspace",
  "integration.gitlab.pr.status":        "workspace",
  "integration.gitlab.issue.link":       "workspace",
  "integration.gitlab.issue.unlink":     "workspace",
  "integration.gitlab.issue.open":       "workspace",

  // Gitea
  "integration.gitea.open":              "workspace",
  "integration.gitea.pr.create":         "workspace",
  "integration.gitea.pr.open":           "workspace",
  "integration.gitea.pr.status":         "workspace",
  "integration.gitea.issue.link":        "workspace",
  "integration.gitea.issue.unlink":      "workspace",
  "integration.gitea.issue.open":        "workspace",

  // Jira
  "integration.jira.issue.link":         "workspace",
  "integration.jira.issue.unlink":       "workspace",
  "integration.jira.issue.open":         "workspace",

  // Niri
  "integration.niri.focus-workspace":    "workspace",

  // Tmux
  "integration.tmux.attach":             "workspace",
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
}

interface CommandNode {
  path: string
  name: string
  description: string
  options: OptionInfo[]
  subcommands: CommandNode[]
  dynamic: DynamicCompletion | null
  firstArgRequired: boolean
}

function buildNode(cmd: Command, parentPath: string): CommandNode {
  const name = cmd.name()
  const path = parentPath ? `${parentPath}.${name}` : name
  const options = cmd.options
    .filter(opt => opt.long !== undefined && opt.long !== "--help" && opt.long !== "--version")
    .map(opt => ({ long: opt.long!, description: opt.description }))
  const subcommands = cmd.commands.map(sub => buildNode(sub, path))
  const firstArg = cmd.registeredArguments[0]
  return {
    path,
    name,
    description: cmd.description(),
    options,
    subcommands,
    dynamic: DYNAMIC_COMPLETIONS[path] ?? null,
    firstArgRequired: firstArg?.required === true,
  }
}

function buildTree(program: Command): CommandNode[] {
  return program.commands.map(cmd => buildNode(cmd, ""))
}

// ─── Bash ────────────────────────────────────────────────────────────────────

function bashDynamicLookup(type: DynamicCompletion, indent: string, name: string): string {
  if (type === "workspace") {
    return (
      `${indent}local names\n` +
      `${indent}names=$(ls "$HOME/.config/${name}/workspaces" 2>/dev/null | sed 's/\\.yml$//')\n` +
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
      `${indent}names=$(ls "$HOME/.config/${name}/templates" 2>/dev/null | sed 's/\\.yml$//')\n` +
      `${indent}COMPREPLY=($(compgen -W "$names" -- "$cur"))\n`
    )
  }
  return ""
}

function bashCaseBodyRecursive(node: CommandNode, depth: number, name: string, indent: string): string {
  const { subcommands, dynamic } = node

  if (subcommands.length > 0) {
    const subcmdNames = subcommands.map(s => s.name).join(" ")

    // Check if any sub has its own subcommands (needs deeper nesting)
    const hasDeepSubs = subcommands.some(s => s.subcommands.length > 0)

    if (hasDeepSubs) {
      // Generate nested case statements for deeper nesting
      let out = `${indent}case "\${words[${depth}]}" in\n`
      for (const sub of subcommands) {
        if (sub.subcommands.length > 0) {
          out += `${indent}  ${sub.name})\n`
          out += bashCaseBodyRecursive(sub, depth + 1, name, indent + "    ")
          out += `${indent}    ;;\n`
        } else if (sub.dynamic && sub.dynamic !== "shells") {
          out += `${indent}  ${sub.name})\n`
          out += bashDynamicLookup(sub.dynamic, indent + "    ", name)
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
      if (sub.dynamic && sub.dynamic !== "shells") {
        if (!byDynamic.has(sub.dynamic)) byDynamic.set(sub.dynamic, [])
        byDynamic.get(sub.dynamic)!.push(sub.name)
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
  if (dynamic && dynamic !== "shells") {
    return bashDynamicLookup(dynamic, indent, name)
  }

  return ""
}

function bashCaseBody(node: CommandNode, name: string): string {
  const { subcommands, options, dynamic } = node

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

    out += bashDynamicLookup(dynamic, "        ", name)
    out += `      fi\n`
    return out
  }

  if (dynamic) {
    return bashDynamicLookup(dynamic, "      ", name)
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
    return `'${opt.long}[${opt.description}]:${valName}:(${enumValues.join(" ")})'`
  } else if (flagDynamic) {
    const helper = flagDynamic === "repo" ? `_${id}_repos`
      : flagDynamic === "template" ? `_${id}_templates`
      : `_${id}_workspaces`
    const valName = flagName.slice(2)
    return `'${opt.long}[${opt.description}]:${valName}:${helper}'`
  } else {
    return `'${opt.long}[${opt.description}]'`
  }
}

function zshCaseBody(node: CommandNode, id: string): string {
  const { subcommands, options, dynamic, firstArgRequired } = node

  if (subcommands.length > 0) {
    return `        _${id}_${node.name} ;;\n`
  }

  if (dynamic === "shells") {
    return `        _values 'shell' bash zsh fish ;;\n`
  }

  if (dynamic && options.length > 0) {
    const helper = dynamic === "repo" ? `_${id}_repos`
      : dynamic === "template" ? `_${id}_templates`
      : `_${id}_workspaces`
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
    return `        _${id}_workspaces ;;\n`
  }

  if (dynamic === "repo") {
    return `        _${id}_repos ;;\n`
  }

  if (dynamic === "template") {
    return `        _${id}_templates ;;\n`
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
    if (sub.dynamic && sub.dynamic !== "shells") {
      if (!byDynamic.has(sub.dynamic)) byDynamic.set(sub.dynamic, [])
      byDynamic.get(sub.dynamic)!.push(sub.name)
    }
  }

  let out = `${funcName}() {\n`
  out += `  if (( CURRENT == 2 )); then\n`
  out += `    local subcmds\n`
  out += `    subcmds=(\n`
  for (const sub of subcmds) {
    out += `      '${sub.name}:${sub.description}'\n`
  }
  out += `    )\n`
  out += `    _describe 'subcommand' subcmds\n`
  out += `  else\n`
  out += `    case $words[2] in\n`
  for (const sub of subcmds) {
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
    } else if (sub.dynamic && sub.dynamic !== "shells") {
      const helper = sub.dynamic === "repo" ? `_${id}_repos`
        : sub.dynamic === "template" ? `_${id}_templates`
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
    out += `    '${node.name}:${node.description}'\n`
  }
  out += "  )\n"
  out += "  _describe 'command' cmds\n"
  out += "}\n"
  out += "\n"
  out += `_${id}_workspaces() {\n`
  out += `  local ws_dir="$HOME/.config/${name}/workspaces"\n`
  out += `  local workspaces=(\${ws_dir}/*.yml(N:t:r))\n`
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
  out += `  local templates=(\${templates_dir}/*.yml(N:t:r))\n`
  out += `  _values 'template' $templates\n`
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
      lines.push(`  -a '${sub.name}' -d '${sub.description}'\n`)
    }

    // Flags for subcommands
    for (const sub of node.subcommands) {
      if (sub.options.length === 0) continue
      lines.push(`\n# Flags for ${chain.join(" ")} ${sub.name}\n`)
      for (const opt of sub.options) {
        const longName = opt.long.slice(2)
        lines.push(`complete -c ${name} -f -n '${seenParts}; and __fish_seen_subcommand_from ${sub.name}' -l ${longName} -d '${opt.description}'\n`)
      }
    }

    // Dynamic completions for leaf subcommands
    const dynHelper = (dynType: DynamicCompletion): string =>
      dynType === "repo" ? `__${id}_repos`
        : dynType === "template" ? `__${id}_templates`
        : `__${id}_workspaces`

    const repoDynSubs = node.subcommands.filter(s => s.dynamic === "repo" && s.subcommands.length === 0)
    if (repoDynSubs.length > 0) {
      lines.push(`\nfor cmd in ${repoDynSubs.map(s => s.name).join(" ")}\n`)
      lines.push(`  complete -c ${name} -f -n "${seenParts}; and __fish_seen_subcommand_from $cmd" \\\n`)
      lines.push(`    -a "(${dynHelper("repo")})"\n`)
      lines.push("end\n")
    }

    const templateDynSubs = node.subcommands.filter(s => s.dynamic === "template" && s.subcommands.length === 0)
    if (templateDynSubs.length > 0) {
      lines.push(`\nfor cmd in ${templateDynSubs.map(s => s.name).join(" ")}\n`)
      lines.push(`  complete -c ${name} -f -n "${seenParts}; and __fish_seen_subcommand_from $cmd" \\\n`)
      lines.push(`    -a "(${dynHelper("template")})"\n`)
      lines.push("end\n")
    }

    const workspaceDynSubs = node.subcommands.filter(s => s.dynamic === "workspace" && s.subcommands.length === 0)
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
  out += "    ls $ws_dir | sed 's/\\.yml$//'\n"
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
  out += "    ls $templates_dir | sed 's/\\.yml$//'\n"
  out += "  end\n"
  out += "end\n"
  out += "\n"
  out += `function __${id}_no_subcommand\n`
  out += `  not __fish_seen_subcommand_from ${allTopNames}\n`
  out += "end\n"
  out += "\n"
  out += "# Top-level completions\n"
  for (const node of nodes) {
    const namePadded = node.name.padEnd(10)
    out += `complete -c ${name} -f -n __${id}_no_subcommand -a ${namePadded} -d '${node.description}'\n`
  }

  // Workspace dynamic completions — group commands into for loop
  const workspaceCmds = nodes.filter(n => n.dynamic === "workspace").map(n => n.name)
  if (workspaceCmds.length > 0) {
    out += "\n# Workspace name completions\n"
    out += `for cmd in ${workspaceCmds.join(" ")}\n`
    out += `  complete -c ${name} -f -n "__fish_seen_subcommand_from $cmd" -a "(__${id}_workspaces)"\n`
    out += "end\n"
  }

  // Per-command flags
  for (const node of nodes) {
    if (node.options.length === 0) continue
    out += `\n# Flags for ${node.name}\n`
    for (const opt of node.options) {
      const longName = opt.long.slice(2)  // strip "--"
      out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${node.name}' -l ${longName}  -d '${opt.description}'\n`
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
  const shellsNode = nodes.find(n => n.dynamic === "shells")
  if (shellsNode) {
    out += `\n# Completion shell options\n`
    out += `complete -c ${name} -f -n '__fish_seen_subcommand_from ${shellsNode.name}' -a 'bash zsh fish'\n`
  }

  return out
}
