#!/bin/sh
set -eu

if [ -n "${NODE_EXECUTABLE:-}" ]; then
  exec "$NODE_EXECUTABLE" scripts/cursor-stop-hook.mjs
fi

if command -v node >/dev/null 2>&1; then
  exec node scripts/cursor-stop-hook.mjs
fi

if command -v devbox >/dev/null 2>&1; then
  exec devbox run -- node scripts/cursor-stop-hook.mjs
fi

echo "Cursor stop hook could not find a Node.js runtime." >&2
exit 1
