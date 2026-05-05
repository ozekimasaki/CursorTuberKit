#!/usr/bin/env sh
set -eu

mode="${1:-}"

if [ -z "$mode" ]; then
  echo "Usage: sh scripts/runtime-entry.sh <vite|tsc|tsx|server-dev|server-start|js-script> [args...]" >&2
  exit 1
fi

shift

use_bun=false
node_bin=""

case "${npm_config_user_agent:-}" in
  bun/*)
    use_bun=true
    ;;
esac

if [ "$use_bun" = false ] && ! command -v node >/dev/null 2>&1 && command -v bun >/dev/null 2>&1; then
  use_bun=true
fi

if [ "${AI_PROVIDER:-}" = "cursor" ] && [ "$mode" = "server-dev" -o "$mode" = "server-start" ]; then
  use_bun=false
fi

resolve_node_bin() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  if command -v devbox >/dev/null 2>&1; then
    devbox run -- node -p 'process.execPath' 2>/dev/null | tail -n 1
    return 0
  fi

  return 1
}

if [ "$use_bun" = false ]; then
  node_bin="$(resolve_node_bin || true)"

  if [ -z "$node_bin" ]; then
    echo "Node.js executable not found. Install Node or make devbox available." >&2
    exit 1
  fi
fi

run_js_tool() {
  if [ "$use_bun" = true ]; then
    exec bunx "$@"
  fi

  exec "$@"
}

case "$mode" in
  vite)
    run_js_tool vite "$@"
    ;;
  tsc)
    run_js_tool tsc "$@"
    ;;
  tsx)
    if [ "$use_bun" = true ]; then
      exec bunx tsx "$@"
    fi

    exec tsx "$@"
    ;;
  server-dev)
    if [ "$use_bun" = true ]; then
      exec bun --watch server/index.ts "$@"
    fi

    exec "$node_bin" node_modules/tsx/dist/cli.mjs watch server/index.ts "$@"
    ;;
  server-start)
    if [ "$use_bun" = true ]; then
      exec bun "$@"
    fi

    exec "$node_bin" "$@"
    ;;
  js-script)
    if [ "$use_bun" = true ]; then
      exec bun "$@"
    fi

    exec "$node_bin" "$@"
    ;;
  *)
    echo "Unsupported runtime mode: $mode" >&2
    exit 1
    ;;
esac
