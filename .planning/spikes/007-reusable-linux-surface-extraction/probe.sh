#!/usr/bin/env bash
set -euo pipefail

fork=81ab8ffa90185221782baf785e85387321e16f8d
base=a3aa9fa1362d9b7ecb2b05b13789df1ac083cff0
root="${TMPDIR:-/tmp}/git-stacks-ghostty-api-diff"
rm -rf "$root"
mkdir -p "$root/base" "$root/fork"
for file in include/ghostty.h src/apprt/embedded.zig; do
  mkdir -p "$root/base/$(dirname "$file")" "$root/fork/$(dirname "$file")"
  curl -L --fail -s -o "$root/base/$file" "https://raw.githubusercontent.com/ghostty-org/ghostty/$base/$file"
  curl -L --fail -s -o "$root/fork/$file" "https://raw.githubusercontent.com/am-will/ghostty/$fork/$file"
  diff -u "$root/base/$file" "$root/fork/$file" > "$root/$(basename "$file").patch" || true
done
wc -l "$root"/*.patch
grep -q 'linux = 3' "$root/fork/src/apprt/embedded.zig"
grep -q 'ghostty_surface_draw' "$root/fork/include/ghostty.h"
echo "partial: bounded patch confirmed; upstream acceptance remains unproven"
