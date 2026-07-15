---
spike: 021-file-origin-webtransport
status: validated
date: 2026-07-15
---

# Spike 021: Packaged File-Origin WebTransport Bootstrap

## Verdict

**VALIDATED on current Chrome/Linux** — a packaged `file:` document is a secure context and can open a SHA-256-certificate-hash-pinned WebTransport session to a loopback helper. A bidirectional stream echoed a randomized marker successfully. This removes the need to deliver executable browser code over unauthenticated loopback HTTP.

Modern macOS x64/arm64 and every browser claimed by the product remain mandatory release gates. The production web build must be exercised as a self-contained packaged asset because module/script loading behavior from `file:` differs from ordinary HTTP builds.

## Security consequence

- Browser code comes from the installed git-stacks package, not a reclaimable localhost origin or proxyable HTTP response.
- All service data, terminal input/output, authentication, and configuration use pinned WebTransport.
- The file origin is not identity. The helper still requires a loopback peer, a short-lived one-use launch token, ephemeral-key proof, a live listener epoch, protocol/build compatibility, and scoped authorization.
- No browser persistence is used. A file URL, history restore, copied profile, reload, or later process owning the old port provides no durable authority.
- Modifying the installed package remains same-user endpoint compromise. Distribution integrity, exact dependency integrity, and packaged artifact verification remain release requirements.

## Observed proof

Chrome reported `location.origin === "file://"` and `isSecureContext === true`. The retained probe connected to the existing Spike 011 Node WebTransport server at `https://127.0.0.1:4433`, supplied the exact leaf-certificate hash, opened a bidirectional stream, and received the randomized marker unchanged. The server independently recorded the loopback session and stream.

The `playwright-cli` wrapper intentionally blocks navigation to `file:` URLs, so the browser result was read through Chrome's DevTools protocol from a separately launched headless Chrome process. This is a tool-wrapper restriction, not a browser restriction.

## Production constraints

1. Build one self-contained HTML asset with generated CSP hashes and no remote executable resources or source maps.
2. Permit connections only to loopback WebTransport. Do not add HTTP API, configuration, SSE, WebSocket, update, analytics, font, or image endpoints.
3. Keep the UI inert until the pinned carrier and application authentication both succeed.
4. Clear the fragment immediately. Its token is 256-bit, one-use, listener-bound, and valid for at most 30 seconds even if browser history retains the original URL.
5. Treat opaque/null origin only as a request-shape check, never as client identity.
6. Prove the actual packaged client on supported Linux and modern macOS browsers, including hostile proxy/PAC settings, reload/history restore, copied profiles, and old-port takeover.

## Retained artifact

`file-client.html` is the minimal browser half of the proof. It accepts a base64url JSON fragment containing `{ "url": "...", "pin": "..." }`, clears the fragment, opens pinned WebTransport, and echoes a randomized marker. It is not production UI code.
