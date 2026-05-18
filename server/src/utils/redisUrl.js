/**
 * Bull / ioredis connection string.
 * Prefer REDIS_URL (managed Redis, Render, etc.). Fallback: REDIS_HOST + REDIS_PORT for local/Docker.
 */
function getRedisUrl() {
  const fromEnv = process.env.REDIS_URL;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();

  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = process.env.REDIS_PORT || '6379';
  return `redis://${host}:${port}`;
}

module.exports = { getRedisUrl };
