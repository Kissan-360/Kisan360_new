const perishability = require('../../src/services/cropPerishability');

// ── Reference dates for deterministic testing ─────────────────────────────
const TODAY = new Date('2026-09-10T12:00:00Z');

describe('cropPerishability', () => {
  // ── Profile lookup ─────────────────────────────────────────────────────

  describe('getPerishabilityProfile', () => {
    test('returns profile for known crop (Onion)', () => {
      const p = perishability.getPerishabilityProfile('Onion');
      expect(p).not.toBeNull();
      expect(p.crop).toBe('Onion');
      expect(p.shelfLifeDays.min).toBe(14);
      expect(p.shelfLifeDays.max).toBe(30);
      expect(p.source).toBe('SOURCE_REFERENCE');
    });

    test('returns profile for Tomato', () => {
      const p = perishability.getPerishabilityProfile('Tomato');
      expect(p).not.toBeNull();
      expect(p.shelfLifeDays.min).toBe(5);
      expect(p.shelfLifeDays.max).toBe(10);
    });

    test('returns profile for Soybean', () => {
      const p = perishability.getPerishabilityProfile('Soybean');
      expect(p).not.toBeNull();
      expect(p.shelfLifeDays.min).toBe(180);
      expect(p.shelfLifeDays.max).toBe(365);
    });

    test('returns null for unknown crop', () => {
      expect(perishability.getPerishabilityProfile('Mango')).toBeNull();
    });

    test('returns null for empty/missing input', () => {
      expect(perishability.getPerishabilityProfile(null)).toBeNull();
      expect(perishability.getPerishabilityProfile('')).toBeNull();
      expect(perishability.getPerishabilityProfile(undefined)).toBeNull();
    });

    test('case-insensitive lookup', () => {
      expect(perishability.getPerishabilityProfile('onion')).not.toBeNull();
      expect(perishability.getPerishabilityProfile('TOMATO')).not.toBeNull();
    });
  });

  // ── Harvest date parsing ───────────────────────────────────────────────

  describe('parseHarvestDate', () => {
    test('accepts valid past date', () => {
      const r = perishability.parseHarvestDate('2026-09-05');
      expect(r.ok).toBe(true);
      expect(r.date).toBeInstanceOf(Date);
    });

    test('accepts today', () => {
      const r = perishability.parseHarvestDate('2026-09-10');
      expect(r.ok).toBe(true);
    });

    test('rejects future date', () => {
      const r = perishability.parseHarvestDate('2026-09-15');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('future_date');
    });

    test('rejects malformed date', () => {
      expect(perishability.parseHarvestDate('not-a-date').ok).toBe(false);
      expect(perishability.parseHarvestDate('2026-13-01').ok).toBe(false);
    });

    test('rejects missing/empty input', () => {
      expect(perishability.parseHarvestDate(null).ok).toBe(false);
      expect(perishability.parseHarvestDate('').ok).toBe(false);
      expect(perishability.parseHarvestDate(undefined).ok).toBe(false);
    });

    test('rejects too-short string', () => {
      expect(perishability.parseHarvestDate('2026').ok).toBe(false);
    });
  });

  // ── Days since harvest ─────────────────────────────────────────────────

  describe('daysSinceHarvest', () => {
    test('computes 0 for same day', () => {
      const d = new Date('2026-09-10T08:00:00Z');
      const ref = new Date('2026-09-10T18:00:00Z');
      expect(perishability.daysSinceHarvest(d, ref)).toBe(0);
    });

    test('computes 5 for 5-day gap', () => {
      const d = new Date('2026-09-05T12:00:00Z');
      const ref = new Date('2026-09-10T12:00:00Z');
      expect(perishability.daysSinceHarvest(d, ref)).toBe(5);
    });

    test('never returns negative', () => {
      const d = new Date('2026-09-15T12:00:00Z');
      const ref = new Date('2026-09-10T12:00:00Z');
      expect(perishability.daysSinceHarvest(d, ref)).toBe(0);
    });
  });

  // ── Remaining shelf life ───────────────────────────────────────────────

  describe('computeRemainingShelfLife', () => {
    const onionProfile = perishability.getPerishabilityProfile('Onion');

    test('full shelf life when just harvested', () => {
      const r = perishability.computeRemainingShelfLife(onionProfile, 0);
      expect(r.remainingDaysMin).toBe(14);
      expect(r.remainingDaysMax).toBe(30);
      expect(r.expired).toBe(false);
    });

    test('partially consumed shelf life', () => {
      const r = perishability.computeRemainingShelfLife(onionProfile, 10);
      expect(r.remainingDaysMin).toBe(4);
      expect(r.remainingDaysMax).toBe(20);
      expect(r.expired).toBe(false);
    });

    test('expired when past max', () => {
      const r = perishability.computeRemainingShelfLife(onionProfile, 35);
      expect(r.remainingDaysMin).toBe(0);
      expect(r.remainingDaysMax).toBe(0);
      expect(r.expired).toBe(true);
    });

    test('handles null profile', () => {
      const r = perishability.computeRemainingShelfLife(null, 5);
      expect(r.remainingDaysMin).toBeNull();
      expect(r.expired).toBeNull();
    });
  });

  // ── Storage risk ───────────────────────────────────────────────────────

  describe('computeStorageRisk', () => {
    const tomatoProfile = perishability.getPerishabilityProfile('Tomato'); // 5-10d
    const soyProfile = perishability.getPerishabilityProfile('Soybean');  // 180-365d

    test('LOW when total exposure within min range', () => {
      // Tomato: harvest 2d ago, store 3d → total 5d ≤ min(5)
      const r = perishability.computeStorageRisk(tomatoProfile, 2, 3);
      expect(r.riskLevel).toBe('LOW');
    });

    test('MODERATE when total exposure within max range', () => {
      // Tomato: harvest 3d ago, store 5d → total 8d ≤ max(10)
      const r = perishability.computeStorageRisk(tomatoProfile, 3, 5);
      expect(r.riskLevel).toBe('MODERATE');
    });

    test('HIGH when total exposure exceeds max but within 1.5x', () => {
      // Tomato: harvest 5d ago, store 8d → total 13d, max=10, 1.5*max=15
      const r = perishability.computeStorageRisk(tomatoProfile, 5, 8);
      expect(r.riskLevel).toBe('HIGH');
    });

    test('CRITICAL when total exposure exceeds 1.5x max', () => {
      // Tomato: harvest 5d ago, store 12d → total 17d, 1.5*max=15
      const r = perishability.computeStorageRisk(tomatoProfile, 5, 12);
      expect(r.riskLevel).toBe('CRITICAL');
    });

    test('LOW for durable crop with long storage', () => {
      // Soybean: harvest 30d ago, store 60d → total 90d ≤ min(180)
      const r = perishability.computeStorageRisk(soyProfile, 30, 60);
      expect(r.riskLevel).toBe('LOW');
    });

    test('MODERATE for durable crop approaching max', () => {
      // Soybean: harvest 100d ago, store 200d → total 300d ≤ max(365)
      const r = perishability.computeStorageRisk(soyProfile, 100, 200);
      expect(r.riskLevel).toBe('MODERATE');
    });

    test('INSUFFICIENT_EVIDENCE when no profile', () => {
      const r = perishability.computeStorageRisk(null, 5, 3);
      expect(r.riskLevel).toBe('INSUFFICIENT_EVIDENCE');
    });

    test('LOW when planned storage is 0', () => {
      const r = perishability.computeStorageRisk(tomatoProfile, 5, 0);
      expect(r.riskLevel).toBe('LOW');
    });

    test('risk reason contains key evidence', () => {
      const r = perishability.computeStorageRisk(tomatoProfile, 3, 5);
      expect(r.reason).toMatch(/shelf-life/);
      expect(r.classification).toBe('DERIVED');
    });
  });

  // ── Urgency guidance ───────────────────────────────────────────────────

  describe('getUrgencyGuidance', () => {
    test('returns appropriate text for each risk level', () => {
      expect(perishability.getUrgencyGuidance('LOW', {})).toMatch(/compatible/);
      expect(perishability.getUrgencyGuidance('MODERATE', {})).toMatch(/approaching/);
      expect(perishability.getUrgencyGuidance('HIGH', {})).toMatch(/elevated risk/);
      expect(perishability.getUrgencyGuidance('CRITICAL', {})).toMatch(/significantly exceeds/);
      expect(perishability.getUrgencyGuidance('INSUFFICIENT_EVIDENCE', {})).toMatch(/Insufficient/);
    });
  });

  // ── Full assessment ────────────────────────────────────────────────────

  describe('assessPerishability', () => {
    test('full assessment for Tomato with recent harvest', () => {
      const r = perishability.assessPerishability({
        crop: 'Tomato',
        harvestDate: '2026-09-08',
        plannedStorageDays: 3,
        referenceDate: TODAY,
      });
      expect(r.crop).toBe('Tomato');
      expect(r.harvestDateValid).toBe(true);
      expect(r.daysSinceHarvest).toBe(2);
      expect(r.shelfLife).toEqual({ min: 5, max: 10 });
      expect(r.riskLevel).toBeDefined();
      expect(r.guidance).toBeDefined();
      expect(r.provenance.forecast).toBe(false);
      expect(r.provenance.prediction).toBe(false);
      expect(r.classification).toBe('DERIVED');
    });

    test('returns INSUFFICIENT_EVIDENCE for unknown crop', () => {
      const r = perishability.assessPerishability({
        crop: 'Mango',
        harvestDate: '2026-09-08',
        plannedStorageDays: 3,
      });
      expect(r.riskLevel).toBe('INSUFFICIENT_EVIDENCE');
      expect(r.shelfLife).toBeNull();
    });

    test('handles missing harvest date', () => {
      const r = perishability.assessPerishability({
        crop: 'Onion',
        plannedStorageDays: 5,
      });
      expect(r.harvestDateValid).toBe(false);
      expect(r.daysSinceHarvest).toBeNull();
      expect(r.riskLevel).toBe('INSUFFICIENT_EVIDENCE');
    });

    test('handles missing plannedStorageDays', () => {
      const r = perishability.assessPerishability({
        crop: 'Onion',
        harvestDate: '2026-09-05',
      });
      expect(r.plannedStorageDays).toBeNull();
      expect(r.riskLevel).toBe('INSUFFICIENT_EVIDENCE');
    });

    test('rejects future harvest date', () => {
      const r = perishability.assessPerishability({
        crop: 'Onion',
        harvestDate: '2026-09-15',
        plannedStorageDays: 5,
      });
      expect(r.harvestDateValid).toBe(false);
      expect(r.harvestDateError).toBe('future_date');
    });

    test('no forecast or prediction in provenance', () => {
      const r = perishability.assessPerishability({
        crop: 'Soybean',
        harvestDate: '2026-06-01',
        plannedStorageDays: 90,
        referenceDate: TODAY,
      });
      expect(r.provenance.forecast).toBe(false);
      expect(r.provenance.prediction).toBe(false);
    });
  });

  // ── Scenario loss ──────────────────────────────────────────────────────

  describe('computeScenarioLoss', () => {
    test('computes 5% loss on 10q', () => {
      const r = perishability.computeScenarioLoss({ quantityQuintals: 10, lossPercentage: 5 });
      expect(r.ok).toBe(true);
      expect(r.lossAmount).toBe(0.5);
      expect(r.saleableQuantity).toBe(9.5);
      expect(r.source).toBe('SCENARIO');
      expect(r.classification).toBe('SCENARIO');
    });

    test('computes 0% loss', () => {
      const r = perishability.computeScenarioLoss({ quantityQuintals: 10, lossPercentage: 0 });
      expect(r.ok).toBe(true);
      expect(r.lossAmount).toBe(0);
      expect(r.saleableQuantity).toBe(10);
    });

    test('computes 100% loss', () => {
      const r = perishability.computeScenarioLoss({ quantityQuintals: 10, lossPercentage: 100 });
      expect(r.ok).toBe(true);
      expect(r.lossAmount).toBe(10);
      expect(r.saleableQuantity).toBe(0);
    });

    test('rejects negative quantity', () => {
      expect(perishability.computeScenarioLoss({ quantityQuintals: -5, lossPercentage: 10 }).ok).toBe(false);
    });

    test('rejects loss > 100%', () => {
      expect(perishability.computeScenarioLoss({ quantityQuintals: 10, lossPercentage: 150 }).ok).toBe(false);
    });

    test('supports FARMER_ENTERED source', () => {
      const r = perishability.computeScenarioLoss({
        quantityQuintals: 10, lossPercentage: 5, source: 'FARMER_ENTERED',
      });
      expect(r.classification).toBe('FARMER_ENTERED');
    });

    test('note explicitly states hypothetical', () => {
      const r = perishability.computeScenarioLoss({ quantityQuintals: 10, lossPercentage: 5 });
      expect(r.note).toMatch(/hypothetical/i);
    });
  });

  // ── Adversarial tests ──────────────────────────────────────────────────

  describe('adversarial', () => {
    test('extremely old harvest does not crash', () => {
      const r = perishability.assessPerishability({
        crop: 'Tomato',
        harvestDate: '2020-01-01',
        plannedStorageDays: 5,
        referenceDate: TODAY,
      });
      expect(r.daysSinceHarvest).toBeGreaterThan(2000);
      expect(r.riskLevel).toBe('CRITICAL');
    });

    test('0-day harvest age is valid', () => {
      const r = perishability.assessPerishability({
        crop: 'Tomato',
        harvestDate: '2026-09-10',
        plannedStorageDays: 3,
        referenceDate: TODAY,
      });
      expect(r.daysSinceHarvest).toBe(0);
      expect(r.riskLevel).toBeDefined();
    });

    test('negative storage days treated as no storage', () => {
      const r = perishability.assessPerishability({
        crop: 'Tomato',
        harvestDate: '2026-09-08',
        plannedStorageDays: -5,
        referenceDate: TODAY,
      });
      expect(r.plannedStorageDays).toBeNull();
    });

    test('very large storage duration does not crash', () => {
      const r = perishability.assessPerishability({
        crop: 'Onion',
        harvestDate: '2026-09-05',
        plannedStorageDays: 9999,
        referenceDate: TODAY,
      });
      expect(r.riskLevel).toBe('CRITICAL');
    });

    test('fractional storage days are handled', () => {
      const r = perishability.assessPerishability({
        crop: 'Onion',
        harvestDate: '2026-09-05',
        plannedStorageDays: 2.5,
        referenceDate: TODAY,
      });
      expect(r.plannedStorageDays).toBe(2.5);
      expect(r.riskLevel).toBeDefined();
    });

    test('risk level does not appear in pathway decision function source', () => {
      const pathwayFn = require('../../src/services/pathwayDecision').computePathways.toString();
      expect(pathwayFn).not.toContain('weather');
      expect(pathwayFn).not.toContain('temperature');
      expect(pathwayFn).not.toContain('rainfall');
    });

    test('computeStorageThreshold output unchanged (guardrail)', () => {
      const scenario = require('../../src/services/scenario');
      const r = scenario.computeStorageThreshold({
        currentNetPerQuintal: 4800, storageCostPerQuintal: 10, distanceKm: 50, quantityQuintals: 10,
      });
      const json = JSON.stringify(r);
      expect(json).not.toMatch(/loss|shrinkage|wastage/i);
    });

    test('demo data classified as DEMO, not FACT', () => {
      const p = perishability.getPerishabilityProfile('Onion');
      expect(p.classification).toBe('DEMO');
      expect(p.source).toBe('SOURCE_REFERENCE');
    });

    test('no "ICAR" claim without evidence', () => {
      const p = perishability.getPerishabilityProfile('Tomato');
      expect(p.sourceReference).not.toMatch(/^ICAR/);
      expect(p.sourceReference).toMatch(/demo approximation/i);
    });
  });
});
