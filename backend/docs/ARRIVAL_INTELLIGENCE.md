# Arrival Intelligence

## Purpose

Kisan360 provides **arrival context** from AGMARKNET data — the breadth of market observations and, when the source provides it, reported arrival quantities. This is **context**, not a demand signal or supply prediction.

## Source Field Audit

| Field | AGMARKNET Raw Field | Normalized Field | Status |
|-------|-------------------|-----------------|--------|
| Arrival date | `arrival_date` | `arrivalDate` | Populated for all observations |
| Arrival quantity | `arrival_quantity` | `arrivalQuantity` | **NOT populated for Maharashtra data** |
| Arrival unit | `arrival_unit` or `unit` | `arrivalUnit` | **NOT populated for Maharashtra data** |

### Critical Finding

The AGMARKNET data.gov.in API (resource `9ef84268-d588-465a-a308-a864a43d0070`) does not return `arrival_quantity` for Maharashtra crop observations. This was verified by:

1. Inspecting the 85-row snapshot (`priceSnapshots.json`) — zero rows have `arrivalQuantity`
2. Live API verification — `quantitySummary.available: false` for all crops
3. The `arrivalUnit` field is also absent

**The system uses observation counts as a proxy for market activity breadth, not physical quantity.**

## What the System Computes

### Observation Count (always available)
- Number of price-reporting mandis/varieties per date
- Distinct markets per date
- Context: ABOVE_NORMAL / NORMAL / BELOW_NORMAL (vs 7-day average)

### Arrival Quantity (when source provides data)
- Total arrival quantity per date
- Average per observation
- Latest arrival quantity
- Trend: UP / DOWN / FLAT / INSUFFICIENT_EVIDENCE
- Coverage: percentage of observations with quantity data

### Market-Level View
- Latest observation for crop + market
- Arrival quantity (when available)
- Modal price
- Source and observation date

## Deduplication

Observations are identified by `(crop, market, variety, arrivalDate)`. Repeated ingestion of the same record does NOT double-count.

## Provenance

| Output | Classification |
|--------|---------------|
| Observation count | SOURCE_OBSERVED (raw count) |
| Arrival quantity | SOURCE_OBSERVED (when source provides) |
| Aggregated quantity | DERIVED |
| Trend | DERIVED |
| Coverage | DERIVED |
| Context | DERIVED |

## Limitations

1. **AGMARKNET does not provide arrival quantity for Maharashtra** — observation counts are the best available proxy
2. **Single-date snapshot** — the current dataset has observations from one date only, so trends cannot be computed
3. **Observation count ≠ supply** — more observations may indicate broader market coverage, not more physical product
4. **Market name variations** — AGMARKNET uses names like "Lasalgaon(Niphad)" with trailing spaces; the system handles this

## What the System Does NOT Claim

- Does NOT claim observation counts represent physical supply
- Does NOT predict future arrivals
- Does NOT infer price-arrival causation
- Does NOT convert between incompatible units
- Does NOT count API fetches as arrivals
