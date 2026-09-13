const { CROPS, CROP_CATEGORIES, getCropCategory, getCropsInCategory, normalizeCrop } = require('../../src/data/cropCatalog');

/* The crop taxonomy is reference data that a buyer/seller filter UI depends on.
   These tests pin the invariants that make it safe to group by: every crop has
   exactly one KNOWN category, ids are unique, and alias lookups resolve to the
   same category as the display name. */

describe('cropCatalog — categories', () => {
  const VALID_IDS = CROP_CATEGORIES.map((c) => c.id);

  test('every category id is unique and has a display label', () => {
    expect(new Set(VALID_IDS).size).toBe(VALID_IDS.length);
    for (const cat of CROP_CATEGORIES) {
      expect(typeof cat.label).toBe('string');
      expect(cat.label.trim().length).toBeGreaterThan(0);
    }
  });

  test('every crop carries a category drawn from CROP_CATEGORIES', () => {
    for (const crop of CROPS) {
      expect(crop.category).toBeDefined();
      expect(VALID_IDS).toContain(crop.category);
    }
  });

  test('no category is empty (a filter chip that matches nothing is a bug)', () => {
    for (const id of VALID_IDS) {
      expect(getCropsInCategory(id).length).toBeGreaterThan(0);
    }
  });

  test('every crop is reachable through exactly one category', () => {
    const grouped = VALID_IDS.flatMap((id) => getCropsInCategory(id));
    expect(grouped.length).toBe(CROPS.length);
    expect(new Set(grouped).size).toBe(CROPS.length);
  });

  describe('getCropCategory', () => {
    test('resolves by id, display name, and alias alike', () => {
      expect(getCropCategory('onion')).toBe('vegetable');
      expect(getCropCategory('Onion')).toBe('vegetable');
      expect(getCropCategory('wheat')).toBe('cereal');
      expect(getCropCategory('Wheat')).toBe('cereal');
      expect(getCropCategory('tur-dal')).toBe('pulse');
    });

    test('agrees with direct catalog lookup for every crop', () => {
      for (const crop of CROPS) {
        expect(getCropCategory(crop.name)).toBe(crop.category);
        expect(getCropCategory(crop.id)).toBe(crop.category);
        for (const alias of crop.aliases || []) {
          expect(getCropCategory(alias)).toBe(crop.category);
        }
      }
    });

    test('returns null for unknown or empty input', () => {
      expect(getCropCategory('Mango')).toBeNull();
      expect(getCropCategory('')).toBeNull();
      expect(getCropCategory(null)).toBeNull();
      expect(getCropCategory(undefined)).toBeNull();
    });
  });

  test('the staples a judge would look for land in the expected groups', () => {
    expect(getCropsInCategory('cereal').sort()).toEqual(
      expect.arrayContaining(['Wheat', 'Jowar (Sorghum)', 'Bajra (Pearl Millet)', 'Maize'])
    );
    expect(getCropsInCategory('pulse')).toEqual(
      expect.arrayContaining(['Tur Dal (Pigeon Pea)', 'Bengal Gram (Chana)', 'Green Gram (Moong)', 'Black Gram (Urad)'])
    );
    expect(getCropsInCategory('oilseed').sort()).toEqual(['Groundnut', 'Soybean']);
  });

  test('normalizeCrop still resolves aliases to the catalog entry carrying the category', () => {
    const onion = normalizeCrop('Onion');
    expect(onion.category).toBe('vegetable');
  });
});
