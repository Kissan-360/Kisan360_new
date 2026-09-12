#!/usr/bin/env bash
#
# dev-up.sh — boot the whole Kisan360 demo stack from one command.
#
# Starts (if not already running):
#   backend   Express API          http://localhost:5000   (critical)
#   calc      net-realization      http://localhost:8002   (critical)
#   web       React (vite)         http://localhost:3000   (required)
#   disease   MobileNetV2 CNN      http://localhost:8000   (optional — needs model/network)
#   advisory  RAG service          http://localhost:8001   (optional)
#
# Usage:
#   bash scripts/dev-up.sh              # everything
#   bash scripts/dev-up.sh --core       # backend + calculator + web only
#
# Ctrl+C stops every service this script started. Logs → /tmp/k360-*.log
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${K360_LOG_DIR:-/tmp}"

BACKEND_PORT="${BACKEND_PORT:-5000}"
WEB_PORT="${WEB_PORT:-3000}"
DISEASE_PORT="${DISEASE_PORT:-8000}"
ADVISORY_PORT="${ADVISORY_PORT:-8001}"
CALC_PORT="${CALC_PORT:-8002}"

INCLUDE_OPTIONAL=1
for arg in "$@"; do
  case "$arg" in
    --core) INCLUDE_OPTIONAL=0 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
  esac
done

PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

log() { printf '[dev-up] %s\n' "$*"; }
http_code() {
  local c
  c=$(curl -s -o /dev/null -m 2 -w '%{http_code}' "$1" 2>/dev/null)
  [ -n "$c" ] || c=000
  printf '%s' "$c"
}
is_up() { [ "$(http_code "$1")" != "000" ]; }

wait_health() { # url name timeout_seconds
  local url="$1" name="$2" timeout="${3:-40}"
  local deadline=$((SECONDS + timeout))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if is_up "$url"; then log "✅ $name up at $url"; return 0; fi
    sleep 1
  done
  log "❌ $name NOT healthy after ${timeout}s ($url)"
  return 1
}

# start <name> <port> <url> <wait_s> <log_file> -- <cmd...>
start() {
  local name="$1" port="$2" url="$3" wait_s="$4" lf="$5"
  shift 5; [ "$1" = "--" ] && shift

  if is_up "$url"; then
    log "⏭️  $name already running at $url"
    return 0
  fi

  log "🚀 starting $name (port $port) → $lf"
  "$@" >"$lf" 2>&1 &
  PIDS+=($!)
  wait_health "$url" "$name" "$wait_s"
}

FAILED=0
report() { # name url critical?
  if is_up "$2"; then
    log "✅ $1        $2"
  else
    log "❌ $1        $2"
    if [ "${3:-0}" = "1" ]; then FAILED=1; else log "   (optional — continuing)"; fi
  fi
}

# ── backend (critical) ──────────────────────────────────────────────────────
if command -v node >/dev/null 2>&1; then
  start backend "$BACKEND_PORT" "http://localhost:$BACKEND_PORT/health" 30 \
    "$LOG_DIR/k360-backend.log" -- bash -c "cd '$ROOT/backend' && PORT='$BACKEND_PORT' node src/server.js"
else
  log "❌ node not found — cannot start backend"; FAILED=1
fi

# ── net-realization calculator (critical) ───────────────────────────────────
if command -v python >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1; then
  PY="${PYTHON:-$(command -v python || command -v python3)}"
  start calc "$CALC_PORT" "http://localhost:$CALC_PORT/health" 30 \
    "$LOG_DIR/k360-calc.log" -- bash -c "cd '$ROOT/ml-service' && '$PY' -m uvicorn net_realization:app --port '$CALC_PORT'"
else
  log "❌ python not found — cannot start calculator"; FAILED=1
fi

# ── web app (required) ──────────────────────────────────────────────────────
if command -v node >/dev/null 2>&1; then
  start web "$WEB_PORT" "http://localhost:$WEB_PORT/" 30 \
    "$LOG_DIR/k360-web.log" -- bash -c "cd '$ROOT/web-app' && npm run dev -- --port '$WEB_PORT'"
else
  log "❌ node not found — cannot start web app"; FAILED=1
fi

# ── optional ML services ────────────────────────────────────────────────────
if [ "$INCLUDE_OPTIONAL" = "1" ]; then
  if command -v "$PY" >/dev/null 2>&1; then
    start disease "$DISEASE_PORT" "http://localhost:$DISEASE_PORT/health" 60 \
      "$LOG_DIR/k360-disease.log" -- bash -c "cd '$ROOT/ml-service' && '$PY' -m uvicorn main:app --port '$DISEASE_PORT'"
    start advisory "$ADVISORY_PORT" "http://localhost:$ADVISORY_PORT/health" 60 \
      "$LOG_DIR/k360-advisory.log" -- bash -c "cd '$ROOT/ml-service' && '$PY' -m uvicorn advisory_service:app --port '$ADVISORY_PORT'"
  fi
else
  log "ℹ️  optional ML services skipped (--core)"
fi

# ── disease warmup (best-effort; weights load at import, first predict warms torch) ──
if [ "$INCLUDE_OPTIONAL" = "1" ]; then
  WARM_IMG="$ROOT/ml-service/test_images/tomato_healthy.jpg"
  if [ -f "$WARM_IMG" ] && is_up "http://localhost:$DISEASE_PORT/health"; then
    log "🔥 warming disease model (first predict, up to 120s)…"
    WARM_CODE=$(curl -s -m 120 -o /dev/null -w '%{http_code}' -X POST "http://localhost:$DISEASE_PORT/predict" -F "file=@$WARM_IMG" 2>/dev/null)
    if [ "$WARM_CODE" = "200" ]; then log "✅ disease model warm"; else log "⚠️  disease warmup HTTP $WARM_CODE — service still usable, first click will be slow"; fi
  fi
fi

echo
log "──── stack status ────"
report "backend   (critical)" "http://localhost:$BACKEND_PORT/health" 1
report "calculator(critical)" "http://localhost:$CALC_PORT/health" 1
report "web app   (required)" "http://localhost:$WEB_PORT/" 1
if [ "$INCLUDE_OPTIONAL" = "1" ]; then
  report "disease   (optional)" "http://localhost:$DISEASE_PORT/health" 0
  report "advisory  (optional)" "http://localhost:$ADVISORY_PORT/health" 0
fi
echo
if [ "$FAILED" = "1" ]; then
  log "❌ dev-up FAILED — a critical service did not come up. Check logs in $LOG_DIR/k360-*.log"
  exit 1
fi
log "✅ dev-up OK — demo stack is running. Press Ctrl+C to stop the services started here."
