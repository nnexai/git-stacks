# Native service-v1 fixture export

These files are a checked, byte-for-byte export of `tests/fixtures/service-v1/`,
the sole canonical Phase 104 corpus. `scripts/verify-native.ts` rejects missing,
extra, or changed native copies and reports the drifting filename.

Linux runs the same bytes through Bun's canonical source, Zig decoding, and the
C ABI harness. The public header also receives strict C11 Clang diagnostics.
This is a compile-portability check only: actual macOS execution and byte-parity
proof are explicitly deferred to Phase 107.
