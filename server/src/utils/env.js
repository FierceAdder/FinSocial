/**
 * Fail-fast environment loader.
 * Throws at boot-time if any required variable is missing,
 * so crashes surface early rather than at runtime.
 */
const REQUIRED = [
  'JWT_SECRET',
  'DATABASE_URL',
];

const OPTIONAL_WITH_DEFAULTS = {
  JWT_REFRESH_SECRET: null,
  REDIS_URL: null,
  PORT: '5000',
  NODE_ENV: 'development',
  CORS_ORIGIN: 'http://localhost:5173',
  ML_SERVICE_HOST: 'localhost',
  ML_SERVICE_PORT: '5001',
  ML_SERVICE_URL: null,
  GEN_AI_SERVICE_HOST: 'localhost',
  GEN_AI_SERVICE_PORT: '5002',
  GEN_AI_SERVICE_URL: null,
  SENTRY_DSN: null,
  SENDGRID_API_KEY: null,
  NEWSAPI_KEY: null,
  GEMINI_API_KEY: null,
  ALPHAVANTAGE_API_KEY: null,
};

function loadEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(', ')}\n` +
      'Copy .env.example to .env and fill in the values.'
    );
  }

  // Backfill optional defaults
  for (const [key, defaultVal] of Object.entries(OPTIONAL_WITH_DEFAULTS)) {
    if (!process.env[key] && defaultVal !== null) {
      process.env[key] = defaultVal;
    }
  }
}

module.exports = { loadEnv };
