#!/usr/bin/env bash
# Render free-tier keepalive: ping /health to keep calc+api warm.
# Usage: API_URL=https://kisan360-api.onrender.com CALC_URL=https://kisan360-calc.onrender.com bash scripts/keepalive.sh
set -euo pipefail
API_URL="${API_URL:-https://kisan360-api.onrender.com}"
CALC_URL="${CALC_URL:-https://kisan360-calc.onrender.com}"
for url in "${API_URL}/health" "${CALC_URL}/health"; do
  echo "Ping $url"
  curl -fsS --max-time 60 -o /dev/null -w "%{http_code} %{url_effective} %{time_total}s\n" "$url" || echo "  (warmup in progress — retry in 30s)"
done
echo "Keepalive done. In GitHub Actions, schedule this every 12 min:"
echo "  .github/workflows/keepalive.yml"
