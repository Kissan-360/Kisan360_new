/**
 * AGMARK Grade Calculation Engine
 *
 * Deterministic rule-based grading per crop using official AGMARK thresholds.
 * No ML, no LLM — pure threshold mapping. Every output is auditable.
 *
 * Sources:
 *   - DMI (Directorate of Marketing and Inspection) grade standards
 *   - e-NAM tradable parameter ranges
 *   - BIS Indian Standards (IS 1981 wheat, IS 6373 rice, etc.)
 */

const AGMARK_GRADES = {
  soybean: {
    parameters: ['oilContent', 'moisture', 'damage', 'foreignMatter', 'immature', 'splits'],
    grades: [
      {
        grade: 'I',
        label: 'Grade I (Special)',
        thresholds: { oilContent: 20, moisture: 10, damage: 1, foreignMatter: 0.5, immature: 2, splits: 5 },
        direction: { oilContent: 'min', moisture: 'max', damage: 'max', foreignMatter: 'max', immature: 'max', splits: 'max' },
        priceRange: { min: 4800, max: 5200 },
        description: 'Premium quality — high oil content, minimal damage. Best price realization.',
      },
      {
        grade: 'II',
        label: 'Grade II',
        thresholds: { oilContent: 18, moisture: 12, damage: 2, foreignMatter: 0.5, immature: 3, splits: 10 },
        direction: { oilContent: 'min', moisture: 'max', damage: 'max', foreignMatter: 'max', immature: 'max', splits: 'max' },
        priceRange: { min: 4500, max: 4800 },
        description: 'Good quality — acceptable for most buyers. Standard market price.',
      },
      {
        grade: 'III',
        label: 'Grade III',
        thresholds: { oilContent: 15, moisture: 12, damage: 3, foreignMatter: 0.5, immature: 5, splits: 20 },
        direction: { oilContent: 'min', moisture: 'max', damage: 'max', foreignMatter: 'max', immature: 'max', splits: 'max' },
        priceRange: { min: 4100, max: 4500 },
        description: 'Below average — higher damage or lower oil content. Reduced price.',
      },
    ],
  },
  wheat: {
    parameters: ['foreignMatter', 'damaged', 'weevilled', 'moisture', 'immature'],
    grades: [
      {
        grade: 'I',
        label: 'Grade I',
        thresholds: { foreignMatter: 1.5, damaged: 1, weevilled: 1, moisture: 12, immature: 2 },
        direction: { foreignMatter: 'max', damaged: 'max', weevilled: 'max', moisture: 'max', immature: 'max' },
        priceRange: { min: 2400, max: 2650 },
        description: 'Premium quality — clean, minimal damage. Best price.',
      },
      {
        grade: 'II',
        label: 'Grade II',
        thresholds: { foreignMatter: 2.5, damaged: 2, weevilled: 3, moisture: 12, immature: 4 },
        direction: { foreignMatter: 'max', damaged: 'max', weevilled: 'max', moisture: 'max', immature: 'max' },
        priceRange: { min: 2200, max: 2400 },
        description: 'Good quality — standard market grade.',
      },
      {
        grade: 'III',
        label: 'Grade III',
        thresholds: { foreignMatter: 3.5, damaged: 4, weevilled: 6, moisture: 12, immature: 10 },
        direction: { foreignMatter: 'max', damaged: 'max', weevilled: 'max', moisture: 'max', immature: 'max' },
        priceRange: { min: 2000, max: 2200 },
        description: 'Below average — higher defects. Reduced price.',
      },
    ],
  },
  paddy: {
    parameters: ['foreignMatter', 'admixture', 'damaged', 'moisture'],
    grades: [
      {
        grade: 'I',
        label: 'Grade I',
        thresholds: { foreignMatter: 1, admixture: 5, damaged: 1, moisture: 14 },
        direction: { foreignMatter: 'max', admixture: 'max', damaged: 'max', moisture: 'max' },
        priceRange: { min: 2100, max: 2350 },
        description: 'Premium paddy — clean, well-dried. Best MSP eligibility.',
      },
      {
        grade: 'II',
        label: 'Grade II',
        thresholds: { foreignMatter: 2, admixture: 10, damaged: 2, moisture: 14 },
        direction: { foreignMatter: 'max', admixture: 'max', damaged: 'max', moisture: 'max' },
        priceRange: { min: 1950, max: 2100 },
        description: 'Good quality — standard grade.',
      },
      {
        grade: 'III',
        label: 'Grade III',
        thresholds: { foreignMatter: 4, admixture: 15, damaged: 5, moisture: 14 },
        direction: { foreignMatter: 'max', admixture: 'max', damaged: 'max', moisture: 'max' },
        priceRange: { min: 1800, max: 1950 },
        description: 'Below average — higher admixture or damage.',
      },
    ],
  },
  cotton: {
    parameters: ['stapleLength', 'micronaire', 'fiberStrength', 'trashContent', 'color'],
    grades: [
      {
        grade: 'I',
        label: 'Grade I (Fine)',
        thresholds: { stapleLength: 28, micronaire: 4.5, fiberStrength: 30, trashContent: 3, color: 80 },
        direction: { stapleLength: 'min', micronaire: 'range', fiberStrength: 'min', trashContent: 'max', color: 'min' },
        micronaireRange: [3.5, 4.9],
        priceRange: { min: 6800, max: 7500 },
        description: 'Fine quality — long staple, strong fiber. Premium price.',
      },
      {
        grade: 'II',
        label: 'Grade II (Medium)',
        thresholds: { stapleLength: 24, micronaire: 5.5, fiberStrength: 26, trashContent: 6, color: 60 },
        direction: { stapleLength: 'min', micronaire: 'range', fiberStrength: 'min', trashContent: 'max', color: 'min' },
        micronaireRange: [4.0, 6.0],
        priceRange: { min: 6200, max: 6800 },
        description: 'Medium quality — standard market grade.',
      },
      {
        grade: 'III',
        label: 'Grade III (Below Average)',
        thresholds: { stapleLength: 20, micronaire: 7.0, fiberStrength: 24, trashContent: 10, color: 40 },
        direction: { stapleLength: 'min', micronaire: 'range', fiberStrength: 'min', trashContent: 'max', color: 'min' },
        micronaireRange: [5.0, 7.5],
        priceRange: { min: 5500, max: 6200 },
        description: 'Below average — shorter staple or higher trash.',
      },
    ],
  },
  onion: {
    parameters: ['size', 'damage', 'foreignMatter', 'moisture'],
    grades: [
      {
        grade: 'I',
        label: 'Grade I',
        thresholds: { size: 50, damage: 1, foreignMatter: 0.5, moisture: 85 },
        direction: { size: 'min', damage: 'max', foreignMatter: 'max', moisture: 'max' },
        priceRange: { min: 1800, max: 2500 },
        description: 'Premium — large bulbs, minimal damage. Best price.',
      },
      {
        grade: 'II',
        label: 'Grade II',
        thresholds: { size: 35, damage: 3, foreignMatter: 1, moisture: 88 },
        direction: { size: 'min', damage: 'max', foreignMatter: 'max', moisture: 'max' },
        priceRange: { min: 1400, max: 1800 },
        description: 'Good quality — medium bulbs, standard market grade.',
      },
      {
        grade: 'III',
        label: 'Grade III',
        thresholds: { size: 25, damage: 5, foreignMatter: 2, moisture: 90 },
        direction: { size: 'min', damage: 'max', foreignMatter: 'max', moisture: 'max' },
        priceRange: { min: 1000, max: 1400 },
        description: 'Below average — small or damaged bulbs.',
      },
    ],
  },
  tomato: {
    parameters: ['size', 'damage', 'foreignMatter', 'color'],
    grades: [
      {
        grade: 'I',
        label: 'Grade I',
        thresholds: { size: 55, damage: 1, foreignMatter: 0.5, color: 80 },
        direction: { size: 'min', damage: 'max', foreignMatter: 'max', color: 'min' },
        priceRange: { min: 1500, max: 2200 },
        description: 'Premium — large, fully colored, minimal damage.',
      },
      {
        grade: 'II',
        label: 'Grade II',
        thresholds: { size: 40, damage: 3, foreignMatter: 1, color: 60 },
        direction: { size: 'min', damage: 'max', foreignMatter: 'max', color: 'min' },
        priceRange: { min: 1100, max: 1500 },
        description: 'Good quality — standard market grade.',
      },
      {
        grade: 'III',
        label: 'Grade III',
        thresholds: { size: 30, damage: 5, foreignMatter: 2, color: 40 },
        direction: { size: 'min', damage: 'max', foreignMatter: 'max', color: 'min' },
        priceRange: { min: 700, max: 1100 },
        description: 'Below average — small or damaged.',
      },
    ],
  },
  grape: {
    parameters: ['size', 'damage', 'sugarContent', 'color'],
    grades: [
      {
        grade: 'I',
        label: 'Grade I (Export)',
        thresholds: { size: 16, damage: 0.5, sugarContent: 18, color: 80 },
        direction: { size: 'min', damage: 'max', sugarContent: 'min', color: 'min' },
        priceRange: { min: 4500, max: 6000 },
        description: 'Export quality — large berries, high sugar, uniform color.',
      },
      {
        grade: 'II',
        label: 'Grade II',
        thresholds: { size: 13, damage: 2, sugarContent: 15, color: 60 },
        direction: { size: 'min', damage: 'max', sugarContent: 'min', color: 'min' },
        priceRange: { min: 3500, max: 4500 },
        description: 'Good quality — domestic market standard.',
      },
      {
        grade: 'III',
        label: 'Grade III',
        thresholds: { size: 10, damage: 4, sugarContent: 12, color: 40 },
        direction: { size: 'min', damage: 'max', sugarContent: 'min', color: 'min' },
        priceRange: { min: 2500, max: 3500 },
        description: 'Below average — smaller or less colored.',
      },
    ],
  },
};

const PARAMETER_LABELS = {
  oilContent: { label: 'Oil Content', unit: '%', description: 'Minimum oil content on dry basis (higher = better for oilseeds)' },
  moisture: { label: 'Moisture', unit: '%', description: 'Maximum moisture content (lower = better, prevents spoilage)' },
  damage: { label: 'Damaged Grains', unit: '%', description: 'Maximum damaged/discoloured/insect-infested grains' },
  foreignMatter: { label: 'Foreign Matter', unit: '%', description: 'Maximum inorganic + organic foreign matter' },
  immature: { label: 'Immature/Shrivelled', unit: '%', description: 'Maximum immature or shrivelled grains' },
  splits: { label: 'Splits/Brokens', unit: '%', description: 'Maximum split or broken grains' },
  weevilled: { label: 'Weevilled Grains', unit: '%', description: 'Maximum insect-damaged grains' },
  admixture: { label: 'Admixture', unit: '%', description: 'Maximum admixture of other varieties' },
  stapleLength: { label: 'Staple Length', unit: 'mm', description: 'Minimum fiber length (longer = better for cotton)' },
  micronaire: { label: 'Micronaire', unit: '', description: 'Fiber fineness/maturity (ideal: 3.5-4.9 for cotton)' },
  fiberStrength: { label: 'Fiber Strength', unit: 'g/tex', description: 'Minimum fiber strength' },
  trashContent: { label: 'Trash Content', unit: '%', description: 'Maximum trash/foreign matter in lint' },
  color: { label: 'Color Score', unit: '/100', description: 'Visual color uniformity (higher = more uniform)' },
  size: { label: 'Size', unit: 'mm', description: 'Minimum diameter/size (larger = better)' },
  sugarContent: { label: 'Sugar Content', unit: '°Brix', description: 'Minimum sugar content (sweeter = better)' },
};

/**
 * Calculate AGMARK grade for a given crop and parameters.
 *
 * @param {string} crop - Crop name (lowercase: 'soybean', 'wheat', etc.)
 * @param {object} params - Measured parameters (e.g. { moisture: 9, damage: 1.5, ... })
 * @returns {object} Grade result with grade, parameters, price range, AGMARK reference
 */
function calculateGrade(crop, params) {
  const cropKey = crop.toLowerCase().replace(/\s+/g, '');
  const cropGrades = AGMARK_GRADES[cropKey];

  if (!cropGrades) {
    return {
      grade: null,
      label: 'Unknown Crop',
      error: `Crop "${crop}" is not supported for grading. Supported crops: ${Object.keys(AGMARK_GRADES).join(', ')}`,
      supportedCrops: Object.keys(AGMARK_GRADES),
    };
  }

  // Determine the best matching grade
  let matchedGrade = null;
  let gradeIndex = -1;

  for (let i = 0; i < cropGrades.grades.length; i++) {
    const g = cropGrades.grades[i];
    let passes = true;

    for (const param of cropGrades.parameters) {
      const value = params[param];
      if (value == null) continue; // skip unspecified params

      const threshold = g.thresholds[param];
      const direction = g.direction[param];

      if (direction === 'min' && value < threshold) { passes = false; break; }
      if (direction === 'max' && value > threshold) { passes = false; break; }
      if (direction === 'range' && g.micronaireRange) {
        if (value < g.micronaireRange[0] || value > g.micronaireRange[1]) { passes = false; break; }
      }
    }

    if (passes) {
      matchedGrade = g;
      gradeIndex = i;
      break; // first (best) passing grade
    }
  }

  // If no grade passes, assign lowest
  if (!matchedGrade) {
    matchedGrade = cropGrades.grades[cropGrades.grades.length - 1];
    gradeIndex = cropGrades.grades.length - 1;
  }

  // Build per-parameter analysis
  const parameterAnalysis = cropGrades.parameters.map(param => {
    const value = params[param];
    const meta = PARAMETER_LABELS[param] || { label: param, unit: '' };
    const threshold = matchedGrade.thresholds[param];
    const direction = matchedGrade.direction[param];

    let status = 'unknown';
    let detail = '';

    if (value != null) {
      if (direction === 'min') {
        status = value >= threshold ? 'pass' : 'fail';
        detail = `${meta.label}: ${value}${meta.unit} (min ${threshold}${meta.unit} for Grade ${matchedGrade.grade})`;
      } else if (direction === 'max') {
        status = value <= threshold ? 'pass' : 'fail';
        detail = `${meta.label}: ${value}${meta.unit} (max ${threshold}${meta.unit} for Grade ${matchedGrade.grade})`;
      } else if (direction === 'range' && matchedGrade.micronaireRange) {
        const [lo, hi] = matchedGrade.micronaireRange;
        status = value >= lo && value <= hi ? 'pass' : 'fail';
        detail = `${meta.label}: ${value} (ideal range ${lo}-${hi} for Grade ${matchedGrade.grade})`;
      }
    } else {
      status = 'unknown';
      detail = `${meta.label}: not measured`;
    }

    return { param, label: meta.label, unit: meta.unit, value, threshold, direction, status, detail, description: meta.description };
  });

  const passedCount = parameterAnalysis.filter(p => p.status === 'pass').length;
  const measuredCount = parameterAnalysis.filter(p => p.status !== 'unknown').length;

  return {
    grade: matchedGrade.grade,
    label: matchedGrade.label,
    crop: cropKey,
    priceRange: matchedGrade.priceRange,
    description: matchedGrade.description,
    parameters: parameterAnalysis,
    confidence: measuredCount > 0 ? Math.round((passedCount / measuredCount) * 100) : 0,
    gradeIndex,
    totalGrades: cropGrades.grades.length,
    agmarkRef: {
      act: 'Agricultural Produce (Grading and Marking) Act, 1937',
      authority: 'Directorate of Marketing and Inspection (DMI)',
      website: 'https://dmi.gov.in',
      note: 'AGMARK grading is voluntary for most commodities. Grade shown is based on DMI-published thresholds.',
    },
  };
}

/**
 * Get all supported crops and their grade ranges.
 */
function getSupportedCrops() {
  return Object.entries(AGMARK_GRADES).map(([crop, data]) => ({
    crop,
    parameters: data.parameters,
    grades: data.grades.map(g => ({ grade: g.grade, label: g.label, priceRange: g.priceRange })),
  }));
}

/**
 * Get AGMARK grade thresholds for a specific crop (for display/reference).
 */
function getGradeReference(crop) {
  const cropKey = crop.toLowerCase().replace(/\s+/g, '');
  const data = AGMARK_GRADES[cropKey];
  if (!data) return null;

  return {
    crop: cropKey,
    parameters: data.parameters.map(p => ({
      ...PARAMETER_LABELS[p],
      param: p,
    })),
    grades: data.grades.map(g => ({
      grade: g.grade,
      label: g.label,
      thresholds: g.thresholds,
      direction: g.direction,
      priceRange: g.priceRange,
      description: g.description,
    })),
  };
}

module.exports = { calculateGrade, getSupportedCrops, getGradeReference, AGMARK_GRADES, PARAMETER_LABELS };
