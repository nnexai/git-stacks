---
plan: 08-01
status: complete
---

# Plan 08-01 Summary: Types and Hooks Foundation

## Completed
- Updated `src/tui/dashboard/types.ts`: added Tab type, modified Action (removed "status", added "rename"), modified UIView (removed "detail-status", added "inline-input")
- Created `src/tui/dashboard/hooks/useTemplates.ts`: returns `{ entries: Accessor<Template[]>, reload }`
- Created `src/tui/dashboard/hooks/useRepos.ts`: returns `{ entries: Accessor<RepoEntry[]>, reload }` with diskExists field

## Type contracts established
- `Tab = "workspaces" | "templates" | "repos"`
- `Action = "open" | "edit" | "rename" | "clean" | "remove" | "merge"`
- `UIView` includes `inline-input` variant, excludes `detail-status`

## Note
App.tsx has temporary type errors referencing removed "status"/"detail-status" — to be fixed in Plan 02.
