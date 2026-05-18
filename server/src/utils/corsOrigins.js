/**
 * Shared CORS allowlist for Express and Socket.IO.
 * - Comma-separated origins; `*` allows any origin by reflecting the request Origin
 *   (required when credentials: true — browsers reject Allow-Origin: * with credentials).
 */
function parseList(raw) {
  return (raw || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function createOriginCallback(rawEnv) {
  const allowedOrigins = parseList(rawEnv);
  const allowAnyOrigin = allowedOrigins.includes('*');
  return (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowAnyOrigin) return callback(null, origin);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  };
}

module.exports = { createOriginCallback, parseList };
