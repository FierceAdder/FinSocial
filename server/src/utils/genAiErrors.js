/** Whether the gen-ai HTTP call failed before a usable JSON body (network, timeout, gateway). */
function isGenAiUnreachable(err) {
  const status = err.response?.status;
  if (status && [502, 503, 504].includes(status)) return true;

  if (err.response) return false;

  const code = err.code || '';
  return [
    'ECONNREFUSED',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ETIMEDOUT',
    'ECONNABORTED',
    'ECONNRESET',
    'EAI_AGAIN',
    'ERR_NETWORK',
    'ENOTCONN',
    'EPIPE',
  ].includes(code);
}

function formatFastApiDetail(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.msg === 'string') return item.msg;
        return null;
      })
      .filter(Boolean)
      .join('; ');
  }
  return null;
}

/** Pull a user-facing reply from an axios error talking to gen-ai. */
function extractGenAiErrorReply(err, fallbackMessage) {
  const data = err.response?.data;
  if (typeof data === 'string' && data.trim()) {
    return data.trim().slice(0, 500);
  }
  if (data && typeof data === 'object') {
    if (typeof data.reply === 'string' && data.reply.trim()) return data.reply.trim();
    const fromDetail = formatFastApiDetail(data.detail);
    if (fromDetail) return fromDetail;
    if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  }
  return fallbackMessage;
}

module.exports = { isGenAiUnreachable, extractGenAiErrorReply, formatFastApiDetail };
