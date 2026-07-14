---
title: Native client retirement
date: 2026-07-14
status: retired
---

# Native Client Retirement

The GTK/Zig/libghostty desktop client is permanently retired and unsupported.

## Why

Supporting it required ownership of a patched Ghostty surface fork, ongoing Ghostty/Zig compatibility work, GTK packaging and distribution, and separate macOS build and verification infrastructure. That maintenance burden is disproportionate to the product value now delivered by the local web client and TypeScript service.

## Archive

- Annotated tag: `native-client-final-2026-07-14`
- Final pre-removal commit: `f3b7a5d64ca1a9f8af076a3540663a87d285a199`
- Removal begins at commit: `004b5679`

The tag contains the final implementation, tests, patched dependency assets, acceptance records, and historical planning. The active branch intentionally contains no dormant implementation or implied support tier.

## Retained Architecture

The local TypeScript service, authoritative snapshots, operations, workspace monitoring, signal journal, browser pairing, terminal launch resolution, and service-owned browser PTYs remain supported. Their names and contracts are client-neutral or web-specific.

## Revival Policy

Revival is not a maintenance task. It would require a new product decision, a new supported dependency and packaging strategy, current platform verification, and a fresh implementation plan based on the archive rather than restoring old code wholesale.

