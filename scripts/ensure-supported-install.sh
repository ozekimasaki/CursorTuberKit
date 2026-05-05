#!/usr/bin/env sh
set -eu

cursor_sdk_path="$(readlink -f node_modules/@cursor/sdk 2>/dev/null || true)"

case "$cursor_sdk_path" in
  *"/node_modules/.aube/"*)
    cat >&2 <<'EOF'
Unsupported Aube-installed node_modules layout detected.

This project no longer supports Aube-managed dependencies because native modules
like @cursor/sdk/sqlite3 can fail to load under Bun with:
  libstdc++.so.6: cannot open shared object file

Please clean the old install and reinstall with Bun:
  rm -rf node_modules
  bun install
EOF
    exit 1
    ;;
esac
