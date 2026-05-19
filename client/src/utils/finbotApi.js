const DEFAULT_CONNECT_ERROR =
  'FinBot could not reach the core API (POST /api/tribe/finbot). gen-ai /health only checks the AI service — you also need core-api running. Locally: set VITE_DEV_BACKEND=http://localhost:5000 (Express) or :9999 (docker compose nginx), then restart Vite.';

export function unexpectedFinbotResponse() {
  return {
    reply:
      'The server responded but without a FinBot reply. Check core-api logs and that GEN_AI_SERVICE_URL points at your gen-ai service.',
    source: 'error',
  };
}

/**
 * Normalize FinBot API payloads so the UI always gets a string reply.
 * @returns {{ reply: string, source: string | null } | null}
 */
export function parseFinbotPayload(data) {
  if (data == null) return null;

  let body = data;
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed) return null;
    try {
      body = JSON.parse(trimmed);
    } catch {
      return { reply: trimmed, source: 'error' };
    }
  }

  if (typeof body !== 'object') return null;

  if (typeof body.reply === 'string' && body.reply.trim()) {
    return { reply: body.reply.trim(), source: body.source || null };
  }

  if (typeof body.error === 'string' && body.error.trim()) {
    return { reply: body.error.trim(), source: body.source || 'error' };
  }

  if (Array.isArray(body.detail)) {
    const text = body.detail
      .map((item) => (typeof item === 'string' ? item : item?.msg))
      .filter(Boolean)
      .join('; ');
    if (text) return { reply: text, source: 'error' };
  }

  if (typeof body.detail === 'string' && body.detail.trim()) {
    return { reply: body.detail.trim(), source: 'error' };
  }

  return null;
}

export function finbotConnectError(err) {
  if (err == null) return unexpectedFinbotResponse();

  const fromBody = parseFinbotPayload(err?.response?.data);
  if (fromBody) return fromBody;

  if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
    return {
      reply:
        'FinBot timed out. The AI service may be waking up (Render free tier) — try again in a few seconds.',
      source: 'error',
    };
  }

  if (!err?.response) {
    return { reply: DEFAULT_CONNECT_ERROR, source: 'error' };
  }

  return {
    reply: `FinBot request failed (HTTP ${err.response.status}). Try again or check API logs.`,
    source: 'error',
  };
}
