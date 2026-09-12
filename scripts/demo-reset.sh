#!/usr/bin/env bash
#
# demo-reset.sh — Clean demo state for fresh presentation.
#
# This script:
#   1. Restarts the backend (wiping in-memory DB state)
#   2. Re-seeds the canonical demo fixtures
#   3. Verifies the seed was successful
#
# DEMO ONLY — never run against a production database.
# Requires: running backend on localhost:5000
#
set -uo pipefail

BASE_URL="${KISAN_API_URL:-http://localhost:5000/api}"
BACKEND_PORT="${BACKEND_PORT:-5000}"

log() { printf '[demo-reset] %s\n' "$*"; }

# Step 1: Kill existing backend if running
log "Stopping existing backend on port $BACKEND_PORT..."
pkill -f "node src/server.js" 2>/dev/null || true
sleep 2

# Step 2: Start backend fresh
log "Starting fresh backend..."
cd "$(dirname "$0")/../backend" || exit 1
PORT="$BACKEND_PORT" node src/server.js &
BACKEND_PID=$!
sleep 4

# Step 3: Check health
HTTP_CODE=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://localhost:$BACKEND_PORT/health" 2>/dev/null)
if [ "$HTTP_CODE" != "200" ]; then
  log "❌ Backend health check failed (HTTP $HTTP_CODE)"
  kill $BACKEND_PID 2>/dev/null
  exit 1
fi
log "✅ Backend healthy (HTTP $HTTP_CODE)"

# Step 4: Demo login (farmer)
FARMER_TOKEN=$(curl -s -X POST "http://localhost:$BACKEND_PORT/api/auth/demo-login" \
  -H "Content-Type: application/json" \
  -d '{"role":"farmer","name":"Demo Farmer","district":"Nashik"}' 2>/dev/null | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$FARMER_TOKEN" ]; then
  log "❌ Failed to get farmer demo token"
  kill $BACKEND_PID 2>/dev/null
  exit 1
fi
log "✅ Farmer demo login successful"

# Step 5: Seed canonical demo
SEED_RESULT=$(curl -s -X POST "http://localhost:$BACKEND_PORT/api/auth/demo/seed" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FARMER_TOKEN" 2>/dev/null)

if echo "$SEED_RESULT" | grep -q '"success":true'; then
  log "✅ Demo seed successful"
else
  log "⚠️  Demo seed returned: $SEED_RESULT"
fi

# Step 6: Verify net-realization works
NR_RESULT=$(curl -s "http://localhost:$BACKEND_PORT/api/market/net-realization?crop=Onion&district=Nashik&quantity=10" 2>/dev/null)
if echo "$NR_RESULT" | grep -q '"success":true'; then
  BEST_MANDI=$(echo "$NR_RESULT" | grep -o '"bestMandi":"[^"]*"' | cut -d'"' -f4)
  log "✅ Net realization working — best mandi: $BEST_MANDI"
else
  log "⚠️  Net realization returned unexpected response"
fi

# Step 7: Login as buyer for offer acceptance test
BUYER_TOKEN=$(curl -s -X POST "http://localhost:$BACKEND_PORT/api/auth/demo-login" \
  -H "Content-Type: application/json" \
  -d '{"role":"buyer","name":"Demo Buyer","district":"Nashik"}' 2>/dev/null | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$BUYER_TOKEN" ]; then
  log "✅ Buyer demo login successful"
else
  log "⚠️  Buyer demo login failed"
fi

log ""
log "════════════════════════════════════════"
log "  Demo reset complete!"
log "  Backend: http://localhost:$BACKEND_PORT"
log "  Frontend: http://localhost:3000"
log "  Farmer token: ready"
log "  Buyer token: ready"
log "════════════════════════════════════════"
log ""
log "Press Ctrl+C to stop the backend, or leave it running."
wait $BACKEND_PID 2>/dev/null
