/** Base URLs for internal HTTP calls (Docker, local, or split HTTPS on Render, etc.). */

function trimTrailingSlash(u) {
  return (u || '').replace(/\/+$/, '');
}

function mlBaseUrl() {
  const fromEnv = process.env.ML_SERVICE_URL;
  if (fromEnv) return trimTrailingSlash(fromEnv);
  const host = process.env.ML_SERVICE_HOST || 'localhost';
  const port = process.env.ML_SERVICE_PORT || '5001';
  return `http://${host}:${port}`;
}

function genAiBaseUrl() {
  const fromEnv = process.env.GEN_AI_SERVICE_URL;
  if (fromEnv) return trimTrailingSlash(fromEnv);
  const host = process.env.GEN_AI_SERVICE_HOST || 'localhost';
  const port = process.env.GEN_AI_SERVICE_PORT || '5002';
  return `http://${host}:${port}`;
}

module.exports = { mlBaseUrl, genAiBaseUrl };
