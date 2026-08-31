#!/bin/sh

set -eu

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
web_port="${WEB_PORT:-3000}"
api_port="${API_PORT:-9000}"
api_pid=""
web_pid=""
compiler_pid=""

start_api() {
  if [ -f "$project_dir/.env.local" ]; then
    PORT="$api_port" \
    HOST=localhost \
    PUBLIC_APP_ORIGIN="http://localhost:$web_port" \
    NODE_ENV=development \
    node --watch --env-file="$project_dir/.env.local" "$project_dir/functions/learning-api/dist/functions/learning-api/src/index.js" &
  else
    PORT="$api_port" \
    HOST=localhost \
    PUBLIC_APP_ORIGIN="http://localhost:$web_port" \
    NODE_ENV=development \
    AI_MOCK_MODE=true \
    SESSION_STATE_SECRET=local-development-session-secret-32 \
    node --watch "$project_dir/functions/learning-api/dist/functions/learning-api/src/index.js" &
  fi
  api_pid=$!
}

wait_for_api() {
  attempt=0
  while [ "$attempt" -lt 100 ]; do
    if ! kill -0 "$api_pid" 2>/dev/null; then
      return 1
    fi
    if curl --connect-timeout 1 --max-time 2 -fsS "http://localhost:$api_port/api/providers" >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 0.1
  done
  return 1
}

stop_process() {
  target_pid="$1"
  [ -n "$target_pid" ] || return 0
  kill -STOP "$target_pid" 2>/dev/null || true
  child_pids="$(pgrep -P "$target_pid" 2>/dev/null || true)"
  pkill -TERM -P "$target_pid" 2>/dev/null || true
  kill "$target_pid" 2>/dev/null || true
  kill -CONT "$target_pid" 2>/dev/null || true
  stop_attempt=0
  while kill -0 "$target_pid" 2>/dev/null && [ "$stop_attempt" -lt 20 ]; do
    stop_attempt=$((stop_attempt + 1))
    sleep 0.1
  done
  if kill -0 "$target_pid" 2>/dev/null; then
    pkill -KILL -P "$target_pid" 2>/dev/null || true
    kill -KILL "$target_pid" 2>/dev/null || true
  fi
  for child_pid in $child_pids; do
    if kill -0 "$child_pid" 2>/dev/null; then
      kill -KILL "$child_pid" 2>/dev/null || true
    fi
  done
  wait "$target_pid" 2>/dev/null || true
}

cleanup() {
  current_web_pid="$web_pid"
  current_api_pid="$api_pid"
  current_compiler_pid="$compiler_pid"
  web_pid=""
  api_pid=""
  compiler_pid=""
  stop_process "$current_web_pid"
  stop_process "$current_api_pid"
  stop_process "$current_compiler_pid"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cd "$project_dir"

# Next.js already hot-reloads the page. Keep the local function build and
# process in sync as well, otherwise a new UI can keep calling an old API.
"$project_dir/node_modules/.bin/tsc" -p "$project_dir/tsconfig.function.json" --watch --preserveWatchOutput &
compiler_pid=$!

start_api
if ! wait_for_api; then
  printf '%s\n' "本地分析服务未能在端口 $api_port 就绪。" >&2
  exit 1
fi

NEXT_PUBLIC_API_BASE_URL="http://localhost:$api_port/api" \
"$project_dir/node_modules/.bin/next" dev -p "$web_port" &
web_pid=$!

api_health_failures=0
while kill -0 "$web_pid" 2>/dev/null && kill -0 "$compiler_pid" 2>/dev/null; do
  if kill -0 "$api_pid" 2>/dev/null && curl --connect-timeout 1 --max-time 2 -fsS "http://localhost:$api_port/api/providers" >/dev/null 2>&1; then
    api_health_failures=0
  else
    api_health_failures=$((api_health_failures + 1))
  fi

  if [ "$api_health_failures" -ge 3 ]; then
    printf '%s\n' "检测到本地分析服务失去响应，正在自动恢复。" >&2
    stop_process "$api_pid"
    api_pid=""
    start_api
    if ! wait_for_api; then
      printf '%s\n' "本地分析服务自动恢复失败。" >&2
      exit 1
    fi
    api_health_failures=0
  fi
  sleep 1
done

if ! kill -0 "$api_pid" 2>/dev/null; then
  wait "$api_pid"
elif ! kill -0 "$compiler_pid" 2>/dev/null; then
  wait "$compiler_pid"
else
  wait "$web_pid"
fi
