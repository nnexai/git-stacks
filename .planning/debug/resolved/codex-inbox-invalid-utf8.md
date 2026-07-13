---
status: resolved
trigger: "Codex signal inbox entry shows Unicode placeholders; Pango and GLib report invalid UTF-8"
created: 2026-07-13
updated: 2026-07-13
---

# Debug Session: Codex Inbox Invalid UTF-8

## Symptoms

- expected: Codex signal title/detail renders as valid UTF-8 in the native inbox and accessibility metadata.
- actual: The last Codex entry contains replacement/placeholders.
- errors: Pango rejects invalid UTF-8 and GLib `g_variant_new_string` requires valid UTF-8. Vulkan also reports a suboptimal swapchain, likely unrelated.
- timeline: Observed during Phase 107.1 production UAT after the signal migration.
- reproduction: Open the native signal inbox containing the latest Codex lifecycle entry.

## Current Focus

- hypothesis: Confirmed: exact-surface terminal titles were truncated at an arbitrary byte boundary, and SSE metadata was not copied into owned model buffers.
- test: Unicode Codex SSE regression, UTF-8 boundary truncation regression, native signal suites, full native verification, and workspace lifecycle smoke.
- expecting: Every Pango/GLib-bound signal string is valid UTF-8 and the production smoke exits normally.
- next_action: User rechecks the repaired production inbox entry.
- reasoning_checkpoint: Both malformed visual/accessibility text and the hanging smoke now have reproduced, tested causes.

## Evidence

- timestamp: 2026-07-13T03:09:09+02:00
  observation: Pango reports invalid UTF-8 when the Codex inbox entry is rendered.
- timestamp: 2026-07-13T03:09:15+02:00
  observation: GLib rejects the same invalid UTF-8 path while accessibility state is updated.

## Eliminated

- hypothesis: Vulkan swapchain warning causes text corruption.
  reason: VK_SUBOPTIMAL concerns presentation sizing; independent Pango and GLib validation failures identify malformed text bytes.

## Resolution

- root_cause: Raw 64-byte terminal-title truncation could split a UTF-8 codepoint used in signal row location and accessibility descriptions, and Ghostty title callbacks could retain trailing embedded NUL bytes rendered as placeholder boxes. The SSE decoder also omitted owned copies of title, detail, and occurrence time. The workspace smoke synchronously asserted asynchronous terminal creation and then left the app open on failure.
- fix: Added validated codepoint-safe UTF-8 prefix truncation, terminated callback titles at the first NUL, defensively replaced control-bearing inbox location titles with `Terminal`, copied and validated all SSE display metadata, and made lifecycle smoke stages await asynchronous terminal creation/relaunch.
- verification: Targeted attention and service-client tests pass; typecheck and dependency audit pass; full native verification and release gates pass; lifecycle smoke exits cleanly.
- files_changed: native/core/model.zig, native/linux/app.zig, native/linux/service_client.zig, native/tests/attention_test.zig, native/tests/service_client_test.zig
