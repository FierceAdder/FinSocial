const express = require('express');
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');
const { mlBaseUrl, genAiBaseUrl } = require('../utils/serviceUrls');

const router = express.Router();

/** ML + Gen-AI readiness (for debugging production — not hardcoded fallbacks). */
router.get('/status', requireAuth, async (_req, res) => {
  const ML_URL = mlBaseUrl();
  const GEN_AI_URL = genAiBaseUrl();
  const out = {
    ml: null,
    genAi: null,
    genAiWire: {
      configured: Boolean(process.env.GEN_AI_SERVICE_URL),
      target: process.env.GEN_AI_SERVICE_URL
        ? 'GEN_AI_SERVICE_URL'
        : `${process.env.GEN_AI_SERVICE_HOST || 'localhost'}:${process.env.GEN_AI_SERVICE_PORT || '5002'}`,
    },
  };

  try {
    const { data } = await axios.get(`${ML_URL}/health`, { timeout: 8000 });
    out.ml = data;
  } catch (e) {
    out.ml = { status: 'error', error: e.message, model_loaded: false };
  }

  try {
    const { data } = await axios.get(`${GEN_AI_URL}/health`, { timeout: 8000 });
    out.genAi = data;
  } catch (e) {
    out.genAi = { status: 'error', error: e.message, llm_ready: false };
  }

  res.json(out);
});

module.exports = router;
