# Post-Harvest Loss Awareness & Crop-Aware Storage Intelligence

## Purpose

Kisan360 now provides **crop-specific storage-risk awareness** — an evidence layer that helps farmers understand whether a planned storage duration is compatible with the crop's known shelf-life characteristics.

This is **awareness**, not prediction. The system does not claim a crop will or will not spoil. It says: "Based on available evidence, this storage duration is [within/beyond] the supported shelf-life range for this crop."

## Architecture

```
cropPerishability.json  →  SOURCE_REFERENCE (static agricultural knowledge)
harvestDate (Lot)       →  DERIVED (days since harvest)
risk level              →  DERIVED (shelf-life range vs planned storage)
guidance                →  DERIVED (from risk level + evidence)
scenario loss           →  SCENARIO / FARMER_ENTERED (hypothetical only)
```

## Data Sources

### Crop Shelf-Life Profiles (`cropPerishability.json`)

| Crop | Shelf-Life Range | Storage Conditions | Source |
|------|-----------------|-------------------|--------|
| Onion | 14-30 days | Cool, dry, ventilated | SOURCE_REFERENCE (demo approximation) |
| Tomato | 5-10 days | 12-15°C, 90-95% RH | SOURCE_REFERENCE (demo approximation) |
| Soybean | 180-365 days | Dry grain <12% moisture | SOURCE_REFERENCE (demo approximation) |
| Rice | 180-365 days | Dry grain <14% moisture | SOURCE_REFERENCE (demo approximation) |
| Maize | 120-240 days | Dry grain <13% moisture | SOURCE_REFERENCE (demo approximation) |
| Cotton | 180-365 days | Dry, clean, <8% moisture | SOURCE_REFERENCE (demo approximation) |
| Groundnut | 60-120 days | Dry <9% moisture | SOURCE_REFERENCE (demo approximation) |

**Important**: These are demo-approximation values for storage-risk awareness, not certified agricultural measurements. Production would source from ICAR/NHM cold-chain guidelines or verified post-harvest research.

### Harvest Date

- Stored on `Lot.harvestDate` (ISO date string, already in the Lot model)
- Parsed as date-only (no time component)
- Future dates rejected
- Missing harvest date = valid but no perishability calculation

## Risk Methodology

### Deterministic Rules

Risk is computed as: `totalExposure = daysSinceHarvest + plannedStorageDays`

Compared against the crop's shelf-life range `[min, max]`:

| Total Exposure vs Range | Risk Level |
|------------------------|------------|
| `≤ min` | **LOW** |
| `≤ max` | **MODERATE** |
| `> max AND ≤ max × 1.5` | **HIGH** |
| `> max × 1.5` | **CRITICAL** |
| No profile available | **INSUFFICIENT_EVIDENCE** |

### Key Properties

- **Deterministic**: Same inputs always produce the same risk level
- **No false precision**: Uses ranges, not single numbers
- **No prediction**: Does not estimate spoilage percentage
- **Evidence-based**: Risk is derived from shelf-life ranges, not invented

## Storage Economic Intersection

The system now exposes two distinct questions:

1. **ECONOMIC THRESHOLD**: "What future price would make storage financially worthwhile?"
   - Computed by `scenario.computeStorageThreshold()`
   - Unchanged by this feature
   - Returns break-even price

2. **STORAGE FEASIBILITY / LOSS AWARENESS**: "Is the planned storage duration compatible with the crop evidence?"
   - Computed by `cropPerishability.assessPerishability()`
   - Returns risk level + guidance
   - Independent of economic threshold

These remain **separate**. A storage option can be:
- Economically attractive BUT high perishability risk
- Economically unattractive BUT low perishability risk

The system surfaces both rather than collapsing them into one fake score.

## API Contract

### Storage Threshold (enhanced)

```
GET /api/market/storage-threshold?crop=Onion&district=Nashik&quantity=10
  Optional: harvestDate=2026-09-05&storageDays=5

Response includes (when crop has a profile):
{
  perishability: {
    crop, shelfLife, daysSinceHarvest, remainingShelfLife,
    plannedStorageDays, riskLevel, riskReason, guidance,
    storageConditions, suitableStorageTypes, provenance, classification
  },
  storageDecision: {
    economicAssessment: { breakEvenFuturePrice, currentNet, ... },
    perishabilityAssessment: { ... },
    overallAssessment: "FAVORABLE" | "CAUTION" | "NOT_SUPPORTED" | "INSUFFICIENT_EVIDENCE",
    reasons: [...]
  }
}
```

### Pathways (enriched)

```
GET /api/market/pathways?crop=Onion&district=Nashik&quantity=10
  Optional: harvestDate=2026-09-05&storageDays=5

When STORE_THEN_SELL pathway exists and crop has a profile:
- pathway.perishability added (shelf life, risk, guidance)
- pathway.why[] gets warning when risk is HIGH/CRITICAL
- pathway.evidence[] gets perishability_risk entry
- result.perishability added (summary)
```

### Post-Harvest Loss (scenario only)

```
computeScenarioLoss({ quantityQuintals: 10, lossPercentage: 5, source: 'FARMER_ENTERED' })
→ { originalQuantity: 10, lossPercentage: 5, lossAmount: 0.5, saleableQuantity: 9.5, classification: 'FARMER_ENTERED' }
```

Always hypothetical. Never "observed loss."

## Provenance

| Output | Classification |
|--------|---------------|
| Crop shelf-life range | SOURCE_REFERENCE (demo approximation) |
| Days since harvest | DERIVED |
| Remaining shelf life | DERIVED |
| Risk level | DERIVED |
| Guidance text | DERIVED |
| Scenario loss | SCENARIO or FARMER_ENTERED |
| Storage facility data | DEMO |

## Files Changed

| File | Change |
|------|--------|
| `backend/src/data/cropPerishability.json` | **NEW** — 7 crop shelf-life profiles |
| `backend/src/services/cropPerishability.js` | **NEW** — pure functions: profile lookup, risk computation, scenario loss |
| `backend/src/routes/market.js` | Enhanced storage-threshold + pathways endpoints with perishability |
| `backend/tests/unit/cropPerishability.test.js` | **NEW** — 51 tests (unit + adversarial) |

## Limitations

1. **7 crops only** — production would cover all major Indian crops
2. **Ranges, not exact** — shelf-life varies by variety, conditions, handling
3. **No temperature integration** — the system does not read real-time temperature
4. **No spoilage prediction** — the system says "elevated risk," not "will spoil"
5. **Demo approximations** — shelf-life values are educated estimates, not certified data
6. **No loss quantification** — the system provides risk awareness, not loss percentages (unless the farmer enters a hypothetical scenario)

## What This Is NOT

- NOT a spoilage prediction model
- NOT a temperature monitoring system
- NOT a replacement for the economic storage threshold
- NOT a modification of the pathway decision engine
- NOT a claim about what will happen to the crop
