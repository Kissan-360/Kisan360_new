const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// POST /api/transcribe — Groq Whisper transcription (mobile voice parity)
// Multipart: audio file (field "audio"). Returns { text }.
router.post('/', authenticateUser, upload.single('audio'), async (req, res) => {
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return res.status(503).json({ success: false, error: 'Transcription unavailable (GROQ_API_KEY not configured)', text: null });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Audio file is required (field: audio)' });
    }
    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: req.file.originalname || 'voice.m4a',
      contentType: req.file.mimetype || 'audio/m4a',
    });
    form.append('model', 'whisper-large-v3');
    form.append('language', req.body.language || 'mr');
    const gRes = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${groqKey}` },
      timeout: 30000,
    });
    const text = gRes.data?.text?.trim();
    res.json({ success: true, text: text || '' });
  } catch (e) {
    if (e.response) {
      return res.status(502).json({ success: false, error: 'Groq Whisper error', details: e.response.data?.error?.message || e.message });
    }
    res.status(500).json({ success: false, error: 'Transcription failed' });
  }
});

module.exports = router;
