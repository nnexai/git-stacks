# @git-stacks/service

The Node.js interactive authority for git-stacks. It owns revisioned projections, typed operations, events, signals, filesystem reconciliation, native-keyring/protected-fallback identities, signed certificate rollover, pinned WebTransport, directly trusted self-signed-leaf local TLS, remote helper relay, and service-lifetime PTYs. Trusted local clients use the constrained `@git-stacks/service/client` export; remote pairing helpers use the Node-only `@git-stacks/service/remote` export so the optional Bun TUI never imports the native WebTransport addon.
