/**
 * cropGrader.ts — Browser-based crop quality grading using TensorFlow.js
 *
 * Uses a fine-tuned MobileNetV2 model to classify crop images into
 * AGMARK grades (I, II, III) based on visual quality assessment.
 *
 * Architecture:
 *   Photo → MobileNetV2 (224×224, ImageNet-pretrained, fine-tuned) → Grade + Confidence
 *
 * This module handles ONLY the ML inference. Grade calculation (AGMARK thresholds)
 * is done on the backend via /api/grade-assessment.
 * Falls back to rule-based grading if model fails to load (offline, error, etc.)
 */

// ─── Model configuration ───────────────────────────────────────────────────
const MODEL_URL = '/models/crop-grader/model.json';
const INPUT_SIZE = 224;

// Grade mapping: the shipped model is an 18-class freshness grader
// (MobileNetV2 trained on ~23.6k fruit/vegetable photos — 9 crops x fresh/rotten).
// Class order is the alphabetical training order; the browser aggregates
// softmax mass into fresh/rotten groups, then maps to AGMARK visual grades:
// fresh → Grade I, rotten → Grade III. Grade II is reserved for
// questionnaire-measured parameters via the AGMARK rule engine.
const CLASSES = [
  'freshapples', 'freshbanana', 'freshbittergroud', 'freshcapsicum',
  'freshcucumber', 'freshokra', 'freshoranges', 'freshpotato', 'freshtomato',
  'rottenapples', 'rottenbanana', 'rottenbittergroud', 'rottencapsicum',
  'rottencucumber', 'rottenokra', 'rottenoranges', 'rottenpotato', 'rottentomato',
] as const;
const N_FRESH = CLASSES.filter((c) => c.startsWith('fresh')).length; // 9

function aggregateFreshRotten(probs: Float32Array | Int32Array | Uint8Array): { cls: 'fresh' | 'rotten'; prob: number } {
  let pFresh = 0;
  let pRot = 0;
  for (let i = 0; i < probs.length; i++) {
    if (i < N_FRESH) pFresh += probs[i];
    else pRot += probs[i];
  }
  return pFresh >= pRot ? { cls: 'fresh', prob: pFresh } : { cls: 'rotten', prob: pRot };
}

// Parameter estimation ranges per grade (based on AGMARK thresholds)
const GRADE_PARAMS: Record<string, { damage: [number, number]; foreignMatter: [number, number]; confidence: [number, number] }> = {
  I:   { damage: [0.2, 1.0], foreignMatter: [0.1, 0.4], confidence: [85, 100] },
  II:  { damage: [1.0, 2.5], foreignMatter: [0.3, 0.6], confidence: [70, 90] },
  III: { damage: [2.5, 5.0], foreignMatter: [0.5, 1.5], confidence: [60, 80] },
};

// ─── State ─────────────────────────────────────────────────────────────────
let model: any = null; // tf.LayersModel
let loadPromise: Promise<boolean> | null = null;
let modelStatus: 'idle' | 'loading' | 'loaded' | 'failed' = 'idle';

// ─── Public API ────────────────────────────────────────────────────────────

export interface MLResult {
  grade: 'I' | 'II' | 'III';
  confidence: number;        // 0-100
  estimatedDamage: number;   // percentage
  estimatedForeignMatter: number; // percentage
  modelVersion: string;
  inferenceTimeMs: number;
}

export interface GradeWithML {
  mlResult: MLResult | null;
  source: 'ml' | 'rule-based';
}

/**
 * Load the MobileNetV2 crop grader model.
 * Caches in memory — safe to call multiple times.
 * Returns true if model loaded successfully.
 */
export async function loadModel(): Promise<boolean> {
  if (modelStatus === 'loaded') return true;
  if (modelStatus === 'failed') return false;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    modelStatus = 'loading';
    try {
      // Dynamic import to avoid bundling TF.js if not needed
      const tf = await import('@tensorflow/tfjs');

      // Check if model files exist
      const res = await fetch(MODEL_URL);
      if (!res.ok) {
        console.warn(`[cropGrader] Model not found at ${MODEL_URL} — using rule-based fallback`);
        modelStatus = 'failed';
        return false;
      }

      model = await tf.loadGraphModel(MODEL_URL);
      // Warm up with a dummy prediction
      const dummy = tf.zeros([1, INPUT_SIZE, INPUT_SIZE, 3]);
      model.predict(dummy).dispose();
      dummy.dispose();

      modelStatus = 'loaded';
      console.log('[cropGrader] Model loaded successfully');
      return true;
    } catch (err) {
      console.warn('[cropGrader] Model load failed:', err);
      modelStatus = 'failed';
      return false;
    }
  })();

  return loadPromise;
}

/**
 * Analyze a crop image using the ML model.
 * Returns ML inference results only — grade calculation is done on the backend.
 *
 * @param source - HTMLCanvasElement or HTMLImageElement containing the crop photo
 * @returns ML results (grade, confidence, estimated parameters) or null if model not available
 */
export async function analyzeCrop(
  source: HTMLCanvasElement | HTMLImageElement,
): Promise<MLResult | null> {
  return runInference(source);
}

/**
 * Check if the ML model is loaded and ready.
 */
export function isModelLoaded(): boolean {
  return modelStatus === 'loaded';
}

/**
 * Get model loading status.
 */
export function getModelStatus(): string {
  return modelStatus;
}

// ─── Internal ──────────────────────────────────────────────────────────────

async function runInference(source: HTMLCanvasElement | HTMLImageElement): Promise<MLResult | null> {
  if (!model) return null;

  try {
    const tf = await import('@tensorflow/tfjs');

    // Preprocess: resize to 224×224, normalize to [-1, 1]
    let tensor = tf.browser.fromPixels(source);

    // Resize
    tensor = tf.image.resizeBilinear(tensor, [INPUT_SIZE, INPUT_SIZE]);

    // Add batch dimension and normalize
    tensor = tensor.expandDims(0).div(127.5).sub(1);

    // Run inference — 18-class head, aggregated to fresh/rotten
    const prediction = model.predict(tensor) as any;
    const probs = await prediction.data();
    const { cls, prob } = aggregateFreshRotten(probs);

    const grade: 'I' | 'II' | 'III' = cls === 'fresh' ? 'I' : 'III';
    const confidence = Math.round(prob * 100);
    const bestProb = prob;

    // Estimate physical parameters from grade + probability
    const gradeParams = GRADE_PARAMS[grade];
    const damage = lerp(gradeParams.damage[0], gradeParams.damage[1], 1 - bestProb);
    const foreignMatter = lerp(gradeParams.foreignMatter[0], gradeParams.foreignMatter[1], 1 - bestProb);

    // Cleanup tensors
    tensor.dispose();
    prediction.dispose();

    return {
      grade: grade as 'I' | 'II' | 'III',
      confidence,
      estimatedDamage: Math.round(damage * 10) / 10,
      estimatedForeignMatter: Math.round(foreignMatter * 10) / 10,
      modelVersion: 'mobilenetv2-freshness-grader-18class-v1.1',
      inferenceTimeMs: 0, // will be set by caller
    };
  } catch (err) {
    console.warn('[cropGrader] Inference failed:', err);
    return null;
  }
}

/**
 * Linear interpolation between two values.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
