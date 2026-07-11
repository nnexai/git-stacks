#!/usr/bin/env bash
set -euo pipefail

commit=81ab8ffa90185221782baf785e85387321e16f8d
root="${TMPDIR:-/tmp}/git-stacks-ghostty-embedded-probe"
archive="$root.tar.gz"
zig="${ZIG:-$HOME/.cache/git-stacks/native/zig-linux-x86_64-0.15.2/zig}"

rm -rf "$root" "$archive"
curl -L --fail --retry 2 -o "$archive" "https://github.com/am-will/ghostty/archive/$commit.tar.gz"
mkdir -p "$root"
tar -xzf "$archive" --strip-components=1 -C "$root"
(cd "$root" && "$zig" build -Dapp-runtime=none -Doptimize=ReleaseFast -Demit-terminfo=false -Demit-termcap=false -Demit-themes=false -Demit-helpgen=false -Demit-docs=false --summary failures)

lib="$root/zig-out/lib/libghostty.so"
test -f "$lib"
nm -D "$lib" > "$root/exported-symbols.txt"
for symbol in ghostty_app_new ghostty_config_load_default_files ghostty_surface_new ghostty_surface_draw ghostty_surface_set_size ghostty_surface_key ghostty_surface_text; do
  grep -q " $symbol$" "$root/exported-symbols.txt"
done
echo "validated: full Linux embedded Ghostty surface API built at $commit"
