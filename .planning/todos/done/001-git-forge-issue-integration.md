---
title: "Git forge integrations (GitHub/GitLab/Gitea) with issue/task linking"
status: pending
priority: P2
source: "promoted from /gsd:note (notes 3 & 4 combined)"
created: 2026-03-22
theme: integrations
---

## Goal

Add integrations for GitHub, GitLab, and Gitea using their respective CLI tools (gh, glab, tea) to create MR/PRs and open them. Integrations should understand where repos are upstream (via git remote or explicit config). Additionally, provide issue/task linking so users can associate a workspace with a task/issue and quickly open or fetch it — also extensible to Jira via CLI.

## Context

Promoted from quick notes captured on 2026-03-22.

Two related ideas combined:
1. Git forge integrations (GitHub/GitLab/Gitea) for PR/MR creation and upstream awareness
2. Issue/task integration for linking workspaces to issues with quick-open support

## Acceptance Criteria

- [ ] GitHub integration using `gh` CLI for PR creation and issue linking
- [ ] GitLab integration using `glab` CLI for MR creation and issue linking
- [ ] Gitea integration using `tea` CLI (optional/stretch)
- [ ] Upstream detection via git remote or explicit URL configuration
- [ ] Issue/task linking per workspace with quick-open command
