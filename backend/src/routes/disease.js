const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');
const { authenticateUser } = require('../middleware/auth');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max upload
});

const DISEASE_INFO = {
  'Apple Scab': { severity: 'High', treatment: 'Apply fungicide (captan or sulfur) at 7-10 day intervals', recommendations: ['Remove infected leaves', 'Improve air circulation', 'Avoid overhead watering'] },
  'Apple with Black Rot': { severity: 'High', treatment: 'Prune infected branches; apply fungicide', recommendations: ['Remove mummified fruits', 'Prune during dormancy', 'Apply protective fungicides'] },
  'Cedar Apple Rust': { severity: 'Medium', treatment: 'Apply fungicide containing myclobutanil', recommendations: ['Remove nearby cedar trees', 'Apply fungicide early season', 'Resistant varieties help'] },
  'Healthy Apple': { severity: 'None', treatment: 'No treatment required', recommendations: ['Continue regular monitoring', 'Maintain current care practices'] },
  'Healthy Blueberry Plant': { severity: 'None', treatment: 'No treatment required', recommendations: ['Continue regular monitoring', 'Maintain acidic soil pH 4.5-5.5'] },
  'Cherry with Powdery Mildew': { severity: 'Medium', treatment: 'Apply sulfur-based fungicide', recommendations: ['Improve airflow through pruning', 'Avoid overhead irrigation', 'Apply fungicide at first sign'] },
  'Healthy Cherry Plant': { severity: 'None', treatment: 'No treatment required', recommendations: ['Continue regular monitoring', 'Maintain current care practices'] },
  'Corn (Maize) with Cercospora and Gray Leaf Spot': { severity: 'High', treatment: 'Apply fungicide (strobilurin or triazole)', recommendations: ['Rotate crops', 'Use resistant hybrids', 'Practice residue management'] },
  'Corn (Maize) with Common Rust': { severity: 'Medium', treatment: 'Apply fungicide if severe; plant resistant hybrids', recommendations: ['Use resistant varieties', 'Early planting', 'Monitor regularly'] },
  'Corn (Maize) with Northern Leaf Blight': { severity: 'High', treatment: 'Apply fungicide at silking stage', recommendations: ['Rotate crops', 'Use resistant hybrids', 'Crop residue management'] },
  'Healthy Corn (Maize) Plant': { severity: 'None', treatment: 'No treatment required', recommendations: ['Continue regular monitoring', 'Maintain current care practices'] },
  'Grape with Black Rot': { severity: 'High', treatment: 'Apply fungicide from pre-bloom through harvest', recommendations: ['Remove mummified berries', 'Improve canopy management', 'Apply protectant fungicides'] },
  'Grape with Esca (Black Measles)': { severity: 'High', treatment: 'No effective cure; remove affected vines', recommendations: ['Prune infected wood', 'Avoid wounding vines', 'Replace severely affected vines'] },
  'Grape with Isariopsis Leaf Spot': { severity: 'Medium', treatment: 'Apply copper-based fungicide', recommendations: ['Remove infected leaves', 'Improve air circulation', 'Apply fungicide preventatively'] },
  'Healthy Grape Plant': { severity: 'None', treatment: 'No treatment required', recommendations: ['Continue regular monitoring', 'Maintain current care practices'] },
  'Orange with Citrus Greening': { severity: 'Critical', treatment: 'No cure; remove infected trees to prevent spread', recommendations: ['Remove infected trees immediately', 'Control psyllid vectors', 'Use certified disease-free plants'] },
  'Peach with Bacterial Spot': { severity: 'High', treatment: 'Apply copper-based bactericide', recommendations: ['Plant resistant varieties', 'Apply dormant spray', 'Avoid overhead irrigation'] },
  'Healthy Peach Plant': { severity: 'None', treatment: 'No treatment required', recommendations: ['Continue regular monitoring', 'Maintain current care practices'] },
  'Bell Pepper with Bacterial Spot': { severity: 'High', treatment: 'Apply copper fungicide; remove infected plants', recommendations: ['Use disease-free seeds', 'Crop rotation', 'Avoid working with wet plants'] },
  'Healthy Bell Pepper Plant': { severity: 'None', treatment: 'No treatment required', recommendations: ['Continue regular monitoring', 'Maintain current care practices'] },
  'Potato with Early Blight': { severity: 'Medium', treatment: 'Apply fungicide (chlorothalonil or mancozeb)', recommendations: ['Rotate crops (2-3 year cycle)', 'Avoid overhead irrigation', 'Remove infected foliage'] },
  'Potato with Late Blight': { severity: 'Critical', treatment: 'Apply metalaxyl/mancozeb immediately', recommendations: ['Destroy infected plants', 'Avoid planting near infected fields', 'Use certified disease-free seed potatoes'] },
  'Healthy Potato Plant': { severity: 'None', treatment: 'No treatment required', recommendations: ['Continue regular monitoring', 'Maintain current care practices'] },
  'Healthy Raspberry Plant': { severity: 'None', treatment: 'No treatment required', recommendations: ['Continue regular monitoring', 'Maintain current care practices'] },
  'Healthy Soybean Plant': { severity: 'None', treatment: 'No treatment required', recommendations: ['Continue regular monitoring', 'Maintain current care practices'] },
  'Squash with Powdery Mildew': { severity: 'Medium', treatment: 'Apply sulfur or neem oil fungicide', recommendations: ['Improve air circulation', 'Avoid overhead watering', 'Apply fungicide at first sign'] },
  'Strawberry with Leaf Scorch': { severity: 'Medium', treatment: 'Apply fungicide; remove infected leaves', recommendations: ['Remove infected leaves', 'Improve drainage', 'Practice crop rotation'] },
  'Healthy Strawberry Plant': { severity: 'None', treatment: 'No treatment required', recommendations: ['Continue regular monitoring', 'Maintain current care practices'] },
  'Tomato with Bacterial Spot': { severity: 'High', treatment: 'Apply copper-based bactericide', recommendations: ['Use disease-free seeds/seedlings', 'Avoid overhead watering', 'Crop rotation'] },
  'Tomato with Early Blight': { severity: 'Medium', treatment: 'Apply fungicide (chlorothalonil or copper)', recommendations: ['Mulch around plants', 'Water at soil level', 'Rotate crops (3+ years)'] },
  'Tomato with Late Blight': { severity: 'Critical', treatment: 'Apply fungicide immediately; remove infected plants', recommendations: ['Destroy infected plants immediately', 'Avoid planting near potatoes', 'Use resistant varieties'] },
  'Tomato with Leaf Mold': { severity: 'Medium', treatment: 'Improve ventilation; apply fungicide', recommendations: ['Reduce humidity in greenhouse', 'Space plants farther apart', 'Water in morning'] },
  'Tomato with Septoria Leaf Spot': { severity: 'Medium', treatment: 'Apply fungicide (copper or chlorothalonil)', recommendations: ['Remove lower infected leaves', 'Mulch to prevent soil splash', 'Rotate crops'] },
  'Tomato with Spider Mites or Two-spotted Spider Mite': { severity: 'Medium', treatment: 'Apply miticide or insecticidal soap', recommendations: ['Keep plants well-watered', 'Introduce predatory mites', 'Avoid broad-spectrum pesticides'] },
  'Tomato with Target Spot': { severity: 'Medium', treatment: 'Apply fungicide (chlorothalonil)', recommendations: ['Improve air circulation', 'Avoid overhead watering', 'Remove infected plant debris'] },
  'Tomato Yellow Leaf Curl Virus': { severity: 'High', treatment: 'No cure; control whitefly vectors', recommendations: ['Control whitefly populations', 'Use reflective mulch', 'Remove infected plants'] },
  'Tomato Mosaic Virus': { severity: 'High', treatment: 'No cure; remove infected plants', recommendations: ['Wash hands before handling', 'Use resistant varieties', 'Remove and destroy infected plants'] },
  'Healthy Tomato Plant': { severity: 'None', treatment: 'No treatment required', recommendations: ['Continue regular monitoring', 'Maintain current care practices'] },
};

function validateBase64(str) {
  const base64Regex = /^data:image\/(png|jpg|jpeg|webp);base64,/;
  return base64Regex.test(str);
}

function stripBase64Prefix(data) {
  return data.replace(/^data:image\/\w+;base64,/, '');
}

// Cloud fallback: when the dedicated disease CNN (:8000, torch — too heavy
// for free-tier hosting, deliberately not deployed) is unreachable, ask a
// vision LLM to read the leaf photo instead. Same response contract, flagged
// with source:'groq-vision' so the UI can label it honestly. Returns null
// when no key is configured or the call fails — the caller then keeps its
// existing honest 503.
const GROQ_VISION_MODELS = ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.2-90b-vision-preview'];
async function groqVisionDetect(imageBuffer, cropType) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;
  const labels = Object.keys(DISEASE_INFO).join(' | ');
  const prompt = [
    'You are a plant pathologist examining a farmer\'s leaf photo.',
    `The farmer grows: ${cropType || 'unknown'}.`,
    'If the image is NOT a plant/leaf photo, respond {"isPlant": false}.',
    `Otherwise pick EXACTLY ONE label from this list (copy it verbatim): ${labels}.`,
    'Prefer labels matching the farmer\'s crop. Respond with ONLY valid JSON, no other text:',
    '{"isPlant": true, "label": "<exact label>", "confidence": 0-100}',
  ].join(' ');
  const b64 = imageBuffer.toString('base64');
  for (const model of GROQ_VISION_MODELS) {
    try {
      const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ],
        }],
        max_tokens: 256,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }, {
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        timeout: 25000,
      });
      const raw = res.data?.choices?.[0]?.message?.content?.trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed.isPlant === false) return { notPlant: true };
      const label = typeof parsed.label === 'string' ? parsed.label.trim() : '';
      if (!label || !DISEASE_INFO[label]) continue;
      // The CNN contract is a 0–1 fraction (the page multiplies by 100), so
      // the fallback speaks the same scale — never 1–99 integers.
      let confidence = Math.round(Number(parsed.confidence)) / 100;
      if (!Number.isFinite(confidence)) confidence = 0.7;
      confidence = Math.max(0.01, Math.min(0.99, confidence));
      return { disease: label, confidence };
    } catch {
      // Try the next model, else fall through to the honest 503.
    }
  }
  return null;
}

// POST /api/disease/detect - Analyze crop image for disease detection
// Accepts either: multipart file upload OR JSON with base64 imageData
router.post('/detect', authenticateUser, upload.single('image'), async (req, res) => {
  try {
    let imageBuffer;
    let originalFilename = 'uploaded_image.jpg';

    if (req.file) {
      imageBuffer = req.file.buffer;
      originalFilename = req.file.originalname || originalFilename;
    } else if (req.body && req.body.imageData) {
      let raw = req.body.imageData;
      if (validateBase64(raw)) {
        raw = stripBase64Prefix(raw);
      }
      imageBuffer = Buffer.from(raw, 'base64');
      originalFilename = req.body.cropType
        ? `${req.body.cropType}_leaf.jpg`
        : 'uploaded_image.jpg';
    } else {
      return res.status(400).json({
        error: 'Image is required. Send as multipart file (field: "image") or base64 in JSON (field: "imageData")'
      });
    }

    if (!imageBuffer || imageBuffer.length < 100) {
      return res.status(400).json({ error: 'Image data is too small or empty' });
    }

    const form = new FormData();
    form.append('file', imageBuffer, {
      filename: originalFilename,
      contentType: 'image/jpeg',
    });

    let mlResponse;
    let source = 'disease-cnn';
    try {
      mlResponse = await axios.post(`${ML_SERVICE_URL}/predict`, form, {
        headers: form.getHeaders(),
        timeout: 30000,
      });
    } catch (mlErr) {
      const deadService = mlErr.code === 'ECONNREFUSED'
        || (typeof mlErr.message === 'string' && /timeout/i.test(mlErr.message))
        || mlErr.response?.status === 502;
      if (!deadService) throw mlErr;
      // The dedicated CNN isn't deployed — try cloud vision before admitting
      // defeat. Same contract, flagged source so the UI stays honest.
      const fallback = await groqVisionDetect(imageBuffer, req.body?.cropType);
      if (!fallback) {
        return res.status(503).json({
          error: 'ML service unavailable',
          message: 'The disease detection service is not running. Start it with: cd ml-service && python -m uvicorn main:app --port 8000',
          mlServiceStatus: 'offline',
        });
      }
      if (fallback.notPlant) {
        return res.status(422).json({
          error: 'not_a_plant',
          message: 'This image does not appear to be a plant leaf. Please upload a clear photo of the affected crop leaf (leaf surface, well-lit, centered).',
          source: 'groq-vision',
        });
      }
      mlResponse = {
        data: {
          disease: fallback.disease,
          confidence: fallback.confidence,
          likely_plant: true,
          entropy: null,
          top5_predictions: null,
          latency_seconds: null,
        },
      };
      source = 'groq-vision';
    }

    const { disease, confidence, likely_plant, entropy, top5_predictions, latency_seconds } = mlResponse.data;

    // OOD check: reject images that don't look like a plant leaf
    if (!likely_plant) {
      return res.status(422).json({
        error: 'not_a_plant',
        message: 'This image does not appear to be a plant leaf. Please upload a clear photo of the affected crop leaf (leaf surface, well-lit, centered).',
        confidence,
        entropy,
        top5Predictions: top5_predictions,
      });
    }

    const info = DISEASE_INFO[disease] || {
      severity: 'Unknown',
      treatment: 'Consult a local agricultural extension officer',
      recommendations: ['Consult a plant pathologist for accurate diagnosis and treatment'],
    };

    const cropType = req.body?.cropType || disease.split(' with ')[0]?.split('Healthy ')[1] || disease.split(' ')[0] || 'Unknown';

    // Crop mismatch check: warn if user said tomato but model predicts apple
    if (req.body?.cropType) {
      const userCrop = req.body.cropType.toLowerCase();
      const predictedCrop = disease.toLowerCase();
      const cropMatch = [userCrop, userCrop + 's', userCrop + ' plant', 'healthy ' + userCrop].some(
        term => predictedCrop.includes(term)
      );
      if (!cropMatch) {
        return res.status(422).json({
          error: 'crop_mismatch',
          message: `You selected "${req.body.cropType}" but the image looks like it belongs to a different plant (${disease}). Please upload a photo of a ${req.body.cropType} leaf.`,
          detectedDisease: disease,
          confidence,
          top5Predictions: top5_predictions,
        });
      }
    }

    res.json({
      cropType,
      detectedDisease: disease,
      confidence,
      recommendations: info.recommendations,
      severity: info.severity,
      treatment: info.treatment,
      top5Predictions: top5_predictions,
      mlLatency: latency_seconds,
      timestamp: new Date().toISOString(),
      source,
    });
  } catch (error) {
    console.error('Disease detection error:', error.message);
    if (error.response) {
      return res.status(502).json({
        error: 'ML service error',
      });
    }
    res.status(500).json({ error: 'Failed to detect disease' });
  }
});

module.exports = router;
