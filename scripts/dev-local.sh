#!/bin/sh

set -eu

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
web_port="${WEB_PORT:-3000}"
api_port="${API_PORT:-9000}"
api_pid=""
web_pid=""
compiler_pid=""
env_runtime_dir=""
env_snapshot=""
env_candidate=""
observed_env_fingerprint=""
loaded_env_fingerprint=""
staged_env_fingerprint=""
code_reload_queued=0
reload_settle_pending=0

env_file="$project_dir/.env.local"

if [ ! -f "$env_file" ]; then
  printf '%s\n' "缺少 .env.local，本地服务未启动。请先运行：cp .env.example .env.local" >&2
  exit 1
fi

api_watch_stamp="$(mktemp "${TMPDIR:-/tmp}/learning-api-watch.XXXXXX")"
old_umask="$(umask)"
umask 077
env_runtime_dir="$(mktemp -d "${TMPDIR:-/tmp}/learning-api-env.XXXXXX")" || {
  umask "$old_umask"
  rm -f "$api_watch_stamp"
  exit 1
}
umask "$old_umask"
env_snapshot="$env_runtime_dir/env.local"
env_candidate="$env_runtime_dir/env.candidate"

env_fingerprint() {
  fingerprint_file="$1"
  if [ ! -f "$fingerprint_file" ]; then
    printf '%s\n' "missing"
    return 0
  fi

  # Use a cryptographic content digest so equal-size edits cannot collide in
  # normal operation. The digest is comparison-only and is never logged.
  if command -v shasum >/dev/null 2>&1; then
    fingerprint_value="$(shasum -a 256 < "$fingerprint_file" 2>/dev/null || true)"
  elif command -v sha256sum >/dev/null 2>&1; then
    fingerprint_value="$(sha256sum < "$fingerprint_file" 2>/dev/null || true)"
  else
    fingerprint_value=""
  fi
  if [ -z "$fingerprint_value" ]; then
    printf '%s\n' "missing"
  else
    printf 'present:%s\n' "$fingerprint_value"
  fi
}

run_node_with_env_snapshot() {
  snapshot_file="$1"
  shift
  (
    # Node preserves inherited values over --env-file. Unset every supported
    # app key first so .env.local is authoritative without clearing PATH,
    # proxy, certificate, or other machine-level settings.
    for env_name in $(sed -E -n 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=.*/\2/p' "$project_dir/.env.example" "$snapshot_file" 2>/dev/null | sort -u); do
      case "$env_name" in
        PORT|HOST|PUBLIC_APP_ORIGIN|NODE_ENV|NEXT_PUBLIC_API_BASE_URL) continue ;;
      esac
      unset "$env_name"
    done
    exec node --env-file="$snapshot_file" "$@"
  )
}

validate_env_snapshot() {
  # Suppress Node's parser output as well as values. The caller emits only
  # fixed, actionable messages that cannot expose secrets.
  run_node_with_env_snapshot "$1" -e '
    const raw = process.env.AI_MOCK_MODE?.trim().toLowerCase();
    if (raw !== "true" && raw !== "false") process.exit(20);
    if (raw === "false" && (!process.env.DOUBAO_API_KEY?.trim() || !process.env.DOUBAO_MODEL_ID?.trim())) {
      process.exit(21);
    }
  ' >/dev/null 2>&1
}

stage_env_snapshot() {
  expected_fingerprint="$1"
  [ "$expected_fingerprint" != "missing" ] || return 2

  if ! cp "$env_file" "$env_candidate" 2>/dev/null; then
    return 2
  fi

  candidate_fingerprint="$(env_fingerprint "$env_candidate")"
  current_fingerprint="$(env_fingerprint "$env_file")"
  if [ "$candidate_fingerprint" != "$expected_fingerprint" ] || [ "$current_fingerprint" != "$expected_fingerprint" ]; then
    rm -f "$env_candidate"
    return 2
  fi

  if ! validate_env_snapshot "$env_candidate"; then
    rm -f "$env_candidate"
    return 1
  fi

  if ! mv "$env_candidate" "$env_snapshot"; then
    rm -f "$env_candidate"
    return 2
  fi
  staged_env_fingerprint="$expected_fingerprint"
  return 0
}

start_api() {
  PORT="$api_port" \
  HOST=localhost \
  PUBLIC_APP_ORIGIN="http://localhost:$web_port" \
  NODE_ENV=development \
  run_node_with_env_snapshot "$env_snapshot" "$project_dir/functions/learning-api/dist/functions/learning-api/src/index.js" &
  api_pid=$!
}

api_sources_changed() {
  find "$project_dir/functions/learning-api/dist" -type f -name '*.js' -newer "$api_watch_stamp" -print -quit | grep -q .
}

mark_api_sources_seen() {
  touch "$api_watch_stamp"
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
  rm -f "$api_watch_stamp"
  if [ -n "$env_runtime_dir" ]; then
    rm -f "$env_snapshot" "$env_candidate"
    rmdir "$env_runtime_dir" 2>/dev/null || true
  fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cd "$project_dir"

# Start from an immutable, validated copy. This also closes the gap where the
# source file could be replaced between validation and process creation.
observed_env_fingerprint="$(env_fingerprint "$env_file")"
if ! stage_env_snapshot "$observed_env_fingerprint"; then
  printf '%s\n' "本地环境配置校验失败；请检查运行模式和真实模型必需项。" >&2
  exit 1
fi
loaded_env_fingerprint="$observed_env_fingerprint"
staged_env_fingerprint="$observed_env_fingerprint"

# Next.js already hot-reloads the page. Keep the local function build and
# process in sync as well, otherwise a new UI can keep calling an old API.
"$project_dir/node_modules/.bin/tsc" -p "$project_dir/tsconfig.function.json" --watch --preserveWatchOutput &
compiler_pid=$!

mark_api_sources_seen
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
  env_reload_pending=0
  env_ready=1
  current_env_fingerprint="$(env_fingerprint "$env_file")"
  if [ "$current_env_fingerprint" != "$observed_env_fingerprint" ]; then
    observed_env_fingerprint="$current_env_fingerprint"
    if [ "$current_env_fingerprint" = "missing" ]; then
      env_ready=0
      printf '%s\n' "检测到 .env.local 暂时缺失；当前分析服务继续使用上一份有效配置。" >&2
    elif stage_env_snapshot "$current_env_fingerprint"; then
      if [ "$current_env_fingerprint" != "$loaded_env_fingerprint" ]; then
        env_reload_pending=1
        reload_settle_pending=1
      fi
    else
      stage_status=$?
      env_ready=0
      if [ "$stage_status" -eq 2 ]; then
        # The file changed while being copied. Retry next tick without treating
        # this transient editor state as a stable invalid version.
        observed_env_fingerprint=""
        printf '%s\n' "检测到 .env.local 正在更新；当前分析服务继续使用上一份有效配置。" >&2
      else
        printf '%s\n' "检测到无效的本地环境配置；当前分析服务继续使用上一份有效配置，修正后将自动重试。" >&2
      fi
    fi
  elif [ "$current_env_fingerprint" != "$loaded_env_fingerprint" ]; then
    if [ "$current_env_fingerprint" = "$staged_env_fingerprint" ]; then
      env_reload_pending=1
    else
      # A stable invalid or missing version has already been reported. Keep
      # code changes pending until a valid environment can be staged with it.
      env_ready=0
    fi
  fi

  if api_sources_changed; then
    code_reload_queued=1
    reload_settle_pending=1
    mark_api_sources_seen
  fi
  code_reload_pending="$code_reload_queued"

  if [ "$env_ready" -eq 1 ] && { [ "$code_reload_pending" -eq 1 ] || [ "$env_reload_pending" -eq 1 ]; }; then
    if [ "$reload_settle_pending" -eq 1 ]; then
      # Wait one polling interval. Any code or env write observed next tick
      # resets this flag, coalescing near-simultaneous saves into one restart.
      reload_settle_pending=0
      sleep 1
      continue
    fi
    if [ "$code_reload_pending" -eq 1 ] && [ "$env_reload_pending" -eq 1 ]; then
      printf '%s\n' "检测到分析服务代码和本地环境配置更新，正在合并热重载。"
    elif [ "$env_reload_pending" -eq 1 ]; then
      printf '%s\n' "检测到本地环境配置更新，正在热重载分析服务。"
    else
      printf '%s\n' "检测到分析服务代码更新，正在热重载。"
    fi
    stop_process "$api_pid"
    api_pid=""
    start_api
    if ! wait_for_api; then
      printf '%s\n' "本地分析服务热重载失败。" >&2
      exit 1
    fi
    loaded_env_fingerprint="$current_env_fingerprint"
    code_reload_queued=0
    api_health_failures=0
  elif kill -0 "$api_pid" 2>/dev/null && curl --connect-timeout 1 --max-time 2 -fsS "http://localhost:$api_port/api/providers" >/dev/null 2>&1; then
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
