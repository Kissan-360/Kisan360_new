# Kisan360 — Snapshot Backup Mechanism

## Current Snapshot State

The cached market snapshot lives at `backend/src/data/priceSnapshots.json`.

| Field | Value |
|-------|-------|
| File | `priceSnapshots.json` |
| Rows | 250 |
| Crops | 33 (incl. Onion, Soybean, Tomato) |
| Markets | 71 distinct markets |
| Source | AGMARKNET API pull via `scripts/refresh-prices.js` |
| Last pulled | 2026-09-11 |

## Backup Commands

### View Current Snapshot

```bash
node -e "const s = require('./backend/src/data/priceSnapshots.json'); console.log('Rows:', s.rows.length, 'Crops:', [...new Set(s.rows.map(r => r.crop))], 'Retrieved:', s.retrievedAt)"
```

### Manual Backup

```bash
cp backend/src/data/priceSnapshots.json backend/src/data/priceSnapshots.backup.json
```

### Restore from Backup

```bash
cp backend/src/data/priceSnapshots.backup.json backend/src/data/priceSnapshots.json
```

### Refresh from AGMARKNET (when API is available)

```bash
cd backend && node scripts/refresh-prices.js
```

### Validate Snapshot Integrity

```bash
node -e "
const s = require('./backend/src/data/priceSnapshots.json');
const rows = s.rows || [];
const valid = rows.filter(r => r.crop && r.market && r.modalPrice > 0);
console.log('Total rows:', rows.length);
console.log('Valid rows:', valid.length);
console.log('Crops:', [...new Set(rows.map(r => r.crop))]);
console.log('Retrieved:', s.retrievedAt);
console.log('Status:', valid.length >= 80 ? 'OK' : 'DEGRADED');
"
```

## Snapshot Schema

Each row in `priceSnapshots.json` has this shape:

```json
{
  "crop": "Onion",
  "market": "APMC Lasalgaon",
  "state": "Maharashtra",
  "district": "Nashik",
  "modalPrice": 2800,
  "minPrice": 2400,
  "maxPrice": 3200,
  "arrivalDate": "2026-09-08",
  "source": "AGMARKNET",
  "retrievedAt": "2026-09-08T12:36:02.953Z"
}
```

## Age Thresholds

| Age | Label | Impact |
|-----|-------|--------|
| 0-24h | Live | Full confidence |
| 24-72h | Cached | Same data, labeled honestly |
| 72h+ | Stale | UI shows warning, data still usable |
| No data | Unavailable | Feature degrades gracefully |

## Pre-Demo Verification

```bash
# Quick snapshot check
node -e "const s = require('./backend/src/data/priceSnapshots.json'); console.log(s.rows.length, 'rows from', s.retrievedAt)"

# Full snapshot health
curl -s http://localhost:5000/api/market/cache-status | node -e "process.stdin.on('data', d => { const j = JSON.parse(d); console.log('Source:', j.source, '| Rows:', j.rowCount, '| Fresh:', j.fresh); })"
```
