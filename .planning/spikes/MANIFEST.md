# Spike Manifest

## Product Boundary

git-stacks remains integration-neutral for external terminal products. The local web client is the one supported path where the Bun/TypeScript service owns terminal processes directly.

## Spikes

| # | Name | Verdict | Relevance |
|---|---|---|---|
| 001 | interactive-pty-surface | PARTIAL | Historical OpenTUI terminal experiment |
| 002 | multiple-shell-surfaces | PARTIAL | Historical multi-session behavior experiment |
| 003 | tmux-control-plane | VALIDATED | External-session integration boundary |
| 010 | web-terminal-tabs | VALIDATED | Foundation for service-owned browser terminal tabs |

Unsupported desktop-renderer experiments were removed from the active branch and remain available through repository history and the archive tag recorded in `.planning/notes/native-client-retirement.md`.
