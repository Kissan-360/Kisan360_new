const {
  validateReflectanceInput,
  computeNdvi,
  classifyNdvi,
  buildNdviResult,
  buildNdviContext,
} = require('../../src/services/ndvi');

describe('ndvi', () => {
  test('validation requires red and nir reflectance in [0, 1]', () => {
    expect(validateReflectanceInput({ red: 0.1, nir: 0.3 }).errors).toEqual([]);
    expect(validateReflectanceInput({ red: -0.1, nir: 0.3 }).errors).toHaveLength(1);
    expect(validateReflectanceInput({ red: 0.1, nir: 1.2 }).errors).toHaveLength(1);
    expect(validateReflectanceInput({}).errors).toHaveLength(2);
  });

  test('computes NDVI and handles zero denominator', () => {
    expect(computeNdvi(0.1, 0.3)).toBeCloseTo(0.5, 5);
    expect(computeNdvi(0, 0)).toBeNull();
  });

  test('classifies vegetation bands', () => {
    expect(classifyNdvi(-0.2).id).toBe('water_or_bare');
    expect(classifyNdvi(0.1).id).toBe('very_sparse');
    expect(classifyNdvi(0.3).id).toBe('sparse');
    expect(classifyNdvi(0.5).id).toBe('moderate');
    expect(classifyNdvi(0.8).id).toBe('dense');
  });

  test('buildNdviResult returns provenance and guidance', () => {
    const result = buildNdviResult({ red: 0.1, nir: 0.3, crop: 'Onion', district: 'Nashik' });
    expect(result.ok).toBe(true);
    expect(result.result.ndvi).toBe(0.5);
    expect(result.result.classificationId).toBe('moderate');
    expect(result.result.provenance.method).toMatch(/NDVI/);
    expect(buildNdviResult({ red: 0, nir: 0 }).ok).toBe(false);
  });

  test('context is honest when no satellite provider is configured', () => {
    const context = buildNdviContext({ district: 'Nashik', crop: 'Onion' });
    expect(context.available).toBe(false);
    expect(context.districtKnown).toBe(true);
    expect(context.coords).toMatchObject({ lat: 19.9975, lon: 73.7898 });
    expect(context.requiredEnv).toEqual(['SATELLITE_API_URL', 'SATELLITE_API_KEY']);
    expect(context.thresholds.length).toBeGreaterThanOrEqual(5);
  });
});
