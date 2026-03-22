---
created: 2026-03-22T08:52:51.711Z
title: Audit and isolate test environments from user config
area: testing
files:
  - tests/
  - tests/helpers.ts
  - src/lib/config.ts
---

## Problem

Some tests are still modifying user configuration (e.g., the global config at `~/.config/git-stacks/config.yml`) instead of being properly isolated. Tests should redirect `process.env.HOME` or equivalent to a temp directory so they never touch real user config. This can cause flaky tests and corrupt developer environments.

## Solution

Audit all test files for config isolation:
- Verify every test that touches config redirects `HOME` to a temp directory before importing/using config modules
- Check that `beforeEach`/`afterEach` properly set up and tear down isolated environments
- Fix any tests that leak writes to the real user config directory
- Consider a shared test setup helper if the pattern is repeated across many files
