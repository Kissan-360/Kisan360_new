# DATA MODEL AND TRUST — Kisan360

## Entities and Authoritative Sources

| Entity | Storage | Authoritative Source | Key Fields |
|--------|---------|---------------------|------------|
| **Market Observation** | priceSnapshots.json + priceHistory.json | AGMARKNET (data.gov.in) API | crop, variety, market, district, state, min/max/modalPrice, arrivalDate |
| **Lot** | MongoDB `lots` collection | Farmer input (validated server-side) | farmerUid, crop, quantity, unit, district, grade, status |
| **Offer** | MongoDB `offers` collection | Server-computed from lot × buyer price | lotId, buyerId, crop, quantityQuintals, offeredPricePerQuintal, amount, status |
| **Payment** | MongoDB `payments` collection | Server-created from accepted offer | offerId, lotId, farmerUid, buyerId, amount, status, history |
| **Grievance** | MongoDB `grievances` collection | Farmer input (validated) | raisedByUid, category, description, status, history |
| **Buyer Directory** | `buyers.json` (static file) | Demo directory — illustrative | id, name, crops, districts, trustTier, minQuantityQuintals |
| **FPO Members** | `fpoMembers.json` (static file) | Mock seed — illustrative | uid, name, village, crop, quantity, unit |
| **User Session** | JWT (stateless) | demo-login (simulated) or Firebase ID token | uid, role, name, district |
| **Diagnostics** | MongoDB `kisan360_diagnostics` | Server probe (read-only + write test) | probe document with TTL |

## Calculated vs Stored Fields

| Field | Stored or Calculated | Source |
|-------|---------------------|--------|
| `Offer.amount` | **Calculated** server-side | `offeredPricePerQuintal × quantityQuintals` (lot's own quantity) |
| `Payment.amount` | **Copied** from Offer at creation | Offer.amount at accept time (immutable after creation) |
| `Lot.quantity` | **Stored** (farmer input) | Validated: finite, >0, ≤100000 |
| `net realization` | **Calculated** per-request | ML calculator (:8002) on live/cached prices |
| `transport cost` | **Calculated** per-request | `₹/q/km × distance × quantity tier` |
| `uplift (FPO)` | **Calculated** per-request | Difference between pooled and individual net |

## Static/Demo Data

| Data | Trust Level | How Labeled in UI |
|------|------------|-------------------|
| Buyer directory | **DEMO_STATIC** | `demo: true`, `staticDirectory: true`, trustTier badges with descriptions |
| FPO members | **DEMO_STATIC** | `mocked: true`, `note: "Members are mock demo households"` |
| Assumptions (₹/q/km) | **DOCUMENTED** | Provenance tags: `[assumption]` in evidence drawer |
| Transaction states | **SIMULATED** | `mocked: true` on every payment; `note: "Simulated payment status"` |

## Provenance Rules

Every market observation must carry:
- **source**: `agmarknet_live` | `agmarknet_snapshot`
- **retrievedAt**: ISO timestamp of the pull
- **arrivalDate**: Date of the quote (from AGMARKNET, not the pull date)
- **crop/variety/market/district/state**: Geographic and product identity
- **freshnessMs / ageHours**: Computed at response time (not stored)

The provenance chain:
```
AGMARKNET API → recordsToRows() → normalizeRow() → priceCache → /api/market/prices
                                        ↓
                                priceHistory (daily accumulation)
```

## Freshness Semantics

| Term | Meaning | Where Used |
|------|---------|-----------|
| **LIVE** | Fetched from AGMARKNET within the current request | `/api/market/prices` response (`source: "agmarknet_live"`) |
| **CACHED** | Stamped snapshot, recently loaded | `/api/market/prices` fallback; market page badge |
| **STALE** | Snapshot older than expected; live pull failed | Provenance note: `"live pull failed, serving snapshot"` |
| **FALLBACK** | Live pull returned empty/wrong for the filter; snapshot used | `fallback: true` in response; UI shows cached notice |

Consistency rule: the `/api/market/prices` response includes `source` and `fallback` fields. The frontend reads these to display the freshness badge. No endpoint should call data "LIVE" when it came from the snapshot.

## Data Retention

| Collection/File | Retention | Cleanup |
|----------------|-----------|---------|
| `priceHistory.json` | Append-only; grows daily | Manual or cron prune (not implemented; file stays small for demo) |
| `priceSnapshots.json` | Replaced on each successful refresh | Last-known-good preserved on failure |
| `kisan360_diagnostics` | **7-day TTL** | MongoDB auto-deletes via `autoExpireAt` index |
| `lots`, `offers`, `payments`, `grievances` | **Permanent** (demo data) | Seed endpoint is idempotent (reuses, never stacks) |

## Key Relationships

```
Lot (farmerUid) ←── Offer (lotId, farmerUid, buyerId)
                         ↓ accept
                    Payment (offerId, lotId, farmerUid)
                         ↓ dispute
                    Grievance (raisedByUid, lotId? → optional)
```

- Offer.lotId → Lot._id (MongoDB ObjectId reference, populated in buyer-side views)
- Payment.offerId → Offer._id (unique index: one payment per offer)
- Payment.lotId → Lot._id (populated for benchmark/outcome displays)
- Grievance.lotId → Lot._id (optional; some grievances are lot-independent)

## Known Limitations

1. **Price history stores only modalPrice** per observation (min/max lost at normalization). Sufficient for trend display; min/max are available in the snapshot for current-day views.
2. **Grade is lost** in normalized rows sent to the calculator. The calculator does not use grade; the snapshot preserves it for current-day display.
3. **Buyer directory is static JSON** — not a live marketplace. Trust badges are illustrative, not verified.
4. **Transactions are simulated** — no real money movement, no payment gateway, no escrow.
5. **FPO members are mock** — not real farmer accounts. Pooling math is real; the member data is illustrative.
